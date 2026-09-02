'use client';

import { useEffect, useState } from 'react';
import { Loader2, ShoppingCart } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { SupermarketCartService } from '@/lib/api';
import {
  managedCartAvailable,
  managedCartItems,
  openManagedRetailerCart,
} from '@/lib/supermarketManagedCart';
import type {
  SupermarketCartHandoffItem,
  SupermarketManagedCartButtonProps,
} from '@/lib/types';

export function ManagedCartButton({ store, items }: SupermarketManagedCartButtonProps) {
  const { toast } = useToast();
  const [native, setNative] = useState(false);
  const [loading, setLoading] = useState(false);
  const transferable = managedCartItems(store, items).length;

  useEffect(() => {
    setNative(managedCartAvailable());
  }, []);

  const loadCart = async () => {
    setLoading(true);
    const blankTab = !native ? window.open('about:blank', '_blank') : null;
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
      if (handoff.supported && handoff.cartUrl) {
        if (native) {
          const { InAppBrowser, ToolBarType } = await import('@capgo/capacitor-inappbrowser');
          await InAppBrowser.openWebView({
            url: handoff.cartUrl,
            toolbarType: ToolBarType.NAVIGATION,
            title: `Carro de ${store}`,
            persistWebViewData: true,
            isPresentAfterPageLoad: false,
          });
        } else if (blankTab && !blankTab.closed) {
          blankTab.location.assign(handoff.cartUrl);
          blankTab.focus();
        } else {
          window.open(handoff.cartUrl, '_blank', 'noopener,noreferrer');
        }
        toast({
          title: `Carro preparado en ${store}`,
          description: handoff.missingItems.length === 0
            ? `${handoff.plannedCount} productos enviados al checkout para revisión.`
            : `${handoff.plannedCount} enviados; ${handoff.missingItems.length} quedaron pendientes.`,
          variant: handoff.missingItems.length === 0 ? 'success' : undefined,
        });
        return;
      }

      blankTab?.close();
      const result = await openManagedRetailerCart(store, items, {
        onProgress: current => {
          if (current.status === 'completed') {
            toast({ title: 'Carro listo para revisar', description: current.detail, variant: current.failed === 0 ? 'success' : undefined });
          } else if (current.status === 'error') {
            toast({ title: 'No se pudo abrir la compra', description: current.detail, variant: 'destructive' });
          }
        },
      });
      if (result.started) return;
      toast({
        title: result.reason === 'empty_cart' ? 'No hay fichas para transferir' : 'La carga necesita la app móvil',
        description: result.reason === 'empty_cart'
          ? 'Busca o reemplaza los productos faltantes antes de cargar el carro.'
          : 'Abre esta compra desde la app Convive en Android o iPhone.',
        variant: 'destructive',
      });
    } catch (error) {
      blankTab?.close();
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
        ? <Loader2 className="h-4 w-4 animate-spin" />
        : <ShoppingCart className="h-4 w-4" />}
      {loading ? 'Preparando…' : `Cargar ${transferable || items.length} en ${store}`}
    </button>
  );
}
