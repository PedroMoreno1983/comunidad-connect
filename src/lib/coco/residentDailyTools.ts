import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Lo que un residente hace a diario en la app y CoCo no podía hacer:
 * escribirle a un vendedor del Marketplace y responder sus mensajes, corregir
 * su nombre, borrar una lista del súper y registrar su vehículo para reservar
 * estacionamiento.
 *
 * Todas actúan sobre el perfil autenticado (userId), nunca sobre un id que
 * elija el modelo como "dueño". Los mensajes del Marketplace pasan por el
 * trigger enforce_marketplace_message_context, que exige que quien escribe
 * participe en la conversación.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const likeSafe = (value: string) => value.replace(/[%_\\]/g, ' ').trim();
type Row = Record<string, unknown>;

// ── Marketplace: conversaciones ──────────────────────────────────────────────

export async function listMyMarketplaceConversations(admin: SupabaseClient, communityId: string, userId: string) {
    const { data: conversations, error } = await admin
        .from('marketplace_conversations')
        .select('id, item_id, buyer_id, seller_id, last_message_at, marketplace_items(title, status)')
        .eq('community_id', communityId)
        .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
        .order('last_message_at', { ascending: false })
        .limit(10);
    if (error) return { error: 'No pude cargar tus conversaciones del Marketplace.' };
    const rows = (conversations ?? []) as Row[];
    if (!rows.length) return { conversaciones: [], nota: 'No tienes conversaciones en el Marketplace.' };

    const counterpartIds = [...new Set(rows.map(row => String(row.buyer_id === userId ? row.seller_id : row.buyer_id)))];
    const [{ data: people }, { data: messages }] = await Promise.all([
        admin.from('profiles').select('id, name').in('id', counterpartIds),
        admin.from('marketplace_conversation_messages')
            .select('conversation_id, sender_id, content, created_at, read_at')
            .in('conversation_id', rows.map(row => String(row.id)))
            .order('created_at', { ascending: false })
            .limit(60),
    ]);
    const nameOf = new Map(((people ?? []) as Row[]).map(person => [String(person.id), String(person.name || 'Vecino')]));
    const byConversation = new Map<string, Row[]>();
    for (const message of (messages ?? []) as Row[]) {
        const list = byConversation.get(String(message.conversation_id)) ?? [];
        if (list.length < 3) list.push(message);
        byConversation.set(String(message.conversation_id), list);
    }

    return {
        conversaciones: rows.map(row => {
            const iAmSeller = row.seller_id === userId;
            const counterpart = String(iAmSeller ? row.buyer_id : row.seller_id);
            const recent = (byConversation.get(String(row.id)) ?? []).reverse();
            const item = row.marketplace_items as { title?: string; status?: string } | null;
            return {
                conversation_id: row.id,
                articulo: item?.title ?? 'Artículo',
                rol: iAmSeller ? 'vendes' : 'compras',
                con: nameOf.get(counterpart) ?? 'Vecino',
                sin_leer: recent.filter(m => m.sender_id !== userId && !m.read_at).length,
                ultimos_mensajes: recent.map(m => ({ de: m.sender_id === userId ? 'tú' : nameOf.get(counterpart) ?? 'vecino', texto: m.content })),
            };
        }),
    };
}

async function insertMessage(admin: SupabaseClient, conversationId: string, userId: string, content: string) {
    const { error } = await admin
        .from('marketplace_conversation_messages')
        .insert({ conversation_id: conversationId, sender_id: userId, content });
    return error;
}

function cleanMessage(value: unknown) {
    const content = text(value, 2000);
    if (!content) return { error: 'Escribe el mensaje que quieres enviar.' } as const;
    return { content } as const;
}

export async function messageMarketplaceSeller(admin: SupabaseClient, communityId: string, userId: string, input: Record<string, unknown>) {
    const message = cleanMessage(input.message);
    if ('error' in message) return message;

    // Mismas reglas que start_marketplace_conversation: artículo disponible o
    // reservado, de la misma comunidad, y no propio.
    const itemId = text(input.item_id, 36);
    const title = likeSafe(text(input.item_title, 120));
    let query = admin
        .from('marketplace_items')
        .select('id, title, seller_id, community_id, status')
        .eq('community_id', communityId)
        .in('status', ['available', 'reserved'])
        .limit(6);
    if (UUID.test(itemId)) query = query.eq('id', itemId);
    else if (title) query = query.ilike('title', `%${title}%`);
    else return { error: 'Dime qué artículo te interesa (el título basta).' };
    const { data, error } = await query;
    if (error) return { error: 'No pude buscar el artículo.' };
    const items = ((data ?? []) as Row[]).filter(item => item.seller_id !== userId);
    if (!items.length) return { error: 'No encontré ese artículo disponible en el Marketplace de tu comunidad (o es tuyo).' };
    if (items.length > 1) {
        return {
            error: 'Hay varios artículos parecidos. Pregúntale cuál y vuelve a llamar con su item_id.',
            articulos: items.map(item => ({ item_id: item.id, titulo: item.title })),
        };
    }
    const item = items[0];

    const { data: existing } = await admin
        .from('marketplace_conversations')
        .select('id')
        .eq('item_id', String(item.id))
        .eq('buyer_id', userId)
        .maybeSingle();
    let conversationId = existing?.id ? String(existing.id) : '';
    if (!conversationId) {
        const { data: created, error: createError } = await admin
            .from('marketplace_conversations')
            .insert({ item_id: item.id, community_id: communityId, buyer_id: userId, seller_id: item.seller_id })
            .select('id')
            .single();
        if (createError || !created) return { error: 'No pude abrir la conversación con el vendedor.' };
        conversationId = String(created.id);
    }

    const sendError = await insertMessage(admin, conversationId, userId, message.content);
    if (sendError) return { error: 'No se pudo enviar el mensaje.' };
    return {
        success: true,
        conversation_id: conversationId,
        message: `Le escribí al vendedor de "${item.title}". Te aviso cuando responda; también lo ves en Marketplace > Mensajes.`,
        donde_verla: '/marketplace',
    };
}

export async function replyMarketplaceConversation(admin: SupabaseClient, communityId: string, userId: string, input: Record<string, unknown>) {
    const message = cleanMessage(input.message);
    if ('error' in message) return message;
    const conversationId = text(input.conversation_id, 36);
    if (!UUID.test(conversationId)) return { error: 'Necesito el conversation_id que devuelve list_my_marketplace_conversations.' };

    const { data: conversation } = await admin
        .from('marketplace_conversations')
        .select('id, community_id, buyer_id, seller_id')
        .eq('id', conversationId)
        .maybeSingle();
    if (!conversation || conversation.community_id !== communityId || ![conversation.buyer_id, conversation.seller_id].includes(userId)) {
        return { error: 'No encontré esa conversación entre las tuyas.' };
    }
    const sendError = await insertMessage(admin, conversationId, userId, message.content);
    if (sendError) return { error: 'No se pudo enviar el mensaje.' };
    return { success: true, message: 'Mensaje enviado.', donde_verla: '/marketplace' };
}

// ── Perfil, listas y vehículo ────────────────────────────────────────────────

export async function updateMyName(admin: SupabaseClient, userId: string, input: Record<string, unknown>) {
    const name = text(input.full_name, 120);
    if (name.length < 2) return { error: 'Dime tu nombre completo.' };
    const { error } = await admin.from('profiles').update({ name }).eq('id', userId);
    if (error) return { error: 'No se pudo actualizar tu nombre.' };
    return { success: true, message: `Listo, ahora apareces como ${name}.` };
}

export async function deleteMyShoppingList(admin: SupabaseClient, userId: string, input: Record<string, unknown>) {
    const listId = text(input.list_id, 36);
    const title = likeSafe(text(input.title, 80));
    let query = admin.from('supermarket_saved_lists').select('id, title').eq('user_id', userId).limit(6);
    if (UUID.test(listId)) query = query.eq('id', listId);
    else if (title) query = query.ilike('title', `%${title}%`);
    else return { error: 'Dime cuál lista borrar (el título basta).' };
    const { data, error } = await query;
    if (error) return { error: 'No pude buscar tus listas.' };
    const lists = (data ?? []) as Row[];
    if (!lists.length) return { error: 'No encontré esa lista entre las tuyas.' };
    if (lists.length > 1) {
        return { error: 'Tienes varias listas parecidas. Pregúntale cuál y vuelve a llamar con su list_id.', listas: lists.map(list => ({ list_id: list.id, titulo: list.title })) };
    }
    const { error: deleteError } = await admin.from('supermarket_saved_lists').delete().eq('id', String(lists[0].id)).eq('user_id', userId);
    if (deleteError) return { error: 'No se pudo borrar la lista.' };
    return { success: true, message: `Borré la lista "${lists[0].title}".` };
}

export async function registerMyVehicle(admin: SupabaseClient, userId: string, input: Record<string, unknown>) {
    const plate = text(input.plate, 10).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!/^[A-Z]{2,4}[0-9]{2,4}$/.test(plate)) return { error: 'La patente no parece válida (ej. ABCD12).' };
    const phone = text(input.phone, 20);
    if (phone.replace(/\D/g, '').length < 8) return { error: 'Necesito un teléfono de contacto (8 dígitos o más).' };

    const { data: profile } = await admin.from('profiles').select('id, name').eq('id', userId).maybeSingle();
    const fullName = text(input.full_name, 120) || String(profile?.name || '');
    if (fullName.trim().length < 2) return { error: 'Necesito tu nombre completo.' };

    // Igual que upsert_parking_driver: un conductor por usuario; se actualiza si existe.
    const { error } = await admin.from('parking_drivers').upsert({
        user_id: userId,
        profile_id: profile?.id ?? null,
        full_name: fullName,
        phone,
        plate,
        vehicle_description: text(input.vehicle_description, 120),
    }, { onConflict: 'user_id' });
    if (error) return { error: error.message || 'No se pudo registrar el vehículo.' };
    return { success: true, message: `Registré tu vehículo patente ${plate}. Ya puedes reservar estacionamiento.` };
}
