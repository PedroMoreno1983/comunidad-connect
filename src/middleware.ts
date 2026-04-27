import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const SUPERADMIN_EMAILS = (process.env.SUPERADMIN_EMAILS ?? '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);

export async function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl;

    if (!pathname.startsWith('/superadmin')) {
        return NextResponse.next();
    }

    const res = NextResponse.next();

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll: () => req.cookies.getAll(),
                setAll: (cookiesToSet) => {
                    cookiesToSet.forEach(({ name, value, options }) => {
                        res.cookies.set(name, value, options);
                    });
                },
            },
        }
    );

    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !SUPERADMIN_EMAILS.includes(user.email?.toLowerCase() ?? '')) {
        return NextResponse.redirect(new URL('/home', req.url));
    }

    return res;
}

export const config = {
    matcher: ['/superadmin', '/superadmin/:path*'],
};
