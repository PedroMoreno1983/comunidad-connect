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
import { MAX_SHOPPING_LIST_CHARS, MAX_SHOPPING_LIST_ITEMS } from '@/lib/supermarketGroupDomain';
import type {
  SupermarketBasketSummary,
  SupermarketPurchasePlan,
  SupermarketSearchCandidate,
  SupermarketSearchResponse,
  SupermarketShoppingItem,
} from '@/lib/types';

const STORE_URLS: Record<string, string> = {
  Lider: 'https://super.lider.cl',
  Jumbo: 'https://www.jumbo.cl',
  Unimarc: 'https://www.unimarc.cl',
  Tottus: 'https://www.tottus.cl/tottus-cl',
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
  const [requestedCount, setRequestedCount] = useState(0);
  const [foundCount, setFoundCount] = useState(0);
  const [missingTerms, setMissingTerms] = useState<string[]>([]);
  const [alternatives, setAlternatives] = useState<Record<string, SupermarketSearchCandidate[]>>({});
  const [basketComparisons, setBasketComparisons] = useState<SupermarketBasketSummary[]>([]);
  const [checkoutPlan, setCheckoutPlan] = useState<SupermarketPurchasePlan | null>(null);

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

  const resetComparison = () => {
    setRecommendedStore(null);
    setBasketReady(false);
    setBasketSubtotal(0);
    setBasketComparisons([]);
    setCheckoutPlan(null);
    setRequestedCount(0);
    setFoundCount(0);
    setMissingTerms([]);
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
    resetComparison();
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
      setRequestedCount(data.requestedCount);
      setFoundCount(data.foundCount);
      setMissingTerms(data.missingTerms);
      setAlternatives(data.alternativesByTerm || {});
      setBasketComparisons(data.basketComparison || []);
      setCheckoutPlan(data.checkout?.plan ?? null);

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

  const removeItem = (id: string) => {
    setList(previous => previous.filter(item => item.id !== id));
    resetComparison();
  };
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
    resetComparison();
  };

  const totalAmount = list.reduce((sum, item) => sum + item.lineTotal, 0);
  const exportDisabled = list.length === 0;
  const winningStoreUrl = recommendedStore ? STORE_URLS[recommendedStore] : undefined;

  const buildListText = () => [
    'Lista de compras Convive Connect',
    `Generada: ${new Date().toLocaleString('es-CL')}`,
    '',
    ...list.map((item, index) => {
      const status = item.checked ? '[x]' : '[ ]';
      const quantity = item.requestedUnit ? `${item.requestedQuantity} ${item.requestedUnit}` : `x${item.requestedQuantity}`;
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
  const buildBasketText = (basket: SupermarketPurchasePlan['baskets'][number]) => [
    `Lista Convive Connect para ${basket.store}`,
    '',
    ...basket.items.map((item, index) => {
      const quantity = item.requestedUnit
        ? `${item.requestedQuantity} ${item.requestedUnit}`
        : `x${item.requestedQuantity}`;
      return `${index + 1}. ${item.requestedTerm} ${quantity} -> ${item.name} (${money(item.lineTotal)})`;
    }),
    '',
    `Subtotal referencial: ${money(basket.subtotal)}`,
  ].join('\n');

  const handleOpenBasket = (basket: SupermarketPurchasePlan['baskets'][number]) => {
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(buildBasketText(basket)).catch(() => undefined);
    }
    toast({
      title: `Lista copiada para ${basket.store}`,
      description: `${basket.items.length} productos listos en una sola lista.`,
      variant: 'success',
    });
  };


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

  const handleOpenWinningStore = () => {
    if (!basketReady || !recommendedStore) return;
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(buildListText()).catch(() => undefined);
    }
    toast({
      title: `Lista copiada para ${recommendedStore}`,
      description: 'Abrimos una sola pestaña. Pega o consulta la lista sin volver a escribir los productos.',
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
                  Puedes pegar hasta {MAX_SHOPPING_LIST_ITEMS} productos. Si no indicas cantidad, usamos 1. Si no escribes una marca,
                  CoCo elige una coincidencia vigente y mantiene los faltantes como tareas de reemplazo.
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
                    maxLength={MAX_SHOPPING_LIST_CHARS}
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
                                  Pediste: {item.requestedTerm} · cantidad {item.requestedQuantity}{item.requestedUnit ? ` ${item.requestedUnit}` : ''}
                                </p>
                                {item.available ? (
                                  <>
                                    <p className={`mt-1 text-base font-bold cc-text-primary ${item.checked ? 'line-through' : ''}`}>
                                      {item.name}{item.brand ? ` · ${item.brand}` : ''}
                                    </p>
                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                                      <span className="font-bold text-success-fg">{money(item.lineTotal)}</span>
                                      <span className="cc-text-tertiary">
                                        {item.requestedUnit
                                          ? `${item.quantity} pack(s) · entrega ${item.suppliedQuantity} ${item.requestedUnit}`
                                          : `${item.quantity} ${item.packUnits > 1 ? `pack(s) de ${item.packUnits}` : 'unidad(es)'}`}
                                      </span>
                                      {item.store && (
                                        <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase cc-text-tertiary" style={{ background: 'var(--cc-paper-warm)' }}>
                                          {item.store}
                                        </span>
                                      )}
                                    </div>
                                    {item.selectionReason && (
                                      <p className="mt-1 text-xs italic cc-text-tertiary">{item.selectionReason}</p>
                                    )}
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

                {basketComparisons.length > 0 && (
                  <div className="mt-5 rounded-xl border p-4" style={{ borderColor: 'var(--cc-line)' }}>
                    <p className="text-xs font-bold uppercase tracking-wider cc-text-tertiary">Comparación por total de la canasta</p>
                    <div className="mt-3 space-y-2">
                      {basketComparisons.slice(0, 5).map((basket, index) => (
                        <div
                          key={basket.store}
                          className="flex items-center justify-between gap-3 rounded-lg px-3 py-2"
                          style={{ background: basket.store === recommendedStore ? 'var(--cc-paper-warm)' : 'transparent' }}
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-bold cc-text-primary">
                              {index + 1}. {basket.store}
                              {basket.store === recommendedStore ? ' · mejor total completo' : ''}
                            </p>
                            <p className="text-xs cc-text-tertiary">
                              {basket.coveredCount} de {basket.requestedCount} productos
                              {!basket.complete ? ' · canasta incompleta' : ''}
                            </p>
                          </div>
                          <p className="shrink-0 text-sm font-bold cc-text-primary">{money(basket.subtotal)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {checkoutPlan && (
                  <div className="mt-5 space-y-4 rounded-xl border p-4" style={{ borderColor: checkoutPlan.complete ? 'var(--cc-sage)' : 'var(--cc-amber)' }}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase cc-text-tertiary">
                          {checkoutPlan.complete ? 'Plan de compra completo' : 'Plan listo para continuar'}
                        </p>
                        <p className="text-lg font-bold cc-text-primary">
                          {checkoutPlan.resolvedCount} de {checkoutPlan.requestedCount} productos resueltos
                        </p>
                        <p className="text-sm cc-text-secondary">
                          {checkoutPlan.storeCount} supermercado{checkoutPlan.storeCount === 1 ? '' : 's'} - {money(checkoutPlan.total)}
                        </p>
                      </div>
                      {checkoutPlan.status === 'split_store' && (
                        <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: 'var(--cc-paper-warm)' }}>
                          Dividida para completar la lista
                        </span>
                      )}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      {checkoutPlan.baskets.map(basket => (
                        <div key={basket.store} className="rounded-xl border p-3" style={{ borderColor: 'var(--cc-line)' }}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-bold cc-text-primary">{basket.store}</p>
                              <p className="text-xs cc-text-tertiary">{basket.items.length} productos - {money(basket.subtotal)}</p>
                            </div>
                            <ShoppingCart className="h-4 w-4 cc-text-tertiary" />
                          </div>
                          <a
                            href={STORE_URLS[basket.store] || '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => handleOpenBasket(basket)}
                            className="mt-3 inline-flex w-full items-center justify-center rounded-lg px-3 py-2 text-xs font-bold text-white"
                            style={{ background: 'var(--cc-ink)' }}
                          >
                            Copiar {basket.items.length} y abrir tienda
                            <ExternalLink className="ml-2 h-3.5 w-3.5" />
                          </a>
                        </div>
                      ))}
                    </div>

                    {checkoutPlan.substitutionTasks.length > 0 && (
                      <div className="rounded-xl border p-3" style={{ borderColor: 'var(--cc-amber)', background: 'var(--cc-amber-tint)' }}>
                        <p className="text-sm font-bold cc-text-primary">Faltantes que no detienen la compra</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {checkoutPlan.substitutionTasks.map(task => task.searchUrl ? (
                            <a key={task.requestedTerm} href={task.searchUrl} target="_blank" rel="noopener noreferrer" className="rounded-full border px-3 py-1 text-xs font-semibold cc-text-primary" style={{ borderColor: 'var(--cc-line)' }}>
                              Reemplazar {task.requestedTerm}
                            </a>
                          ) : (
                            <span key={task.requestedTerm} className="rounded-full border px-3 py-1 text-xs font-semibold cc-text-primary" style={{ borderColor: 'var(--cc-line)' }}>
                              Revisar {task.requestedTerm}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <p className="text-xs cc-text-tertiary">
                      Cada botón abre una sola tienda y copia su lista completa. El carro aún no se precarga: eso requiere operar dentro de la sesión autenticada del comprador.
                    </p>
                  </div>
                )}

                {!checkoutPlan && recommendedStore && basketReady ? (
                  <div className="mt-5 space-y-3 rounded-xl border p-4" style={{ borderColor: 'var(--cc-sage)' }}>
                    <div>
                      <p className="text-xs font-bold uppercase cc-text-tertiary">Mejor canasta completa</p>
                      <p className="text-lg font-bold cc-text-primary">{recommendedStore}</p>
                      <p className="text-sm font-semibold text-success-fg">{money(basketSubtotal)} en productos</p>
                    </div>
                    {winningStoreUrl && (
                      <a
                        href={winningStoreUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={handleOpenWinningStore}
                        className="inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-bold text-white"
                        style={{ background: 'var(--cc-ink)' }}
                      >
                        Copiar lista y abrir {recommendedStore}
                        <ExternalLink className="ml-2 h-4 w-4" />
                      </a>
                    )}
                    <p className="text-xs cc-text-tertiary">
                      Se abre una sola pestaña. Convive no afirma que el carro esté precargado: hasta tener convenio, la tienda exige que agregues y pagues dentro de tu propia sesión.
                    </p>
                  </div>
                ) : list.length > 0 ? (
                  <div className="mt-5 rounded-xl border p-4" style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper-warm)' }}>
                    <p className="text-sm font-bold cc-text-primary">Aún no hay una canasta completa de una sola tienda</p>
                    <p className="mt-1 text-xs cc-text-secondary">
                      Ajusta los faltantes y vuelve a comparar. No abriremos veinte fichas ni presentaremos una selección parcial como compra lista.
                    </p>
                  </div>
                ) : null}

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
