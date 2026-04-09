import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
    // Log a warning in production build rather than crashing, 
    // since Next.js static generation evaluates this file but doesn't actually hit the API.
    if (process.env.NODE_ENV === 'production') {
        console.warn('⚠️ WARNING: SUPABASE_SERVICE_ROLE_KEY is not configured. Webhooks will fail at runtime.');
    }
}

// Cliente de Supabase con Service Role Key (bypasses RLS)
// SOLO usar en API Routes server-side. NUNCA en Client Components.
export const supabaseAdmin = createClient(
    url || 'https://placeholder.supabase.co',
    serviceKey || 'placeholder'
);

