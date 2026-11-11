import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { DEAL_KIND_LABEL, dealMonthlySavings, detectDealOpportunities } from '@/lib/communityDealsDomain';
import type { CommunityDealKind, CommunityDealPriceUnit } from '@/lib/types';

/**
 * Convenios comunitarios para CoCo. CoCo corre con la service role: aquí se
 * acota a mano a la comunidad del usuario verificado y se replican las reglas
 * de visibilidad de la base (lo propuesto o descartado solo lo ven quien lo
 * propuso y la administración).
 */

type Row = Record<string, unknown>;

const KINDS: CommunityDealKind[] = ['vendor_visit', 'bulk_service', 'space_income'];
const PRICE_UNITS: CommunityDealPriceUnit[] = ['unit_month', 'unit_once', 'community_month', 'discount_percent'];
const SIGNAL_WINDOW_DAYS = 90;

export async function listDealsForUser(admin: SupabaseClient, communityId: string, userId: string, isAdmin: boolean) {
  const { data: deals, error } = await admin
    .from('community_deals')
    .select('id,title,kind,description,status,interest_goal,needs_assembly,assembly_note,reference_price,deal_price,price_unit,schedule,terms,created_by')
    .eq('community_id', communityId)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) return { error: 'No pude leer los convenios ahora.' };
  const visible = ((deals || []) as Row[]).filter(deal =>
    isAdmin || !['proposed', 'rejected'].includes(String(deal.status)) || deal.created_by === userId);
  if (visible.length === 0) return { convenios: [] };

  const { data: interests } = await admin
    .from('community_deal_interests')
    .select('deal_id,user_id')
    .in('deal_id', visible.map(deal => String(deal.id)));
  const rows = (interests || []) as Row[];

  return {
    convenios: visible.map(deal => {
      const interested = rows.filter(row => row.deal_id === deal.id).length;
      const savings = dealMonthlySavings({
        referencePrice: deal.reference_price === null ? null : Number(deal.reference_price),
        dealPrice: deal.deal_price === null ? null : Number(deal.deal_price),
        priceUnit: String(deal.price_unit) as CommunityDealPriceUnit,
        interestedCount: interested,
      });
      return {
        deal_id: String(deal.id),
        titulo: deal.title,
        tipo: DEAL_KIND_LABEL[String(deal.kind) as CommunityDealKind] || deal.kind,
        estado: deal.status,
        detalle: deal.description,
        interesados: interested,
        meta_interesados: deal.interest_goal,
        yo_me_sume: rows.some(row => row.deal_id === deal.id && row.user_id === userId),
        requiere_asamblea: deal.needs_assembly,
        nota_asamblea: deal.assembly_note || undefined,
        cuando: deal.schedule || undefined,
        condiciones: deal.terms || undefined,
        ahorro_mensual_comunidad: savings,
      };
    }),
  };
}

/** Oportunidades a partir de reclamos y compras comunitarias de los últimos 90 días. */
export async function suggestDealsForCommunity(admin: SupabaseClient, communityId: string) {
  const since = new Date(Date.now() - SIGNAL_WINDOW_DAYS * 86_400_000).toISOString();
  const [cases, items, deals] = await Promise.all([
    admin.from('coco_cases').select('user_id,title,description').eq('community_id', communityId).gte('created_at', since).limit(1000),
    admin.from('supermarket_group_order_items').select('user_id,requested_term').eq('community_id', communityId).gte('created_at', since).limit(2000),
    admin.from('community_deals').select('title').eq('community_id', communityId).not('status', 'in', '(rejected,closed)'),
  ]);
  const opportunities = detectDealOpportunities({
    cases: ((cases.data || []) as Row[]).map(row => ({
      userId: String(row.user_id || ''),
      text: `${row.title || ''} ${row.description || ''}`,
    })),
    groupItems: ((items.data || []) as Row[]).map(row => ({ userId: String(row.user_id || ''), term: String(row.requested_term || '') })),
    existingTitles: ((deals.data || []) as Row[]).map(row => String(row.title || '')),
  });
  return {
    ventana_dias: SIGNAL_WINDOW_DAYS,
    oportunidades: opportunities.map(item => ({
      titulo_sugerido: item.title,
      tipo: item.kind,
      hogares_distintos: item.households,
      fuente: item.source === 'cases' ? 'reclamos y casos' : 'compras comunitarias',
      por_que: item.why,
    })),
    nota: opportunities.length === 0
      ? 'No hay señales suficientes (al menos 3 hogares distintos) en los últimos 90 días.'
      : 'Son señales, no demanda confirmada: propón el convenio y deja que los vecinos se sumen.',
  };
}

export async function proposeDealForUser(
  admin: SupabaseClient,
  communityId: string,
  userId: string,
  isAdmin: boolean,
  input: { title: unknown; kind: unknown; description: unknown },
) {
  const title = String(input.title ?? '').trim().slice(0, 120);
  const kind = String(input.kind ?? '') as CommunityDealKind;
  if (title.length < 3) return { error: 'Dime en pocas palabras de qué se trata el convenio.' };
  if (!KINDS.includes(kind)) return { error: 'El tipo debe ser vendor_visit, bulk_service o space_income.' };
  const { data, error } = await admin.from('community_deals').insert({
    community_id: communityId,
    created_by: userId,
    title,
    kind,
    description: String(input.description ?? '').trim().slice(0, 2000),
    status: isAdmin ? 'gauging' : 'proposed',
  }).select('id,status').single();
  if (error || !data) return { error: 'No se pudo registrar la propuesta.' };
  return {
    success: true,
    deal_id: data.id,
    estado: data.status,
    siguiente_paso: isAdmin
      ? 'Quedó abierto: los vecinos pueden sumarse en Convivencia > Convenios.'
      : 'La administración lo revisa antes de abrirlo a los vecinos.',
  };
}

export async function setDealInterestForUser(admin: SupabaseClient, communityId: string, userId: string, dealId: string, interested: boolean, note: unknown) {
  const { data: deal } = await admin.from('community_deals').select('community_id,title').eq('id', dealId).maybeSingle();
  if (!deal || deal.community_id !== communityId) return { error: 'Ese convenio no existe en tu comunidad.' };
  const { data, error } = await admin.rpc('community_deal_interest_as', {
    p_user_id: userId,
    p_deal_id: dealId,
    p_interested: interested,
    p_note: String(note ?? '').slice(0, 300),
  });
  if (error) return { error: error.message || 'No se pudo registrar.' };
  return { success: true, convenio: deal.title, interesados: Number(data) || 0, me_sume: interested };
}

export async function addDealQuoteForAdmin(
  admin: SupabaseClient,
  communityId: string,
  userId: string,
  input: { deal_id: unknown; provider_name: unknown; price: unknown; price_unit: unknown; offer: unknown; contact: unknown },
) {
  const dealId = String(input.deal_id ?? '');
  const { data: deal } = await admin.from('community_deals').select('community_id,status,title').eq('id', dealId).maybeSingle();
  if (!deal || deal.community_id !== communityId) return { error: 'Ese convenio no existe en tu comunidad.' };
  if (!['gauging', 'quoting'].includes(String(deal.status))) return { error: 'Solo se cotiza mientras el convenio suma interesados o está cotizando.' };
  const provider = String(input.provider_name ?? '').trim().slice(0, 120);
  if (provider.length < 2) return { error: 'Falta el nombre del proveedor.' };
  const priceUnit = (PRICE_UNITS.includes(String(input.price_unit) as CommunityDealPriceUnit)
    ? String(input.price_unit) : 'unit_month') as CommunityDealPriceUnit;
  const price = input.price === undefined || input.price === null || input.price === '' ? null : Math.round(Number(input.price));
  if (price !== null && (!Number.isFinite(price) || price < 0)) return { error: 'El precio debe ser un número positivo.' };
  const { error } = await admin.from('community_deal_quotes').insert({
    deal_id: dealId,
    community_id: communityId,
    provider_name: provider,
    price,
    price_unit: priceUnit,
    offer: String(input.offer ?? '').trim().slice(0, 2000),
    contact: String(input.contact ?? '').trim().slice(0, 200),
    created_by: userId,
  });
  if (error) return { error: 'No se pudo registrar la cotización.' };
  return { success: true, convenio: deal.title, proveedor: provider, precio: price, unidad: priceUnit };
}
