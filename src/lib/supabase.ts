import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Crear el cliente solo si las variables existen, o usar strings vacíos para evitar crash en build/demo
export const supabase = (supabaseUrl && supabaseAnonKey) 
    ? createBrowserClient(supabaseUrl, supabaseAnonKey)
    : null as any; 

