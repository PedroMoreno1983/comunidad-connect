import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Mock client para evitar errores cuando falten las variables de entorno
const createMockClient = () => {
  const mockResponse = { data: null, error: null };
  const mockPromise = Promise.resolve(mockResponse);
  const mockArrayPromise = Promise.resolve({ data: [], error: null });

  const chain = {
    eq: () => chain,
    order: () => chain,
    select: () => chain,
    single: () => mockPromise,
    maybeSingle: () => mockPromise,
    insert: () => chain,
    update: () => chain,
    delete: () => chain,
    then: (cb: any) => mockArrayPromise.then(cb),
  };

  return {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signInWithPassword: async () => ({ error: new Error('Demo mode') }),
      signUp: async () => ({ error: new Error('Demo mode') }),
      signOut: async () => ({ error: null }),
    },
    from: () => chain,
  };
};

export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createBrowserClient(supabaseUrl, supabaseAnonKey)
  : createMockClient() as any;
