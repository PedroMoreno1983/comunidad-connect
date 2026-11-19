/**
 * Reporte de actividad de la plataforma, mañana y tarde (19-11-2026).
 *
 * Quién entró, qué hizo con CoCo y cuánto costó, qué le falló (acciones que
 * no se completaron, respuestas vacías, bloqueos por cupo, boletas que no se
 * leyeron) y qué quedó pendiente. Llega por correo a la superadministración.
 *
 * `buildActivityReport` es puro (recibe los datos, devuelve el reporte);
 * `runActivityReport` los lee de la base, lo envía y lo registra.
 */
import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { anthropicModelFor } from '@/lib/ai/modelRouter';
import { chileDayStart, personCostLimits } from '@/lib/ai/budget';
import { BRAND, emailWrapper, escapeEmailHtml, FROM_EMAIL, resend, SUPERADMIN_EMAIL } from '@/lib/email';
import { getSuperAdminEmails } from '@/lib/security/superadmin';

export type ReportPeriod = 'am' | 'pm';

export interface ReportPerson {
    id: string;
    name: string;
    email: string;
    role: string;
    communityId: string | null;
    createdAt: string;
    lastSignInAt: string | null;
}

export interface ReportUsageEvent {
    user_id: string | null;
    community_id: string | null;
    status: string | null;
    blocked_reason: string | null;
    estimated_cost_cents: number | null;
    module: string | null;
    created_at: string;
}

export interface ReportSession {
    key: string;
    lastActivity: string;
    userId: string | null;
    name: string;
    role: string;
    channel: string;
    communityId: string | null;
    /** Mensajes nuevos desde el reporte anterior. */
    turns: Array<{ role: string; content: string }>;
}

export interface ReportBill {
    community_id: string;
    status: string;
    file_name: string;
    error: string | null;
    received_at: string;
}

export interface ReportInput {
    period: ReportPeriod;
    windowStart: string;
    windowEnd: string;
    communities: Record<string, string>;
    people: ReportPerson[];
    usage: ReportUsageEvent[];
    /** Uso de hoy por persona (centavos), para ver quién está cerca del tope. */
    todayCostByUser: Record<string, number>;
    sessions: ReportSession[];
    bills: ReportBill[];
}

export interface ReportProblem {
    who: string;
    community: string;
    channel: string;
    asked: string;
    answer: string;
    /** Veces que falló lo mismo en el turno. */
    times: number;
}

export interface ActivityReport {
    title: string;
    totals: {
        activePeople: number;
        newPeople: number;
        cocoTurns: number;
        cocoCostCents: number;
        problems: number;
        blocked: number;
    };
    newPeople: Array<{ name: string; role: string; community: string }>;
    active: Array<{ name: string; role: string; community: string; turns: number; costCents: number; channel: string }>;
    problems: ReportProblem[];
    blocked: Array<{ name: string; community: string; reason: string; times: number }>;
    nearLimit: Array<{ name: string; community: string; leftPct: number }>;
    pendingBills: Array<{ community: string; count: number }>;
    failedBills: Array<{ community: string; file: string; error: string }>;
    byCommunity: Array<{ community: string; active: number; turns: number; costCents: number }>;
}

const ROLE_LABEL: Record<string, string> = {
    admin: 'Administración', resident: 'Residente', concierge: 'Conserjería', superadmin: 'Superadmin',
    provider: 'Técnico', committee: 'Comité',
};

const BLOCK_LABEL: Record<string, string> = {
    daily_person_cost_limit: 'cupo diario',
    weekly_person_cost_limit: 'cupo semanal',
    daily_role_token_limit: 'tope diario de tokens',
    monthly_cost_limit: 'tope mensual de la comunidad',
    monthly_token_limit: 'tope mensual de tokens',
    monthly_image_limit: 'tope mensual de imágenes',
    community_ai_disabled: 'IA apagada en la comunidad',
    daily_heavy_action_limit: 'tope de acciones pesadas',
};

/** Respuestas de CoCo que indican que la persona no consiguió lo que pidió. */
const PROBLEM_PATTERNS = [
    /no se pudo completar/i,
    /^no pude (responder|generar|leer|procesar)/i,
    /no encontr[ée] una pantalla/i,
    /no est[áa] disponible/i,
    /int[ée]ntalo m[áa]s tarde/i,
    /ocurri[óo] un error/i,
];

export function isProblemReply(text: string): boolean {
    return PROBLEM_PATTERNS.some(pattern => pattern.test(text.trim()));
}

const clip = (text: string, max: number) => {
    const flat = text.replace(/\s+/g, ' ').trim();
    return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

/** Respuestas cortas de confirmación o reintento. */
const CONFIRMATION = /^(s[ií]|ok|okay|dale|ya|listo|confirmo|correcto|bueno|perfecto|reintenta\w*|intenta de nuevo|otra vez)( por favor)?[.!]?$/i;

const NO_COMMUNITY = 'Sin condominio';

export function buildActivityReport(input: ReportInput): ActivityReport {
    const communityName = (id: string | null | undefined) => (id && input.communities[id]) || NO_COMMUNITY;
    const peopleById = new Map(input.people.map(person => [person.id, person]));
    const inWindow = (iso: string | null) => Boolean(iso && iso >= input.windowStart && iso < input.windowEnd);

    // Actividad: quien entró en la ventana o usó CoCo en ella.
    const used = new Map<string, { turns: number; costCents: number }>();
    for (const event of input.usage) {
        if (!event.user_id || event.status === 'blocked') continue;
        const entry = used.get(event.user_id) ?? { turns: 0, costCents: 0 };
        entry.turns += 1;
        entry.costCents += Number(event.estimated_cost_cents ?? 0);
        used.set(event.user_id, entry);
    }
    const channelOf = new Map<string, string>();
    for (const session of input.sessions) if (session.userId) channelOf.set(session.userId, session.channel === 'whatsapp' ? 'WhatsApp' : 'Web');

    const activeIds = new Set<string>([
        ...input.people.filter(person => inWindow(person.lastSignInAt)).map(person => person.id),
        ...used.keys(),
    ]);
    const active = [...activeIds].flatMap(id => {
        const person = peopleById.get(id);
        if (!person) return [];
        const usage = used.get(id) ?? { turns: 0, costCents: 0 };
        return [{
            name: person.name, role: ROLE_LABEL[person.role] ?? person.role, community: communityName(person.communityId),
            turns: usage.turns, costCents: usage.costCents, channel: channelOf.get(id) ?? (usage.turns ? 'Web' : '—'),
        }];
    }).sort((a, b) => b.turns - a.turns || a.community.localeCompare(b.community, 'es') || a.name.localeCompare(b.name, 'es'));

    const newPeople = input.people.filter(person => inWindow(person.createdAt))
        .map(person => ({ name: person.name, role: ROLE_LABEL[person.role] ?? person.role, community: communityName(person.communityId) }));

    // Problemas: respuesta de CoCo que no resolvió, con lo que la persona pidió justo antes.
    // "sí" o "reintentar" no dicen qué se pidió: se muestra el pedido anterior.
    // El mismo pedido fallado varias veces sale una vez, con las veces.
    const problemMap = new Map<string, ReportProblem>();
    for (const session of input.sessions) {
        let lastAsk = '';
        for (const turn of session.turns) {
            if (turn.role === 'user') {
                if (!CONFIRMATION.test(turn.content.trim()) || !lastAsk) lastAsk = turn.content;
                continue;
            }
            if (turn.role === 'assistant' && isProblemReply(turn.content)) {
                const asked = clip(lastAsk || '(sin texto)', 160);
                const key = `${session.key}|${asked}|${turn.content}`;
                const existing = problemMap.get(key);
                if (existing) { existing.times += 1; continue; }
                problemMap.set(key, {
                    who: session.name || 'Sin nombre',
                    community: communityName(session.communityId),
                    channel: session.channel === 'whatsapp' ? 'WhatsApp' : 'Web',
                    asked,
                    answer: clip(turn.content, 200),
                    times: 1,
                });
            }
        }
    }
    const problems = [...problemMap.values()];

    const blockedMap = new Map<string, { name: string; community: string; reason: string; times: number }>();
    for (const event of input.usage) {
        if (event.status !== 'blocked') continue;
        const person = event.user_id ? peopleById.get(event.user_id) : undefined;
        const reason = BLOCK_LABEL[event.blocked_reason ?? ''] ?? (event.blocked_reason || 'tope');
        const key = `${event.user_id}|${reason}`;
        const entry = blockedMap.get(key) ?? { name: person?.name ?? 'Sin nombre', community: communityName(event.community_id ?? person?.communityId), reason, times: 0 };
        entry.times += 1;
        blockedMap.set(key, entry);
    }

    const defaults = { staff_daily_cost_cents: 100, staff_weekly_cost_cents: 400, resident_daily_cost_cents: 15, resident_weekly_cost_cents: 50 };
    const nearLimit = Object.entries(input.todayCostByUser).flatMap(([id, cents]) => {
        const person = peopleById.get(id);
        if (!person) return [];
        const limit = personCostLimits(defaults, person.role).daily;
        if (!(limit > 0)) return [];
        const leftPct = Math.max(0, Math.round(100 - (cents / limit) * 100));
        return leftPct <= 25 ? [{ name: person.name, community: communityName(person.communityId), leftPct }] : [];
    }).sort((a, b) => a.leftPct - b.leftPct);

    const pendingByCommunity = new Map<string, number>();
    for (const bill of input.bills) if (bill.status === 'pending') pendingByCommunity.set(bill.community_id, (pendingByCommunity.get(bill.community_id) ?? 0) + 1);
    const failedBills = input.bills.filter(bill => bill.status === 'failed' && inWindow(bill.received_at))
        .map(bill => ({ community: communityName(bill.community_id), file: bill.file_name, error: clip(bill.error || 'sin detalle', 140) }));

    const communityStats = new Map<string, { community: string; active: number; turns: number; costCents: number }>();
    for (const row of active) {
        const entry = communityStats.get(row.community) ?? { community: row.community, active: 0, turns: 0, costCents: 0 };
        entry.active += 1;
        entry.turns += row.turns;
        entry.costCents += row.costCents;
        communityStats.set(row.community, entry);
    }

    const blocked = [...blockedMap.values()];
    return {
        title: input.period === 'am' ? 'Reporte de la mañana' : 'Reporte de la tarde',
        totals: {
            activePeople: active.length,
            newPeople: newPeople.length,
            cocoTurns: active.reduce((sum, row) => sum + row.turns, 0),
            cocoCostCents: active.reduce((sum, row) => sum + row.costCents, 0),
            problems: problems.reduce((sum, problem) => sum + problem.times, 0),
            blocked: blocked.reduce((sum, row) => sum + row.times, 0),
        },
        newPeople,
        active,
        problems,
        blocked,
        nearLimit,
        pendingBills: [...pendingByCommunity.entries()].map(([id, count]) => ({ community: communityName(id), count })),
        failedBills,
        byCommunity: [...communityStats.values()].sort((a, b) => b.turns - a.turns),
    };
}

const usd = (cents: number) => `US$ ${(cents / 100).toFixed(2).replace('.', ',')}`;

/** Ventana del turno: desde el reporte anterior, o 12 horas si no hay uno reciente. */
export function reportWindow(now: Date, previousEnd: string | null): { start: string; end: string } {
    const end = now.toISOString();
    const fallback = new Date(now.getTime() - 12 * 3_600_000).toISOString();
    const recent = previousEnd && now.getTime() - new Date(previousEnd).getTime() < 36 * 3_600_000 && previousEnd < end;
    return { start: recent ? previousEnd : fallback, end };
}

/** Turno en hora de Chile: antes de las 13:00 es el de la mañana. */
export function reportKey(now: Date): { key: string; period: ReportPeriod } {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
    }).formatToParts(now).map(part => [part.type, part.value]));
    const period: ReportPeriod = Number(parts.hour) < 13 ? 'am' : 'pm';
    return { key: `${parts.year}-${parts.month}-${parts.day}-${period}`, period };
}

const section = (title: string, body: string) =>
    `<h2 style="margin:28px 0 10px;font-family:${BRAND.serif};font-size:19px;color:${BRAND.ink};">${escapeEmailHtml(title)}</h2>${body}`;
const para = (text: string) => `<p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:${BRAND.inkMuted};">${text}</p>`;
const table = (headers: string[], rows: string[][]) => `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;font-size:13px;">
<tr>${headers.map(header => `<th align="left" style="padding:6px 8px;border-bottom:1px solid ${BRAND.line};color:${BRAND.inkTertiary};font-weight:600;">${escapeEmailHtml(header)}</th>`).join('')}</tr>
${rows.map(row => `<tr>${row.map(cell => `<td style="padding:6px 8px;border-bottom:1px solid ${BRAND.line};color:${BRAND.ink};vertical-align:top;">${escapeEmailHtml(cell)}</td>`).join('')}</tr>`).join('\n')}
</table>`;

export function renderActivityReportHtml(report: ActivityReport, windowLabel: string, highlights: string[]): string {
    const t = report.totals;
    const parts: string[] = [
        `<h1 style="margin:0 0 4px;font-family:${BRAND.serif};font-size:26px;color:${BRAND.ink};">${escapeEmailHtml(report.title)}</h1>`,
        para(escapeEmailHtml(windowLabel)),
        para(`<strong>${t.activePeople}</strong> personas activas · <strong>${t.newPeople}</strong> nuevas · <strong>${t.cocoTurns}</strong> mensajes a CoCo (${usd(t.cocoCostCents)}) · <strong>${t.problems}</strong> problemas · <strong>${t.blocked}</strong> bloqueos por cupo`),
    ];
    if (highlights.length) {
        parts.push(section('Lo importante', `<ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.6;color:${BRAND.ink};">${highlights.map(item => `<li>${escapeEmailHtml(item)}</li>`).join('')}</ul>`));
    }
    parts.push(section('Problemas', report.problems.length
        ? table(['Quién', 'Comunidad', 'Pidió', 'CoCo respondió'], report.problems.map(p => [`${p.who} (${p.channel})`, p.community, p.asked, p.times > 1 ? `${p.answer} (${p.times} veces)` : p.answer]))
        : para('Nadie se quedó trabado con CoCo en este turno.')));
    if (report.blocked.length) {
        parts.push(section('Bloqueos por cupo', table(['Quién', 'Comunidad', 'Motivo', 'Veces'], report.blocked.map(b => [b.name, b.community, b.reason, String(b.times)]))));
    }
    if (report.nearLimit.length) {
        parts.push(section('Cerca del tope diario', table(['Quién', 'Comunidad', 'Le queda'], report.nearLimit.map(n => [n.name, n.community, `${n.leftPct} %`]))));
    }
    if (report.failedBills.length) {
        parts.push(section('Boletas que no se pudieron leer', table(['Comunidad', 'Archivo', 'Error'], report.failedBills.map(b => [b.community, b.file, b.error]))));
    }
    parts.push(section('Quiénes entraron', report.active.length
        ? table(['Nombre', 'Rol', 'Comunidad', 'Canal', 'Mensajes a CoCo', 'Costo'], report.active.map(a => [a.name, a.role, a.community, a.channel, String(a.turns), usd(a.costCents)]))
        : para('Nadie entró en este turno.')));
    if (report.newPeople.length) {
        parts.push(section('Cuentas nuevas', table(['Nombre', 'Rol', 'Comunidad'], report.newPeople.map(n => [n.name, n.role, n.community]))));
    }
    if (report.byCommunity.length) {
        parts.push(section('Por comunidad', table(['Comunidad', 'Activas', 'Mensajes a CoCo', 'Costo'], report.byCommunity.map(c => [c.community, String(c.active), String(c.turns), usd(c.costCents)]))));
    }
    if (report.pendingBills.length) {
        parts.push(section('Pendiente', para(report.pendingBills.map(b => `${escapeEmailHtml(b.community)}: ${b.count} boleta${b.count === 1 ? '' : 's'} por registrar en la bandeja`).join('<br/>'))));
    }
    return emailWrapper(parts.join('\n'), report.title);
}

/** 3 a 5 frases con lo que conviene mirar. Sin IA o si falla, el reporte sale igual. */
async function summarize(report: ActivityReport): Promise<string[]> {
    if (!process.env.ANTHROPIC_API_KEY) return [];
    if (!report.totals.activePeople && !report.totals.problems) return [];
    try {
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 20_000, maxRetries: 1 });
        const response = await client.messages.create({
            model: anthropicModelFor('platform.activity-report'),
            max_tokens: 500,
            system: 'Eres el analista de Convive Connect, una plataforma de condominios en Chile. Recibes los datos de un turno de uso. '
                + 'Escribe de 3 a 5 viñetas en español profesional y claro, tuteando, sin modismos ni chilenismos, cada una de una sola frase: lo más importante que pasó y qué conviene hacer '
                + '(por ejemplo, a quién ayudar, qué arreglar en CoCo, qué comunidad no está usando la plataforma). Solo hechos de los datos, sin inventar. '
                + 'Responde solo las viñetas, una por línea, empezando con "- ".',
            messages: [{ role: 'user', content: JSON.stringify({ ...report, active: report.active.slice(0, 40), problems: report.problems.slice(0, 25) }) }],
        });
        const text = response.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n');
        return text.split('\n').map(line => line.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean).slice(0, 5);
    } catch (error) {
        console.warn('[activity-report] sin resumen IA', error instanceof Error ? error.message : error);
        return [];
    }
}

function windowLabel(start: string, end: string): string {
    const format = (iso: string) => new Intl.DateTimeFormat('es-CL', {
        timeZone: 'America/Santiago', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso));
    return `Desde ${format(start)} hasta ${format(end)} (hora de Chile)`;
}

async function listAllAuthUsers() {
    const admin = getSupabaseAdmin();
    const users: Array<{ id: string; last_sign_in_at?: string | null }> = [];
    for (let page = 1; page <= 20; page += 1) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw error;
        users.push(...data.users);
        if (data.users.length < 1000) break;
    }
    return users;
}

export interface RunActivityReportResult {
    status: 'sent' | 'already_sent' | 'dry_run' | 'email_failed';
    key: string;
    recipients: string[];
    totals: ActivityReport['totals'];
    html?: string;
}

/** Arma, envía y registra el reporte del turno. `dryRun` no envía ni registra. */
export async function runActivityReport(now = new Date(), options: { dryRun?: boolean; recipients?: string[] } = {}): Promise<RunActivityReportResult> {
    const admin = getSupabaseAdmin();
    const { key, period } = reportKey(now);
    const recipients = options.recipients?.length
        ? options.recipients
        : [...new Set((process.env.ACTIVITY_REPORT_EMAILS?.split(',').map(email => email.trim().toLowerCase()).filter(Boolean))
            ?? (getSuperAdminEmails().length ? getSuperAdminEmails() : [SUPERADMIN_EMAIL]))];

    if (!options.dryRun) {
        const { data: existing } = await admin.from('platform_activity_reports').select('id').eq('report_key', key).maybeSingle();
        if (existing) {
            return { status: 'already_sent', key, recipients, totals: { activePeople: 0, newPeople: 0, cocoTurns: 0, cocoCostCents: 0, problems: 0, blocked: 0 } };
        }
    }

    const { data: previous } = await admin.from('platform_activity_reports')
        .select('window_end, session_offsets').order('window_end', { ascending: false }).limit(1).maybeSingle();
    const { start, end } = reportWindow(now, previous?.window_end ?? null);
    const offsets = (previous?.session_offsets ?? {}) as Record<string, number>;

    const dayStartIso = chileDayStart(now);
    const [communitiesRes, profilesRes, usageRes, todayRes, sessionsRes, billsRes, authUsers] = await Promise.all([
        admin.from('communities').select('id, name'),
        admin.from('profiles').select('id, name, full_name, email, role, community_id, created_at'),
        admin.from('ai_usage_events').select('user_id, community_id, status, blocked_reason, estimated_cost_cents, module, created_at').gte('created_at', start).lt('created_at', end),
        admin.from('ai_usage_events').select('user_id, estimated_cost_cents, status').gte('created_at', dayStartIso).neq('status', 'blocked'),
        admin.from('coco_sessions').select('user_key, conversation, last_activity, user_context').gte('last_activity', start),
        admin.from('inbound_bill_documents').select('community_id, status, file_name, error, received_at').in('status', ['pending', 'failed']),
        listAllAuthUsers(),
    ]);
    for (const res of [communitiesRes, profilesRes, usageRes, todayRes, sessionsRes, billsRes]) if (res.error) throw res.error;

    const lastSignIn = new Map(authUsers.map(user => [user.id, user.last_sign_in_at ?? null]));
    const people: ReportPerson[] = (profilesRes.data ?? []).map(row => ({
        id: String(row.id),
        name: String(row.full_name || row.name || row.email || 'Sin nombre'),
        email: String(row.email || ''),
        role: String(row.role || 'resident'),
        communityId: row.community_id ? String(row.community_id) : null,
        createdAt: String(row.created_at || ''),
        lastSignInAt: lastSignIn.get(String(row.id)) ?? null,
    }));

    const todayCostByUser: Record<string, number> = {};
    for (const row of todayRes.data ?? []) {
        if (!row.user_id) continue;
        todayCostByUser[String(row.user_id)] = (todayCostByUser[String(row.user_id)] ?? 0) + Number(row.estimated_cost_cents ?? 0);
    }

    const nextOffsets: Record<string, number> = { ...offsets };
    const sessions: ReportSession[] = (sessionsRes.data ?? []).map(row => {
        const conversation = Array.isArray(row.conversation) ? row.conversation as Array<{ role?: string; content?: unknown }> : [];
        const context = (row.user_context ?? {}) as Record<string, unknown>;
        const from = Math.min(offsets[String(row.user_key)] ?? 0, conversation.length);
        nextOffsets[String(row.user_key)] = conversation.length;
        return {
            key: String(row.user_key),
            lastActivity: String(row.last_activity || ''),
            userId: context.user_id ? String(context.user_id) : null,
            name: String(context.name || ''),
            role: String(context.role || ''),
            channel: String(row.user_key).startsWith('wa:') ? 'whatsapp' : String(context.channel || 'web'),
            communityId: context.community_id ? String(context.community_id) : null,
            turns: conversation.slice(from).flatMap(turn => typeof turn.content === 'string' && turn.role ? [{ role: turn.role, content: turn.content }] : []),
        };
    });

    const report = buildActivityReport({
        period, windowStart: start, windowEnd: end,
        communities: Object.fromEntries((communitiesRes.data ?? []).map(row => [String(row.id), String(row.name)])),
        people,
        usage: (usageRes.data ?? []) as ReportUsageEvent[],
        todayCostByUser,
        sessions,
        bills: (billsRes.data ?? []) as ReportBill[],
    });
    const highlights = await summarize(report);
    const html = renderActivityReportHtml(report, windowLabel(start, end), highlights);
    if (options.dryRun) return { status: 'dry_run', key, recipients, totals: report.totals, html };

    const subject = `Convive · ${report.title}: ${report.totals.activePeople} activas, ${report.totals.problems} problemas`;
    const sent = await resend.emails.send({ from: FROM_EMAIL, to: recipients, subject, html });
    if (sent.error) {
        console.error('[activity-report] no se envió', sent.error.message);
        return { status: 'email_failed', key, recipients, totals: report.totals };
    }

    await admin.from('platform_activity_reports').insert({
        report_key: key, window_start: start, window_end: end, recipients,
        summary: { totals: report.totals, highlights }, session_offsets: nextOffsets,
    });
    return { status: 'sent', key, recipients, totals: report.totals };
}
