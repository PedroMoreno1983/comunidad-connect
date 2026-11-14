import { supabase } from '../supabase';
import type { AuthProviderSettings, JoinCommunityInput, SignupResponse } from '../types';

/**
 * Entrar con Google y elegir edificio la primera vez (/bienvenida). Las
 * páginas usan este Service en vez de hablar directo con Supabase.
 */
export const AuthProvidersService = {
    /** Proveedores habilitados en Supabase Auth (endpoint público de settings). */
    async settings(): Promise<AuthProviderSettings> {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!url || !key) return { google: false };
        try {
            const response = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
            if (!response.ok) return { google: false };
            const data = await response.json() as { external?: Record<string, boolean> };
            return { google: data.external?.google === true };
        } catch {
            return { google: false };
        }
    },

    /** Va a Google y vuelve por /auth/callback al destino (solo rutas internas). */
    async signInWithGoogle(next: string | null): Promise<{ error: string | null }> {
        const destination = next && next.startsWith('/') && !next.startsWith('//') ? next : '/home';
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(destination)}` },
        });
        return { error: error ? error.message : null };
    },

    async currentEmail(): Promise<string> {
        const { data } = await supabase.auth.getUser();
        return data.user?.email || '';
    },

    /** Elegir edificio por código o por dirección (cuenta creada con Google). */
    async joinCommunity(input: JoinCommunityInput): Promise<{ ok: boolean; result: SignupResponse }> {
        const response = await fetch('/api/auth/join-community', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
        });
        const result = await response.json().catch(() => ({})) as SignupResponse;
        return { ok: response.ok, result };
    },
};
