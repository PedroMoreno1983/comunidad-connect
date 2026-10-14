import 'server-only';
import { stableNotificationId } from '@/lib/agent-center/utils';
import { activeCommitteeMembers } from '@/lib/finance/committeeMembers';
import { recordOperationEvent } from '@/lib/operations/audit';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { writeAssemblyProse } from './aiWriter';
import { eligiblePresentWeight } from './eligibility';
import { AGREEMENT_REQUEST_SENT, agreementRequestAdminCopy, VOTE_NOT_RECORDED } from './eligibilityCopy';
import { evaluateEligibility, insertCertificate, loadCurrentCertificate } from './eligibilityService';
import { findMatter } from './catalog';
import {
    acceptableAiProse,
    citationBody,
    composeCitation,
    composeMinutes,
    fallbackCitationIntro,
    fallbackMinutesNarrative,
    SESSION_TYPE_LABEL,
    type CitationInput,
} from './compose';
import {
    checkAgenda,
    checkCitationWindow,
    checkOwnerRequest,
    checkRepresentation,
    chileDateOf,
    computeRights,
    constitutionMet,
    evaluateAgendaItem,
    minutesDeadline,
    occupantMayVote,
    QUORUM_RULES,
    sessionQuorumClass,
    sessionRequiresNotary,
    tallyVotes,
    voteCounts,
} from './rules';
import type {
    AgendaResult,
    AssemblyAgendaItem,
    AssemblyAlert,
    AssemblyAttendanceRow,
    AssemblyMinutes,
    AssemblyModality,
    AssemblyProxyRow,
    AssemblyRecord,
    AssemblySessionType,
    AssemblySummary,
    AssemblyView,
    AssemblyVoteRow,
    AttendanceCapacity,
    AttendanceMode,
    EligibilityCertificate,
    LiveQuorum,
    MyEligibility,
    ProxyKind,
    RepresentableUnit,
    RightsSnapshot,
    VoteChoice,
} from './types';

/**
 * Asambleas de copropietarios (Ley 21.442 y DS 7 de 2025).
 *   borrador -> citada -> en curso -> cerrada -> acta firmada
 * Todas las escrituras pasan por aquí con service_role y siempre filtran por
 * comunidad; el RLS de la migración 20261014230000 cubre las lecturas directas.
 * Avisos solo dentro de la app (tabla notifications, categoría 'assembly').
 *
 * Copropietarios hábiles (Ley 21.442, arts. 2 N°13 y 15; DS 7, arts. 9 y 14):
 * el administrador emite el certificado de habilidad en la sesión, antes de
 * abrir la primera votación (`issueEligibilityCertificate`). Solo votan las
 * unidades habilitadas; todas asisten con voz. Cada unidad ve solo su estado;
 * el panel y el acta, solo totales. Regla en `eligibility.ts`, ver AGENTS.md.
 */

export class AssemblyError extends Error {
    constructor(message: string, public status = 400) {
        super(message);
        this.name = 'AssemblyError';
    }
}

export interface AssemblyActor {
    id: string;
    role: 'admin' | 'resident' | 'concierge';
    communityId: string;
    unitId: string | null;
}

type Row = Record<string, unknown>;
const ADMIN_LINK = '/admin/asambleas';
const RESIDENT_LINK = '/votaciones/asambleas';
const ASSEMBLY_COLUMNS = 'id, community_id, title, session_type, modality, scheduled_at, location, video_url, status, citation_text, citation_source, cited_at, citation_date, request_received_on, request_rights_share, secretary_profile_id, notary_required, notary_name, rights_method, rights_snapshot, rights_total, started_at, closed_at, created_at, updated_at';
const ITEM_COLUMNS = 'id, assembly_id, position, matter_code, title, description, quorum_class, requires_notary, voting_status, outcome, result, notes';
const ATTENDANCE_COLUMNS = 'id, unit_id, unit_label, weight, attendee_profile_id, attendee_name, capacity, proxy_id, mode, status, identity_verified_at, checked_in_at';
const VOTE_COLUMNS = 'id, agenda_item_id, unit_id, attendance_id, choice, weight, mode, identity_verified_at, cast_by_profile_id';
const PROXY_COLUMNS = 'id, unit_id, kind, grantor_profile_id, proxy_profile_id, proxy_name, covers_reinforced, document_note, status';

const db = () => getSupabaseAdmin();
const str = (value: unknown) => (typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value));
const nullableStr = (value: unknown) => (value === null || value === undefined || value === '' ? null : String(value));
const num = (value: unknown) => (value === null || value === undefined || value === '' ? 0 : Number(value));
const nowIso = () => new Date().toISOString();
const todayChile = () => chileDateOf(new Date());

function fail(error: unknown): never {
    if (error instanceof AssemblyError) throw error;
    const message = typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : '';
    // Las reglas de la base (triggers) llegan con su propio mensaje en español.
    if (/administrador no puede|no está abierta|ya está firmada|certificado de habilidad|no figura habilitada/.test(message)) throw new AssemblyError(message, 422);
    throw error;
}

async function check<T>(promise: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
    const { data, error } = await promise;
    if (error) fail(error);
    return data;
}

// ---------------------------------------------------------------------------
// Mapeo
// ---------------------------------------------------------------------------

function mapItem(row: Row): AssemblyAgendaItem {
    return {
        id: str(row.id), position: num(row.position), matterCode: str(row.matter_code), title: str(row.title),
        description: str(row.description), quorumClass: row.quorum_class as AssemblyAgendaItem['quorumClass'],
        requiresNotary: Boolean(row.requires_notary), votingStatus: row.voting_status as AssemblyAgendaItem['votingStatus'],
        outcome: (row.outcome as AssemblyAgendaItem['outcome']) ?? null, result: (row.result as AgendaResult | null) ?? null,
        notes: str(row.notes),
    };
}

function mapAssembly(row: Row, items: AssemblyAgendaItem[]): AssemblyRecord {
    return {
        id: str(row.id), title: str(row.title), sessionType: row.session_type as AssemblySessionType,
        modality: row.modality as AssemblyModality, scheduledAt: str(row.scheduled_at), location: str(row.location),
        videoUrl: str(row.video_url), status: row.status as AssemblyRecord['status'], citationText: str(row.citation_text),
        citationSource: (row.citation_source as AssemblyRecord['citationSource']) ?? null, citedAt: nullableStr(row.cited_at),
        citationDate: nullableStr(row.citation_date), requestReceivedOn: nullableStr(row.request_received_on),
        requestRightsShare: row.request_rights_share === null || row.request_rights_share === undefined ? null : Number(row.request_rights_share),
        secretaryProfileId: nullableStr(row.secretary_profile_id), notaryRequired: Boolean(row.notary_required),
        notaryName: str(row.notary_name), rightsMethod: (row.rights_method as AssemblyRecord['rightsMethod']) ?? null,
        rightsTotal: row.rights_total === null || row.rights_total === undefined ? null : Number(row.rights_total),
        startedAt: nullableStr(row.started_at), closedAt: nullableStr(row.closed_at), createdAt: str(row.created_at),
        updatedAt: str(row.updated_at), items,
    };
}

function mapAttendance(row: Row): AssemblyAttendanceRow {
    return {
        id: str(row.id), unitId: str(row.unit_id), unitLabel: str(row.unit_label), weight: num(row.weight),
        attendeeProfileId: nullableStr(row.attendee_profile_id), attendeeName: str(row.attendee_name),
        capacity: row.capacity as AttendanceCapacity, proxyId: nullableStr(row.proxy_id), mode: row.mode as AttendanceMode,
        status: row.status as AssemblyAttendanceRow['status'], identityVerifiedAt: nullableStr(row.identity_verified_at),
        checkedInAt: nullableStr(row.checked_in_at),
    };
}

function mapVote(row: Row): AssemblyVoteRow & { attendanceId: string; castBy: string | null } {
    return {
        id: str(row.id), agendaItemId: str(row.agenda_item_id), unitId: str(row.unit_id), choice: row.choice as VoteChoice,
        weight: num(row.weight), mode: row.mode as AttendanceMode, identityVerifiedAt: nullableStr(row.identity_verified_at),
        attendanceId: str(row.attendance_id), castBy: nullableStr(row.cast_by_profile_id),
    };
}

function mapProxy(row: Row, labels: Map<string, string>): AssemblyProxyRow {
    return {
        id: str(row.id), unitId: str(row.unit_id), unitLabel: labels.get(str(row.unit_id)) || 'Unidad', kind: row.kind as ProxyKind,
        grantorProfileId: nullableStr(row.grantor_profile_id), proxyProfileId: nullableStr(row.proxy_profile_id),
        proxyName: str(row.proxy_name), coversReinforced: Boolean(row.covers_reinforced), documentNote: str(row.document_note),
        status: row.status as AssemblyProxyRow['status'],
    };
}

// ---------------------------------------------------------------------------
// Lecturas base
// ---------------------------------------------------------------------------

interface UnitRow { id: string; label: string; sharePermille: number | null; ownerId: string | null; residentId: string | null }

export function unitLabel(row: { tower?: unknown; number?: unknown }) {
    const tower = str(row.tower);
    return tower && tower !== 'A' ? `${tower}-${str(row.number)}` : str(row.number);
}

async function loadUnits(communityId: string): Promise<UnitRow[]> {
    const rows = await check(db().from('units').select('id, number, tower, share_permille, owner_id, resident_profile_id')
        .eq('community_id', communityId).order('number', { ascending: true }).limit(5000));
    return ((rows ?? []) as Row[]).map(row => ({
        id: str(row.id), label: unitLabel(row),
        sharePermille: row.share_permille === null || row.share_permille === undefined ? null : Number(row.share_permille),
        ownerId: nullableStr(row.owner_id), residentId: nullableStr(row.resident_profile_id),
    }));
}

async function loadAssembly(communityId: string, assemblyId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(assemblyId)) throw new AssemblyError('Asamblea no encontrada.', 404);
    const row = await check(db().from('assemblies').select(ASSEMBLY_COLUMNS).eq('community_id', communityId).eq('id', assemblyId).maybeSingle());
    if (!row) throw new AssemblyError('Asamblea no encontrada.', 404);
    const items = await check(db().from('assembly_agenda_items').select(ITEM_COLUMNS).eq('assembly_id', assemblyId).order('position'));
    return { row: row as Row, assembly: mapAssembly(row as Row, ((items ?? []) as Row[]).map(mapItem)) };
}

function snapshotOf(row: Row): RightsSnapshot | null {
    const snap = row.rights_snapshot as RightsSnapshot | null;
    return snap && Array.isArray(snap.units) ? snap : null;
}

async function rightsFor(row: Row, communityId: string): Promise<{ rights: RightsSnapshot; units: UnitRow[] }> {
    const units = await loadUnits(communityId);
    return { rights: snapshotOf(row) ?? computeRights(units), units };
}

async function isCommitteeMember(communityId: string, profileId: string) {
    try {
        return (await activeCommitteeMembers(communityId)).some(member => member.id === profileId);
    } catch {
        return false;
    }
}

async function viewerFor(actor: AssemblyActor, assembly: AssemblyRecord): Promise<AssemblyView['viewer']> {
    if (actor.role === 'admin') return { role: 'admin', canManage: true, canVerify: true };
    if (assembly.secretaryProfileId && assembly.secretaryProfileId === actor.id) return { role: 'secretary', canManage: false, canVerify: true };
    if (await isCommitteeMember(actor.communityId, actor.id)) return { role: 'committee', canManage: false, canVerify: false };
    return { role: 'resident', canManage: false, canVerify: false };
}

function requireAdmin(actor: AssemblyActor) {
    if (actor.role !== 'admin') throw new AssemblyError('Solo administración puede hacer esto.', 403);
}

function requireVerifier(actor: AssemblyActor, assembly: AssemblyRecord) {
    if (actor.role === 'admin') return;
    if (assembly.secretaryProfileId && assembly.secretaryProfileId === actor.id) return;
    throw new AssemblyError('Solo administración o la secretaría de la asamblea pueden acreditar y verificar.', 403);
}

function requireStatus(assembly: AssemblyRecord, ...allowed: AssemblyRecord['status'][]) {
    if (!allowed.includes(assembly.status)) throw new AssemblyError('La asamblea no está en una etapa que permita esta acción.', 409);
}

function representableUnits(actor: AssemblyActor, units: UnitRow[], proxies: AssemblyProxyRow[]): RepresentableUnit[] {
    const result = new Map<string, RepresentableUnit>();
    for (const unit of units) {
        if (unit.ownerId === actor.id) result.set(unit.id, { unitId: unit.id, label: unit.label, capacity: 'owner', proxyId: null });
    }
    if (actor.role !== 'admin') {
        for (const unit of units) {
            if (result.has(unit.id)) continue;
            const linked = unit.residentId === actor.id || actor.unitId === unit.id;
            const optedOut = proxies.some(p => p.unitId === unit.id && p.kind === 'occupant_opt_out' && p.status === 'accepted');
            if (linked && !optedOut) result.set(unit.id, { unitId: unit.id, label: unit.label, capacity: 'occupant', proxyId: null });
        }
        for (const proxy of proxies) {
            if (proxy.kind === 'proxy' && proxy.status === 'accepted' && proxy.proxyProfileId === actor.id && !result.has(proxy.unitId)) {
                result.set(proxy.unitId, { unitId: proxy.unitId, label: proxy.unitLabel, capacity: 'proxy', proxyId: proxy.id });
            }
        }
    }
    return [...result.values()].sort((a, b) => a.label.localeCompare(b.label, 'es'));
}

type CurrentCertificate = { certificate: EligibilityCertificate; eligibleUnitIds: Set<string> } | null;

/**
 * Quórum en vivo. Con certificado, la sesión se constituye con los derechos
 * HÁBILES presentes (ver `rules.ts`). Lo que se muestra es solo el total
 * presente y los totales del certificado: nunca cuánto pesan los no hábiles
 * presentes ni quiénes son.
 */
function liveQuorum(sessionType: AssemblySessionType, rights: RightsSnapshot, attendance: AssemblyAttendanceRow[], current: CurrentCertificate): LiveQuorum {
    const present = attendance.filter(row => row.status === 'present' && row.identityVerifiedAt);
    const presentWeight = present.reduce((sum, row) => sum + row.weight, 0);
    const constitutionWeight = current ? eligiblePresentWeight(present, current.eligibleUnitIds) : presentWeight;
    const quorumClass = sessionQuorumClass(sessionType);
    return {
        presentWeight, totalWeight: rights.total,
        presentShare: rights.total > 0 ? Math.round((presentWeight / rights.total) * 10_000) / 100 : 0,
        presentUnits: present.length, totalUnits: rights.units.length,
        constitutionMet: constitutionMet(quorumClass, constitutionWeight, rights.total),
        constitutionRule: QUORUM_RULES[quorumClass].constitution,
        pendingVerification: attendance.filter(row => row.status !== 'left' && !row.identityVerifiedAt && (row.status === 'present' || row.mode === 'remote')).length,
        eligibility: current ? current.certificate : null,
    };
}

const CERTIFIED_STATUSES: AssemblyRecord['status'][] = ['in_progress', 'closed', 'minutes_signed'];

/**
 * Habilidad para la vista: el certificado si ya se emitió; si no, una
 * estimación de hoy (solo mientras la asamblea está citada o recién iniciada).
 * Devuelve el conjunto de unidades no habilitadas, que solo usa el servidor.
 */
async function eligibilityForView(actor: AssemblyActor, assembly: AssemblyRecord, units: UnitRow[], rights: RightsSnapshot, current: CurrentCertificate) {
    if (current) return { ineligible: new Set(units.map(unit => unit.id).filter(id => !current.eligibleUnitIds.has(id))), certified: true };
    if (!['cited', 'in_progress'].includes(assembly.status)) return null;
    const weights = new Map(rights.units.map(unit => [unit.unitId, unit.weight]));
    const result = await evaluateEligibility(actor.communityId, units.map(unit => ({ unitId: unit.id, ownerId: unit.ownerId, weight: weights.get(unit.id) ?? 0 })), todayChile());
    return { ineligible: new Set(result.units.filter(unit => !unit.eligible).map(unit => unit.unitId)), certified: false };
}

function alertsFor(assembly: AssemblyRecord, rights: RightsSnapshot, viewerIsAdmin: boolean, minutes: AssemblyMinutes | null): AssemblyAlert[] {
    if (!viewerIsAdmin) return [];
    const alerts: AssemblyAlert[] = [];
    rights.warnings.forEach(message => alerts.push({ level: 'warning', message }));
    alerts.push(...checkAgenda({ sessionType: assembly.sessionType, matterCodes: assembly.items.map(item => item.matterCode) })
        .filter(alert => alert.level !== 'info' || assembly.status === 'draft'));
    const today = todayChile();
    const sessionOn = chileDateOf(assembly.scheduledAt);
    if (assembly.status === 'draft') {
        const window = checkCitationWindow(today, sessionOn);
        alerts.push({ level: window.valid ? 'info' : 'error', message: window.valid ? `Si publicas hoy: ${window.message}` : window.message });
    }
    if (assembly.requestReceivedOn && assembly.requestRightsShare !== null) {
        const request = checkOwnerRequest(assembly.requestReceivedOn, assembly.requestRightsShare, today, assembly.citationDate);
        if (request.reachesThreshold || assembly.status === 'draft') {
            alerts.push({ level: request.overdue ? 'error' : request.reachesThreshold ? 'warning' : 'info', message: request.message });
        }
    }
    if (assembly.modality !== 'in_person' && !assembly.videoUrl) {
        alerts.push({ level: 'error', message: 'Falta el enlace de la videollamada: es obligatorio para publicar una sesión telemática o mixta (DS 7, art. 16).' });
    }
    if (minutes && minutes.status === 'draft') {
        const deadline = minutesDeadline(sessionOn, today);
        alerts.push({
            level: deadline.overdue ? 'error' : deadline.daysLeft <= 7 ? 'warning' : 'info',
            message: deadline.overdue
                ? `El plazo para firmar el acta venció el ${deadline.dueOn} (Ley 21.442, art. 15).`
                : `El acta debe firmarse a más tardar el ${deadline.dueOn}: quedan ${deadline.daysLeft} días (Ley 21.442, art. 15).`,
        });
    }
    return alerts;
}

// ---------------------------------------------------------------------------
// Lecturas públicas
// ---------------------------------------------------------------------------

export async function listAssemblies(actor: AssemblyActor): Promise<{ assemblies: AssemblySummary[]; isCommittee: boolean }> {
    let query = db().from('assemblies').select('id, title, session_type, modality, scheduled_at, status').eq('community_id', actor.communityId)
        .order('scheduled_at', { ascending: false }).limit(100);
    if (actor.role !== 'admin') query = query.neq('status', 'draft');
    const rows = ((await check(query)) ?? []) as Row[];
    const ids = rows.map(row => str(row.id));
    const counts = new Map<string, number>();
    const rsvps = new Set<string>();
    if (ids.length) {
        const items = ((await check(db().from('assembly_agenda_items').select('assembly_id').in('assembly_id', ids))) ?? []) as Row[];
        items.forEach(item => counts.set(str(item.assembly_id), (counts.get(str(item.assembly_id)) || 0) + 1));
        const mine = ((await check(db().from('assembly_attendance').select('assembly_id').in('assembly_id', ids).eq('attendee_profile_id', actor.id))) ?? []) as Row[];
        mine.forEach(row => rsvps.add(str(row.assembly_id)));
    }
    return {
        assemblies: rows.map(row => ({
            id: str(row.id), title: str(row.title), sessionType: row.session_type as AssemblySessionType,
            modality: row.modality as AssemblyModality, scheduledAt: str(row.scheduled_at), status: row.status as AssemblyRecord['status'],
            itemCount: counts.get(str(row.id)) || 0, myRsvp: rsvps.has(str(row.id)),
        })),
        isCommittee: actor.role === 'admin' ? false : await isCommitteeMember(actor.communityId, actor.id),
    };
}

export async function getAssemblyView(actor: AssemblyActor, assemblyId: string): Promise<AssemblyView> {
    const { row, assembly } = await loadAssembly(actor.communityId, assemblyId);
    const viewer = await viewerFor(actor, assembly);
    if (assembly.status === 'draft' && viewer.role !== 'admin') throw new AssemblyError('Asamblea no encontrada.', 404);
    const { rights, units } = await rightsFor(row, actor.communityId);
    const labels = new Map(units.map(unit => [unit.id, unit.label]));
    const [attendanceRows, voteRows, proxyRows, minutesRow] = await Promise.all([
        check(db().from('assembly_attendance').select(ATTENDANCE_COLUMNS).eq('assembly_id', assemblyId)),
        check(db().from('assembly_votes').select(VOTE_COLUMNS).eq('assembly_id', assemblyId)),
        check(db().from('assembly_proxies').select(PROXY_COLUMNS).eq('assembly_id', assemblyId).order('created_at')),
        check(db().from('assembly_minutes').select('id, content, source, status, due_on, signed_at, signers, edited_at').eq('assembly_id', assemblyId).maybeSingle()),
    ]);
    const attendance = ((attendanceRows ?? []) as Row[]).map(mapAttendance);
    const votes = ((voteRows ?? []) as Row[]).map(mapVote);
    const proxies = ((proxyRows ?? []) as Row[]).map(proxy => mapProxy(proxy, labels));
    const representable = representableUnits(actor, units, proxies);
    const mine = new Set(representable.map(unit => unit.unitId));
    const broad = viewer.role !== 'resident';
    const current = CERTIFIED_STATUSES.includes(assembly.status) ? await loadCurrentCertificate(assemblyId) : null;
    const needsEligibility = representable.length > 0 || viewer.role === 'admin';
    const eligibility = needsEligibility ? await eligibilityForView(actor, assembly, units, rights, current) : null;
    // Cada unidad ve solo su propio estado.
    const myEligibility: MyEligibility[] = eligibility
        ? representable.map(unit => ({ unitId: unit.unitId, label: unit.label, eligible: !eligibility.ineligible.has(unit.unitId), certified: eligibility.certified }))
        : [];
    const minutesRaw = minutesRow as Row | null;
    let minutes: AssemblyMinutes | null = minutesRaw ? {
        id: str(minutesRaw.id), content: str(minutesRaw.content), source: minutesRaw.source as AssemblyMinutes['source'],
        status: minutesRaw.status as AssemblyMinutes['status'], dueOn: str(minutesRaw.due_on), signedAt: nullableStr(minutesRaw.signed_at),
        signers: str(minutesRaw.signers), edited: Boolean(minutesRaw.edited_at),
    } : null;
    if (minutes && !broad && minutes.status !== 'signed') minutes = null;
    const sessionOn = chileDateOf(assembly.scheduledAt);
    return {
        assembly: viewer.role === 'admin' ? assembly : { ...assembly, requestRightsShare: null, requestReceivedOn: null },
        viewer,
        alerts: alertsFor(assembly, rights, viewer.role === 'admin', minutes),
        rights: broad ? rights : { ...rights, units: rights.units.filter(unit => mine.has(unit.unitId)) },
        quorum: liveQuorum(assembly.sessionType, rights, attendance, current),
        attendance: broad ? attendance : attendance.filter(row => mine.has(row.unitId) || row.attendeeProfileId === actor.id),
        votes: (broad ? votes : votes.filter(vote => mine.has(vote.unitId) || vote.castBy === actor.id))
            .map(vote => ({ id: vote.id, agendaItemId: vote.agendaItemId, unitId: vote.unitId, choice: vote.choice, weight: vote.weight, mode: vote.mode, identityVerifiedAt: vote.identityVerifiedAt })),
        proxies: broad ? proxies : proxies.filter(proxy => mine.has(proxy.unitId) || proxy.grantorProfileId === actor.id || proxy.proxyProfileId === actor.id),
        minutes,
        representable,
        minutesDeadline: ['closed', 'minutes_signed'].includes(assembly.status) ? minutesDeadline(sessionOn, todayChile(), assembly.status === 'minutes_signed') : null,
        myEligibility,
        // Solo quien conduce (administración) y solo para acreditar.
        conductor: viewer.role === 'admin' && eligibility && ['cited', 'in_progress'].includes(assembly.status)
            ? { ineligibleUnitIds: [...eligibility.ineligible], certified: eligibility.certified }
            : null,
    };
}

/** Residentes de la comunidad para elegir secretaría o apoderado (sin administradores). */
export async function listCommunityResidents(actor: AssemblyActor) {
    const rows = ((await check(db().from('profiles').select('id, name, role').eq('community_id', actor.communityId).eq('role', 'resident').order('name').limit(2000))) ?? []) as Row[];
    return rows.map(row => ({ id: str(row.id), name: str(row.name) || 'Residente' }));
}

// ---------------------------------------------------------------------------
// Borrador, citación y publicación (admin)
// ---------------------------------------------------------------------------

export interface AssemblyDraftInput {
    title: string;
    sessionType: AssemblySessionType;
    modality: AssemblyModality;
    scheduledAt: string;
    location: string;
    videoUrl: string;
    requestReceivedOn: string | null;
    requestRightsShare: number | null;
    secretaryProfileId: string | null;
    notaryName: string;
    items: { matterCode: string; title: string; description: string }[];
    extraordinaryExpense?: { amount: number; monthlyOrdinaryTotal: number; approvedLast12Months?: number } | null;
}

function validateDraft(input: AssemblyDraftInput) {
    if (input.title.trim().length < 3) throw new AssemblyError('Ponle un título a la asamblea.');
    if (!['ordinary', 'extraordinary', 'reinforced'].includes(input.sessionType)) throw new AssemblyError('Tipo de sesión no válido.');
    if (!['in_person', 'remote', 'hybrid'].includes(input.modality)) throw new AssemblyError('Modalidad no válida.');
    if (Number.isNaN(new Date(input.scheduledAt).getTime())) throw new AssemblyError('Indica la fecha y hora de la sesión.');
    if (input.videoUrl && !/^https:\/\/\S+$/i.test(input.videoUrl)) throw new AssemblyError('El enlace de la videollamada debe empezar con https://');
    if (input.items.length === 0 || input.items.length > 20) throw new AssemblyError('La tabla debe tener entre 1 y 20 puntos.');
    for (const item of input.items) {
        if (!findMatter(item.matterCode)) throw new AssemblyError('Elige una materia del catálogo para cada punto.');
        if (item.title.trim().length < 3) throw new AssemblyError('Cada punto necesita un título.');
    }
    const errors = checkAgenda({ sessionType: input.sessionType, matterCodes: input.items.map(item => item.matterCode), extraordinaryExpense: input.extraordinaryExpense })
        .filter(alert => alert.level === 'error');
    if (errors.length) throw new AssemblyError(errors.map(alert => alert.message).join(' '), 422);
}

async function validateSecretary(actor: AssemblyActor, profileId: string | null) {
    if (!profileId) return;
    const row = await check(db().from('profiles').select('id, role').eq('id', profileId).eq('community_id', actor.communityId).maybeSingle());
    if (!row || (row as Row).role !== 'resident') throw new AssemblyError('La secretaría debe ser un residente de la comunidad.', 422);
}

function draftColumns(input: AssemblyDraftInput) {
    return {
        title: input.title.trim().slice(0, 160), session_type: input.sessionType, modality: input.modality,
        scheduled_at: new Date(input.scheduledAt).toISOString(), location: input.location.trim().slice(0, 300),
        video_url: input.videoUrl.trim().slice(0, 500), request_received_on: input.requestReceivedOn,
        request_rights_share: input.requestRightsShare, secretary_profile_id: input.secretaryProfileId,
        notary_name: input.notaryName.trim().slice(0, 160),
        notary_required: sessionRequiresNotary(input.sessionType, input.items.map(item => item.matterCode)),
    };
}

async function replaceItems(actor: AssemblyActor, assemblyId: string, items: AssemblyDraftInput['items']) {
    await check(db().from('assembly_agenda_items').delete().eq('assembly_id', assemblyId).eq('community_id', actor.communityId));
    const rows = items.map((item, index) => {
        const matter = findMatter(item.matterCode)!;
        return {
            assembly_id: assemblyId, community_id: actor.communityId, position: index + 1, matter_code: matter.code,
            title: item.title.trim().slice(0, 200), description: item.description.trim().slice(0, 2000),
            quorum_class: matter.quorumClass, requires_notary: matter.requiresNotary,
        };
    });
    await check(db().from('assembly_agenda_items').insert(rows));
}

export async function createAssembly(actor: AssemblyActor, input: AssemblyDraftInput) {
    requireAdmin(actor);
    validateDraft(input);
    await validateSecretary(actor, input.secretaryProfileId);
    const row = await check(db().from('assemblies').insert({ ...draftColumns(input), community_id: actor.communityId, created_by: actor.id }).select('id').single());
    const assemblyId = str((row as Row).id);
    await replaceItems(actor, assemblyId, input.items);
    await recordOperationEvent({
        communityId: actor.communityId, actorId: actor.id, actorRole: 'admin', action: 'assembly.created', entityType: 'assembly',
        entityId: assemblyId, severity: 'info', status: 'pending', summary: `Asamblea ${SESSION_TYPE_LABEL[input.sessionType]} en borrador`,
        metadata: { modality: input.modality, items: input.items.length },
    });
    return getAssemblyView(actor, assemblyId);
}

export async function updateAssemblyDraft(actor: AssemblyActor, assemblyId: string, input: AssemblyDraftInput) {
    requireAdmin(actor);
    const { assembly } = await loadAssembly(actor.communityId, assemblyId);
    requireStatus(assembly, 'draft');
    validateDraft(input);
    await validateSecretary(actor, input.secretaryProfileId);
    await check(db().from('assemblies').update(draftColumns(input)).eq('id', assemblyId).eq('community_id', actor.communityId).eq('status', 'draft'));
    await replaceItems(actor, assemblyId, input.items);
    return getAssemblyView(actor, assemblyId);
}

function citationInputOf(assembly: AssemblyRecord): CitationInput {
    return {
        title: assembly.title, sessionType: assembly.sessionType, modality: assembly.modality, scheduledAt: assembly.scheduledAt,
        location: assembly.location, videoUrl: assembly.videoUrl, notaryRequired: assembly.notaryRequired,
        items: assembly.items.map(item => ({ position: item.position, title: item.title, description: item.description, matterCode: item.matterCode, quorumClass: item.quorumClass })),
    };
}

/** Redacta la citación: introducción con IA (o respaldo) + cuerpo determinista con tabla y quórums. */
export async function draftCitation(actor: AssemblyActor, assemblyId: string) {
    requireAdmin(actor);
    const { assembly } = await loadAssembly(actor.communityId, assemblyId);
    requireStatus(assembly, 'draft');
    const input = citationInputOf(assembly);
    const prose = await writeAssemblyProse({ communityId: actor.communityId, userId: actor.id }, {
        maxTokens: 300,
        system: 'Redactas en español de Chile el párrafo de apertura de una citación a asamblea de copropietarios. Tono cálido y respetuoso: la convivencia construye comunidad. Dos a cuatro oraciones, sin títulos, sin listas, sin montos, sin nombres de personas, sin amenazas ni lenguaje de deudor, sin repetir la tabla ni los quórums (van aparte). No inventes datos.',
        user: `Asamblea: ${assembly.title}\nTipo: ${SESSION_TYPE_LABEL[assembly.sessionType]}\nModalidad: ${assembly.modality}\nPuntos: ${assembly.items.map(item => item.title).join('; ')}`,
    });
    const useAi = prose && acceptableAiProse(prose.text, 900);
    const text = composeCitation(input, useAi ? prose.text : fallbackCitationIntro(input));
    await check(db().from('assemblies').update({ citation_text: text, citation_source: useAi ? 'ai' : 'fallback' })
        .eq('id', assemblyId).eq('community_id', actor.communityId).eq('status', 'draft'));
    return getAssemblyView(actor, assemblyId);
}

async function communityRecipients(communityId: string, roles: string[]) {
    const ids: string[] = [];
    for (let page = 0; page < 20; page += 1) {
        const rows = ((await check(db().from('profiles').select('id').eq('community_id', communityId).in('role', roles).range(page * 1000, page * 1000 + 999))) ?? []) as Row[];
        ids.push(...rows.map(row => str(row.id)));
        if (rows.length < 1000) break;
    }
    return ids;
}

async function notify(communityId: string, kind: string, assemblyId: string, userIds: string[], payload: { title: string; body: string; link: string; type?: string }) {
    const unique = [...new Set(userIds)];
    for (let index = 0; index < unique.length; index += 500) {
        const rows = unique.slice(index, index + 500).map(userId => ({
            id: stableNotificationId('assembly', kind, assemblyId, userId), user_id: userId, community_id: communityId,
            type: payload.type || 'info', category: 'assembly', title: payload.title, body: payload.body, link: payload.link,
        }));
        await check(db().from('notifications').upsert(rows, { onConflict: 'id', ignoreDuplicates: true }));
    }
    return unique.length;
}

/** Publica la citación en la app. Exige la ventana de 5 a 15 días (art. 16). */
export async function publishCitation(actor: AssemblyActor, assemblyId: string, text?: string) {
    requireAdmin(actor);
    const { assembly } = await loadAssembly(actor.communityId, assemblyId);
    requireStatus(assembly, 'draft');
    const today = todayChile();
    const sessionOn = chileDateOf(assembly.scheduledAt);
    const window = checkCitationWindow(today, sessionOn);
    if (!window.valid) throw new AssemblyError(window.message, 422);
    if (assembly.modality !== 'in_person' && !assembly.videoUrl) throw new AssemblyError('Agrega el enlace de la videollamada antes de publicar (DS 7, art. 16).', 422);
    const errors = checkAgenda({ sessionType: assembly.sessionType, matterCodes: assembly.items.map(item => item.matterCode) }).filter(alert => alert.level === 'error');
    if (errors.length) throw new AssemblyError(errors.map(alert => alert.message).join(' '), 422);
    const edited = typeof text === 'string' && text.trim().length > 0;
    let citation = edited ? text.trim().slice(0, 12000) : assembly.citationText;
    if (!citation) citation = composeCitation(citationInputOf(assembly), fallbackCitationIntro(citationInputOf(assembly)));
    // La tabla con quórums debe ir siempre, aunque el admin haya editado el texto.
    if (!citation.includes('### Tabla')) citation = `${citation}\n\n${citationBody(citationInputOf(assembly))}`;
    const updated = await check(db().from('assemblies').update({
        status: 'cited', citation_text: citation, cited_at: nowIso(), citation_date: today,
        citation_source: edited && citation !== assembly.citationText ? 'manual' : (assembly.citationSource || 'fallback'),
    }).eq('id', assemblyId).eq('community_id', actor.communityId).eq('status', 'draft').select('id'));
    if (!((updated ?? []) as Row[]).length) throw new AssemblyError('La asamblea cambió mientras la publicabas. Recarga.', 409);
    const recipients = await communityRecipients(actor.communityId, ['resident', 'admin']);
    const notified = await notify(actor.communityId, 'cited', assemblyId, recipients.filter(id => id !== actor.id), {
        title: `Citación: ${assembly.title}`,
        body: `Asamblea ${SESSION_TYPE_LABEL[assembly.sessionType]} el ${sessionOn}. Revisa la tabla y confirma tu asistencia.`,
        link: RESIDENT_LINK,
    });
    const request = assembly.requestReceivedOn && assembly.requestRightsShare !== null
        ? checkOwnerRequest(assembly.requestReceivedOn, assembly.requestRightsShare, today, today) : null;
    await recordOperationEvent({
        communityId: actor.communityId, actorId: actor.id, actorRole: 'admin', action: 'assembly.cited', entityType: 'assembly',
        entityId: assemblyId, severity: request?.overdue ? 'warning' : 'info', status: 'success',
        summary: `Citación publicada con ${window.daysInAdvance} días de anticipación`,
        metadata: { notified, channel: 'in_app', ownerRequestOverdue: request?.overdue ?? null },
    });
    return { view: await getAssemblyView(actor, assemblyId), notified };
}

export async function cancelAssembly(actor: AssemblyActor, assemblyId: string) {
    requireAdmin(actor);
    const { assembly } = await loadAssembly(actor.communityId, assemblyId);
    requireStatus(assembly, 'draft', 'cited');
    await check(db().from('assemblies').update({ status: 'cancelled' }).eq('id', assemblyId).eq('community_id', actor.communityId).eq('status', assembly.status));
    if (assembly.status === 'cited') {
        const recipients = await communityRecipients(actor.communityId, ['resident', 'admin']);
        await notify(actor.communityId, 'cancelled', assemblyId, recipients.filter(id => id !== actor.id), {
            title: `Asamblea suspendida: ${assembly.title}`, body: 'La sesión citada no se realizará en la fecha indicada. Administración informará la nueva citación.', link: RESIDENT_LINK, type: 'warning',
        });
    }
    return getAssemblyView(actor, assemblyId);
}

// ---------------------------------------------------------------------------
// Asistencia y poderes
// ---------------------------------------------------------------------------

async function loadProxies(assemblyId: string, units: UnitRow[]) {
    const labels = new Map(units.map(unit => [unit.id, unit.label]));
    return (((await check(db().from('assembly_proxies').select(PROXY_COLUMNS).eq('assembly_id', assemblyId))) ?? []) as Row[]).map(row => mapProxy(row, labels));
}

/** El residente confirma asistencia (antes o durante la sesión) por una unidad que puede representar. */
export async function rsvp(actor: AssemblyActor, assemblyId: string, unitId: string, mode: AttendanceMode, attending: boolean) {
    const { row, assembly } = await loadAssembly(actor.communityId, assemblyId);
    requireStatus(assembly, 'cited', 'in_progress');
    if (mode === 'remote' && assembly.modality === 'in_person') throw new AssemblyError('Esta sesión es solo presencial.', 422);
    if (mode === 'in_person' && assembly.modality === 'remote') throw new AssemblyError('Esta sesión es solo telemática.', 422);
    const { rights, units } = await rightsFor(row, actor.communityId);
    const proxies = await loadProxies(assemblyId, units);
    const unit = representableUnits(actor, units, proxies).find(candidate => candidate.unitId === unitId);
    if (!unit) throw new AssemblyError('No puedes representar a esa unidad.', 403);
    const existing = await check(db().from('assembly_attendance').select('id, status, attendee_profile_id').eq('assembly_id', assemblyId).eq('unit_id', unitId).maybeSingle()) as Row | null;
    if (!attending) {
        if (existing && str(existing.status) === 'confirmed' && str(existing.attendee_profile_id) === actor.id) {
            await check(db().from('assembly_attendance').delete().eq('id', str(existing.id)));
        }
        return getAssemblyView(actor, assemblyId);
    }
    if (existing && str(existing.status) === 'present') throw new AssemblyError('Esa unidad ya está acreditada en la sesión.', 409);
    if (existing && str(existing.attendee_profile_id) && str(existing.attendee_profile_id) !== actor.id && unit.capacity === 'occupant') {
        throw new AssemblyError('El copropietario o su representante ya confirmó por esa unidad (DS 7, art. 12).', 409);
    }
    const profile = await check(db().from('profiles').select('name').eq('id', actor.id).maybeSingle()) as Row | null;
    const weight = rights.units.find(candidate => candidate.unitId === unitId)?.weight ?? 0;
    await check(db().from('assembly_attendance').upsert({
        assembly_id: assemblyId, community_id: actor.communityId, unit_id: unitId, unit_label: unit.label, weight,
        attendee_profile_id: actor.id, attendee_name: str(profile?.name).slice(0, 160), capacity: unit.capacity,
        proxy_id: unit.proxyId, mode, status: 'confirmed', rsvp_at: nowIso(),
    }, { onConflict: 'assembly_id,unit_id' }));
    return getAssemblyView(actor, assemblyId);
}

export interface CheckInInput {
    unitId: string;
    capacity: AttendanceCapacity;
    attendeeProfileId: string | null;
    attendeeName: string;
    proxyId: string | null;
    mode: AttendanceMode;
    verified: boolean;
}

/** Acreditación en la sesión por administración o secretaría (con o sin confirmación previa). */
export async function checkIn(actor: AssemblyActor, assemblyId: string, input: CheckInInput) {
    const { row, assembly } = await loadAssembly(actor.communityId, assemblyId);
    requireVerifier(actor, assembly);
    requireStatus(assembly, 'in_progress');
    const { rights, units } = await rightsFor(row, actor.communityId);
    const unit = units.find(candidate => candidate.id === input.unitId);
    if (!unit) throw new AssemblyError('Unidad no encontrada en la comunidad.', 404);
    const proxies = await loadProxies(assemblyId, units);
    let representativeIsAdmin = false;
    if (input.attendeeProfileId) {
        const person = await check(db().from('profiles').select('role, community_id').eq('id', input.attendeeProfileId).maybeSingle()) as Row | null;
        if (!person || str(person.community_id) !== actor.communityId) throw new AssemblyError('La persona no pertenece a la comunidad.', 422);
        representativeIsAdmin = str(person.role) === 'admin';
        if (input.capacity === 'owner' && unit.ownerId && unit.ownerId !== input.attendeeProfileId) {
            throw new AssemblyError('Esa persona no es la titular registrada de la unidad. Acredítala con poder o como ocupante.', 422);
        }
    }
    const proxy = input.proxyId ? proxies.find(candidate => candidate.id === input.proxyId && candidate.unitId === unit.id && candidate.kind === 'proxy' && candidate.status === 'accepted') : null;
    const existing = await check(db().from('assembly_attendance').select('id, status, capacity').eq('assembly_id', assemblyId).eq('unit_id', unit.id).maybeSingle()) as Row | null;
    const representation = checkRepresentation({
        capacity: input.capacity,
        representativeIsAdmin,
        hasAcceptedProxy: Boolean(proxy),
        occupantOptedOut: proxies.some(candidate => candidate.unitId === unit.id && candidate.kind === 'occupant_opt_out' && candidate.status === 'accepted'),
        ownerOrOtherProxyPresent: Boolean(existing && str(existing.status) === 'present' && str(existing.capacity) !== 'occupant'),
    });
    if (!representation.allowed) throw new AssemblyError(representation.reason, 422);
    if (input.mode === 'remote' && assembly.modality === 'in_person') throw new AssemblyError('Esta sesión es solo presencial.', 422);
    if (input.mode === 'in_person' && assembly.modality === 'remote') throw new AssemblyError('Esta sesión es solo telemática.', 422);
    const now = nowIso();
    await check(db().from('assembly_attendance').upsert({
        assembly_id: assemblyId, community_id: actor.communityId, unit_id: unit.id, unit_label: unit.label,
        weight: rights.units.find(candidate => candidate.unitId === unit.id)?.weight ?? 0,
        attendee_profile_id: input.attendeeProfileId, attendee_name: input.attendeeName.trim().slice(0, 160), capacity: input.capacity,
        proxy_id: proxy ? proxy.id : null, mode: input.mode, status: 'present', checked_in_at: now,
        identity_verified_at: input.verified ? now : null, identity_verified_by: input.verified ? actor.id : null, left_at: null,
    }, { onConflict: 'assembly_id,unit_id' }));
    return getAssemblyView(actor, assemblyId);
}

/** Marca la identidad verificada (en línea: imagen y voz simultáneas, DS 7 art. 16 N°3). */
export async function verifyAttendance(actor: AssemblyActor, assemblyId: string, attendanceId: string) {
    const { assembly } = await loadAssembly(actor.communityId, assemblyId);
    requireVerifier(actor, assembly);
    requireStatus(assembly, 'in_progress');
    const now = nowIso();
    const updated = await check(db().from('assembly_attendance').update({ status: 'present', checked_in_at: now, identity_verified_at: now, identity_verified_by: actor.id, left_at: null })
        .eq('id', attendanceId).eq('assembly_id', assemblyId).eq('community_id', actor.communityId).select('id'));
    if (!((updated ?? []) as Row[]).length) throw new AssemblyError('Asistencia no encontrada.', 404);
    return getAssemblyView(actor, assemblyId);
}

export async function markLeft(actor: AssemblyActor, assemblyId: string, attendanceId: string) {
    const { assembly } = await loadAssembly(actor.communityId, assemblyId);
    requireVerifier(actor, assembly);
    requireStatus(assembly, 'in_progress');
    await check(db().from('assembly_attendance').update({ status: 'left', left_at: nowIso() })
        .eq('id', attendanceId).eq('assembly_id', assemblyId).eq('community_id', actor.communityId));
    return getAssemblyView(actor, assemblyId);
}

export interface ProxyInput {
    unitId: string;
    kind: ProxyKind;
    proxyProfileId: string | null;
    proxyName: string;
    coversReinforced: boolean;
    documentNote: string;
}

/** Registra un poder. El del residente queda pendiente; el que carga el admin queda aceptado (revisó el documento). */
export async function registerProxy(actor: AssemblyActor, assemblyId: string, input: ProxyInput) {
    const { assembly } = await loadAssembly(actor.communityId, assemblyId);
    requireStatus(assembly, ...(actor.role === 'admin' ? ['draft', 'cited', 'in_progress'] as const : ['cited', 'in_progress'] as const));
    const units = await loadUnits(actor.communityId);
    const unit = units.find(candidate => candidate.id === input.unitId);
    if (!unit) throw new AssemblyError('Unidad no encontrada.', 404);
    if (actor.role !== 'admin' && unit.ownerId !== actor.id) throw new AssemblyError('Solo el titular registrado de la unidad puede otorgar un poder en la app.', 403);
    if (!['proxy', 'occupant_authorization', 'occupant_opt_out'].includes(input.kind)) throw new AssemblyError('Tipo de poder no válido.');
    if (input.proxyProfileId) {
        const person = await check(db().from('profiles').select('role, community_id').eq('id', input.proxyProfileId).maybeSingle()) as Row | null;
        if (!person || str(person.community_id) !== actor.communityId) throw new AssemblyError('El apoderado debe ser parte de la comunidad o indicarse por nombre.', 422);
        if (str(person.role) === 'admin') throw new AssemblyError('El administrador no puede representar a ningún copropietario (Ley 21.442, art. 15).', 422);
        if (input.proxyProfileId === actor.id && actor.role !== 'admin') throw new AssemblyError('No puedes darte un poder a ti mismo.', 422);
    }
    if (input.kind !== 'occupant_opt_out' && !input.proxyProfileId && input.proxyName.trim().length < 3) throw new AssemblyError('Indica quién te representará.', 422);
    const accepted = actor.role === 'admin';
    if (accepted) {
        await check(db().from('assembly_proxies').update({ status: 'revoked' }).eq('assembly_id', assemblyId).eq('unit_id', unit.id).eq('kind', input.kind).eq('status', 'accepted'));
    }
    await check(db().from('assembly_proxies').insert({
        assembly_id: assemblyId, community_id: actor.communityId, unit_id: unit.id, kind: input.kind,
        grantor_profile_id: unit.ownerId, proxy_profile_id: input.kind === 'occupant_opt_out' ? null : input.proxyProfileId,
        proxy_name: input.proxyName.trim().slice(0, 160), covers_reinforced: input.kind === 'occupant_authorization' ? true : input.coversReinforced,
        document_note: input.documentNote.trim().slice(0, 500), status: accepted ? 'accepted' : 'pending',
        reviewed_by: accepted ? actor.id : null, reviewed_at: accepted ? nowIso() : null, created_by: actor.id,
    }));
    if (!accepted) {
        const admins = await communityRecipients(actor.communityId, ['admin']);
        await notify(actor.communityId, `proxy-${unit.id}-${Date.now()}`, assemblyId, admins, {
            title: 'Poder por revisar', body: `Hay un poder nuevo para "${assembly.title}". Revísalo antes de la sesión.`, link: `${ADMIN_LINK}?id=${assemblyId}`,
        });
    }
    return getAssemblyView(actor, assemblyId);
}

export async function reviewProxy(actor: AssemblyActor, assemblyId: string, proxyId: string, decision: 'accept' | 'reject' | 'revoke') {
    const { assembly } = await loadAssembly(actor.communityId, assemblyId);
    const proxy = await check(db().from('assembly_proxies').select('id, unit_id, kind, status, grantor_profile_id').eq('id', proxyId).eq('assembly_id', assemblyId).maybeSingle()) as Row | null;
    if (!proxy) throw new AssemblyError('Poder no encontrado.', 404);
    const isGrantor = str(proxy.grantor_profile_id) === actor.id;
    if (decision === 'revoke' ? !(actor.role === 'admin' || isGrantor) : actor.role !== 'admin') throw new AssemblyError('No puedes cambiar este poder.', 403);
    requireStatus(assembly, 'draft', 'cited', 'in_progress');
    if (decision === 'accept') {
        await check(db().from('assembly_proxies').update({ status: 'revoked' }).eq('assembly_id', assemblyId).eq('unit_id', str(proxy.unit_id)).eq('kind', str(proxy.kind)).eq('status', 'accepted').neq('id', proxyId));
    }
    const status = decision === 'accept' ? 'accepted' : decision === 'reject' ? 'rejected' : 'revoked';
    await check(db().from('assembly_proxies').update({ status, reviewed_by: actor.id, reviewed_at: nowIso() }).eq('id', proxyId).eq('assembly_id', assemblyId));
    return getAssemblyView(actor, assemblyId);
}

// ---------------------------------------------------------------------------
// Sesión en vivo y votación
// ---------------------------------------------------------------------------

export async function startSession(actor: AssemblyActor, assemblyId: string) {
    requireAdmin(actor);
    const { assembly } = await loadAssembly(actor.communityId, assemblyId);
    requireStatus(assembly, 'cited');
    if (todayChile() < chileDateOf(assembly.scheduledAt)) throw new AssemblyError('La sesión se inicia el día citado.', 422);
    const rights = computeRights(await loadUnits(actor.communityId));
    if (rights.units.length === 0) throw new AssemblyError('La comunidad no tiene unidades registradas.', 422);
    const updated = await check(db().from('assemblies').update({
        status: 'in_progress', started_at: nowIso(), rights_method: rights.method, rights_snapshot: rights, rights_total: rights.total,
    }).eq('id', assemblyId).eq('community_id', actor.communityId).eq('status', 'cited').select('id'));
    if (!((updated ?? []) as Row[]).length) throw new AssemblyError('La asamblea cambió de estado. Recarga.', 409);
    // Las confirmaciones previas toman los derechos de la foto inicial.
    for (const unit of rights.units) {
        await check(db().from('assembly_attendance').update({ weight: unit.weight }).eq('assembly_id', assemblyId).eq('unit_id', unit.unitId));
    }
    await recordOperationEvent({
        communityId: actor.communityId, actorId: actor.id, actorRole: 'admin', action: 'assembly.started', entityType: 'assembly',
        entityId: assemblyId, severity: rights.method === 'equal' ? 'warning' : 'info', status: 'success',
        summary: 'Sesión iniciada', metadata: { rightsMethod: rights.method, units: rights.units.length },
    });
    return getAssemblyView(actor, assemblyId);
}

async function loadItem(assemblyId: string, itemId: string) {
    const row = await check(db().from('assembly_agenda_items').select(ITEM_COLUMNS).eq('id', itemId).eq('assembly_id', assemblyId).maybeSingle()) as Row | null;
    if (!row) throw new AssemblyError('Punto de la tabla no encontrado.', 404);
    return mapItem(row);
}

export async function openVote(actor: AssemblyActor, assemblyId: string, itemId: string) {
    requireAdmin(actor);
    const { assembly } = await loadAssembly(actor.communityId, assemblyId);
    requireStatus(assembly, 'in_progress');
    if (assembly.items.some(item => item.votingStatus === 'open' && item.id !== itemId)) throw new AssemblyError('Cierra la votación abierta antes de abrir otra.', 409);
    const item = await loadItem(assemblyId, itemId);
    if (item.votingStatus !== 'pending') throw new AssemblyError('Este punto ya se votó.', 409);
    if (!(await loadCurrentCertificate(assemblyId))) {
        throw new AssemblyError('Antes de abrir la votación, emite el certificado de habilidad (Ley 21.442, art. 15; DS 7, art. 14).', 422);
    }
    await check(db().from('assembly_agenda_items').update({ voting_status: 'open', opened_at: nowIso() }).eq('id', itemId).eq('voting_status', 'pending'));
    return getAssemblyView(actor, assemblyId);
}

async function hasOccupantAuthorization(assemblyId: string, unitId: string) {
    const rows = ((await check(db().from('assembly_proxies').select('id').eq('assembly_id', assemblyId).eq('unit_id', unitId)
        .eq('kind', 'occupant_authorization').eq('status', 'accepted'))) ?? []) as Row[];
    return rows.length > 0;
}

async function writeVote(actor: AssemblyActor, assemblyId: string, itemId: string, unitId: string, choice: VoteChoice, recordedByStaff: boolean) {
    if (!['yes', 'no', 'abstain'].includes(choice)) throw new AssemblyError('Opción de voto no válida.');
    const { assembly } = await loadAssembly(actor.communityId, assemblyId);
    requireStatus(assembly, 'in_progress');
    const item = await loadItem(assemblyId, itemId);
    if (item.votingStatus !== 'open') throw new AssemblyError('La votación de este punto no está abierta.', 409);
    const attendance = await check(db().from('assembly_attendance').select(ATTENDANCE_COLUMNS).eq('assembly_id', assemblyId).eq('unit_id', unitId).maybeSingle()) as Row | null;
    if (!attendance) throw new AssemblyError('La unidad no está acreditada en la sesión.', 422);
    const row = mapAttendance(attendance);
    if (row.status !== 'present' || !row.identityVerifiedAt) throw new AssemblyError('Primero hay que acreditar la asistencia de la unidad (imagen y voz si es en línea).', 422);
    if (!recordedByStaff && row.attendeeProfileId !== actor.id) throw new AssemblyError('Solo vota quien está acreditado por esa unidad.', 403);
    // Solo votan las unidades habilitadas en el certificado (Ley 21.442, art. 15). Quien
    // representa a la unidad (poder u ocupante) vota con la habilidad de ella.
    const current = await loadCurrentCertificate(assemblyId);
    if (!current) throw new AssemblyError('La votación necesita el certificado de habilidad emitido.', 422);
    if (!current.eligibleUnitIds.has(unitId)) throw new AssemblyError(recordedByStaff ? VOTE_NOT_RECORDED.staff : VOTE_NOT_RECORDED.self, 422);
    if (row.capacity === 'occupant' && !occupantMayVote(item.quorumClass, await hasOccupantAuthorization(assemblyId, unitId))) {
        throw new AssemblyError('En materias de mayoría reforzada el arrendatario u ocupante necesita autorización expresa del copropietario (DS 7, art. 12).', 422);
    }
    const now = nowIso();
    // En línea, el voto se valida al identificar a la persona con imagen y voz (DS 7 art. 16 N°3):
    // si lo registra la secretaría, ya la vio; si lo emite la persona, queda pendiente de verificación.
    const verified = row.mode === 'remote' && recordedByStaff;
    await check(db().from('assembly_votes').upsert({
        assembly_id: assemblyId, agenda_item_id: itemId, community_id: actor.communityId, unit_id: unitId, attendance_id: row.id,
        choice, weight: row.weight, mode: row.mode, cast_by_profile_id: recordedByStaff ? row.attendeeProfileId : actor.id,
        recorded_by_profile_id: recordedByStaff ? actor.id : null,
        identity_verified_at: verified ? now : null, identity_verified_by: verified ? actor.id : null,
    }, { onConflict: 'agenda_item_id,unit_id' }));
    return getAssemblyView(actor, assemblyId);
}

export async function castVote(actor: AssemblyActor, assemblyId: string, itemId: string, unitId: string, choice: VoteChoice) {
    return writeVote(actor, assemblyId, itemId, unitId, choice, false);
}

export async function recordVote(actor: AssemblyActor, assemblyId: string, itemId: string, unitId: string, choice: VoteChoice) {
    const { assembly } = await loadAssembly(actor.communityId, assemblyId);
    requireVerifier(actor, assembly);
    return writeVote(actor, assemblyId, itemId, unitId, choice, true);
}

export async function verifyVote(actor: AssemblyActor, assemblyId: string, voteId: string) {
    const { assembly } = await loadAssembly(actor.communityId, assemblyId);
    requireVerifier(actor, assembly);
    requireStatus(assembly, 'in_progress');
    const updated = await check(db().from('assembly_votes').update({ identity_verified_at: nowIso(), identity_verified_by: actor.id })
        .eq('id', voteId).eq('assembly_id', assemblyId).eq('community_id', actor.communityId).select('id'));
    if (!((updated ?? []) as Row[]).length) throw new AssemblyError('Voto no encontrado o votación cerrada.', 404);
    return getAssemblyView(actor, assemblyId);
}

/** Cierra la votación de un punto y guarda el resultado con la regla aplicada. */
export async function closeVote(actor: AssemblyActor, assemblyId: string, itemId: string, force: boolean, notes: string) {
    requireAdmin(actor);
    const { row, assembly } = await loadAssembly(actor.communityId, assemblyId);
    requireStatus(assembly, 'in_progress');
    const item = await loadItem(assemblyId, itemId);
    if (item.votingStatus !== 'open') throw new AssemblyError('La votación de este punto no está abierta.', 409);
    const { rights } = await rightsFor(row, actor.communityId);
    const attendance = (((await check(db().from('assembly_attendance').select(ATTENDANCE_COLUMNS).eq('assembly_id', assemblyId))) ?? []) as Row[]).map(mapAttendance);
    const byId = new Map(attendance.map(entry => [entry.id, entry]));
    const votes = (((await check(db().from('assembly_votes').select(VOTE_COLUMNS).eq('agenda_item_id', itemId))) ?? []) as Row[]).map(mapVote);
    const present = attendance.filter(entry => entry.status === 'present' && entry.identityVerifiedAt);
    const presentWeight = present.reduce((sum, entry) => sum + entry.weight, 0);
    const current = await loadCurrentCertificate(assemblyId);
    if (!current) throw new AssemblyError('Falta el certificado de habilidad de esta sesión.', 422);
    const weighted = votes.map(vote => {
        const entry = byId.get(vote.attendanceId);
        return {
            choice: vote.choice, weight: vote.weight,
            counts: Boolean(entry) && voteCounts({
                attendanceVerified: Boolean(entry?.identityVerifiedAt), attendancePresent: entry?.status === 'present',
                mode: vote.mode, voteVerified: Boolean(vote.identityVerifiedAt), unitEligible: current.eligibleUnitIds.has(vote.unitId),
            }),
        };
    });
    const pending = votes.filter(vote => vote.mode === 'remote' && !vote.identityVerifiedAt).length;
    if (pending > 0 && !force) {
        throw new AssemblyError(`Hay ${pending} voto(s) en línea sin verificar imagen y voz. Si cierras ahora no se contarán (DS 7, art. 16).`, 409);
    }
    const result = evaluateAgendaItem({
        sessionType: assembly.sessionType, matterClass: item.quorumClass, tally: tallyVotes(weighted, presentWeight, rights.total), pendingVerification: pending,
        eligiblePresent: eligiblePresentWeight(present, current.eligibleUnitIds),
    });
    const updated = await check(db().from('assembly_agenda_items').update({
        voting_status: 'closed', closed_at: nowIso(), outcome: result.outcome, result, notes: notes.trim().slice(0, 2000) || item.notes,
    }).eq('id', itemId).eq('voting_status', 'open').select('id'));
    if (!((updated ?? []) as Row[]).length) throw new AssemblyError('La votación ya se cerró.', 409);
    await recordOperationEvent({
        communityId: actor.communityId, actorId: actor.id, actorRole: 'admin', action: 'assembly.vote_closed', entityType: 'assembly_agenda_item',
        entityId: itemId, severity: 'info', status: 'success', summary: `Punto ${item.position}: ${result.outcome}`,
        metadata: { assemblyId, quorumClass: item.quorumClass, presentOfTotal: result.percentages.presentOfTotal, pendingNotCounted: pending },
    });
    return getAssemblyView(actor, assemblyId);
}

// ---------------------------------------------------------------------------
// Cierre y acta
// ---------------------------------------------------------------------------

async function buildMinutes(actor: AssemblyActor, assemblyId: string) {
    const { row, assembly } = await loadAssembly(actor.communityId, assemblyId);
    const { rights } = await rightsFor(row, actor.communityId);
    const attendance = (((await check(db().from('assembly_attendance').select(ATTENDANCE_COLUMNS).eq('assembly_id', assemblyId))) ?? []) as Row[]).map(mapAttendance);
    const dueOn = minutesDeadline(chileDateOf(assembly.scheduledAt), todayChile()).dueOn;
    const current = await loadCurrentCertificate(assemblyId);
    const quorum = liveQuorum(assembly.sessionType, rights, attendance, current);
    const input = {
        title: assembly.title, sessionType: assembly.sessionType, modality: assembly.modality, scheduledAt: assembly.scheduledAt,
        startedAt: assembly.startedAt, closedAt: assembly.closedAt, location: assembly.location, rights, attendance,
        items: assembly.items, notaryRequired: assembly.notaryRequired, notaryName: assembly.notaryName, dueOn,
        // Solo totales del certificado y si se constituyó: nunca qué unidades no estaban habilitadas.
        eligibility: current?.certificate ?? null, constitutionMet: current ? quorum.constitutionMet : null,
    };
    const prose = await writeAssemblyProse({ communityId: actor.communityId, userId: actor.id }, {
        maxTokens: 700,
        system: 'Redactas en español de Chile la sección "Desarrollo de la sesión" de un acta de asamblea de copropietarios, a partir de datos estructurados. Un párrafo breve por punto, en orden, diciendo qué se trató y si se aprobó, no se aprobó o no hubo quórum. No inventes cifras, nombres ni montos; no menciones unidades ni personas; sin títulos ni listas; sin lenguaje de deudor.',
        user: JSON.stringify({
            asamblea: assembly.title, tipo: SESSION_TYPE_LABEL[assembly.sessionType],
            puntos: assembly.items.map(item => ({ n: item.position, titulo: item.title, descripcion: item.description, resultado: item.outcome ?? 'no votado', observaciones: item.notes })),
        }),
    });
    const useAi = prose && acceptableAiProse(prose.text, 4000);
    return { content: composeMinutes(input, useAi ? prose.text : fallbackMinutesNarrative(input)), source: useAi ? 'ai' as const : 'fallback' as const, dueOn };
}

export async function closeSession(actor: AssemblyActor, assemblyId: string) {
    requireAdmin(actor);
    const { assembly } = await loadAssembly(actor.communityId, assemblyId);
    requireStatus(assembly, 'in_progress');
    if (assembly.items.some(item => item.votingStatus === 'open')) throw new AssemblyError('Cierra la votación abierta antes de terminar la sesión.', 409);
    const updated = await check(db().from('assemblies').update({ status: 'closed', closed_at: nowIso() })
        .eq('id', assemblyId).eq('community_id', actor.communityId).eq('status', 'in_progress').select('id'));
    if (!((updated ?? []) as Row[]).length) throw new AssemblyError('La asamblea cambió de estado. Recarga.', 409);
    const minutes = await buildMinutes(actor, assemblyId);
    await check(db().from('assembly_minutes').upsert({
        assembly_id: assemblyId, community_id: actor.communityId, content: minutes.content, generated_content: minutes.content,
        source: minutes.source, due_on: minutes.dueOn,
    }, { onConflict: 'assembly_id', ignoreDuplicates: true }));
    const committee = await activeCommitteeMembers(actor.communityId).catch(() => []);
    await notify(actor.communityId, 'minutes-draft', assemblyId, committee.map(member => member.id), {
        title: `Borrador de acta: ${assembly.title}`, body: `El acta se firma a más tardar el ${minutes.dueOn}. Revísala en la app.`, link: RESIDENT_LINK,
    });
    await recordOperationEvent({
        communityId: actor.communityId, actorId: actor.id, actorRole: 'admin', action: 'assembly.closed', entityType: 'assembly',
        entityId: assemblyId, severity: 'info', status: 'success', summary: 'Sesión cerrada y borrador de acta generado',
        metadata: { minutesSource: minutes.source, dueOn: minutes.dueOn },
    });
    return getAssemblyView(actor, assemblyId);
}

export async function regenerateMinutes(actor: AssemblyActor, assemblyId: string) {
    requireAdmin(actor);
    const { assembly } = await loadAssembly(actor.communityId, assemblyId);
    requireStatus(assembly, 'closed');
    const minutes = await buildMinutes(actor, assemblyId);
    await check(db().from('assembly_minutes').update({ content: minutes.content, generated_content: minutes.content, source: minutes.source, edited_at: null, edited_by: null })
        .eq('assembly_id', assemblyId).eq('community_id', actor.communityId).eq('status', 'draft'));
    return getAssemblyView(actor, assemblyId);
}

export async function saveMinutes(actor: AssemblyActor, assemblyId: string, content: string) {
    requireAdmin(actor);
    const { assembly } = await loadAssembly(actor.communityId, assemblyId);
    requireStatus(assembly, 'closed');
    const text = content.trim();
    if (text.length < 20) throw new AssemblyError('El acta está vacía.', 422);
    await check(db().from('assembly_minutes').update({ content: text.slice(0, 40000), edited_by: actor.id, edited_at: nowIso() })
        .eq('assembly_id', assemblyId).eq('community_id', actor.communityId).eq('status', 'draft'));
    return getAssemblyView(actor, assemblyId);
}

/** El admin registra que el acta quedó firmada (por todo el comité o quienes designó la asamblea). */
export async function signMinutes(actor: AssemblyActor, assemblyId: string, signers: string, content?: string) {
    requireAdmin(actor);
    const { assembly } = await loadAssembly(actor.communityId, assemblyId);
    requireStatus(assembly, 'closed');
    if (signers.trim().length < 3) throw new AssemblyError('Indica quiénes firmaron el acta.', 422);
    const patch: Record<string, unknown> = { status: 'signed', signers: signers.trim().slice(0, 1000), signed_at: nowIso(), signed_by: actor.id };
    if (content && content.trim().length >= 20) Object.assign(patch, { content: content.trim().slice(0, 40000), edited_by: actor.id, edited_at: nowIso() });
    const updated = await check(db().from('assembly_minutes').update(patch).eq('assembly_id', assemblyId).eq('community_id', actor.communityId).eq('status', 'draft').select('id'));
    if (!((updated ?? []) as Row[]).length) throw new AssemblyError('No hay un borrador de acta para firmar.', 409);
    await check(db().from('assemblies').update({ status: 'minutes_signed' }).eq('id', assemblyId).eq('community_id', actor.communityId).eq('status', 'closed'));
    const recipients = await communityRecipients(actor.communityId, ['resident', 'admin']);
    await notify(actor.communityId, 'minutes-signed', assemblyId, recipients.filter(id => id !== actor.id), {
        title: `Acta disponible: ${assembly.title}`, body: 'Ya puedes leer el acta firmada con los acuerdos de la asamblea.', link: RESIDENT_LINK, type: 'success',
    });
    await recordOperationEvent({
        communityId: actor.communityId, actorId: actor.id, actorRole: 'admin', action: 'assembly.minutes_signed', entityType: 'assembly',
        entityId: assemblyId, severity: 'info', status: 'success', summary: 'Acta firmada', metadata: { channel: 'in_app' },
    });
    return getAssemblyView(actor, assemblyId);
}

// ---------------------------------------------------------------------------
// Copropietarios hábiles
// ---------------------------------------------------------------------------

/**
 * El administrador emite el certificado de habilidad (Ley 21.442, art. 15; DS 7,
 * art. 14) con fecha de corte = hoy, en la sesión y antes de abrir la primera
 * votación. Se puede volver a emitir (reemplaza al anterior) mientras no se haya
 * abierto ninguna votación: así, quien se puso al día o firmó un convenio a última
 * hora queda habilitado. Guarda los totales y, aparte y solo para admin, el
 * detalle por unidad como respaldo legal.
 */
export async function issueEligibilityCertificate(actor: AssemblyActor, assemblyId: string) {
    requireAdmin(actor);
    const { row, assembly } = await loadAssembly(actor.communityId, assemblyId);
    requireStatus(assembly, 'in_progress');
    if (assembly.items.some(item => item.votingStatus !== 'pending')) {
        throw new AssemblyError('El certificado de habilidad se emite antes de abrir la primera votación.', 409);
    }
    const { rights, units } = await rightsFor(row, actor.communityId);
    const owners = new Map(units.map(unit => [unit.id, unit.ownerId]));
    const cutoffDate = todayChile();
    const result = await evaluateEligibility(actor.communityId, rights.units.map(unit => ({ unitId: unit.unitId, ownerId: owners.get(unit.unitId) ?? null, weight: unit.weight })), cutoffDate);
    const profile = await check(db().from('profiles').select('name').eq('id', actor.id).maybeSingle()) as Row | null;
    const certificate = await insertCertificate({
        assemblyId, communityId: actor.communityId, issuedBy: actor.id, issuedByName: str(profile?.name) || 'Administración',
        rightsMethod: rights.method, result,
    });
    await recordOperationEvent({
        communityId: actor.communityId, actorId: actor.id, actorRole: 'admin', action: 'assembly.eligibility_certified', entityType: 'assembly',
        entityId: assemblyId, severity: 'info', status: 'success', summary: 'Certificado de habilidad emitido',
        // Solo totales: el detalle queda en assembly_eligibility_units (RLS solo admin).
        metadata: { certificateId: certificate.id, cutoffDate, eligibleUnits: certificate.eligibleUnits, totalUnits: certificate.totalUnits, eligibleShare: certificate.eligibleShare },
    });
    return getAssemblyView(actor, assemblyId);
}

/**
 * La unidad pide conversar un convenio desde la asamblea. Llega solo a
 * administración, en la app; es idempotente por asamblea y unidad.
 */
export async function requestAgreementConversation(actor: AssemblyActor, assemblyId: string, unitId: string) {
    const { assembly } = await loadAssembly(actor.communityId, assemblyId);
    requireStatus(assembly, 'cited', 'in_progress');
    const units = await loadUnits(actor.communityId);
    const proxies = await loadProxies(assemblyId, units);
    const unit = representableUnits(actor, units, proxies).find(candidate => candidate.unitId === unitId);
    if (!unit) throw new AssemblyError('No puedes hacer esta solicitud por esa unidad.', 403);
    const admins = await communityRecipients(actor.communityId, ['admin']);
    const copy = agreementRequestAdminCopy(unit.label, assembly.title);
    await notify(actor.communityId, `agreement-request-${unitId}`, assemblyId, admins, { ...copy, type: 'info' });
    await recordOperationEvent({
        communityId: actor.communityId, actorId: actor.id, actorRole: actor.role, action: 'assembly.agreement_requested', entityType: 'assembly',
        entityId: assemblyId, severity: 'info', status: 'success', summary: 'Solicitud de conversar un convenio', metadata: { unitId, channel: 'in_app' },
    });
    return { view: await getAssemblyView(actor, assemblyId), message: AGREEMENT_REQUEST_SENT };
}
