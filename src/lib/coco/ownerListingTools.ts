import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * El residente administra lo que publicó (estacionamiento o bodega): verlo,
 * cambiar precio o descripción, pausarlo o retomarlo, y retirarlo.
 *
 * Reglas, iguales para los dos tipos (las de storage_units_guard, que en
 * estacionamientos la base no impone y aquí sí):
 *   - Pausar solo lo publicado; retomar solo lo que la administración aprobó
 *     alguna vez; tras un rechazo, reenviar a revisión. Nadie se autoaprueba.
 *   - Retirar solo si no tiene reservas ni arriendos registrados: borrar un
 *     estacionamiento borra en cascada sus reservas (y su historial de
 *     cobros). Con historial, se pausa.
 * Siempre sobre lo propio: el dueño es el perfil autenticado.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const pesos = (value: unknown) => {
    if (value === undefined || value === null || value === '') return undefined;
    const n = Math.round(Number(value));
    return Number.isFinite(n) && n >= 0 ? n : NaN;
};
type Row = Record<string, unknown>;
type Kind = 'parking' | 'storage';
const TABLE: Record<Kind, string> = { parking: 'parking_spots', storage: 'storage_units' };

function kindOf(value: unknown): Kind | null {
    return value === 'parking' || value === 'storage' ? value : null;
}

async function loadOwn(admin: SupabaseClient, kind: Kind, listingId: string, userId: string) {
    const { data } = await admin.from(TABLE[kind]).select('id, label, status, approved_at, owner_id').eq('id', listingId).maybeSingle();
    return data && data.owner_id === userId ? data as Row : null;
}

export async function listMyListings(admin: SupabaseClient, userId: string) {
    const [spots, storage] = await Promise.all([
        admin.from('parking_spots').select('id, label, status, hourly_rate, daily_rate, monthly_rate, rejection_reason').eq('owner_id', userId),
        admin.from('storage_units').select('id, label, status, monthly_rate, rejection_reason').eq('owner_id', userId),
    ]);
    if (spots.error || storage.error) return { error: 'No pude cargar tus publicaciones.' };
    const all = [
        ...((spots.data ?? []) as Row[]).map(row => ({ kind: 'parking', listing_id: row.id, nombre: row.label, estado: row.status, por_hora: row.hourly_rate, por_dia: row.daily_rate, por_mes: row.monthly_rate, motivo_rechazo: row.rejection_reason || undefined })),
        ...((storage.data ?? []) as Row[]).map(row => ({ kind: 'storage', listing_id: row.id, nombre: row.label, estado: row.status, por_mes: row.monthly_rate, motivo_rechazo: row.rejection_reason || undefined })),
    ];
    return { publicaciones: all, nota: all.length ? undefined : 'No tienes estacionamientos ni bodegas publicados.' };
}

export async function updateMyListing(admin: SupabaseClient, userId: string, input: Record<string, unknown>) {
    const kind = kindOf(input.kind);
    const listingId = text(input.listing_id, 36);
    if (!kind || !UUID.test(listingId)) return { error: 'Necesito kind (parking o storage) y el listing_id de list_my_listings.' };
    const listing = await loadOwn(admin, kind, listingId, userId);
    if (!listing) return { error: 'No encontré esa publicación entre las tuyas.' };

    const patch: Row = {};
    const description = text(input.description, 500);
    if (description) patch.description = description;
    const monthly = pesos(input.monthly_rate);
    if (kind === 'storage') {
        if (monthly !== undefined) {
            if (!(monthly > 0 && monthly <= 2_000_000)) return { error: 'El precio mensual debe ser mayor que cero y hasta $2.000.000.' };
            patch.monthly_rate = monthly;
        }
    } else {
        const hourly = pesos(input.hourly_rate);
        const daily = pesos(input.daily_rate);
        for (const [key, value] of [['hourly_rate', hourly], ['daily_rate', daily], ['monthly_rate', monthly]] as const) {
            if (value === undefined) continue;
            if (Number.isNaN(value)) return { error: 'Los precios deben ser montos en pesos.' };
            patch[key] = key === 'hourly_rate' ? value : value || null;
        }
    }
    if (!Object.keys(patch).length) return { error: 'Dime qué cambiar: el precio o la descripción.' };

    const { error } = await admin.from(TABLE[kind]).update(patch).eq('id', listingId).eq('owner_id', userId);
    if (error) return { error: error.message || 'No se pudo actualizar la publicación.' };
    return { success: true, message: `Actualicé "${listing.label}". Las reservas o arriendos ya confirmados mantienen su precio.` };
}

export async function setMyListingStatus(admin: SupabaseClient, userId: string, input: Record<string, unknown>) {
    const kind = kindOf(input.kind);
    const listingId = text(input.listing_id, 36);
    const action = text(input.action, 10);
    if (!kind || !UUID.test(listingId)) return { error: 'Necesito kind (parking o storage) y el listing_id de list_my_listings.' };
    const listing = await loadOwn(admin, kind, listingId, userId);
    if (!listing) return { error: 'No encontré esa publicación entre las tuyas.' };

    let next: string;
    if (action === 'pause') {
        if (listing.status !== 'published') return { error: `"${listing.label}" no está publicada (estado: ${listing.status}); no hay nada que pausar.` };
        next = 'paused';
    } else if (action === 'resume') {
        if (listing.status !== 'paused' || !listing.approved_at) return { error: `"${listing.label}" solo se puede retomar si está pausada y la administración la aprobó antes.` };
        next = 'published';
    } else if (action === 'resubmit') {
        if (listing.status !== 'rejected' && listing.status !== 'draft') return { error: `"${listing.label}" no está rechazada; no hace falta reenviarla.` };
        next = 'pending_approval';
    } else {
        return { error: 'La acción debe ser pause, resume o resubmit.' };
    }

    const { error } = await admin.from(TABLE[kind]).update({ status: next }).eq('id', listingId).eq('owner_id', userId).eq('status', String(listing.status));
    if (error) return { error: 'No se pudo cambiar el estado.' };
    const done: Record<string, string> = { paused: 'quedó pausada: no aparece para nuevas reservas', published: 'está publicada otra vez', pending_approval: 'volvió a revisión de la administración' };
    return { success: true, message: `"${listing.label}" ${done[next]}.` };
}

export async function removeMyListing(admin: SupabaseClient, userId: string, input: Record<string, unknown>) {
    const kind = kindOf(input.kind);
    const listingId = text(input.listing_id, 36);
    if (!kind || !UUID.test(listingId)) return { error: 'Necesito kind (parking o storage) y el listing_id de list_my_listings.' };
    const listing = await loadOwn(admin, kind, listingId, userId);
    if (!listing) return { error: 'No encontré esa publicación entre las tuyas.' };

    const history = kind === 'parking'
        ? await admin.from('parking_bookings').select('id').eq('spot_id', listingId).limit(1)
        : await admin.from('storage_rentals').select('id').eq('storage_id', listingId).limit(1);
    if (history.error) return { error: 'No pude revisar sus reservas.' };
    if ((history.data ?? []).length) {
        return { error: `"${listing.label}" tiene reservas o arriendos registrados, y borrarla borraría ese historial. Puedo pausarla para que no reciba nuevas.` };
    }
    const { error } = await admin.from(TABLE[kind]).delete().eq('id', listingId).eq('owner_id', userId);
    if (error) return { error: 'No se pudo retirar la publicación.' };
    return { success: true, message: `Retiré "${listing.label}".` };
}
