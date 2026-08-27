'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Download,
  ExternalLink,
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
import { storeSearchUrl } from '@/lib/supermarketText';
import { storeLoadability, loadabilityRank, type StoreLoadability } from '@/lib/supermarket/cartUrl';
import { MAX_SHOPPING_LIST_CHARS, MAX_SHOPPING_LIST_ITEMS } from '@/lib/supermarketGroupDomain';
import type {
  SupermarketBasketCandidate,
  SupermarketRequestedItem,
  SupermarketSearchResponse,
  SupermarketShoppingItem,
} from '@/lib/types';

const LIST_SUGGESTIONS = [
  { title: 'Compra semanal', items: ['Pechuga de pollo', 'Arroz', 'Paltas', 'Huevos', 'Leche', 'Pan molde'] },
  { title: 'Asado', items: ['Carne', 'Longanizas', 'Cebollas', 'Papas', 'Tomates', 'Bebidas'] },
  { title: 'Desayunos', items: ['Avena', 'Leche', 'Yogur', 'Plátanos', 'Huevos', 'Pan'] },
];

function money(value: number) {
  return `$${Math.round(value).toLocaleString('es-CL')}`;
}

const LOADABILITY_BADGE: Record<StoreLoadability, { label: string; bg: string; fg: string }> = {
  direct: { label: 'Carga automática', bg: 'var(--cc-sage-tint)', fg: 'var(--cc-sage)' },
  offsite: { label: 'Carga directa*', bg: 'var(--cc-amber-tint)', fg: 'var(--cc-amber)' },
  manual: { label: 'Requiere un paso extra', bg: 'var(--cc-paper-warm)', fg: 'var(--cc-ink-tertiary)' },
};

/**
 * Ordena priorizando las tiendas donde la carga del carro SÍ funciona (rank 0-1:
 * enlace/carro directo) por sobre las manuales (rank 2: Tottus/aCuenta), aunque
 * estas sean más baratas — a pedido: que lo que se puede cargar salga primero.
 * Dentro de cada grupo: más cobertura, luego mejor precio.
 */
function orderBaskets(baskets: SupermarketBasketCandidate[]): SupermarketBasketCandidate[] {
  const worksGroup = (store: string) => (loadabilityRank(store) <= 1 ? 0 : 1);
  return [...baskets].sort((a, b) => {
    const ga = worksGroup(a.store);
    const gb = worksGroup(b.store);
    if (ga !== gb) return ga - gb; // primero las que cargan
    if (a.complete !== b.complete) return a.complete ? -1 : 1;
    if (a.coveredCount !== b.coveredCount) return b.coveredCount - a.coveredCount;
    // leve desempate fino: 'verified' sobre 'attempt' a precio parecido
    const sa = a.subtotal * (1 + loadabilityRank(a.store) * 0.01);
    const sb = b.subtotal * (1 + loadabilityRank(b.store) * 0.01);
    return sa - sb;
  });
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
  const [selectedStore, setSelectedStore] = useState<string | null>(null);
  const [compared, setCompared] = useState(false);
  // Si el Cargador de Convive (extensión) está activo, todas las tiendas
  // cargan con un click y el badge debe reflejarlo.
  const [cartLoaderReady, setCartLoaderReady] = useState(false);
  // Flujo: el usuario elige tienda y el carro se carga solo en el supermercado;
  // cada selección explícita incrementa esta llave y gatilla la carga.
  const [autoLoadKey, setAutoLoadKey] = useState(0);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== window || event.data?.source !== 'convive-cart-loader') return;
      if (event.data.type === 'CONVIVE_CART_LOADER_READY') setCartLoaderReady(true);
    };
    window.addEventListener('message', handleMessage);
    window.postMessage({ source: 'convive-connect', type: 'CONVIVE_CART_LOADER_PING' }, '*');
    return () => window.removeEventListener('message', handleMessage);
  }, []);

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
    const byTerm = new Map(basket.items.map(item => [item.requestedTerm, item]));
    setSelectedStore(basket.store);
    // Elegir la tienda ES la orden de cargar: el carro se prepara de inmediato
    // en el supermercado elegido y la persona solo revisa, acepta y paga.
    setAutoLoadKey(key => key + 1);
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
      // Se reordena con desempate por cargabilidad: a precios parecidos, primero
      // la tienda más fácil de cargar. La selección por defecto sigue ese orden.
      const nextOptions = orderBaskets(data.basketOptions ?? []);
      setRequestedItems(nextRequested);
      setBasketOptions(nextOptions);
      setCompared(true);
      setSelectedStore(nextOptions[0]?.store ?? data.recommendedStore ?? null);
      setList(data.items);

      toast({
        title: nextOptions.some(basket => basket.complete)
          ? 'Comparación completa'
          : 'Comparación con faltantes',
        description: data.message,
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
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--cc-copper)' }}>
            Supermercado
          </p>
          <h1 className="mt-2 text-3xl font-bold cc-text-primary">Una lista. Un supermercado. Un solo total.</h1>
          <p className="mt-2 max-w-3xl text-sm cc-text-secondary">
            CoCo busca toda tu compra dentro de cada cadena, compara las canastas completas y te muestra primero
            la más barata, luego la segunda y la tercera.
          </p>
        </div>
        <a
          href="/downloads/convive-cart-loader.zip"
          download="convive-cart-loader.zip"
          className="self-start sm:self-auto shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-subtle bg-surface text-xs font-semibold cc-text-primary hover:bg-subtle/50 transition-colors shadow-xs"
        >
          <Download className="h-4 w-4 text-[var(--cc-copper)]" />
          <span>Descargar Extensión Chrome (ZIP)</span>
        </a>
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
                      {index === 0 && basket.complete && <Trophy className="h-5 w-5" style={{ color: 'var(--cc-copper)' }} />}
                    </div>
                    <p className="mt-4 text-xl font-bold cc-text-primary">{basket.store}</p>
                    {(() => {
                      const badge = cartLoaderReady
                        ? LOADABILITY_BADGE.direct
                        : LOADABILITY_BADGE[storeLoadability(basket.store)];
                      return (
                        <span
                          className="mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                          style={{ background: badge.bg, color: badge.fg }}
                        >
                          {badge.label}
                        </span>
                      );
                    })()}
                    <p className="mt-1 text-2xl font-bold cc-text-primary">{money(basket.subtotal)}</p>
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
                      {basket.complete ? 'Canasta completa' : `${basket.missingTerms.length} por reemplazar en esta tienda`}
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
                      {selectedBasket.coveredCount} de {selectedBasket.requestedCount} productos · {money(selectedBasket.subtotal)}
                    </p>
                  </div>
                </div>
                <div className="w-full space-y-2 sm:w-80">
                  {selectedBasket.complete ? (
                    <CartLoaderButton basket={selectedBasket} autoLoadKey={autoLoadKey} />
                  ) : selectedBasket.coveredCount > 0 ? (
                    <>
                      {/* Antes esto bloqueaba toda la carga por 1 producto sin resolver.
                          Ahora se puede cargar lo encontrado y agregar el resto a mano. */}
                      {/*
                          Que falte un producto pasa en todas las tiendas. Antes se
                          nombraba el faltante y nada mas, asi que la persona quedaba
                          sin saber que hacer. Ahora cada faltante trae las dos salidas
                          reales: buscarlo en esta tienda, o cambiarse a una que si lo
                          tiene (que es el dato mas util y el que nadie estaba dando).
                      */}
                      <div className="rounded-xl border p-3" style={{ borderColor: 'var(--cc-amber)', background: 'var(--cc-amber-tint)' }}>
                        <p className="text-sm font-bold cc-text-primary">
                          Cargamos {selectedBasket.coveredCount} de {selectedBasket.requestedCount}; {selectedBasket.missingTerms.length} lo agregas tú
                        </p>
                        <ul className="mt-2 space-y-2">
                          {selectedBasket.missingTerms.map((term) => {
                            const search = storeSearchUrl(selectedBasket.store, term);
                            const alternativas = basketOptions.filter(
                              (option) => option.store !== selectedBasket.store && !option.missingTerms.includes(term),
                            );
                            return (
                              <li key={term} className="text-xs cc-text-secondary">
                                <strong className="cc-text-primary">{term}</strong>
                                {search && (
                                  <>
                                    {' · '}
                                    <a href={search} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                                      buscarlo en {selectedBasket.store}
                                    </a>
                                  </>
                                )}
                                {alternativas.length > 0 && (
                                  <>
                                    {' · sí está en '}
                                    {alternativas.map((option, index) => (
                                      <span key={option.store}>
                                        {index > 0 && ', '}
                                        <button
                                          type="button"
                                          onClick={() => selectBasket(option)}
                                          className="font-semibold underline"
                                        >
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
                      <CartLoaderButton basket={selectedBasket} autoLoadKey={autoLoadKey} />
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
                            {item.productUrl ? (
                              <a
                                href={item.productUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group inline-flex items-center gap-1.5 text-sm font-semibold cc-text-primary hover:text-[var(--cc-copper)] transition-colors"
                              >
                                <span>{item.name}</span>
                                <ExternalLink className="h-3.5 w-3.5 opacity-60 group-hover:opacity-100" />
                              </a>
                            ) : (
                              <p className="text-sm font-semibold cc-text-primary">{item.name}</p>
                            )}
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
                    ? `Canasta completa en ${selectedBasket.store}`
                    : `Faltan ${selectedBasket.missingTerms.length} productos en ${selectedBasket.store}`}
                </p>
                <p className="mt-1 text-sm cc-text-secondary">
                  {selectedBasket.complete
                    ? 'El total incluye todos los productos y cantidades de tu lista.'
                    : 'El subtotal no se compara como si fuera una compra completa. CoCo mantiene la búsqueda dentro de esta misma cadena.'}
                </p>
              </div>
            </section>
          )}
        </>
      )}

      {basketOptions.length === 0 && !loading && compared && (
        <section className="rounded-2xl border px-6 py-12 text-center" style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper)' }}>
          <AlertTriangle className="mx-auto h-10 w-10" style={{ color: 'var(--cc-amber)' }} />
          <p className="mt-3 font-bold cc-text-secondary">Ningún supermercado devolvió productos para esta lista.</p>
          <p className="mt-1 text-sm cc-text-tertiary">
            No es un fallo de una sola tienda: el catálogo compartido no encontró coincidencias vigentes.
            Prueba con nombres más simples (por ejemplo “leche”, “arroz”) o vuelve a intentar en unos minutos.
          </p>
        </section>
      )}

      {basketOptions.length === 0 && !loading && !compared && (
        <section className="rounded-2xl border px-6 py-12 text-center" style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper)' }}>
          <ShoppingCart className="mx-auto h-10 w-10 cc-text-disabled" />
          <p className="mt-3 font-bold cc-text-secondary">Pega tu lista para comparar compras completas.</p>
          <p className="mt-1 text-sm cc-text-tertiary">No mostraremos una mezcla de supermercados como si fuera una sola canasta.</p>
        </section>
      )}
    </div>
  );
}
