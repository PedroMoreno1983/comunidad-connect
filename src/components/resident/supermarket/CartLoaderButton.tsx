'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Download, Loader2, PauseCircle, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type {
  SupermarketCartLoadProgress,
  SupermarketCartLoadRequest,
  SupermarketPurchasePlanBasket,
} from '@/lib/types';

const EXTENSION_SOURCE = 'convive-cart-loader';
const EXTENSION_DOWNLOAD = '/downloads/convive-cart-loader.zip';
const SUPPORTED_STORES = new Set(['Lider']);

interface CartLoaderButtonProps {
  basket: SupermarketPurchasePlanBasket;
}

function postToLoader(type: string, payload?: SupermarketCartLoadRequest) {
  window.postMessage({ source: 'convive-connect', type, payload }, window.location.origin);
}

export function CartLoaderButton({ basket }: CartLoaderButtonProps) {
  const supported = SUPPORTED_STORES.has(basket.store);
  const [extensionReady, setExtensionReady] = useState(false);
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
        setExtensionReady(true);
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

  if (!supported) {
    return (
      <div className="mt-3 rounded-lg border px-3 py-2 text-xs cc-text-secondary" style={{ borderColor: 'var(--cc-line)' }}>
        La carga automática todavía no está validada para {basket.store}. CoCo mantiene la lista agrupada, pero no la presenta como carro listo.
      </div>
    );
  }

  const isRunning = progress?.status === 'opening' || progress?.status === 'loading';
  const isPaused = progress?.status === 'paused';
  const isDone = progress?.status === 'completed' || progress?.status === 'completed_with_issues';

  if (!extensionReady && !checking) {
    return (
      <div className="mt-3 space-y-2">
        <a
          href={EXTENSION_DOWNLOAD}
          download
          className="inline-flex w-full items-center justify-center rounded-lg px-3 py-2 text-xs font-bold text-white"
          style={{ background: 'var(--cc-ink)' }}
        >
          <Download className="mr-2 h-3.5 w-3.5" />
          Descargar cargador beta
        </a>
        <p className="text-[11px] cc-text-tertiary">
          Disponible en Chrome de escritorio. Se instala una vez; luego CoCo carga los productos en tu sesión real de Lider.
        </p>
        <details className="rounded-lg border px-3 py-2 text-[11px] cc-text-secondary" style={{ borderColor: 'var(--cc-line)' }}>
          <summary className="cursor-pointer font-bold">Cómo activarlo por primera vez</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            <li>Descomprime el archivo descargado.</li>
            <li>Abre <code>chrome://extensions</code> y activa Modo desarrollador.</li>
            <li>Pulsa “Cargar extensión sin empaquetar” y elige la carpeta.</li>
            <li>Recarga Supermercado en Convive.</li>
          </ol>
        </details>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2">
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
            detail: 'Abriendo Lider en una sola pestaña…',
          });
          postToLoader('CONVIVE_CART_LOADER_START', request);
        }}
        className="h-10 w-full text-xs text-white"
        style={{ background: 'var(--cc-ink)' }}
      >
        {checking || isRunning ? (
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
        ) : isDone ? (
          <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
        ) : isPaused ? (
          <PauseCircle className="mr-2 h-3.5 w-3.5" />
        ) : (
          <ShoppingCart className="mr-2 h-3.5 w-3.5" />
        )}
        {isRunning
          ? `Cargando ${progress.added} de ${progress.total}`
          : isDone
            ? `Carro cargado: ${progress.added} de ${progress.total}`
            : isPaused
              ? 'Continuar en la pestaña de Lider'
              : `Cargar ${basket.items.length} en Lider`}
      </Button>
      {progress && (
        <p className={`text-[11px] ${progress.failed > 0 ? 'text-warning-fg' : 'cc-text-tertiary'}`}>
          {progress.detail}
        </p>
      )}
    </div>
  );
}
