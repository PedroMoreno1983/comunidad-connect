import 'server-only';
import { readCollectionExpenses } from '@/lib/agent-center/collection';
import { stableNotificationId } from '@/lib/agent-center/utils';
import { listAgreements } from '@/lib/finance/agreementService';
import { recordOperationEvent } from '@/lib/operations/audit';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { computeEligibility } from './eligibility';
import { eligibilityNoticeCopy } from './eligibilityCopy';
import { addDays, chileDateOf, computeRights, daysBetween, percentOf } from './rules';
import type {
    EligibilityAgreement,
    EligibilityCertificate,
    EligibilityDebt,
    EligibilityResult,
    EligibilityUnitInput,
    RightsMethod,
} from './types';

/**
 * Copropietarios hábiles: lecturas y escrituras del servidor (service_role).
 * La regla vive en `eligibility.ts` (pura). La deuda sale de la cobranza
 * unificada del Agente Operador (`readCollectionExpenses`, fase 1) y los
 * convenios, de `listAgreements` (fase 2): no se duplica esa lógica.
 *
 * Privacidad: el detalle por unidad (`assembly_eligibility_units`) solo lo lee
 * administración (RLS) y nunca sale de aquí hacia pantallas compartidas, el
 * acta ni otros residentes.
 */

type Row = Record<string, unknown>;
const db = () => getSupabaseAdmin();
const str = (value: unknown) => (typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value));
const num = (value: unknown) => (value === null || value === undefined || value === '' ? 0 : Number(value));

async function check<T>(promise: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
    const { data, error } = await promise;
    if (error) throw error;
    return data;
}

/** Deuda y convenios de la comunidad, en la forma que pide la regla pura. */
export async function loadEligibilitySources(communityId: string): Promise<{ debts: EligibilityDebt[]; agreements: EligibilityAgreement[] }> {
    const [expenses, agreements] = await Promise.all([readCollectionExpenses(communityId), listAgreements(communityId)]);
    return {
        debts: expenses.filter(row => row.unit_id).map(row => ({ unitId: String(row.unit_id), dueDate: row.due_date, status: row.status })),
        agreements: agreements.map(agreement => ({
            unitId: String(agreement.unitId),
            status: String(agreement.status),
            createdAt: String(agreement.createdAt || ''),
            installments: (agreement.installments || []).map(item => ({ sequence: Number(item.sequence), dueDate: String(item.dueDate || ''), status: String(item.status) })),
        })),
    };
}

/** Habilidad de las unidades a una fecha de corte. */
export async function evaluateEligibility(communityId: string, units: EligibilityUnitInput[], cutoffDate: string): Promise<EligibilityResult> {
    const sources = await loadEligibilitySources(communityId);
    return computeEligibility({ units, ...sources, cutoffDate });
}

const CERTIFICATE_COLUMNS = 'id, assembly_id, cutoff_date, rights_method, total_units, eligible_units, total_rights, eligible_rights, issued_by_name, issued_at, status';

function mapCertificate(row: Row): EligibilityCertificate {
    const totalWeight = num(row.total_rights);
    const eligibleWeight = num(row.eligible_rights);
    return {
        id: str(row.id), cutoffDate: str(row.cutoff_date), rightsMethod: (str(row.rights_method) || 'share') as RightsMethod,
        totalUnits: num(row.total_units), eligibleUnits: num(row.eligible_units), totalWeight, eligibleWeight,
        eligibleShare: percentOf(eligibleWeight, totalWeight), issuedAt: str(row.issued_at), issuedByName: str(row.issued_by_name),
    };
}

/** Certificado vigente de la asamblea y el conjunto de unidades habilitadas (uso interno del servidor). */
export async function loadCurrentCertificate(assemblyId: string): Promise<{ certificate: EligibilityCertificate; eligibleUnitIds: Set<string> } | null> {
    const row = await check(db().from('assembly_eligibility_certificates').select(CERTIFICATE_COLUMNS)
        .eq('assembly_id', assemblyId).eq('status', 'current').maybeSingle()) as Row | null;
    if (!row) return null;
    const units = ((await check(db().from('assembly_eligibility_units').select('unit_id')
        .eq('certificate_id', str(row.id)).eq('eligible', true).limit(10000))) ?? []) as Row[];
    return { certificate: mapCertificate(row), eligibleUnitIds: new Set(units.map(unit => str(unit.unit_id))) };
}

/**
 * Emite el certificado (Ley 21.442 art. 15; DS 7 art. 14): reemplaza al vigente
 * si lo había y guarda el detalle por unidad como respaldo, solo para admin.
 */
export async function insertCertificate(input: {
    assemblyId: string;
    communityId: string;
    issuedBy: string;
    issuedByName: string;
    rightsMethod: RightsMethod;
    result: EligibilityResult;
}): Promise<EligibilityCertificate> {
    await check(db().from('assembly_eligibility_certificates').update({ status: 'superseded', superseded_at: new Date().toISOString() })
        .eq('assembly_id', input.assemblyId).eq('community_id', input.communityId).eq('status', 'current'));
    const row = await check(db().from('assembly_eligibility_certificates').insert({
        assembly_id: input.assemblyId, community_id: input.communityId, cutoff_date: input.result.cutoffDate,
        rights_method: input.rightsMethod, total_units: input.result.totalUnits, eligible_units: input.result.eligibleUnits,
        total_rights: input.result.totalWeight, eligible_rights: input.result.eligibleWeight,
        issued_by: input.issuedBy, issued_by_name: input.issuedByName.slice(0, 160),
    }).select(CERTIFICATE_COLUMNS).single()) as Row;
    const certificateId = str(row.id);
    const rows = input.result.units.map(unit => ({
        certificate_id: certificateId, assembly_id: input.assemblyId, community_id: input.communityId,
        unit_id: unit.unitId, eligible: unit.eligible, basis: unit.basis, weight: unit.weight,
    }));
    for (let index = 0; index < rows.length; index += 500) {
        await check(db().from('assembly_eligibility_units').insert(rows.slice(index, index + 500)));
    }
    return mapCertificate(row);
}

// ---------------------------------------------------------------------------
// Aviso privado 7 días antes (cron)
// ---------------------------------------------------------------------------

/** Días antes de la sesión en que empieza el aviso. */
export const ELIGIBILITY_NOTICE_DAYS = 7;

/** ¿Toca avisar para una sesión en esa fecha? Desde 7 días antes hasta la víspera. */
export function inNoticeWindow(sessionOn: string, today: string): boolean {
    const days = daysBetween(today, sessionOn);
    return days >= 1 && days <= ELIGIBILITY_NOTICE_DAYS;
}

interface NoticeUnitRow { id: string; ownerId: string | null; residentId: string | null; sharePermille: number | null }

/**
 * Para cada asamblea citada que cae dentro de los próximos 7 días, avisa en la
 * app, en privado, solo a las unidades que hoy no estarían habilitadas. El id
 * del aviso es estable por asamblea y persona: correr el cron dos veces (o a
 * diario durante la semana) no duplica nada.
 */
export async function sendEligibilityNotices(now: Date = new Date()) {
    const today = chileDateOf(now);
    const until = new Date(`${addDays(today, ELIGIBILITY_NOTICE_DAYS + 1)}T12:00:00Z`).toISOString();
    const assemblies = ((await check(db().from('assemblies').select('id, community_id, title, scheduled_at')
        .eq('status', 'cited').gte('scheduled_at', now.toISOString()).lte('scheduled_at', until).limit(500))) ?? []) as Row[];
    const due = assemblies.filter(row => inNoticeWindow(chileDateOf(str(row.scheduled_at)), today));
    const summary = { assemblies: due.length, notified: 0, communities: 0 };
    const byCommunity = new Map<string, Row[]>();
    for (const row of due) byCommunity.set(str(row.community_id), [...(byCommunity.get(str(row.community_id)) || []), row]);
    for (const [communityId, rows] of byCommunity) {
        summary.communities += 1;
        const unitRows = ((await check(db().from('units').select('id, owner_id, resident_profile_id, share_permille')
            .eq('community_id', communityId).limit(5000))) ?? []) as Row[];
        const units: NoticeUnitRow[] = unitRows.map(row => ({
            id: str(row.id), ownerId: row.owner_id ? str(row.owner_id) : null, residentId: row.resident_profile_id ? str(row.resident_profile_id) : null,
            sharePermille: row.share_permille === null || row.share_permille === undefined ? null : Number(row.share_permille),
        }));
        if (!units.length) continue;
        const rights = computeRights(units.map(unit => ({ id: unit.id, label: unit.id, sharePermille: unit.sharePermille })));
        const weights = new Map(rights.units.map(unit => [unit.unitId, unit.weight]));
        const result = await evaluateEligibility(communityId, units.map(unit => ({ unitId: unit.id, ownerId: unit.ownerId, weight: weights.get(unit.id) ?? 0 })), today);
        const ineligible = new Set(result.units.filter(unit => !unit.eligible).map(unit => unit.unitId));
        const members = new Set(((await check(db().from('profiles').select('id').eq('community_id', communityId).limit(10000))) as Row[] ?? []).map(row => str(row.id)));
        // Al copropietario; si la unidad no tiene titular registrado, a quien la habita (igual que la cobranza).
        const recipients = [...new Set(units.filter(unit => ineligible.has(unit.id))
            .map(unit => [unit.ownerId, unit.residentId].find(id => id && members.has(id)) || null)
            .filter((id): id is string => Boolean(id)))];
        for (const assembly of rows) {
            const assemblyId = str(assembly.id);
            const copy = eligibilityNoticeCopy({ assemblyTitle: str(assembly.title), sessionDate: chileDateOf(str(assembly.scheduled_at)) });
            const notifications = recipients.map(userId => ({
                id: stableNotificationId('assembly', 'eligibility-notice', assemblyId, userId), user_id: userId, community_id: communityId,
                type: 'info', category: 'assembly', title: copy.title, body: copy.body, link: copy.link,
            }));
            for (let index = 0; index < notifications.length; index += 500) {
                await check(db().from('notifications').upsert(notifications.slice(index, index + 500), { onConflict: 'id', ignoreDuplicates: true }));
            }
            summary.notified += notifications.length;
            await recordOperationEvent({
                communityId, actorId: null, actorRole: 'system', action: 'assembly.eligibility_notice', entityType: 'assembly', entityId: assemblyId,
                severity: 'info', status: 'success', summary: 'Aviso privado de habilidad para votar',
                // Solo conteos: nunca qué unidades.
                metadata: { recipients: notifications.length, channel: 'in_app', cutoffEstimate: today },
            });
        }
    }
    return summary;
}
