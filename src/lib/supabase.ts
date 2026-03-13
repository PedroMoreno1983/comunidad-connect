import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

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
    select: () => ({ 
      eq: () => ({ 
        order: () => ({ 
          maybeSingle: () => ({ error: null, data: null }),
          then: () => Promise.resolve({ data: [], error: null })
        }),
        maybeSingle: () => ({ error: null, data: null })
      }),
      insert: () => ({ select: () => ({ single: () => ({ error: null, data: null }) }) }),
      update: () => ({ eq: () => ({ select: () => ({ single: () => ({ error: null, data: null }) }) }) })
    }),
  }),
});

// Export client - will use real Supabase if credentials are provided, otherwise mock
export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createBrowserClient(supabaseUrl, supabaseAnonKey)
  : createMockClient() as any;
