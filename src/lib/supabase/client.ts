import { createBrowserClient } from '@supabase/ssr'

// Mock client for demo mode when env vars are not set
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

export function createClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
        console.log('Supabase not configured - running in demo mode')
        return createMockClient() as any
    }

    return createBrowserClient(supabaseUrl, supabaseAnonKey)
}
