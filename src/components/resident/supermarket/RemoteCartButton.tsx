'use client';

import { useState } from 'react';
import { ExternalLink, Loader2, ShoppingCart } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { SupermarketCartService } from '@/lib/api';
import type {
  SupermarketCartButtonProps,
  SupermarketCartHandoffItem,
  SupermarketSearchCandidate,
} from '@/lib/types';

function handoffItems(items: SupermarketSearchCandidate[]): SupermarketCartHandoffItem[] {
  return items.map(item => ({
    id: item.id,
    name: item.name,
    requestedTerm: item.requestedTerm,
    quantity: item.quantity,
    sku: item.sku,
    offerId: item.offerId,
    salesUnit: item.salesUnit,
    productUrl: item.productUrl,
    price: item.price,
  }));
}

export function RemoteCartButton({ store, items, complete }: SupermarketCartButtonProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const liderIncomplete = store === 'Lider' && complete === false;

  const loadCart = async () => {
    setLoading(true);
    const pendingWindow = window.open('about:blank', '_blank');
    if (pendingWindow) {
      pendingWindow.opener = null;
      pendingWindow.document.title = `Preparando carro en ${store}`;
      pendingWindow.document.body.textContent = 'Preparando tu carro seguro…';
    }

    try {
      const handoff = await SupermarketCartService.prepareHandoff(store, handoffItems(items));
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
          ? `Sesión de revisión abierta en ${store}`
          : `Carro oficial abierto en ${store}`,
        description: handoff.mode === 'remote_browser'
          ? store === 'Lider'
            ? `${handoff.plannedCount} productos por procesar. Si Líder pide una verificación humana, resuélvela en esa sesión y continúa; el carro solo se marcará listo después de comprobar productos y cantidades.`
            : `${handoff.plannedCount} productos por procesar. El visor mostrará el carro para que confirmes productos y cantidades.`
          : handoff.missingItems.length === 0
            ? `${handoff.plannedCount} productos solicitados. Confirma productos y cantidades antes de pagar.`
            : `${handoff.plannedCount} productos solicitados; ${handoff.missingItems.length} no pudieron incluirse.`,
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

  const buttonLabel = liderIncomplete
    ? 'Canasta incompleta en Líder'
    : store === 'Lider'
      ? 'Abrir carro asistido en Líder'
      : `Abrir canasta en ${store}`;

  return (
    <button
      type="button"
      onClick={() => void loadCart()}
      disabled={loading || items.length === 0 || liderIncomplete}
      title={liderIncomplete
        ? 'Completa todos los productos antes de abrir la canasta de Líder.'
        : store === 'Lider'
          ? 'Líder puede pedir una verificación humana antes de cargar los productos.'
          : undefined}
      className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
      style={{ background: 'var(--cc-copper)' }}
    >
      {loading
        ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        : <ShoppingCart className="h-4 w-4" aria-hidden="true" />}
      {loading ? 'Preparando…' : buttonLabel}
      {!loading && <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />}
    </button>
  );
}
