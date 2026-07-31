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

// Estas cadenas tienen una ruta de carrito que se ejecuta dentro de la sesión
// del navegador. El servidor prepara el enlace; la tienda agrega y la persona
// confirma el resultado en su checkout.
const VERIFIED_DIRECT_STORES = new Set(['Jumbo', 'Santa Isabel', 'Unimarc']);
const ATTEMPT_DIRECT_STORES = new Set(['Lider']);
const DIRECT_CART_STORES = new Set([...VERIFIED_DIRECT_STORES, ...ATTEMPT_DIRECT_STORES]);

// Tottus corre en la plataforma de Falabella y hoy requiere una integración
// comercial para carga automática. Se abre la tienda con la lista visible.
const MANUAL_ONLY_STORES = new Set(['Tottus']);

interface CartLoaderButtonProps {
  basket: SupermarketPurchasePlanBasket;
}

export function CartLoaderButton({ basket }: CartLoaderButtonProps) {
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [directResult, setDirectResult] = useState<{
    planned: number;
    missing: string[];
    cartUrl: string;
    opened: boolean;
    confidence?: 'verified' | 'attempt';
  } | null>(null);
  const [directUnavailable, setDirectUnavailable] = useState<string | null>(null);

  const storeUrl = STORE_HOME[basket.store];
  const stepByStep = STEP_BY_STEP_STORES.has(basket.store);
  const wholesaleQuote = basket.store === 'Irurzun';

  if (!storeUrl) return null;

  /**
   * Crea un enlace de alta que la tienda ejecuta dentro de la sesión del
   * comprador. Convive no puede leer un carro cross-origin, por lo que la UI
   * informa cuántos productos envió y pide revisar; nunca declara éxito por una
   * respuesta server-to-server.
   */
  async function loadDirectly() {
    // Reservar la pestaña durante el gesto del clic evita que el navegador la
    // bloquee cuando la respuesta del API llegue después.
    const checkoutTab = window.open('about:blank', '_blank');
    if (checkoutTab) checkoutTab.opener = null;

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

      const cartUrl = typeof data.cartUrl === 'string' ? data.cartUrl : '';
      if (!data.supported || !cartUrl) {
        if (checkoutTab && !checkoutTab.closed) checkoutTab.close();
        setDirectUnavailable(data.reason || null);
        return;
      }

      let opened = false;
      if (checkoutTab && !checkoutTab.closed) {
        checkoutTab.location.replace(cartUrl);
        opened = true;
      }

      setDirectResult({
        planned: typeof data.plannedCount === 'number' ? data.plannedCount : 0,
        missing: Array.isArray(data.missingItems) ? data.missingItems : [],
        cartUrl,
        opened,
        confidence: data.confidence,
      });
    } catch (err) {
      if (checkoutTab && !checkoutTab.closed) checkoutTab.close();
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
            {directResult.opened
              ? `Se abrió el cargador de ${basket.store}`
              : `El cargador de ${basket.store} está listo`}
          </p>
          <p className="mt-1 text-xs leading-5 cc-text-secondary">
            Enviamos {directResult.planned} producto(s) al checkout de la tienda para
            agregarlos dentro de esa pestaña y de tu sesión. Revisa que aparezcan en
            el carro antes de elegir la entrega y pagar. Si la tienda rechazó stock,
            pidió verificación o el carro llegó vacío, usa el cargador asistido.
          </p>
        </div>

        {directResult.missing.length > 0 && (
          <div className="rounded-lg border px-3 py-2" style={{ borderColor: 'var(--cc-line)' }}>
            <p className="text-[11px] font-semibold cc-text-primary">
              {directResult.missing.length} producto(s) no se incluyeron en el enlace
            </p>
            <p className="mt-1 text-[11px] leading-4 cc-text-tertiary">
              {directResult.missing.slice(0, 5).join(', ')}
              {directResult.missing.length > 5 ? `, y ${directResult.missing.length - 5} más` : ''}.
              Agrégalos en la tienda o usa el cargador asistido.
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <a
            href={directResult.cartUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold underline cc-text-primary"
          >
            {directResult.opened ? 'Volver a abrir el carro' : 'Abrir el carro'}{' '}
            <ExternalLink className="h-3 w-3" />
          </a>
          <Link
            href="/resident/supermercado/cargador"
            className="inline-flex items-center gap-1 text-xs font-semibold underline cc-text-primary"
          >
            Usar el cargador asistido <ExternalLink className="h-3 w-3" />
          </Link>
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
  const manualOnly = MANUAL_ONLY_STORES.has(basket.store);

  return (
    <div className="space-y-2">
      <Button
        type="button"
        disabled={loading}
        onClick={() => {
          if (manualOnly) { window.open(storeUrl, '_blank', 'noopener'); return; }
          void (canLoadDirectly ? loadDirectly() : prepare());
        }}
        className="h-12 w-full text-sm text-white"
        style={{ background: 'var(--cc-ink)' }}
      >
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShoppingCart className="mr-2 h-4 w-4" />}
        {manualOnly ? `Abrir ${basket.store}` : wholesaleQuote ? `Preparar cotización en ${basket.store}` : `Cargar carro en ${basket.store}`}
      </Button>

      {error && <p className="text-[11px] text-danger-fg">{error}</p>}
      {directUnavailable && <p className="text-[11px] cc-text-tertiary">{directUnavailable}</p>}

      {manualOnly ? (
        <p className="text-[11px] cc-text-tertiary">
          {basket.store} todavía no permite cargar el carro automáticamente (requiere una integración con la cadena). Se abre la tienda; agrega los productos de tu lista, que ves aquí abajo.
        </p>
      ) : canLoadDirectly && VERIFIED_DIRECT_STORES.has(basket.store) ? (
        <p className="text-[11px] cc-text-tertiary">
          Se abre el checkout de {basket.store} y la tienda carga los productos dentro
          de esa sesión. Revisa el carro antes de continuar; el cargador asistido queda
          disponible si un producto fue rechazado.
        </p>
      ) : canLoadDirectly ? (
        <p className="text-[11px] cc-text-tertiary">
          Intentamos cargar el carro directo en {basket.store} sin instalar nada. Su sitio a veces
          pide verificación; si te bloquea, tienes el cargador asistido.
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
