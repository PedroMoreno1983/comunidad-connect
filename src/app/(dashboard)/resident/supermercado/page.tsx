'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BadgeDollarSign,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  Drone,
  ExternalLink,
  FileUp,
  Info,
  Loader2,
  ScanBarcode,
  ShoppingBag,
  ShoppingBasket,
  Store,
  Tags,
  Trophy,
  Warehouse,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { DisplayHeading } from '@/components/cc/Eyebrow';
import { RemoteCartButton } from '@/components/resident/supermarket/RemoteCartButton';
import { SUPERMARKET_STORES } from '@/lib/supermarketBasket';
import { storeSearchUrl } from '@/lib/supermarketText';
import { MAX_SHOPPING_LIST_CHARS, MAX_SHOPPING_LIST_ITEMS } from '@/lib/supermarketGroupDomain';
import type {
  SupermarketBasketCandidate,
  SupermarketComparisonSource,
  SupermarketRequestedItem,
  SupermarketSearchResponse,
  SupermarketShoppingItem,
} from '@/lib/types';

const LIST_SUGGESTIONS = [
  { title: 'Compra semanal', items: ['Pechuga de pollo', 'Arroz', 'Paltas', 'Huevos', 'Leche', 'Pan molde'] },
  { title: 'Asado', items: ['Carne', 'Longanizas', 'Cebollas', 'Papas', 'Tomates', 'Bebidas'] },
  { title: 'Desayunos', items: ['Avena', 'Leche', 'Yogur', 'Plátanos', 'Huevos', 'Pan'] },
];

const STORE_HOME: Record<string, string> = {
  Jumbo: 'https://www.jumbo.cl',
  'Santa Isabel': 'https://www.santaisabel.cl',
  Lider: 'https://super.lider.cl',
  Unimarc: 'https://www.unimarc.cl',
  Tottus: 'https://www.tottus.cl/tottus-cl',
  aCuenta: 'https://www.acuenta.cl',
  Irurzun: 'https://irurzun.cl',
};

const STORE_ACCENT: Record<string, string> = {
  Jumbo: '#2E7D32',
  'Santa Isabel': '#C62828',
  Lider: '#1476D4',
  Unimarc: '#D71920',
  Tottus: '#7CB342',
  aCuenta: '#F28C00',
  Irurzun: '#6D4C41',
};

const STORE_ICONS = {
  Jumbo: ShoppingBasket,
  'Santa Isabel': Store,
  Lider: BadgeDollarSign,
  Unimarc: ScanBarcode,
  Tottus: ShoppingBag,
  aCuenta: Tags,
  Irurzun: Warehouse,
};

function money(value: number) {
  return `$${Math.round(value).toLocaleString('es-CL')}`;
}

function freshness(value?: string) {
  if (!value) return 'Sin actualización verificable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin actualización verificable';
  return new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function missingItem(requested: SupermarketRequestedItem): SupermarketShoppingItem {
  return {
    id: crypto.randomUUID(),
    name: requested.term,
    brand: '',
    price: 0,
    requestedTerm: requested.term,
    requestedQuantity: requested.quantity,
    requestedUnit: requested.unit,
    quantity: requested.quantity,
    packUnits: 1,
    suppliedQuantity: requested.quantity,
    lineTotal: 0,
    checked: false,
    available: false,
    source: 'missing',
  };
}

export default function SupermarketPage() {
  const { toast } = useToast();
  const [shoppingInput, setShoppingInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<SupermarketShoppingItem[]>([]);
  const [requestedItems, setRequestedItems] = useState<SupermarketRequestedItem[]>([]);
  const [basketOptions, setBasketOptions] = useState<SupermarketBasketCandidate[]>([]);
  const [sources, setSources] = useState<SupermarketComparisonSource[]>([]);
  const [selectedStore, setSelectedStore] = useState<string | null>(null);
  const [compared, setCompared] = useState(false);
  const [copied, setCopied] = useState(false);
  // Los sellos son opcionales a proposito: se piden solo si el vecino los pide.
  const [seals, setSeals] = useState<Record<string, string[]> | null>(null);
  const [sealsStore, setSealsStore] = useState<string | null>(null);
  const [sealsLoading, setSealsLoading] = useState(false);
  const [sealsUnsupported, setSealsUnsupported] = useState(false);
  const [realTotal, setRealTotal] = useState<{ supported: boolean; total?: number; discount?: number } | null>(null);
  const [realTotalStore, setRealTotalStore] = useState<string | null>(null);
  const [realTotalLoading, setRealTotalLoading] = useState(false);
  const [historyEnabled, setHistoryEnabled] = useState<boolean | null>(null);
  const [repurchases, setRepurchases] = useState<Array<{ term: string; daysSinceLast: number }>>([]);

  const importShoppingList = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 1_000_000) {
      toast({
        title: 'El archivo es demasiado grande',
        description: 'Usa un TXT o CSV de hasta 1 MB.',
        variant: 'destructive',
      });
      return;
    }
    try {
      const raw = await file.text();
      const imported = file.name.toLowerCase().endsWith('.csv')
        ? raw.split(/\r?\n/).map(row => (
          row.split(/[;,\t]/).map(cell => cell.trim()).find(Boolean) ?? ''
        )).filter(Boolean).join('\n')
        : raw;
      const normalized = imported.trim().slice(0, MAX_SHOPPING_LIST_CHARS);
      if (!normalized) throw new Error('El archivo no contiene productos legibles.');
      setShoppingInput(normalized);
      toast({ title: 'Lista importada', description: 'Revísala y pulsa comparar.', variant: 'success' });
    } catch (error) {
      toast({
        title: 'No se pudo leer la lista',
        description: error instanceof Error ? error.message : 'Usa un archivo TXT o CSV.',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') !== 'group') return;
    const order = params.get('order');
    window.location.replace(order
      ? `/convivencia?lane=abasto&order=${encodeURIComponent(order)}`
      : '/convivencia?lane=abasto');
  }, []);

  const selectedBasket = useMemo(
    () => basketOptions.find(basket => basket.store === selectedStore)
      ?? basketOptions.find(basket => basket.coveredCount > 0)
      ?? null,
    [basketOptions, selectedStore],
  );
  const showingSeals = seals !== null && sealsStore === selectedBasket?.store;
  const showingRealTotal = realTotal !== null && realTotalStore === selectedBasket?.store;
  const completeBaskets = basketOptions.filter(basket => basket.complete);
  const hasResults = basketOptions.some(basket => basket.coveredCount > 0);
  const winner = completeBaskets[0] ?? basketOptions.find(basket => basket.coveredCount > 0) ?? null;
  const runnerUp = winner?.complete ? completeBaskets[1] : undefined;
  const winnerSavings = winner && runnerUp ? Math.max(0, runnerUp.subtotal - winner.subtotal) : 0;
  const sourceByStore = useMemo(
    () => new Map(sources.map(source => [source.store, source.status])),
    [sources],
  );

  const selectBasket = (
    basket: SupermarketBasketCandidate,
    requested = requestedItems,
  ) => {
    const byTerm = new Map(basket.items.map(item => [item.requestedTerm, item]));
    setSelectedStore(basket.store);
    setList(requested.map(requestedItem => {
      const candidate = byTerm.get(requestedItem.term);
      return candidate ? {
        ...candidate,
        checked: false,
        available: true,
        source: 'catalog' as const,
      } : missingItem(requestedItem);
    }));
  };

  const processShoppingList = async () => {
    if (!shoppingInput.trim()) return;
    setLoading(true);
    try {
      const response = await fetch('/api/supermarket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: shoppingInput }),
      });
      const data = await response.json() as SupermarketSearchResponse;
      if (!response.ok) throw new Error(data.error || 'No fue posible comparar la lista.');

      const nextRequested = data.requestedItems ?? data.items.map(item => ({
        term: item.requestedTerm,
        quantity: item.requestedQuantity,
        unit: item.requestedUnit,
      }));
      const nextOptions = data.basketOptions ?? [];
      setRequestedItems(nextRequested);
      setBasketOptions(nextOptions);
      setSources(data.sources ?? []);
      setCompared(true);
      setSelectedStore(nextOptions.find(basket => basket.coveredCount > 0)?.store ?? null);
      setList(data.items);

      // Sin esperar: la ruta ignora la escritura si el vecino no activo la
      // memoria, y guardar no debe demorar la comparacion que si pidio.
      if (historyEnabled) {
        void fetch('/api/supermarket/history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            store: nextOptions.find(basket => basket.coveredCount > 0)?.store ?? null,
            terms: nextRequested.map(requested => ({
              term: requested.term,
              quantity: requested.quantity,
              unit: requested.unit,
            })),
          }),
        }).catch(() => null);
      }

      toast({
        title: nextOptions.some(basket => basket.complete)
          ? 'Siete cadenas comparadas'
          : 'Comparación con faltantes',
        description: data.message,
        variant: nextOptions.some(basket => basket.complete) ? 'success' : undefined,
      });
    } catch (error) {
      toast({
        title: 'No se pudo comparar',
        description: error instanceof Error ? error.message : 'Hubo un fallo consultando los precios.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const refreshHistory = async () => {
    try {
      const response = await fetch('/api/supermarket/history');
      if (!response.ok) return;
      const data = await response.json() as {
        enabled?: boolean;
        suggestions?: Array<{ term: string; daysSinceLast: number }>;
      };
      setHistoryEnabled(data.enabled === true);
      setRepurchases(data.suggestions ?? []);
    } catch {
      // La memoria es accesoria: si no carga, la pantalla sigue sirviendo.
    }
  };

  useEffect(() => { void refreshHistory(); }, []);

  const toggleHistory = async (enabled: boolean) => {
    try {
      const response = await fetch('/api/supermarket/history', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (!response.ok) throw new Error('No se pudo cambiar la preferencia.');
      setHistoryEnabled(enabled);
      if (!enabled) setRepurchases([]);
      else void refreshHistory();
      toast({
        title: enabled ? 'Convive recordará tus compras' : 'Historial borrado',
        description: enabled
          ? 'Necesita dos compras del mismo producto para proponerte la recompra.'
          : 'Se eliminó lo que habíamos guardado.',
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: 'No se pudo cambiar',
        description: error instanceof Error ? error.message : 'Intenta nuevamente.',
        variant: 'destructive',
      });
    }
  };

  const loadRealTotal = async () => {
    const store = selectedBasket?.store;
    if (!store) return;
    setRealTotalLoading(true);
    try {
      const response = await fetch('/api/supermarket/real-total', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store,
          items: list
            .filter(item => item.available && item.sku)
            .map(item => ({ sku: item.sku, quantity: item.quantity })),
        }),
      });
      const data = await response.json() as { supported?: boolean; total?: number; discount?: number; error?: string };
      if (!response.ok) throw new Error(data.error || 'No se pudo consultar el total real.');
      setRealTotal({ supported: data.supported === true, total: data.total, discount: data.discount });
      setRealTotalStore(store);
    } catch (error) {
      toast({
        title: 'No se pudo ver el total real',
        description: error instanceof Error ? error.message : 'Intenta nuevamente en un momento.',
        variant: 'destructive',
      });
    } finally {
      setRealTotalLoading(false);
    }
  };

  const loadSeals = async () => {
    const store = selectedBasket?.store;
    if (!store) return;
    if (sealsStore === store && seals) { setSeals(null); setSealsStore(null); return; }
    setSealsLoading(true);
    setSealsUnsupported(false);
    try {
      const response = await fetch('/api/supermarket/seals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store,
          skus: list.map(item => item.sku).filter(Boolean),
        }),
      });
      const data = await response.json() as { supported?: boolean; seals?: Record<string, string[]>; error?: string };
      if (!response.ok) throw new Error(data.error || 'No se pudieron consultar los sellos.');
      setSealsUnsupported(data.supported === false);
      setSeals(data.seals ?? {});
      setSealsStore(store);
    } catch (error) {
      toast({
        title: 'No se pudieron ver los sellos',
        description: error instanceof Error ? error.message : 'Intenta nuevamente en un momento.',
        variant: 'destructive',
      });
    } finally {
      setSealsLoading(false);
    }
  };

  const copyComparison = async () => {
    const rows = basketOptions.map(basket => (
      basket.coveredCount > 0
        ? `${basket.store}: ${money(basket.subtotal)} · ${basket.coveredCount}/${basket.requestedCount}`
        : `${basket.store}: sin resultados vigentes`
    ));
    try {
      await navigator.clipboard.writeText([
        'Comparación de supermercados · Convive Connect',
        ...rows,
        '',
        'Estimado sumando el precio de cada producto. No incluye promociones por volumen,',
        'montos mínimos de despacho, membresías ni medios de pago.',
      ].join('\n'));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      toast({
        title: 'No se pudo copiar',
        description: 'Tu navegador bloqueó el portapapeles.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 pb-20 sm:px-0">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--cc-copper)' }}>
          Comparador de supermercados
        </p>
        <h1 className="mt-2 text-3xl font-bold cc-text-primary">Compara tu compra. Elige con evidencia.</h1>
        <p className="mt-2 max-w-3xl text-sm cc-text-secondary">
          Revisamos la misma lista y las mismas cantidades en {SUPERMARKET_STORES.length} cadenas. Una canasta incompleta nunca gana
          solo porque su subtotal sea menor. Al elegir una tienda abrimos un navegador seguro y temporal que carga
          la selección, sin extensiones ni app; solo intervienes si la cadena pide ubicación, login o verificación.
        </p>
      </header>

      <section
        aria-label="Supermercados comparados"
        className="flex gap-2 overflow-x-auto rounded-2xl border p-3"
        style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper)' }}
      >
        {SUPERMARKET_STORES.map(store => {
          const Icon = STORE_ICONS[store];
          const status = sourceByStore.get(store);
          return (
            <div
              key={store}
              data-testid={`store-chip-${store.toLowerCase().replaceAll(' ', '-')}`}
              className="flex min-w-max flex-1 items-center gap-2 rounded-xl border px-3 py-2"
              style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper-warm)' }}
            >
              <span
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white"
                style={{ background: STORE_ACCENT[store] }}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-xs font-bold cc-text-primary">{store}</span>
                <span className="block text-[10px] cc-text-tertiary">
                  {!compared ? 'Por comparar' : status === 'degraded' ? 'Fuente degradada' : status === 'ok' ? 'Comparado' : 'Sin resultados'}
                </span>
              </span>
            </div>
          );
        })}
      </section>

      <section
        className="relative overflow-hidden rounded-2xl border p-6 text-white md:p-8"
        style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-ink)' }}
      >
        <div className="grid gap-7 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <div
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em]"
              style={{ borderColor: 'rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.08)' }}
            >
              <BarChart3 className="h-3 w-3" style={{ color: '#F5BFA3' }} />
              Comparación por compra total
            </div>
            <DisplayHeading size={36} className="mt-4" style={{ color: '#fff' }}>
              Pega hasta {MAX_SHOPPING_LIST_ITEMS} productos.
            </DisplayHeading>
            <p className="mt-3 max-w-lg text-sm leading-6 text-white/70">
              Una línea por producto. Respetamos cantidades, unidades y formatos comparables antes de sumar.
            </p>
            <ol className="mt-4 grid gap-2 text-xs text-white/75 sm:grid-cols-3">
              <li><strong className="text-white">1.</strong> Escribe o sube tu lista</li>
              <li><strong className="text-white">2.</strong> Compara y resuelve faltantes</li>
              <li><strong className="text-white">3.</strong> Carga el carro elegido</li>
            </ol>
            {historyEnabled === false ? (
              <div className="mt-4 rounded-xl border p-3" style={{ borderColor: 'rgba(255,255,255,0.18)' }}>
                <p className="text-xs text-white/80">
                  ¿Quieres que Convive recuerde lo que compras y te proponga la recompra?
                  Se guarda solo lo que pides, nadie más lo ve, y puedes borrarlo cuando quieras.
                </p>
                <button
                  type="button"
                  onClick={() => void toggleHistory(true)}
                  className="mt-2 rounded-full border px-3 py-1.5 text-xs font-bold text-white hover:bg-white/10"
                  style={{ borderColor: 'rgba(255,255,255,0.3)' }}
                >
                  Activar memoria de compras
                </button>
              </div>
            ) : null}

            {repurchases.length > 0 ? (
              <div className="mt-4">
                <p className="text-xs font-bold uppercase tracking-wider text-white/60">Toca reponer</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {repurchases.slice(0, 8).map(item => (
                    <button
                      key={item.term}
                      type="button"
                      onClick={() => setShoppingInput(current => (
                        current.trim() ? `${current.trim()}
${item.term}` : item.term
                      ))}
                      className="rounded-full border px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10"
                      style={{ borderColor: 'rgba(255,255,255,0.18)' }}
                    >
                      {item.term} · hace {item.daysSinceLast} d
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => void toggleHistory(false)}
                  className="mt-2 text-[11px] text-white/50 underline hover:text-white/80"
                >
                  Dejar de recordar y borrar lo guardado
                </button>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              {LIST_SUGGESTIONS.map(suggestion => (
                <button
                  key={suggestion.title}
                  type="button"
                  onClick={() => setShoppingInput(suggestion.items.join('\n'))}
                  className="rounded-full border px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10"
                  style={{ borderColor: 'rgba(255,255,255,0.18)' }}
                >
                  {suggestion.title}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border p-5" style={{ borderColor: 'rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.08)' }}>
            <label className="text-xs font-bold uppercase tracking-widest text-white/70" htmlFor="shopping-list">
              Tu lista
            </label>
            <div className="relative mt-2">
              <textarea
                id="shopping-list"
                className="min-h-44 w-full rounded-xl border p-4 pr-14 text-sm text-white placeholder:text-white/45 focus:outline-none focus:ring-2 focus:ring-white/30"
                style={{ borderColor: 'rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.10)' }}
                placeholder={'2 arroz\nleche x 6\naceite\npapel higiénico 2'}
                value={shoppingInput}
                maxLength={MAX_SHOPPING_LIST_CHARS}
                onChange={event => setShoppingInput(event.target.value)}
              />
              <button
                type="button"
                aria-label="Comparar lista"
                onClick={() => void processShoppingList()}
                disabled={loading || !shoppingInput.trim()}
                className="absolute bottom-3 right-3 rounded-full p-3 disabled:opacity-50"
                style={{ background: '#fff', color: 'var(--cc-copper)' }}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-white/60">También puedes separar productos con coma o punto y coma.</p>
              <label
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold text-white/85 hover:bg-white/10"
                style={{ borderColor: 'rgba(255,255,255,0.18)' }}
              >
                <FileUp className="h-4 w-4" />
                Subir TXT o CSV
                <input
                  type="file"
                  accept=".txt,.csv,text/plain,text/csv"
                  className="sr-only"
                  onChange={event => {
                    void importShoppingList(event.target.files?.[0]);
                    event.currentTarget.value = '';
                  }}
                />
              </label>
            </div>
          </div>
        </div>
      </section>

      {basketOptions.length > 0 && hasResults && (
        <>
          <section className="rounded-2xl border p-5 md:p-6" style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper)' }}>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider cc-text-tertiary">Resultado de las {SUPERMARKET_STORES.length} cadenas</p>
                <h2 className="mt-1 text-2xl font-bold cc-text-primary">
                  {completeBaskets.length > 0 ? 'Mejor compra completa' : 'Mayor cobertura disponible'}
                </h2>
                {winnerSavings > 0 && winner && (
                  <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--cc-sage)' }}>
                    {winner.store} ahorra {money(winnerSavings)} frente a la siguiente canasta completa.
                  </p>
                )}
                <p className="mt-2 max-w-xl text-xs cc-text-tertiary">
                  Estimado sumando el precio de cada producto. Las promociones por volumen y los montos
                  mínimos de despacho pueden cambiar el total en la tienda.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void copyComparison()}
                className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold cc-text-primary"
                style={{ borderColor: 'var(--cc-line)' }}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Comparación copiada' : 'Copiar comparación'}
              </button>
            </div>

            <div className="mt-5 flex gap-3 overflow-x-auto pb-2" data-testid="store-comparison-row">
              {basketOptions.map((basket, index) => {
                const selected = basket.store === selectedBasket?.store;
                const isWinner = basket.store === winner?.store;
                const hasStoreResults = basket.coveredCount > 0;
                return (
                  <button
                    key={basket.store}
                    type="button"
                    onClick={() => selectBasket(basket)}
                    className="min-w-[220px] flex-1 rounded-2xl border p-4 text-left transition hover:-translate-y-0.5"
                    style={{
                      borderColor: selected ? 'var(--cc-copper)' : 'var(--cc-line)',
                      background: selected ? 'var(--cc-paper-warm)' : 'var(--cc-paper)',
                      opacity: hasStoreResults ? 1 : 0.68,
                    }}
                    aria-label={`Ver comparación de ${basket.store}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white"
                        style={{ background: STORE_ACCENT[basket.store] ?? 'var(--cc-ink)' }}
                      >
                        {index + 1}
                      </span>
                      {isWinner && hasStoreResults && <Trophy className="h-5 w-5" style={{ color: 'var(--cc-copper)' }} />}
                    </div>
                    <p className="mt-3 text-lg font-bold cc-text-primary">{basket.store}</p>
                    <p className="mt-1 text-2xl font-bold cc-text-primary">
                      {hasStoreResults ? money(basket.subtotal) : '—'}
                    </p>
                    <p className="mt-2 text-xs cc-text-secondary">
                      {basket.coveredCount} de {basket.requestedCount} productos
                    </p>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--cc-paper-deep)' }}>
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${basket.coveragePercent}%`,
                          background: basket.complete ? 'var(--cc-sage)' : 'var(--cc-amber)',
                        }}
                      />
                    </div>
                    <p className="mt-3 text-xs font-semibold" style={{ color: basket.complete ? 'var(--cc-sage)' : 'var(--cc-amber)' }}>
                      {!hasStoreResults
                        ? 'Sin precios vigentes para esta lista'
                        : basket.complete
                          ? 'Canasta completa'
                          : `${basket.missingTerms.length} productos faltantes`}
                    </p>
                    <p className="mt-2 text-[10px] cc-text-tertiary">Actualización: {freshness(basket.fetchedAt)}</p>
                  </button>
                );
              })}
            </div>
          </section>

          {selectedBasket && (
            <section className="rounded-2xl border p-5 md:p-6" style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper)' }}>
              <div className="flex flex-wrap items-start justify-between gap-5">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl p-3" style={{ background: 'var(--cc-paper-warm)' }}>
                    <Store className="h-5 w-5" style={{ color: STORE_ACCENT[selectedBasket.store] ?? 'var(--cc-copper)' }} />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider cc-text-tertiary">Canasta seleccionada</p>
                    <h2 className="mt-1 text-2xl font-bold cc-text-primary">{selectedBasket.store}</h2>
                    <p className="mt-1 text-sm cc-text-secondary">
                      {selectedBasket.coveredCount} de {selectedBasket.requestedCount} productos · {money(selectedBasket.subtotal)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <RemoteCartButton store={selectedBasket.store} items={selectedBasket.items} />
                  <a
                    href={STORE_HOME[selectedBasket.store]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold cc-text-primary"
                    style={{ borderColor: 'var(--cc-line)' }}
                  >
                    <ExternalLink className="h-4 w-4" />
                    Abrir sitio de {selectedBasket.store}
                  </a>
                </div>
              </div>

              {!selectedBasket.complete && selectedBasket.missingTerms.length > 0 && (
                <div className="mt-5 rounded-xl border p-4" style={{ borderColor: 'var(--cc-amber)', background: 'var(--cc-amber-tint)' }}>
                  <p className="text-sm font-bold cc-text-primary">
                    Esta canasta no compite como completa: faltan {selectedBasket.missingTerms.length} productos.
                  </p>
                  <ul className="mt-2 space-y-2">
                    {selectedBasket.missingTerms.map(term => {
                      const search = storeSearchUrl(selectedBasket.store, term);
                      const alternatives = basketOptions.filter(option => (
                        option.store !== selectedBasket.store
                        && option.coveredCount > 0
                        && !option.missingTerms.includes(term)
                      ));
                      return (
                        <li key={term} className="text-xs cc-text-secondary">
                          <strong className="cc-text-primary">{term}</strong>
                          {search && (
                            <>
                              {' · '}
                              <a href={search} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                                buscar en {selectedBasket.store}
                              </a>
                            </>
                          )}
                          {alternatives.length > 0 && (
                            <>
                              {' · disponible en '}
                              {alternatives.map((option, optionIndex) => (
                                <span key={option.store}>
                                  {optionIndex > 0 && ', '}
                                  <button type="button" onClick={() => selectBasket(option)} className="font-semibold underline">
                                    {option.store}
                                  </button>
                                </span>
                              ))}
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </section>
          )}

          <section className="overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper)' }}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: 'var(--cc-line)' }}>
              <div>
                <h2 className="text-lg font-bold cc-text-primary">Detalle de la canasta</h2>
                <p className="text-xs cc-text-secondary">Producto equivalente, cantidad calculada y precio observado.</p>
                {showingRealTotal ? (
                  realTotal?.supported && typeof realTotal.total === 'number' ? (
                    <p className="mt-1 text-xs font-bold" style={{ color: 'var(--cc-sage)' }}>
                      {selectedBasket?.store} cobra {money(realTotal.total)} por esta canasta
                      {selectedBasket && Math.abs(realTotal.total - selectedBasket.subtotal) >= 1
                        ? ` · ${money(Math.abs(realTotal.total - selectedBasket.subtotal))} ${realTotal.total < selectedBasket.subtotal ? 'menos' : 'más'} que el estimado`
                        : ' · igual que el estimado'}
                      {realTotal.discount ? ` · incluye ${money(realTotal.discount)} de promociones` : ''}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs" style={{ color: 'var(--cc-amber)' }}>
                      {selectedBasket?.store} no permite consultar el total antes de comprar.
                    </p>
                  )
                ) : null}
                {showingSeals && sealsUnsupported ? (
                  <p className="mt-1 text-xs" style={{ color: 'var(--cc-amber)' }}>
                    {selectedBasket?.store} no publica los sellos de advertencia en su catálogo.
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void loadRealTotal()}
                  disabled={realTotalLoading}
                  className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold cc-text-primary disabled:opacity-60"
                  style={{ borderColor: 'var(--cc-line)' }}
                >
                  {realTotalLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Ver total real
                </button>
                <button
                  type="button"
                  onClick={() => void loadSeals()}
                  disabled={sealsLoading}
                  className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold cc-text-primary disabled:opacity-60"
                  style={{ borderColor: 'var(--cc-line)' }}
                >
                  {sealsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {showingSeals ? 'Ocultar sellos' : 'Ver sellos'}
                </button>
                <span className="rounded-full px-3 py-1.5 text-xs font-bold cc-text-secondary" style={{ background: 'var(--cc-paper-warm)' }}>
                  {list.filter(item => item.available).length} de {list.length}
                </span>
              </div>
            </div>

            <div className="max-h-[34rem] overflow-auto">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <thead className="sticky top-0 z-10" style={{ background: 'var(--cc-paper-warm)' }}>
                  <tr className="text-xs font-bold uppercase tracking-wider cc-text-tertiary">
                    <th className="px-5 py-3">Pediste</th>
                    <th className="px-5 py-3">Producto comparable</th>
                    <th className="px-5 py-3">Cantidad</th>
                    <th className="px-5 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map(item => (
                    <tr key={`${item.requestedTerm}-${item.id}`} className="border-t" style={{ borderColor: 'var(--cc-line)' }}>
                      <td className="px-5 py-3 text-sm font-semibold cc-text-primary">{item.requestedTerm}</td>
                      <td className="px-5 py-3">
                        {item.available ? (
                          <>
                            {item.productUrl ? (
                              <a
                                href={item.productUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group inline-flex items-center gap-1.5 text-sm font-semibold cc-text-primary hover:text-[var(--cc-copper)]"
                              >
                                <span>{item.name}</span>
                                <ExternalLink className="h-3.5 w-3.5 opacity-60" />
                              </a>
                            ) : (
                              <p className="text-sm font-semibold cc-text-primary">{item.name}</p>
                            )}
                            <p className="mt-0.5 text-xs cc-text-tertiary">
                              {item.brand || selectedBasket?.store}
                              {item.isOffer ? ' · oferta observada' : ''}
                            </p>
                            {showingSeals && item.sku ? (
                              (seals?.[item.sku] ?? []).length > 0 ? (
                                <span className="mt-1 flex flex-wrap gap-1">
                                  {(seals?.[item.sku] ?? []).map(seal => (
                                    <span
                                      key={seal}
                                      className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                                      style={{ background: '#1a1a1a', color: '#fff' }}
                                    >
                                      {seal}
                                    </span>
                                  ))}
                                </span>
                              ) : (
                                <span className="mt-1 block text-[10px] cc-text-tertiary">Sin sellos</span>
                              )
                            ) : null}
                          </>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--cc-amber)' }}>
                            <AlertTriangle className="h-4 w-4" /> No encontrado
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-sm cc-text-secondary">
                        {item.requestedUnit
                          ? `${item.requestedQuantity} ${item.requestedUnit} · ${item.quantity} envase${item.quantity === 1 ? '' : 's'}`
                          : `${item.quantity} unidad${item.quantity === 1 ? '' : 'es'}`}
                      </td>
                      <td className="px-5 py-3 text-right text-sm font-bold cc-text-primary">
                        {item.available ? money(item.lineTotal) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid gap-3 md:grid-cols-2">
            <div
              className="flex items-start gap-3 rounded-2xl border p-5"
              style={{
                borderColor: selectedBasket?.complete ? 'var(--cc-success-border)' : 'var(--cc-amber)',
                background: selectedBasket?.complete ? 'var(--cc-sage-tint)' : 'var(--cc-amber-tint)',
              }}
            >
              {selectedBasket?.complete
                ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success-fg" />
                : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'var(--cc-amber)' }} />}
              <div>
                <p className="font-bold cc-text-primary">
                  {selectedBasket?.complete ? 'Comparación válida como canasta completa' : 'Subtotal parcial, no ganador'}
                </p>
                <p className="mt-1 text-sm cc-text-secondary">
                  {selectedBasket?.complete
                    ? 'Incluye todos los productos y las cantidades solicitadas.'
                    : 'Los productos faltantes se muestran y el subtotal no se presenta como la compra más barata.'}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-2xl border p-5" style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper)' }}>
              <Drone className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'var(--cc-copper)' }} />
              <div>
                <p className="font-bold cc-text-primary">Despacho separado del precio de productos</p>
                <p className="mt-1 text-sm cc-text-secondary">
                  El total no incluye envío, propina, beneficios de tarjeta ni membresías. Esos valores dependen de dirección, sesión y medio de pago.
                </p>
              </div>
            </div>
          </section>
        </>
      )}

      {basketOptions.length > 0 && !hasResults && !loading && compared && (
        <section className="rounded-2xl border px-6 py-12 text-center" style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper)' }}>
          <AlertTriangle className="mx-auto h-10 w-10" style={{ color: 'var(--cc-amber)' }} />
          <p className="mt-3 font-bold cc-text-secondary">Las {SUPERMARKET_STORES.length} cadenas quedaron sin resultados vigentes para esta lista.</p>
          <p className="mt-1 text-sm cc-text-tertiary">Prueba nombres más simples o vuelve a intentar cuando se actualicen los catálogos.</p>
        </section>
      )}

      {basketOptions.length === 0 && !loading && !compared && (
        <section className="rounded-2xl border px-6 py-12 text-center" style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper)' }}>
          <Info className="mx-auto h-10 w-10 cc-text-disabled" />
          <p className="mt-3 font-bold cc-text-secondary">Pega tu lista para comparar las {SUPERMARKET_STORES.length} cadenas.</p>
          <p className="mt-1 text-sm cc-text-tertiary">No mezclaremos una canasta incompleta con una completa.</p>
        </section>
      )}
    </div>
  );
}
