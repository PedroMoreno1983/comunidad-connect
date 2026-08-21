'use client';

import React, { useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  Share2,
  ShoppingCart,
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

const VTEX_STORES = new Set(['Jumbo', 'Santa Isabel', 'Unimarc']);

interface CartLoaderButtonProps {
  basket: SupermarketPurchasePlanBasket;
}

export function CartLoaderButton({ basket }: CartLoaderButtonProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);

  // El hook hace el handshake de version/capacidades con la extension y filtra
  // el progreso por tienda. El componente lo reimplementaba con un postMessage
  // crudo que daba por buena cualquier version instalada.
  const cartLoader = useSupermarketCartLoader(basket);
  const extensionProgress = cartLoader.progress;

  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

  const [directResult, setDirectResult] = useState<{
    cartUrl: string;
    mode: string;
    loaded: number;
    missing: string[];
    confidence?: 'verified' | 'attempt';
    cartTotal?: number;
    items?: Array<{ name: string; quantity: number; productUrl?: string; searchUrl?: string }>;
  } | null>(null);

  const isVtex = VTEX_STORES.has(basket.store);
  const storeUrl = STORE_HOME[basket.store] || 'https://www.google.com';

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

  const handleLoadCart = async () => {
    setLoading(true);
    setError(null);
    setOpened(true);

    try {
      if (isVtex) {
        // 1. Carga nativa directa de VTEX (Santa Isabel, Jumbo, Unimarc)
        const response = await fetch('/api/supermarket/cart-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            store: basket.store,
            items: basket.items.map((item) => ({
              id: item.id,
              name: item.name,
              productUrl: item.productUrl,
              quantity: Math.max(1, Math.round(item.quantity)),
            })),
          }),
        });

        const data = await response.json().catch(() => ({}));
        const cartUrl = data.cartUrl || storeUrl;

        setDirectResult({
          cartUrl,
          mode: data.mode || 'direct-link',
          loaded: data.loadedCount || basket.items.length,
          missing: data.missingItems || [],
          confidence: data.confidence,
          cartTotal: typeof data.cartTotal === 'number' ? data.cartTotal : undefined,
          items: data.items || basket.items,
        });

        window.open(cartUrl, '_blank', 'noopener');
        const missingCount = (data.missingItems || []).length;
        toast({
          title: `Carro preparado en ${basket.store}`,
          description: missingCount > 0
            ? `Se abrió la tienda oficial. ${missingCount} producto(s) no pudieron cargarse: revísalos antes de pagar.`
            : 'Se abrió la tienda oficial. Revisa el carro antes de pagar.',
          variant: missingCount > 0 ? 'default' : 'success',
        });
      } else if (cartLoader.availability === 'ready' && cartLoader.start()) {
        // 2. Carga automatizada en 1 sola pestaña vía extensión de navegador (Líder, Tottus, aCuenta)
        toast({
          title: `Preparando carro en ${basket.store}`,
          description: 'Cargando productos en tu sesión. Revisa el carro antes de pagar.',
          variant: 'success',
        });
      } else {
        // 3. Fallback directo sin extensión: abre la tienda y las fichas
        basket.items.forEach((item) => {
          if (item.productUrl) {
            window.open(item.productUrl, '_blank', 'noopener');
          }
        });
        toast({
          title: `Abriendo ${basket.store}`,
          description: 'Se prepararon las pestañas de tus productos en la tienda.',
          variant: 'success',
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo preparar el carro.');
      window.open(storeUrl, '_blank', 'noopener');
    } finally {
      setLoading(false);
    }
  };

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

  return (
    <div className="space-y-3">
      {/* Botón Principal Homologado */}
      <Button
        type="button"
        disabled={loading}
        onClick={handleLoadCart}
        className="h-12 w-full text-sm font-semibold text-white shadow-md hover:brightness-110 transition-all flex items-center justify-center gap-2 rounded-xl cursor-pointer"
        style={{ background: 'var(--cc-ink, #1F2937)' }}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-white" />
        ) : (
          <ShoppingCart className="h-4 w-4 text-[var(--cc-copper,#E07A5F)]" />
        )}
        <span>Cargar Carro en {basket.store}</span>
      </Button>

      {/* Botones de acción rápida: Copiar lista y WhatsApp */}
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

      {/* Una extension instalada que ya no cumple el contrato debe pedir
          actualizacion en vez de intentar una carga que fallara a medias. */}
      {!isVtex && cartLoader.availability === 'outdated' && (
        <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Tu cargador de Convive
            {cartLoader.installedVersion ? ` (${cartLoader.installedVersion})` : ''} está
            desactualizado y no puede cargar el carro.{' '}
            <a href="/resident/supermercado/cargador" className="font-bold underline">
              Actualizar cargador
            </a>
          </span>
        </div>
      )}

      {error && (
        <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Panel de Estado / Checklist de productos */}
      {opened && (
        <div
          className="space-y-3 rounded-xl border p-4 animate-in fade-in duration-200"
          style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper-warm)' }}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-bold cc-text-primary flex items-center gap-1.5">
                {directResult && directResult.missing.length > 0 ? (
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                )}
                {basket.store} preparado
              </p>
              {extensionProgress?.detail && (
                <p className="mt-1 text-[11px] text-emerald-800 font-medium bg-emerald-50 p-2 rounded border border-emerald-200">
                  {extensionProgress.detail}
                </p>
              )}
              <p className="mt-0.5 text-[11px] cc-text-secondary leading-4">
                {isVtex
                  ? 'Revisa el carro en la pestaña del supermercado, confirma tu dirección y paga.'
                  : `Se abrió ${basket.store}. Puedes revisar el carro oficial o abrir cualquier producto puntual:`}
              </p>
            </div>
          </div>

          {/* La API ya informa qué productos no entraron al carro; ocultarlos
              hacía que el comprador pagara una lista incompleta sin saberlo. */}
          {directResult && directResult.missing.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-[11px] text-amber-900">
              <p className="flex items-start gap-1.5 font-semibold">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-px" />
                <span>
                  {directResult.missing.length} producto(s) no entraron al carro de {basket.store}
                </span>
              </p>
              <ul className="mt-1 list-disc pl-6 leading-4">
                {directResult.missing.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
              <p className="mt-1.5 leading-4">
                Agrégalos a mano en la tienda o revisa si están agotados antes de pagar.
              </p>
            </div>
          )}

          {/* Checklist de productos interactivo */}
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
              href={directResult?.cartUrl || storeUrl}
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
