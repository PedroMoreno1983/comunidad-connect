import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import type { ScrapedItem } from '@/lib/supermarketLive';

export async function rememberLiveProducts(store: string, query: string, items: ScrapedItem[]) {
  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();
  await Promise.all(items.filter(item => item.sku && item.price > 0).map(async item => {
    const sku = item.sku as string;
    const patch = {
      last_query: query.slice(0, 80),
      last_seen_at: now,
      name: item.name,
      brand: item.brand || null,
      price: Math.round(item.price),
      offer_id: item.offerId || null,
      sales_unit: item.salesUnit || null,
      product_url: item.productUrl || null,
      image_url: item.imageUrl || null,
      in_stock: true,
    };
    const updated = await admin.from('supermarket_products').update(patch)
      .eq('store', store).eq('sku', sku).select('id');
    if (updated.error) throw updated.error;
    if ((updated.data ?? []).length > 0) return;
    const inserted = await admin.from('supermarket_products').insert({
      ...patch,
      store,
      sku,
      source_product_key: sku.slice(0, 1000),
      currency: 'CLP',
      first_seen_at: now,
    });
    if (inserted.error) throw inserted.error;
  }));
}
