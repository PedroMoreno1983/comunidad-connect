import { NextRequest, NextResponse } from 'next/server';
import { HaulmerService } from '@/lib/services/haulmer';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Allowed return URL origins to prevent open redirect
const ALLOWED_ORIGINS = [
    process.env.NEXT_PUBLIC_SITE_URL,
    'http://localhost:3000',
    'https://comunidadconnect.cl',
    'https://www.comunidadconnect.cl',
].filter(Boolean) as string[];

function isAllowedReturnUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return ALLOWED_ORIGINS.some(origin => {
            const o = new URL(origin);
            return parsed.origin === o.origin;
        });
    } catch {
        return false;
    }
}

function sanitize(value: unknown, maxLen: number): string {
    if (typeof value !== 'string') return '';
    return value.trim().slice(0, maxLen);
}

export async function POST(req: NextRequest) {
    try {
        const cookieStore = await cookies();
        const supabaseUser = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
        );
        const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const body = await req.json();

        // ─── Validate required fields ─────────────────────────────────────
        const amount = typeof body.amount === 'number' ? body.amount : Number(body.amount);
        const description = sanitize(body.description, 200);
        const reference = sanitize(body.reference, 100);
        const returnUrl = sanitize(body.returnUrl, 300);

        if (!amount || isNaN(amount) || amount <= 0 || amount > 100_000_000) {
            return NextResponse.json({ error: 'Monto inválido o fuera de rango.' }, { status: 400 });
        }
        if (!description) {
            return NextResponse.json({ error: 'Se requiere una descripción del pago.' }, { status: 400 });
        }
        if (!reference) {
            return NextResponse.json({ error: 'Se requiere una referencia de pago.' }, { status: 400 });
        }
        if (!body.client || typeof body.client.name !== 'string' || typeof body.client.email !== 'string') {
            return NextResponse.json({ error: 'Datos del cliente inválidos.' }, { status: 400 });
        }

        // ─── Sanitize client data ─────────────────────────────────────────
        const clientName = sanitize(body.client.name, 100);
        const clientEmail = sanitize(body.client.email, 150);

        // Strict email format check to prevent injection
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        if (!emailRegex.test(clientEmail)) {
            return NextResponse.json({ error: 'Email del cliente inválido.' }, { status: 400 });
        }

        // ─── Validate return URL (prevent open redirect) ──────────────────
        const safeReturnUrl = returnUrl && isAllowedReturnUrl(returnUrl)
            ? returnUrl
            : `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/home`;

        // ─── Create payment link ──────────────────────────────────────────
        const response = await HaulmerService.createPaymentLink({
            amount,
            description,
            reference,
            client: { name: clientName, email: clientEmail },
            returnUrl: safeReturnUrl,
        });

        return NextResponse.json({ url: response.url });

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Error generating Haulmer link';
        console.error("Haulmer Gateway Error:", error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
