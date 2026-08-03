'use client';

import { useState } from 'react';
import { Check, Copy, ExternalLink, Loader2, ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import type { DirectCartConfidence } from '@/lib/supermarket/cartUrl';
import type {
  SupermarketCheckoutQuote,
  SupermarketCheckoutQuoteItem,
  SupermarketPurchasePlanBasket,
} from '@/lib/types';

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
const UNIMARC_LANDING_DELAY_MS = 1_800;

function currentRetailerCartUrl(cartUrl: string, store: string): string {
  try {
    const origin = new URL(cartUrl).origin;
    return store === 'Unimarc'
      ? `${origin}/?ReturnUrl=%2Fcart`
      : `${origin}/checkout/#/cart`;
  } catch {
    return cartUrl;
  }
}

function UnimarcLoginNotice() {
  return (
    <div
      role="note"
      data-testid="unimarc-login-warning"
      className="rounded-lg border px-3 py-2"
      style={{ borderColor: 'var(--cc-amber)', background: 'var(--cc-paper)' }}
    >
      <p className="text-[11px] font-semibold cc-text-primary">Cómo iniciar sesión en Unimarc</p>
      <p className="mt-1 text-[11px] leading-4 cc-text-secondary">
        El acceso con Google no está configurado por Unimarc. Usa Email o RUT con tu clave,
        o el botón &quot;Recibir la clave de acceso rápido&quot;. Convive no administra ese acceso.
      </p>
    </div>
  );
}

interface CartLoaderButtonProps {
  basket: SupermarketPurchasePlanBasket;
  onQuote?: (quote: SupermarketCheckoutQuote) => void;
}

export function CartLoaderButton({ basket, onQuote }: CartLoaderButtonProps) {
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [directResult, setDirectResult] = useState<{
    planned: number;
    missing: string[];
    cartUrl: string;
    opened: boolean;
    confidence?: DirectCartConfidence;
    quotedTotal: number;
    catalogTotal: number;
    quotedAt: string;
    quotedItems: SupermarketCheckoutQuoteItem[];
    missingTerms: string[];
    quoteSource?: 'retailer_checkout';
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
  function openLoadingTab(): Window | null {
    const checkoutTab = window.open('about:blank', '_blank');
    if (!checkoutTab) {
      setError('El navegador bloqueo la pestana del supermercado. Habilita ventanas emergentes y vuelve a intentarlo.');
      return null;
    }

    try {
      checkoutTab.document.title = `Preparando carro en ${basket.store}`;
      checkoutTab.document.body.innerHTML = '';
      const message = checkoutTab.document.createElement('p');
      message.textContent = `Convive esta confirmando los productos y el precio con ${basket.store}...`;
      message.style.cssText = 'font: 16px system-ui; margin: 48px; color: #2f2923';
      checkoutTab.document.body.appendChild(message);
    } catch {
      // about:blank puede estar restringido por una politica del navegador.
    }
    return checkoutTab;
  }

  function navigatePreparedCart(checkoutTab: Window, cartUrl: string) {
    checkoutTab.location.href = cartUrl;
    if (basket.store === 'Unimarc') {
      window.setTimeout(() => {
        if (!checkoutTab.closed) {
          try {
            // El endpoint ya agrego los SKU. Unimarc no implementa /checkout/#/cart,
            // asi que terminamos en su portada con el contador del carro visible.
            checkoutTab.location.href = currentRetailerCartUrl(cartUrl, 'Unimarc');
            checkoutTab.opener = null;
          } catch {
            setError('Unimarc cargo los productos, pero no permitio abrir su portada. Usa el enlace de revision.');
          }
        }
      }, UNIMARC_LANDING_DELAY_MS);
      return;
    }
    checkoutTab.opener = null;
  }

  async function loadDirectly(checkoutTab: Window | null) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/supermarket/cart-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store: basket.store,
          items: basket.items.map(item => ({
            id: item.id,
            requestedTerm: item.requestedTerm,
            name: item.name,
            productUrl: item.productUrl,
            quantity: Math.max(1, Math.round(item.quantity)),
            lineTotal: item.lineTotal,
          })),
        }),
      });
      const data = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'No se pudo preparar el carro.');
      }

      const cartUrl = typeof data.cartUrl === 'string' ? data.cartUrl : '';
      if (!data.supported || !cartUrl) {
        checkoutTab?.close();
        setDirectUnavailable(typeof data.reason === 'string' ? data.reason : null);
        return;
      }

      const quotedItems = Array.isArray(data.quotedItems)
        ? data.quotedItems.filter((item): item is SupermarketCheckoutQuoteItem => (
          item !== null && typeof item === 'object'
          && typeof (item as SupermarketCheckoutQuoteItem).sku === 'string'
          && typeof (item as SupermarketCheckoutQuoteItem).requestedTerm === 'string'
          && typeof (item as SupermarketCheckoutQuoteItem).lineTotal === 'number'
        ))
        : [];
      const missingTerms = Array.isArray(data.missingTerms)
        ? data.missingTerms.filter((term): term is string => typeof term === 'string')
        : [];
      const quotedTotal = typeof data.quotedTotal === 'number' ? data.quotedTotal : 0;
      const catalogTotal = typeof data.catalogTotal === 'number' ? data.catalogTotal : basket.subtotal;
      const quotedAt = typeof data.quotedAt === 'string' ? data.quotedAt : new Date().toISOString();
      const quoteSource = data.quoteSource === 'retailer_checkout' ? data.quoteSource : undefined;

      setDirectResult({
        planned: typeof data.plannedCount === 'number' ? data.plannedCount : 0,
        missing: Array.isArray(data.missingItems)
          ? data.missingItems.filter((item): item is string => typeof item === 'string')
          : [],
        cartUrl,
        opened: checkoutTab !== null,
        confidence: data.confidence === 'verified' || data.confidence === 'offsite'
          ? data.confidence
          : undefined,
        quotedTotal,
        catalogTotal,
        quotedAt,
        quotedItems,
        missingTerms,
        quoteSource,
      });
      if (quoteSource === 'retailer_checkout') {
        onQuote?.({
          store: basket.store,
          subtotal: quotedTotal,
          catalogSubtotal: catalogTotal,
          items: quotedItems,
          missingTerms,
          quotedAt,
        });
      }
      if (checkoutTab) navigatePreparedCart(checkoutTab, cartUrl);
    } catch (err) {
      checkoutTab?.close();
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

  function reopenPreparedCart(cartUrl: string) {
    const checkoutTab = openLoadingTab();
    if (!checkoutTab) return;
    navigatePreparedCart(checkoutTab, cartUrl);
    setDirectResult(current => current ? { ...current, opened: true } : current);
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
              ? basket.store === 'Unimarc'
                ? 'Se abrio Unimarc con los productos en tu sesion'
                : `Se abrio el carro de ${basket.store}`
              : directResult.quoteSource === 'retailer_checkout'
                ? `Precio y productos confirmados por ${basket.store}`
                : `El cargador de ${basket.store} esta listo`}
          </p>
          <p className="mt-1 text-xs leading-5 cc-text-secondary">
            {directResult.quoteSource === 'retailer_checkout' ? (
              <>
                La tienda confirmo {directResult.planned} producto(s) disponibles por{' '}
                <strong>${Math.round(directResult.quotedTotal).toLocaleString('es-CL')}</strong>.
                El carro oficial ya se abrio en otra pestana para que lo revises antes de pagar.
              </>
            ) : (
              <>
                Prepararemos {directResult.planned} producto(s) dentro de tu sesion en la tienda.
                Revisa que el carro, el stock y el total sean correctos antes de pagar.
              </>
            )}
          </p>
        </div>

        {directResult.quoteSource === 'retailer_checkout'
          && Math.round(directResult.catalogTotal) !== Math.round(directResult.quotedTotal) && (
          <div className="rounded-lg border px-3 py-2" style={{ borderColor: 'var(--cc-amber)' }}>
            <p className="text-[11px] font-semibold cc-text-primary">El precio cambio al confirmarlo</p>
            <p className="mt-1 text-[11px] leading-4 cc-text-secondary">
              El catalogo estimaba ${Math.round(directResult.catalogTotal).toLocaleString('es-CL')};
              el checkout confirmo ${Math.round(directResult.quotedTotal).toLocaleString('es-CL')}.
              Desde ahora mostramos y enviamos el valor del checkout.
            </p>
          </div>
        )}

        {directResult.quoteSource === 'retailer_checkout' && (
          <>
            <div className="max-h-40 space-y-1 overflow-auto rounded-lg border px-3 py-2" style={{ borderColor: 'var(--cc-line)' }}>
              {directResult.quotedItems.map(item => (
                <div key={`${item.requestedTerm}-${item.sku}`} className="flex justify-between gap-3 text-[11px]">
                  <span className="cc-text-secondary">{item.name}</span>
                  <span className="shrink-0 font-semibold cc-text-primary">
                    ${Math.round(item.lineTotal).toLocaleString('es-CL')}
                  </span>
                </div>
              ))}
            </div>

            <div className="rounded-lg border px-3 py-2" style={{ borderColor: 'var(--cc-line)' }}>
              <p className="text-[11px] leading-4 cc-text-secondary">
                La tienda conserva productos de carros anteriores. Si ya habias hecho una prueba,
                deja ese carro vacio para que el total coincida con esta cotizacion.
              </p>
              <a
                href={currentRetailerCartUrl(directResult.cartUrl, basket.store)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold underline cc-text-primary"
              >
                Revisar o vaciar mi carro anterior <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </>
        )}

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
          <button
            type="button"
            onClick={() => reopenPreparedCart(directResult.cartUrl)}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-white"
            style={{ background: 'var(--cc-ink)' }}
          >
            Volver a abrir el carro <ExternalLink className="h-3 w-3" />
          </button>
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
        {basket.store === 'Santa Isabel' && (
          <p className="text-[11px] leading-4 cc-text-tertiary">
            Santa Isabel cobra en su checkout oficial de VTEX. La compra es chilena y en pesos;
            esa plantilla externa puede mostrar un dominio tecnico .com.br o una frase del pie
            en portugues. Convive no controla esa plantilla de la tienda.
          </p>
        )}
        {basket.store === 'Unimarc' && (
          <>
            <UnimarcLoginNotice />
            <p className="text-[11px] leading-4 cc-text-tertiary">
              Unimarc carga los productos y luego muestra su portada porque su checkout antiguo no admite
              un enlace directo al carro. Después de iniciar sesión, pulsa el carro de la esquina
              superior derecha; los productos quedan asociados a esa sesión.
            </p>
          </>
        )}
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
          if (canLoadDirectly) {
            const checkoutTab = openLoadingTab();
            if (checkoutTab) void loadDirectly(checkoutTab);
            return;
          }
          void prepare();
        }}
        className="h-12 w-full text-sm text-white"
        style={{ background: 'var(--cc-ink)' }}
      >
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShoppingCart className="mr-2 h-4 w-4" />}
        {manualOnly
          ? `Abrir ${basket.store}`
          : wholesaleQuote
            ? `Preparar cotización en ${basket.store}`
            : VERIFIED_DIRECT_STORES.has(basket.store)
              ? `Cargar carro en ${basket.store}`
              : `Preparar carro en ${basket.store}`}
      </Button>

      {basket.store === 'Unimarc' && <UnimarcLoginNotice />}

      {error && <p className="text-[11px] text-danger-fg">{error}</p>}
      {directUnavailable && <p className="text-[11px] cc-text-tertiary">{directUnavailable}</p>}

      {manualOnly ? (
        <p className="text-[11px] cc-text-tertiary">
          {basket.store} todavía no permite cargar el carro automáticamente (requiere una integración con la cadena). Se abre la tienda; agrega los productos de tu lista, que ves aquí abajo.
        </p>
      ) : canLoadDirectly && VERIFIED_DIRECT_STORES.has(basket.store) ? (
        <p className="text-[11px] cc-text-tertiary">
          Un clic confirma productos y precio, y abre el carro oficial de {basket.store}.
          Revisa el detalle antes de elegir entrega y pagar.
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
