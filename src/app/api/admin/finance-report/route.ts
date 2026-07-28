import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { apiErrorResponse } from '@/lib/observability/logger';
import { BillingError } from '@/lib/finance/billingService';
import { getMonthlyReport, getReserveFund, addReserveFundMovement } from '@/lib/finance/reportingService';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

export const runtime = 'nodejs';

function cleanText(value: unknown, max: number) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

async function requireAdmin() {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
    if (profile.role !== 'admin') {
        return { error: NextResponse.json({ error: 'Solo la administración puede ver la rendición de cuentas.' }, { status: 403 }) };
    }
    if (!profile.community_id) {
        return { error: NextResponse.json({ error: 'Tu cuenta no está asociada a una comunidad.' }, { status: 400 }) };
    }
    return { profile, communityId: profile.community_id };
}

/** Rendición del mes + estado del fondo de reserva + configuración financiera. */
export async function GET(req: NextRequest) {
    try {
        const auth = await requireAdmin();
        if (auth.error) return auth.error;

        const month = cleanText(req.nextUrl.searchParams.get('month'), 7)
            || new Date().toISOString().slice(0, 7);

        const [report, fund, settings] = await Promise.all([
            getMonthlyReport(auth.communityId, month),
            getReserveFund(auth.communityId),
            getSupabaseAdmin()
                .from('communities')
                .select('late_interest_monthly_rate, reserve_fund_rate')
                .eq('id', auth.communityId)
                .maybeSingle(),
        ]);

        return NextResponse.json({
            report,
            fund,
            settings: {
                lateInterestMonthlyRate: Number(settings.data?.late_interest_monthly_rate || 0),
                reserveFundRate: Number(settings.data?.reserve_fund_rate || 0),
            },
        });
    } catch (error) {
        if (error instanceof BillingError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        return apiErrorResponse(req, '/api/admin/finance-report', error, {
            publicMessage: 'No se pudo cargar la rendición de cuentas.',
        });
    }
}

/** Movimiento manual del fondo, o actualización de las tasas de la comunidad. */
export async function POST(req: NextRequest) {
    try {
        const auth = await requireAdmin();
        if (auth.error) return auth.error;

        const body = await req.json().catch(() => ({})) as Record<string, unknown>;

        if (cleanText(body.action, 30) === 'update_settings') {
            const lateRate = Number(body.lateInterestMonthlyRate);
            const reserveRate = Number(body.reserveFundRate);
            // Techos deliberados: una tasa de tres dígitos es siempre un error de
            // digitación, y aplicarla significaría cobrarle de más a un residente.
            if (!Number.isFinite(lateRate) || lateRate < 0 || lateRate > 10) {
                return NextResponse.json({ error: 'El interés por mora debe estar entre 0% y 10% mensual.' }, { status: 400 });
            }
            if (!Number.isFinite(reserveRate) || reserveRate < 0 || reserveRate > 50) {
                return NextResponse.json({ error: 'El aporte al fondo debe estar entre 0% y 50%.' }, { status: 400 });
            }

            const { error } = await getSupabaseAdmin()
                .from('communities')
                .update({
                    late_interest_monthly_rate: lateRate,
                    reserve_fund_rate: reserveRate,
                })
                .eq('id', auth.communityId);
            if (error) throw error;

            return NextResponse.json({ ok: true, lateInterestMonthlyRate: lateRate, reserveFundRate: reserveRate });
        }

        const movement = await addReserveFundMovement(auth.communityId, auth.profile.id, {
            kind: cleanText(body.kind, 20) === 'withdrawal' ? 'withdrawal' : 'contribution',
            amount: Number(body.amount),
            month: cleanText(body.month, 7),
            label: cleanText(body.label, 160),
            notes: cleanText(body.notes, 500) || null,
        });
        return NextResponse.json({ movement }, { status: 201 });
    } catch (error) {
        if (error instanceof BillingError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        return apiErrorResponse(req, '/api/admin/finance-report', error, {
            publicMessage: 'No se pudo registrar el movimiento.',
        });
    }
}
