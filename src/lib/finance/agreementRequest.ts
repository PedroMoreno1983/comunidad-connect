import type { SupabaseClient } from '@supabase/supabase-js';
import { stableNotificationId } from '@/lib/agent-center/utils';
import { todayInChile } from '@/lib/finance/chileDates';
import { recordOperationEvent } from '@/lib/operations/audit';
import { AGREEMENT_REQUEST_FROM_HOME_SENT, agreementRequestFromHomeAdminCopy } from '@/lib/home/nextUpCopy';

/**
 * El residente pide conversar un convenio de pago. Llega solo a la
 * administración, en la app, sin montos ni lenguaje de deudor. Es idempotente
 * por unidad y día (id estable de la notificación): pedirlo dos veces el mismo
 * día no duplica el aviso. No crea el convenio: lo propone el admin (ver
 * AGENTS.md, "Convenios").
 *
 * Lo usan el inicio (/api/resident/agreement-request) y CoCo
 * (request_payment_agreement).
 */

export type AgreementRequester = { id: string; role: string; communityId: string | null; unitId: string | null };
export type AgreementRequestResult =
    | { requested: true; message: string; notified: number }
    | { error: string; status: 400 | 403 | 404 };

export async function requestAgreementConversation(
    admin: SupabaseClient,
    requester: AgreementRequester,
    source: 'resident_home' | 'coco',
): Promise<AgreementRequestResult> {
    if (requester.role !== 'resident') return { error: 'Esta solicitud es para residentes.', status: 403 };
    if (!requester.communityId || !requester.unitId) return { error: 'Tu perfil todavía no tiene una unidad asignada.', status: 400 };

    const { data: unit, error: unitError } = await admin.from('units')
        .select('id, number, tower')
        .eq('id', requester.unitId)
        .eq('community_id', requester.communityId)
        .maybeSingle();
    if (unitError) throw unitError;
    if (!unit) return { error: 'Tu unidad no pertenece a esta comunidad.', status: 404 };

    const number = String(unit.number ?? '');
    const tower = String(unit.tower ?? '');
    const unitLabel = (tower && tower !== 'A' ? `${tower}-${number}` : number) || 'del residente';

    const { data: admins, error: adminError } = await admin.from('profiles')
        .select('id')
        .eq('community_id', requester.communityId)
        .eq('role', 'admin');
    if (adminError) throw adminError;

    const today = todayInChile();
    const copy = agreementRequestFromHomeAdminCopy(unitLabel);
    const rows = (admins ?? []).map(row => ({
        id: stableNotificationId('home', 'agreement-request', String(unit.id), today, String(row.id)),
        user_id: String(row.id),
        community_id: requester.communityId,
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
        communityId: requester.communityId,
        actorId: requester.id,
        actorRole: requester.role,
        action: 'finance.agreement_conversation_requested',
        entityType: 'unit',
        entityId: String(unit.id),
        severity: 'info',
        status: 'success',
        summary: source === 'coco' ? 'Solicitud de conversar un convenio por CoCo' : 'Solicitud de conversar un convenio desde el inicio',
        metadata: { channel: source === 'coco' ? 'coco' : 'in_app', source, notified: rows.length },
    });

    return { requested: true, message: AGREEMENT_REQUEST_FROM_HOME_SENT, notified: rows.length };
}
