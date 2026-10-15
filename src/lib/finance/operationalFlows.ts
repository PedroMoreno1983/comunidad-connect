import { BillingError, DATE_PATTERN } from './billingService';

export interface InstallmentDraft {
  sequence: number;
  dueDate: string;
  amount: number;
}

export interface JournalAmountLine {
  debit: number;
  credit: number;
}

export function addMonths(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const cursor = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)).getUTCDate();
  cursor.setUTCDate(Math.min(day, lastDay));
  return cursor.toISOString().slice(0, 10);
}

/** Día del mes en que vencen las cuotas de un convenio desde la segunda. */
export const AGREEMENT_MONTHLY_DUE_DAY = 5;
/** Días mínimos entre la primera cuota (al firmar) y la segunda. */
export const AGREEMENT_MIN_DAYS_TO_SECOND_INSTALLMENT = 15;

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Fechas de las cuotas de un convenio (Ley 21.442 art. 6; DS 7 art. 9: el
 * copropietario es hábil desde que paga la primera cuota):
 *  - la primera vence el mismo día en que el convenio se firma (queda vigente),
 *    para que quien firma y paga en el acto quede habilitado para votar;
 *  - las siguientes, el día 5 de cada mes, partiendo por el primer día 5 que
 *    quede a 15 días o más de la primera (nunca dos cuotas casi seguidas).
 */
export function agreementDueDates(signedOn: string, count: number): string[] {
  if (!DATE_PATTERN.test(signedOn)) {
    throw new BillingError('bad_date', 'La fecha de firma del convenio va en formato AAAA-MM-DD.');
  }
  const earliestSecond = addDays(signedOn, AGREEMENT_MIN_DAYS_TO_SECOND_INSTALLMENT);
  let second = `${signedOn.slice(0, 7)}-${String(AGREEMENT_MONTHLY_DUE_DAY).padStart(2, '0')}`;
  while (second < earliestSecond) second = addMonths(second, 1);
  return Array.from({ length: Math.max(0, count) }, (_, index) => (index === 0 ? signedOn : addMonths(second, index - 1)));
}

/**
 * Reparte un total en cuotas enteras. La última absorbe el resto para que la
 * suma no se pierda. Las fechas siguen `agreementDueDates`: la primera vence el
 * día de la firma (`signedOn`).
 */
export function splitInstallments(total: number, count: number, signedOn: string): InstallmentDraft[] {
  const amount = Math.round(Number(total));
  const installments = Math.round(Number(count));
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new BillingError('bad_amount', 'El monto del convenio debe ser mayor que cero.');
  }
  if (!Number.isInteger(installments) || installments < 2 || installments > 36) {
    throw new BillingError('bad_count', 'Un convenio tiene entre 2 y 36 cuotas.');
  }
  if (!DATE_PATTERN.test(signedOn)) {
    throw new BillingError('bad_date', 'La primera cuota vence en formato AAAA-MM-DD.');
  }
  const base = Math.floor(amount / installments);
  if (base < 1) {
    throw new BillingError('bad_amount', 'El monto no alcanza para esa cantidad de cuotas.');
  }
  const remainder = amount - base * installments;
  const dueDates = agreementDueDates(signedOn, installments);
  return Array.from({ length: installments }, (_, index) => ({
    sequence: index + 1,
    dueDate: dueDates[index],
    amount: base + (index === installments - 1 ? remainder : 0),
  }));
}

export function assertBalancedJournal(lines: JournalAmountLine[]) {
  if (lines.length < 2) {
    throw new BillingError('unbalanced', 'Un asiento necesita al menos dos líneas.');
  }
  let debit = 0;
  let credit = 0;
  for (const line of lines) {
    const lineDebit = Math.round(Number(line.debit) || 0);
    const lineCredit = Math.round(Number(line.credit) || 0);
    if (lineDebit < 0 || lineCredit < 0 || (lineDebit > 0 && lineCredit > 0) || (lineDebit === 0 && lineCredit === 0)) {
      throw new BillingError('unbalanced', 'Cada línea va al debe o al haber, no a los dos y no en cero.');
    }
    debit += lineDebit;
    credit += lineCredit;
  }
  if (debit !== credit || debit <= 0) {
    throw new BillingError('unbalanced', 'El asiento no cuadra: el debe y el haber tienen que ser iguales.');
  }
  return { debit, credit };
}
