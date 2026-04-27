"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from './types';
import type { User as SupabaseUser, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

// ============================================
// Unified Auth Context
// Supports both demo mode (login by role) and Supabase auth
// ============================================

interface AuthContextType {
    // Common
    user: User | null;
    loading: boolean;
    logout: () => Promise<void>;

    // Supabase mode
    supabaseUser: SupabaseUser | null;
    session: Session | null;
    signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
    signUp: (email: string, password: string, userData: Record<string, unknown>) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    // Demo state
    const [user, setUser] = useState<User | null>(null);

    // Supabase state
    const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    // Initialize Supabase auth listener
    useEffect(() => {
        // Check if Supabase is configured
        const isSupabaseConfigured = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        
        if (!isSupabaseConfigured) {
            setLoading(false);
            return;
        }

        // Check active session safely
        const checkSessionSafe = async () => {
            setLoading(true);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                setLoading(false);
            }, 8000);

            try {
                // Add a safety timeout for the session check to prevent hanging the app on slow networks
                const sessionPromise = supabase.auth.getSession();
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Auth timeout")), 5000));
                
                const { data: { session }, error } = await Promise.race([sessionPromise, timeoutPromise]) as { data: { session: Session | null }, error: Error | null };
                if (error) throw error;

                setSession(session);
                setSupabaseUser(session?.user ?? null);
                if (session?.user) {
                    await fetchUserProfile(session.user); // Await profile fetch
                } else {
                    setLoading(false);
                }
            } catch (err) {
                console.error("Auth session check failed:", err);

                // Self-healing: aggressively clear corrupted auth tokens from localStorage
                if (typeof window !== 'undefined') {
                    try {
                        for (const key of Object.keys(localStorage)) {
                            if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
                                localStorage.removeItem(key);
                            }
                        }
                    } catch (e) {
                        // ignore clear errors
                    }
                }

                setSession(null);
                setSupabaseUser(null);
                setLoading(false);
            } finally {
                clearTimeout(timeoutId);
                setLoading(false);
            }
        };
        checkSessionSafe();

        // Listen for changes
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event: unknown, session: Session | null) => {
            setSession(session);
            setSupabaseUser(session?.user ?? null);

            if (session?.user) {
                fetchUserProfile(session.user);
            } else {
                // Clear user if logged out
                setUser(null);
                setLoading(false);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    // Fetch real profile from public.profiles table (Source of Truth)
    const fetchUserProfile = async (sbUser: SupabaseUser) => {
        try {
            const { data: profile, error } = await supabase
                .from('profiles')
                .select('*, communities(id, pricing_tiers(features))')
                .eq('id', sbUser.id)
                .single();

            if (error) {
                console.error("Error fetching profile:", error);
                // Fallback to metadata if profile fails
                mapSupabaseUserFromMetadata(sbUser);
            } else if (profile) {
                // Extract a readable display name from email as last resort
                const emailFirstPart = sbUser.email?.split('@')[0]?.split('.')?.[0];
                const displayName = profile.name
                    || (emailFirstPart ? emailFirstPart.charAt(0).toUpperCase() + emailFirstPart.slice(1) : null)
                    || 'Usuario';

                const features = profile.communities?.pricing_tiers?.features || {};

                // Map from DB profile
                setUser({
                    id: sbUser.id,
                    name: displayName,
                    email: sbUser.email || '',
                    role: profile.role || 'resident',
                    unitId: undefined,
                    photo: profile.avatar_url,
                    communityId: profile.community_id,
                    features,
                });

                // Fetch unit if exists
                fetchUnitForUser(sbUser.id);
            }
        } catch (err) {
            console.error(err);
            mapSupabaseUserFromMetadata(sbUser);
        } finally {
            setLoading(false);
        }
    };

    // Helper to fetch unit
    const fetchUnitForUser = async (userId: string) => {
        try {
            const { data: unit, error } = await supabase
                .from('units')
                .select('id, number, tower')
                .eq('owner_id', userId)
                .maybeSingle();

            if (unit && !error) {
                setUser(prev => prev ? ({ ...prev, unitId: unit.id, unitName: unit.number ? `Depto ${unit.number}` : undefined }) : null);
            }
        } catch (err) {
            console.error("Could not fetch unit for user:", err);
        }
    };

    // Fallback Helper
    const mapSupabaseUserFromMetadata = (sbUser: SupabaseUser) => {
        setUser({
            id: sbUser.id,
            name: sbUser.user_metadata?.name || sbUser.email || 'Usuario',
            email: sbUser.email || '',
            role: sbUser.user_metadata?.role || 'resident',
            unitId: sbUser.user_metadata?.unit_id,
            unitName: sbUser.user_metadata?.unit_number ? `Depto ${sbUser.user_metadata.unit_number}` : undefined,
        });
    };
    // Supabase sign in
    const signIn = async (email: string, password: string) => {
        try {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            return { error };
        } catch (error) {
            return { error: error as Error };
        }
    };

    // Supabase sign up
    const signUp = async (email: string, password: string, userData: Record<string, any>) => {
        try {
            // Determine current origin for email redirection
            const origin = typeof window !== 'undefined' ? window.location.origin : 'https://comunidadconnect.vercel.app';
            
            if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
                console.error("Supabase not configured. Signup will fail.");
                return { error: new Error("Sistema configurado en modo DEMO. El registro real no está disponible.") };
            }

            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: userData,
                    emailRedirectTo: `${origin}/login`,
                },
            });
            if (error) return { error };
            return { error: null };
        } catch (error: unknown) {
            return { error: error as Error };
        }
    };

    // Logout (handles both modes)
    const logout = async () => {
        setUser(null);
        setSupabaseUser(null);
        setSession(null);
        await supabase.auth.signOut();
    };

    return (
        <AuthContext.Provider value={{
            user,
            loading,
            logout,
            supabaseUser,
            session,
            signIn,
            signUp,
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
