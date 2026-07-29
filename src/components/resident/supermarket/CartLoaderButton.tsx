'use client';

import { useState } from 'react';
import { Check, Copy, ExternalLink, Loader2, ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import type { SupermarketPurchasePlanBasket } from '@/lib/types';

const STORE_HOME: Record<string, string> = {
  Lider: 'https://www.lider.cl/supermercado',
  Jumbo: 'https://www.jumbo.cl',
  'Santa Isabel': 'https://www.santaisabel.cl',
  Unimarc: 'https://www.unimarc.cl',
  Tottus: 'https://www.tottus.cl/tottus-cl',
  aCuenta: 'https://www.acuenta.cl',
  Irurzun: 'https://irurzun.cl',
};

// aCuenta e Irurzun responden X-Frame-Options: DENY, así que el cargador no
// puede trabajar en segundo plano ahí y avanza de a un producto por clic.
const STEP_BY_STEP_STORES = new Set(['aCuenta', 'Irurzun']);

// Cadenas donde el carro se carga con un enlace, sin instalar nada. Debe
// coincidir con lib/supermarket/cartUrl.ts; el servidor manda, esto solo decide
// qué botón mostrar antes de preguntarle. Jumbo está verificado; Lider y Unimarc
// son "intentar": su WAF puede bloquear y ahí queda el cargador de respaldo.
const VERIFIED_DIRECT_STORES = new Set(['Jumbo']);
const ATTEMPT_DIRECT_STORES = new Set(['Lider', 'Unimarc']);
const DIRECT_CART_STORES = new Set([...VERIFIED_DIRECT_STORES, ...ATTEMPT_DIRECT_STORES]);

interface CartLoaderButtonProps {
  basket: SupermarketPurchasePlanBasket;
}

export function CartLoaderButton({ basket }: CartLoaderButtonProps) {
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [directResult, setDirectResult] = useState<{ loaded: number; missing: string[]; confidence?: 'verified' | 'attempt' } | null>(null);
  const [directUnavailable, setDirectUnavailable] = useState<string | null>(null);

  const storeUrl = STORE_HOME[basket.store];
  const stepByStep = STEP_BY_STEP_STORES.has(basket.store);
  const wholesaleQuote = basket.store === 'Irurzun';

  if (!storeUrl) return null;

  /**
   * Camino preferido: un enlace que deja el carro cargado sin instalar nada.
   * Solo existe en las cadenas que exponen la ruta de carrito de VTEX; el
   * endpoint responde `supported: false` en el resto y ahí se cae al cargador.
   */
  async function loadDirectly() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/supermarket/cart-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store: basket.store,
          items: basket.items.map(item => ({
            name: item.name,
            productUrl: item.productUrl,
            quantity: Math.max(1, Math.round(item.quantity)),
          })),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudo preparar el carro.');

      if (!data.supported || !data.cartUrl) {
        // La tienda no lo permite: se ofrece el cargador en vez de fingir.
        setDirectUnavailable(data.reason || null);
        return;
      }

      setDirectResult({ loaded: data.loadedCount, missing: data.missingItems || [], confidence: data.confidence });
      window.open(data.cartUrl, '_blank', 'noopener');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo preparar el carro.');
    } finally {
      setLoading(false);
    }
  }

  async function prepare() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/supermarket/cart-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store: basket.store,
          items: basket.items.map(item => ({
            id: item.id,
            name: item.name,
            quantity: Math.max(1, Math.round(item.quantity)),
            productUrl: item.productUrl,
          })),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudo preparar la carga.');

      setCode(data.code);
      try {
        await navigator.clipboard.writeText(data.code);
        setCopied(true);
      } catch {
        // Sin permiso de portapapeles: el código igual se muestra para copiarlo a mano.
      }
      window.open(storeUrl, '_blank', 'noopener');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo preparar la carga.');
    } finally {
      setLoading(false);
    }
  }

  if (code) {
    return (
      <div
        className="space-y-3 rounded-xl border p-4"
        style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper-warm)' }}
      >
        <div>
          <p className="text-sm font-bold cc-text-primary">
            {basket.store} se abrió en otra pestaña
          </p>
          <p className="mt-1 text-xs leading-5 cc-text-secondary">
            Inicia sesión ahí si aún no lo has hecho, pulsa el marcador{' '}
            <strong>CoCo · Cargar carro</strong> y pega este código:
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(code).then(() => setCopied(true)).catch(() => undefined);
          }}
          className="flex w-full items-center justify-between rounded-lg border px-4 py-3"
          style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper)' }}
        >
          <span className="font-mono text-xl font-bold tracking-[0.2em] cc-text-primary">{code}</span>
          {copied ? <Check className="h-4 w-4 text-success-fg" /> : <Copy className="h-4 w-4 cc-text-tertiary" />}
        </button>

        <p className="text-[11px] cc-text-tertiary">
          {copied ? 'Código copiado. ' : ''}
          Vence en 30 minutos. {basket.items.length} productos
          {stepByStep
            ? `. En ${basket.store} el cargador avanza de a un producto por clic.`
            : '. CoCo los agrega solos; tú revisas, confirmas la entrega y pagas.'}
        </p>

        <div className="flex gap-2">
          <a
            href={storeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 rounded-lg border px-3 py-2 text-center text-xs font-semibold cc-text-primary"
            style={{ borderColor: 'var(--cc-line)' }}
          >
            Volver a abrir {basket.store}
          </a>
          <button
            type="button"
            onClick={() => { setCode(null); setCopied(false); }}
            className="rounded-lg px-3 py-2 text-xs cc-text-tertiary"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  if (directResult) {
    return (
      <div
        className="space-y-3 rounded-xl border p-4"
        style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper-warm)' }}
      >
        <div>
          <p className="text-sm font-bold cc-text-primary">
            {directResult.confidence === 'attempt'
              ? `Abrimos ${basket.store} e intentamos cargar tu carro`
              : `${basket.store} se abrió con tu carro cargado`}
          </p>
          <p className="mt-1 text-xs leading-5 cc-text-secondary">
            {directResult.confidence === 'attempt' ? (
              <>
                Enviamos {directResult.loaded} producto(s). {basket.store} a veces pide verificación
                o bloquea la carga automática. Si el carro llegó vacío, usa el cargador de respaldo.
                Si iniciaste sesión y los productos quedaron, revisa, elige la entrega y paga.
              </>
            ) : (
              <>
                {directResult.loaded} producto(s) quedaron en el carro. Si la tienda te pide
                iniciar sesión, hazlo y el carro se arma solo. Revisa, elige la entrega y paga.
              </>
            )}
          </p>
        </div>

        {directResult.missing.length > 0 && (
          <div className="rounded-lg border px-3 py-2" style={{ borderColor: 'var(--cc-line)' }}>
            <p className="text-[11px] font-semibold cc-text-primary">
              {directResult.missing.length} producto(s) no se pudieron cargar
            </p>
            <p className="mt-1 text-[11px] leading-4 cc-text-tertiary">
              {directResult.missing.slice(0, 5).join(', ')}
              {directResult.missing.length > 5 ? `, y ${directResult.missing.length - 5} más` : ''}.
              Tendrás que buscarlos en la tienda.
            </p>
          </div>
        )}

        <div className="flex items-center gap-3">
          {directResult.confidence === 'attempt' && (
            <Link
              href="/resident/supermercado/cargador"
              className="inline-flex items-center gap-1 text-xs font-semibold underline cc-text-primary"
            >
              Usar el cargador de respaldo <ExternalLink className="h-3 w-3" />
            </Link>
          )}
          <button
            type="button"
            onClick={() => setDirectResult(null)}
            className="text-xs underline cc-text-tertiary"
          >
            Volver
          </button>
        </div>
      </div>
    );
  }

  const canLoadDirectly = DIRECT_CART_STORES.has(basket.store) && !directUnavailable;

  return (
    <div className="space-y-2">
      <Button
        type="button"
        disabled={loading}
        onClick={() => void (canLoadDirectly ? loadDirectly() : prepare())}
        className="h-12 w-full text-sm text-white"
        style={{ background: 'var(--cc-ink)' }}
      >
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShoppingCart className="mr-2 h-4 w-4" />}
        {wholesaleQuote ? `Preparar cotización en ${basket.store}` : `Cargar carro en ${basket.store}`}
      </Button>

      {error && <p className="text-[11px] text-danger-fg">{error}</p>}
      {directUnavailable && <p className="text-[11px] cc-text-tertiary">{directUnavailable}</p>}

      {canLoadDirectly && VERIFIED_DIRECT_STORES.has(basket.store) ? (
        <p className="text-[11px] cc-text-tertiary">
          Se abre {basket.store} con los productos ya en el carro. No tienes que instalar nada.
        </p>
      ) : canLoadDirectly ? (
        <p className="text-[11px] cc-text-tertiary">
          Intentamos cargar el carro directo en {basket.store} sin instalar nada. Su sitio a veces
          pide verificación; si te bloquea, tienes el cargador de respaldo.
        </p>
      ) : (
        <p className="text-[11px] cc-text-tertiary">
          En {basket.store} necesitas el marcador de CoCo una sola vez.{' '}
          <Link href="/resident/supermercado/cargador" className="inline-flex items-center gap-1 underline">
            Activarlo ahora <ExternalLink className="h-3 w-3" />
          </Link>
        </p>
      )}
    </div>
  );
}
