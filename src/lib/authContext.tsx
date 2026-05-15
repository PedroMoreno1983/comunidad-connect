"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from './types';
import type { User as SupabaseUser, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { isDemoEmail, isDemoModeEnabled } from '@/lib/runtimeMode';

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
    loginDemo: (role: User["role"]) => void;
    updateDemoUser: (updates: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const DEMO_STORAGE_KEY = 'cc-demo-user';

function buildDemoUser(role: User["role"]): User {
    const profiles: Record<User["role"], User> = {
        admin: {
            id: 'demo-admin',
            name: 'Admin Demo',
            email: 'admin@demo.com',
            role: 'admin',
            communityId: 'demo-community',
            features: {},
        },
        resident: {
            id: 'demo-resident',
            name: 'Residente Demo',
            email: 'residente@demo.com',
            role: 'resident',
            unitId: 'demo-unit-1204',
            unitName: 'Depto 1204',
            communityId: 'demo-community',
            features: {},
        },
        concierge: {
            id: 'demo-concierge',
            name: 'Conserje Demo',
            email: 'conserje@demo.com',
            role: 'concierge',
            communityId: 'demo-community',
            features: {},
        },
    };
    return profiles[role];
}

export function AuthProvider({ children }: { children: ReactNode }) {
    // Demo state
    const [user, setUser] = useState<User | null>(null);

    // Supabase state
    const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    const getStoredDemoUser = (): User | null => {
        if (typeof window === 'undefined') return null;
        if (!isDemoModeEnabled()) {
            localStorage.removeItem(DEMO_STORAGE_KEY);
            return null;
        }
        try {
            const raw = localStorage.getItem(DEMO_STORAGE_KEY);
            return raw ? JSON.parse(raw) as User : null;
        } catch {
            return null;
        }
    };

    // Initialize Supabase auth listener
    useEffect(() => {
        const storedDemoUser = getStoredDemoUser();
        if (storedDemoUser) {
            setUser(storedDemoUser);
            setLoading(false);
        }

        // Check if Supabase is configured
        const isSupabaseConfigured = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        
        if (!isSupabaseConfigured) {
            setLoading(false);
            return;
        }

        // Check active session safely
        const checkSessionSafe = async () => {
            setLoading(true);
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
                    const demoUser = getStoredDemoUser();
                    if (demoUser) setUser(demoUser);
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
                    } catch {
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
                const demoUser = getStoredDemoUser();
                setUser(demoUser);
                setLoading(false);
            }
        });

        return () => subscription.unsubscribe();
        // Auth bootstrap is intentionally registered once; Supabase listener handles subsequent state changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
                console.warn("[auth] Profile unavailable, using auth metadata fallback:", error.message || error);
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
            console.warn("[auth] Profile fetch failed, using auth metadata fallback:", err);
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
                .select('*')
                .eq('owner_id', userId)
                .maybeSingle();

            if (unit && !error) {
                const unitNumber = unit.number || unit.unit_number || unit.department_number;
                setUser(prev => prev ? ({ ...prev, unitId: unit.id, unitName: unitNumber ? `Depto ${unitNumber}` : undefined }) : null);
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
            const origin = typeof window !== 'undefined' ? window.location.origin : 'https://convive.app';
            
            if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
                console.error("Supabase not configured. Signup will fail.");
                return { error: new Error("Sistema no configurado para registro real. Revisa Supabase.") };
            }

            const { error } = await supabase.auth.signUp({
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
        if (typeof window !== 'undefined') {
            localStorage.removeItem(DEMO_STORAGE_KEY);
        }
        setUser(null);
        setSupabaseUser(null);
        setSession(null);
        await supabase.auth.signOut();
    };

    const loginDemo = (role: User["role"]) => {
        if (!isDemoModeEnabled()) {
            throw new Error('El acceso demo no esta habilitado en este entorno.');
        }
        const demoUser = buildDemoUser(role);
        if (typeof window !== 'undefined') {
            localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(demoUser));
        }
        setUser(demoUser);
        setSupabaseUser(null);
        setSession(null);
        setLoading(false);
    };

    const updateDemoUser = (updates: Partial<User>) => {
        setUser(current => {
            if (!isDemoModeEnabled() || !current || !isDemoEmail(current.email)) return current;
            const next = { ...current, ...updates };
            if (typeof window !== 'undefined') {
                localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(next));
            }
            return next;
        });
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
            loginDemo,
            updateDemoUser,
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
