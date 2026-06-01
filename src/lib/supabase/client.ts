import { createBrowserClient } from '@supabase/ssr'

// Safe no-op client used only when Supabase env vars are missing locally.
const createNoopClient = () => {
    const noopResponse = { data: null, error: null };
    const noopPromise = Promise.resolve(noopResponse);
    const noopArrayPromise = Promise.resolve({ data: [], error: null });

    const chain = {
        eq: () => chain,
        order: () => chain,
        select: () => chain,
        single: () => noopPromise,
        maybeSingle: () => noopPromise,
        insert: () => chain,
        update: () => chain,
        delete: () => chain,
        then: <TResult1 = { data: never[]; error: null }>(cb?: ((value: { data: never[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null | undefined) => noopArrayPromise.then(cb),
    };

    return {
        auth: {
            getSession: async () => ({ data: { session: null }, error: null }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => { } } } }),
            signInWithPassword: async () => ({ error: new Error('Supabase no configurado') }),
            signUp: async () => ({ error: new Error('Supabase no configurado') }),
            signOut: async () => ({ error: null }),
        },
        from: () => chain,
    };
};

export function createClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
        return createNoopClient() as unknown as ReturnType<typeof createBrowserClient>
    }

    return createBrowserClient(supabaseUrl, supabaseAnonKey)
}
