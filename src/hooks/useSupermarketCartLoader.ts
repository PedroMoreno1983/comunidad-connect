'use client';

import { Capacitor } from '@capacitor/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  SupermarketCartLoadProgress,
  SupermarketCartLoadRequest,
  SupermarketCartLoaderBridge,
  SupermarketPurchasePlanBasket,
} from '@/lib/types';

const CONVIVE_SOURCE = 'convive-connect';
const LOADER_SOURCE = 'convive-cart-loader';
const READY_TIMEOUT_MS = 1_500;

function isCartProgress(value: unknown): value is SupermarketCartLoadProgress {
  if (!value || typeof value !== 'object') return false;
  const progress = value as Partial<SupermarketCartLoadProgress>;
  return typeof progress.store === 'string'
    && typeof progress.status === 'string'
    && typeof progress.total === 'number'
    && typeof progress.added === 'number'
    && typeof progress.failed === 'number'
    && typeof progress.detail === 'string';
}

export function useSupermarketCartLoader(
  basket: SupermarketPurchasePlanBasket,
): SupermarketCartLoaderBridge {
  const [availability, setAvailability] = useState<SupermarketCartLoaderBridge['availability']>('checking');
  const [progress, setProgress] = useState<SupermarketCartLoadProgress | null>(null);

  const request = useMemo<SupermarketCartLoadRequest>(() => ({
    version: 1,
    store: basket.store,
    createdAt: new Date().toISOString(),
    items: basket.items.map((item, index) => ({
      id: item.id || `${basket.store}-${index + 1}`,
      name: item.name,
      requestedTerm: item.requestedTerm || item.name,
      quantity: Math.max(1, Math.round(item.quantity)),
      productUrl: item.productUrl,
    })),
  }), [basket]);

  useEffect(() => {
    setProgress(null);
    if (Capacitor.isNativePlatform()) {
      setAvailability('unavailable');
      return;
    }

    setAvailability('checking');
    let ready = false;
    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      if (!event.data || typeof event.data !== 'object') return;
      const message = event.data as { source?: string; type?: string; payload?: unknown };
      if (message.source !== LOADER_SOURCE) return;

      if (message.type === 'CONVIVE_CART_LOADER_READY') {
        ready = true;
        setAvailability('ready');
        return;
      }

      if (
        message.type === 'CONVIVE_CART_LOADER_PROGRESS'
        && isCartProgress(message.payload)
        && message.payload.store === basket.store
      ) {
        setProgress(message.payload);
      }
    };

    window.addEventListener('message', onMessage);
    window.postMessage({
      source: CONVIVE_SOURCE,
      type: 'CONVIVE_CART_LOADER_PING',
    }, window.location.origin);

    const retry = window.setTimeout(() => {
      window.postMessage({
        source: CONVIVE_SOURCE,
        type: 'CONVIVE_CART_LOADER_PING',
      }, window.location.origin);
    }, 300);
    const timeout = window.setTimeout(() => {
      if (!ready) setAvailability('unavailable');
    }, READY_TIMEOUT_MS);

    return () => {
      window.removeEventListener('message', onMessage);
      window.clearTimeout(retry);
      window.clearTimeout(timeout);
    };
  }, [basket.store]);

  const start = useCallback(() => {
    if (availability !== 'ready' || request.items.length === 0) return false;
    setProgress({
      store: request.store,
      status: 'opening',
      total: request.items.length,
      added: 0,
      failed: 0,
      detail: `Abriendo ${request.store} para cargar el carro…`,
    });
    window.postMessage({
      source: CONVIVE_SOURCE,
      type: 'CONVIVE_CART_LOADER_START',
      payload: request,
    }, window.location.origin);
    return true;
  }, [availability, request]);

  return { availability, progress, start };
}
