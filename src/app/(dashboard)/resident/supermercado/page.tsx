'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, ChevronLeft, ExternalLink, Loader2, Search, ShoppingCart, Trash2, Upload } from 'lucide-react';
import { RemoteCartButton } from '@/components/resident/supermarket/RemoteCartButton';
import { SupermarketProductThumbnail } from '@/components/resident/supermarket/SupermarketProductThumbnail';
import { SupermarketCatalogService } from '@/lib/api';
import { SUPERMARKET_STORES } from '@/lib/supermarketBasket';
import { comparableProduct, comparisonTerm } from '@/lib/supermarketEquivalence';
import { MAX_SHOPPING_LIST_CHARS, MAX_SHOPPING_LIST_ITEMS, parseGroupShoppingList } from '@/lib/supermarketGroupDomain';
import type {
  SavedShoppingList,
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

const STORE_SITES: Record<string, string> = {
  Jumbo: 'https://www.jumbo.cl',
  'Santa Isabel': 'https://www.santaisabel.cl',
  Lider: 'https://super.lider.cl',
  Unimarc: 'https://www.unimarc.cl',
  aCuenta: 'https://www.acuenta.cl',
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

function listWhen(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', timeZone: 'America/Santiago' }).format(date);
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
  const [listInput, setListInput] = useState('');
  const [savedLists, setSavedLists] = useState<SavedShoppingList[]>([]);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [saveNote, setSaveNote] = useState('');
  const savedSnapshot = useRef('');
  const activeListIdRef = useRef<string | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [unresolved, setUnresolved] = useState<string[]>([]);
  const listRequest = useRef<AbortController | null>(null);
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
  const hasDuplicateTerms = new Set(cart.map(item => item.requestedTerm)).size !== cart.length;
  const otherStores = SUPERMARKET_STORES.filter(store => store !== primaryStore);
  const activeStore = checkoutStore ?? primaryStore;
  const selectedComparison = comparison?.basketOptions?.find(basket => basket.store === activeStore);
  const comparableAlternatives = (selected: SupermarketSelectedProduct, store: string) =>
    (comparison?.alternativesByTerm?.[selected.requestedTerm] ?? [])
      .filter(candidate => candidate.store === store && validForCart(store, candidate) && comparableProduct(selected, candidate))
      .sort((a, b) => Number(comparableProduct(selected, b) === 'same_brand') - Number(comparableProduct(selected, a) === 'same_brand')
        || a.lineTotal - b.lineTotal);
  const comparisonItems = useMemo(() => {
    if (!selectedComparison || activeStore === primaryStore) return [];
    return cart.flatMap(selected => {
      const key = `${activeStore}:${selected.requestedTerm}`;
      const options = comparableAlternatives(selected, activeStore ?? '');
      const choice = options.find(item => item.id === chosenAlternatives[key]?.id) ?? options[0];
      return choice ? [choice] : [];
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStore, cart, chosenAlternatives, primaryStore, selectedComparison, comparison]);
  const checkoutItems = activeStore === primaryStore ? cart.map(cartCandidate) : comparisonItems;
  const missingTerms = activeStore === primaryStore ? [] : cart
    .filter(selected => !comparisonItems.some(item => item.requestedTerm === selected.requestedTerm))
    .map(item => item.requestedTerm);
  const basketComplete = !listLoading && cart.length > 0 && unresolved.length === 0 && missingTerms.length === 0
    && checkoutItems.length === cart.length
    && checkoutItems.every(item => validForCart(activeStore ?? '', item));
  const transferableItems = checkoutItems.filter(item => validForCart(activeStore ?? '', item));
  const activeTotal = checkoutItems.reduce((sum, item) => sum + item.lineTotal, 0);

  const changeStore = (store: string) => {
    if (store === primaryStore) return;
    setPrimaryStore(store);
    setCheckoutStore(store);
    setCart([]);
    listRequest.current?.abort();
    setListLoading(false);
    setUnresolved([]);
    setListError('');
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
    const requestedTerm = comparisonTerm(product);
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
    if (query.trim()) setUnresolved(current => current.filter(term => term !== parseGroupShoppingList(query.trim(), true)[0]?.term));
    setCheckoutStore(primaryStore);
  };

  useEffect(() => { activeListIdRef.current = activeListId; }, [activeListId]);

  useEffect(() => {
    let cancelled = false;
    void SupermarketCatalogService.savedLists()
      .then(lists => { if (!cancelled) setSavedLists(lists); })
      .catch(() => { if (!cancelled) setSaveNote('No se pudieron leer tus listas guardadas.'); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!primaryStore || parseGroupShoppingList(listInput, true).length === 0) return;
    const snapshot = `${activeListId ?? ''}|${primaryStore}|${listInput}`;
    if (snapshot === savedSnapshot.current) return;
    const timer = window.setTimeout(() => {
      void SupermarketCatalogService.saveList({ id: activeListId, body: listInput, store: primaryStore })
        .then(list => {
          savedSnapshot.current = `${list.id}|${primaryStore}|${listInput}`;
          setActiveListId(list.id);
          setSavedLists(current => [list, ...current.filter(item => item.id !== list.id)].slice(0, 30));
          setSaveNote('');
        })
        .catch(() => setSaveNote('No se pudo guardar la lista.'));
    }, 800);
    return () => window.clearTimeout(timer);
  }, [activeListId, listInput, primaryStore]);

  useEffect(() => {
    const persistNow = () => {
      if (!primaryStore || parseGroupShoppingList(listInput, true).length === 0) return;
      const snapshot = `${activeListIdRef.current ?? ''}|${primaryStore}|${listInput}`;
      if (snapshot === savedSnapshot.current) return;
      void SupermarketCatalogService.saveList({ id: activeListIdRef.current, body: listInput, store: primaryStore }, true);
    };
    window.addEventListener('pagehide', persistNow);
    return () => window.removeEventListener('pagehide', persistNow);
  }, [listInput, primaryStore]);

  const loadList = async (value: string, storeName = primaryStore) => {
    if (!storeName) return;
    const input = value.trim();
    if (!input || input.length > MAX_SHOPPING_LIST_CHARS) {
      setListError(`La lista admite hasta ${MAX_SHOPPING_LIST_CHARS.toLocaleString('es-CL')} caracteres.`);
      return;
    }
    const requested = parseGroupShoppingList(input, true);
    if (!requested.length || requested.length > MAX_SHOPPING_LIST_ITEMS) {
      setListError('No encontramos productos legibles en la lista.');
      return;
    }
    listRequest.current?.abort();
    const controller = new AbortController();
    listRequest.current = controller;
    setListLoading(true);
    setListError('');
    setUnresolved([]);
    setCart([]);
    clearComparison();
    setCheckoutStore(storeName);
    const found = new Map<string, SupermarketSelectedProduct>();
    const missing: string[] = [];
    const processed = new Set<string>();
    try {
      for (let offset = 0; offset < requested.length; offset += 20) {
        const batch = requested.slice(offset, offset + 20);
        const results = await SupermarketCatalogService.resolveList(storeName, batch.map(item => `${item.quantity} paquetes ${item.term}`).join('\n'), controller.signal);
        if (controller.signal.aborted) return;
        for (const result of results) {
          processed.add(result.term);
          if (!result.product || !validForCart(storeName, result.product)) {
            missing.push(result.term);
            continue;
          }
          const previous = found.get(result.product.id);
          found.set(result.product.id, {
            ...result.product, requestedTerm: comparisonTerm(result.product),
            quantity: Math.min(99, (previous?.quantity ?? 0) + Math.min(99, result.quantity)),
          });
        }
        setCart(current => [...current.filter(item => !found.has(item.id)), ...found.values()]);
        setUnresolved([...missing]);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setListError(error instanceof Error ? error.message : 'No se pudo cargar la lista.');
        setUnresolved([...missing, ...requested.map(item => item.term).filter(term => !processed.has(term))]);
      }
    } finally {
      if (!controller.signal.aborted) setListLoading(false);
    }
  };

  const openSavedList = async (list: SavedShoppingList) => {
    setActiveListId(list.id);
    setListInput(list.body);
    const store = list.store && SUPERMARKET_STORES.includes(list.store as typeof SUPERMARKET_STORES[number])
      ? list.store
      : primaryStore;
    if (store && store !== primaryStore) changeStore(store);
    if (store) await loadList(list.body, store);
  };

  const startNewList = () => {
    setActiveListId(null);
    setListInput('');
    setCart([]);
    setUnresolved([]);
    setListError('');
    clearComparison();
    savedSnapshot.current = '';
  };

  const removeSavedList = async (id: string) => {
    try {
      await SupermarketCatalogService.deleteList(id);
      setSavedLists(current => current.filter(item => item.id !== id));
      if (activeListId === id) setActiveListId(null);
    } catch (error) {
      setSaveNote(error instanceof Error ? error.message : 'No se pudo borrar la lista.');
    }
  };

  const importList = async (file?: File) => {
    if (!file) return;
    if (file.size > 1_000_000 || !/\.(txt|csv|xlsx)$/i.test(file.name)) {
      setListError('Sube un archivo TXT, CSV o XLSX de hasta 1 MB.');
      return;
    }
    try {
      const raw = /\.xlsx$/i.test(file.name) ? await SupermarketCatalogService.extractList(file) : await file.text();
      const value = /\.csv$/i.test(file.name)
        ? (() => {
          const rows = raw.split(/\r?\n/).map(row => row.split(/[;\t]/).map(cell => cell.trim()));
          const quantityColumn = /^(cantidad|cant\.?|unidades|qty)$/i.test(rows[0]?.[1] || '');
          return rows.map(cells => {
            if (/^(producto|nombre|item|art[ií]culo)$/i.test(cells[0] || '')) return '';
            return quantityColumn && /^\d{1,3}$/.test(cells[1] || '') ? `${cells[1]} ${cells[0]}` : cells[0];
          }).filter(Boolean).join('\n');
        })()
        : raw;
      setListInput(value);
      await loadList(value);
    } catch (error) {
      setListError(error instanceof Error ? error.message : 'No se pudo leer el archivo.');
    }
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
    if (!cart.length || !comparisonStores.length || unresolved.length || listLoading || hasDuplicateTerms) return;
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

  const comparisonBasket = (store: string): SupermarketBasketCandidate | undefined => {
    const basket = comparison?.basketOptions?.find(item => item.store === store);
    if (!basket) return undefined;
    const items = cart.flatMap(selected => {
      const options = comparableAlternatives(selected, store);
      const matching = options[0];
      return matching ? [matching] : [];
    });
    const missingTerms = cart.filter(selected => !items.some(item => item.requestedTerm === selected.requestedTerm)).map(item => item.name);
    return { ...basket, items, missingTerms, coveredCount: items.length,
      subtotal: items.reduce((sum, item) => sum + item.lineTotal, 0), complete: missingTerms.length === 0 && items.length === cart.length };
  };

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
            <div className="mt-4 rounded-xl border p-4" style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper-warm)' }}>
              <h3 className="text-sm font-bold cc-text-primary">Carga una lista completa</h3>
              <p className="mt-1 text-xs cc-text-secondary">Pega una lista o sube un TXT, CSV o XLSX. Se guarda sola para la próxima compra. La búsqueda en {primaryStore} empieza al pegar o subir el archivo; revisa cada producto antes de comprar.</p>
              {savedLists.length > 0 ? (
                <div className="mt-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold cc-text-primary">Listas guardadas</p>
                    {listInput.trim() ? <button type="button" onClick={startNewList} className="text-xs font-semibold underline cc-text-secondary">Nueva lista</button> : null}
                  </div>
                  <ul className="mt-2 space-y-2">
                    {savedLists.map(list => (
                      <li key={list.id} className="flex items-center gap-2">
                        <button type="button" onClick={() => void openSavedList(list)}
                          className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-left"
                          style={{ borderColor: activeListId === list.id ? 'var(--cc-copper)' : 'var(--cc-line)', background: 'var(--cc-paper)' }}>
                          <span className="block truncate text-xs font-semibold cc-text-primary">{list.title}</span>
                          <span className="text-[11px] cc-text-tertiary">{[list.store, listWhen(list.updatedAt)].filter(Boolean).join(' · ')}</span>
                        </button>
                        <button type="button" aria-label={`Borrar lista ${list.title}`} onClick={() => void removeSavedList(list.id)} className="rounded-lg p-2 cc-text-tertiary">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {saveNote ? <p className="mt-2 text-xs cc-text-tertiary">{saveNote}</p> : null}
              <textarea value={listInput} onChange={event => setListInput(event.target.value)}
                onPaste={event => {
                  const pasted = event.clipboardData.getData('text');
                  if (pasted.trim()) { event.preventDefault(); setListInput(pasted); void loadList(pasted); }
                }} rows={3} placeholder={'2 leche entera 1 L\n1 arroz 1 kg\n3 yogur natural'}
                aria-label="Lista completa de compras" className="mt-3 w-full rounded-lg border p-3 text-sm cc-text-primary" style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper)' }} />
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => void loadList(listInput)} disabled={listLoading || !listInput.trim()} className="rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-50" style={{ background: 'var(--cc-copper)' }}>Cargar lista escrita</button>
                <label className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold underline cc-text-primary"><Upload className="h-4 w-4" /> Subir TXT, CSV o XLSX
                  <input type="file" accept=".txt,.csv,.xlsx,text/plain,text/csv" className="sr-only" onChange={event => {
                    void importList(event.target.files?.[0]); event.currentTarget.value = '';
                  }} />
                </label>
                {listLoading ? <span role="status" className="flex items-center gap-1 text-xs cc-text-secondary"><Loader2 className="h-4 w-4 animate-spin" /> Cargando productos…</span> : null}
              </div>
              {listError ? <p role="alert" className="mt-2 text-xs text-red-700">{listError}</p> : null}
              {unresolved.length > 0 ? <div className="mt-3 text-xs text-amber-800"><p className="font-bold">Revisa {unresolved.length} productos sin coincidencia segura:</p>
                <ul className="mt-1 space-y-1">{unresolved.map(term => <li key={term} className="flex items-center gap-2"><button type="button" className="underline" onClick={() => changeQuery(term)}>{term} · buscar en catálogo</button><button type="button" aria-label={`Quitar ${term} de pendientes`} onClick={() => setUnresolved(current => current.filter(value => value !== term))}>Quitar</button></li>)}</ul>
              </div> : null}
            </div>
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
          <p className="mt-1 text-sm cc-text-secondary">Comparamos el producto elegido con la misma marca y presentación cuando existe. Otra marca se muestra como equivalente solo si coinciden tipo, atributos y cantidad del envase. Sin coincidencia verificable, la tienda queda incompleta.</p>
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
          {hasDuplicateTerms ? <p className="mt-3 text-xs text-amber-700">Hay dos productos distintos con la misma descripción de comparación. Revisa esas variantes en el carro antes de comparar otras tiendas.</p> : null}
          <button type="button" disabled={comparisonLoading || listLoading || hasDuplicateTerms || unresolved.length > 0 || comparisonStores.length === 0} onClick={() => void compare()}
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
                    <p className="mt-1 text-sm cc-text-secondary">{basket ? `${basket.coveredCount} de ${cart.length} · ${basket.complete ? money(basket.subtotal) : `Subtotal parcial ${money(basket.subtotal)}`}` : 'Sin resultados vigentes'}</p>
                    {basket && !basket.complete ? <p className="mt-1 text-xs text-amber-700">Faltan: {basket.missingTerms.join(', ') || 'productos sin código de carro'}</p> : null}
                    <button type="button" onClick={() => setCheckoutStore(store)} className="mt-3 text-xs font-bold underline cc-text-primary">{activeStore === store ? 'Tienda elegida' : 'Elegir y revisar tienda'}</button>
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
              const alternatives = activeStore === primaryStore ? [] : comparableAlternatives(selected, activeStore ?? '');
              return (
                <article key={selected.id} className="rounded-xl border p-3" style={{ borderColor: item ? 'var(--cc-line)' : 'var(--cc-amber)' }}>
                  <div className="flex gap-3"><SupermarketProductThumbnail imageUrl={item?.imageUrl} alt={item?.name ?? selected.requestedTerm} size="compact" />
                    <div className="min-w-0"><p className="text-xs cc-text-tertiary">Elegiste {selected.name}</p><p className="mt-1 text-sm font-semibold cc-text-primary">{item?.name ?? 'Sin equivalente verificable en esta tienda'}</p>{item && activeStore !== primaryStore ? <p className="mt-1 text-xs cc-text-secondary">{comparableProduct(selected, item) === 'same_brand' ? 'Misma marca y formato' : 'Marca equivalente; revisa antes de comprar'}</p> : null}</div>
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
          <p className="mt-4 text-lg font-bold cc-text-primary">{basketComplete ? 'Subtotal estimado' : 'Subtotal parcial'}: {money(activeTotal)}</p>
          {!basketComplete ? <p className="mt-2 flex items-start gap-2 text-sm text-amber-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {transferableItems.length > 0
            ? `Puedes abrir ${transferableItems.length} ${transferableItems.length === 1 ? 'producto disponible' : 'productos disponibles'} en ${activeStore}.`
            : `No hay productos para cargar automáticamente en ${activeStore}; puedes entrar a la tienda y buscarlos allí.`}
            {' '}Tu lista sigue incompleta{unresolved.length + missingTerms.length > 0 ? `: ${[...unresolved, ...missingTerms].join(', ')}` : ''}. El subtotal mostrado no cubre toda la compra.</p> : null}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {!listLoading && activeStore && transferableItems.length > 0 ? <RemoteCartButton store={activeStore} items={transferableItems} complete={basketComplete} /> : null}
            {activeStore && STORE_SITES[activeStore] ? <a href={STORE_SITES[activeStore]}
              target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs underline cc-text-secondary"><ExternalLink className="h-3.5 w-3.5" /> Abrir sitio de {activeStore}</a> : null}
          </div>
          <p className="mt-3 text-xs cc-text-tertiary">Confirma productos, cantidades, disponibilidad, despacho y precio final en el supermercado antes de pagar.</p>
        </section>
      ) : null}

      <p className="text-xs cc-text-tertiary">¿Prefieres pegar una lista completa? <Link href="/resident/supermercado/comparador" className="underline">Abrir comparador de listas</Link>.</p>
    </main>
  );
}
