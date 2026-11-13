import type {
    NetworkProviderAction,
    NetworkProviderInput,
    ProviderDocument,
    ProviderDocumentKind,
    ProviderInviteLink,
    ProviderMediaTarget,
    ProviderWorkPhoto,
    ProviderPortalData,
    ProviderProfileInput,
    ServiceRequestStatus,
    SuperAdminProvidersResponse,
} from '../types';

/**
 * Perfil de proveedor y portal del maestro externo. Todo pasa por rutas de la
 * API, que validan quién puede editar (el propio maestro o la administración) y
 * reservan la verificación para la administración.
 */

async function readJson<T>(response: Response): Promise<T> {
    const data = await response.json().catch(() => null) as (T & { error?: string }) | null;
    if (!response.ok || !data) throw new Error(data?.error || 'La solicitud no pudo completarse.');
    return data;
}

export const ProviderProfileService = {
    async update(providerId: string, input: ProviderProfileInput): Promise<void> {
        await readJson(await fetch(`/api/providers/${encodeURIComponent(providerId)}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
        }));
    },

    /** Solo administración. */
    async setVerified(providerId: string, verified: boolean): Promise<void> {
        await readJson(await fetch(`/api/providers/${encodeURIComponent(providerId)}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ verified }),
        }));
    },

    /** Solo administración: enlace para que un maestro sin cuenta gestione su perfil y solicitudes. */
    async createInvite(providerId: string): Promise<ProviderInviteLink> {
        return readJson<ProviderInviteLink>(await fetch(`/api/providers/${encodeURIComponent(providerId)}/invite`, { method: 'POST' }));
    },
};

export const ProviderPortalService = {
    async load(token: string): Promise<ProviderPortalData> {
        return readJson<ProviderPortalData>(await fetch(`/api/provider-portal/${encodeURIComponent(token)}`, { cache: 'no-store' }));
    },

    async updateProfile(token: string, input: ProviderProfileInput): Promise<void> {
        await readJson(await fetch(`/api/provider-portal/${encodeURIComponent(token)}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
        }));
    },

    async updateRequest(token: string, requestId: string, status: ServiceRequestStatus, schedule?: { date: string; time: string }): Promise<void> {
        await readJson(await fetch(`/api/provider-portal/${encodeURIComponent(token)}/requests/${encodeURIComponent(requestId)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status, preferredDate: schedule?.date, preferredTime: schedule?.time }),
        }));
    },
};

/** Red Convive de maestros: solo superadmin (las rutas lo comprueban). */
export const ProviderNetworkService = {
    /** `search` filtra por nombre en el servidor (la red y los candidatos de las comunidades). */
    async load(search = ''): Promise<SuperAdminProvidersResponse> {
        const query = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : '';
        return readJson<SuperAdminProvidersResponse>(await fetch(`/api/superadmin/providers${query}`, { cache: 'no-store' }));
    },

    async create(input: NetworkProviderInput): Promise<{ id: string }> {
        return readJson<{ id: string }>(await fetch('/api/superadmin/providers', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
        }));
    },

    async act(providerId: string, action: NetworkProviderAction): Promise<void> {
        await readJson(await fetch(`/api/superadmin/providers/${encodeURIComponent(providerId)}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action),
        }));
    },

    async createInvite(providerId: string): Promise<ProviderInviteLink> {
        return readJson<ProviderInviteLink>(await fetch(`/api/superadmin/providers/${encodeURIComponent(providerId)}/invite`, { method: 'POST' }));
    },
};

function mediaBase(target: ProviderMediaTarget) {
    return target.kind === 'provider'
        ? `/api/providers/${encodeURIComponent(target.id)}`
        : `/api/provider-portal/${encodeURIComponent(target.token)}`;
}

/**
 * Foto de perfil, fotos de trabajos y documentos del maestro. Funciona con
 * sesión (el maestro o la administración) o con el enlace del maestro.
 */
export const ProviderMediaService = {
    async uploadPhoto(target: ProviderMediaTarget, kind: 'profile' | 'work', file: File, caption?: string): Promise<{ url: string }> {
        const form = new FormData();
        form.set('kind', kind);
        form.set('file', file);
        if (caption) form.set('caption', caption);
        return readJson<{ url: string }>(await fetch(`${mediaBase(target)}/media`, { method: 'POST', body: form }));
    },

    /** Con sesión (el maestro o la administración). */
    async listWorkPhotos(providerId: string): Promise<ProviderWorkPhoto[]> {
        const data = await readJson<{ photos: ProviderWorkPhoto[] }>(await fetch(`/api/providers/${encodeURIComponent(providerId)}/media`, { cache: 'no-store' }));
        return data.photos;
    },

    async deletePhoto(target: ProviderMediaTarget, photoId: string): Promise<void> {
        await readJson(await fetch(`${mediaBase(target)}/media?photoId=${encodeURIComponent(photoId)}`, { method: 'DELETE' }));
    },

    async uploadDocument(target: ProviderMediaTarget, kind: ProviderDocumentKind, file: File): Promise<{ id: string; verdict: string }> {
        const form = new FormData();
        form.set('kind', kind);
        form.set('file', file);
        return readJson<{ id: string; verdict: string }>(await fetch(`${mediaBase(target)}/documents`, { method: 'POST', body: form }));
    },

    /** Con sesión. La administración recibe además el chequeo y el enlace temporal. */
    async listDocuments(providerId: string, scope: 'admin' | 'superadmin' = 'admin'): Promise<ProviderDocument[]> {
        const url = scope === 'superadmin'
            ? `/api/superadmin/providers/${encodeURIComponent(providerId)}/documents`
            : `/api/providers/${encodeURIComponent(providerId)}/documents`;
        const data = await readJson<{ documents: ProviderDocument[] }>(await fetch(url, { cache: 'no-store' }));
        return data.documents;
    },

    async reviewDocument(providerId: string, scope: 'admin' | 'superadmin', documentId: string, approve: boolean, note?: string): Promise<void> {
        const url = scope === 'superadmin'
            ? `/api/superadmin/providers/${encodeURIComponent(providerId)}/documents`
            : `/api/providers/${encodeURIComponent(providerId)}/documents`;
        await readJson(await fetch(url, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ documentId, approve, note }),
        }));
    },
};
