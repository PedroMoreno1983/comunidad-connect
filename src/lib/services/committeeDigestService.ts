import type { CommitteeDigestAdminView, CommitteeDigestPublished, CommitteeDigestRecord } from '@/lib/committeeDigest/types';

/**
 * Cliente del "Resumen semanal para el comité". Va en un módulo aparte de
 * `src/lib/api.ts` (ese archivo supera el tamaño publicable); sigue el mismo
 * patrón de Service: las páginas no hablan con Supabase, llaman a la API.
 */
async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, { cache: 'no-store', ...init });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error((data as { error?: string }).error || 'No se pudo completar la solicitud.');
    return data as T;
}

function post<T>(body: Record<string, unknown>) {
    return request<T>('/api/agent-center/committee-digest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
}

export const CommitteeDigestService = {
    async getAdminView(): Promise<CommitteeDigestAdminView> {
        return request<CommitteeDigestAdminView>('/api/agent-center/committee-digest');
    },
    async generate(): Promise<{ created: boolean; digest: CommitteeDigestRecord }> {
        return post({ action: 'generate' });
    },
    async saveDraft(digestId: string, content: string): Promise<CommitteeDigestRecord> {
        return (await post<{ digest: CommitteeDigestRecord }>({ action: 'update', digestId, content })).digest;
    },
    async approve(digestId: string, content?: string): Promise<{ digest: CommitteeDigestRecord; notified: number; alreadyPublished: boolean }> {
        return post({ action: 'approve', digestId, content });
    },
    async getPublished(): Promise<CommitteeDigestPublished[]> {
        return (await request<{ digests: CommitteeDigestPublished[] }>('/api/committee-digests')).digests;
    },
};
