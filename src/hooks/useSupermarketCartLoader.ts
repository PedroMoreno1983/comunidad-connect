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
const REQUIRED_LOADER_CAPABILITIES = [
  'cart-baseline-v1',
  'cart-auto-open-v2',
  'cart-replace-v1',
  'cart-stale-job-recovery-v1',
  'cart-zero-proof-v1',
] as const;

function loaderIdentity(value: unknown): { version?: string; capabilities: string[] } {
  if (!value || typeof value !== 'object') return { capabilities: [] };
  const identity = value as { version?: unknown; capabilities?: unknown };
  return {
    version: typeof identity.version === 'string' ? identity.version : undefined,
    capabilities: Array.isArray(identity.capabilities)
      ? identity.capabilities.filter((capability): capability is string => typeof capability === 'string')
      : [],
  };
}

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
  const [availability, setAvailability] = useState<SupermarketCartLoaderBridge['availability']>(
    Capacitor.isNativePlatform() ? 'unavailable' : 'checking',
  );
  const [progress, setProgress] = useState<SupermarketCartLoadProgress | null>(null);
  const [installedVersion, setInstalledVersion] = useState<string>();

  const request = useMemo<Omit<SupermarketCartLoadRequest, 'replaceCart'>>(() => ({
    version: 1,
    store: basket.store,
    createdAt: new Date().toISOString(),
    items: basket.items.map((item, index) => ({
      id: item.id || `${basket.store}-${index + 1}`,
      name: item.name,
      requestedTerm: item.requestedTerm || item.name,
      quantity: Math.max(1, Math.round(item.quantity)),
      productUrl: item.productUrl,
      sku: item.sku,
      offerId: item.offerId,
    })),
  }), [basket]);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;

    let answered = false;
    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      if (!event.data || typeof event.data !== 'object') return;
      const message = event.data as { source?: string; type?: string; payload?: unknown };
      if (message.source !== LOADER_SOURCE) return;

      if (message.type === 'CONVIVE_CART_LOADER_READY') {
        answered = true;
        const identity = loaderIdentity(message.payload);
        setInstalledVersion(identity.version);
        const compatible = REQUIRED_LOADER_CAPABILITIES.every(capability => (
          identity.capabilities.includes(capability)
        ));
        setAvailability(compatible ? 'ready' : 'outdated');
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
      if (!answered) setAvailability('unavailable');
    }, READY_TIMEOUT_MS);

    return () => {
      window.removeEventListener('message', onMessage);
      window.clearTimeout(retry);
      window.clearTimeout(timeout);
    };
  }, [basket.store]);

  const start = useCallback((options?: { replaceCart?: boolean }) => {
    if (availability !== 'ready' || request.items.length === 0) return false;
    const replaceCart = options?.replaceCart === true;
    setProgress({
      store: request.store,
      status: 'opening',
      total: request.items.length,
      added: 0,
      failed: 0,
      detail: replaceCart
        ? `Abriendo ${request.store} para reemplazar el carro anterior…`
        : `Abriendo ${request.store} para cargar el carro…`,
    });
    window.postMessage({
      source: CONVIVE_SOURCE,
      type: 'CONVIVE_CART_LOADER_START',
      payload: { ...request, replaceCart },
    }, window.location.origin);
    return true;
  }, [availability, request]);

  return {
    availability,
    installedVersion,
    progress: progress?.store === basket.store ? progress : null,
    start,
  };
}
