import 'server-only';

/**
 * Ejecutores de herramientas de CoCo: supermarket. Movidos tal cual desde el switch
 * de executeTool (21-11-2026). Devuelven NOT_HANDLED si la herramienta no es de este dominio.
 */
import { compareShoppingListForUser, supermarketListLink } from '../../shoppingTools';
import { PUBLIC_SITE_URL } from '@/lib/config';
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { SUPERMARKET_STORES } from '@/lib/supermarketBasket';
import { MAX_SHOPPING_LIST_CHARS, parseGroupShoppingList as parsePersonalShoppingList } from '@/lib/supermarketGroupDomain';
import { compareSupermarketGroupOrder, createSupermarketGroupOrder, joinSupermarketGroupOrder, listSupermarketGroupOrders, lockSupermarketGroupOrder, parseGroupShoppingList, recordSupermarketGroupPurchase } from '@/lib/supermarketGroupOrders';
import { savedListKey, savedListTitle } from '@/lib/supermarketSavedLists';
import type { UserRole } from '@/lib/types';
import { randomUUID } from 'node:crypto';
import { NOT_HANDLED, UserContext, forbidden } from '../shared';

export async function executeSupermarketTool(name: string, input: Record<string, string>, userCtx: UserContext): Promise<unknown> {
        switch (name) {
            case 'compare_shopping_list': {
                if (!userCtx.user_id) return forbidden('No pude identificarte.');
                // Por WhatsApp un enlace relativo no se puede abrir: va con el dominio.
                return compareShoppingListForUser(
                    supabaseAdmin, userCtx.user_id, { list_id: input.list_id, body: input.body },
                    userCtx.channel === 'whatsapp' ? PUBLIC_SITE_URL : '',
                );
            }

            case 'save_shopping_list': {
                if (!userCtx.user_id) return forbidden('No pude identificarte para guardar la lista.');
                const listLink = (id: string) => `${userCtx.channel === 'whatsapp' ? PUBLIC_SITE_URL : ''}${supermarketListLink(id)}`;
                const body = typeof input.body === 'string' ? input.body.trim().slice(0, MAX_SHOPPING_LIST_CHARS) : '';
                const items = parsePersonalShoppingList(body, true);
                if (!items.length) return { error: 'La lista no contiene productos reconocibles.' };
                const key = savedListKey(body);
                const existing = await supabaseAdmin.from('supermarket_saved_lists')
                    .select('id').eq('user_id', userCtx.user_id).eq('body_key', key).maybeSingle();
                if (existing.error) return { error: 'No pude comprobar tus listas guardadas.' };
                if (existing.data) return {
                    success: true,
                    list_id: existing.data.id,
                    item_count: items.length,
                    link: listLink(String(existing.data.id)),
                    message: `Esta lista ya estaba guardada en tu supermercado: [Abrir lista](${listLink(String(existing.data.id))}).`,
                };
                const { count, error: countError } = await supabaseAdmin.from('supermarket_saved_lists')
                    .select('id', { count: 'exact', head: true }).eq('user_id', userCtx.user_id);
                if (countError) return { error: 'No pude comprobar el límite de listas.' };
                if ((count ?? 0) >= 30) return { error: 'Ya tienes 30 listas guardadas. Elimina una desde Supermercado para guardar otra.' };
                const store = typeof input.store === 'string' && SUPERMARKET_STORES.includes(input.store as typeof SUPERMARKET_STORES[number])
                    ? input.store : null;
                const { data, error } = await supabaseAdmin.from('supermarket_saved_lists')
                    .insert({ user_id: userCtx.user_id, title: savedListTitle(body), body, body_key: key, store })
                    .select('id').single();
                if (error || !data) return { error: 'No pude guardar la lista. Intenta nuevamente.' };
                return {
                    success: true,
                    list_id: data.id,
                    item_count: items.length,
                    link: listLink(String(data.id)),
                    // El enlace va en el texto: al confirmar, el historial guarda este
                    // mensaje y no el resultado, y "llévame ahí" necesita saber qué lista era.
                    message: `Guardé ${items.length} productos en tu lista personal: [Abrir lista](${listLink(String(data.id))}). Puedo compararla en todas las tiendas ahora mismo.`,
                };
            }

            case 'list_supermarket_group_orders': {
                return listSupermarketGroupOrders({
                    id: userCtx.user_id || '',
                    role: (userCtx.role || 'resident') as UserRole,
                    community_id: userCtx.community_id,
                });
            }

            case 'compare_supermarket_group_order': {
                return compareSupermarketGroupOrder({
                    id: userCtx.user_id || '',
                    role: (userCtx.role || 'resident') as UserRole,
                    community_id: userCtx.community_id,
                }, input.order_id);
            }

            case 'create_supermarket_group_order': {
                if (!userCtx.user_id) return forbidden('No pude identificar al usuario.');
                const order = await createSupermarketGroupOrder({
                    id: userCtx.user_id,
                    role: (userCtx.role || 'resident') as UserRole,
                    community_id: userCtx.community_id,
                }, {
                    title: input.title,
                    closesAt: input.closes_at,
                    items: parseGroupShoppingList(input.shopping_list, true),
                    requestId: randomUUID(),
                });
                return { success: true, order_id: order.id, title: order.title, members: order.members.length, items: order.items.length };
            }

            case 'join_supermarket_group_order': {
                if (!userCtx.user_id) return forbidden('No pude identificar al usuario.');
                const order = await joinSupermarketGroupOrder({
                    id: userCtx.user_id,
                    role: (userCtx.role || 'resident') as UserRole,
                    community_id: userCtx.community_id,
                }, input.order_id, parseGroupShoppingList(input.shopping_list, true));
                return { success: true, order_id: order.id, title: order.title, members: order.members.length, items: order.items.length };
            }

            case 'lock_supermarket_group_order': {
                if (!userCtx.user_id) return forbidden('No pude identificar al usuario.');
                const order = await lockSupermarketGroupOrder({
                    id: userCtx.user_id,
                    role: (userCtx.role || 'resident') as UserRole,
                    community_id: userCtx.community_id,
                }, input.order_id, input.store || undefined);
                return {
                    success: true,
                    order_id: order.id,
                    next_step: 'Abrir el carro desde /convivencia?lane=abasto y, al pagar, registrar el total de la boleta.',
                    selected_store: order.selectedStore || '',
                    selected_total: String(order.selectedTotal || ''),
                    retailer_url: order.retailerUrl || '',
                    selected_items: order.selectedItems.map(item => ({
                        name: item.name,
                        requested_quantity: item.requestedQuantity,
                        packs: item.quantity,
                        pack_units: item.packUnits,
                        product_url: item.productUrl || '',
                    })),
                };
            }

            case 'record_supermarket_group_purchase': {
                if (!userCtx.user_id) return forbidden('No pude identificar al usuario.');
                try {
                    const order = await recordSupermarketGroupPurchase({
                        id: userCtx.user_id,
                        role: (userCtx.role || 'resident') as UserRole,
                        community_id: userCtx.community_id,
                    }, input.order_id, Number(input.final_total));
                    return {
                        success: true,
                        order_id: order.id,
                        store: order.selectedStore || '',
                        final_total: order.finalTotal,
                        estimated_total: order.selectedTotal,
                        shares: order.settlements
                            .filter(item => !item.isOrganizer)
                            .map(item => ({ member: item.memberName, amount: item.amount, paid: Boolean(item.paidAt) })),
                    };
                } catch (error) {
                    // Las validaciones (boleta muy lejos de lo estimado, compra sin cerrar) son
                    // para la persona: se devuelven tal cual en vez del error genérico.
                    return { error: error instanceof Error ? error.message : 'No se pudo registrar el total.' };
                }
            }

            default:
                return NOT_HANDLED;
        }
}
