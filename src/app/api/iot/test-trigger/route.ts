import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Server-side proxy so the IoT webhook secret never touches the browser.
// Only authenticated admins can call this endpoint.
export async function POST(req: NextRequest) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (profile?.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const secret = process.env.IOT_WEBHOOK_SECRET;
    if (!secret) {
        return NextResponse.json({ error: 'IOT_WEBHOOK_SECRET not configured' }, { status: 500 });
    }

    const payload = await req.json();
    const origin = req.nextUrl.origin;

    const iotRes = await fetch(`${origin}/api/webhooks/iot`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${secret}`,
        },
        body: JSON.stringify(payload),
    });

    const data = await iotRes.json();
    return NextResponse.json(data, { status: iotRes.status });
}
