import type { AssemblyMatter, AssemblySummary, AssemblyView, AttendanceCapacity, AttendanceMode, ProxyKind, VoteChoice } from '@/lib/assemblies/types';

/**
 * Cliente de "Asambleas" (Ley 21.442). Módulo aparte de `src/lib/api.ts` (ese
 * archivo supera el tamaño publicable); mismo patrón de Service: las páginas no
 * hablan con Supabase, llaman a `/api/assemblies`.
 */
async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, { cache: 'no-store', ...init });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error((data as { error?: string }).error || 'No se pudo completar la solicitud.') as Error & { status?: number };
        error.status = response.status;
        throw error;
    }
    return data as T;
}

function post<T = AssemblyView>(action: string, body: Record<string, unknown> = {}) {
    return request<T>('/api/assemblies', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...body }),
    });
}

export interface AssemblyDraftPayload {
    title: string;
    sessionType: string;
    modality: string;
    scheduledAt: string;
    location: string;
    videoUrl: string;
    requestReceivedOn: string | null;
    requestRightsShare: number | null;
    secretaryProfileId: string | null;
    notaryName: string;
    items: { matterCode: string; title: string; description: string }[];
}

export const AssemblyService = {
    list: () => request<{ assemblies: AssemblySummary[]; isCommittee: boolean }>('/api/assemblies'),
    get: (assemblyId: string) => request<AssemblyView>(`/api/assemblies?id=${encodeURIComponent(assemblyId)}`),
    catalog: () => request<{ matters: AssemblyMatter[]; residents: { id: string; name: string }[] }>('/api/assemblies?catalog=1'),
    create: (draft: AssemblyDraftPayload) => post('create', { ...draft }),
    update: (assemblyId: string, draft: AssemblyDraftPayload) => post('update', { assemblyId, ...draft }),
    draftCitation: (assemblyId: string) => post('draft_citation', { assemblyId }),
    publish: (assemblyId: string, citationText?: string) => post<{ view: AssemblyView; notified: number }>('publish', { assemblyId, citationText }),
    cancel: (assemblyId: string) => post('cancel', { assemblyId }),
    rsvp: (assemblyId: string, unitId: string, mode: AttendanceMode, attending = true) => post('rsvp', { assemblyId, unitId, mode, attending }),
    registerProxy: (assemblyId: string, proxy: { unitId: string; kind: ProxyKind; proxyProfileId?: string | null; proxyName?: string; coversReinforced?: boolean; documentNote?: string }) =>
        post('register_proxy', { assemblyId, ...proxy }),
    reviewProxy: (assemblyId: string, proxyId: string, decision: 'accept' | 'reject' | 'revoke') => post('review_proxy', { assemblyId, proxyId, decision }),
    start: (assemblyId: string) => post('start', { assemblyId }),
    checkIn: (assemblyId: string, input: { unitId: string; capacity: AttendanceCapacity; attendeeProfileId?: string | null; attendeeName?: string; proxyId?: string | null; mode: AttendanceMode; verified: boolean }) =>
        post('check_in', { assemblyId, ...input }),
    verifyAttendance: (assemblyId: string, attendanceId: string) => post('verify_attendance', { assemblyId, attendanceId }),
    markLeft: (assemblyId: string, attendanceId: string) => post('mark_left', { assemblyId, attendanceId }),
    certifyEligibility: (assemblyId: string) => post('certify_eligibility', { assemblyId }),
    requestAgreement: (assemblyId: string, unitId: string) => post<{ view: AssemblyView; message: string }>('request_agreement', { assemblyId, unitId }),
    openVote: (assemblyId: string, itemId: string) => post('open_vote', { assemblyId, itemId }),
    castVote: (assemblyId: string, itemId: string, unitId: string, choice: VoteChoice) => post('cast_vote', { assemblyId, itemId, unitId, choice }),
    recordVote: (assemblyId: string, itemId: string, unitId: string, choice: VoteChoice) => post('record_vote', { assemblyId, itemId, unitId, choice }),
    verifyVote: (assemblyId: string, voteId: string) => post('verify_vote', { assemblyId, voteId }),
    closeVote: (assemblyId: string, itemId: string, force = false, notes = '') => post('close_vote', { assemblyId, itemId, force, notes }),
    close: (assemblyId: string) => post('close', { assemblyId }),
    regenerateMinutes: (assemblyId: string) => post('regenerate_minutes', { assemblyId }),
    saveMinutes: (assemblyId: string, content: string) => post('save_minutes', { assemblyId, content }),
    signMinutes: (assemblyId: string, signers: string, content?: string) => post('sign_minutes', { assemblyId, signers, content }),
};
