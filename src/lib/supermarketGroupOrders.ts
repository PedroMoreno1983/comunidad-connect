import 'server-only';

import { comparePersistedSupermarkets } from '@/lib/supermarketCatalog';
import { parseGroupShoppingList, type GroupItemInput } from '@/lib/supermarketGroupDomain';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import type {
  SupermarketChannelType,
  SupermarketGroupComparison,
  SupermarketGroupComparisonItem,
  SupermarketGroupOrder,
  SupermarketGroupOrderItem,
  SupermarketGroupOrderMember,
  SupermarketStore,
  UserRole,
} from '@/lib/types';

type GroupProfile = {
  id: string;
  name?: string | null;
  role: UserRole;
  community_id?: string | null;
};

const STORE_URLS: Record<SupermarketStore, string> = {
  Jumbo: 'https://www.jumbo.cl',
  Lider: 'https://super.lider.cl',
  Unimarc: 'https://www.unimarc.cl',
  'Santa Isabel': 'https://www.santaisabel.cl',
  aCuenta: 'https://www.acuenta.cl',
  Irurzun: 'https://irurzun.cl',
};

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function asSelectedItems(value: unknown): SupermarketGroupComparisonItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    const store = asString(row.store) as SupermarketStore;
    const requestedTerm = asString(row.requestedTerm);
    const name = asString(row.name);
    if (!requestedTerm || !name || !store) return [];
    const productUrl = asString(row.productUrl);
    return [{
      requestedTerm,
      requestedQuantity: asNumber(row.requestedQuantity),
      name,
      store,
      price: asNumber(row.price),
      quantity: asNumber(row.quantity),
      packUnits: asNumber(row.packUnits),
      suppliedQuantity: asNumber(row.suppliedQuantity),
      lineTotal: asNumber(row.lineTotal),
      ...(productUrl ? { productUrl } : {}),
    }];
  });
}

function requireIdentity(profile: GroupProfile) {
  if (!profile.community_id) throw new Error('Tu perfil no tiene una comunidad asociada.');
  return profile.community_id;
}

async function assertVisibleOrder(profile: GroupProfile, orderId: string) {
  const communityId = requireIdentity(profile);
  const { data, error } = await getSupabaseAdmin()
    .from('supermarket_group_orders')
    .select('*')
    .eq('id', orderId)
    .eq('community_id', communityId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('La compra grupal no existe en tu comunidad.');
  return data as Record<string, unknown>;
}

async function hydrateOrders(profile: GroupProfile, rawOrders: Record<string, unknown>[]): Promise<SupermarketGroupOrder[]> {
  if (rawOrders.length === 0) return [];
  const orderIds = rawOrders.map(row => asString(row.id)).filter(Boolean);
  const admin = getSupabaseAdmin();
  const [membersResult, itemsResult] = await Promise.all([
    admin
      .from('supermarket_group_order_members')
      .select('order_id,user_id,joined_at')
      .in('order_id', orderIds),
    admin
      .from('supermarket_group_order_items')
      .select('id,order_id,user_id,requested_term,quantity,created_at,updated_at')
      .in('order_id', orderIds)
      .order('created_at', { ascending: true }),
  ]);
  if (membersResult.error) throw membersResult.error;
  if (itemsResult.error) throw itemsResult.error;

  const userIds = [...new Set([
    ...(membersResult.data || []).map(row => asString(row.user_id)),
    ...(itemsResult.data || []).map(row => asString(row.user_id)),
  ].filter(Boolean))];
  const { data: profiles, error: profileError } = userIds.length
    ? await admin.from('profiles').select('id,name,email').in('id', userIds)
    : { data: [], error: null };
  if (profileError) throw profileError;
  const names = new Map((profiles || []).map(row => [
    asString(row.id),
    asString(row.name) || asString(row.email).split('@')[0] || 'Vecino',
  ]));

  return rawOrders.map(row => {
    const orderId = asString(row.id);
    const members: SupermarketGroupOrderMember[] = (membersResult.data || [])
      .filter(member => asString(member.order_id) === orderId)
      .map(member => ({
        userId: asString(member.user_id),
        name: names.get(asString(member.user_id)) || 'Vecino',
        joinedAt: asString(member.joined_at),
      }));
    const items: SupermarketGroupOrderItem[] = (itemsResult.data || [])
      .filter(item => asString(item.order_id) === orderId)
      .map(item => ({
        id: asString(item.id),
        orderId,
        userId: asString(item.user_id),
        memberName: names.get(asString(item.user_id)) || 'Vecino',
        requestedTerm: asString(item.requested_term),
        quantity: asNumber(item.quantity),
        createdAt: asString(item.created_at),
        updatedAt: asString(item.updated_at),
      }));

    return {
      id: orderId,
      communityId: asString(row.community_id),
      createdBy: asString(row.created_by),
      title: asString(row.title),
      status: asString(row.status) as SupermarketGroupOrder['status'],
      closesAt: asString(row.closes_at),
      selectedStore: (asString(row.selected_store) || null) as SupermarketStore | null,
      selectedTotal: row.selected_total === null ? null : asNumber(row.selected_total),
      selectedChannelType: (asString(row.selected_channel_type) || null) as SupermarketChannelType | null,
      retailerUrl: asString(row.retailer_url) || null,
      selectedItems: asSelectedItems(row.selected_items),
      members,
      items,
      canManage: asString(row.created_by) === profile.id || profile.role === 'admin',
      createdAt: asString(row.created_at),
      updatedAt: asString(row.updated_at),
    };
  });
}

export async function listSupermarketGroupOrders(profile: GroupProfile): Promise<SupermarketGroupOrder[]> {
  const communityId = requireIdentity(profile);
  const { data, error } = await getSupabaseAdmin()
    .from('supermarket_group_orders')
    .select('*')
    .eq('community_id', communityId)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(40);
  if (error) throw error;
  return hydrateOrders(profile, (data || []) as Record<string, unknown>[]);
}

async function upsertContribution(orderId: string, communityId: string, userId: string, items: GroupItemInput[]) {
  const admin = getSupabaseAdmin();
  const { error: memberError } = await admin
    .from('supermarket_group_order_members')
    .upsert({ order_id: orderId, community_id: communityId, user_id: userId }, { onConflict: 'order_id,user_id' });
  if (memberError) throw memberError;
  if (items.length === 0) return;
  const { error: itemError } = await admin
    .from('supermarket_group_order_items')
    .upsert(items.map(item => ({
      order_id: orderId,
      community_id: communityId,
      user_id: userId,
      requested_term: item.term,
      quantity: item.quantity,
      updated_at: new Date().toISOString(),
    })), { onConflict: 'order_id,user_id,requested_term' });
  if (itemError) throw itemError;
}

export async function createSupermarketGroupOrder(
  profile: GroupProfile,
  input: { title: string; closesAt: string; items: GroupItemInput[] },
): Promise<SupermarketGroupOrder> {
  const communityId = requireIdentity(profile);
  const title = input.title.trim().slice(0, 120);
  if (title.length < 3) throw new Error('Escribe un nombre para la compra grupal.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.closesAt) || input.closesAt < new Date().toISOString().slice(0, 10)) {
    throw new Error('La fecha de cierre debe ser hoy o posterior.');
  }
  if (input.items.length === 0) throw new Error('Agrega al menos un producto con su cantidad.');

  const { data, error } = await getSupabaseAdmin()
    .from('supermarket_group_orders')
    .insert({
      community_id: communityId,
      created_by: profile.id,
      title,
      closes_at: input.closesAt,
      status: 'open',
    })
    .select('*')
    .single();
  if (error || !data) throw error || new Error('No se pudo crear la compra grupal.');
  try {
    await upsertContribution(asString(data.id), communityId, profile.id, input.items);
  } catch (error) {
    await getSupabaseAdmin().from('supermarket_group_orders').delete().eq('id', data.id);
    throw error;
  }
  return (await hydrateOrders(profile, [data as Record<string, unknown>]))[0];
}

export async function joinSupermarketGroupOrder(
  profile: GroupProfile,
  orderId: string,
  items: GroupItemInput[],
): Promise<SupermarketGroupOrder> {
  const order = await assertVisibleOrder(profile, orderId);
  if (!['open', 'ready'].includes(asString(order.status))) throw new Error('La compra ya está cerrada.');
  if (asString(order.closes_at) < new Date().toISOString().slice(0, 10)) throw new Error('El plazo de esta compra ya venció.');
  if (items.length === 0) throw new Error('Agrega al menos un producto con su cantidad.');
  await upsertContribution(orderId, requireIdentity(profile), profile.id, items);
  return (await hydrateOrders(profile, [order]))[0];
}

export async function compareSupermarketGroupOrder(
  profile: GroupProfile,
  orderId: string,
): Promise<SupermarketGroupComparison[]> {
  await assertVisibleOrder(profile, orderId);
  const { data, error } = await getSupabaseAdmin()
    .from('supermarket_group_order_items')
    .select('requested_term,quantity')
    .eq('order_id', orderId)
    .eq('community_id', requireIdentity(profile));
  if (error) throw error;
  const quantities: Record<string, number> = {};
  for (const row of data || []) {
    const term = asString(row.requested_term);
    quantities[term] = (quantities[term] || 0) + asNumber(row.quantity);
  }
  const terms = Object.keys(quantities);
  if (terms.length === 0) throw new Error('La compra grupal todavía no tiene productos.');
  const comparison = await comparePersistedSupermarkets(terms, quantities);
  return comparison.comparisons.map(basket => ({
    orderId,
    store: basket.store as SupermarketStore,
    channelType: basket.channelType as SupermarketChannelType,
    subtotal: basket.subtotal,
    complete: basket.complete,
    missingTerms: basket.missingTerms,
    items: basket.items.map(item => ({
      requestedTerm: item.requestedTerm,
      requestedQuantity: item.requestedQuantity,
      name: item.name,
      store: item.store as SupermarketStore,
      price: item.price,
      quantity: item.quantity,
      packUnits: item.packUnits,
      suppliedQuantity: item.suppliedQuantity,
      lineTotal: item.lineTotal,
      productUrl: item.productUrl,
    })),
    retailerUrl: STORE_URLS[basket.store as SupermarketStore],
  }));
}

export async function lockSupermarketGroupOrder(profile: GroupProfile, orderId: string): Promise<SupermarketGroupOrder> {
  const order = await assertVisibleOrder(profile, orderId);
  if (asString(order.created_by) !== profile.id && profile.role !== 'admin') {
    throw new Error('Solo quien organizó la compra o la administración puede cerrarla.');
  }
  if (!['open', 'ready'].includes(asString(order.status))) throw new Error('La compra ya está cerrada.');
  const comparisons = await compareSupermarketGroupOrder(profile, orderId);
  const selected = comparisons.find(item => item.complete);
  if (!selected) throw new Error('Aún no existe una canasta completa y vigente para cerrar esta compra.');
  const { data, error } = await getSupabaseAdmin()
    .from('supermarket_group_orders')
    .update({
      status: 'locked',
      selected_store: selected.store,
      selected_total: selected.subtotal,
      selected_channel_type: selected.channelType,
      retailer_url: selected.retailerUrl,
      selected_items: selected.items,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .eq('community_id', requireIdentity(profile))
    .in('status', ['open', 'ready'])
    .select('*')
    .single();
  if (error || !data) throw error || new Error('No se pudo cerrar la compra grupal.');
  return (await hydrateOrders(profile, [data as Record<string, unknown>]))[0];
}

export { parseGroupShoppingList };
