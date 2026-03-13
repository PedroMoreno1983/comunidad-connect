import { createBrowserClient } from '@supabase/ssr'

// Mock client for demo mode when env vars are not set
const createMockClient = () => ({
    auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => { } } } }),
        signInWithPassword: async () => ({ error: new Error('Demo mode') }),
        signUp: async () => ({ error: new Error('Demo mode') }),
        signOut: async () => ({ error: null }),
    },
    from: () => ({
        select: () => ({
            eq: () => ({
                order: () => ({
                    maybeSingle: () => Promise.resolve({ data: null, error: null }),
                    single: () => Promise.resolve({ data: null, error: null }),
                    then: (cb: any) => Promise.resolve({ data: [], error: null }).then(cb)
                }),
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
                then: (cb: any) => Promise.resolve({ data: [], error: null }).then(cb)
            }),
            order: () => ({
                then: (cb: any) => Promise.resolve({ data: [], error: null }).then(cb)
            }),
            then: (cb: any) => Promise.resolve({ data: [], error: null }).then(cb)
        }),
        insert: () => ({
            select: () => ({
                single: () => Promise.resolve({ data: null, error: null })
            })
        }),
        update: () => ({
            eq: () => ({
                select: () => ({
                    single: () => Promise.resolve({ data: null, error: null })
                })
            })
        }),
        delete: () => ({
            eq: () => Promise.resolve({ error: null })
        })
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
