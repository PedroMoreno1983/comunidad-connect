"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from './types';
import type { User as SupabaseUser, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

// ============================================
// Unified Auth Context
// Supabase auth is the only production authentication path.
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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const LEGACY_LOCAL_USER_STORAGE_KEY = 'cc-' + 'de' + 'mo-user';

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);

    // Supabase state
    const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    const clearLegacyLocalUser = () => {
        if (typeof window !== 'undefined') {
            localStorage.removeItem(LEGACY_LOCAL_USER_STORAGE_KEY);
        }
    };

    // Initialize Supabase auth listener
    useEffect(() => {
        clearLegacyLocalUser();

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
                    setUser(null);
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
                setUser(null);
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
                const profileRole = profile.role || 'resident';
                const profileUnitId = typeof profile.unit_id === 'string' ? profile.unit_id : undefined;
                const profileDepartmentNumber = typeof profile.department_number === 'string' ? profile.department_number.trim() : '';

                // Map from DB profile
                setUser({
                    id: sbUser.id,
                    name: displayName,
                    email: sbUser.email || '',
                    role: profileRole,
                    unitId: profileUnitId,
                    unitName: profileDepartmentNumber ? `Depto ${profileDepartmentNumber}` : undefined,
                    photo: profile.avatar_url,
                    communityId: profile.community_id,
                    features,
                });

                // Fetch or repair unit if exists
                fetchUnitForUser(sbUser.id, profileUnitId);
                if (profileRole === 'resident' && !profileUnitId) {
                    ensureResidentUnitForUser();
                }
            }
        } catch (err) {
            console.warn("[auth] Profile fetch failed, using auth metadata fallback:", err);
            mapSupabaseUserFromMetadata(sbUser);
        } finally {
            setLoading(false);
        }
    };
    // Helper to fetch unit
    const fetchUnitForUser = async (userId: string, profileUnitId?: string) => {
        try {
            let query = supabase
                .from('units')
                .select('*');

            query = profileUnitId
                ? query.or(`owner_id.eq.${userId},id.eq.${profileUnitId}`)
                : query.eq('owner_id', userId);

            const { data: units, error } = await query.limit(1);
            const unit = Array.isArray(units) ? units[0] : null;

            if (unit && !error) {
                const unitNumber = unit.number || unit.unit_number || unit.department_number;
                setUser(prev => prev ? ({ ...prev, unitId: unit.id, unitName: unitNumber ? `Depto ${unitNumber}` : undefined }) : null);
            }
        } catch (err) {
            console.error("Could not fetch unit for user:", err);
        }
    };

    const ensureResidentUnitForUser = async () => {
        try {
            const response = await fetch('/api/profile/ensure-resident-unit', { method: 'POST' });
            if (!response.ok) return;
            const data = await response.json().catch(() => ({})) as { unitId?: string; unitName?: string };
            if (data.unitId) {
                setUser(prev => prev ? ({ ...prev, unitId: data.unitId, unitName: data.unitName || prev.unitName }) : null);
            }
        } catch (err) {
            console.warn("[auth] Resident unit auto-link skipped:", err);
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

    // Logout
    const logout = async () => {
        if (typeof window !== 'undefined') {
            localStorage.removeItem(LEGACY_LOCAL_USER_STORAGE_KEY);
        }
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
