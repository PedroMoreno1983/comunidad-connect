'use client';

import { useState } from 'react';
import { ExternalLink, Loader2, ShoppingCart } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { SupermarketCartService } from '@/lib/api';
import type {
  SupermarketCartButtonProps,
  SupermarketCartHandoffItem,
} from '@/lib/types';

export function RemoteCartButton({ store, items }: SupermarketCartButtonProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const loadCart = async () => {
    setLoading(true);
    const pendingWindow = window.open('about:blank', '_blank');
    if (pendingWindow) {
      pendingWindow.opener = null;
      pendingWindow.document.title = `Preparando carro en ${store}`;
      pendingWindow.document.body.textContent = 'Preparando tu carro seguro…';
    }

    try {
      const handoffItems: SupermarketCartHandoffItem[] = items.map(item => ({
        id: item.id,
        name: item.name,
        requestedTerm: item.requestedTerm,
        quantity: item.quantity,
        sku: item.sku,
        offerId: item.offerId,
        productUrl: item.productUrl,
      }));
      const handoff = await SupermarketCartService.prepareHandoff(store, handoffItems);
      const targetUrl = handoff.sessionUrl ?? handoff.cartUrl;

      if (!handoff.supported || !targetUrl) {
        pendingWindow?.close();
        throw new Error(handoff.reason || 'El supermercado no pudo iniciar una sesión de compra.');
      }

      if (pendingWindow && !pendingWindow.closed) {
        pendingWindow.location.replace(targetUrl);
        pendingWindow.focus();
      } else {
        window.location.assign(targetUrl);
      }

      toast({
        title: handoff.mode === 'remote_browser'
          ? `Carro seguro abierto en ${store}`
          : `Carro preparado en ${store}`,
        description: handoff.missingItems.length === 0
          ? `${handoff.plannedCount} productos enviados para carga y revisión.`
          : `${handoff.plannedCount} enviados; ${handoff.missingItems.length} quedaron pendientes.`,
        variant: handoff.missingItems.length === 0 ? 'success' : undefined,
      });
    } catch (error) {
      pendingWindow?.close();
      toast({
        title: 'No se pudo preparar el carro',
        description: error instanceof Error ? error.message : 'La tienda no respondió.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void loadCart()}
      disabled={loading || items.length === 0}
      className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
      style={{ background: 'var(--cc-copper)' }}
    >
      {loading
        ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        : <ShoppingCart className="h-4 w-4" aria-hidden="true" />}
      {loading ? 'Preparando…' : `Cargar ${items.length} en ${store}`}
      {!loading && <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />}
    </button>
  );
}
