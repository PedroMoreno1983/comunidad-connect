import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { providerProfileUpdate } from '@/lib/services/providerProfile';
import { deleteWorkPhoto, listWorkPhotos, ProviderMediaError } from '@/lib/services/providerMedia';
import { recordOperationEvent } from '@/lib/operations/audit';

/**
 * Las últimas acciones de la interfaz que CoCo no hacía: borrar una
 * publicación del Marketplace, administrar convenios (estado, precio,
 * cotizaciones), editar el perfil de un maestro y borrar sus fotos, crear un
 * espacio común y fijar el dueño de una unidad.
 *
 * Mismos permisos que las rutas: lo propio o la administración de la
 * comunidad. Quien actúa es el perfil autenticado.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const likeSafe = (value: string) => value.replace(/[%_\\]/g, ' ').trim();
type Row = Record<string, unknown>;
export type GapActor = { id: string; role: string; communityId: string; email?: string | null };

// ── Marketplace ──────────────────────────────────────────────────────────────

export async function deleteMarketplaceItem(admin: SupabaseClient, actor: GapActor, input: Record<string, unknown>) {
    const itemId = text(input.item_id, 36);
    const title = likeSafe(text(input.title, 120));
    let query = admin.from('marketplace_items').select('id, title, seller_id, community_id').eq('community_id', actor.communityId).limit(6);
    // El vendedor borra lo suyo; la administración puede borrar cualquiera de la comunidad.
    if (actor.role !== 'admin') query = query.eq('seller_id', actor.id);
    if (UUID.test(itemId)) query = query.eq('id', itemId);
    else if (title) query = query.ilike('title', `%${title}%`);
    else return { error: 'Dime qué publicación borrar (el título basta).' };
    const { data, error } = await query;
    if (error) return { error: 'No pude buscar la publicación.' };
    const items = (data ?? []) as Row[];
    if (!items.length) return { error: 'No encontré esa publicación entre las que puedes borrar.' };
    if (items.length > 1) return { error: 'Hay varias parecidas. Pregunta cuál y vuelve a llamar con su item_id.', publicaciones: items.map(i => ({ item_id: i.id, titulo: i.title })) };
    const item = items[0];
    const { error: deleteError } = await admin.from('marketplace_items').delete().eq('id', String(item.id)).eq('community_id', actor.communityId);
    if (deleteError) return { error: 'No se pudo borrar la publicación.' };
    await recordOperationEvent({
        communityId: actor.communityId, actorId: actor.id, actorRole: actor.role,
        action: 'marketplace_item.deleted', entityType: 'marketplace_item', entityId: String(item.id),
        severity: 'warning', status: 'success', summary: `Publicación borrada por CoCo: ${item.title}`,
        metadata: { sellerId: item.seller_id, via: 'coco' },
    });
    return { success: true, message: `Borré "${item.title}" del Marketplace.` };
}

// ── Convenios comunitarios (administración) ──────────────────────────────────

const DEAL_STATUSES = ['proposed', 'gauging', 'quoting', 'active', 'closed', 'rejected'] as const;

export async function updateCommunityDeal(admin: SupabaseClient, communityId: string, input: Record<string, unknown>) {
    const dealId = text(input.deal_id, 36);
    if (!UUID.test(dealId)) return { error: 'Necesito el deal_id que devuelve list_community_deals.' };
    const { data: deal } = await admin.from('community_deals').select('id, title, community_id').eq('id', dealId).maybeSingle();
    if (!deal || deal.community_id !== communityId) return { error: 'No encontré ese convenio en tu comunidad.' };

    const row: Row = {};
    const status = text(input.status, 12);
    if (status) {
        if (!(DEAL_STATUSES as readonly string[]).includes(status)) return { error: 'Estado no válido.' };
        row.status = status;
    }
    for (const [key, column] of [['deal_price', 'deal_price'], ['reference_price', 'reference_price']] as const) {
        if (input[key] === undefined || input[key] === '') continue;
        const n = Math.round(Number(input[key]));
        if (!Number.isFinite(n) || n < 0) return { error: 'Los precios deben ser montos en pesos.' };
        row[column] = n;
    }
    const quoteId = text(input.selected_quote_id, 36);
    if (quoteId) row.selected_quote_id = UUID.test(quoteId) ? quoteId : null;
    for (const [key, max] of [['terms', 3000], ['schedule', 300], ['review_note', 1000]] as const) {
        const value = text(input[key], max);
        if (value) row[key] = value;
    }
    for (const key of ['starts_on', 'ends_on'] as const) {
        const value = text(input[key], 10);
        if (value) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return { error: 'Las fechas van como AAAA-MM-DD.' };
            row[key] = value;
        }
    }
    if (!Object.keys(row).length) return { error: 'Dime qué cambiar del convenio.' };

    const { error } = await admin.from('community_deals').update(row).eq('id', dealId).eq('community_id', communityId);
    // El trigger community_deals_guard rechaza una cotización de otro convenio.
    if (error) return { error: error.message?.includes('cotización') ? 'Esa cotización no es de este convenio.' : 'No se pudo actualizar el convenio.' };
    return { success: true, message: `Actualicé el convenio "${deal.title}".` };
}

export async function deleteDealQuote(admin: SupabaseClient, communityId: string, input: Record<string, unknown>) {
    const quoteId = text(input.quote_id, 36);
    if (!UUID.test(quoteId)) return { error: 'Necesito el quote_id de la cotización.' };
    const { data: quote } = await admin.from('community_deal_quotes').select('id, provider_name, community_id').eq('id', quoteId).maybeSingle();
    if (!quote || quote.community_id !== communityId) return { error: 'No encontré esa cotización en tu comunidad.' };
    const { error } = await admin.from('community_deal_quotes').delete().eq('id', quoteId).eq('community_id', communityId);
    if (error) return { error: 'No se pudo borrar la cotización (si está elegida en el convenio, cambia primero la elegida).' };
    return { success: true, message: `Borré la cotización de ${quote.provider_name}.` };
}

// ── Maestros: perfil y fotos ─────────────────────────────────────────────────

async function resolveManagedProvider(admin: SupabaseClient, actor: GapActor, input: Record<string, unknown>) {
    const providerId = text(input.provider_id, 36);
    const name = likeSafe(text(input.provider_name, 120));
    let query = admin.from('service_providers').select('id, name, user_id, community_id').limit(6);
    if (UUID.test(providerId)) query = query.eq('id', providerId);
    else if (name) query = query.ilike('name', `%${name}%`).eq('community_id', actor.communityId);
    else query = query.eq('user_id', actor.id); // sin datos: el perfil de maestro del propio usuario
    const { data, error } = await query;
    if (error) return { error: 'No pude buscar el proveedor.' } as const;
    const rows = (data ?? []) as Row[];
    if (!rows.length) return { error: 'No encontré ese proveedor.' } as const;
    if (rows.length > 1) return { error: 'Hay varios proveedores con ese nombre. Pregunta cuál y vuelve a llamar con provider_id.', proveedores: rows.map(r => ({ provider_id: r.id, nombre: r.name })) } as const;
    const provider = rows[0];
    const isOwner = provider.user_id === actor.id;
    const isAdmin = actor.role === 'admin' && provider.community_id === actor.communityId;
    if (!isOwner && !isAdmin) {
        return { error: provider.community_id === null ? 'Ese maestro es de la Red Convive: lo gestiona Convive.' : 'Solo el maestro o la administración de su comunidad pueden editar su perfil.' } as const;
    }
    return { provider } as const;
}

export async function updateProviderProfile(admin: SupabaseClient, actor: GapActor, input: Record<string, unknown>) {
    const resolved = await resolveManagedProvider(admin, actor, input);
    if ('error' in resolved) return resolved;
    // Verificar es otra acción (review_provider_document): aquí no se acepta.
    const fields = (typeof input.fields === 'object' && input.fields ? input.fields : {}) as Record<string, unknown>;
    const { verified: _verified, ...profileFields } = fields;
    void _verified;
    const result = providerProfileUpdate(profileFields);
    if ('error' in result) return { error: result.error };
    if (!Object.keys(result.update).length) return { error: 'Dime qué cambiar: nombre, teléfono, correo, descripción, tarifa, especialidades…' };
    const { error } = await admin.from('service_providers').update(result.update).eq('id', String(resolved.provider.id));
    if (error) return { error: 'No se pudo actualizar el perfil.' };
    return { success: true, message: `Actualicé el perfil de ${resolved.provider.name}.` };
}

export async function listProviderPhotos(admin: SupabaseClient, actor: GapActor, input: Record<string, unknown>) {
    const resolved = await resolveManagedProvider(admin, actor, input);
    if ('error' in resolved) return resolved;
    const photos = await listWorkPhotos(String(resolved.provider.id));
    return { proveedor: resolved.provider.name, provider_id: resolved.provider.id, fotos: photos.map(p => ({ photo_id: p.id, descripcion: p.caption, subida: p.createdAt.slice(0, 10) })) };
}

export async function deleteProviderPhoto(admin: SupabaseClient, actor: GapActor, input: Record<string, unknown>) {
    const resolved = await resolveManagedProvider(admin, actor, input);
    if ('error' in resolved) return resolved;
    try {
        await deleteWorkPhoto(String(resolved.provider.id), text(input.photo_id, 36), { id: actor.id, role: actor.role, email: actor.email ?? null });
        return { success: true, message: 'Borré la foto del perfil.' };
    } catch (error) {
        return { error: error instanceof ProviderMediaError ? error.message : 'No se pudo borrar la foto.' };
    }
}

// ── Espacios comunes y unidades (administración) ─────────────────────────────

const AMENITY_ICONS = ['Calendar', 'Flame', 'Waves', 'PartyPopper', 'Dumbbell', 'Monitor'] as const;

export async function createAmenityForAdmin(admin: SupabaseClient, communityId: string, input: Record<string, unknown>) {
    const name = text(input.name, 80);
    if (name.length < 2) return { error: 'Dime el nombre del espacio (ej. "Quincho", "Sala multiuso").' };
    const capacity = Math.round(Number(input.max_capacity ?? 12));
    const rate = Math.round(Number(input.hourly_rate ?? 0));
    if (!Number.isFinite(capacity) || capacity < 1 || capacity > 1000) return { error: 'La capacidad debe estar entre 1 y 1.000 personas.' };
    if (!Number.isFinite(rate) || rate < 0) return { error: 'La tarifa por hora debe ser cero o más.' };
    const icon = (AMENITY_ICONS as readonly string[]).includes(String(input.icon)) ? String(input.icon) : 'Calendar';
    const { data: existing } = await admin.from('amenities').select('id').eq('community_id', communityId).ilike('name', likeSafe(name)).maybeSingle();
    if (existing) return { error: `Ya hay un espacio llamado "${name}".` };
    const { error } = await admin.from('amenities').insert({
        community_id: communityId, name, description: text(input.description, 500), max_capacity: capacity,
        hourly_rate: rate, icon_name: icon, gradient: 'from-[#9C5636] to-[#733D24]', is_active: true,
    });
    if (error) return { error: 'No se pudo crear el espacio común.' };
    return { success: true, message: `Creé el espacio "${name}" (${capacity} personas${rate ? `, $${rate.toLocaleString('es-CL')} por hora` : ', sin costo'}). Ya se puede reservar.` };
}

export async function setUnitOwner(admin: SupabaseClient, communityId: string, input: Record<string, unknown>) {
    const number = text(input.unit_number, 20);
    if (!number) return { error: 'Dime el número de departamento.' };
    let unitQuery = admin.from('units').select('id, number, tower').eq('community_id', communityId).eq('number', number).limit(3);
    const tower = text(input.tower, 10);
    if (tower) unitQuery = unitQuery.eq('tower', tower);
    const { data: units } = await unitQuery;
    const matches = (units ?? []) as Row[];
    if (!matches.length) return { error: `No encontré el departamento ${number}.` };
    if (matches.length > 1) return { error: `Hay más de un ${number} (distintas torres). Dime la torre.` };

    let ownerId: string | null = null;
    let ownerName = '';
    // Propietario que todavía no tiene cuenta: se anota su nombre en la unidad
    // (antes fallaba con "No encontré a esa persona", 19-11-2026).
    let withoutAccount = false;
    if (input.clear !== true) {
        const typedName = text(input.resident_name, 80);
        const name = likeSafe(typedName);
        const residentId = text(input.resident_id, 36);
        let query = admin.from('profiles').select('id, name').eq('community_id', communityId).limit(6);
        if (UUID.test(residentId)) query = query.eq('id', residentId);
        else if (name) query = query.ilike('name', `%${name}%`);
        else return { error: 'Dime quién es el dueño (nombre), o clear: true para dejarla sin dueño.' };
        const { data: people } = await query;
        const rows = (people ?? []) as Row[];
        if (rows.length > 1) return { error: 'Hay varias personas con ese nombre. Pregunta cuál y vuelve a llamar con resident_id.', personas: rows.map(r => ({ resident_id: r.id, nombre: r.name })) };
        if (rows.length === 1) {
            ownerId = String(rows[0].id);
            ownerName = String(rows[0].name || 'el residente');
        } else if (typedName && !UUID.test(residentId)) {
            withoutAccount = true;
            ownerName = typedName;
        } else {
            return { error: 'No encontré a esa persona en la comunidad.' };
        }
    }
    const { error } = await admin.from('units')
        .update({ owner_id: ownerId, owner_name: input.clear === true ? null : ownerName })
        .eq('id', String(matches[0].id)).eq('community_id', communityId);
    if (error) return { error: 'No se pudo actualizar la unidad.' };
    if (withoutAccount) {
        return {
            success: true,
            message: `${ownerName} quedó anotado como propietario del ${number}. Todavía no tiene cuenta en Convive. `
                + 'Si quieres sumarlo: en Usuarios (/admin/users) está el código de residentes; compártelo y que se registre en conviveconnect.com con el número de su unidad, así queda unido a ella. '
                + 'Si son varias personas, adjunta la nómina (Excel, CSV o PDF) en este chat y la cargo de una vez; las que tengan correo reciben su acceso.',
        };
    }
    return { success: true, message: ownerId ? `${ownerName} quedó como dueño del ${number}.` : `El ${number} quedó sin dueño asignado.` };
}
