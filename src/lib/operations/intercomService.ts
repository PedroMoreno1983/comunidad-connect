import { createHmac, randomBytes } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { sendWhatsAppNotificationForUser } from '@/lib/server/whatsappNotify';
import type { IntercomCall, IntercomVisitKind } from '@/lib/types';

/** Tiempo que la llamada "suena" antes de expirar; después conserjería llama por teléfono. */
export const INTERCOM_RING_SECONDS = 120;
const VISIT_KINDS: IntercomVisitKind[] = ['visit', 'delivery', 'service', 'other'];
const KIND_LABEL: Record<IntercomVisitKind, string> = {
    visit: 'una visita', delivery: 'un delivery', service: 'un servicio técnico', other: 'alguien',
};
const CALL_COLUMNS = 'id, unit_id, visitor_name, visit_kind, note, status, created_at, answered_at, expires_at, gate_status, visitor_log_id, units(number)';

export class IntercomError extends Error {
    constructor(message: string, public status = 400) {
        super(message);
    }
}

type CallRow = {
    id: string; unit_id: string; visitor_name: string; visit_kind: IntercomVisitKind; note: string | null;
    status: IntercomCall['status']; created_at: string; answered_at: string | null; expires_at: string;
    gate_status: IntercomCall['gateStatus']; visitor_log_id: string | null;
    units: { number: string | null } | { number: string | null }[] | null;
};

function toCall(row: CallRow): IntercomCall {
    const unit = Array.isArray(row.units) ? row.units[0] : row.units;
    // Una llamada vencida que nadie contestó se informa como expirada aunque la
    // fila siga en 'ringing': expirar no necesita un proceso aparte.
    const expired = row.status === 'ringing' && new Date(row.expires_at).getTime() <= Date.now();
    return {
        id: row.id,
        unitId: row.unit_id,
        unitNumber: unit?.number ?? null,
        visitorName: row.visitor_name,
        visitKind: row.visit_kind,
        note: row.note,
        status: expired ? 'expired' : row.status,
        createdAt: row.created_at,
        answeredAt: row.answered_at,
        expiresAt: row.expires_at,
        gateStatus: row.gate_status,
        admitted: Boolean(row.visitor_log_id),
    };
}

/** Quienes contestan: el dueño de la unidad y los residentes asignados a ella. */
async function unitAnswerers(communityId: string, unitId: string) {
    const admin = getSupabaseAdmin();
    const [{ data: unit }, { data: residents }] = await Promise.all([
        admin.from('units').select('owner_id, number').eq('id', unitId).eq('community_id', communityId).maybeSingle(),
        admin.from('profiles').select('id, name, phone_number').eq('unit_id', unitId).eq('community_id', communityId),
    ]);
    const ids = new Set<string>((residents || []).map(row => String(row.id)));
    if (unit?.owner_id) ids.add(String(unit.owner_id));
    const phones = (residents || [])
        .filter(row => typeof row.phone_number === 'string' && row.phone_number.trim())
        .map(row => ({ name: String(row.name || 'Residente'), phone: String(row.phone_number) }));
    return { unitNumber: unit?.number as string | undefined, userIds: [...ids], phones, exists: Boolean(unit) };
}

export async function createIntercomCall(
    communityId: string,
    requestedBy: string,
    input: { unitId: string; visitorName: string; visitKind: string; note?: string },
) {
    const visitorName = input.visitorName.trim().slice(0, 120);
    if (visitorName.length < 2) throw new IntercomError('Indica el nombre de quien llega.');
    const visitKind = VISIT_KINDS.includes(input.visitKind as IntercomVisitKind) ? input.visitKind as IntercomVisitKind : 'visit';
    const answerers = await unitAnswerers(communityId, input.unitId);
    if (!answerers.exists) throw new IntercomError('Esa unidad no existe en la comunidad.', 404);

    const admin = getSupabaseAdmin();
    const { data, error } = await admin.from('intercom_calls').insert({
        community_id: communityId,
        unit_id: input.unitId,
        visitor_name: visitorName,
        visit_kind: visitKind,
        note: input.note?.trim().slice(0, 200) || null,
        requested_by: requestedBy,
        expires_at: new Date(Date.now() + INTERCOM_RING_SECONDS * 1000).toISOString(),
    }).select(CALL_COLUMNS).single();
    if (error) throw error;

    const title = `Conserjería: llegó ${KIND_LABEL[visitKind]}`;
    const body = `${visitorName} está en portería para la unidad ${answerers.unitNumber ?? ''}. Abre la app para dejarlo pasar o no.`;
    if (answerers.userIds.length) {
        // La notificación en tiempo real es la que hace "sonar" el citófono en la app.
        await admin.from('notifications').insert(answerers.userIds.map(userId => ({
            user_id: userId,
            type: 'alert',
            category: 'intercom_call',
            title,
            body,
            link: `/resident?intercom=${data.id}`,
            community_id: communityId,
        })));
        // WhatsApp es un respaldo: si no está configurado, la llamada sigue en la app.
        void Promise.allSettled(answerers.userIds.map(userId => sendWhatsAppNotificationForUser({
            userId, title, body, type: 'alert', communityId, actorId: requestedBy,
        })));
    }
    return {
        call: toCall(data as unknown as CallRow),
        reachableInApp: answerers.userIds.length,
        phones: answerers.phones,
    };
}

export async function listIntercomCalls(
    communityId: string,
    viewer: { role: string; unitId: string | null; id: string },
) {
    const admin = getSupabaseAdmin();
    let query = admin.from('intercom_calls').select(CALL_COLUMNS).eq('community_id', communityId);
    if (viewer.role === 'resident') {
        const unitIds = await residentUnitIds(communityId, viewer);
        if (!unitIds.length) return [];
        query = query.in('unit_id', unitIds).eq('status', 'ringing').gt('expires_at', new Date().toISOString());
    } else {
        query = query.gte('created_at', new Date(Date.now() - 12 * 3600 * 1000).toISOString());
    }
    const { data, error } = await query.order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    return (data as unknown as CallRow[]).map(toCall);
}

async function residentUnitIds(communityId: string, viewer: { unitId: string | null; id: string }) {
    const { data: owned } = await getSupabaseAdmin()
        .from('units').select('id').eq('community_id', communityId).eq('owner_id', viewer.id);
    return [...new Set([viewer.unitId, ...(owned || []).map(row => String(row.id))].filter((id): id is string => Boolean(id)))];
}

export async function getIntercomCall(communityId: string, callId: string) {
    const { data, error } = await getSupabaseAdmin()
        .from('intercom_calls').select(CALL_COLUMNS).eq('id', callId).eq('community_id', communityId).maybeSingle();
    if (error) throw error;
    if (!data) throw new IntercomError('No existe esa llamada.', 404);
    return toCall(data as unknown as CallRow);
}

/** El residente contesta. Solo la primera respuesta cuenta, y solo mientras suena. */
export async function answerIntercomCall(
    communityId: string,
    viewer: { id: string; unitId: string | null },
    callId: string,
    decision: 'approved' | 'rejected',
) {
    const call = await getIntercomCall(communityId, callId);
    const unitIds = await residentUnitIds(communityId, viewer);
    if (!unitIds.includes(call.unitId)) throw new IntercomError('Esa llamada no es para tu unidad.', 403);

    const { data, error } = await getSupabaseAdmin()
        .from('intercom_calls')
        .update({ status: decision, answered_by: viewer.id, answered_at: new Date().toISOString() })
        .eq('id', callId)
        .eq('status', 'ringing')
        .gt('expires_at', new Date().toISOString())
        .select(CALL_COLUMNS)
        .maybeSingle();
    if (error) throw error;
    if (!data) {
        const current = await getIntercomCall(communityId, callId);
        throw new IntercomError(
            current.status === 'expired' ? 'La llamada ya expiró.' : 'Otra persona de tu unidad ya contestó.',
            409,
        );
    }
    return toCall(data as unknown as CallRow);
}

export async function cancelIntercomCall(communityId: string, callId: string) {
    const { data, error } = await getSupabaseAdmin()
        .from('intercom_calls')
        .update({ status: 'cancelled' })
        .eq('id', callId).eq('community_id', communityId).eq('status', 'ringing')
        .select(CALL_COLUMNS).maybeSingle();
    if (error) throw error;
    return data ? toCall(data as unknown as CallRow) : getIntercomCall(communityId, callId);
}

/**
 * Conserjería deja pasar a una visita aprobada: queda en la bitácora y, si la
 * comunidad configuró un portón, se le avisa para que abra.
 */
export async function admitIntercomVisitor(communityId: string, conciergeId: string, callId: string) {
    const admin = getSupabaseAdmin();
    const call = await getIntercomCall(communityId, callId);
    if (call.status !== 'approved') throw new IntercomError('Solo se deja pasar una visita aprobada por la unidad.', 409);
    if (call.admitted) return call;

    const { data: log, error: logError } = await admin.from('visitor_logs').insert({
        community_id: communityId,
        unit_id: call.unitId,
        visitor_name: call.visitorName,
        purpose: `Citófono digital (${call.visitKind})`,
        registered_by: conciergeId,
        is_qr: false,
    }).select('id').single();
    if (logError) throw logError;

    const gateStatus = await openGate(communityId, {
        event: 'access.granted',
        source: 'intercom',
        callId: call.id,
        unit: call.unitNumber,
        visitor: call.visitorName,
    });
    const { data, error } = await admin.from('intercom_calls')
        .update({ status: 'admitted', visitor_log_id: log.id, gate_status: gateStatus })
        .eq('id', callId).eq('status', 'approved')
        .select(CALL_COLUMNS).maybeSingle();
    if (error) throw error;
    return data ? toCall(data as unknown as CallRow) : getIntercomCall(communityId, callId);
}

/** Firma del aviso al portón: HMAC-SHA256 de "<timestamp>.<cuerpo>". */
export function signAccessEvent(secret: string, timestamp: string, body: string) {
    return `sha256=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
}

export async function openGate(communityId: string, event: Record<string, unknown>) {
    const { data: community } = await getSupabaseAdmin()
        .from('communities').select('access_webhook_url, access_webhook_secret').eq('id', communityId).maybeSingle();
    if (!community?.access_webhook_url || !community.access_webhook_secret) return 'not_configured' as const;
    const body = JSON.stringify({ ...event, communityId, at: new Date().toISOString() });
    const timestamp = String(Math.floor(Date.now() / 1000));
    try {
        const response = await fetch(community.access_webhook_url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CoCo-Timestamp': timestamp,
                'X-CoCo-Signature': signAccessEvent(community.access_webhook_secret, timestamp, body),
            },
            body,
            signal: AbortSignal.timeout(5000),
        });
        return response.ok ? 'opened' as const : 'failed' as const;
    } catch {
        return 'failed' as const;
    }
}

/** Configura el portón. El secreto se genera aquí y se muestra una sola vez. */
export async function configureAccessGate(communityId: string, url: string | null) {
    if (url && !/^https:\/\/[^\s]+$/.test(url)) throw new IntercomError('La dirección del portón debe empezar con https://');
    const secret = url ? randomBytes(24).toString('base64url') : null;
    const { error } = await getSupabaseAdmin().from('communities')
        .update({ access_webhook_url: url, access_webhook_secret: secret })
        .eq('id', communityId);
    if (error) throw error;
    return { url, secret };
}

export async function getAccessGate(communityId: string) {
    const { data, error } = await getSupabaseAdmin()
        .from('communities').select('access_webhook_url').eq('id', communityId).maybeSingle();
    if (error) throw error;
    return { url: (data?.access_webhook_url as string | null) ?? null };
}
