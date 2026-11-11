'use client';

import { useCallback, useEffect, useState } from 'react';
import { Gavel, Handshake, Loader2, Plus, Trash2, Users } from 'lucide-react';
import { CommunityDealsService } from '@/lib/api';
import { useAuth } from '@/lib/authContext';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/cc/Button';
import { Tag } from '@/components/cc/Tag';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency } from '@/lib/utils';
import { DEAL_KIND_LABEL, DEAL_PRICE_UNIT_LABEL, dealMonthlySavings } from '@/lib/communityDealsDomain';
import type {
  CommunityDeal,
  CommunityDealInput,
  CommunityDealKind,
  CommunityDealPriceUnit,
  CommunityDealQuote,
  CommunityDealQuoteInput,
  CommunityDealStatus,
} from '@/lib/types';

const STATUS: Record<CommunityDealStatus, { text: string; tone: 'amber' | 'copper' | 'plum' | 'sage' | 'neutral' | 'rose' }> = {
  proposed: { text: 'Propuesto', tone: 'amber' },
  gauging: { text: 'Sumando interesados', tone: 'copper' },
  quoting: { text: 'Cotizando', tone: 'plum' },
  active: { text: 'Activo', tone: 'sage' },
  closed: { text: 'Cerrado', tone: 'neutral' },
  rejected: { text: 'Descartado', tone: 'rose' },
};

/** Siguiente paso del ciclo que la administración puede dar desde cada estado. */
const NEXT: Partial<Record<CommunityDealStatus, { status: CommunityDealStatus; label: string }>> = {
  proposed: { status: 'gauging', label: 'Abrir a interesados' },
  gauging: { status: 'quoting', label: 'Pasar a cotizar' },
  quoting: { status: 'active', label: 'Activar con la cotización elegida' },
  active: { status: 'closed', label: 'Cerrar convenio' },
};

const EMPTY_DEAL: CommunityDealInput = { title: '', kind: 'vendor_visit', description: '' };
const EMPTY_QUOTE: CommunityDealQuoteInput = { providerName: '', contact: '', offer: '', price: null, priceUnit: 'unit_month' };

function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'Intenta de nuevo.';
}

function priceText(price: number | null, unit: CommunityDealPriceUnit) {
  if (price === null) return 'sin precio';
  return unit === 'discount_percent' ? `${price}% de descuento` : `${formatCurrency(price)} ${DEAL_PRICE_UNIT_LABEL[unit]}`;
}

export function CommunityDealsPanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === 'admin';

  const [deals, setDeals] = useState<CommunityDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState<CommunityDealInput>(EMPTY_DEAL);
  const [showForm, setShowForm] = useState(false);
  const [openDeal, setOpenDeal] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<Record<string, CommunityDealQuote[]>>({});
  const [quoteForm, setQuoteForm] = useState<CommunityDealQuoteInput>(EMPTY_QUOTE);

  const load = useCallback(async () => {
    try {
      setDeals(await CommunityDealsService.list());
    } catch (error) {
      toast({ title: 'No se pudieron cargar los convenios', description: errorText(error), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const run = async (key: string, action: () => Promise<void>, success?: string) => {
    setBusy(key);
    try {
      await action();
      if (success) toast({ title: success, variant: 'success' });
      await load();
    } catch (error) {
      toast({ title: 'No se pudo completar', description: errorText(error), variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const loadQuotes = async (dealId: string) => {
    setOpenDeal(current => current === dealId ? null : dealId);
    try {
      const list = await CommunityDealsService.getQuotes(dealId);
      setQuotes(previous => ({ ...previous, [dealId]: list }));
    } catch (error) {
      toast({ title: 'No se pudieron cargar las cotizaciones', description: errorText(error), variant: 'destructive' });
    }
  };

  const propose = (event: React.FormEvent) => {
    event.preventDefault();
    if (!user?.id || !user.communityId) return;
    const userId = user.id;
    const communityId = user.communityId;
    void run('propose', async () => {
      await CommunityDealsService.propose(userId, communityId, form, isAdmin);
      setForm(EMPTY_DEAL);
      setShowForm(false);
    }, isAdmin ? 'Convenio abierto a interesados' : 'Propuesta enviada a la administración');
  };

  const addQuote = (deal: CommunityDeal) => {
    if (!user?.communityId) return;
    const communityId = user.communityId;
    void run(`quote:${deal.id}`, async () => {
      await CommunityDealsService.addQuote(deal.id, communityId, quoteForm);
      setQuoteForm(EMPTY_QUOTE);
      const fresh = await CommunityDealsService.getQuotes(deal.id);
      setQuotes(previous => ({ ...previous, [deal.id]: fresh }));
    });
  };

  const selectQuote = (deal: CommunityDeal, quote: CommunityDealQuote) => {
    void run(`select:${quote.id}`, () => CommunityDealsService.update(deal.id, {
      selectedQuoteId: quote.id,
      dealPrice: quote.priceUnit === deal.priceUnit ? quote.price : deal.dealPrice,
    }), `Elegida: ${quote.providerName}`);
  };

  const advance = (deal: CommunityDeal) => {
    const next = NEXT[deal.status];
    if (!next) return;
    if (next.status === 'active' && !deal.selectedQuoteId && deal.kind !== 'space_income') {
      toast({ title: 'Elige primero una cotización', variant: 'destructive' });
      return;
    }
    void run(`advance:${deal.id}`, () => CommunityDealsService.update(deal.id, { status: next.status }));
  };

  const editPrices = (deal: CommunityDeal) => {
    const reference = window.prompt('Precio actual sin convenio (en pesos, por la unidad que corresponda):', deal.referencePrice?.toString() ?? '');
    if (reference === null) return;
    const goal = window.prompt('¿Cuántos departamentos necesitan sumarse para que valga la pena?', deal.interestGoal?.toString() ?? '');
    if (goal === null) return;
    void run(`edit:${deal.id}`, () => CommunityDealsService.update(deal.id, {
      referencePrice: reference.trim() ? Number(reference.replace(/[^0-9]/g, '')) : null,
      interestGoal: goal.trim() ? Number(goal.replace(/[^0-9]/g, '')) : null,
    }));
  };

  const toggleAssembly = (deal: CommunityDeal) => {
    const note = deal.needsAssembly ? '' : window.prompt('¿Qué tiene que aprobar la asamblea? (uso de espacio común, contrato a nombre de la comunidad…)', '') ?? '';
    if (!deal.needsAssembly && !note.trim()) return;
    void run(`assembly:${deal.id}`, () => CommunityDealsService.update(deal.id, { needsAssembly: !deal.needsAssembly, assemblyNote: note }));
  };

  const reject = (deal: CommunityDeal) => {
    const note = window.prompt('¿Por qué se descarta? Lo verá quien lo propuso.', '');
    if (!note) return;
    void run(`reject:${deal.id}`, () => CommunityDealsService.update(deal.id, { status: 'rejected', reviewNote: note }));
  };

  const card = 'rounded-2xl border border-subtle bg-surface p-5';
  const visible = deals.filter(deal => deal.status !== 'closed' || isAdmin);

  return (
    <section className="space-y-5">
      <div className={card}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--cc-copper)' }}>
              <Handshake size={15} /> Convenios
            </p>
            <h2 className="mt-1 text-[20px] font-semibold cc-text-primary">Juntos conseguimos mejor precio</h2>
            <p className="mt-1 max-w-2xl text-[13px] cc-text-secondary">
              Una feria que vende en el edificio a cambio del espacio, internet para todos los departamentos, un espacio común
              que genera ingresos. Propón una idea, súmate a las abiertas y la administración cotiza y la activa.
            </p>
          </div>
          <Button size="sm" variant="copper" onClick={() => setShowForm(value => !value)}>
            <Plus size={14} /> {isAdmin ? 'Nuevo convenio' : 'Proponer convenio'}
          </Button>
        </div>

        {showForm && (
          <form onSubmit={propose} className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-[12px] font-medium cc-text-secondary">
              Idea
              <input required minLength={3} maxLength={120} className="input-premium mt-1 h-10 w-full" placeholder="Feria los martes en el hall"
                value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} />
            </label>
            <label className="text-[12px] font-medium cc-text-secondary">
              Tipo
              <select className="input-premium mt-1 h-10 w-full" value={form.kind}
                onChange={event => setForm({ ...form, kind: event.target.value as CommunityDealKind })}>
                {(Object.keys(DEAL_KIND_LABEL) as CommunityDealKind[]).map(kind => <option key={kind} value={kind}>{DEAL_KIND_LABEL[kind]}</option>)}
              </select>
            </label>
            <label className="text-[12px] font-medium cc-text-secondary sm:col-span-2">
              Detalle
              <textarea maxLength={2000} className="input-premium mt-1 min-h-20 w-full p-3"
                placeholder="Qué se ofrece, qué pedimos a cambio, qué días."
                value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} />
            </label>
            <div className="sm:col-span-2">
              <Button type="submit" variant="primary" disabled={busy === 'propose'}>
                {busy === 'propose' && <Loader2 size={14} className="animate-spin" />}
                {isAdmin ? 'Abrir a interesados' : 'Enviar a la administración'}
              </Button>
            </div>
          </form>
        )}
      </div>

      {loading && <p className="text-[13px] cc-text-secondary"><Loader2 size={14} className="mr-2 inline animate-spin" />Cargando convenios…</p>}
      {!loading && visible.length === 0 && (
        <EmptyState icon={<Handshake size={20} />} title="Aún no hay convenios" description="¿Algo que muchos vecinos compran o contratan por separado? Propónlo." />
      )}

      {visible.map(deal => {
        const status = STATUS[deal.status];
        const savings = dealMonthlySavings(deal);
        const next = NEXT[deal.status];
        const open = openDeal === deal.id;
        const dealQuotes = quotes[deal.id] || [];
        const acceptsInterest = ['gauging', 'quoting', 'active'].includes(deal.status);
        return (
          <article key={deal.id} className={card}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold cc-text-primary">
                  {deal.title} <Tag tone={status.tone}>{status.text}</Tag>
                  {deal.needsAssembly && <Tag tone="amber"><Gavel size={11} /> Requiere asamblea</Tag>}
                </p>
                <p className="text-[12px] cc-text-secondary">{DEAL_KIND_LABEL[deal.kind]} · propuesto por {deal.createdByName}</p>
              </div>
              <p className="flex items-center gap-1 text-[13px] font-semibold cc-text-primary">
                <Users size={14} /> {deal.interestedCount}{deal.interestGoal ? ` de ${deal.interestGoal}` : ''} interesados
              </p>
            </div>

            {deal.description && <p className="mt-2 text-[13px] cc-text-secondary">{deal.description}</p>}
            {deal.schedule && <p className="mt-1 text-[12px] cc-text-secondary">Cuándo: {deal.schedule}</p>}
            {deal.terms && <p className="mt-1 text-[12px] cc-text-secondary">Condiciones: {deal.terms}</p>}
            {deal.needsAssembly && deal.assemblyNote && <p className="mt-1 text-[12px]" style={{ color: 'var(--cc-amber)' }}>Asamblea: {deal.assemblyNote}</p>}
            {deal.reviewNote && deal.status === 'rejected' && <p className="mt-1 text-[12px]" style={{ color: 'var(--cc-rose)' }}>Motivo: {deal.reviewNote}</p>}
            {deal.referencePrice !== null && (
              <p className="mt-2 text-[12px] cc-text-secondary">
                Sin convenio: {priceText(deal.referencePrice, deal.priceUnit)}
                {deal.dealPrice !== null ? ` · Con convenio: ${priceText(deal.dealPrice, deal.priceUnit)}` : ''}
                {savings ? ` · Ahorro de la comunidad: ${formatCurrency(savings)} al mes` : ''}
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              {acceptsInterest && (
                <Button size="sm" variant={deal.iAmInterested ? 'ghost' : 'copper'} disabled={busy === `interest:${deal.id}`}
                  onClick={() => void run(`interest:${deal.id}`, async () => { await CommunityDealsService.setInterest(deal.id, !deal.iAmInterested); })}>
                  {deal.iAmInterested ? 'Ya no me interesa' : 'Me sumo'}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => void loadQuotes(deal.id)}>
                {open ? 'Ocultar cotizaciones' : 'Ver cotizaciones'}
              </Button>
              {isAdmin && next && (
                <Button size="sm" variant="primary" disabled={busy === `advance:${deal.id}`} onClick={() => advance(deal)}>{next.label}</Button>
              )}
              {isAdmin && ['proposed', 'gauging', 'quoting'].includes(deal.status) && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => editPrices(deal)}>Precio y meta</Button>
                  <Button size="sm" variant="ghost" onClick={() => toggleAssembly(deal)}>
                    {deal.needsAssembly ? 'No requiere asamblea' : 'Marcar: requiere asamblea'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => reject(deal)}>Descartar</Button>
                </>
              )}
            </div>

            {open && (
              <div className="mt-4 space-y-2 border-t border-subtle pt-3">
                {dealQuotes.length === 0 && <p className="text-[12px] cc-text-secondary">Sin cotizaciones todavía.</p>}
                {dealQuotes.map(quote => (
                  <div key={quote.id} className="flex flex-col gap-2 rounded-xl border border-subtle p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[13px] font-semibold cc-text-primary">
                        {quote.providerName} · {priceText(quote.price, quote.priceUnit)}
                        {deal.selectedQuoteId === quote.id && <span className="ml-2"><Tag tone="sage">Elegida</Tag></span>}
                      </p>
                      {quote.offer && <p className="text-[12px] cc-text-secondary">{quote.offer}</p>}
                      {quote.contact && isAdmin && <p className="text-[12px] cc-text-secondary">Contacto: {quote.contact}</p>}
                    </div>
                    {isAdmin && deal.status === 'quoting' && (
                      <div className="flex gap-2">
                        <Button size="sm" variant="ghost" disabled={deal.selectedQuoteId === quote.id} onClick={() => selectQuote(deal, quote)}>Elegir</Button>
                        <Button size="sm" variant="ghost" aria-label={`Borrar cotización de ${quote.providerName}`}
                          onClick={() => void run(`delquote:${quote.id}`, async () => {
                            await CommunityDealsService.deleteQuote(quote.id);
                            setQuotes({ ...quotes, [deal.id]: dealQuotes.filter(item => item.id !== quote.id) });
                          })}>
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}

                {isAdmin && ['gauging', 'quoting'].includes(deal.status) && (
                  <form className="grid gap-2 sm:grid-cols-4" onSubmit={event => { event.preventDefault(); addQuote(deal); }}>
                    <input required minLength={2} className="input-premium h-9" placeholder="Proveedor" value={quoteForm.providerName}
                      onChange={event => setQuoteForm({ ...quoteForm, providerName: event.target.value })} />
                    <input className="input-premium h-9" inputMode="numeric" placeholder="Precio" value={quoteForm.price ?? ''}
                      onChange={event => setQuoteForm({ ...quoteForm, price: event.target.value ? Number(event.target.value.replace(/[^0-9]/g, '')) : null })} />
                    <select className="input-premium h-9" value={quoteForm.priceUnit}
                      onChange={event => setQuoteForm({ ...quoteForm, priceUnit: event.target.value as CommunityDealPriceUnit })}>
                      {(Object.keys(DEAL_PRICE_UNIT_LABEL) as CommunityDealPriceUnit[]).map(unit => <option key={unit} value={unit}>{DEAL_PRICE_UNIT_LABEL[unit]}</option>)}
                    </select>
                    <Button type="submit" size="sm" variant="primary" disabled={busy === `quote:${deal.id}`}>Agregar cotización</Button>
                    <input className="input-premium h-9 sm:col-span-2" placeholder="Contacto (solo lo ve la administración)" value={quoteForm.contact}
                      onChange={event => setQuoteForm({ ...quoteForm, contact: event.target.value })} />
                    <input className="input-premium h-9 sm:col-span-2" placeholder="Qué ofrece" value={quoteForm.offer}
                      onChange={event => setQuoteForm({ ...quoteForm, offer: event.target.value })} />
                  </form>
                )}
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}
