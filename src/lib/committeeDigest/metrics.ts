import { addDaysISO, chileTodayISO } from '@/lib/agent-center/chileDate';
import type { RiskLevel } from '@/lib/maintenance/assetRisk';
import { scrubPublicTitle } from './privacy';
import type { CommitteeDigestMetrics, CommitteeDigestWindow } from './types';

/**
 * Filas crudas que lee el servicio. La agregación es pura para poder probarla
 * sin base de datos: entra lo que hay, sale solo lo agregado.
 */
export interface CommitteeDigestRawData {
    units: Array<{ id: string }>;
    /** Cobros (expenses + unit_charges) en estado pendiente o vencido. */
    debts: Array<{ unit_id: string | null; due_date: string | null; status: string | null }>;
    agreements: Array<{ status: string | null; created_at: string | null }>;
    tasks: Array<{ status: string | null; due_date: string | null; completed_at: string | null; frequency?: string | null }>;
    risks: Array<{ assetName: string; level: RiskLevel; score: number }>;
    quotes: Array<{ status: string | null; task_id: string | null; service_request_id: string | null }>;
    serviceRequests: Array<{ status: string | null; created_at: string | null; updated_at: string | null }>;
    cases: Array<{ status: string | null; category: string | null; type: string | null; created_at: string | null; updated_at: string | null }>;
    bookings: Array<{ date: string | null; status: string | null }>;
    announcements: Array<{ title: string | null; created_at: string | null }>;
    polls: Array<{ title: string | null; status: string | null; end_date: string | null }>;
    /** Nombres de perfiles de la comunidad: solo para filtrar, nunca se publican. */
    knownNames: string[];
}

const OPEN_TASK = new Set(['pending', 'in_progress', 'overdue']);
const OPEN_REQUEST = new Set(['pending', 'accepted', 'awaiting_confirmation', 'in_progress', 'in-progress']);
const OPEN_CASE = new Set(['open', 'in_progress']);
const RESOLVED_CASE = new Set(['resolved', 'closed']);
const DEBT_STATUS = new Set(['pending', 'overdue']);

/** Fecha civil chilena de un timestamp; las fechas puras se devuelven tal cual. */
export function chileDateOf(value: string | null | undefined): string | null {
    if (!value) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const time = Date.parse(value);
    return Number.isNaN(time) ? null : chileTodayISO(new Date(time));
}

function within(date: string | null, start: string, end: string) {
    return Boolean(date && date >= start && date <= end);
}

const THEME_LABELS: Record<string, string> = {
    ruido: 'ruidos molestos', seguridad: 'seguridad', incidencia: 'incidencias en espacios comunes',
    convivencia: 'convivencia', mascotas: 'mascotas', estacionamiento: 'estacionamientos', estacionamientos: 'estacionamientos',
    basura: 'manejo de basura', limpieza: 'limpieza', agua: 'agua', filtracion: 'filtraciones', filtraciones: 'filtraciones',
    ascensor: 'ascensores', mantencion: 'mantención', mantenimiento: 'mantención', reclamo: 'reclamos generales',
};

function themeLabel(raw: string): string | null {
    const key = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    if (!key || !/^[a-z _-]{3,40}$/.test(key)) return null;
    return THEME_LABELS[key] || key.replace(/[_-]+/g, ' ');
}

export function buildCommitteeDigestMetrics(raw: CommitteeDigestRawData, window: CommitteeDigestWindow): CommitteeDigestMetrics {
    const { today, periodStart, periodEnd, upcomingEnd } = window;

    // Recaudación: solo el porcentaje de unidades al día, nunca quién debe.
    const unitIds = new Set(raw.units.map(unit => String(unit.id)));
    const unitsWithOverdue = new Set(raw.debts
        .filter(debt => debt.unit_id && unitIds.has(String(debt.unit_id)) && DEBT_STATUS.has(String(debt.status))
            && Boolean(debt.due_date) && String(debt.due_date) < today)
        .map(debt => String(debt.unit_id)));
    const totalUnits = unitIds.size;
    const unitsUpToDate = totalUnits - unitsWithOverdue.size;

    const agreementCreated = (row: { created_at: string | null }) => within(chileDateOf(row.created_at), periodStart, periodEnd);

    // Mantención.
    const openTasks = raw.tasks.filter(task => OPEN_TASK.has(String(task.status)));
    const overdueTasks = openTasks.filter(task => task.status === 'overdue' || (task.due_date && task.due_date < today));
    const upcomingPreventive = openTasks.filter(task => task.status !== 'overdue' && (task.frequency === undefined || Boolean(task.frequency))
        && within(task.due_date, today, upcomingEnd));
    const quoteTargets = new Map<string, Set<string>>();
    for (const quote of raw.quotes) {
        const target = quote.task_id || quote.service_request_id;
        if (!target) continue;
        quoteTargets.set(target, (quoteTargets.get(target) || new Set()).add(String(quote.status)));
    }
    const quotesAwaitingDecision = [...quoteTargets.values()].filter(statuses => statuses.has('received') && !statuses.has('selected')).length;
    const highRiskAssets = raw.risks.filter(risk => risk.level === 'high')
        .sort((a, b) => b.score - a.score).map(risk => scrubPublicTitle(risk.assetName.slice(0, 60), raw.knownNames))
        .filter((name): name is string => Boolean(name)).slice(0, 5);

    // Solicitudes y casos.
    const themeWindowStart = addDaysISO(today, -30);
    const themes = new Map<string, number>();
    for (const row of raw.cases) {
        if (!within(chileDateOf(row.created_at), themeWindowStart, today)) continue;
        const label = themeLabel(String(row.category || row.type || ''));
        if (label) themes.set(label, (themes.get(label) || 0) + 1);
    }
    const recurringThemes = [...themes.entries()].filter(([, count]) => count >= 2)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([theme, count]) => ({ theme, count }));

    // Vida en comunidad.
    const liveBooking = (row: { status: string | null }) => row.status !== 'cancelled' && row.status !== 'rejected';
    const announcementsInPeriod = raw.announcements.filter(row => within(chileDateOf(row.created_at), periodStart, periodEnd));
    const activePolls = raw.polls.filter(poll => poll.status === 'active' && (!poll.end_date || (chileDateOf(poll.end_date) || '') >= today));

    return {
        window,
        collection: {
            totalUnits,
            unitsUpToDate,
            upToDatePercent: totalUnits ? Math.round((unitsUpToDate / totalUnits) * 100) : null,
            activeAgreements: raw.agreements.filter(row => row.status === 'active').length,
            newAgreements: raw.agreements.filter(row => ['active', 'pending_committee', 'completed'].includes(String(row.status)) && agreementCreated(row)).length,
            agreementsPendingCommittee: raw.agreements.filter(row => row.status === 'pending_committee').length,
        },
        maintenance: {
            openTasks: openTasks.length,
            overdueTasks: overdueTasks.length,
            completedTasks: raw.tasks.filter(task => task.status === 'completed' && within(chileDateOf(task.completed_at), periodStart, periodEnd)).length,
            upcomingPreventive: upcomingPreventive.length,
            highRiskAssets,
            pendingQuotes: raw.quotes.filter(quote => quote.status === 'requested').length,
            quotesAwaitingDecision,
        },
        requests: {
            openRequests: raw.serviceRequests.filter(row => OPEN_REQUEST.has(String(row.status))).length,
            newRequests: raw.serviceRequests.filter(row => within(chileDateOf(row.created_at), periodStart, periodEnd)).length,
            resolvedRequests: raw.serviceRequests.filter(row => row.status === 'completed' && within(chileDateOf(row.updated_at), periodStart, periodEnd)).length,
            openCases: raw.cases.filter(row => OPEN_CASE.has(String(row.status))).length,
            resolvedCases: raw.cases.filter(row => RESOLVED_CASE.has(String(row.status)) && within(chileDateOf(row.updated_at), periodStart, periodEnd)).length,
            recurringThemes,
        },
        community: {
            bookings: raw.bookings.filter(row => liveBooking(row) && within(row.date, periodStart, periodEnd)).length,
            upcomingBookings: raw.bookings.filter(row => liveBooking(row) && within(row.date, today, upcomingEnd)).length,
            announcements: announcementsInPeriod.length,
            announcementTitles: announcementsInPeriod.map(row => scrubPublicTitle(row.title, raw.knownNames)).filter((title): title is string => Boolean(title)).slice(0, 3),
            activePolls: activePolls.flatMap(poll => {
                const title = scrubPublicTitle(poll.title, raw.knownNames);
                return title ? [{ title, endsOn: chileDateOf(poll.end_date) }] : [];
            }).slice(0, 3),
            pollsClosingSoon: activePolls.filter(poll => within(chileDateOf(poll.end_date), today, upcomingEnd)).length,
        },
    };
}
