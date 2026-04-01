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
    then: <TResult1 = { data: never[]; error: null }>(cb?: ((value: { data: never[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null | undefined) => mockArrayPromise.then(cb),
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

// ==========================================
// DEMO SHIELD: Intercepta todas las acciones de modificación a Supabase
// ==========================================
const demoFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const method = init?.method?.toUpperCase() || 'GET';
    const originalFetch = globalThis.fetch;

    const isMutatingMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input?.url || '';
    
    // Solo bloqueamos rutas de DB Rest, Funciones RPC y Almacenamiento
    const isSupabaseDbRequest = urlStr.includes('/rest/v1') || urlStr.includes('/rpc/') || urlStr.includes('/storage/v1');

    if (isMutatingMethod && isSupabaseDbRequest && typeof window !== 'undefined') {
        try {
            // Buscamos la sesión guardada del browser sin invocar funciones async
            const keys = Object.keys(localStorage);
            const authKey = keys.find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
            
            if (authKey) {
                const authDataStr = localStorage.getItem(authKey);
                if (authDataStr) {
                    const authData = JSON.parse(authDataStr);
                    const email = authData?.user?.email?.toLowerCase();
                    
                    if (email && email.endsWith('@demo.com')) {
                        console.warn(`[Demo Shield] Acción destructiva bloqueada (${method}).`);
                        // Simulamos una respuesta de Error estándar para que la App no 'Crashee' y muestre la alerta
                        return new Response(
                            JSON.stringify({ 
                                code: '403', 
                                message: 'Modo Demo Compartido: Se ha bloqueado el comando de ' + method + ' para preservar los datos de la demostración.',
                                details: 'Acción rechazada por Escudo Frontend'
                            }),
                            { 
                                status: 403, 
                                statusText: 'Forbidden (Demo Shield)', 
                                headers: { 'Content-Type': 'application/json' } 
                            }
                        );
                    }
                }
            }
        } catch (e) {
            console.error("[Demo Shield] Error interno: ", e);
        }
    }

    return originalFetch(input, init);
};

export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createBrowserClient(supabaseUrl, supabaseAnonKey, {
      global: {
          fetch: typeof window !== 'undefined' ? demoFetch : undefined
      }
  })
  : createMockClient() as unknown as ReturnType<typeof createBrowserClient>;
