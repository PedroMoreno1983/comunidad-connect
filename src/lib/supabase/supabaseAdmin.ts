import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
    // Fail loudly in production — do NOT silently fall back to anon key
    if (process.env.NODE_ENV === 'production') {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured. Set it in Vercel environment variables.');
    }
}

// Cliente de Supabase con Service Role Key (bypasses RLS)
// SOLO usar en API Routes server-side. NUNCA en Client Components.
export const supabaseAdmin = createClient(
    url || '',
    serviceKey || ''
);

