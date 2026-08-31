'use client';

import { useState } from 'react';
import { Loader2, ShoppingCart } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { SupermarketCartService } from '@/lib/api';
import { storeLoadability } from '@/lib/supermarket/cartUrl';
import { openBlankRetailerTab, openRetailerUrl } from '@/lib/supermarket/openRetailer';
import type { SupermarketCartHandoffItem, SupermarketSearchCandidate } from '@/lib/types';

interface CartHandoffButtonProps {
  store: string;
  items: SupermarketSearchCandidate[];
}

function toHandoffItems(items: SupermarketSearchCandidate[]): SupermarketCartHandoffItem[] {
  return items
    .filter(item => item.name)
    .map(item => ({
      id: item.id,
      requestedTerm: item.requestedTerm,
      name: item.name,
      sku: item.sku,
      productUrl: item.productUrl,
      quantity: item.quantity,
      lineTotal: item.lineTotal,
    }));
}

export async function loadStoreCart(
  store: string,
  items: SupermarketSearchCandidate[],
  toast: (props: { title: string; description?: string; variant?: 'default' | 'destructive' | 'success' }) => void,
): Promise<boolean> {
  const payload = toHandoffItems(items);
  if (payload.length === 0) {
    toast({
      title: `No hay productos para cargar en ${store}`,
      description: 'Compara de nuevo la lista o elige otra cadena.',
      variant: 'destructive',
    });
    return false;
  }

  const tab = storeLoadability(store) === 'direct' ? openBlankRetailerTab() : null;

  try {
    const handoff = await SupermarketCartService.prepareHandoff(store, payload);
    if (handoff.supported && handoff.cartUrl) {
      await openRetailerUrl(handoff.cartUrl, tab);
      const missing = handoff.missingItems.length;
      toast({
        title: missing === 0
          ? `Carro de ${store} listo para revisar`
          : `${handoff.plannedCount} productos van a ${store}`,
        description: missing === 0
          ? 'Revisa cantidades y despacho en el checkout de la tienda antes de pagar.'
          : `No entraron: ${handoff.missingItems.slice(0, 4).join(', ')}${missing > 4 ? '…' : ''}.`,
        variant: 'success',
      });
      return true;
    }

    tab?.close();
    toast({
      title: `${store} no carga el carro por enlace`,
      description: handoff.reason || 'Abre las fichas de la canasta y agrégalo en el sitio de la tienda.',
    });
    return false;
  } catch (error) {
    tab?.close();
    toast({
      title: 'No se pudo cargar el carro',
      description: error instanceof Error ? error.message : 'Inténtalo de nuevo en unos segundos.',
      variant: 'destructive',
    });
    return false;
  }
}

export function CartHandoffButton({ store, items }: CartHandoffButtonProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await loadStoreCart(store, items, toast);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={loading || items.length === 0}
      className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"
      style={{ background: 'var(--cc-copper)' }}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
      {loading ? 'Cargando carro…' : `Cargar carro en ${store}`}
    </button>
  );
}
