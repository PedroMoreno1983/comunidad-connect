'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChefHat,
  ChevronRight,
  Download,
  ExternalLink,
  ListChecks,
  Loader2,
  Plus,
  Share2,
  ShoppingCart,
  Sparkles,
  Trash2,
  Users,
  UtensilsCrossed,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { DisplayHeading } from '@/components/cc/Eyebrow';
import { GroupBuyPanel } from '@/components/resident/supermarket/GroupBuyPanel';
import type {
  SupermarketSearchCandidate,
  SupermarketSearchResponse,
  SupermarketShoppingItem,
} from '@/lib/types';

const STORE_URLS: Record<string, string> = {
  Lider: 'https://super.lider.cl',
  Jumbo: 'https://www.jumbo.cl',
  Unimarc: 'https://www.unimarc.cl',
  aCuenta: 'https://www.acuenta.cl',
  Irurzun: 'https://irurzun.cl',
  'Santa Isabel': 'https://www.santaisabel.cl',
};

const LIST_SUGGESTIONS = [
  { title: 'Plan semanal saludable', items: ['Pechuga de pollo', 'Arroz', 'Paltas', 'Huevos'], icon: ChefHat },
  { title: 'Kit de asado chileno', items: ['Carne molida', 'Cebolla', 'Papa', 'Limón', 'Tomate', 'Pan molde'], icon: UtensilsCrossed },
  { title: 'Desayuno energético', items: ['Avena', 'Leche', 'Yogurt', 'Manzana'], icon: UtensilsCrossed },
];

function money(value: number) {
  return `$${value.toLocaleString('es-CL')}`;
}

export default function SupermarketPage() {
  const { toast } = useToast();
  const [mode, setMode] = useState<'compare' | 'group'>('compare');
  const [list, setList] = useState<SupermarketShoppingItem[]>([]);
  const [newItem, setNewItem] = useState('');
  const [loading, setLoading] = useState(false);
  const [shoppingInput, setShoppingInput] = useState('');
  const [recommendedStore, setRecommendedStore] = useState<string | null>(null);
  const [basketReady, setBasketReady] = useState(false);
  const [basketSubtotal, setBasketSubtotal] = useState(0);
  const [checkoutIndex, setCheckoutIndex] = useState(0);
  const [requestedCount, setRequestedCount] = useState(0);
  const [foundCount, setFoundCount] = useState(0);
  const [missingTerms, setMissingTerms] = useState<string[]>([]);
  const [alternatives, setAlternatives] = useState<Record<string, SupermarketSearchCandidate[]>>({});

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (new URLSearchParams(window.location.search).get('mode') === 'group') {
      setMode('group');
    }
  }, []);

  const changeMode = (nextMode: 'compare' | 'group') => {
    setMode(nextMode);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (nextMode === 'group') url.searchParams.set('mode', 'group');
      else {
        url.searchParams.delete('mode');
        url.searchParams.delete('order');
      }
      window.history.replaceState({}, '', url);
    }
  };

  const addItem = (event?: React.FormEvent) => {
    event?.preventDefault();
    const name = newItem.trim();
    if (!name) return;
    setList(previous => [...previous, {
      id: crypto.randomUUID(),
      name,
      brand: '',
      price: 0,
      requestedTerm: name.toLowerCase(),
      requestedQuantity: 1,
      quantity: 1,
      packUnits: 1,
      suppliedQuantity: 1,
      lineTotal: 0,
      checked: false,
      available: false,
      source: 'manual',
    }]);
    setNewItem('');
  };

  const applyPlan = (plan: typeof LIST_SUGGESTIONS[number]) => {
    setShoppingInput(plan.items.join('\n'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

      setList(data.items);
      setRecommendedStore(data.recommendedStore ?? null);
      setBasketReady(Boolean(data.basketReady));
      setBasketSubtotal(data.basketSubtotal ?? 0);
      setCheckoutIndex(0);
      setRequestedCount(data.requestedCount);
      setFoundCount(data.foundCount);
      setMissingTerms(data.missingTerms);
      setAlternatives(data.alternativesByTerm || {});

      toast({
        title: data.foundCount === data.requestedCount ? 'Lista completa procesada' : 'Lista procesada con faltantes visibles',
        description: data.message,
        variant: data.foundCount === data.requestedCount ? 'success' : undefined,
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

  const removeItem = (id: string) => setList(previous => previous.filter(item => item.id !== id));
  const toggleItem = (id: string) => setList(previous => previous.map(
    item => item.id === id ? { ...item, checked: !item.checked } : item,
  ));

  const selectAlternative = (requestedTerm: string, candidateId: string) => {
    const candidate = alternatives[requestedTerm]?.find(item => item.id === candidateId);
    if (!candidate) return;
    setList(previous => previous.map(item => item.requestedTerm === requestedTerm ? {
      ...candidate,
      checked: item.checked,
      available: true,
      source: 'catalog',
    } : item));
    setRecommendedStore(null);
    setBasketReady(false);
    setBasketSubtotal(0);
    setCheckoutIndex(0);
  };

  const totalAmount = list.reduce((sum, item) => sum + item.lineTotal, 0);
  const exportDisabled = list.length === 0;
  const usedStores = Array.from(new Set(list.map(item => item.store).filter(
    (store): store is string => Boolean(store && store in STORE_URLS),
  )));
  const checkoutItems = list.filter(
    (item): item is SupermarketShoppingItem & { productUrl: string } => Boolean(item.available && item.productUrl),
  );
  const checkoutFinished = checkoutItems.length > 0 && checkoutIndex >= checkoutItems.length;
  const checkoutUrl = checkoutFinished
    ? (recommendedStore ? STORE_URLS[recommendedStore] : undefined)
    : checkoutItems[checkoutIndex]?.productUrl;

  const buildListText = () => [
    'Lista de compras Convive Connect',
    `Generada: ${new Date().toLocaleString('es-CL')}`,
    '',
    ...list.map((item, index) => {
      const status = item.checked ? '[x]' : '[ ]';
      const quantity = `x${item.requestedQuantity}`;
      const match = item.available ? `${item.name}${item.brand ? ` · ${item.brand}` : ''}` : 'sin precio vigente';
      const price = item.available ? ` · ${money(item.lineTotal)}` : '';
      const store = item.store ? ` · ${item.store}` : '';
      return `${index + 1}. ${status} ${item.requestedTerm} ${quantity} → ${match}${price}${store}`;
    }),
    '',
    `Total referencial encontrado: ${money(totalAmount)}`,
    missingTerms.length > 0 ? `Sin coincidencia: ${missingTerms.join(', ')}` : '',
    'La disponibilidad y el pago se confirman directamente con el comercio.',
  ].filter(Boolean).join('\n');

  const handleShareList = async () => {
    if (list.length === 0) return;
    const text = buildListText();
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  const handleCheckoutStep = () => {
    if (checkoutFinished || !basketReady || !recommendedStore || checkoutItems.length === 0) return;
    const openedPosition = checkoutIndex + 1;
    setCheckoutIndex(openedPosition);
    if (checkoutIndex === 0 && navigator.clipboard) {
      void navigator.clipboard.writeText(buildListText()).catch(() => undefined);
    }
    toast({
      title: `Producto ${openedPosition} de ${checkoutItems.length}`,
      description: openedPosition === checkoutItems.length
        ? `Último producto abierto. Agrégalo y continúa en ${recommendedStore} para revisar el carrito.`
        : 'Agrégalo en el supermercado, vuelve a Convive y abre el siguiente.',
      variant: 'success',
    });
  };

  const handleExportList = () => {
    if (list.length === 0) return;
    const blob = new Blob([buildListText()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `lista-compras-convive-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    toast({
      title: 'Lista exportada',
      description: 'Incluye cantidades, coincidencias, precios y faltantes.',
      variant: 'success',
    });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 pb-20 sm:px-0">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--cc-copper)' }}>Supermercado</p>
        <h1 className="mt-2 text-3xl font-bold cc-text-primary">¿Qué quieres hacer hoy?</h1>
        <p className="mt-2 max-w-3xl text-sm cc-text-secondary">
          Compara tu lista personal o coordina una compra con otras personas del edificio. Son dos procesos distintos.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2" role="tablist" aria-label="Tipo de compra">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'compare'}
          onClick={() => changeMode('compare')}
          className="rounded-2xl border p-5 text-left transition-colors"
          style={{
            borderColor: mode === 'compare' ? 'var(--cc-copper)' : 'var(--cc-line)',
            background: mode === 'compare' ? 'var(--cc-copper-tint)' : 'var(--cc-paper)',
          }}
        >
          <ShoppingCart className="h-5 w-5" style={{ color: 'var(--cc-copper)' }} />
          <span className="mt-3 block text-lg font-bold cc-text-primary">Comparar mi lista</span>
          <span className="mt-1 block text-sm cc-text-secondary">Precios, marcas, cantidades y enlaces para comprar.</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'group'}
          onClick={() => changeMode('group')}
          className="rounded-2xl border p-5 text-left transition-colors"
          style={{
            borderColor: mode === 'group' ? 'var(--cc-copper)' : 'var(--cc-line)',
            background: mode === 'group' ? 'var(--cc-copper-tint)' : 'var(--cc-paper)',
          }}
        >
          <Users className="h-5 w-5" style={{ color: 'var(--cc-copper)' }} />
          <span className="mt-3 block text-lg font-bold cc-text-primary">Comprar en comunidad</span>
          <span className="mt-1 block text-sm cc-text-secondary">Invitar, sumar pedidos y repartir cuánto paga cada persona.</span>
        </button>
      </div>

      {mode === 'group' ? <GroupBuyPanel /> : (
        <>
          <section className="relative overflow-hidden rounded-2xl border p-6 text-white md:p-8" style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-ink)' }}>
            <div className="relative z-10 grid grid-cols-1 items-center gap-8 lg:grid-cols-2">
              <div className="space-y-4">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em]"
                  style={{ borderColor: 'rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.08)' }}
                >
                  <Sparkles className="h-3 w-3" style={{ color: '#F5BFA3' }} />
                  Comparación de precios
                </motion.div>
                <DisplayHeading size={36} style={{ color: '#fff' }}>
                  Tu lista completa, <em style={{ color: '#F5BFA3', fontStyle: 'italic' }}>sin productos ocultos.</em>
                </DisplayHeading>
                <p className="max-w-xl text-sm leading-6 text-white/70">
                  Puedes pegar hasta 30 productos. Si no indicas cantidad, usamos 1. Si no escribes una marca,
                  mostramos la marca encontrada y te dejamos cambiarla cuando existan alternativas.
                </p>
              </div>

              <div className="rounded-2xl border p-5" style={{ borderColor: 'rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.08)' }}>
                <label className="text-xs font-bold uppercase tracking-widest text-white/70" htmlFor="shopping-list">
                  Pega tu lista
                </label>
                <div className="relative mt-2">
                  <textarea
                    id="shopping-list"
                    className="min-h-36 w-full rounded-xl border p-3 pr-12 text-sm text-white placeholder:text-white/45 focus:outline-none focus:ring-2 focus:ring-white/30"
                    style={{ borderColor: 'rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.10)' }}
                    placeholder={'2 arroz\nleche x 6\naceite\npapel higiénico 2'}
                    value={shoppingInput}
                    maxLength={1500}
                    onChange={event => setShoppingInput(event.target.value)}
                  />
                  <button
                    type="button"
                    aria-label="Comparar lista"
                    onClick={() => void processShoppingList()}
                    disabled={loading || !shoppingInput.trim()}
                    className="absolute bottom-3 right-3 rounded-full p-2 disabled:opacity-50"
                    style={{ background: '#fff', color: 'var(--cc-copper)' }}
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                </div>
                <p className="mt-2 text-xs text-white/60">Una línea, coma o punto y coma separa cada producto.</p>
              </div>
            </div>
          </section>

          {requestedCount > 0 && (
            <section
              className="rounded-2xl border p-5"
              style={{
                borderColor: foundCount === requestedCount ? 'var(--cc-success-border)' : 'var(--cc-amber)',
                background: foundCount === requestedCount ? 'var(--cc-sage-tint)' : 'var(--cc-amber-tint)',
              }}
            >
              <div className="flex items-start gap-3">
                {foundCount === requestedCount
                  ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success-fg" />
                  : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'var(--cc-amber)' }} />}
                <div>
                  <h2 className="font-bold cc-text-primary">Encontramos {foundCount} de {requestedCount} productos</h2>
                  <p className="mt-1 text-sm cc-text-secondary">
                    {foundCount === requestedCount
                      ? 'Todos los productos de tu lista están representados abajo.'
                      : 'Los faltantes no desaparecen: están marcados abajo para que puedas ajustar su descripción.'}
                  </p>
                  {missingTerms.length > 0 && (
                    <p className="mt-2 text-xs font-semibold cc-text-secondary">Sin precio vigente: {missingTerms.join(', ')}</p>
                  )}
                </div>
              </div>
            </section>
          )}

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <div className="rounded-2xl border p-6" style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper)' }}>
                <div className="mb-6 flex items-center justify-between">
                  <h2 className="flex items-center gap-3 text-xl font-semibold cc-text-primary" style={{ fontFamily: 'var(--cc-font-display)' }}>
                    <ListChecks style={{ color: 'var(--cc-copper)' }} /> Tu lista
                  </h2>
                  <span className="rounded-full px-3 py-1.5 text-xs font-semibold cc-text-tertiary" style={{ background: 'var(--cc-paper-warm)' }}>
                    {list.length} productos
                  </span>
                </div>

                <form onSubmit={addItem} className="mb-6 flex gap-3">
                  <Input
                    placeholder="Agregar otro producto manualmente"
                    className="h-12 rounded-lg text-sm"
                    style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper-warm)' }}
                    value={newItem}
                    onChange={event => setNewItem(event.target.value)}
                  />
                  <Button type="submit" className="h-12 w-12 rounded-full p-0" style={{ background: 'var(--cc-copper)' }}>
                    <Plus className="h-6 w-6 text-white" />
                  </Button>
                </form>

                <div className="space-y-3">
                  <AnimatePresence>
                    {list.map(item => {
                      const termAlternatives = alternatives[item.requestedTerm] || [];
                      return (
                        <motion.div
                          key={`${item.requestedTerm}-${item.id}`}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 10 }}
                          className="rounded-xl border p-4 transition-all"
                          style={item.checked
                            ? { background: 'var(--cc-sage-tint)', borderColor: 'var(--cc-success-border)', opacity: 0.68 }
                            : item.available
                              ? { background: 'var(--cc-paper)', borderColor: 'var(--cc-line)' }
                              : { background: 'var(--cc-amber-tint)', borderColor: 'var(--cc-amber)' }}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex min-w-0 items-start gap-3">
                              <button
                                type="button"
                                onClick={() => toggleItem(item.id)}
                                className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2"
                                style={item.checked
                                  ? { background: 'var(--cc-sage)', borderColor: 'var(--cc-sage)', color: '#fff' }
                                  : { borderColor: 'var(--cc-line)' }}
                              >
                                {item.checked && <CheckCircle2 className="h-4 w-4" />}
                              </button>
                              <div className="min-w-0">
                                <p className="text-xs font-bold uppercase cc-text-tertiary">
                                  Pediste: {item.requestedTerm} · cantidad {item.requestedQuantity}
                                </p>
                                {item.available ? (
                                  <>
                                    <p className={`mt-1 text-base font-bold cc-text-primary ${item.checked ? 'line-through' : ''}`}>
                                      {item.name}{item.brand ? ` · ${item.brand}` : ''}
                                    </p>
                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                                      <span className="font-bold text-success-fg">{money(item.lineTotal)}</span>
                                      <span className="cc-text-tertiary">
                                        {item.quantity} {item.packUnits > 1 ? `pack(s) de ${item.packUnits}` : 'unidad(es)'}
                                      </span>
                                      {item.store && (
                                        <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase cc-text-tertiary" style={{ background: 'var(--cc-paper-warm)' }}>
                                          {item.store}
                                        </span>
                                      )}
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <p className="mt-1 font-bold cc-text-primary">Sin precio vigente</p>
                                    <p className="mt-1 text-xs cc-text-secondary">Prueba una descripción más específica, por ejemplo tipo, tamaño o marca.</p>
                                  </>
                                )}
                              </div>
                            </div>
                            <button type="button" onClick={() => removeItem(item.id)} className="shrink-0 p-2 text-[var(--cc-ink-faint)] hover:text-[var(--cc-rose)]">
                              <Trash2 className="h-5 w-5" />
                            </button>
                          </div>

                          {termAlternatives.length > 1 && item.available && (
                            <label className="mt-3 block text-xs font-semibold cc-text-secondary">
                              Cambiar marca o presentación
                              <select
                                className="input-premium mt-1 h-10 w-full"
                                value={item.id}
                                onChange={event => selectAlternative(item.requestedTerm, event.target.value)}
                              >
                                {termAlternatives.map(candidate => (
                                  <option key={candidate.id} value={candidate.id}>
                                    {candidate.name}{candidate.brand ? ` · ${candidate.brand}` : ''} · {candidate.store} · {money(candidate.lineTotal)}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}

                          {item.productUrl && (
                            <a href={item.productUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-bold hover:underline" style={{ color: 'var(--cc-copper)' }}>
                              Abrir producto exacto <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>

                  {list.length === 0 && (
                    <div className="space-y-4 py-16 text-center">
                      <ShoppingCart className="mx-auto h-14 w-14 cc-text-disabled" />
                      <div>
                        <p className="font-bold cc-text-secondary">Tu lista está vacía</p>
                        <p className="mt-1 text-sm cc-text-tertiary">Pégala arriba para comparar todos los productos de una vez.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-2xl p-6 text-white" style={{ background: 'var(--cc-ink)' }}>
                <div className="mb-5 flex items-center gap-3">
                  <ChefHat style={{ color: '#F5BFA3' }} />
                  <h3 className="text-xl font-semibold" style={{ fontFamily: 'var(--cc-font-display)' }}>Ideas rápidas</h3>
                </div>
                <div className="space-y-3">
                  {LIST_SUGGESTIONS.map(plan => {
                    const PlanIcon = plan.icon;
                    return (
                      <button key={plan.title} onClick={() => applyPlan(plan)} className="group w-full rounded-xl border p-4 text-left hover:bg-white/10" style={{ borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)' }}>
                        <div className="mb-2 flex items-center justify-between">
                          <PlanIcon className="h-5 w-5" style={{ color: '#F5BFA3' }} />
                          <ArrowRight className="h-4 w-4 text-white/50" />
                        </div>
                        <h4 className="font-bold">{plan.title}</h4>
                        <p className="mt-1 text-xs text-white/60">{plan.items.slice(0, 3).join(', ')}…</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl border p-6" style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper)' }}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider cc-text-tertiary">Total encontrado</p>
                    <p className="mt-1 text-2xl font-bold cc-text-primary">{money(totalAmount)}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => void handleShareList()} disabled={exportDisabled || loading} variant="outline" className="h-10 px-3">
                      <Share2 className="h-4 w-4" />
                    </Button>
                    <Button onClick={handleExportList} disabled={exportDisabled || loading} className="h-10 px-3 text-white" style={{ background: 'var(--cc-ink)' }}>
                      <Download className="mr-2 h-4 w-4" /> Exportar
                    </Button>
                  </div>
                </div>

                {recommendedStore && basketReady ? (
                  <div className="mt-5 space-y-3 rounded-xl border p-4" style={{ borderColor: 'var(--cc-sage)' }}>
                    <div>
                      <p className="text-xs font-bold uppercase cc-text-tertiary">Mejor canasta completa</p>
                      <p className="text-lg font-bold cc-text-primary">{recommendedStore}</p>
                      <p className="text-sm font-semibold text-success-fg">{money(basketSubtotal)} en productos</p>
                    </div>
                    {checkoutUrl && (
                      <a
                        href={checkoutUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={handleCheckoutStep}
                        className="inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-bold text-white"
                        style={{ background: 'var(--cc-ink)' }}
                      >
                        {checkoutFinished
                          ? `Continuar en ${recommendedStore}`
                          : `Abrir producto ${checkoutIndex + 1} de ${checkoutItems.length}`}
                        <ExternalLink className="ml-2 h-4 w-4" />
                      </a>
                    )}
                    <p className="text-xs cc-text-tertiary">
                      CoCo abre cada producto exacto. Debes agregarlo dentro de tu sesión del supermercado y confirmar stock y pago.
                    </p>
                  </div>
                ) : list.length > 0 ? (
                  <div className="mt-5 rounded-xl border p-4" style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper-warm)' }}>
                    <p className="text-sm font-bold cc-text-primary">Aún no hay una canasta completa de una sola tienda</p>
                    <p className="mt-1 text-xs cc-text-secondary">
                      Puedes abrir los productos encontrados por separado o ajustar los faltantes. No presentamos una selección parcial como compra lista.
                    </p>
                  </div>
                ) : null}

                {usedStores.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {usedStores.map(store => (
                      <a key={store} href={STORE_URLS[store]} target="_blank" rel="noopener noreferrer" className="min-w-[45%] flex-1 rounded-xl border p-3 text-center text-sm font-bold cc-text-secondary hover:bg-[var(--cc-paper-warm)]" style={{ borderColor: 'var(--cc-line)' }}>
                        Abrir {store} <ExternalLink className="ml-1 inline h-3.5 w-3.5" />
                      </a>
                    ))}
                  </div>
                )}

                <p className="mt-5 text-center text-[10px] font-semibold uppercase tracking-widest cc-text-tertiary">
                  Precios reales consultados; disponibilidad y pago se confirman en el comercio
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
