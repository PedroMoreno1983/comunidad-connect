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

interface CartLoaderButtonProps {
  basket: SupermarketPurchasePlanBasket;
}

export function CartLoaderButton({ basket }: CartLoaderButtonProps) {
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storeUrl = STORE_HOME[basket.store];
  const stepByStep = STEP_BY_STEP_STORES.has(basket.store);
  const wholesaleQuote = basket.store === 'Irurzun';

  if (!storeUrl) return null;

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

  return (
    <div className="space-y-2">
      <Button
        type="button"
        disabled={loading}
        onClick={() => void prepare()}
        className="h-12 w-full text-sm text-white"
        style={{ background: 'var(--cc-ink)' }}
      >
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShoppingCart className="mr-2 h-4 w-4" />}
        {wholesaleQuote ? `Preparar cotización en ${basket.store}` : `Cargar carro en ${basket.store}`}
      </Button>

      {error && <p className="text-[11px] text-danger-fg">{error}</p>}

      <p className="text-[11px] cc-text-tertiary">
        Necesitas el marcador de CoCo una sola vez.{' '}
        <Link href="/resident/supermercado/cargador" className="inline-flex items-center gap-1 underline">
          Activarlo ahora <ExternalLink className="h-3 w-3" />
        </Link>
      </p>
    </div>
  );
}
