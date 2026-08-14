'use client';

import { useState } from 'react';
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, PauseCircle, ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { useSupermarketCartLoader } from '@/hooks/useSupermarketCartLoader';
import { Capacitor } from '@capacitor/core';
import { storeLoadability, type DirectCartConfidence } from '@/lib/supermarket/cartUrl';
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

/*
 * Qué puede hacer cada tienda lo decide storeLoadability() y nadie más. Antes
 * este componente tenía sus propias listas y se desincronizaron: seguía
 * mandando a Lider por la carga directa después de que cartUrl.ts dejara de
 * emitirle enlace, y llamaba "verificadas" a Santa Isabel y Unimarc, que
 * cargan fuera del sitio de la tienda. Dos fuentes de verdad para el mismo
 * dato terminan siempre así.
 */
function canLoadCart(store: string): boolean {
    // Los endpoints externos /checkout/cart/add dejaron de ser una interfaz
    // estable de los retailers (Jumbo hoy responde con pagina perdida). El
    // unico flujo verificable dentro del carro real es el cargador: si no
    // responde, llevamos a activarlo y nunca abrimos un enlace antiguo.
    void store;
    return false;
}

const UNIMARC_LANDING_DELAY_MS = 1_800;

/**
 * Abre la tienda en el navegador del sistema.
 *
 * En el teléfono usa @capacitor/browser, que levanta Chrome Custom Tabs en
 * Android y SFSafariViewController en iOS. Lo importante no es que se vea
 * dentro de la app: es que ESOS DOS COMPARTEN LAS COOKIES del navegador del
 * sistema, así que la sesión que la persona ya tiene en Jumbo sigue viva y
 * llega directo al botón de pagar. Un WebView embebido tiene su propio
 * almacén de cookies y la obligaría a iniciar sesión de nuevo dentro de la
 * app, que es justo donde se abandona una compra.
 *
 * El fallback a window.open NO es defensivo por gusto. capacitor.config.ts
 * apunta server.url a conviveconnect.com, o sea que la app instalada carga
 * este JS desde Vercel mientras el plugin nativo solo existe tras un `cap
 * sync` y una nueva versión en las tiendas. Sin este catch, el primer deploy
 * rompería el botón de pagar en todos los teléfonos ya instalados hasta que
 * cada persona actualice.
 */
async function openInSystemBrowser(url: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
        try {
            const { Browser } = await import('@capacitor/browser');
            await Browser.open({ url, presentationStyle: 'popover' });
            return;
        } catch {
            // Binario sin el plugin todavía: seguimos por el navegador externo.
        }
    }
    window.open(url, '_blank', 'noopener');
}

/**
 * Solo tomamos el camino nativo cuando la apertura es un salto limpio: una
 * URL, una navegación. Las tiendas 'offsite' necesitan una segunda navegación
 * sobre la MISMA pestaña (ver navigatePreparedCart) y para eso hace falta un
 * handle de Window que el navegador del sistema no entrega. Ahí se mantiene el
 * comportamiento actual, que ya funciona, en vez de inventar un flujo nativo
 * de dos pasos que no puedo probar en un dispositivo.
 */
function usesSystemBrowser(store: string): boolean {
    return Capacitor.isNativePlatform() && storeLoadability(store) !== 'offsite';
}

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
  onSelect?: () => void;
}

export function CartLoaderButton({ basket, onQuote, onSelect }: CartLoaderButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replaceConfirmationOpen, setReplaceConfirmationOpen] = useState(false);
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
  const cartLoader = useSupermarketCartLoader(basket);

  const storeUrl = STORE_HOME[basket.store];
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
        opened: checkoutTab !== null || usesSystemBrowser(basket.store),
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
      else if (usesSystemBrowser(basket.store)) await openInSystemBrowser(cartUrl);
    } catch (err) {
      checkoutTab?.close();
      setError(err instanceof Error ? err.message : 'No se pudo preparar el carro.');
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
            Activar el cargador automático <ExternalLink className="h-3 w-3" />
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

  const canLoadDirectly = canLoadCart(basket.store) && !directUnavailable;
  const manualOnly = !canLoadCart(basket.store);
  const loaderProgress = cartLoader.progress;
  const loaderBusy = loaderProgress !== null
    && ['opening', 'loading', 'paused'].includes(loaderProgress.status);
  const loaderFinished = loaderProgress !== null
    && ['completed', 'completed_with_issues'].includes(loaderProgress.status);

  return (
    <div className="space-y-2">
      <Button
        type="button"
        disabled={loading || cartLoader.availability === 'checking' || loaderBusy}
        onClick={() => {
          onSelect?.();
          if (cartLoader.availability === 'ready') {
            setReplaceConfirmationOpen(true);
            return;
          }
          if (cartLoader.availability === 'outdated') {
            window.location.assign('/resident/supermercado/cargador');
            return;
          }
          if (manualOnly) {
            window.location.assign('/resident/supermercado/cargador');
            return;
          }
          if (canLoadDirectly) {
            // En el navegador del sistema no hay pestaña que preparar: el
            // enlace se abre recién cuando la tienda confirmó los productos.
            if (usesSystemBrowser(basket.store)) { void loadDirectly(null); return; }
            const checkoutTab = openLoadingTab();
            if (checkoutTab) void loadDirectly(checkoutTab);
            return;
          }
          window.location.assign('/resident/supermercado/cargador');
        }}
        className="h-12 w-full text-sm text-white"
        style={{ background: 'var(--cc-ink)' }}
      >
        {loading || cartLoader.availability === 'checking' || loaderBusy
          ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          : <ShoppingCart className="mr-2 h-4 w-4" />}
        {cartLoader.availability === 'checking'
          ? 'Conectando el cargador…'
          : loaderBusy && loaderProgress
            ? `Cargando ${loaderProgress.added + loaderProgress.failed} de ${loaderProgress.total}`
            : cartLoader.availability === 'ready'
              ? `Cargar lista nueva en ${basket.store}`
              : cartLoader.availability === 'outdated'
                ? 'Actualizar cargador de Convive'
                : manualOnly
                ? `Activar cargador para ${basket.store}`
                : wholesaleQuote
                  ? `Preparar cotización en ${basket.store}`
                  : storeLoadability(basket.store) === 'direct'
                    ? `Cargar carro en ${basket.store}`
                    : `Preparar carro en ${basket.store}`}
      </Button>

      {replaceConfirmationOpen && !loaderBusy && (
        <div
          role="alertdialog"
          aria-labelledby={`replace-cart-${basket.store}`}
          className="space-y-3 rounded-xl border px-4 py-3"
          style={{ borderColor: 'var(--cc-amber)', background: 'var(--cc-paper-warm)' }}
        >
          <div>
            <p id={`replace-cart-${basket.store}`} className="text-xs font-bold cc-text-primary">
              Esta carga reemplazará el carro actual de {basket.store}
            </p>
            <p className="mt-1 text-[11px] leading-4 cc-text-secondary">
              Convive vaciará los productos anteriores antes de agregar esta lista. Así el carro y el total
              corresponden solamente a esta compra.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => {
                setReplaceConfirmationOpen(false);
                cartLoader.start({ replaceCart: true });
              }}
              className="h-9 text-xs text-white"
              style={{ background: 'var(--cc-ink)' }}
            >
              Vaciar carro anterior y cargar
            </Button>
            <button
              type="button"
              onClick={() => setReplaceConfirmationOpen(false)}
              className="px-2 text-xs font-semibold underline cc-text-secondary"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {loaderProgress && (
        <div
          role="status"
          className="space-y-2 rounded-lg border px-3 py-3"
          style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper-warm)' }}
        >
          <div className="flex items-center gap-2 text-xs font-semibold cc-text-primary">
            {loaderProgress.status === 'paused' ? (
              <PauseCircle className="h-4 w-4 text-warning-fg" />
            ) : loaderProgress.status === 'failed' ? (
              <AlertCircle className="h-4 w-4 text-danger-fg" />
            ) : loaderFinished ? (
              <CheckCircle2 className="h-4 w-4 text-success-fg" />
            ) : (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            <span>
              {loaderFinished
                ? `Carro de ${basket.store} listo`
                : `${loaderProgress.added + loaderProgress.failed} de ${loaderProgress.total} procesados`}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--cc-line)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${loaderProgress.total > 0
                  ? Math.round(((loaderProgress.added + loaderProgress.failed) / loaderProgress.total) * 100)
                  : 0}%`,
                background: 'var(--cc-ink)',
              }}
            />
          </div>
          <p className="text-[11px] leading-4 cc-text-secondary">{loaderProgress.detail}</p>
        </div>
      )}

      {basket.store === 'Unimarc' && <UnimarcLoginNotice />}

      {error && <p className="text-[11px] text-danger-fg">{error}</p>}
      {directUnavailable && <p className="text-[11px] cc-text-tertiary">{directUnavailable}</p>}

      {cartLoader.availability === 'ready' ? (
        <p className="text-[11px] cc-text-tertiary">
          Convive vaciará el carro anterior y luego agregará y verificará los productos en tu sesión de {basket.store}.
          Al terminar abrirá el carro oficial; tú revisas y pagas.
        </p>
      ) : cartLoader.availability === 'outdated' ? (
        <p role="alert" className="text-[11px] leading-4 text-warning-fg">
          El cargador instalado{cartLoader.installedVersion ? ` (v${cartLoader.installedVersion})` : ''} es anterior
          y no puede informar con precisión qué había en el carro ni abrirlo automáticamente.{' '}
          <Link href="/resident/supermercado/cargador" className="inline-flex items-center gap-1 font-semibold underline">
            Actualizarlo ahora <ExternalLink className="h-3 w-3" />
          </Link>
        </p>
      ) : manualOnly ? (
        <p className="text-[11px] cc-text-tertiary">
          Para cargar automáticamente en {basket.store}, activa una vez el cargador de Convive.{' '}
          <Link href="/resident/supermercado/cargador" className="inline-flex items-center gap-1 underline">
            Activarlo ahora <ExternalLink className="h-3 w-3" />
          </Link>
        </p>
      ) : canLoadDirectly && storeLoadability(basket.store) === 'direct' ? (
        <p className="text-[11px] cc-text-tertiary">
          Un clic confirma productos y precio, y abre el carro oficial de {basket.store}.
          Revisa el detalle antes de elegir entrega y pagar.
        </p>
      ) : canLoadDirectly ? (
        <p className="text-[11px] cc-text-tertiary">
          La tienda carga los productos en su checkout oficial. Revisa el detalle antes de pagar.
        </p>
      ) : (
        <p className="text-[11px] cc-text-tertiary">
          Activa el cargador de Convive para completar el carro sin copiar códigos ni reconstruir la compra.
        </p>
      )}
    </div>
  );
}
