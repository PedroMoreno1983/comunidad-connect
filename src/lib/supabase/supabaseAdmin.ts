import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cachedAdminClient: SupabaseClient | null = null;

export function getSupabaseAdmin() {
    if (cachedAdminClient) return cachedAdminClient;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) {
        throw new Error('Supabase admin client is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    }

    cachedAdminClient = createClient(url, serviceKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
    });

    return cachedAdminClient;
}

// Backward-compatible lazy proxy for existing API routes.
// Only use this from server-side code: service role bypasses RLS.
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
    get(_target, property, receiver) {
        return Reflect.get(getSupabaseAdmin(), property, receiver);
    },
});
