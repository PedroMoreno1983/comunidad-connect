import type { CommunityBoat, CommunityBoatInput } from '../types';

/** Embarcaciones de la comunidad (módulo "Vida junto al lago"). */

async function readJson<T>(response: Response): Promise<T> {
    const data = await response.json().catch(() => null) as (T & { error?: string }) | null;
    if (!response.ok || !data) throw new Error(data?.error || 'La solicitud no pudo completarse.');
    return data;
}

export const BoatsService = {
    async list(): Promise<{ boats: CommunityBoat[]; canSeeAll: boolean }> {
        return readJson(await fetch('/api/boats', { cache: 'no-store' }));
    },

    async create(input: CommunityBoatInput): Promise<CommunityBoat> {
        const data = await readJson<{ boat: CommunityBoat }>(await fetch('/api/boats', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
        }));
        return data.boat;
    },

    async remove(id: string): Promise<void> {
        await readJson<{ ok: true }>(await fetch(`/api/boats?id=${encodeURIComponent(id)}`, { method: 'DELETE' }));
    },
};
