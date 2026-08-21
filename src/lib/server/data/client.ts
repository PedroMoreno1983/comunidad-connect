import type { SupabaseClient } from '@supabase/supabase-js';

/** Cliente inyectado: sesión del llamante o service role, según quien llama. */
export type DataClient = SupabaseClient;
