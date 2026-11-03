import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
    const response = NextResponse.redirect(new URL('/reset-password?error=invalid', request.url));
    const tokenHash = request.nextUrl.searchParams.get('token_hash');
    if (!tokenHash) return response;

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll: () => request.cookies.getAll(),
                setAll: (cookiesToSet) => {
                    cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
                },
            },
        },
    );
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
    if (error || !data.user) return response;
    response.headers.set('Location', new URL('/reset-password', request.url).toString());
    return response;
}
