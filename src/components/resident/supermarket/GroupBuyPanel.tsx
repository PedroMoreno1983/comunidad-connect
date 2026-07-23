'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CircleDollarSign,
  ExternalLink,
  Loader2,
  LockKeyhole,
  PackagePlus,
  RefreshCw,
  Share2,
  Users,
} from 'lucide-react';
import { SupermarketGroupService } from '@/lib/api';
import type { SupermarketGroupComparison, SupermarketGroupOrder } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

function plusDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function money(value: number) {
  return `$${value.toLocaleString('es-CL')}`;
}

export function GroupBuyPanel() {
  const { toast } = useToast();
  const [orders, setOrders] = useState<SupermarketGroupOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [closesAt, setClosesAt] = useState(plusDays(4));
  const [shoppingList, setShoppingList] = useState('');
  const [contributions, setContributions] = useState<Record<string, string>>({});
  const [comparisons, setComparisons] = useState<Record<string, SupermarketGroupComparison[]>>({});

  const refresh = async () => {
    setLoading(true);
    try {
      setOrders(await SupermarketGroupService.list());
    } catch (error) {
      toast({
        title: 'No se pudo cargar la compra comunitaria',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (loading || typeof window === 'undefined') return;
    const orderId = new URLSearchParams(window.location.search).get('order');
    if (!orderId) return;
    window.requestAnimationFrame(() => {
      document.getElementById(`group-order-${orderId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  }, [loading, orders]);

  const visibleOrders = useMemo(
    () => orders.filter(order => !['completed', 'cancelled'].includes(order.status)),
    [orders],
  );

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy('create');
    try {
      const order = await SupermarketGroupService.create({ title, closesAt, shoppingList });
      setOrders(previous => [order, ...previous]);
      setTitle('');
      setShoppingList('');
      toast({
        title: 'Compra comunitaria creada',
        description: 'Compártela con tus vecinos para que agreguen sus cantidades.',
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: 'No se pudo crear',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  const join = async (orderId: string) => {
    setBusy(`join:${orderId}`);
    try {
      const order = await SupermarketGroupService.join(orderId, contributions[orderId] || '');
      setOrders(previous => previous.map(item => item.id === order.id ? order : item));
      setContributions(previous => ({ ...previous, [orderId]: '' }));
      toast({
        title: 'Tu parte quedó guardada',
        description: 'CoCo sumará tus cantidades a la lista común y calculará lo que te corresponde.',
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: 'No se pudo guardar tu parte',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  const compare = async (orderId: string) => {
    setBusy(`compare:${orderId}`);
    try {
      const result = await SupermarketGroupService.compare(orderId);
      setComparisons(previous => ({ ...previous, [orderId]: result }));
      if (!result.some(item => item.complete)) {
        toast({
          title: 'Comparación incompleta',
          description: 'Todavía no hay una tienda con precio vigente para todos los productos.',
        });
      }
    } catch (error) {
      toast({
        title: 'No se pudo comparar',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  const lock = async (orderId: string) => {
    setBusy(`lock:${orderId}`);
    try {
      const order = await SupermarketGroupService.lock(orderId);
      setOrders(previous => previous.map(item => item.id === order.id ? order : item));
      toast({
        title: 'Compra preparada',
        description: `CoCo seleccionó ${order.selectedStore} por ${money(order.selectedTotal || 0)} y repartió el gasto.`,
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: 'No se pudo preparar',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  const share = async (order: SupermarketGroupOrder) => {
    if (typeof window === 'undefined') return;
    const url = `${window.location.origin}/resident/supermercado?mode=group&order=${order.id}`;
    const text = `Súmate a “${order.title}” en Convive Connect. Abre el enlace y agrega tu lista: ${url}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: order.title, text, url });
      } else {
        await navigator.clipboard.writeText(text);
        toast({
          title: 'Enlace copiado',
          description: 'Pégalo en el chat del edificio o envíalo por WhatsApp.',
          variant: 'success',
        });
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      toast({
        title: 'No se pudo compartir',
        description: 'Copia la dirección de esta página y envíala a tus vecinos.',
        variant: 'destructive',
      });
    }
  };

  return (
    <section className="rounded-2xl border p-5 md:p-7" style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper)' }}>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--cc-copper)' }}>
            <Users className="h-4 w-4" /> Compra comunitaria
          </div>
          <h2 className="mt-2 text-2xl font-bold cc-text-primary">Una lista común, una compra y un reparto claro</h2>
          <p className="mt-2 max-w-3xl text-sm cc-text-secondary">
            Crea la compra, comparte el enlace con personas de tu comunidad y cada una agrega lo suyo.
            CoCo consolida cantidades, compara supermercados y mayoristas, y calcula cuánto paga cada participante al organizador.
          </p>
        </div>
        <Button onClick={() => void refresh()} disabled={loading} variant="outline">
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
        </Button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {[
          ['1', 'Crea y comparte', 'El enlace abre esta compra directamente.'],
          ['2', 'Cada persona agrega', 'Queda registrado quién pidió cada cantidad.'],
          ['3', 'CoCo reparte', 'El costo se asigna según los productos de cada persona.'],
        ].map(([step, heading, detail]) => (
          <div key={step} className="rounded-xl border p-3" style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper-warm)' }}>
            <p className="text-xs font-bold" style={{ color: 'var(--cc-copper)' }}>PASO {step}</p>
            <p className="mt-1 text-sm font-bold cc-text-primary">{heading}</p>
            <p className="mt-1 text-xs cc-text-secondary">{detail}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[0.75fr_1.25fr]">
        <form onSubmit={create} className="space-y-3 rounded-xl border p-4" style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper-warm)' }}>
          <h3 className="font-bold cc-text-primary">Crear una nueva compra</h3>
          <label className="block text-xs font-semibold cc-text-secondary">
            Nombre
            <input className="input-premium mt-1 h-11 w-full" value={title} onChange={event => setTitle(event.target.value)} placeholder="Ej. Compra mensual Torre A" maxLength={120} />
          </label>
          <label className="block text-xs font-semibold cc-text-secondary">
            Fecha límite para sumarse
            <input className="input-premium mt-1 h-11 w-full" type="date" min={plusDays(0)} value={closesAt} onChange={event => setClosesAt(event.target.value)} />
          </label>
          <label className="block text-xs font-semibold cc-text-secondary">
            Tu lista inicial
            <textarea
              className="input-premium mt-1 min-h-28 w-full p-3"
              value={shoppingList}
              onChange={event => setShoppingList(event.target.value)}
              placeholder={'2 arroz\nleche x 6\naceite'}
              maxLength={1500}
            />
          </label>
          <p className="text-xs cc-text-tertiary">
            Una línea por producto. Si no indicas cantidad, CoCo usa 1. La marca es opcional.
          </p>
          <Button type="submit" disabled={busy === 'create'} className="w-full">
            {busy === 'create' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PackagePlus className="mr-2 h-4 w-4" />}
            Crear compra
          </Button>
        </form>

        <div className="space-y-4">
          {loading && (
            <div className="rounded-xl border p-8 text-center cc-text-secondary" style={{ borderColor: 'var(--cc-line)' }}>
              <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> Cargando compras reales…
            </div>
          )}
          {!loading && visibleOrders.length === 0 && (
            <div className="rounded-xl border p-8 text-center cc-text-secondary" style={{ borderColor: 'var(--cc-line)' }}>
              Todavía no hay compras abiertas o preparadas en tu comunidad.
            </div>
          )}
          {visibleOrders.map(order => {
            const aggregate = new Map<string, number>();
            order.items.forEach(item => aggregate.set(
              item.requestedTerm,
              (aggregate.get(item.requestedTerm) || 0) + item.quantity,
            ));
            const orderComparisons = comparisons[order.id] || [];
            const prepared = order.status === 'locked';
            const best = prepared ? undefined : orderComparisons.find(item => item.complete) || orderComparisons[0];
            const selectedItems = prepared ? order.selectedItems : best?.items || [];
            const selectedStore = prepared ? order.selectedStore : best?.store;
            const retailerUrl = prepared ? order.retailerUrl : best?.retailerUrl;

            return (
              <article
                id={`group-order-${order.id}`}
                key={order.id}
                className="rounded-xl border p-4 scroll-mt-24"
                style={{ borderColor: 'var(--cc-line)' }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold cc-text-primary">{order.title}</h3>
                    <p className="text-xs cc-text-tertiary">
                      Cierra {new Date(`${order.closesAt}T12:00:00`).toLocaleDateString('es-CL')}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" className="h-9 px-3" onClick={() => void share(order)}>
                      <Share2 className="mr-2 h-4 w-4" /> Invitar
                    </Button>
                    <span className="rounded-full px-3 py-2 text-xs font-bold" style={{ background: 'var(--cc-copper-tint)', color: 'var(--cc-copper)' }}>
                      {prepared ? 'Compra preparada' : `${order.items.length} aportes`}
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {order.members.map(member => (
                    <span key={member.userId} className="rounded-full border px-3 py-1 text-xs cc-text-secondary" style={{ borderColor: 'var(--cc-line)' }}>
                      {member.name}
                    </span>
                  ))}
                  {order.members.length === 0 && <span className="text-xs cc-text-tertiary">Aún no se suma nadie.</span>}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {[...aggregate.entries()].map(([term, quantity]) => (
                    <span key={term} className="rounded-full border px-3 py-1 text-xs cc-text-secondary" style={{ borderColor: 'var(--cc-line)' }}>
                      {term}: {quantity}
                    </span>
                  ))}
                </div>

                {!prepared && (
                  <div className="mt-4 rounded-xl border p-3" style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper-warm)' }}>
                    <label className="text-xs font-bold cc-text-secondary" htmlFor={`contribution-${order.id}`}>
                      Agrega tu parte
                    </label>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                      <input
                        id={`contribution-${order.id}`}
                        className="input-premium h-10 flex-1"
                        value={contributions[order.id] || ''}
                        onChange={event => setContributions(previous => ({ ...previous, [order.id]: event.target.value }))}
                        placeholder="2 arroz, leche x 4, detergente"
                      />
                      <Button onClick={() => void join(order.id)} disabled={busy === `join:${order.id}`}>Guardar mi parte</Button>
                      <Button variant="outline" onClick={() => void compare(order.id)} disabled={busy === `compare:${order.id}`}>Ver precios</Button>
                    </div>
                  </div>
                )}

                {(best || prepared) && (
                  <div className="mt-4 rounded-xl border p-3" style={{ borderColor: prepared || best?.complete ? 'var(--cc-sage)' : 'var(--cc-line)', background: 'var(--cc-paper-warm)' }}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-bold uppercase cc-text-tertiary">
                          {prepared ? 'Selección final de CoCo' : best?.channelType === 'wholesale' ? 'Mejor opción mayorista' : 'Mejor opción disponible'}
                        </p>
                        <p className="font-bold cc-text-primary">
                          {selectedStore} · {money(prepared ? order.selectedTotal || 0 : best?.subtotal || 0)}
                        </p>
                      </div>
                      {retailerUrl && (
                        <a href={retailerUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-bold" style={{ color: 'var(--cc-copper)' }}>
                          Ir al comercio <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                    {best && !best.complete && (
                      <p className="mt-2 text-xs cc-text-tertiary">Faltan: {best.missingTerms.join(', ')}</p>
                    )}

                    {prepared && order.settlements.length > 0 && (
                      <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--cc-line)' }}>
                        <div className="flex items-center gap-2">
                          <CircleDollarSign className="h-4 w-4" style={{ color: 'var(--cc-copper)' }} />
                          <p className="text-xs font-bold uppercase cc-text-tertiary">Quién paga cuánto</p>
                        </div>
                        <div className="mt-2 space-y-2">
                          {order.settlements.map(settlement => (
                            <div key={settlement.userId} className="flex items-center justify-between rounded-lg border px-3 py-2" style={{ borderColor: 'var(--cc-line)' }}>
                              <div>
                                <p className="text-sm font-semibold cc-text-primary">{settlement.memberName}</p>
                                <p className="text-xs cc-text-tertiary">
                                  {settlement.isOrganizer ? 'Parte del organizador' : `Debe pagar a ${settlement.payeeName}`}
                                </p>
                              </div>
                              <span className="font-bold cc-text-primary">{money(settlement.amount)}</span>
                            </div>
                          ))}
                        </div>
                        <p className="mt-2 text-xs cc-text-tertiary">
                          Este reparto queda registrado como referencia. La transferencia y su confirmación se realizan fuera de Convive Connect.
                        </p>
                      </div>
                    )}

                    {prepared && selectedItems.length > 0 && (
                      <div className="mt-3 space-y-2 border-t pt-3" style={{ borderColor: 'var(--cc-line)' }}>
                        <p className="text-xs font-bold uppercase cc-text-tertiary">Productos listos para abrir</p>
                        {selectedItems.map(item => (
                          <div key={`${item.requestedTerm}-${item.productUrl || item.name}`} className="flex flex-col justify-between gap-2 rounded-lg border px-3 py-2 sm:flex-row sm:items-center" style={{ borderColor: 'var(--cc-line)' }}>
                            <div>
                              <p className="text-sm font-semibold cc-text-primary">{item.name}</p>
                              <p className="text-xs cc-text-tertiary">
                                Solicitaron {item.requestedQuantity}; comprar {item.quantity} {item.packUnits > 1 ? `pack(s) de ${item.packUnits}` : 'unidad(es)'} · {money(item.lineTotal)}
                              </p>
                            </div>
                            {item.productUrl ? (
                              <a href={item.productUrl} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 text-sm font-bold" style={{ color: 'var(--cc-copper)' }}>
                                Abrir producto <ExternalLink className="h-4 w-4" />
                              </a>
                            ) : (
                              <span className="text-xs cc-text-tertiary">Sin enlace público</span>
                            )}
                          </div>
                        ))}
                        <p className="text-xs cc-text-tertiary">
                          Los precios y el stock se confirman en el comercio. CoCo no compra ni paga sin una integración autorizada.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {order.canManage && !prepared && (
                  <Button className="mt-3" variant="outline" onClick={() => void lock(order.id)} disabled={busy === `lock:${order.id}`}>
                    <LockKeyhole className="mr-2 h-4 w-4" /> Cerrar, elegir tienda y repartir
                  </Button>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
