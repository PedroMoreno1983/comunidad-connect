import { supabase } from '../supabase';
import type {
    StorageRental,
    StorageRentalStatus,
    StorageSearchResult,
    StorageUnit,
    StorageUnitInput,
    StorageUnitStatus,
} from '../types';

/**
 * Bodegas: arriendo mensual entre vecinos.
 *
 * Las lecturas van por RLS (cada quien ve las publicadas de su comunidad, las
 * suyas, y la administración todas). Arrendar, cancelar y aprobar van por
 * funciones de la base, que validan comunidad y rol, impiden arriendos
 * superpuestos y generan un cargo mensual en gastos comunes.
 */

type Row = Record<string, unknown>;

const STORAGE_COLUMNS = 'id,community_id,owner_id,label,description,floor_level,area_m2,monthly_rate,min_months,status,rejection_reason,created_at';
const RENTAL_COLUMNS = 'id,storage_id,owner_id,tenant_id,starts_on,ends_on,months,monthly_rate,total_amount,status,cancel_reason,created_at,storage_units(label)';

const text = (value: unknown) => (typeof value === 'string' ? value : '');
const num = (value: unknown) => {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};
const nullableNum = (value: unknown) => (value === null || value === undefined ? null : num(value));

function mapStorageUnit(row: Row): StorageUnit {
    return {
        id: text(row.id),
        communityId: text(row.community_id),
        ownerId: text(row.owner_id),
        label: text(row.label),
        description: text(row.description),
        floorLevel: text(row.floor_level),
        areaM2: nullableNum(row.area_m2),
        monthlyRate: num(row.monthly_rate),
        minMonths: num(row.min_months) || 1,
        status: text(row.status) as StorageUnitStatus,
        rejectionReason: text(row.rejection_reason) || null,
        createdAt: text(row.created_at),
    };
}

function mapRental(row: Row): StorageRental {
    const unit = row.storage_units as { label?: string } | null;
    return {
        id: text(row.id),
        storageId: text(row.storage_id),
        storageLabel: unit?.label || 'Bodega',
        ownerId: text(row.owner_id),
        tenantId: text(row.tenant_id),
        startsOn: text(row.starts_on),
        endsOn: text(row.ends_on),
        months: num(row.months),
        monthlyRate: num(row.monthly_rate),
        totalAmount: num(row.total_amount),
        status: text(row.status) as StorageRentalStatus,
        cancelReason: text(row.cancel_reason) || null,
        createdAt: text(row.created_at),
    };
}

function cleanInput(input: Partial<StorageUnitInput>): Row {
    const row: Row = {};
    if (input.label !== undefined) row.label = input.label.trim().slice(0, 40);
    if (input.description !== undefined) row.description = input.description.trim().slice(0, 500);
    if (input.floorLevel !== undefined) row.floor_level = input.floorLevel.trim().slice(0, 20);
    if (input.areaM2 !== undefined) row.area_m2 = input.areaM2 && input.areaM2 > 0 ? input.areaM2 : null;
    if (input.monthlyRate !== undefined) row.monthly_rate = Math.round(input.monthlyRate);
    if (input.minMonths !== undefined) row.min_months = Math.min(24, Math.max(1, Math.round(input.minMonths)));
    return row;
}

/** Primer día de mes en formato YYYY-MM-DD, la fecha de inicio por defecto. */
export function nextStorageStartDate(today = new Date()): string {
    const next = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
    return next.toISOString().slice(0, 10);
}

export const StorageService = {
    /** Bodegas libres en el período, sin las propias. */
    async search(startsOn: string, months: number): Promise<StorageSearchResult[]> {
        const { data, error } = await supabase.rpc('search_storage_units', {
            p_starts_on: startsOn,
            p_months: months,
        });
        if (error) throw new Error(error.message);
        return ((data || []) as Row[]).map(row => ({
            id: text(row.id),
            label: text(row.label),
            description: text(row.description),
            floorLevel: text(row.floor_level),
            areaM2: nullableNum(row.area_m2),
            monthlyRate: num(row.monthly_rate),
            minMonths: num(row.min_months) || 1,
            ownerId: text(row.owner_id),
            ownerName: text(row.owner_name) || 'Vecino',
            totalAmount: num(row.total_amount),
        }));
    },

    async rent(storageId: string, startsOn: string, months: number): Promise<string> {
        const { data, error } = await supabase.rpc('rent_storage_unit', {
            p_storage_id: storageId,
            p_starts_on: startsOn,
            p_months: months,
        });
        if (error) throw new Error(error.message);
        return String(data);
    },

    /** Anula el arriendo y los cargos pendientes de los meses que no empiezan. Devuelve cuántos anuló. */
    async cancelRental(rentalId: string, reason = ''): Promise<number> {
        const { data, error } = await supabase.rpc('cancel_storage_rental', {
            p_rental_id: rentalId,
            p_reason: reason,
        });
        if (error) throw new Error(error.message);
        return num(data);
    },

    async getMyUnits(userId: string): Promise<StorageUnit[]> {
        const { data, error } = await supabase
            .from('storage_units')
            .select(STORAGE_COLUMNS)
            .eq('owner_id', userId)
            .order('created_at', { ascending: false });
        if (error) throw new Error(error.message);
        return ((data || []) as Row[]).map(mapStorageUnit);
    },

    async createUnit(userId: string, communityId: string, input: StorageUnitInput): Promise<StorageUnit> {
        const { data, error } = await supabase
            .from('storage_units')
            .insert({ ...cleanInput(input), owner_id: userId, community_id: communityId, status: 'pending_approval' })
            .select(STORAGE_COLUMNS)
            .single();
        if (error || !data) throw new Error(error?.message || 'No se pudo publicar la bodega.');
        return mapStorageUnit(data as Row);
    },

    async updateUnit(storageId: string, input: Partial<StorageUnitInput>): Promise<StorageUnit> {
        const { data, error } = await supabase
            .from('storage_units')
            .update(cleanInput(input))
            .eq('id', storageId)
            .select(STORAGE_COLUMNS)
            .single();
        if (error || !data) throw new Error(error?.message || 'No se pudo actualizar la bodega.');
        return mapStorageUnit(data as Row);
    },

    /** Pausa o retoma una bodega ya aprobada; tras un rechazo, la reenvía a revisión. */
    async setUnitStatus(storageId: string, status: Extract<StorageUnitStatus, 'paused' | 'published' | 'pending_approval'>): Promise<void> {
        const { error } = await supabase.from('storage_units').update({ status }).eq('id', storageId);
        if (error) throw new Error(error.message);
    },

    async deleteUnit(storageId: string): Promise<void> {
        const { error } = await supabase.from('storage_units').delete().eq('id', storageId);
        if (error) {
            throw new Error(/foreign key|violates/i.test(error.message)
                ? 'Tiene arriendos registrados: páusala en vez de borrarla.'
                : error.message);
        }
    },

    /** Arriendos donde participo, como arrendatario o como dueño. */
    async getMyRentals(userId: string): Promise<{ asTenant: StorageRental[]; asOwner: StorageRental[] }> {
        const { data, error } = await supabase
            .from('storage_rentals')
            .select(RENTAL_COLUMNS)
            .or(`tenant_id.eq.${userId},owner_id.eq.${userId}`)
            .order('starts_on', { ascending: false });
        if (error) throw new Error(error.message);
        const rentals = ((data || []) as Row[]).map(mapRental);
        return {
            asTenant: rentals.filter(rental => rental.tenantId === userId),
            asOwner: rentals.filter(rental => rental.ownerId === userId),
        };
    },

    // ── Administración ──────────────────────────────────────────
    async getCommunityUnits(communityId: string): Promise<StorageUnit[]> {
        const { data, error } = await supabase
            .from('storage_units')
            .select(STORAGE_COLUMNS)
            .eq('community_id', communityId)
            .order('created_at', { ascending: false });
        if (error) throw new Error(error.message);
        return ((data || []) as Row[]).map(mapStorageUnit);
    },

    async getCommunityRentals(communityId: string): Promise<StorageRental[]> {
        const { data, error } = await supabase
            .from('storage_rentals')
            .select(RENTAL_COLUMNS)
            .eq('community_id', communityId)
            .order('starts_on', { ascending: false });
        if (error) throw new Error(error.message);
        return ((data || []) as Row[]).map(mapRental);
    },

    async reviewUnit(storageId: string, approved: boolean, reason = ''): Promise<void> {
        const { error } = await supabase.rpc('review_storage_unit', {
            p_storage_id: storageId,
            p_approved: approved,
            p_reason: reason,
        });
        if (error) throw new Error(error.message);
    },
};
