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

/** Reparte un total en cuotas enteras. La última absorbe el resto para que la suma no se pierda. */
export function splitInstallments(total: number, count: number, startDate: string): InstallmentDraft[] {
  const amount = Math.round(Number(total));
  const installments = Math.round(Number(count));
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new BillingError('bad_amount', 'El monto del convenio debe ser mayor que cero.');
  }
  if (!Number.isInteger(installments) || installments < 2 || installments > 36) {
    throw new BillingError('bad_count', 'Un convenio tiene entre 2 y 36 cuotas.');
  }
  if (!DATE_PATTERN.test(startDate)) {
    throw new BillingError('bad_date', 'La primera cuota vence en formato AAAA-MM-DD.');
  }
  const base = Math.floor(amount / installments);
  if (base < 1) {
    throw new BillingError('bad_amount', 'El monto no alcanza para esa cantidad de cuotas.');
  }
  const remainder = amount - base * installments;
  return Array.from({ length: installments }, (_, index) => ({
    sequence: index + 1,
    dueDate: addMonths(startDate, index),
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
