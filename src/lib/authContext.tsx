"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from './types';
import { MOCK_USERS } from './mockData';
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

    // Demo mode
    login: (role: string) => void;

    // Supabase mode
    supabaseUser: SupabaseUser | null;
    session: Session | null;
    signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
    signUp: (email: string, password: string, userData: { full_name: string }) => Promise<{ error: Error | null }>;
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
        // Check active session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setSupabaseUser(session?.user ?? null);
            if (session?.user) fetchUserProfile(session.user);
            else setLoading(false);
        });

        // Listen for changes
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            setSupabaseUser(session?.user ?? null);

            if (session?.user) {
                fetchUserProfile(session.user);
            } else if (!user || (!MOCK_USERS.some(u => u.id === user.id))) {
                // Clear user if logged out and not a demo user
                setUser(null);
                setLoading(false);
            } else {
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
                .select('*')
                .eq('id', sbUser.id)
                .single();

            if (error) {
                console.error("Error fetching profile:", error);
                // Fallback to metadata if profile fails
                mapSupabaseUserFromMetadata(sbUser);
            } else if (profile) {
                // Map from DB profile
                setUser({
                    id: sbUser.id,
                    name: profile.full_name || sbUser.email || 'Usuario',
                    email: sbUser.email || '',
                    role: profile.role || 'resident',
                    unitId: undefined, // Until we implement unit logic fully here or in wrapper
                    photo: profile.avatar_url
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
        const { data: unit } = await supabase
            .from('units')
            .select('id, number, tower')
            .eq('resident_profile_id', userId)
            .single();

        if (unit) {
            setUser(prev => prev ? ({ ...prev, unitId: unit.id }) : null);
        }
    };

    // Fallback Helper
    const mapSupabaseUserFromMetadata = (sbUser: SupabaseUser) => {
        setUser({
            id: sbUser.id,
            name: sbUser.user_metadata?.full_name || sbUser.email || 'Usuario',
            email: sbUser.email || '',
            role: sbUser.user_metadata?.role || 'resident',
            unitId: sbUser.user_metadata?.unit_id,
        });
    };

    // Demo login: find mock user by role
    const login = (roleIdOrEmail: string) => {
        const foundUser = MOCK_USERS.find(u => u.role === roleIdOrEmail || u.email === roleIdOrEmail)
            || MOCK_USERS.find(u => u.role === 'resident');
        if (foundUser) {
            setUser(foundUser);
        }
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
    const signUp = async (email: string, password: string, userData: { full_name: string }) => {
        try {
            const { error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: { full_name: userData.full_name },
                    emailRedirectTo: `${window.location.origin}/`,
                },
            });
            return { error };
        } catch (error) {
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
            login,
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
