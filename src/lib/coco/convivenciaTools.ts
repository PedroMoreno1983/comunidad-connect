import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { draftCnvMessage } from '@/lib/community/mediationMessage';

/**
 * Convivencia por CoCo: banco de tiempo, compras colectivas, proyectos
 * comunitarios y mediación entre vecinos.
 *
 * Reglas que vienen de la base y siguen valiendo con la service role
 * (triggers de community_participation_requests): solo se puede pedir sumarse
 * a iniciativas aprobadas con coordinador, el coordinador no se pide a sí
 * mismo, y quien pide es de la comunidad.
 * Reglas que en la pantalla pone RLS y aquí se ponen a mano: toda iniciativa
 * nace 'pending' a nombre del perfil autenticado; resolver una solicitud es
 * del coordinador o de la administración; validar iniciativas, solo de la
 * administración.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const int = (value: unknown, min: number, max: number, fallback: number) => {
    const n = Math.round(Number(value));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const oneOf = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
    (options as readonly string[]).includes(String(value)) ? value as T : fallback;
type Row = Record<string, unknown>;
export type ConvivenciaActor = { id: string; role: string; communityId: string; name: string | null };

const TYPES = {
    time_bank: { table: 'time_bank_offers', owner: 'profile_id', title: 'skill', label: 'banco de tiempo' },
    collective_purchase: { table: 'collective_purchase_campaigns', owner: 'organizer_id', title: 'title', label: 'compra colectiva' },
    community_project: { table: 'community_projects', owner: 'creator_id', title: 'title', label: 'proyecto' },
} as const;
type InitiativeType = keyof typeof TYPES;
const typeOf = (value: unknown): InitiativeType | null => (value === 'time_bank' || value === 'collective_purchase' || value === 'community_project' ? value : null);

async function profileLabel(admin: SupabaseClient, userId: string) {
    const { data } = await admin.from('profiles').select('name, department_number').eq('id', userId).maybeSingle();
    return { name: String(data?.name || 'Vecino'), unit: String(data?.department_number || '') };
}

// ── Ver ──────────────────────────────────────────────────────────────────────

export async function listCommunityInitiatives(admin: SupabaseClient, actor: ConvivenciaActor) {
    const isAdmin = actor.role === 'admin';
    const results = await Promise.all((Object.keys(TYPES) as InitiativeType[]).map(async type => {
        const { table, owner, title } = TYPES[type];
        let query = admin.from(table).select(`id, ${title}, governance_status, ${owner}, coordinator_id, created_at`)
            .eq('community_id', actor.communityId).order('created_at', { ascending: false }).limit(15);
        if (!isAdmin) query = query.or(`governance_status.eq.approved,${owner}.eq.${actor.id}`);
        const { data } = await query;
        return ((data ?? []) as Row[]).map(row => ({
            tipo: type, initiative_id: row.id, titulo: row[title], estado: row.governance_status,
            es_mia: row[owner] === actor.id, coordino: row.coordinator_id === actor.id,
        }));
    }));
    const { data: requests } = await admin.from('community_participation_requests')
        .select('id, initiative_type, initiative_id, requester_id, message, status')
        .eq('community_id', actor.communityId).eq('status', 'pending')
        .or(isAdmin ? `community_id.eq.${actor.communityId}` : `coordinator_id.eq.${actor.id}`)
        .limit(20);
    return {
        iniciativas: results.flat(),
        solicitudes_por_resolver: ((requests ?? []) as Row[]).map(r => ({ request_id: r.id, tipo: r.initiative_type, initiative_id: r.initiative_id, mensaje: r.message })),
    };
}

// ── Proponer y sumarse ───────────────────────────────────────────────────────

export async function proposeInitiative(admin: SupabaseClient, actor: ConvivenciaActor, input: Record<string, unknown>) {
    const type = typeOf(input.type);
    if (!type) return { error: 'Indica el tipo: time_bank, collective_purchase o community_project.' };
    const me = await profileLabel(admin, actor.id);
    let row: Row;
    if (type === 'time_bank') {
        const skill = text(input.title, 120);
        if (!skill) return { error: 'Dime qué ofreces (ej. "clases de inglés", "arreglos de ropa").' };
        row = {
            profile_id: actor.id, community_id: actor.communityId, neighbor_name: me.name, unit_label: me.unit || 'sin unidad',
            skill, description: text(input.description, 500) || skill, availability: text(input.availability, 200) || 'A coordinar',
            credits: int(input.credits, 1, 10, 1), category: oneOf(input.category, ['tools', 'care', 'digital', 'home', 'learning', 'other'] as const, 'other'),
        };
    } else if (type === 'collective_purchase') {
        const title = text(input.title, 120);
        const supplier = text(input.supplier, 120);
        const deadline = text(input.deadline, 10);
        if (!title || !supplier || !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return { error: 'Necesito qué se compra, a qué proveedor y la fecha de cierre (AAAA-MM-DD).' };
        const minimum = int(input.minimum_participants, 1, 500, 5);
        row = {
            community_id: actor.communityId, title, supplier, deadline,
            category: oneOf(input.category, ['water', 'gas', 'cleaning', 'food', 'eco', 'other'] as const, 'other'),
            unit_price: int(input.unit_price, 0, 10_000_000, 0), retail_price: int(input.retail_price, 0, 10_000_000, 0),
            minimum_participants: minimum, participants: 1, status: minimum <= 1 ? 'ready' : 'open',
            organizer: me.name, organizer_id: actor.id,
        };
    } else {
        const title = text(input.title, 120);
        const description = text(input.description, 1000);
        if (!title || !description) return { error: 'Necesito el nombre del proyecto y de qué se trata.' };
        row = {
            community_id: actor.communityId, title, description, creator_id: actor.id,
            area: oneOf(input.area, ['huerto', 'reciclaje', 'cuidados', 'mascotas', 'cultura', 'otro'] as const, 'otro'),
            impact: text(input.impact, 500) || 'Por definir con los vecinos', needed: text(input.needed, 500) || 'Vecinos que se sumen',
            coco_insight: 'Propuesto conversando con CoCo.', participants: 1, status: 'forming',
        };
    }
    // Nace pendiente y a nombre propio, como exige la política de la pantalla.
    const { error } = await admin.from(TYPES[type].table).insert({ ...row, governance_status: 'pending' });
    if (error) return { error: 'No se pudo registrar la propuesta.' };
    return { success: true, message: `Propuse tu ${TYPES[type].label}. Queda pendiente: la administración la valida y le asigna coordinador antes de que otros puedan sumarse.` };
}

const JOIN_ERRORS: Record<string, string> = {
    'initiative-not-approved': 'Esa iniciativa todavía no está aprobada por la administración.',
    'coordinator-cannot-request': 'Tú coordinas esa iniciativa; no necesitas sumarte.',
    'participation-profile-community-mismatch': 'Esa iniciativa no es de tu comunidad.',
};

export async function joinInitiative(admin: SupabaseClient, actor: ConvivenciaActor, input: Record<string, unknown>) {
    const type = typeOf(input.type);
    const initiativeId = text(input.initiative_id, 36);
    if (!type || !UUID.test(initiativeId)) return { error: 'Necesito el tipo y el initiative_id de list_community_initiatives.' };
    const { error } = await admin.from('community_participation_requests').insert({
        initiative_type: type, initiative_id: initiativeId, community_id: actor.communityId,
        requester_id: actor.id, message: text(input.message, 500) || null,
    });
    if (error) {
        if (error.code === '23505') return { error: 'Ya pediste sumarte a esa iniciativa.' };
        const known = Object.keys(JOIN_ERRORS).find(key => error.message?.includes(key));
        return { error: known ? JOIN_ERRORS[known] : 'No se pudo enviar la solicitud.' };
    }
    return { success: true, message: 'Le pedí al coordinador que te sume. Te avisan cuando lo resuelva.' };
}

// ── Coordinación y administración ────────────────────────────────────────────

export async function resolveParticipation(admin: SupabaseClient, actor: ConvivenciaActor, input: Record<string, unknown>) {
    const requestId = text(input.request_id, 36);
    if (!UUID.test(requestId)) return { error: 'Necesito el request_id de list_community_initiatives.' };
    if (typeof input.accept !== 'boolean') return { error: 'Indica si se acepta (accept: true) o se rechaza (false).' };
    const { data: request } = await admin.from('community_participation_requests')
        .select('id, community_id, coordinator_id, status').eq('id', requestId).maybeSingle();
    if (!request || request.community_id !== actor.communityId) return { error: 'No encontré esa solicitud en tu comunidad.' };
    if (request.coordinator_id !== actor.id && actor.role !== 'admin') return { error: 'Solo quien coordina la iniciativa o la administración la resuelve.' };
    const { data, error } = await admin.from('community_participation_requests')
        .update({ status: input.accept ? 'accepted' : 'rejected', resolved_at: new Date().toISOString() })
        .eq('id', requestId).eq('status', 'pending').select('id').maybeSingle();
    if (error) return { error: 'No se pudo resolver la solicitud.' };
    if (!data) return { error: 'Esa solicitud ya estaba resuelta.' };
    return { success: true, message: input.accept ? 'Aceptada: el vecino ya está en la iniciativa.' : 'Rechazada. El vecino recibe el aviso.' };
}

export async function reviewInitiative(admin: SupabaseClient, actor: ConvivenciaActor, input: Record<string, unknown>) {
    if (actor.role !== 'admin') return { error: 'Solo la administración valida iniciativas.' };
    const type = typeOf(input.type);
    const initiativeId = text(input.initiative_id, 36);
    if (!type || !UUID.test(initiativeId)) return { error: 'Necesito el tipo y el initiative_id.' };
    const decision = oneOf(input.decision, ['approved', 'changes_requested', 'rejected'] as const, 'approved');
    const { table, owner, title } = TYPES[type];
    const { data } = await admin.from(table).select(`id, ${title}, ${owner}, community_id`).eq('id', initiativeId).maybeSingle();
    const current = data as Row | null;
    if (!current || current.community_id !== actor.communityId) return { error: 'No encontré esa iniciativa en tu comunidad.' };
    const note = text(input.note, 500);
    if (decision !== 'approved' && !note) return { error: 'Para pedir cambios o rechazar, escribe el motivo: el vecino lo verá.' };
    // Coordinador: quien lo indique la administración o, por defecto, quien la propuso.
    const coordinatorId = UUID.test(text(input.coordinator_id, 36)) ? text(input.coordinator_id, 36) : String(current[owner]);
    const { error } = await admin.from(table).update({
        governance_status: decision,
        coordinator_id: decision === 'approved' ? coordinatorId : null,
        governance_note: note || null,
        validated_by: actor.id,
        validated_at: new Date().toISOString(),
    }).eq('id', initiativeId).eq('community_id', actor.communityId);
    if (error) return { error: error.message?.includes('coordinator') ? 'El coordinador tiene que ser un vecino de la comunidad.' : 'No se pudo guardar la revisión.' };
    const done = { approved: 'aprobada; ya pueden sumarse', changes_requested: 'devuelta con cambios', rejected: 'rechazada' };
    return { success: true, message: `"${current[title]}" quedó ${done[decision]}.` };
}

// ── Mediación ────────────────────────────────────────────────────────────────

export async function requestMediation(admin: SupabaseClient, actor: ConvivenciaActor, input: Record<string, unknown>) {
    const fields = {
        targetUnit: text(input.target_unit, 40), observation: text(input.observation, 600),
        feeling: text(input.feeling, 120), need: text(input.need, 200), request: text(input.request, 300),
    };
    if (Object.values(fields).some(value => !value)) {
        return { error: 'Para mediar necesito: a qué depto, qué observas (hechos, sin juicios), cómo te sientes, qué necesitas y qué le pides.' };
    }
    const me = await profileLabel(admin, actor.id);
    const drafted = draftCnvMessage({ reporterName: me.name, ...fields });
    const { error } = await admin.from('neighbor_mediations').insert({
        reporter_id: actor.id, reporter_name: me.name, community_id: actor.communityId,
        target_unit: fields.targetUnit, observation: fields.observation, feeling: fields.feeling,
        need: fields.need, request: fields.request, drafted_message: drafted, status: 'drafted',
    });
    if (error) return { error: 'No se pudo registrar la mediación.' };
    return { success: true, message: 'Preparé el mensaje para tu vecino. Lo revisas y lo envías desde Convivencia.', borrador: drafted, donde_verla: '/convivencia' };
}
