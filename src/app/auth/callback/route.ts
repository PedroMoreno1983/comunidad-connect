import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Solo rutas internas como destino: nada de redirigir a otro sitio. */
function safeNext(value: string | null) {
    return value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\') ? value : '/home';
}

/**
 * Vuelta de Google (OAuth con PKCE): canjea el código por la sesión y sigue.
 * El inicio muestra las funciones disponibles para el perfil.
 */
export async function GET(request: NextRequest) {
    const code = request.nextUrl.searchParams.get('code');
    const next = safeNext(request.nextUrl.searchParams.get('next'));
    if (!code) {
        return NextResponse.redirect(new URL('/login?oauth=error', request.url));
    }
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
        return NextResponse.redirect(new URL('/login?oauth=error', request.url));
    }
    return NextResponse.redirect(new URL(next, request.url));
}
