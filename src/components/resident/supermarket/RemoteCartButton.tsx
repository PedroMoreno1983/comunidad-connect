'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import QRCode from 'qrcode';
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Loader2,
  ShoppingCart,
  Smartphone,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { SupermarketCartService } from '@/lib/api';
import { prepareLiderAppCartHandoff } from '@/lib/supermarketLiderHandoff';
import type {
  SupermarketCartButtonProps,
  SupermarketCartHandoff,
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

function isMobileDevice(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function RemoteCartButton({ store, items, complete }: SupermarketCartButtonProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [liderHandoff, setLiderHandoff] = useState<SupermarketCartHandoff | null>(null);
  const [liderMobile, setLiderMobile] = useState(false);
  const [qrDataUrls, setQrDataUrls] = useState<string[]>([]);
  const [qrIndex, setQrIndex] = useState(0);
  const liderIncomplete = store === 'Lider' && complete === false;

  const liderLinks = useMemo(() => (
    liderHandoff?.cartUrls?.length
      ? liderHandoff.cartUrls
      : liderHandoff?.cartUrl
        ? [liderHandoff.cartUrl]
        : []
  ), [liderHandoff]);
  const mobileLinks = liderHandoff?.cartUrl ? [liderHandoff.cartUrl] : liderLinks;

  useEffect(() => {
    let cancelled = false;
    if (!liderHandoff || liderMobile || liderLinks.length === 0) {
      setQrDataUrls([]);
      return;
    }

    Promise.all(liderLinks.map(link => QRCode.toDataURL(link, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 480,
      color: { dark: '#1f1713', light: '#ffffff' },
    }))).then(urls => {
      if (!cancelled) setQrDataUrls(urls);
    }).catch(error => {
      console.error('Lider cart QR generation failed:', error);
      if (!cancelled) setQrDataUrls([]);
    });

    return () => {
      cancelled = true;
    };
  }, [liderHandoff, liderLinks, liderMobile]);

  const showLiderHandoff = (handoff: SupermarketCartHandoff) => {
    if (!handoff.supported || (!handoff.cartUrl && !handoff.cartUrls?.length)) {
      toast({
        title: 'No se pudo preparar la canasta de Líder',
        description: handoff.reason || 'Actualiza la comparación e inténtalo nuevamente.',
        variant: 'destructive',
      });
      return false;
    }
    setQrIndex(0);
    setQrDataUrls([]);
    setLiderMobile(isMobileDevice());
    setLiderHandoff(handoff);
    return true;
  };

  const openLiderHandoff = async () => {
    if (liderIncomplete) return;
    const itemsForHandoff = handoffItems(items);
    const immediate = prepareLiderAppCartHandoff(itemsForHandoff);
    if (immediate.supported) {
      showLiderHandoff(immediate);
      return;
    }

    setLoading(true);
    try {
      const enriched = await SupermarketCartService.prepareHandoff('Lider', itemsForHandoff);
      showLiderHandoff(enriched);
    } catch (error) {
      toast({
        title: 'No se pudo preparar la canasta de Líder',
        description: error instanceof Error ? error.message : immediate.reason,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

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
          ? `${handoff.plannedCount} productos por procesar. El visor mostrará el carro para que confirmes productos y cantidades.`
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

  const copyLiderLink = async () => {
    const link = liderLinks[qrIndex] ?? mobileLinks[0];
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast({
        title: 'Enlace de Líder copiado',
        description: 'Ábrelo en el teléfono que tenga instalada la app oficial de Líder.',
        variant: 'success',
      });
    } catch {
      toast({
        title: 'No se pudo copiar el enlace',
        description: 'Usa el código QR para abrir la canasta desde tu teléfono.',
        variant: 'destructive',
      });
    }
  };

  const closeLiderDialog = () => {
    setLiderHandoff(null);
    setQrDataUrls([]);
    setQrIndex(0);
  };

  return (
    <>
      <button
        type="button"
        onClick={store === 'Lider' ? () => void openLiderHandoff() : () => void loadCart()}
        disabled={loading || items.length === 0 || liderIncomplete}
        title={liderIncomplete ? 'Completa todos los productos antes de abrir la canasta de Líder.' : undefined}
        className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
        style={{ background: 'var(--cc-copper)' }}
      >
        {loading
          ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          : store === 'Lider'
            ? <Smartphone className="h-4 w-4" aria-hidden="true" />
            : <ShoppingCart className="h-4 w-4" aria-hidden="true" />}
        {loading
          ? 'Preparando…'
          : store === 'Lider'
            ? liderIncomplete
              ? 'Canasta incompleta en Líder'
              : 'Abrir en la app de Líder'
            : `Abrir canasta en ${store}`}
        {!loading && <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />}
      </button>

      <Dialog
        open={liderHandoff !== null}
        onOpenChange={open => {
          if (!open) closeLiderDialog();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Canasta lista para la app de Líder</DialogTitle>
            <DialogDescription className="leading-6">
              {liderHandoff?.plannedCount} productos viajan a tu propia sesión. Líder mostrará el carro para que confirmes disponibilidad, cantidades y precios antes de pagar.
            </DialogDescription>
          </DialogHeader>

          {liderMobile ? (
            <div className="space-y-3">
              <p className="text-sm leading-6 cc-text-secondary">
                {mobileLinks.length === 1
                  ? 'Toca el botón para continuar en la app oficial de Líder.'
                  : `Abre los ${mobileLinks.length} enlaces en orden para completar toda la canasta.`}
              </p>
              {mobileLinks.map((link, index) => (
                <a
                  key={link}
                  href={link}
                  className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white"
                  style={{ background: 'var(--cc-copper)' }}
                >
                  <Smartphone className="h-4 w-4" aria-hidden="true" />
                  {mobileLinks.length === 1
                    ? 'Abrir app de Líder'
                    : `Abrir paso ${index + 1} de ${mobileLinks.length}`}
                </a>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm leading-6 cc-text-secondary">
                {liderLinks.length === 1
                  ? 'Escanea este código con el teléfono donde tienes instalada la app oficial de Líder.'
                  : `Escanea los ${liderLinks.length} códigos en orden. Cada uno cubre una parte y, juntos, contienen toda la canasta.`}
              </p>
              <div className="mx-auto aspect-square w-full max-w-[280px] rounded-xl border bg-white p-3" style={{ borderColor: 'var(--cc-line)' }}>
                {qrDataUrls[qrIndex] ? (
                  <Image
                    src={qrDataUrls[qrIndex]}
                    alt={`Código QR ${qrIndex + 1} para abrir la canasta en la app de Líder`}
                    width={480}
                    height={480}
                    unoptimized
                    className="h-full w-full"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm cc-text-secondary">
                    Generando código QR…
                  </div>
                )}
              </div>
              {liderLinks.length > 1 && (
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setQrIndex(index => Math.max(0, index - 1))}
                    disabled={qrIndex === 0}
                    className="rounded-lg border p-2 disabled:opacity-40"
                    style={{ borderColor: 'var(--cc-line)' }}
                    aria-label="Código anterior"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <p className="text-xs font-bold cc-text-secondary">
                    Código {qrIndex + 1} de {liderLinks.length}
                  </p>
                  <button
                    type="button"
                    onClick={() => setQrIndex(index => Math.min(liderLinks.length - 1, index + 1))}
                    disabled={qrIndex === liderLinks.length - 1}
                    className="rounded-lg border p-2 disabled:opacity-40"
                    style={{ borderColor: 'var(--cc-line)' }}
                    aria-label="Código siguiente"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={() => void copyLiderLink()}
                className="flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold cc-text-primary"
                style={{ borderColor: 'var(--cc-line)' }}
              >
                <Copy className="h-4 w-4" aria-hidden="true" />
                Copiar enlace de este código
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
