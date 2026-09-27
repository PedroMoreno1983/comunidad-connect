'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, ChevronLeft, ExternalLink, Loader2, Search, ShoppingCart, Trash2 } from 'lucide-react';
import { RemoteCartButton } from '@/components/resident/supermarket/RemoteCartButton';
import { SupermarketProductThumbnail } from '@/components/resident/supermarket/SupermarketProductThumbnail';
import { SupermarketCatalogService } from '@/lib/api';
import { SUPERMARKET_STORES } from '@/lib/supermarketBasket';
import type {
  SupermarketBasketCandidate,
  SupermarketCatalogProduct,
  SupermarketSearchCandidate,
  SupermarketSearchResponse,
  SupermarketSelectedProduct,
} from '@/lib/types';

const STORE_COLORS: Record<string, string> = {
  Jumbo: '#2e7d32',
  'Santa Isabel': '#c62828',
  Lider: '#1476d4',
  Unimarc: '#d71920',
  aCuenta: '#f28c00',
};

function money(value: number) {
  return `$${Math.round(value).toLocaleString('es-CL')}`;
}

function freshness(value?: string) {
  if (!value) return 'Fecha no disponible';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Fecha no disponible' : `Actualizado ${new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' }).format(date)}`;
}

function cartCandidate(product: SupermarketSelectedProduct): SupermarketSearchCandidate {
  return {
    ...product,
    requestedQuantity: product.quantity,
    packUnits: 1,
    suppliedQuantity: product.quantity,
    lineTotal: product.price * product.quantity,
  };
}

function validForCart(store: string, product: { sku?: string; offerId?: string; productUrl?: string }) {
  return store === 'Lider'
    ? Boolean(product.sku && product.offerId)
    : Boolean(product.sku || product.productUrl);
}

export default function SupermarketPage() {
  const [primaryStore, setPrimaryStore] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [products, setProducts] = useState<SupermarketCatalogProduct[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [cart, setCart] = useState<SupermarketSelectedProduct[]>([]);
  const [comparisonStores, setComparisonStores] = useState<string[]>([]);
  const [comparison, setComparison] = useState<SupermarketSearchResponse | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState('');
  const [checkoutStore, setCheckoutStore] = useState<string | null>(null);
  const [chosenAlternatives, setChosenAlternatives] = useState<Record<string, SupermarketSearchCandidate>>({});
  const compareRequest = useRef<AbortController | null>(null);

  const clearComparison = () => {
    compareRequest.current?.abort();
    compareRequest.current = null;
    setComparisonLoading(false);
    setComparison(null);
  };

  useEffect(() => {
    if (!primaryStore) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setCatalogLoading(true);
      setCatalogError('');
      try {
        const data = await SupermarketCatalogService.search(primaryStore, query, page, controller.signal);
        if (controller.signal.aborted) return;
        setProducts(current => page === 0 ? data.products : [...current, ...data.products]);
        setHasMore(data.hasMore);
      } catch (error) {
        if (!controller.signal.aborted) setCatalogError(error instanceof Error ? error.message : 'No se pudo cargar el catálogo.');
      } finally {
        if (!controller.signal.aborted) setCatalogLoading(false);
      }
    }, query ? 260 : 0);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [primaryStore, query, page]);

  const cartTotal = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart]);
  const otherStores = SUPERMARKET_STORES.filter(store => store !== primaryStore);
  const activeStore = checkoutStore ?? primaryStore;
  const selectedComparison = comparison?.basketOptions?.find(basket => basket.store === activeStore);
  const comparisonItems = useMemo(() => {
    if (!selectedComparison || activeStore === primaryStore) return [];
    return cart.flatMap(selected => {
      const key = `${activeStore}:${selected.requestedTerm}`;
      const choice = chosenAlternatives[key]
        ?? selectedComparison.items.find(item => item.requestedTerm === selected.requestedTerm);
      return choice ? [choice] : [];
    });
  }, [activeStore, cart, chosenAlternatives, primaryStore, selectedComparison]);
  const checkoutItems = activeStore === primaryStore ? cart.map(cartCandidate) : comparisonItems;
  const missingTerms = activeStore === primaryStore ? [] : cart
    .filter(selected => !comparisonItems.some(item => item.requestedTerm === selected.requestedTerm))
    .map(item => item.requestedTerm);
  const checkoutReady = cart.length > 0 && missingTerms.length === 0
    && checkoutItems.length === cart.length
    && checkoutItems.every(item => validForCart(activeStore ?? '', item));
  const activeTotal = checkoutItems.reduce((sum, item) => sum + item.lineTotal, 0);

  const changeStore = (store: string) => {
    setPrimaryStore(store);
    setCheckoutStore(store);
    setCart([]);
    setQuery('');
    setProducts([]);
    setCatalogLoading(true);
    setPage(0);
    clearComparison();
    setComparisonStores([]);
    setChosenAlternatives({});
  };

  const changeQuery = (value: string) => {
    setQuery(value);
    setPage(0);
    setProducts([]);
    setCatalogLoading(true);
  };

  const addProduct = (product: SupermarketCatalogProduct) => {
    if (!primaryStore) return;
    const requestedTerm = query.trim() || product.name;
    setCart(current => {
      const exists = current.find(item => item.id === product.id);
      const comparisonTerm = current.some(item => item.requestedTerm === requestedTerm)
        ? product.name
        : requestedTerm;
      return exists
        ? current.map(item => item.id === product.id ? { ...item, quantity: Math.min(99, item.quantity + 1) } : item)
        : [...current, { ...product, quantity: 1, requestedTerm: comparisonTerm }];
    });
    clearComparison();
    setCheckoutStore(primaryStore);
  };

  const changeQuantity = (id: string, difference: number) => {
    setCart(current => current.flatMap(item => {
      if (item.id !== id) return [item];
      const quantity = Math.min(99, item.quantity + difference);
      return quantity > 0 ? [{ ...item, quantity }] : [];
    }));
    clearComparison();
    setCheckoutStore(primaryStore);
  };

  const compare = async () => {
    if (!cart.length || !comparisonStores.length) return;
    compareRequest.current?.abort();
    const controller = new AbortController();
    compareRequest.current = controller;
    setComparisonLoading(true);
    setComparisonError('');
    try {
      const data = await SupermarketCatalogService.compare(
        cart.map(item => `${item.quantity} ${item.requestedTerm}`).join('\n'),
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setComparison(data);
      setChosenAlternatives({});
    } catch (error) {
      if (!controller.signal.aborted) setComparisonError(error instanceof Error ? error.message : 'No se pudo comparar la compra.');
    } finally {
      if (!controller.signal.aborted) setComparisonLoading(false);
    }
  };

  const comparisonBasket = (store: string): SupermarketBasketCandidate | undefined => comparison?.basketOptions?.find(item => item.store === store);

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 pb-20 sm:px-0">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--cc-copper)' }}>Supermercado</p>
        <h1 className="mt-2 text-3xl font-bold cc-text-primary">Compra en tu supermercado</h1>
        <p className="mt-2 max-w-3xl text-sm cc-text-secondary">Elige la tienda, arma tu carro con productos y precios de su catálogo y, si quieres, compáralo antes de ir a comprar.</p>
      </header>

      <section className="rounded-2xl border p-5" style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper)' }}>
        <h2 className="text-lg font-bold cc-text-primary">1. Elige tu supermercado</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {SUPERMARKET_STORES.map(store => (
            <button key={store} type="button" onClick={() => changeStore(store)}
              aria-pressed={primaryStore === store}
              className="flex min-h-20 items-center justify-between rounded-xl border p-4 text-left font-bold cc-text-primary hover:shadow-sm"
              style={{ borderColor: primaryStore === store ? STORE_COLORS[store] : 'var(--cc-line)', background: primaryStore === store ? 'var(--cc-paper-warm)' : 'var(--cc-paper)' }}>
              <span>{store}</span>{primaryStore === store ? <Check className="h-5 w-5" style={{ color: STORE_COLORS[store] }} /> : null}
            </button>
          ))}
        </div>
        {cart.length > 0 ? <p className="mt-3 text-xs cc-text-tertiary">Al cambiar de supermercado se inicia una compra nueva.</p> : null}
      </section>

      {primaryStore ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <section className="min-w-0 rounded-2xl border p-5" style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper)' }}>
            <h2 className="text-lg font-bold cc-text-primary">2. Busca productos en {primaryStore}</h2>
            <label className="mt-4 flex items-center gap-2 rounded-xl border px-3" style={{ borderColor: 'var(--cc-line)' }}>
              <Search className="h-5 w-5 cc-text-tertiary" />
              <input type="search" value={query} onChange={event => changeQuery(event.target.value)}
                placeholder="Busca pan pita, leche, arroz…" aria-label={`Buscar productos en ${primaryStore}`}
                className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none cc-text-primary" />
            </label>
            {catalogError ? <p role="alert" className="mt-4 text-sm text-red-700">{catalogError}</p> : null}
            {catalogLoading && products.length === 0 ? <p className="mt-6 flex items-center gap-2 text-sm cc-text-secondary"><Loader2 className="h-4 w-4 animate-spin" /> Cargando productos…</p> : null}
            {!catalogLoading && !catalogError && products.length === 0 ? <p className="mt-6 text-sm cc-text-secondary">No encontramos productos vigentes para esta búsqueda. Prueba otro nombre.</p> : null}
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {products.map(product => (
                <article key={product.id} className="flex min-h-56 flex-col rounded-xl border p-4" style={{ borderColor: 'var(--cc-line)' }}>
                  <div className="flex gap-3">
                    <SupermarketProductThumbnail imageUrl={product.imageUrl} alt={product.name} />
                    <div className="min-w-0">
                      <p className="line-clamp-3 text-sm font-semibold cc-text-primary">{product.name}</p>
                      <p className="mt-1 text-xs cc-text-tertiary">{product.brand || primaryStore}</p>
                    </div>
                  </div>
                  <div className="mt-auto flex items-end justify-between gap-2 pt-4">
                    <div><p className="text-lg font-bold cc-text-primary">{money(product.price)}</p><p className="text-[10px] cc-text-tertiary">{freshness(product.fetchedAt)}</p></div>
                    <button type="button" onClick={() => addProduct(product)}
                      disabled={!validForCart(primaryStore, product)}
                      title={!validForCart(primaryStore, product) ? 'Esta ficha no tiene un código de carro verificable.' : undefined}
                      className="rounded-lg px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50" style={{ background: 'var(--cc-copper)' }}>
                      {validForCart(primaryStore, product) ? 'Agregar' : 'Sin enlace de carro'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
            {hasMore ? <button type="button" disabled={catalogLoading} onClick={() => setPage(value => value + 1)} className="mt-5 rounded-xl border px-4 py-2 text-sm font-semibold cc-text-primary disabled:opacity-50" style={{ borderColor: 'var(--cc-line)' }}>{catalogLoading ? 'Cargando…' : 'Ver más productos'}</button> : null}
          </section>

          <aside className="self-start rounded-2xl border p-5 lg:sticky lg:top-5" style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper)' }}>
            <h2 className="flex items-center gap-2 text-lg font-bold cc-text-primary"><ShoppingCart className="h-5 w-5" /> Tu carro en {primaryStore}</h2>
            {cart.length === 0 ? <p className="mt-4 text-sm cc-text-secondary">Agrega productos del catálogo para preparar tu compra.</p> : (
              <>
                <ul className="mt-4 space-y-3">
                  {cart.map(item => (
                    <li key={item.id} className="border-b pb-3" style={{ borderColor: 'var(--cc-line)' }}>
                      <p className="text-xs font-semibold cc-text-primary">{item.name}</p>
                      <p className="mt-1 text-xs cc-text-secondary">{money(item.price)} cada uno</p>
                      <div className="mt-2 flex items-center gap-2">
                        <button type="button" onClick={() => changeQuantity(item.id, -1)} aria-label={`Disminuir ${item.name}`} className="rounded border px-2 cc-text-primary">−</button>
                        <span className="min-w-5 text-center text-sm cc-text-primary">{item.quantity}</span>
                        <button type="button" onClick={() => changeQuantity(item.id, 1)} aria-label={`Aumentar ${item.name}`} className="rounded border px-2 cc-text-primary">+</button>
                        <button type="button" onClick={() => changeQuantity(item.id, -item.quantity)} aria-label={`Quitar ${item.name}`} className="ml-auto cc-text-tertiary"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 flex justify-between text-sm font-bold cc-text-primary"><span>Subtotal estimado</span><span>{money(cartTotal)}</span></p>
                <p className="mt-1 text-xs cc-text-tertiary">El precio final y el despacho se confirman en {primaryStore}.</p>
              </>
            )}
          </aside>
        </div>
      ) : null}

      {primaryStore && cart.length > 0 ? (
        <section className="rounded-2xl border p-5" style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper)' }}>
          <h2 className="text-lg font-bold cc-text-primary">3. ¿Quieres comparar antes de comprar?</h2>
          <p className="mt-1 text-sm cc-text-secondary">Elige las cadenas que te interesan. Tu carro original en {primaryStore} conserva las marcas que seleccionaste.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {otherStores.map(store => (
              <label key={store} className="flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm cc-text-primary" style={{ borderColor: 'var(--cc-line)' }}>
                <input type="checkbox" checked={comparisonStores.includes(store)} onChange={event => {
                  setComparisonStores(current => event.target.checked ? [...current, store] : current.filter(value => value !== store));
                  clearComparison();
                  setCheckoutStore(primaryStore);
                }} />{store}
              </label>
            ))}
          </div>
          <button type="button" disabled={comparisonLoading || comparisonStores.length === 0} onClick={() => void compare()}
            className="mt-4 rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50" style={{ background: 'var(--cc-copper)' }}>
            {comparisonLoading ? 'Comparando…' : 'Comparar mi carro'}
          </button>
          {comparisonError ? <p role="alert" className="mt-3 text-sm text-red-700">{comparisonError}</p> : null}
          {comparison ? (
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-xl border p-4" style={{ borderColor: activeStore === primaryStore ? STORE_COLORS[primaryStore] : 'var(--cc-line)' }}>
                <p className="font-bold cc-text-primary">{primaryStore} · tus productos</p>
                <p className="mt-1 text-sm cc-text-secondary">{cart.length} de {cart.length} · {money(cartTotal)}</p>
                <button type="button" onClick={() => setCheckoutStore(primaryStore)} className="mt-3 text-xs font-bold underline cc-text-primary">{activeStore === primaryStore ? 'Tienda elegida' : 'Comprar aquí'}</button>
              </div>
              {comparisonStores.map(store => {
                const basket = comparisonBasket(store);
                return (
                  <div key={store} className="rounded-xl border p-4" style={{ borderColor: activeStore === store ? STORE_COLORS[store] : 'var(--cc-line)' }}>
                    <p className="font-bold cc-text-primary">{store}</p>
                    <p className="mt-1 text-sm cc-text-secondary">{basket ? `${basket.coveredCount} de ${cart.length} · ${basket.complete ? money(basket.subtotal) : 'Subtotal parcial'}` : 'Sin resultados vigentes'}</p>
                    {basket && !basket.complete ? <p className="mt-1 text-xs text-amber-700">Faltan: {basket.missingTerms.join(', ') || 'productos sin código de carro'}</p> : null}
                    {basket?.items.length ? <button type="button" onClick={() => setCheckoutStore(store)} className="mt-3 text-xs font-bold underline cc-text-primary">{activeStore === store ? 'Tienda elegida' : 'Revisar productos'}</button> : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </section>
      ) : null}

      {primaryStore && cart.length > 0 ? (
        <section className="rounded-2xl border p-5" style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper)' }}>
          <h2 className="text-lg font-bold cc-text-primary">4. Revisa y abre el carro en {activeStore}</h2>
          {activeStore !== primaryStore ? <button type="button" onClick={() => setCheckoutStore(primaryStore)} className="mt-2 inline-flex items-center gap-1 text-xs underline cc-text-secondary"><ChevronLeft className="h-3.5 w-3.5" /> Volver a mis productos de {primaryStore}</button> : null}
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cart.map(selected => {
              const item = checkoutItems.find(candidate => candidate.requestedTerm === selected.requestedTerm);
              const alternatives = activeStore === primaryStore ? [] : (comparison?.alternativesByTerm?.[selected.requestedTerm] ?? [])
                .filter(candidate => candidate.store === activeStore && validForCart(activeStore ?? '', candidate));
              return (
                <article key={selected.id} className="rounded-xl border p-3" style={{ borderColor: item ? 'var(--cc-line)' : 'var(--cc-amber)' }}>
                  <div className="flex gap-3"><SupermarketProductThumbnail imageUrl={item?.imageUrl} alt={item?.name ?? selected.requestedTerm} size="compact" />
                    <div className="min-w-0"><p className="text-xs cc-text-tertiary">Buscaste {selected.requestedTerm}</p><p className="mt-1 text-sm font-semibold cc-text-primary">{item?.name ?? 'No encontrado en esta tienda'}</p></div>
                  </div>
                  {item ? <p className="mt-3 text-sm font-bold cc-text-primary">{item.quantity} × {money(item.price)} = {money(item.lineTotal)}</p> : null}
                  {alternatives.length > 0 ? <label className="mt-3 block text-xs cc-text-secondary">Cambiar marca o presentación
                    <select value={item?.id ?? ''} onChange={event => {
                      const choice = alternatives.find(candidate => candidate.id === event.target.value);
                      if (choice) setChosenAlternatives(current => ({ ...current, [`${activeStore}:${selected.requestedTerm}`]: choice }));
                    }} className="mt-1 w-full rounded-lg border p-2 text-xs cc-text-primary" style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper)' }}>
                      {!item ? <option value="">Elige un producto</option> : null}
                      {item && !alternatives.some(candidate => candidate.id === item.id) ? <option value={item.id}>{item.name}</option> : null}
                      {alternatives.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name} · {money(candidate.lineTotal)}</option>)}
                    </select>
                  </label> : null}
                </article>
              );
            })}
          </div>
          <p className="mt-4 text-lg font-bold cc-text-primary">Subtotal estimado: {money(activeTotal)}</p>
          {!checkoutReady ? <p className="mt-2 flex items-start gap-2 text-sm text-amber-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Esta tienda tiene productos faltantes o sin identificador de carro. Revisa las alternativas o vuelve a {primaryStore}.</p> : null}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {checkoutReady && activeStore ? <RemoteCartButton store={activeStore} items={checkoutItems} complete /> : null}
            {activeStore ? <a href={{ Jumbo: 'https://www.jumbo.cl', 'Santa Isabel': 'https://www.santaisabel.cl', Lider: 'https://super.lider.cl', Unimarc: 'https://www.unimarc.cl', aCuenta: 'https://www.acuenta.cl' }[activeStore]}
              target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs underline cc-text-secondary"><ExternalLink className="h-3.5 w-3.5" /> Abrir sitio de {activeStore}</a> : null}
          </div>
          <p className="mt-3 text-xs cc-text-tertiary">Confirma productos, cantidades, disponibilidad, despacho y precio final en el supermercado antes de pagar.</p>
        </section>
      ) : null}

      <p className="text-xs cc-text-tertiary">¿Prefieres pegar una lista completa? <Link href="/resident/supermercado/comparador" className="underline">Abrir comparador de listas</Link>.</p>
    </main>
  );
}
