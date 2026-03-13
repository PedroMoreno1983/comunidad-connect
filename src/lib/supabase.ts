import { createBrowserClient } from '@supabase/ssr';

<<<<<<< HEAD
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Crear el cliente solo si las variables existen, o usar strings vacíos para evitar crash en build/demo
export const supabase = (supabaseUrl && supabaseAnonKey) 
    ? createBrowserClient(supabaseUrl, supabaseAnonKey)
    : null as any; 

=======
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Mock client that prevents errors when env vars are not set
const createMockClient = () => ({
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signInWithPassword: async () => ({ error: new Error('Demo mode - configure Supabase to enable') }),
    signUp: async () => ({ error: new Error('Demo mode - configure Supabase to enable') }),
    signOut: async () => ({ error: null }),
  },
  from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: () => ({ error: null, data: null }) }) }),
  }),
});

export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createBrowserClient(supabaseUrl, supabaseAnonKey)
  : createMockClient() as any;
>>>>>>> 1c6cc620bd9ba1a5c709d2c33389363815ed2e00
