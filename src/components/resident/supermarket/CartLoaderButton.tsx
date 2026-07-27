'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Loader2, LockKeyhole, PauseCircle, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type {
  SupermarketCartLoadProgress,
  SupermarketCartLoadRequest,
  SupermarketPurchasePlanBasket,
} from '@/lib/types';

const EXTENSION_SOURCE = 'convive-cart-loader';
const SUPPORTED_STORES = new Set([
  'Lider',
  'Jumbo',
  'Santa Isabel',
  'Unimarc',
  'Tottus',
  'aCuenta',
  'Irurzun',
]);

interface CartLoaderButtonProps {
  basket: SupermarketPurchasePlanBasket;
}

function postToLoader(type: string, payload?: SupermarketCartLoadRequest) {
  window.postMessage({ source: 'convive-connect', type, payload }, window.location.origin);
}

export function CartLoaderButton({ basket }: CartLoaderButtonProps) {
  const supported = SUPPORTED_STORES.has(basket.store);
  const wholesaleQuote = basket.store === 'Irurzun';
  const [loaderReady, setLoaderReady] = useState(false);
  const [checking, setChecking] = useState(supported);
  const [progress, setProgress] = useState<SupermarketCartLoadProgress | null>(null);
  const pingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!supported) return;

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const message = event.data as {
        source?: string;
        type?: string;
        payload?: SupermarketCartLoadProgress;
      };
      if (message.source !== EXTENSION_SOURCE) return;
      if (message.type === 'CONVIVE_CART_LOADER_READY') {
        setLoaderReady(true);
        setChecking(false);
      }
      if (message.type === 'CONVIVE_CART_LOADER_PROGRESS' && message.payload?.store === basket.store) {
        setProgress(message.payload);
      }
    };

    window.addEventListener('message', onMessage);
    postToLoader('CONVIVE_CART_LOADER_PING');
    pingTimer.current = setTimeout(() => setChecking(false), 900);
    return () => {
      window.removeEventListener('message', onMessage);
      if (pingTimer.current) clearTimeout(pingTimer.current);
    };
  }, [basket.store, supported]);

  const request = useMemo<SupermarketCartLoadRequest>(() => ({
    version: 1,
    store: basket.store,
    createdAt: new Date().toISOString(),
    items: basket.items.map(item => ({
      id: item.id,
      name: item.name,
      requestedTerm: item.requestedTerm,
      quantity: Math.max(1, Math.round(item.quantity)),
      productUrl: item.productUrl,
    })),
  }), [basket]);

  if (!supported || (!loaderReady && !checking)) {
    return (
      <div className="rounded-xl border p-3" style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper-warm)' }}>
        <div className="flex items-start gap-2">
          <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 cc-text-tertiary" />
          <div>
            <p className="text-sm font-bold cc-text-primary">Carga directa aún no conectada</p>
            <p className="mt-1 text-xs leading-5 cc-text-secondary">
              {basket.store} no permite que otra web escriba en tu carro sin una conexión autorizada con tu sesión.
              Convive no te pedirá descargar un archivo desconocido ni afirmará que el carro está cargado cuando no lo está.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const isRunning = progress?.status === 'opening' || progress?.status === 'loading';
  const isPaused = progress?.status === 'paused';
  const isDone = progress?.status === 'completed' || progress?.status === 'completed_with_issues';

  return (
    <div className="space-y-2">
      <Button
        type="button"
        disabled={checking || isRunning}
        onClick={() => {
          setProgress({
            store: basket.store,
            status: 'opening',
            total: request.items.length,
            added: 0,
            failed: 0,
            detail: `Abriendo ${basket.store} en una sola pestaña…`,
          });
          postToLoader('CONVIVE_CART_LOADER_START', request);
        }}
        className="h-12 w-full text-sm text-white"
        style={{ background: 'var(--cc-ink)' }}
      >
        {checking || isRunning ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : isDone ? (
          <CheckCircle2 className="mr-2 h-4 w-4" />
        ) : isPaused ? (
          <PauseCircle className="mr-2 h-4 w-4" />
        ) : (
          <ShoppingCart className="mr-2 h-4 w-4" />
        )}
        {isRunning
          ? `Cargando ${progress.added} de ${progress.total}`
          : isDone
            ? wholesaleQuote
              ? `Revisar cotización en ${basket.store}`
              : `Revisar y pagar en ${basket.store}`
            : isPaused
              ? `Continuar en la pestaña de ${basket.store}`
              : wholesaleQuote
                ? `Preparar cotización en ${basket.store}`
                : `Cargar carro en ${basket.store}`}
      </Button>
      {progress && (
        <p className={`text-[11px] ${progress.failed > 0 ? 'text-warning-fg' : 'cc-text-tertiary'}`}>
          {progress.detail}
        </p>
      )}
      {!progress && (
        <p className="text-[11px] cc-text-tertiary">
          {wholesaleQuote
            ? 'CoCo prepara el carro mayorista; tú revisas la cotización antes de enviarla.'
            : 'CoCo carga los productos y cantidades; tú revisas el carro, confirmas la entrega y pagas.'}
        </p>
      )}
    </div>
  );
}
