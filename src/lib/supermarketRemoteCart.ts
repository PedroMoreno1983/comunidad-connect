import 'server-only';

import { prepareDirectCartHandoff } from '@/lib/supermarketDirectHandoff';
import type {
  SupermarketCartHandoff,
  SupermarketCartHandoffItem,
} from '@/lib/types';

const DEFAULT_WORKER_URL = 'https://radareducativo.datawiseconsultoria.com/convive-cart';
const WORKER_TIMEOUT_MS = 15_000;

interface RemoteSessionResponse {
  sessionId?: unknown;
  viewerUrl?: unknown;
  expiresAt?: unknown;
  plannedCount?: unknown;
  missingItems?: unknown;
  error?: unknown;
}

function cleanWorkerUrl(): string {
  return (process.env.SUPERMARKET_CART_WORKER_URL || DEFAULT_WORKER_URL).replace(/\/+$/, '');
}

function cleanMissingItems(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').slice(0, 200)
    : [];
}

function cleanCount(value: unknown, fallback: number): number {
  const count = Number(value);
  return Number.isFinite(count) ? Math.min(200, Math.max(0, Math.round(count))) : fallback;
}

export async function prepareRemoteCartHandoff(
  store: string,
  items: SupermarketCartHandoffItem[],
  userAccessToken: string,
): Promise<SupermarketCartHandoff> {
  const direct = await prepareDirectCartHandoff(store, items);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WORKER_TIMEOUT_MS);

  try {
    const response = await fetch(`${cleanWorkerUrl()}/v1/sessions`, {
      method: 'POST',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${userAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        store,
        items,
        directCartUrl: direct.cartUrl,
        plannedCount: direct.plannedCount,
        missingItems: direct.missingItems,
      }),
    });
    const payload = await response.json().catch(() => null) as RemoteSessionResponse | null;
    const viewerUrl = typeof payload?.viewerUrl === 'string' ? payload.viewerUrl : '';
    const sessionId = typeof payload?.sessionId === 'string' ? payload.sessionId : '';
    if (!response.ok || !viewerUrl || !sessionId) {
      const workerMessage = typeof payload?.error === 'string' ? payload.error : '';
      throw new Error(workerMessage || 'El navegador seguro no está disponible en este momento.');
    }

    return {
      supported: true,
      store,
      mode: 'remote_browser',
      sessionUrl: viewerUrl,
      sessionId,
      expiresAt: typeof payload?.expiresAt === 'string' ? payload.expiresAt : undefined,
      plannedCount: cleanCount(payload?.plannedCount, direct.plannedCount || items.length),
      missingItems: cleanMissingItems(payload?.missingItems),
    };
  } catch (error) {
    if (direct.supported && direct.cartUrl) return direct;
    const detail = error instanceof Error && error.name !== 'AbortError'
      ? error.message
      : 'El navegador seguro demoró demasiado en responder.';
    return {
      supported: false,
      store,
      mode: 'unavailable',
      plannedCount: 0,
      missingItems: [],
      reason: detail,
    };
  } finally {
    clearTimeout(timeout);
  }
}
