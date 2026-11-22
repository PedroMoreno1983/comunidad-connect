'use client';

import { useState } from 'react';
import { ExternalLink, Loader2, ShoppingCart } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { SupermarketCartService } from '@/lib/api';
import { storeSearchUrl } from '@/lib/supermarketText';
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

/**
 * Cadenas cuyo carro se carga solo en el navegador de la persona (enlace oficial).
 * En las demás el carro lo arma el navegador remoto; ahí se ofrece además comprar
 * en el propio navegador con la lista y un enlace a cada producto (22-11-2026).
 */
const OWN_BROWSER_CART = new Set(['Jumbo', 'Santa Isabel', 'Unimarc', 'Irurzun']);

export function RemoteCartButton({ store, items, complete }: SupermarketCartButtonProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const partial = complete === false;

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
        title: partial
          ? `Compra parcial abierta en ${store}`
          : handoff.mode === 'remote_browser'
          ? `Sesión de revisión abierta en ${store}`
          : `Carro oficial abierto en ${store}`,
        description: partial
          ? `Se intentarán cargar ${handoff.plannedCount} productos disponibles. Tu lista sigue incompleta: busca los faltantes en ${store} y confirma el carro antes de pagar.`
          : handoff.mode === 'remote_browser'
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

  const buttonLabel = partial
    ? `Abrir ${items.length} ${items.length === 1 ? 'producto disponible' : 'productos disponibles'} en ${store}`
    : store === 'Lider'
      ? 'Abrir carro asistido en Líder'
      : `Abrir canasta en ${store}`;

  const offerOwnBrowser = !OWN_BROWSER_CART.has(store) && items.length > 0;

  return (
    <div className="flex flex-col items-start gap-2">
    <button
      type="button"
      onClick={() => void loadCart()}
      disabled={loading || items.length === 0}
      title={store === 'Lider'
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
    {offerOwnBrowser && (
      <details className="w-full max-w-md text-xs cc-text-secondary">
        <summary className="cursor-pointer font-semibold">Prefiero comprar en mi navegador</summary>
        <p className="mt-2">
          {store} no permite cargar el carro desde otro sitio. Abre cada producto en tu navegador, con tu sesión de {store} de siempre, y agrégalo:
        </p>
        <ol className="mt-2 space-y-1">
          {items.map(item => {
            const href = item.productUrl || storeSearchUrl(store, item.name);
            return (
              <li key={item.id} className="flex items-baseline gap-1.5">
                <span className="font-semibold">{item.quantity} ×</span>
                {href
                  ? <a href={href} target="_blank" rel="noreferrer" className="underline">{item.name}</a>
                  : <span>{item.name}</span>}
              </li>
            );
          })}
        </ol>
      </details>
    )}
    </div>
  );
}
