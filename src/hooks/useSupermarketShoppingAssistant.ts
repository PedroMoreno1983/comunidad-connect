'use client';

import { Capacitor } from '@capacitor/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  SupermarketBasketCandidate,
  SupermarketShoppingAssistantBridge,
  SupermarketShoppingAssistantProgress,
  SupermarketShoppingAssistantRequest,
} from '@/lib/types';

const CONVIVE_SOURCE = 'convive-connect';
const ASSISTANT_SOURCE = 'convive-shopping-assistant';
export const SHOPPING_ASSISTANT_READY_TIMEOUT_MS = 4_000;

const REQUIRED_CAPABILITIES = [
  'shopping-assistant-v1',
  'cart-baseline-v1',
  'cart-auto-open-v2',
  'cart-replace-v1',
  'cart-stale-job-recovery-v1',
  'cart-zero-proof-v1',
] as const;

function identity(value: unknown) {
  if (!value || typeof value !== 'object') return { version: undefined, capabilities: [] as string[] };
  const record = value as Record<string, unknown>;
  return {
    version: typeof record.version === 'string' ? record.version : undefined,
    capabilities: Array.isArray(record.capabilities)
      ? record.capabilities.filter((entry): entry is string => typeof entry === 'string')
      : [],
  };
}

function isProgress(value: unknown): value is SupermarketShoppingAssistantProgress {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.store === 'string'
    && typeof record.status === 'string'
    && typeof record.total === 'number'
    && typeof record.added === 'number'
    && typeof record.failed === 'number'
    && typeof record.detail === 'string';
}

export function useSupermarketShoppingAssistant(
  basket: SupermarketBasketCandidate,
): SupermarketShoppingAssistantBridge {
  const native = Capacitor.isNativePlatform();
  const [availability, setAvailability] = useState<SupermarketShoppingAssistantBridge['availability']>(
    native ? 'unavailable' : 'checking',
  );
  const [installedVersion, setInstalledVersion] = useState<string>();
  const [progress, setProgress] = useState<SupermarketShoppingAssistantProgress | null>(null);

  const request = useMemo<Omit<SupermarketShoppingAssistantRequest, 'replaceCart'>>(() => ({
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
    if (native) return;
    let answered = false;

    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      if (!event.data || typeof event.data !== 'object') return;
      const message = event.data as Record<string, unknown>;
      if (message.source !== ASSISTANT_SOURCE || typeof message.type !== 'string') return;

      if (message.type === 'CONVIVE_CART_LOADER_READY') {
        answered = true;
        const assistant = identity(message.payload);
        setInstalledVersion(assistant.version);
        setAvailability(REQUIRED_CAPABILITIES.every(capability => assistant.capabilities.includes(capability))
          ? 'ready'
          : 'outdated');
        return;
      }

      if (message.type === 'CONVIVE_CART_LOADER_PROGRESS' && isProgress(message.payload)) {
        if (message.payload.store === basket.store) setProgress(message.payload);
      }
    };

    window.addEventListener('message', onMessage);
    const ping = () => window.postMessage({
      source: CONVIVE_SOURCE,
      type: 'CONVIVE_CART_LOADER_PING',
    }, window.location.origin);
    ping();
    const retry = window.setTimeout(ping, 300);
    const timeout = window.setTimeout(() => {
      if (!answered) setAvailability('unavailable');
    }, SHOPPING_ASSISTANT_READY_TIMEOUT_MS);

    return () => {
      window.removeEventListener('message', onMessage);
      window.clearTimeout(retry);
      window.clearTimeout(timeout);
    };
  }, [basket.store, native]);

  const start = useCallback((options?: { replaceCart?: boolean }) => {
    if (availability !== 'ready' || request.items.length === 0) return false;
    const replaceCart = options?.replaceCart === true;
    setProgress({
      store: request.store,
      status: 'opening',
      total: request.items.length,
      added: 0,
      failed: 0,
      detail: `Abriendo ${request.store} para cargar y verificar ${request.items.length} productos…`,
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
