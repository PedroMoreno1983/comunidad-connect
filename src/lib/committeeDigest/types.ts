/**
 * Tipos del "Resumen semanal para el comité".
 *
 * Viven aquí y no en `src/lib/types.ts` porque ese archivo ya supera el tamaño
 * que admite la publicación por la API de GitHub; el agente que lo edite debe
 * poder subirlo completo. Se importan desde `@/lib/committeeDigest/types`.
 *
 * Todo lo que aparece en estas métricas es AGREGADO: conteos, porcentajes y
 * nombres de activos o temas. Nunca unidades, personas ni montos individuales.
 */

export type CommitteeDigestStatus = 'draft' | 'published' | 'discarded';
export type CommitteeDigestAudience = 'committee' | 'admins';
export type CommitteeDigestSource = 'ai' | 'fallback';

export interface CommitteeDigestWindow {
    /** Lunes (calendario chileno) de la semana de la edición: clave de idempotencia. */
    weekStart: string;
    /** Primer día revisado (hoy - 7). */
    periodStart: string;
    /** Último día revisado (ayer). */
    periodEnd: string;
    /** Hoy, en Chile. */
    today: string;
    /** Último día de "lo que viene" (hoy + 6). */
    upcomingEnd: string;
}

export interface CommitteeDigestMetrics {
    window: CommitteeDigestWindow;
    collection: {
        totalUnits: number;
        /** Unidades sin cobros vencidos. */
        unitsUpToDate: number;
        /** Porcentaje entero 0-100, null si la comunidad no tiene unidades. */
        upToDatePercent: number | null;
        activeAgreements: number;
        newAgreements: number;
        agreementsPendingCommittee: number;
    };
    maintenance: {
        openTasks: number;
        overdueTasks: number;
        completedTasks: number;
        upcomingPreventive: number;
        highRiskAssets: string[];
        pendingQuotes: number;
        /** Trabajos con cotizaciones recibidas que esperan una decisión. */
        quotesAwaitingDecision: number;
    };
    requests: {
        openRequests: number;
        newRequests: number;
        resolvedRequests: number;
        openCases: number;
        resolvedCases: number;
        /** Temas que se repiten (categoría de caso con 2 o más en 30 días). */
        recurringThemes: Array<{ theme: string; count: number }>;
    };
    community: {
        bookings: number;
        upcomingBookings: number;
        announcements: number;
        announcementTitles: string[];
        activePolls: Array<{ title: string; endsOn: string | null }>;
        pollsClosingSoon: number;
    };
}

export interface CommitteeDigestRecord {
    id: string;
    weekStart: string;
    periodStart: string;
    periodEnd: string;
    status: CommitteeDigestStatus;
    audience: CommitteeDigestAudience;
    source: CommitteeDigestSource;
    content: string;
    metrics: CommitteeDigestMetrics;
    edited: boolean;
    editedAt: string | null;
    approvedAt: string | null;
    createdAt: string;
    updatedAt: string;
}

/** Lo que ve el comité: sin métricas crudas ni metadatos de edición. */
export interface CommitteeDigestPublished {
    id: string;
    weekStart: string;
    periodStart: string;
    periodEnd: string;
    content: string;
    approvedAt: string | null;
}

export interface CommitteeDigestAdminView {
    digests: CommitteeDigestRecord[];
    hasCommittee: boolean;
}

export type CommitteeDigestPrivacyIssue = 'amount' | 'unit' | 'person' | 'debtor_language' | 'threat' | 'contact';

export interface CommitteeDigestPrivacyResult {
    ok: boolean;
    issues: CommitteeDigestPrivacyIssue[];
}
