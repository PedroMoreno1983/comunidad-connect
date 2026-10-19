import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { apiErrorResponse } from '@/lib/observability/logger';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { stableNotificationId } from '@/lib/agent-center/utils';
import { todayInChile } from '@/lib/finance/chileDates';
import { recordOperationEvent } from '@/lib/operations/audit';
import { AGREEMENT_REQUEST_FROM_HOME_SENT, agreementRequestFromHomeAdminCopy } from '@/lib/home/nextUpCopy';

export const runtime = 'nodejs';

/**
 * El residente pide conversar un convenio desde "Lo próximo a la vista".
 * Llega solo a la administración, en la app, sin montos ni lenguaje de deudor.
 * Es idempotente por unidad y día (id estable de la notificación): pedirlo dos
 * veces el mismo día no duplica el aviso. No crea el convenio: lo propone el
 * admin (ver AGENTS.md, "Convenios").
 */
export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'resident.agreement_request', { limit: 5, windowMs: 60_000 });
    if (limited) return limited;

    try {
        const profile = await getAuthenticatedAgentProfile();
        if (!profile) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        if (profile.role !== 'resident') {
            return NextResponse.json({ error: 'Esta solicitud es para residentes.' }, { status: 403 });
        }
        if (!profile.community_id || !profile.unit_id) {
            return NextResponse.json({ error: 'Tu perfil todavía no tiene una unidad asignada.' }, { status: 400 });
        }

        const admin = getSupabaseAdmin();
        const { data: unit, error: unitError } = await admin.from('units')
            .select('id, number, tower')
            .eq('id', profile.unit_id)
            .eq('community_id', profile.community_id)
            .maybeSingle();
        if (unitError) throw unitError;
        if (!unit) return NextResponse.json({ error: 'Tu unidad no pertenece a esta comunidad.' }, { status: 404 });

        const number = String(unit.number ?? '');
        const tower = String(unit.tower ?? '');
        const unitLabel = (tower && tower !== 'A' ? `${tower}-${number}` : number) || 'del residente';

        const { data: admins, error: adminError } = await admin.from('profiles')
            .select('id')
            .eq('community_id', profile.community_id)
            .eq('role', 'admin');
        if (adminError) throw adminError;

        const today = todayInChile();
        const copy = agreementRequestFromHomeAdminCopy(unitLabel);
        const rows = (admins ?? []).map(row => ({
            id: stableNotificationId('home', 'agreement-request', String(unit.id), today, String(row.id)),
            user_id: String(row.id),
            community_id: profile.community_id,
            type: 'info',
            category: 'finance_agreement',
            title: copy.title,
            body: copy.body,
            link: copy.link,
        }));
        if (rows.length > 0) {
            const { error: notifyError } = await admin.from('notifications')
                .upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
            if (notifyError) throw notifyError;
        }

        await recordOperationEvent({
            communityId: profile.community_id,
            actorId: profile.id,
            actorRole: profile.role,
            action: 'finance.agreement_conversation_requested',
            entityType: 'unit',
            entityId: String(unit.id),
            severity: 'info',
            status: 'success',
            summary: 'Solicitud de conversar un convenio desde el inicio',
            metadata: { channel: 'in_app', source: 'resident_home', notified: rows.length },
        });

        return NextResponse.json({ requested: true, message: AGREEMENT_REQUEST_FROM_HOME_SENT });
    } catch (error) {
        return apiErrorResponse(req, '/api/resident/agreement-request', error, {
            publicMessage: 'No pudimos enviar tu solicitud. Vuelve a intentarlo en un momento.',
        });
    }
}
