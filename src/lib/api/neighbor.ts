import type { NeighborBuildingRow, NeighborInvitePreview, NeighborInviteShare, NeighborModeSummary, PendingResident } from '../types';

/**
 * Entrada por residente: contador de vecinos (modo vecino), edificios por
 * conquistar (superadmin) y validación de vecinos (administración).
 */

async function readJson<T>(response: Response): Promise<T> {
    const data = await response.json().catch(() => null) as (T & { error?: string }) | null;
    if (!response.ok || !data) throw new Error(data?.error || 'La solicitud no pudo completarse.');
    return data;
}

export const NeighborModeService = {
    async summary(): Promise<NeighborModeSummary | null> {
        const data = await readJson<{ summary: NeighborModeSummary | null }>(await fetch('/api/neighbor-mode/summary', { cache: 'no-store' }));
        return data.summary;
    },
};

export const NeighborBuildingsService = {
    async list(): Promise<NeighborBuildingRow[]> {
        const data = await readJson<{ buildings: NeighborBuildingRow[] }>(await fetch('/api/superadmin/buildings', { cache: 'no-store' }));
        return data.buildings;
    },

    async activate(communityId: string): Promise<{ name: string; adminCode: string; residents: number; warnings: string[] }> {
        return readJson(await fetch('/api/superadmin/buildings', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ communityId }),
        }));
    },
};

export const PendingResidentsService = {
    async list(): Promise<PendingResident[]> {
        const data = await readJson<{ residents: PendingResident[] }>(await fetch('/api/admin/pending-residents', { cache: 'no-store' }));
        return data.residents;
    },

    async decide(profileId: string, approve: boolean): Promise<void> {
        await readJson(await fetch('/api/admin/pending-residents', {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profileId, approve }),
        }));
    },
};

export const NeighborInviteService = {
    /** Mi enlace para invitar vecinos por WhatsApp. */
    async myInvite(): Promise<NeighborInviteShare> {
        const data = await readJson<{ invite: NeighborInviteShare }>(await fetch('/api/neighbor-invite', { cache: 'no-store' }));
        return data.invite;
    },

    /** Edificio y quién invita, para la página /unirse. null si la invitación no vale. */
    async preview(code: string): Promise<NeighborInvitePreview | null> {
        const response = await fetch(`/api/neighbor-invite/${encodeURIComponent(code)}`, { cache: 'no-store' });
        if (!response.ok) return null;
        const data = await response.json() as { preview: NeighborInvitePreview };
        return data.preview;
    },
};
