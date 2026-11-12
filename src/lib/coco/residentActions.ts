import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { recordOperationEvent } from '@/lib/operations/audit';
import { validServiceSchedule } from '@/lib/services/requestLifecycle';
import { chileTodayISO } from '@/lib/agent-center/chileDate';

/**
 * Acciones de residente que hasta ahora solo se podían hacer en pantalla:
 * publicar en el Marketplace y pedir un servicio a un proveedor del directorio.
 * Mismas validaciones que las rutas de la app; CoCo pide confirmación antes.
 */

const MARKETPLACE_CATEGORIES = ['electronics', 'furniture', 'clothing', 'other'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

export async function publishMarketplaceItemForUser(
    admin: SupabaseClient,
    communityId: string,
    userId: string,
    input: Record<string, unknown>,
) {
    const title = text(input.title, 120);
    if (title.length < 3) return { error: 'Dime qué vas a publicar, en pocas palabras.' };
    const category = MARKETPLACE_CATEGORIES.includes(String(input.category) as typeof MARKETPLACE_CATEGORIES[number])
        ? String(input.category) : 'other';
    const price = Math.max(0, Math.round(Number(input.price) || 0));
    const allowSwap = input.allow_swap === true;
    if (price === 0 && !allowSwap) return { error: 'Indica un precio, o que aceptas permuta.' };

    const { data, error } = await admin.from('marketplace_items').insert({
        seller_id: userId,
        community_id: communityId,
        title,
        description: text(input.description, 2000),
        price,
        category,
        allow_sale: price > 0,
        allow_swap: allowSwap,
        swap_details: text(input.swap_details, 300),
        status: 'available',
        payment_status: 'none',
        images: [],
    }).select('id,title,price').single();
    if (error || !data) return { error: 'No se pudo publicar el artículo.' };
    return {
        success: true,
        item_id: data.id,
        titulo: data.title,
        precio: data.price,
        enlace: '/marketplace',
        nota: 'Quedó publicado sin fotos: las puede agregar desde Marketplace > Mis publicaciones.',
    };
}

export async function requestServiceForUser(
    admin: SupabaseClient,
    communityId: string,
    userId: string,
    role: string,
    input: Record<string, unknown>,
) {
    const providerId = text(input.provider_id, 80);
    const preferredDate = text(input.preferred_date, 10);
    const preferredTime = text(input.preferred_time, 5);
    const description = text(input.description, 1200);
    if (!UUID.test(providerId)) return { error: 'Necesito el provider_id que devuelve list_services.' };
    if (!description) return { error: 'Describe qué necesitas que haga el proveedor.' };
    if (!validServiceSchedule(preferredDate, preferredTime)) {
        return { error: 'La fecha debe ser AAAA-MM-DD y la hora HH:MM.' };
    }
    if (preferredDate < chileTodayISO()) return { error: 'Esa fecha ya pasó: elige hoy o un día futuro.' };

    const { data: provider } = await admin.from('service_providers').select('id,name,community_id').eq('id', providerId).maybeSingle();
    if (!provider) return { error: 'No encontré ese proveedor.' };
    if (provider.community_id && provider.community_id !== communityId) return { error: 'Ese proveedor no es de tu comunidad.' };

    const { data: request, error } = await admin.from('service_requests').insert({
        provider_id: provider.id,
        user_id: userId,
        preferred_date: preferredDate,
        preferred_time: preferredTime,
        description,
        status: 'pending',
        community_id: communityId,
    }).select('id,status').single();
    if (error || !request) return { error: 'No se pudo enviar la solicitud.' };

    await recordOperationEvent({
        communityId,
        actorId: userId,
        actorRole: role,
        action: 'service_request.created',
        entityType: 'service_request',
        entityId: request.id,
        severity: 'success',
        status: 'pending',
        summary: `Solicitud enviada a ${provider.name} desde CoCo`,
        metadata: { providerId: provider.id, preferredDate, preferredTime, descriptionLength: description.length, channel: 'coco' },
    });

    return {
        success: true,
        request_id: request.id,
        proveedor: provider.name,
        fecha: preferredDate,
        hora: preferredTime,
        estado: 'pendiente: el proveedor la acepta o propone otro horario',
        enlace: '/services/my-requests',
    };
}
