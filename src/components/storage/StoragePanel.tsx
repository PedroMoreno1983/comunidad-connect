'use client';

import { useCallback, useEffect, useState } from 'react';
import { Archive, CheckCircle2, Loader2, PauseCircle, PlayCircle, Plus, Search, Trash2, XCircle } from 'lucide-react';
import { StorageService, nextStorageStartDate } from '@/lib/api';
import { useAuth } from '@/lib/authContext';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/cc/Button';
import { Tag } from '@/components/cc/Tag';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency } from '@/lib/utils';
import type { StorageRental, StorageSearchResult, StorageUnit, StorageUnitInput } from '@/lib/types';

const STATUS_LABEL: Record<StorageUnit['status'], { text: string; tone: 'sage' | 'amber' | 'neutral' | 'rose' }> = {
  published: { text: 'Publicada', tone: 'sage' },
  pending_approval: { text: 'En revisión', tone: 'amber' },
  paused: { text: 'Pausada', tone: 'neutral' },
  rejected: { text: 'Rechazada', tone: 'rose' },
};

const RENTAL_LABEL: Record<StorageRental['status'], string> = {
  active: 'Activo',
  cancelled: 'Cancelado',
  completed: 'Terminado',
};

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'Intenta de nuevo.';
}

const EMPTY_FORM: StorageUnitInput = { label: '', description: '', floorLevel: '', areaM2: null, monthlyRate: 0, minMonths: 1 };

export function StoragePanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === 'admin';

  const [startsOn, setStartsOn] = useState(nextStorageStartDate());
  const [months, setMonths] = useState(3);
  const [results, setResults] = useState<StorageSearchResult[] | null>(null);
  const [myUnits, setMyUnits] = useState<StorageUnit[]>([]);
  const [rentals, setRentals] = useState<{ asTenant: StorageRental[]; asOwner: StorageRental[] }>({ asTenant: [], asOwner: [] });
  const [communityUnits, setCommunityUnits] = useState<StorageUnit[]>([]);
  const [form, setForm] = useState<StorageUnitInput>(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [units, mine] = await Promise.all([
        StorageService.getMyUnits(user.id),
        StorageService.getMyRentals(user.id),
      ]);
      setMyUnits(units);
      setRentals(mine);
      if (isAdmin && user.communityId) setCommunityUnits(await StorageService.getCommunityUnits(user.communityId));
    } catch (error) {
      toast({ title: 'No se pudieron cargar las bodegas', description: errorText(error), variant: 'destructive' });
    }
  }, [user?.id, user?.communityId, isAdmin, toast]);

  useEffect(() => { void load(); }, [load]);

  const search = async () => {
    setBusy('search');
    try {
      setResults(await StorageService.search(startsOn, months));
    } catch (error) {
      toast({ title: 'No se pudo buscar', description: errorText(error), variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const rent = async (unit: StorageSearchResult) => {
    const confirmed = window.confirm(
      `Arrendar ${unit.label} desde ${formatDate(startsOn)} por ${months} ${months === 1 ? 'mes' : 'meses'}.\n`
      + `Se cargarán ${months} cobros de ${formatCurrency(unit.monthlyRate)} a tus gastos comunes (total ${formatCurrency(unit.monthlyRate * months)}).`,
    );
    if (!confirmed) return;
    setBusy(`rent:${unit.id}`);
    try {
      await StorageService.rent(unit.id, startsOn, months);
      toast({ title: 'Bodega arrendada', description: `Los cobros mensuales quedaron en tus gastos comunes.`, variant: 'success' });
      setResults(previous => previous?.filter(item => item.id !== unit.id) ?? null);
      await load();
    } catch (error) {
      toast({ title: 'No se pudo arrendar', description: errorText(error), variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const cancelRental = async (rental: StorageRental) => {
    const reason = window.prompt('¿Por qué cancelas? Se anulan los cobros de los meses que aún no empiezan.', '');
    if (reason === null) return;
    setBusy(`cancel:${rental.id}`);
    try {
      const cancelled = await StorageService.cancelRental(rental.id, reason);
      toast({ title: 'Arriendo cancelado', description: `${cancelled} ${cancelled === 1 ? 'cobro futuro anulado' : 'cobros futuros anulados'}.`, variant: 'success' });
      await load();
    } catch (error) {
      toast({ title: 'No se pudo cancelar', description: errorText(error), variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const publish = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user?.id || !user.communityId) return;
    setBusy('publish');
    try {
      await StorageService.createUnit(user.id, user.communityId, form);
      toast({ title: 'Bodega enviada a revisión', description: 'La administración la aprueba antes de publicarla.', variant: 'success' });
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (error) {
      toast({ title: 'No se pudo publicar', description: errorText(error), variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const changeStatus = async (unit: StorageUnit, status: 'paused' | 'published' | 'pending_approval') => {
    setBusy(`status:${unit.id}`);
    try {
      await StorageService.setUnitStatus(unit.id, status);
      await load();
    } catch (error) {
      toast({ title: 'No se pudo cambiar', description: errorText(error), variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (unit: StorageUnit) => {
    if (!window.confirm(`¿Borrar ${unit.label}?`)) return;
    setBusy(`delete:${unit.id}`);
    try {
      await StorageService.deleteUnit(unit.id);
      await load();
    } catch (error) {
      toast({ title: 'No se pudo borrar', description: errorText(error), variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const review = async (unit: StorageUnit, approved: boolean) => {
    const reason = approved ? '' : window.prompt('Motivo del rechazo (lo verá quien publicó):', '');
    if (!approved && !reason) return;
    setBusy(`review:${unit.id}`);
    try {
      await StorageService.reviewUnit(unit.id, approved, reason || '');
      await load();
    } catch (error) {
      toast({ title: 'No se pudo revisar', description: errorText(error), variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const pendingReview = communityUnits.filter(unit => unit.status === 'pending_approval');
  const activeTenant = rentals.asTenant.filter(rental => rental.status === 'active');
  const card = 'rounded-2xl border border-subtle bg-surface p-5';

  return (
    <div className="space-y-6">
      {isAdmin && pendingReview.length > 0 && (
        <section className={card}>
          <h2 className="text-[15px] font-semibold cc-text-primary">Bodegas por aprobar ({pendingReview.length})</h2>
          <div className="mt-3 space-y-2">
            {pendingReview.map(unit => (
              <div key={unit.id} className="flex flex-col gap-2 rounded-xl border border-subtle p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[14px] font-semibold cc-text-primary">{unit.label} · {formatCurrency(unit.monthlyRate)}/mes</p>
                  <p className="text-[12px] cc-text-secondary">
                    {[unit.floorLevel, unit.areaM2 ? `${unit.areaM2} m²` : '', unit.description].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="copper" disabled={busy === `review:${unit.id}`} onClick={() => void review(unit, true)}>
                    <CheckCircle2 size={14} /> Aprobar
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy === `review:${unit.id}`} onClick={() => void review(unit, false)}>
                    <XCircle size={14} /> Rechazar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className={card}>
        <h2 className="text-[15px] font-semibold cc-text-primary">Arrendar una bodega</h2>
        <p className="mt-1 text-[12px] cc-text-secondary">
          Bodegas de vecinos de tu comunidad. Cada mes se carga un cobro a tus gastos comunes.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="text-[12px] font-medium cc-text-secondary">
            Desde
            <input type="date" className="input-premium mt-1 h-10 w-full" value={startsOn} onChange={event => setStartsOn(event.target.value)} />
          </label>
          <label className="text-[12px] font-medium cc-text-secondary">
            Meses
            <select className="input-premium mt-1 h-10 w-full" value={months} onChange={event => setMonths(Number(event.target.value))}>
              {[1, 2, 3, 6, 12, 24].map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <Button variant="primary" onClick={() => void search()} disabled={busy === 'search'}>
            {busy === 'search' ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Buscar
          </Button>
        </div>

        {results && results.length === 0 && (
          <div className="mt-4">
            <EmptyState icon={<Archive size={20} />} title="No hay bodegas libres en ese período" description="Prueba otra fecha o menos meses." />
          </div>
        )}
        {results && results.length > 0 && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {results.map(unit => (
              <article key={unit.id} className="rounded-xl border border-subtle p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[14px] font-semibold cc-text-primary">{unit.label}</p>
                    <p className="text-[12px] cc-text-secondary">
                      {[unit.floorLevel, unit.areaM2 ? `${unit.areaM2} m²` : '', `de ${unit.ownerName}`].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <p className="text-[14px] font-bold cc-text-primary">{formatCurrency(unit.monthlyRate)}<span className="text-[11px] font-normal cc-text-secondary">/mes</span></p>
                </div>
                {unit.description && <p className="mt-2 text-[12px] cc-text-secondary">{unit.description}</p>}
                <Button className="mt-3" size="sm" variant="copper" block disabled={busy === `rent:${unit.id}`} onClick={() => void rent(unit)}>
                  Arrendar {months} {months === 1 ? 'mes' : 'meses'} · {formatCurrency(unit.totalAmount)}
                </Button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className={card}>
        <h2 className="text-[15px] font-semibold cc-text-primary">Mis arriendos ({activeTenant.length} activos)</h2>
        {rentals.asTenant.length === 0 ? (
          <p className="mt-2 text-[12px] cc-text-secondary">Aún no arriendas ninguna bodega.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {rentals.asTenant.map(rental => (
              <div key={rental.id} className="flex flex-col gap-2 rounded-xl border border-subtle p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[14px] font-semibold cc-text-primary">{rental.storageLabel} · {RENTAL_LABEL[rental.status]}</p>
                  <p className="text-[12px] cc-text-secondary">
                    {formatDate(rental.startsOn)} → {formatDate(rental.endsOn)} · {rental.months} × {formatCurrency(rental.monthlyRate)}
                  </p>
                </div>
                {rental.status === 'active' && (
                  <Button size="sm" variant="ghost" disabled={busy === `cancel:${rental.id}`} onClick={() => void cancelRental(rental)}>
                    Cancelar
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={card}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold cc-text-primary">Mis bodegas ({myUnits.length})</h2>
          <Button size="sm" variant="ghost" onClick={() => setShowForm(value => !value)}>
            <Plus size={14} /> Publicar bodega
          </Button>
        </div>

        {showForm && (
          <form onSubmit={publish} className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-[12px] font-medium cc-text-secondary">
              Nombre
              <input required maxLength={40} className="input-premium mt-1 h-10 w-full" placeholder="Bodega 14" value={form.label} onChange={event => setForm({ ...form, label: event.target.value })} />
            </label>
            <label className="text-[12px] font-medium cc-text-secondary">
              Precio mensual
              <input required type="number" min={1} className="input-premium mt-1 h-10 w-full" placeholder="35000" value={form.monthlyRate || ''} onChange={event => setForm({ ...form, monthlyRate: Number(event.target.value) })} />
            </label>
            <label className="text-[12px] font-medium cc-text-secondary">
              Piso o ubicación
              <input maxLength={20} className="input-premium mt-1 h-10 w-full" placeholder="Subterráneo -2" value={form.floorLevel} onChange={event => setForm({ ...form, floorLevel: event.target.value })} />
            </label>
            <label className="text-[12px] font-medium cc-text-secondary">
              Tamaño (m²)
              <input type="number" min={0} step="0.1" className="input-premium mt-1 h-10 w-full" value={form.areaM2 ?? ''} onChange={event => setForm({ ...form, areaM2: event.target.value ? Number(event.target.value) : null })} />
            </label>
            <label className="text-[12px] font-medium cc-text-secondary">
              Meses mínimos
              <input type="number" min={1} max={24} className="input-premium mt-1 h-10 w-full" value={form.minMonths ?? 1} onChange={event => setForm({ ...form, minMonths: Number(event.target.value) })} />
            </label>
            <label className="text-[12px] font-medium cc-text-secondary sm:col-span-2">
              Descripción
              <textarea maxLength={500} className="input-premium mt-1 min-h-20 w-full p-3" placeholder="Seca, con repisas, acceso por ascensor." value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} />
            </label>
            <div className="sm:col-span-2">
              <Button type="submit" variant="copper" disabled={busy === 'publish'}>
                {busy === 'publish' && <Loader2 size={14} className="animate-spin" />} Enviar a revisión
              </Button>
            </div>
          </form>
        )}

        <div className="mt-4 space-y-2">
          {myUnits.length === 0 && !showForm && (
            <p className="text-[12px] cc-text-secondary">¿Tienes una bodega que no usas? Publícala y arriéndala a un vecino.</p>
          )}
          {myUnits.map(unit => {
            const status = STATUS_LABEL[unit.status];
            const rentedNow = rentals.asOwner.find(rental => rental.storageId === unit.id && rental.status === 'active');
            return (
              <div key={unit.id} className="flex flex-col gap-2 rounded-xl border border-subtle p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="flex items-center gap-2 text-[14px] font-semibold cc-text-primary">
                    {unit.label} <Tag tone={status.tone}>{status.text}</Tag>
                  </p>
                  <p className="text-[12px] cc-text-secondary">
                    {formatCurrency(unit.monthlyRate)}/mes
                    {rentedNow ? ` · arrendada hasta ${formatDate(rentedNow.endsOn)}` : ''}
                    {unit.rejectionReason ? ` · Rechazo: ${unit.rejectionReason}` : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  {unit.status === 'published' && (
                    <Button size="sm" variant="ghost" disabled={busy === `status:${unit.id}`} onClick={() => void changeStatus(unit, 'paused')}>
                      <PauseCircle size={14} /> Pausar
                    </Button>
                  )}
                  {unit.status === 'paused' && (
                    <Button size="sm" variant="ghost" disabled={busy === `status:${unit.id}`} onClick={() => void changeStatus(unit, 'published')}>
                      <PlayCircle size={14} /> Retomar
                    </Button>
                  )}
                  {unit.status === 'rejected' && (
                    <Button size="sm" variant="ghost" disabled={busy === `status:${unit.id}`} onClick={() => void changeStatus(unit, 'pending_approval')}>
                      Reenviar a revisión
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" disabled={busy === `delete:${unit.id}`} onClick={() => void remove(unit)} aria-label={`Borrar ${unit.label}`}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
