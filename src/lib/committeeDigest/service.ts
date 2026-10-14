import { addDaysISO } from '@/lib/agent-center/chileDate';
import { AGENT_PLAYBOOKS, DEFAULT_AGENT_POLICIES } from '@/lib/agent-center/domain';
import { stableNotificationId } from '@/lib/agent-center/utils';
import { activeCommitteeMembers } from '@/lib/finance/committeeMembers';
import { scoreAssetRisks, type RiskAsset, type RiskLog } from '@/lib/maintenance/assetRisk';
import type { PlanTask } from '@/lib/maintenance/preventivePlan';
import { recordOperationEvent } from '@/lib/operations/audit';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { anthropicCommitteeDigestWriter } from './aiWriter';
import { draftCommitteeDigest, MAX_DIGEST_LENGTH, type CommitteeDigestWriter } from './compose';
import { buildCommitteeDigestMetrics, type CommitteeDigestRawData } from './metrics';
import { checkDigestPrivacy, normalizeKnownNames, privacyIssueMessage } from './privacy';
import { committeeDigestWindow, periodLabel } from './week';
import type {
    CommitteeDigestAdminView,
    CommitteeDigestMetrics,
    CommitteeDigestPublished,
    CommitteeDigestRecord,
    CommitteeDigestWindow,
} from './types';

/**
 * Resumen semanal para el comité. Flujo:
 *   1. Borrador (cron del lunes o botón a pedido), un solo resumen por comunidad
 *      y semana (UNIQUE community_id + week_start).
 *   2. Entra a la cola de aprobaciones del Agent Center como un playbook más
 *      (`committee_weekly_digest`) y se avisa a los admins dentro de la app.
 *   3. El admin lo revisa, puede editarlo y lo aprueba.
 *   4. Recién ahí lo ve el comité vigente (o los admins si no hay comité), con
 *      un aviso dentro de la app. Sin correo ni WhatsApp.
 */

export const COMMITTEE_DIGEST_PLAYBOOK = 'committee_weekly_digest' as const;
const ADMIN_LINK = '/agent-center#resumen-semanal';
const COMMITTEE_LINK = '/expenses/committee-digest';

export class CommitteeDigestError extends Error {
    constructor(message: string, public status = 400) {
        super(message);
        this.name = 'CommitteeDigestError';
    }
}

type DigestRow = Record<string, unknown>;
const DIGEST_COLUMNS = 'id, community_id, week_start, period_start, period_end, status, audience, source, content, generated_content, metrics, proposal_id, edited_at, approved_at, created_at, updated_at';

function mapDigest(row: DigestRow): CommitteeDigestRecord {
    return {
        id: String(row.id),
        weekStart: String(row.week_start),
        periodStart: String(row.period_start),
        periodEnd: String(row.period_end),
        status: row.status as CommitteeDigestRecord['status'],
        audience: row.audience as CommitteeDigestRecord['audience'],
        source: row.source as CommitteeDigestRecord['source'],
        content: String(row.content || ''),
        metrics: (row.metrics || {}) as CommitteeDigestMetrics,
        edited: Boolean(row.edited_at),
        editedAt: row.edited_at ? String(row.edited_at) : null,
        approvedAt: row.approved_at ? String(row.approved_at) : null,
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
    };
}

// ---------------------------------------------------------------------------
// Lectura de datos (todo por comunidad; solo se guardan agregados)
// ---------------------------------------------------------------------------

async function readAllPages<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, pageSize = 1000, maxPages = 10): Promise<T[]> {
    const rows: T[] = [];
    for (let page = 0; page < maxPages; page += 1) {
        const { data, error } = await build(page * pageSize, page * pageSize + pageSize - 1);
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < pageSize) break;
    }
    return rows;
}

export async function readCommitteeDigestRawData(communityId: string, window: CommitteeDigestWindow): Promise<CommitteeDigestRawData> {
    const admin = getSupabaseAdmin();
    const since30 = addDaysISO(window.today, -30);
    const sinceTs = `${addDaysISO(window.periodStart, -1)}T00:00:00Z`;
    const riskSince = addDaysISO(window.today, -730);

    const [units, expenses, charges, agreements, tasks, assets, logs, quotes, requests, cases, bookings, announcements, polls, profiles] = await Promise.all([
        readAllPages<{ id: string }>((from, to) => admin.from('units').select('id').eq('community_id', communityId).order('id').range(from, to)),
        readAllPages<{ unit_id: string | null; due_date: string | null; status: string | null }>((from, to) => admin.from('expenses')
            .select('unit_id, due_date, status').eq('community_id', communityId).in('status', ['pending', 'overdue']).lt('due_date', window.today).order('id').range(from, to)),
        readAllPages<{ unit_id: string | null; due_date: string | null; status: string | null }>((from, to) => admin.from('unit_charges')
            .select('unit_id, due_date, status').eq('community_id', communityId).in('status', ['pending', 'overdue']).lt('due_date', window.today).order('id').range(from, to)),
        admin.from('payment_agreements').select('status, created_at').eq('community_id', communityId)
            .in('status', ['active', 'pending_committee', 'completed']).limit(2000),
        admin.from('maintenance_tasks').select('id, asset_id, status, due_date, completed_at, frequency').eq('community_id', communityId)
            .or(`status.in.(pending,in_progress,overdue),completed_at.gte.${sinceTs}`).limit(3000),
        admin.from('building_assets').select('id, name, category, health_status, last_maintenance, next_maintenance, installation_date')
            .eq('community_id', communityId).limit(1000),
        admin.from('maintenance_logs').select('asset_id, task_id, cost, date').eq('community_id', communityId).gte('date', riskSince).limit(5000),
        admin.from('maintenance_quotes').select('status, task_id, service_request_id').eq('community_id', communityId)
            .in('status', ['requested', 'received', 'selected']).limit(2000),
        admin.from('service_requests').select('status, created_at, updated_at').eq('community_id', communityId)
            .or(`status.in.(pending,accepted,awaiting_confirmation,in_progress),created_at.gte.${sinceTs},updated_at.gte.${sinceTs}`).limit(3000),
        admin.from('coco_cases').select('status, category, type, created_at, updated_at').eq('community_id', communityId)
            .or(`status.in.(open,in_progress),created_at.gte.${since30}T00:00:00Z,updated_at.gte.${sinceTs}`).limit(3000),
        admin.from('bookings').select('date, status').eq('community_id', communityId)
            .gte('date', window.periodStart).lte('date', window.upcomingEnd).limit(3000),
        admin.from('announcements').select('title, created_at').eq('community_id', communityId).gte('created_at', sinceTs)
            .order('created_at', { ascending: false }).limit(200),
        admin.from('polls').select('title, status, end_date').eq('community_id', communityId).eq('status', 'active').limit(100),
        admin.from('profiles').select('name, full_name').eq('community_id', communityId).limit(5000),
    ]);
    for (const result of [agreements, tasks, assets, logs, quotes, requests, cases, bookings, announcements, polls, profiles]) {
        if (result.error) throw result.error;
    }

    const taskRows = (tasks.data || []) as Array<PlanTask & { completed_at: string | null; frequency: string | null }>;
    const openTasks = taskRows.filter(task => ['pending', 'in_progress', 'overdue'].includes(String(task.status)));
    const risks = scoreAssetRisks({
        assets: (assets.data || []) as RiskAsset[], tasks: openTasks, logs: (logs.data || []) as RiskLog[], today: window.today,
    });

    return {
        units: units.map(row => ({ id: String(row.id) })),
        debts: [...expenses, ...charges],
        agreements: agreements.data || [],
        tasks: taskRows,
        risks: risks.map(risk => ({ assetName: risk.assetName, level: risk.level, score: risk.score })),
        quotes: quotes.data || [],
        serviceRequests: requests.data || [],
        cases: cases.data || [],
        bookings: bookings.data || [],
        announcements: announcements.data || [],
        polls: polls.data || [],
        knownNames: normalizeKnownNames((profiles.data || []).flatMap(row => [row.name, row.full_name])),
    };
}

async function knownNamesFor(communityId: string) {
    const { data, error } = await getSupabaseAdmin().from('profiles').select('name, full_name').eq('community_id', communityId).limit(5000);
    if (error) throw error;
    return normalizeKnownNames((data || []).flatMap(row => [row.name, row.full_name]));
}

async function adminIdsFor(communityId: string): Promise<string[]> {
    const { data, error } = await getSupabaseAdmin().from('profiles').select('id')
        .eq('community_id', communityId).eq('role', 'admin').order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []).map(row => String(row.id));
}

// ---------------------------------------------------------------------------
// Agent Center: el borrador entra a la cola de aprobaciones como un playbook
// ---------------------------------------------------------------------------

async function createApprovalProposal(communityId: string, actorId: string, digest: CommitteeDigestRecord) {
    const admin = getSupabaseAdmin();
    const definition = AGENT_PLAYBOOKS.find(item => item.key === COMMITTEE_DIGEST_PLAYBOOK);
    const label = periodLabel(digest.periodStart, digest.periodEnd);
    const summary = `Resumen semanal para el comité (${label}): revisa el borrador, edítalo si quieres y apruébalo para que lo vea el comité.`;
    const args = { playbookKey: COMMITTEE_DIGEST_PLAYBOOK, requestedText: summary, digestId: digest.id };
    const proposedAction = { agentKey: 'community', toolName: 'run_playbook', title: `Aprobar resumen semanal (${label})`, summary, args, targetHref: definition?.targetHref || ADMIN_LINK };
    const { data: policy } = await admin.from('agent_policies').select('autonomy_level')
        .eq('community_id', communityId).eq('agent_key', 'community').maybeSingle();
    const { data: run, error: runError } = await admin.from('agent_runs').insert({
        user_id: actorId, community_id: communityId, agent_key: 'community', intent: 'run_playbook',
        user_message: summary, autonomy_level: policy?.autonomy_level || DEFAULT_AGENT_POLICIES.community.autonomyLevel,
        status: 'awaiting_confirmation', summary: `Aprobar resumen semanal (${label})`,
        metadata: { displayAction: 'Resumen semanal para el comité', displaySummary: summary, targetHref: proposedAction.targetHref, proposedAction, committeeDigestId: digest.id },
    }).select('id').single();
    if (runError || !run) throw runError || new Error('No se pudo registrar la propuesta.');
    const { data: toolCall, error: toolError } = await admin.from('agent_tool_calls').insert({
        run_id: run.id, user_id: actorId, community_id: communityId, tool_name: 'run_playbook',
        args, result: {}, requires_confirmation: true, status: 'proposed',
    }).select('id').single();
    if (toolError || !toolCall) {
        await admin.from('agent_runs').update({ status: 'failed', completed_at: new Date().toISOString() }).eq('id', run.id);
        throw toolError || new Error('No se pudo registrar la propuesta.');
    }
    await admin.from('committee_digests').update({ proposal_id: toolCall.id }).eq('id', digest.id).eq('community_id', communityId);
    return String(toolCall.id);
}

/** Cierra la tarjeta de la cola cuando el resumen se aprueba desde su propia tarjeta. */
async function closeApprovalProposal(communityId: string, proposalId: string | null) {
    if (!proposalId) return;
    const admin = getSupabaseAdmin();
    const { data } = await admin.from('agent_tool_calls')
        .update({ status: 'executed', executed_at: new Date().toISOString(), result: { committeeDigest: 'published' } })
        .eq('id', proposalId).eq('community_id', communityId).eq('status', 'proposed').select('run_id').maybeSingle();
    if (data?.run_id) {
        await admin.from('agent_runs').update({ status: 'executed', completed_at: new Date().toISOString() })
            .eq('id', data.run_id).eq('community_id', communityId);
    }
}

// ---------------------------------------------------------------------------
// Generación (idempotente)
// ---------------------------------------------------------------------------

export interface GenerateCommitteeDigestOptions {
    actorId?: string | null;
    trigger: 'cron' | 'manual' | 'agent_center';
    now?: Date;
    writer?: CommitteeDigestWriter | null;
}

export async function generateCommitteeDigest(communityId: string, options: GenerateCommitteeDigestOptions) {
    const admin = getSupabaseAdmin();
    const window = committeeDigestWindow(options.now);

    const existing = await admin.from('committee_digests').select(DIGEST_COLUMNS)
        .eq('community_id', communityId).eq('week_start', window.weekStart).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return { created: false, digest: mapDigest(existing.data) };

    const adminIds = await adminIdsFor(communityId);
    const actorId = options.actorId || adminIds[0];
    if (!actorId) throw new CommitteeDigestError('La comunidad no tiene un administrador para revisar el resumen.', 409);

    const raw = await readCommitteeDigestRawData(communityId, window);
    const metrics = buildCommitteeDigestMetrics(raw, window);
    const writer = options.writer === undefined ? anthropicCommitteeDigestWriter({ communityId, userId: actorId }) : options.writer;
    const draft = await draftCommitteeDigest(metrics, raw.knownNames, writer);

    // Si dos procesos generan a la vez, la restricción única deja uno solo.
    const inserted = await admin.from('committee_digests').upsert({
        community_id: communityId, week_start: window.weekStart, period_start: window.periodStart, period_end: window.periodEnd,
        status: 'draft', audience: 'committee', source: draft.source, content: draft.content, generated_content: draft.content,
        metrics, generated_by: options.actorId || null,
    }, { onConflict: 'community_id,week_start', ignoreDuplicates: true }).select(DIGEST_COLUMNS);
    if (inserted.error) throw inserted.error;
    if (!inserted.data?.length) {
        const winner = await admin.from('committee_digests').select(DIGEST_COLUMNS)
            .eq('community_id', communityId).eq('week_start', window.weekStart).single();
        if (winner.error) throw winner.error;
        return { created: false, digest: mapDigest(winner.data) };
    }
    const digest = mapDigest(inserted.data[0]);

    await createApprovalProposal(communityId, actorId, digest);
    const notifications = adminIds.map(adminId => ({
        id: stableNotificationId('committee_digest_draft', communityId, adminId, digest.id),
        user_id: adminId, community_id: communityId, type: 'info', category: 'committee_digest',
        title: 'Resumen semanal listo para revisar',
        body: `CoCo preparó el resumen de la semana (${periodLabel(digest.periodStart, digest.periodEnd)}). Revísalo y apruébalo para compartirlo con el comité.`,
        link: ADMIN_LINK,
    }));
    if (notifications.length) {
        const { error } = await admin.from('notifications').upsert(notifications, { onConflict: 'id', ignoreDuplicates: true });
        if (error) throw error;
    }
    await recordOperationEvent({
        communityId, actorId: options.actorId || null, actorRole: options.actorId ? 'admin' : 'system',
        action: 'agent.committee_digest.drafted', entityType: 'committee_digest', entityId: digest.id,
        severity: 'info', status: 'pending',
        summary: `Borrador del resumen semanal (${periodLabel(digest.periodStart, digest.periodEnd)}) listo para revisión`,
        metadata: { weekStart: digest.weekStart, source: draft.source, fallbackReason: draft.fallbackReason || null, trigger: options.trigger, channel: 'in_app' },
    });
    return { created: true, digest };
}

/** Cron semanal: todas las comunidades con administrador. Un error no detiene a las demás. */
export async function generateCommitteeDigestsForAllCommunities(now: Date = new Date()) {
    const { data, error } = await getSupabaseAdmin().from('profiles').select('community_id')
        .eq('role', 'admin').not('community_id', 'is', null).limit(5000);
    if (error) throw error;
    const communityIds = [...new Set((data || []).map(row => String(row.community_id)))];
    const results: Array<{ communityId: string; status: 'created' | 'exists' | 'failed'; error?: string }> = [];
    for (const communityId of communityIds) {
        try {
            const result = await generateCommitteeDigest(communityId, { trigger: 'cron', now });
            results.push({ communityId, status: result.created ? 'created' : 'exists' });
        } catch (generationError) {
            console.error('[committee-digest] generation failed', { communityId, error: generationError });
            results.push({ communityId, status: 'failed', error: generationError instanceof Error ? generationError.message.slice(0, 200) : 'Error' });
        }
    }
    return { weekStart: committeeDigestWindow(now).weekStart, communities: communityIds.length, results };
}

// ---------------------------------------------------------------------------
// Revisión del admin: editar y aprobar
// ---------------------------------------------------------------------------

async function loadDigest(communityId: string, digestId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(digestId)) throw new CommitteeDigestError('Resumen no válido.', 400);
    const { data, error } = await getSupabaseAdmin().from('committee_digests').select(DIGEST_COLUMNS)
        .eq('id', digestId).eq('community_id', communityId).maybeSingle();
    if (error) throw error;
    if (!data) throw new CommitteeDigestError('No encontré el resumen en esta comunidad.', 404);
    return data;
}

async function validateContent(communityId: string, content: unknown) {
    const text = typeof content === 'string' ? content.replace(/\r\n/g, '\n').trim() : '';
    if (text.length < 40) throw new CommitteeDigestError('El resumen está vacío o es demasiado corto.');
    if (text.length > MAX_DIGEST_LENGTH) throw new CommitteeDigestError(`El resumen no puede superar ${MAX_DIGEST_LENGTH} caracteres.`);
    const privacy = checkDigestPrivacy(text, await knownNamesFor(communityId));
    if (!privacy.ok) throw new CommitteeDigestError(privacyIssueMessage(privacy.issues), 422);
    return text;
}

export async function updateCommitteeDigestDraft(communityId: string, adminId: string, digestId: string, content: unknown) {
    const current = await loadDigest(communityId, digestId);
    if (current.status !== 'draft') throw new CommitteeDigestError('Solo se puede editar un borrador.', 409);
    const text = await validateContent(communityId, content);
    const now = new Date().toISOString();
    const { data, error } = await getSupabaseAdmin().from('committee_digests')
        .update({ content: text, edited_by: adminId, edited_at: now, updated_at: now })
        .eq('id', digestId).eq('community_id', communityId).eq('status', 'draft').eq('updated_at', current.updated_at)
        .select(DIGEST_COLUMNS).maybeSingle();
    if (error) throw error;
    if (!data) throw new CommitteeDigestError('El resumen cambió mientras lo editabas. Recarga y vuelve a intentarlo.', 409);
    await recordOperationEvent({
        communityId, actorId: adminId, actorRole: 'admin', action: 'agent.committee_digest.edited',
        entityType: 'committee_digest', entityId: digestId, summary: 'Borrador del resumen semanal editado por administración',
    });
    return mapDigest(data);
}

export async function approveCommitteeDigest(communityId: string, adminId: string, digestId: string, content?: unknown) {
    let current = await loadDigest(communityId, digestId);
    if (current.status === 'published') return { digest: mapDigest(current), notified: 0, alreadyPublished: true };
    if (current.status !== 'draft') throw new CommitteeDigestError('Este resumen fue descartado.', 409);
    if (typeof content === 'string' && content.trim() !== String(current.content).trim()) {
        await updateCommitteeDigestDraft(communityId, adminId, digestId, content);
        current = await loadDigest(communityId, digestId);
    }
    // Releer antes de publicar: el texto final se valida otra vez.
    await validateContent(communityId, current.content);

    const committee = await activeCommitteeMembers(communityId);
    const audience = committee.length ? 'committee' : 'admins';
    const recipients = audience === 'committee' ? committee.map(member => member.id) : await adminIdsFor(communityId);
    const now = new Date().toISOString();
    const { data, error } = await getSupabaseAdmin().from('committee_digests')
        .update({ status: 'published', audience, approved_by: adminId, approved_at: now, updated_at: now })
        .eq('id', digestId).eq('community_id', communityId).eq('status', 'draft').eq('updated_at', current.updated_at)
        .select(DIGEST_COLUMNS).maybeSingle();
    if (error) throw error;
    if (!data) throw new CommitteeDigestError('El resumen cambió mientras lo aprobabas. Recarga y vuelve a intentarlo.', 409);
    const digest = mapDigest(data);

    const label = periodLabel(digest.periodStart, digest.periodEnd);
    const notifications = recipients.map(userId => ({
        id: stableNotificationId('committee_digest_published', communityId, userId, digest.id),
        user_id: userId, community_id: communityId, type: 'info', category: 'committee_digest',
        title: 'Resumen semanal de la comunidad',
        body: `Ya está disponible el resumen de la semana (${label}), con las decisiones sugeridas para el comité.`,
        link: audience === 'committee' ? COMMITTEE_LINK : ADMIN_LINK,
    }));
    if (notifications.length) {
        const { error: notifyError } = await getSupabaseAdmin().from('notifications').upsert(notifications, { onConflict: 'id', ignoreDuplicates: true });
        if (notifyError) throw notifyError;
    }
    await closeApprovalProposal(communityId, current.proposal_id ? String(current.proposal_id) : null);
    await recordOperationEvent({
        communityId, actorId: adminId, actorRole: 'admin', action: 'agent.committee_digest.published',
        entityType: 'committee_digest', entityId: digest.id, severity: 'success', status: 'success',
        summary: `Resumen semanal (${label}) aprobado y compartido con ${audience === 'committee' ? 'el comité' : 'administración (sin comité vigente)'}`,
        metadata: { weekStart: digest.weekStart, audience, recipients: notifications.length, edited: digest.edited, channel: 'in_app' },
    });
    return { digest, notified: notifications.length, alreadyPublished: false };
}

// ---------------------------------------------------------------------------
// Lecturas
// ---------------------------------------------------------------------------

export async function listCommitteeDigestsForAdmin(communityId: string): Promise<CommitteeDigestAdminView> {
    const [{ data, error }, committee] = await Promise.all([
        getSupabaseAdmin().from('committee_digests').select(DIGEST_COLUMNS).eq('community_id', communityId)
            .neq('status', 'discarded').order('week_start', { ascending: false }).limit(12),
        activeCommitteeMembers(communityId),
    ]);
    if (error) throw error;
    return { digests: (data || []).map(mapDigest), hasCommittee: committee.length > 0 };
}

/** Vista del comité: solo resúmenes publicados y solo para integrantes vigentes (o admins). */
export async function listPublishedCommitteeDigests(communityId: string, profile: { id: string; role: string }): Promise<CommitteeDigestPublished[]> {
    if (profile.role !== 'admin') {
        const committee = await activeCommitteeMembers(communityId);
        if (!committee.some(member => member.id === profile.id)) {
            throw new CommitteeDigestError('El resumen semanal está disponible para los integrantes vigentes del comité.', 403);
        }
    }
    const { data, error } = await getSupabaseAdmin().from('committee_digests')
        .select('id, week_start, period_start, period_end, content, approved_at')
        .eq('community_id', communityId).eq('status', 'published').order('week_start', { ascending: false }).limit(12);
    if (error) throw error;
    return (data || []).map(row => ({
        id: String(row.id), weekStart: String(row.week_start), periodStart: String(row.period_start), periodEnd: String(row.period_end),
        content: String(row.content), approvedAt: row.approved_at ? String(row.approved_at) : null,
    }));
}
