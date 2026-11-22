import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { changeCaseStatus } from '@/lib/cases/caseStatus';
import { reviewSupermarketGroupOrder } from '@/lib/supermarketGroupOrders';
import type { UserRole } from '@/lib/types';

/**
 * Trabajo diario de la administración por CoCo: ver los casos abiertos y
 * cambiarles el estado, y aprobar o rechazar lo que los vecinos publican
 * (estacionamientos, bodegas) o proponen (compras comunitarias).
 *
 * Quien actúa sale del perfil autenticado; el modelo solo elige qué revisar.
 * Aprobar y rechazar siguen las reglas de la pantalla: solo lo que espera
 * aprobación, y rechazar exige motivo.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
type Row = Record<string, unknown>;
export type AdminActor = { id: string; role: string; communityId: string; name: string | null };

// ── Casos ────────────────────────────────────────────────────────────────────

export async function listOpenCases(admin: SupabaseClient, communityId: string) {
    const { data, error } = await admin
        .from('coco_cases')
        .select('id, title, status, category, urgency, unit_id, unit_label, created_at')
        .eq('community_id', communityId)
        .in('status', ['open', 'in_progress'])
        .order('created_at', { ascending: false })
        .limit(25);
    if (error) return { error: 'No pude cargar los casos.' };
    const rows = (data ?? []) as Row[];
    // Los reclamos guardan unit_id pero no siempre unit_label (22-11-2026): se busca el número.
    const unitIds = [...new Set(rows.filter(row => !row.unit_label && row.unit_id).map(row => String(row.unit_id)))];
    const { data: units } = unitIds.length
        ? await admin.from('units').select('id, number, tower').in('id', unitIds)
        : { data: [] as Row[] };
    const unitName = new Map((units ?? []).map(unit => [String(unit.id), [unit.tower, unit.number].filter(Boolean).join(' ')]));
    return {
        total: rows.length,
        casos: rows.map(row => ({
            case_id: row.id, titulo: row.title, estado: row.status, categoria: row.category,
            urgencia: row.urgency, unidad: row.unit_label || unitName.get(String(row.unit_id)) || 'sin unidad', creado: String(row.created_at ?? '').slice(0, 10),
        })),
        nota: rows.length ? undefined : 'No hay casos abiertos.',
    };
}

export async function updateCaseStatusForStaff(admin: SupabaseClient, actor: AdminActor, input: Record<string, unknown>) {
    const caseId = text(input.case_id, 36);
    if (!UUID.test(caseId)) return { error: 'Necesito el case_id que devuelve list_open_cases.' };
    const result = await changeCaseStatus(admin, actor, caseId, text(input.status, 20), 'coco');
    if ('error' in result) return { error: result.error };
    const statusLabel: Record<string, string> = { open: 'abierto', in_progress: 'en curso', resolved: 'resuelto', closed: 'cerrado', cancelled: 'cancelado' };
    const status = String(result.case.status);
    return { success: true, message: `El caso "${result.case.title}" quedó ${statusLabel[status] ?? status}. El residente recibe el aviso.` };
}

// ── Publicaciones de vecinos ─────────────────────────────────────────────────

export async function listPendingListings(admin: SupabaseClient, communityId: string) {
    const [spots, storage] = await Promise.all([
        admin.from('parking_spots').select('id, label, hourly_rate, daily_rate, monthly_rate, owner_id, created_at')
            .eq('community_id', communityId).eq('status', 'pending_approval').limit(20),
        admin.from('storage_units').select('id, label, monthly_rate, owner_id, created_at')
            .eq('community_id', communityId).eq('status', 'pending_approval').limit(20),
    ]);
    if (spots.error || storage.error) return { error: 'No pude cargar las publicaciones pendientes.' };
    const ownerIds = [...new Set([...(spots.data ?? []), ...(storage.data ?? [])].map(row => String((row as Row).owner_id)))];
    const { data: owners } = ownerIds.length
        ? await admin.from('profiles').select('id, name, department_number').in('id', ownerIds)
        : { data: [] };
    const ownerOf = new Map(((owners ?? []) as Row[]).map(o => [String(o.id), `${o.name || 'Vecino'}${o.department_number ? ` (depto ${o.department_number})` : ''}`]));
    const pesos = (n: unknown) => (Number(n) > 0 ? `$${Number(n).toLocaleString('es-CL')}` : null);
    return {
        estacionamientos: ((spots.data ?? []) as Row[]).map(row => ({
            listing_id: row.id, tipo: 'estacionamiento', nombre: row.label, dueño: ownerOf.get(String(row.owner_id)),
            precios: [['hora', row.hourly_rate], ['día', row.daily_rate], ['mes', row.monthly_rate]].filter(([, v]) => pesos(v)).map(([u, v]) => `${pesos(v)} por ${u}`).join(', '),
        })),
        bodegas: ((storage.data ?? []) as Row[]).map(row => ({
            listing_id: row.id, tipo: 'bodega', nombre: row.label, dueño: ownerOf.get(String(row.owner_id)), precio_mensual: pesos(row.monthly_rate),
        })),
    };
}

/** true/false, o su texto: el modelo a veces manda "true" como string (prueba de punta a punta, 22-11-2026). */
function booleanInput(value: unknown): boolean | undefined {
    if (typeof value === 'boolean') return value;
    const t = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (['true', 'sí', 'si', 'aprobar'].includes(t)) return true;
    if (['false', 'no', 'rechazar'].includes(t)) return false;
    return undefined;
}

export async function reviewListingForAdmin(admin: SupabaseClient, actor: AdminActor, input: Record<string, unknown>) {
    const kind = text(input.kind, 20);
    const table = kind === 'parking' ? 'parking_spots' : kind === 'storage' ? 'storage_units' : null;
    if (!table) return { error: 'Indica si es un estacionamiento (parking) o una bodega (storage).' };
    const listingId = text(input.listing_id, 36);
    if (!UUID.test(listingId)) return { error: 'Necesito el listing_id que devuelve list_pending_listings.' };
    const approve = booleanInput(input.approve);
    if (approve === undefined) return { error: 'Indica si se aprueba (approve: true) o se rechaza (false).' };
    const reason = text(input.reason, 300);
    if (!approve && !reason) return { error: 'Para rechazar necesito el motivo; el vecino lo verá.' };

    const { data: listing } = await admin.from(table).select('id, label, community_id, status').eq('id', listingId).maybeSingle();
    if (!listing || listing.community_id !== actor.communityId) return { error: 'No encontré esa publicación en tu comunidad.' };
    if (listing.status !== 'pending_approval') return { error: `"${listing.label}" no está esperando aprobación (estado: ${listing.status}).` };

    const { error } = await admin.from(table).update({
        status: approve ? 'published' : 'rejected',
        approved_by: approve ? actor.id : null,
        approved_at: approve ? new Date().toISOString() : null,
        rejection_reason: approve ? null : reason,
    }).eq('id', listingId).eq('community_id', actor.communityId).eq('status', 'pending_approval');
    if (error) return { error: 'No se pudo guardar la revisión.' };
    return {
        success: true,
        message: approve
            ? `Aprobé "${listing.label}": ya aparece para los vecinos.`
            : `Rechacé "${listing.label}". El vecino ve el motivo: ${reason}`,
    };
}

export async function reviewGroupOrderForAdmin(actor: AdminActor, input: Record<string, unknown>) {
    const orderId = text(input.order_id, 36);
    if (!UUID.test(orderId)) return { error: 'Necesito el order_id que devuelve list_supermarket_group_orders.' };
    const approve = booleanInput(input.approve);
    if (approve === undefined) return { error: 'Indica si se aprueba (approve: true) o se rechaza (false).' };
    try {
        const order = await reviewSupermarketGroupOrder(
            { id: actor.id, name: actor.name, role: actor.role as UserRole, community_id: actor.communityId },
            orderId, approve, undefined, text(input.note, 500),
        );
        return {
            success: true,
            message: approve
                ? `Aprobé la compra comunitaria "${order.title}". Los vecinos ya pueden sumarse.`
                : `Rechacé la compra comunitaria "${order.title}".`,
        };
    } catch (error) {
        return { error: error instanceof Error ? error.message : 'No se pudo revisar la compra comunitaria.' };
    }
}
