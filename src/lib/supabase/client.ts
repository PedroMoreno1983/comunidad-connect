import { createBrowserClient } from '@supabase/ssr'

// Mock client for demo mode
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
        then: <TResult1 = { data: never[]; error: null }>(cb?: ((value: { data: never[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null | undefined) => mockArrayPromise.then(cb),
    };

    return {
        auth: {
            getSession: async () => ({ data: { session: null }, error: null }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => { } } } }),
            signInWithPassword: async () => ({ error: new Error('Demo mode') }),
            signUp: async () => ({ error: new Error('Demo mode') }),
            signOut: async () => ({ error: null }),
        },
        from: () => chain,
    };
};

export function createClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
        return createMockClient() as unknown as ReturnType<typeof createBrowserClient>
    }

    return createBrowserClient(supabaseUrl, supabaseAnonKey)
}
