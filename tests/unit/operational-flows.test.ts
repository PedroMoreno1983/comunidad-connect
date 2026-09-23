import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BillingError } from '@/lib/finance/billingService';
import { addMonths, assertBalancedJournal, splitInstallments } from '@/lib/finance/operationalFlows';
import { HIDDEN_SUPERMARKET_STORES, SUPERMARKET_STORES } from '@/lib/supermarketBasket';

describe('splitInstallments', () => {
  it('reparte el resto en la última cuota', () => {
    const rows = splitInstallments(100_000, 3, '2026-03-15');
    expect(rows.map(row => row.amount)).toEqual([33_333, 33_333, 33_334]);
    expect(rows.reduce((sum, row) => sum + row.amount, 0)).toBe(100_000);
    expect(rows.map(row => row.dueDate)).toEqual(['2026-03-15', '2026-04-15', '2026-05-15']);
  });

  it('ajusta el día al último del mes', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
  });

  it('rechaza montos que no alcanzan para las cuotas', () => {
    expect(() => splitInstallments(3, 4, '2026-03-01')).toThrow(BillingError);
    expect(() => splitInstallments(10_000, 1, '2026-03-01')).toThrow(BillingError);
  });
});

describe('assertBalancedJournal', () => {
  it('acepta un asiento cuadrado', () => {
    expect(assertBalancedJournal([
      { debit: 1200, credit: 0 },
      { debit: 0, credit: 1200 },
    ])).toEqual({ debit: 1200, credit: 1200 });
  });

  it('rechaza una sola línea, un cero o un descuadre', () => {
    expect(() => assertBalancedJournal([{ debit: 100, credit: 0 }])).toThrow(BillingError);
    expect(() => assertBalancedJournal([
      { debit: 100, credit: 100 },
      { debit: 0, credit: 100 },
    ])).toThrow(BillingError);
    expect(() => assertBalancedJournal([
      { debit: 100, credit: 0 },
      { debit: 0, credit: 90 },
    ])).toThrow(BillingError);
  });
});

describe('flujos visibles', () => {
  it('muestra Irurzun y deja Tottus fuera del comparador', () => {
    expect(SUPERMARKET_STORES).toContain('Irurzun');
    expect(HIDDEN_SUPERMARKET_STORES).toEqual(['Tottus']);
    expect(SUPERMARKET_STORES).not.toContain('Tottus');
  });

  it('le dice a CoCo dónde quedaron convenios, remuneraciones y el libro', () => {
    const prompt = readFileSync('src/lib/coco/system-prompt.ts', 'utf8');
    expect(prompt).toContain('/admin/finanzas/convenios');
    expect(prompt).toContain('/admin/finanzas/remuneraciones');
    expect(prompt).toContain('/admin/finanzas/contabilidad');
    expect(prompt).toContain('Haulmer');
    expect(prompt).not.toContain('remuneraciones del personal, contabilidad');
  });
});
