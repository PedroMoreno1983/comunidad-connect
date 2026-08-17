'use client';

import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Loader2,
  ShoppingCart,
  Sparkles,
  Share2,
  ListChecks,
  AlertCircle,
  CheckCircle2,
  Puzzle,
  Layers,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
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
  const [hasExtension, setHasExtension] = useState(false);
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

  // Detectar si la extensión de Chrome está activa
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== window || event.data?.source !== 'convive-cart-loader') return;
      if (event.data.type === 'CONVIVE_CART_LOADER_READY') {
        setHasExtension(true);
      }
    };
    window.addEventListener('message', handleMessage);
    window.postMessage({ source: 'convive-connect', type: 'CONVIVE_CART_LOADER_PING' }, '*');
    return () => window.removeEventListener('message', handleMessage);
  }, []);

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

  const handleOpenAllProducts = () => {
    setOpened(true);
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

  const handleLoadCart = async () => {
    setLoading(true);
    setError(null);
    setOpened(true);

    try {
      if (isVtex) {
        // Carga nativa de VTEX (Jumbo, Santa Isabel, Unimarc)
        const response = await fetch('/api/supermarket/cart-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            store: basket.store,
            items: basket.items.map((item) => ({
              id: item.id,
              name: item.name,
              sku: item.sku,
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
        toast({
          title: `Carro cargado en ${basket.store}`,
          description: 'Se abrió la tienda con todos tus productos en el carro.',
          variant: 'success',
        });
      } else {
        // Tiendas no-VTEX (Tottus, Líder, aCuenta)
        handleOpenAllProducts();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo preparar el carro.');
      window.open(storeUrl, '_blank', 'noopener');
    } finally {
      setLoading(false);
    }
  };

  const toggleCheck = (id: string) => {
    setCheckedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-3">
      {/* Botón Principal */}
      {isVtex ? (
        <Button
          type="button"
          disabled={loading}
          onClick={handleLoadCart}
          className="h-12 w-full text-sm font-semibold text-white shadow-md hover:brightness-110 transition-all flex items-center justify-center gap-2 rounded-xl"
          style={{ background: 'var(--cc-ink, #1F2937)' }}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-white" />
          ) : (
            <Zap className="h-4 w-4 text-amber-400" />
          )}
          <span>Cargar Carro Automático en {basket.store}</span>
        </Button>
      ) : (
        <Button
          type="button"
          disabled={loading}
          onClick={handleOpenAllProducts}
          className="h-12 w-full text-sm font-semibold text-white shadow-md hover:brightness-110 transition-all flex items-center justify-center gap-2 rounded-xl"
          style={{ background: 'var(--cc-ink, #1F2937)' }}
        >
          <Layers className="h-4 w-4 text-[var(--cc-copper,#E07A5F)]" />
          <span>Abrir todos los productos en {basket.store} ({basket.items.length})</span>
        </Button>
      )}

      {/* Botón secundario si es VTEX */}
      {isVtex && (
        <button
          type="button"
          onClick={handleOpenAllProducts}
          className="w-full py-2 px-3 rounded-lg border border-subtle bg-surface text-xs font-medium cc-text-primary hover:bg-subtle/40 transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer"
        >
          <Layers className="h-3.5 w-3.5" />
          <span>Abrir fichas individuales en pestañas</span>
        </button>
      )}

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
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                {basket.store} listo
              </p>
              <p className="mt-0.5 text-[11px] cc-text-secondary leading-4">
                {isVtex
                  ? 'Revisa el carro en la pestaña del supermercado, confirma tu dirección y paga.'
                  : `Se abrieron las pestañas de tus productos en ${basket.store}. Agrega los que tengan stock y continúa al pago:`}
              </p>
            </div>
          </div>

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
              Abrir todas las pestañas
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
