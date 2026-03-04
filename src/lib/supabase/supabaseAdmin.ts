import { createClient } from '@supabase/supabase-js';

// Cliente de Supabase con Service Role Key
// SOLO usar en APIs backend (`app/api/...`), NUNCA en componentes de cliente (Client Components).
// Esto hace bypass de las RLS (Row Level Security)
export const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);
