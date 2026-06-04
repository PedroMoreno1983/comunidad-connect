import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { enforceRateLimit } from '@/lib/security/rateLimit';

export async function POST(req: NextRequest) {
    const limited = enforceRateLimit(req, 'payments.mock_success', { limit: 30, windowMs: 60_000 });
    if (limited) return limited;

    try {
        const { reference } = await req.json();

        if (!reference) {
            return NextResponse.json({ error: 'Missing reference parameter' }, { status: 400 });
        }

        const [type, recordId] = reference.split('_');

        if (!recordId) {
            return NextResponse.json({ error: 'Invalid reference format' }, { status: 400 });
        }

        if (type === 'FEE') {
            const { error } = await supabaseAdmin
                .from('expenses')
                .update({
                    status: 'paid',
                    paid_at: new Date().toISOString(),
                    payment_metadata: {
                        processor: 'haulmer',
                        issued_tax_doc: true,
                        paid_via_mock: true,
                        simulated_at: new Date().toISOString()
                    }
                })
                .eq('id', recordId);

            if (error) throw error;
        } else if (type === 'MARKET') {
            const { error } = await supabaseAdmin
                .from('marketplace_items')
                .update({
                    status: 'sold',
                    payment_status: 'completed',
                })
                .eq('id', recordId);

            if (error) throw error;
        } else {
            return NextResponse.json({ error: 'Unsupported reference type' }, { status: 400 });
        }

        return NextResponse.json({ ok: true, status: 'processed' });

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Error unknown';
        console.error("[Payments Mock Success] Error:", error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
