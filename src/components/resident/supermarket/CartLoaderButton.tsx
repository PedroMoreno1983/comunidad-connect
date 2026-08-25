'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  Puzzle,
  Share2,
  ShoppingCart,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useSupermarketCartLoader } from '@/hooks/useSupermarketCartLoader';
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

const INSTALL_GUIDE_URL = '/resident/supermercado/cargador';

interface CartLoaderButtonProps {
  basket: SupermarketPurchasePlanBasket;
  /**
   * Flujo principal: elegir la tienda ya es la orden de carga. La página
   * incrementa esta llave con cada selección explícita y aquí se gatilla la
   * carga automática (con extensión) o la guía de instalación (sin ella).
   */
  autoLoadKey?: number;
}

/**
 * Carga del carro — extension-first.
 *
 * Las cadenas cerraron todos los caminos server-side (VTEX eliminó el carro
 * anónimo por URL — Jumbo redirige a login, Santa Isabel/Unimarc devuelven
 * 404 — y Walmart protege Lider/aCuenta con Queue-it). La unica via que
 * funciona en TODAS las tiendas es la extension CoCo, que opera dentro del
 * navegador del usuario con su propia sesion.
 *
 * Reglas de honestidad:
 *  - Sin extension: jamas se muestra "carro cargado". Se ofrece instalar el
 *    cargador y, como alternativas manuales, copiar la lista o abrir fichas.
 *  - Jumbo: si la canasta trae SKUs, se ofrece ademas el enlace directo de
 *    VTEX, que funciona cuando el usuario ya inicio sesion en jumbo.cl.
 *  - El handshake de version/capacidades vive en `useSupermarketCartLoader`:
 *    una extension instalada que ya no cumple el contrato pide actualizacion
 *    en vez de intentar una carga que fallara a medias.
 */
export function CartLoaderButton({ basket, autoLoadKey = 0 }: CartLoaderButtonProps) {
  const { toast } = useToast();
  const cartLoader = useSupermarketCartLoader(basket);
  const [copied, setCopied] = useState(false);
  const [opened, setOpened] = useState(false);
  const [loadStarted, setLoadStarted] = useState(false);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

  const storeUrl = STORE_HOME[basket.store] || 'https://www.google.com';
  const extensionProgress = cartLoader.progress;
  const hasReadyLoader = cartLoader.availability === 'ready';
  const loaderOutdated = cartLoader.availability === 'outdated';

  /** Enlace directo VTEX (solo Jumbo, solo con sesion iniciada en jumbo.cl). */
  const jumboDirectUrl = useMemo(() => {
    if (basket.store !== 'Jumbo') return null;
    const withSku = basket.items.filter(item => item.sku);
    if (withSku.length === 0) return null;
    const params = withSku.flatMap(item => [
      `sku=${encodeURIComponent(item.sku!)}`,
      `qty=${Math.max(1, Math.round(item.quantity))}`,
      'seller=1',
    ]);
    return `https://www.jumbo.cl/checkout/cart/add?${params.join('&')}&redirect=true&sc=1`;
  }, [basket]);

  const formatListText = () => {
    const header = `🛒 *Lista de Compras · ${basket.store}*\n`;
    const lines = basket.items.map(
      (item, idx) => `${idx + 1}. *${item.quantity}x* ${item.name} (${money(item.lineTotal)})`
    );
    const footer = `\n💰 *Total estimado:* ${money(basket.subtotal)}\nGenerado por CoCo en ComunidadConnect`;
    return header + lines.join('\n') + footer;
  };

  function money(value: number) {
    return `$${Math.round(value).toLocaleString('es-CL')}`;
  }

  const handleCopyList = async () => {
    try {
      await navigator.clipboard.writeText(formatListText());
      setCopied(true);
      toast({
        title: 'Lista copiada al portapapeles',
        description: 'Pégala en WhatsApp, notas o en el buscador del supermercado.',
        variant: 'success',
      });
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast({
        title: 'No se pudo copiar',
        description: 'Selecciona y copia el texto manualmente.',
        variant: 'destructive',
      });
    }
  };

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(formatListText());
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank', 'noopener');
  };

  const handleLoadCart = () => {
    setOpened(true);

    if (loaderOutdated) {
      toast({
        title: 'Tu cargador de Convive está desactualizado',
        description: 'Actualízalo para cargar el carro. Mientras tanto puedes copiar la lista o abrir las fichas.',
      });
      return;
    }

    if (!hasReadyLoader) {
      toast({
        title: 'Falta el Cargador de Convive',
        description: 'Instálalo una vez y después cargas cualquier carro con un solo click.',
      });
      return;
    }

    if (!cartLoader.start()) return;
    setLoadStarted(true);
    toast({
      title: `Cargando tu carro en ${basket.store}`,
      description: 'CoCo agrega y verifica cada producto en una pestaña del supermercado. Luego revisas, aceptas y pagas ahí. Revisa el carro antes de pagar.',
      variant: 'success',
    });
  };

  // Elegir la tienda gatilla la carga sin pasar por este botón. La llave 0 es
  // el estado inicial (selección por defecto tras comparar): ahí no se carga
  // nada hasta que la persona elija explícitamente. Si el handshake todavía
  // no terminó, se espera a `ready`/`outdated`/`unavailable`.
  const lastAutoLoadKey = React.useRef(0);
  useEffect(() => {
    if (autoLoadKey <= 0 || autoLoadKey === lastAutoLoadKey.current) return;
    if (cartLoader.availability === 'checking') return;
    lastAutoLoadKey.current = autoLoadKey;
    handleLoadCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoadKey, cartLoader.availability]);

  const handleOpenAllProducts = () => {
    let openedCount = 0;
    basket.items.forEach((item) => {
      const url = item.productUrl || (item.name ? `${storeUrl}/search?q=${encodeURIComponent(item.name)}` : '');
      if (url) {
        window.open(url, '_blank', 'noopener');
        openedCount += 1;
      }
    });
    toast({
      title: 'Productos abiertos',
      description: `Se abrieron las pestañas de ${openedCount} productos en ${basket.store}.`,
      variant: 'success',
    });
  };

  const toggleCheck = (id: string) => {
    setCheckedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const missingCount = extensionProgress?.failed ?? 0;
  const progressFailed = extensionProgress?.status === 'failed';
  const progressDone = Boolean(
    extensionProgress
    && typeof extensionProgress.total === 'number'
    && extensionProgress.total > 0
    && (extensionProgress.added ?? 0) + missingCount >= extensionProgress.total,
  );

  return (
    <div className="space-y-3">
      <Button
        type="button"
        onClick={handleLoadCart}
        className="h-12 w-full text-sm font-semibold text-white shadow-md hover:brightness-110 transition-all flex items-center justify-center gap-2 rounded-xl cursor-pointer"
        style={{ background: 'var(--cc-ink, #1F2937)' }}
      >
        <ShoppingCart className="h-4 w-4 text-[var(--cc-copper,#E07A5F)]" />
        <span>{loadStarted ? `Recargar Carro en ${basket.store}` : `Cargar Carro en ${basket.store}`}</span>
      </Button>
      {hasReadyLoader && (
        <p className="text-[11px] cc-text-secondary text-center leading-4">
          Se carga automáticamente al elegir la tienda. Al terminar, revisa el carro en
          la pestaña de {basket.store}, acepta y paga — ese paso es siempre tuyo.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={handleCopyList}
          className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-xs font-medium cc-text-primary hover:bg-subtle/50 transition-colors cursor-pointer"
          style={{ borderColor: 'var(--cc-line)' }}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
          <span>{copied ? 'Copiada' : 'Copiar Lista'}</span>
        </button>

        <button
          type="button"
          onClick={handleShareWhatsApp}
          className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors cursor-pointer shadow-xs"
        >
          <Share2 className="h-3.5 w-3.5" />
          <span>Compartir WhatsApp</span>
        </button>
      </div>

      {loaderOutdated && (
        <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Tu cargador de Convive
            {cartLoader.installedVersion ? ` (${cartLoader.installedVersion})` : ''} está
            desactualizado y no puede cargar el carro.{' '}
            <a href={INSTALL_GUIDE_URL} className="font-bold underline">
              Actualizar cargador
            </a>
          </span>
        </div>
      )}

      {opened && (
        <div
          className="space-y-3 rounded-xl border p-4 animate-in fade-in duration-200"
          style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper-warm)' }}
        >
          {hasReadyLoader ? (
            <div>
              <p className="text-xs font-bold cc-text-primary flex items-center gap-1.5">
                {progressFailed ? (
                  <AlertCircle className="h-4 w-4 text-rose-600" />
                ) : progressDone && missingCount > 0 ? (
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                ) : progressDone ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin text-[var(--cc-copper)]" />
                )}
                {progressFailed
                  ? `La carga en ${basket.store} se detuvo`
                  : progressDone && missingCount > 0
                    ? `${basket.store}: carga terminada con ${missingCount} producto(s) que no entraron`
                    : progressDone
                      ? `${basket.store}: carga terminada`
                      : loadStarted
                        ? `CoCo está cargando tu carro en ${basket.store}`
                        : `Cargador listo para ${basket.store}`}
              </p>
              {extensionProgress?.detail && (
                <p className={`mt-1 text-[11px] font-medium p-2 rounded border ${
                  progressFailed
                    ? 'text-rose-800 bg-rose-50 border-rose-200'
                    : missingCount > 0
                      ? 'text-amber-900 bg-amber-50 border-amber-200'
                      : 'text-emerald-800 bg-emerald-50 border-emerald-200'
                }`}>
                  {extensionProgress.detail}
                </p>
              )}
              {progressDone && missingCount > 0 && (
                <p className="mt-1 text-[11px] text-amber-900 leading-4">
                  {missingCount} producto(s) no entraron al carro de {basket.store}. Agrégalos a
                  mano en la tienda o revisa si están agotados antes de pagar.
                </p>
              )}
              <p className="mt-0.5 text-[11px] cc-text-secondary leading-4">
                Revisa la pestaña del supermercado: ahí verás el progreso producto a producto.
                CoCo nunca confirma ni paga la compra; ese paso es siempre tuyo. Revisa el carro
                antes de pagar.
              </p>
              {cartLoader.installedVersion && (
                <p className="mt-1 text-[10px] cc-text-tertiary">Cargador v{cartLoader.installedVersion}</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start gap-2.5">
                <Puzzle className="h-4 w-4 shrink-0 mt-0.5 text-[var(--cc-copper)]" />
                <div>
                  <p className="text-xs font-bold cc-text-primary">
                    {loaderOutdated
                      ? 'Actualiza el Cargador de Convive para cargar el carro'
                      : 'Para cargar el carro con un click necesitas el Cargador de Convive'}
                  </p>
                  <p className="mt-0.5 text-[11px] cc-text-secondary leading-4">
                    Es una extensión de Chrome/Edge que se activa una sola vez y funciona con
                    Lider, Jumbo, Santa Isabel, Unimarc, Tottus, aCuenta e Irurzun. Las tiendas
                    no permiten cargar carros desde fuera del navegador; el cargador lo hace
                    dentro de tu sesión, producto por producto y con verificación.
                  </p>
                </div>
              </div>
              <a
                href={INSTALL_GUIDE_URL}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-lg text-xs font-bold text-white hover:brightness-110 transition-all"
                style={{ background: 'var(--cc-copper, #E07A5F)' }}
              >
                <Puzzle className="h-4 w-4" />
                {loaderOutdated ? 'Actualizar cargador' : 'Instalar el Cargador de Convive (2 min)'}
              </a>

              {jumboDirectUrl && (
                <a
                  href={jumboDirectUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border text-[11px] font-semibold cc-text-primary hover:bg-subtle/50 transition-colors"
                  style={{ borderColor: 'var(--cc-line)' }}
                >
                  <Zap className="h-3.5 w-3.5 text-[var(--cc-amber)]" />
                  Probar carga directa en Jumbo (requiere sesión iniciada en jumbo.cl)
                </a>
              )}
            </div>
          )}

          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {basket.items.map((item) => {
              const isChecked = checkedItems[item.id];
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-surface border border-subtle text-xs gap-2"
                >
                  <label className="flex items-center gap-2 min-w-0 cursor-pointer flex-1">
                    <input
                      type="checkbox"
                      checked={isChecked || false}
                      onChange={() => toggleCheck(item.id)}
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <span
                      className={`truncate font-medium ${
                        isChecked ? 'line-through text-zinc-400' : 'cc-text-primary'
                      }`}
                    >
                      {item.quantity}x {item.name}
                    </span>
                  </label>

                  {item.productUrl && (
                    <a
                      href={item.productUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 p-1 text-[var(--cc-copper)] hover:bg-subtle/50 rounded flex items-center gap-1 text-[11px] font-semibold"
                      title="Ver producto en la tienda"
                    >
                      <span>Abrir</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex gap-2 pt-1 border-t border-subtle">
            <button
              type="button"
              onClick={handleOpenAllProducts}
              className="flex-1 py-1.5 px-2 rounded-lg border border-subtle bg-surface text-[11px] font-semibold cc-text-primary hover:bg-subtle/40 text-center"
            >
              Abrir fichas en pestañas
            </button>
            <a
              href={storeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 py-1.5 px-2 rounded-lg bg-zinc-900 text-white text-[11px] font-semibold text-center hover:bg-zinc-800"
            >
              Ir a {basket.store}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
