/**
 * "Lo próximo a la vista": arma, sin red, lo que el residente ve apenas abre
 * su inicio: su próximo vencimiento, la próxima cuota de su convenio y su
 * próxima reserva o evento de la comunidad.
 *
 * Fuentes (ver AGENTS.md, "Cobranza"):
 *  - Cobros: la cartola unificada de `expenses` + `unit_charges`
 *    (`chargeBalances` de `getUnitStatement`), ya con lo pagado imputado.
 *  - Convenios: `payment_agreements` con sus cuotas (`agreementDueDates`:
 *    la primera vence al firmar y las siguientes el día 5).
 *  - Un convenio vigente cubre lo vencido hasta el día en que se abrió, como en
 *    la habilidad para votar: esos cobros se ven en la cuota, no dos veces.
 */
import type { PaymentAgreement, StatementChargeBalance } from '@/lib/types';
import type {
  BuildResidentNextUpInput,
  NextBookingItem,
  NextChargeItem,
  NextEventItem,
  NextInstallmentItem,
  NextUpAssemblyRow,
  NextUpBookingRow,
  ResidentNextUp,
} from './types';

const CHILE_TIME_ZONE = 'America/Santiago';
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH = /^\d{4}-\d{2}$/;

function chileParts(now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CHILE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const value = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return { date: `${value('year')}-${value('month')}-${value('day')}`, time: `${value('hour')}:${value('minute')}` };
}

/** Fecha civil de Chile (AAAA-MM-DD) de un instante. */
export function chileDateOfInstant(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return chileParts(date).date;
}

function lastDayOfMonth(month: string): string {
  const [year, mon] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return `${month}-${String(last).padStart(2, '0')}`;
}

/** Fecha con la que se ordena un cobro: su vencimiento o, si no tiene, el fin de su mes. */
export function chargeReferenceDate(charge: Pick<StatementChargeBalance, 'dueDate' | 'month'>): string {
  if (charge.dueDate && ISO_DATE.test(charge.dueDate.slice(0, 10))) return charge.dueDate.slice(0, 10);
  if (charge.month && ISO_MONTH.test(charge.month)) return lastDayOfMonth(charge.month);
  return '9999-12-31';
}

export function monthName(month: string | null | undefined): string {
  if (!month || !ISO_MONTH.test(month)) return '';
  return MONTHS[Number(month.slice(5, 7)) - 1] ?? '';
}

/**
 * Rótulo amable del cobro. No repite la glosa interna de cargos como multas o
 * intereses: para el residente es "otro cargo" de su cuenta.
 */
export function friendlyChargeLabel(charge: Pick<StatementChargeBalance, 'kind' | 'month'>): string {
  const name = monthName(charge.month);
  const of = name ? ` de ${name}` : '';
  switch (charge.kind) {
    case 'gasto_comun': return `Gasto común${of}`;
    case 'extraordinary': return `Cuota extraordinaria${of}`;
    case 'service': return `Servicio${of}`;
    default: return `Otro cargo${of}`;
  }
}

function coveringCutoff(agreements: PaymentAgreement[], unitId?: string | null): string | null {
  const cutoffs = agreements
    .filter(agreement => agreement.status === 'active' && (!unitId || agreement.unitId === unitId))
    .map(agreement => chileDateOfInstant(agreement.createdAt))
    .filter(date => ISO_DATE.test(date))
    .sort();
  return cutoffs.length ? cutoffs[cutoffs.length - 1] : null;
}

export function nextCharge(
  chargeBalances: StatementChargeBalance[],
  agreements: PaymentAgreement[],
  today: string,
  unitId?: string | null,
): NextChargeItem {
  const cutoff = coveringCutoff(agreements, unitId);
  const open = chargeBalances
    .filter(charge => Math.round(Number(charge.outstandingAmount) || 0) > 0)
    .filter(charge => !cutoff || chargeReferenceDate(charge) > cutoff)
    .sort((left, right) => chargeReferenceDate(left).localeCompare(chargeReferenceDate(right)) || left.id.localeCompare(right.id));

  if (!open.length) {
    return { state: 'clear', dueDate: null, month: null, label: 'Gasto común', amount: 0, otherOpenCount: 0 };
  }

  const past = open.filter(charge => chargeReferenceDate(charge) < today);
  if (past.length) {
    const oldest = past[0];
    const amount = past.reduce((sum, charge) => sum + Math.round(Number(charge.outstandingAmount) || 0), 0);
    return {
      state: 'open',
      dueDate: chargeReferenceDate(oldest),
      month: oldest.month || null,
      label: friendlyChargeLabel(oldest),
      amount,
      otherOpenCount: open.length - 1,
    };
  }

  const next = open[0];
  return {
    state: 'upcoming',
    dueDate: chargeReferenceDate(next),
    month: next.month || null,
    label: friendlyChargeLabel(next),
    amount: Math.round(Number(next.outstandingAmount) || 0),
    otherOpenCount: open.length - 1,
  };
}

export function nextInstallment(agreements: PaymentAgreement[]): NextInstallmentItem | null {
  const candidates = agreements
    .filter(agreement => agreement.status === 'active')
    .flatMap(agreement => agreement.installments
      .filter(installment => installment.status === 'pending' && ISO_DATE.test(String(installment.dueDate).slice(0, 10)))
      .map(installment => ({
        agreementId: agreement.id,
        agreementTitle: agreement.title,
        sequence: installment.sequence,
        installmentCount: agreement.installmentCount || agreement.installments.length,
        dueDate: String(installment.dueDate).slice(0, 10),
        amount: Math.round(Number(installment.amount) || 0),
      })))
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate) || left.sequence - right.sequence);
  return candidates[0] ?? null;
}

function hhmm(value: string | null | undefined): string {
  return typeof value === 'string' ? value.slice(0, 5) : '';
}

export function nextBooking(rows: NextUpBookingRow[], today: string, nowTime: string): NextBookingItem | null {
  const candidates = rows
    .filter(row => row.status === 'pending' || row.status === 'confirmed')
    .filter(row => ISO_DATE.test(String(row.date).slice(0, 10)))
    .filter(row => {
      const date = String(row.date).slice(0, 10);
      if (date > today) return true;
      if (date < today) return false;
      const end = hhmm(row.end_time);
      return !end || end > nowTime;
    })
    .sort((left, right) => String(left.date).localeCompare(String(right.date)) || hhmm(left.start_time).localeCompare(hhmm(right.start_time)));
  const row = candidates[0];
  if (!row) return null;
  return {
    id: row.id,
    amenityName: row.amenityName?.trim() || 'Espacio común',
    date: String(row.date).slice(0, 10),
    startTime: hhmm(row.start_time),
    endTime: hhmm(row.end_time),
    status: row.status === 'confirmed' ? 'confirmed' : 'pending',
  };
}

export function nextEvent(rows: NextUpAssemblyRow[], today: string): NextEventItem | null {
  const candidates = rows
    .filter(row => row.status === 'in_progress' || (row.status === 'cited' && chileDateOfInstant(row.scheduled_at) >= today))
    .sort((left, right) => (
      Number(right.status === 'in_progress') - Number(left.status === 'in_progress')
      || String(left.scheduled_at).localeCompare(String(right.scheduled_at))
    ));
  const row = candidates[0];
  if (!row) return null;
  const modality = row.modality === 'remote' || row.modality === 'hybrid' ? row.modality : 'in_person';
  return {
    id: row.id,
    title: row.title,
    scheduledAt: row.scheduled_at,
    modality,
    location: row.location?.trim() || '',
    inProgress: row.status === 'in_progress',
  };
}

export function buildResidentNextUp(input: BuildResidentNextUpInput): ResidentNextUp {
  const nowTime = chileParts(input.now ?? new Date()).time;
  return {
    charge: nextCharge(input.chargeBalances, input.agreements, input.today, input.unitId),
    installment: nextInstallment(input.agreements),
    booking: nextBooking(input.bookings, input.today, nowTime),
    event: nextEvent(input.assemblies, input.today),
    hasAgreement: input.agreements.some(agreement => agreement.status === 'active' || agreement.status === 'pending_committee'),
  };
}
