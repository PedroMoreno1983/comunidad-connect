'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Loader2,
  ShoppingCart,
  Sparkles,
  Store,
  Trophy,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useToast } from '@/components/ui/Toast';
import { DisplayHeading } from '@/components/cc/Eyebrow';
import { CartLoaderButton } from '@/components/resident/supermarket/CartLoaderButton';
import { storeLoadability, loadabilityRank, type StoreLoadability } from '@/lib/supermarket/cartUrl';
import { MAX_SHOPPING_LIST_CHARS, MAX_SHOPPING_LIST_ITEMS } from '@/lib/supermarketGroupDomain';
import type {
  SupermarketBasketCandidate,
  SupermarketCheckoutQuote,
  SupermarketRequestedItem,
  SupermarketSearchResponse,
  SupermarketShoppingItem,
} from '@/lib/types';

const LIST_SUGGESTIONS = [
  { title: 'Compra semanal', items: ['Pechuga de pollo', 'Arroz', 'Paltas', 'Huevos', 'Leche', 'Pan molde'] },
  { title: 'Asado', items: ['500 g carne molida de vacuno', '500 g longanizas', '1 kg cebollas', '2 kg papas', '500 g tomates', '2 l bebida cola'] },
  { title: 'Desayunos', items: ['Avena', 'Leche', 'Yogur', 'Plátanos', 'Huevos', 'Pan'] },
];

function money(value: number) {
  return `$${Math.round(value).toLocaleString('es-CL')}`;
}

const LOADABILITY_BADGE: Record<StoreLoadability, { label: string; bg: string; fg: string }> = {
  direct: { label: 'Carro automático', bg: 'var(--cc-sage-tint)', fg: 'var(--cc-sage)' },
  // Los productos sí se cargan, pero en el host de cuenta de VTEX y no en el
  // sitio de la tienda: el carro no aparece donde la persona tiene su sesión.
  // Decir "Carro automático" ahí prometía algo que no ocurre.
  offsite: { label: 'Carga en otro sitio', bg: 'var(--cc-amber-tint)', fg: 'var(--cc-amber)' },
  attempt: { label: 'Puede pedir verificación', bg: 'var(--cc-amber-tint)', fg: 'var(--cc-amber)' },
  manual: { label: 'No carga automática', bg: 'var(--cc-paper-warm)', fg: 'var(--cc-ink-tertiary)' },
};

/** Qué pasa al continuar, cuando la lista está completa en esa tienda. */
const LOADABILITY_STATUS: Record<StoreLoadability, string> = {
  direct: 'Lista lista para cargar',
  offsite: 'Se carga, pero fuera del sitio de la tienda',
  attempt: 'Lista encontrada; la tienda puede verificarte',
  manual: 'Lista encontrada; carga manual',
};

/** Lo mismo, nombrando la tienda, para el aviso de la canasta elegida. */
const LOADABILITY_HEADLINE: Record<StoreLoadability, (store: string) => string> = {
  direct: store => `Lista lista para cargar en ${store}`,
  offsite: store => `Lista encontrada en ${store}; se carga fuera de su sitio`,
  attempt: store => `Lista encontrada en ${store}; puede pedir verificación`,
  manual: store => `Lista encontrada en ${store}; carga manual`,
};

/**
 * Ordena por qué tan bien carga el carro (ver loadabilityRank): primero Jumbo,
 * que es la única donde el carro queda en el sitio donde la persona compra;
 * después las que cargan fuera de sitio, las de intento y por último las
 * manuales — aunque estas sean más baratas. Dentro de cada grupo: primero las
 * completas, luego más cobertura, luego mejor precio.
 */
function orderBaskets(baskets: SupermarketBasketCandidate[]): SupermarketBasketCandidate[] {
  return [...baskets].sort((a, b) => {
    // Hoy solo 'direct' (Jumbo) deja el carro donde la persona compra y paga.
    // En el resto hay que rehacer el trabajo, así que una canasta más barata
    // que no se puede cargar no sirve: va primero la que sí funciona, y la UI
    // dice explícitamente por qué y cuánto cuesta la alternativa barata.
    const ra = loadabilityRank(a.store);
    const rb = loadabilityRank(b.store);
    if (ra !== rb) return ra - rb;
    if (a.complete !== b.complete) return a.complete ? -1 : 1;
    if (a.coveredCount !== b.coveredCount) return b.coveredCount - a.coveredCount;
    return a.subtotal - b.subtotal;
  });
}

/**
 * La opción más barata de todas, sirva o no para cargar. Se usa para avisar
 * cuando la recomendada NO es la más económica: ocultar esa diferencia sería
 * cobrarle de más a la persona sin decírselo.
 */
function cheapestBasket(baskets: SupermarketBasketCandidate[]): SupermarketBasketCandidate | null {
  return [...baskets].sort((a, b) => a.subtotal - b.subtotal)[0] ?? null;
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

function shoppingListForBasket(
  basket: SupermarketBasketCandidate,
  requested: SupermarketRequestedItem[],
): SupermarketShoppingItem[] {
  const byTerm = new Map(basket.items.map(item => [item.requestedTerm, item]));
  return requested.map(requestedItem => {
    const candidate = byTerm.get(requestedItem.term);
    return candidate ? {
      ...candidate,
      checked: false,
      available: true,
      source: 'catalog' as const,
    } : missingItem(requestedItem);
  });
}

export default function SupermarketPage() {
  const { toast } = useToast();
  const [shoppingInput, setShoppingInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<SupermarketShoppingItem[]>([]);
  const [requestedItems, setRequestedItems] = useState<SupermarketRequestedItem[]>([]);
  const [basketOptions, setBasketOptions] = useState<SupermarketBasketCandidate[]>([]);
  const [selectedStore, setSelectedStore] = useState<string | null>(null);

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
    () => basketOptions.find(basket => basket.store === selectedStore) ?? basketOptions[0] ?? null,
    [basketOptions, selectedStore],
  );
  const completeBasketCount = basketOptions.filter(basket => basket.complete).length;

  const selectBasket = (
    basket: SupermarketBasketCandidate,
    requested = requestedItems,
  ) => {
    setSelectedStore(basket.store);
    setList(shoppingListForBasket(basket, requested));
  };

  const applyCheckoutQuote = useCallback((quote: SupermarketCheckoutQuote) => {
    const quotedByTerm = new Map(quote.items.map(item => [item.requestedTerm, item]));
    const missing = new Set(quote.missingTerms);

    setBasketOptions(current => current.map(basket => {
      if (basket.store !== quote.store) return basket;
      const items = basket.items.flatMap(item => {
        const confirmed = quotedByTerm.get(item.requestedTerm);
        if (!confirmed || missing.has(item.requestedTerm)) return [];
        return [{
          ...item,
          name: confirmed.name,
          productUrl: confirmed.productUrl,
          quantity: confirmed.quantity,
          price: confirmed.price,
          lineTotal: confirmed.lineTotal,
          fetchedAt: quote.quotedAt,
        }];
      });
      const missingTerms = [...new Set([...basket.missingTerms, ...quote.missingTerms])];
      return {
        ...basket,
        items,
        subtotal: quote.subtotal,
        coveredCount: items.length,
        coveragePercent: basket.requestedCount > 0
          ? Math.round(items.length * 100 / basket.requestedCount)
          : 0,
        missingTerms,
        complete: missingTerms.length === 0 && items.length === basket.requestedCount,
        quoteStatus: 'retailer' as const,
        quotedAt: quote.quotedAt,
      };
    }));

    setList(current => current.map(item => {
      const confirmed = quotedByTerm.get(item.requestedTerm);
      if (confirmed) {
        return {
          ...item,
          name: confirmed.name,
          productUrl: confirmed.productUrl,
          quantity: confirmed.quantity,
          price: confirmed.price,
          lineTotal: confirmed.lineTotal,
          fetchedAt: quote.quotedAt,
          available: true,
        };
      }
      return missing.has(item.requestedTerm)
        ? { ...item, available: false, source: 'missing' as const }
        : item;
    }));
  }, []);

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
      // Se reordena con desempate por cargabilidad: a precios parecidos, primero
      // la tienda más fácil de cargar. La selección por defecto sigue ese orden.
      const nextOptions = orderBaskets(data.basketOptions ?? []);
      const initialBasket = nextOptions[0] ?? null;
      setRequestedItems(nextRequested);
      setBasketOptions(nextOptions);
      if (initialBasket) {
        // La API puede recomendar la más barata, pero la UI reordena para poner
        // primero una tienda cargable. La tabla debe seguir esa misma elección.
        selectBasket(initialBasket, nextRequested);
      } else {
        setSelectedStore(data.recommendedStore ?? null);
        setList(data.items);
      }

      toast({
        title: nextOptions.some(basket => basket.complete)
          ? 'Comparación completa'
          : 'Comparación con faltantes',
        description: initialBasket
          ? `${initialBasket.store}: ${initialBasket.coveredCount} de ${initialBasket.requestedCount} productos por ${money(initialBasket.subtotal)}.`
          : data.message,
        variant: nextOptions.some(basket => basket.complete) ? 'success' : undefined,
      });
    } catch (error) {
      toast({
        title: 'No se pudo comparar',
        description: error instanceof Error ? error.message : 'Hubo un fallo contactando a CoCo.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const applySuggestion = (items: string[]) => {
    setShoppingInput(items.join('\n'));
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 pb-20 sm:px-0">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--cc-copper)' }}>
          Supermercado
        </p>
        <h1 className="mt-2 text-3xl font-bold cc-text-primary">Una lista. Un supermercado. Un solo total.</h1>
        <p className="mt-2 max-w-3xl text-sm cc-text-secondary">
          CoCo compara toda tu lista dentro de cada cadena. En Jumbo, Santa Isabel y Unimarc abre el carro
          oficial con un clic; las demás tiendas se muestran solo como referencia cuando no permiten esa carga.
        </p>
      </header>

      <section
        className="relative overflow-hidden rounded-2xl border p-6 text-white md:p-8"
        style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-ink)' }}
      >
        <div className="grid gap-7 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em]"
              style={{ borderColor: 'rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.08)' }}
            >
              <Sparkles className="h-3 w-3" style={{ color: '#F5BFA3' }} />
              Comparación por compra total
            </motion.div>
            <DisplayHeading size={36} className="mt-4" style={{ color: '#fff' }}>
              Pega hasta {MAX_SHOPPING_LIST_ITEMS} productos.
            </DisplayHeading>
            <p className="mt-3 max-w-lg text-sm leading-6 text-white/70">
              Una línea por producto. Si no indicas cantidad usamos 1; si no indicas marca elegimos una
              alternativa equivalente y vigente dentro de cada supermercado.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {LIST_SUGGESTIONS.map(suggestion => (
                <button
                  key={suggestion.title}
                  type="button"
                  onClick={() => applySuggestion(suggestion.items)}
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
            <p className="mt-2 text-xs text-white/60">También puedes separar productos con coma o punto y coma.</p>
          </div>
        </div>
      </section>

      {basketOptions.length > 0 && (
        <>
          <section className="rounded-2xl border p-5 md:p-6" style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper)' }}>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider cc-text-tertiary">Elige dónde comprar</p>
                <h2 className="mt-1 text-2xl font-bold cc-text-primary">
                  {completeBasketCount > 0 ? 'Mejores totales para tu lista' : 'Mayor cobertura en una sola tienda'}
                </h2>
              </div>
              <p className="text-xs cc-text-secondary">
                Nunca repartimos tu compra entre supermercados.
              </p>
            </div>

            {/* Si la primera opción no es la más barata, decirlo con el monto:
                priorizamos la que carga el carro sola, y esa decisión tiene que
                estar a la vista para que la persona pueda elegir lo contrario. */}
            {(() => {
              const recomendada = basketOptions[0];
              const barata = cheapestBasket(basketOptions);
              if (!recomendada || !barata || barata.store === recomendada.store) return null;
              const diferencia = recomendada.subtotal - barata.subtotal;
              if (diferencia <= 0) return null;
              // Qué le costaría realmente irse por la barata, según su tienda.
              const costoDeLaBarata: Record<StoreLoadability, string> = {
                direct: 'y su carro también se carga solo',
                offsite: 'pero su carro se arma fuera del sitio de la tienda',
                attempt: 'pero ahí la tienda puede pedirte verificación',
                manual: 'pero ahí tendrías que agregar los productos a mano',
              };
              return (
                <p
                  className="mt-4 rounded-xl px-4 py-3 text-xs leading-5"
                  style={{ background: 'var(--cc-paper-warm)', border: '1px solid var(--cc-line)' }}
                >
                  <strong className="cc-text-primary">{recomendada.store}</strong> aparece primero porque
                  es el único donde el carro se carga solo en el sitio donde compras y pagas.{' '}
                  <strong className="cc-text-primary">{barata.store}</strong> sale {money(diferencia)} más
                  barato, {costoDeLaBarata[storeLoadability(barata.store)]}. Puedes elegir cualquiera.
                </p>
              );
            })()}

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {basketOptions.map((basket, index) => {
                const selected = basket.store === selectedBasket?.store;
                return (
                  <button
                    key={basket.store}
                    type="button"
                    onClick={() => selectBasket(basket)}
                    className="rounded-2xl border p-5 text-left transition hover:-translate-y-0.5"
                    style={{
                      borderColor: selected ? 'var(--cc-copper)' : 'var(--cc-line)',
                      background: selected ? 'var(--cc-paper-warm)' : 'var(--cc-paper)',
                      boxShadow: selected ? '0 10px 30px rgba(73, 49, 36, 0.08)' : undefined,
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold"
                        style={{ background: index === 0 ? 'var(--cc-copper)' : 'var(--cc-paper-warm)', color: index === 0 ? '#fff' : 'var(--cc-ink)' }}
                      >
                        {index + 1}
                      </span>
                      {/* El trofeo solo si esta canasta es además la más barata:
                          ahora el orden lo decide la carga del carro, y premiar
                          con trofeo a una que no es la más económica engaña. */}
                      {index === 0 && basket.complete
                        && basket.store === cheapestBasket(basketOptions)?.store
                        && <Trophy className="h-5 w-5" style={{ color: 'var(--cc-copper)' }} />}
                    </div>
                    <p className="mt-4 text-xl font-bold cc-text-primary">{basket.store}</p>
                    {(() => {
                      const badge = LOADABILITY_BADGE[storeLoadability(basket.store)];
                      return (
                        <span
                          className="mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                          style={{ background: badge.bg, color: badge.fg }}
                        >
                          {badge.label}
                        </span>
                      );
                    })()}
                    <p className="mt-1 text-2xl font-bold cc-text-primary">
                      {basket.quoteStatus === 'retailer' ? money(basket.subtotal) : `Est. ${money(basket.subtotal)}`}
                    </p>
                    <p className="mt-0.5 text-[10px] cc-text-tertiary">
                      {basket.quoteStatus === 'retailer' ? 'Confirmado por la tienda' : 'Estimado del catalogo'}
                    </p>
                    <p className="mt-2 text-sm cc-text-secondary">
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
                      {basket.complete
                        ? LOADABILITY_STATUS[storeLoadability(basket.store)]
                        : `${basket.missingTerms.length} por reemplazar en esta tienda`}
                    </p>
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
                    <Store className="h-5 w-5" style={{ color: 'var(--cc-copper)' }} />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider cc-text-tertiary">Tu elección</p>
                    <h2 className="mt-1 text-2xl font-bold cc-text-primary">{selectedBasket.store}</h2>
                    <p className="mt-1 text-sm cc-text-secondary">
                      {selectedBasket.coveredCount} de {selectedBasket.requestedCount} productos ·{' '}
                      {selectedBasket.quoteStatus === 'retailer' ? 'confirmado ' : 'estimado '}
                      {money(selectedBasket.subtotal)}
                    </p>
                  </div>
                </div>
                <div className="w-full space-y-2 sm:w-80">
                  {selectedBasket.coveredCount > 0 ? (
                    <>
                      {!selectedBasket.complete && (
                        <div className="rounded-xl border p-3" style={{ borderColor: 'var(--cc-amber)', background: 'var(--cc-amber-tint)' }}>
                          <p className="text-sm font-bold cc-text-primary">
                            Cargamos {selectedBasket.coveredCount} de {selectedBasket.requestedCount}; {selectedBasket.missingTerms.length} lo agregas tú
                          </p>
                          <p className="mt-1 text-xs cc-text-secondary">
                            {selectedBasket.store} no tenía: <strong>{selectedBasket.missingTerms.join(', ')}</strong>. Busca ese(esos) en la tienda; el resto va en el carro.
                          </p>
                        </div>
                      )}
                      <CartLoaderButton
                        key={selectedBasket.store}
                        basket={selectedBasket}
                        onQuote={applyCheckoutQuote}
                      />
                    </>
                  ) : (
                    <div className="rounded-xl border p-3" style={{ borderColor: 'var(--cc-amber)', background: 'var(--cc-amber-tint)' }}>
                      <p className="text-sm font-bold cc-text-primary">No encontramos productos de tu lista en {selectedBasket.store}</p>
                      <p className="mt-1 text-xs cc-text-secondary">Prueba otra tienda o revisa cómo escribiste los productos.</p>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          <section className="overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper)' }}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: 'var(--cc-line)' }}>
              <div>
                <h2 className="text-lg font-bold cc-text-primary">Productos seleccionados</h2>
                <p className="text-xs cc-text-secondary">La lista queda contenida aquí, aunque pegues 50, 100 o 200 productos.</p>
              </div>
              <span className="rounded-full px-3 py-1.5 text-xs font-bold cc-text-secondary" style={{ background: 'var(--cc-paper-warm)' }}>
                {list.filter(item => item.available).length} de {list.length}
              </span>
            </div>

            <div className="max-h-[34rem] overflow-auto">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <thead className="sticky top-0 z-10" style={{ background: 'var(--cc-paper-warm)' }}>
                  <tr className="text-xs font-bold uppercase tracking-wider cc-text-tertiary">
                    <th className="px-5 py-3">Pediste</th>
                    <th className="px-5 py-3">Producto elegido</th>
                    <th className="px-5 py-3">Cantidad</th>
                    <th className="px-5 py-3 text-right">Precio</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map(item => (
                    <tr key={`${item.requestedTerm}-${item.id}`} className="border-t" style={{ borderColor: 'var(--cc-line)' }}>
                      <td className="px-5 py-3">
                        <p className="text-sm font-semibold cc-text-primary">{item.requestedTerm}</p>
                      </td>
                      <td className="px-5 py-3">
                        {item.available ? (
                          <>
                            <p className="text-sm font-semibold cc-text-primary">{item.name}</p>
                            <p className="mt-0.5 text-xs cc-text-tertiary">{item.brand || selectedBasket?.store}</p>
                          </>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--cc-amber)' }}>
                            <AlertTriangle className="h-4 w-4" /> Buscando equivalente
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-sm cc-text-secondary">
                        {item.requestedUnit
                          ? `${item.requestedQuantity} ${item.requestedUnit}`
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

          {selectedBasket && (
            <section
              className="flex items-start gap-3 rounded-2xl border p-5"
              style={{
                borderColor: selectedBasket.complete ? 'var(--cc-success-border)' : 'var(--cc-amber)',
                background: selectedBasket.complete ? 'var(--cc-sage-tint)' : 'var(--cc-amber-tint)',
              }}
            >
              {selectedBasket.complete
                ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success-fg" />
                : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'var(--cc-amber)' }} />}
              <div>
                <p className="font-bold cc-text-primary">
                  {selectedBasket.complete
                    ? LOADABILITY_HEADLINE[storeLoadability(selectedBasket.store)](selectedBasket.store)
                    : `Faltan ${selectedBasket.missingTerms.length} productos en ${selectedBasket.store}`}
                </p>
                <p className="mt-1 text-sm cc-text-secondary">
                  {selectedBasket.complete
                    ? storeLoadability(selectedBasket.store) === 'manual'
                      ? 'El precio es una referencia. Esta tienda no permite que Convive cargue el carro automáticamente.'
                      : storeLoadability(selectedBasket.store) === 'offsite'
                        ? 'Los productos se cargan en el sistema de checkout de la cadena, no en su sitio web: tu carro en el sitio de la tienda seguirá vacío.'
                        : selectedBasket.quoteStatus === 'retailer'
                        ? 'La tienda confirmo cada producto disponible y el total actual antes de abrir el checkout.'
                        : 'Es un estimado del catalogo. Convive lo validará al abrir el carro oficial.'
                    : 'El subtotal no se compara como si fuera una compra completa. CoCo mantiene la búsqueda dentro de esta misma cadena.'}
                </p>
              </div>
            </section>
          )}
        </>
      )}

      {basketOptions.length === 0 && !loading && (
        <section className="rounded-2xl border px-6 py-12 text-center" style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper)' }}>
          <ShoppingCart className="mx-auto h-10 w-10 cc-text-disabled" />
          <p className="mt-3 font-bold cc-text-secondary">Pega tu lista para comparar compras completas.</p>
          <p className="mt-1 text-sm cc-text-tertiary">No mostraremos una mezcla de supermercados como si fuera una sola canasta.</p>
        </section>
      )}
    </div>
  );
}
