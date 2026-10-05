/**
 * Consumo de agua para el prorrateo del gasto común.
 *
 * Las lecturas viven en water_readings con mes en español ("Septiembre") y año.
 * El cobro usa AAAA-MM. Este módulo traduce y calcula m³ entre lecturas consecutivas:
 * sin lectura anterior no se inventa consumo, esa unidad queda fuera del reparto
 * por m³ y el aviso lo dice.
 */

import type { ProrationExpense, ProrationUnit } from './prorration';

const WATER_MONTHS = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export interface WaterReadingSnapshot {
    unitId: string;
    periodMonth: string;
    year: number;
    value: number;
}

export function waterPeriodFromBillingMonth(month: string): { month: string; year: number } {
    const [year, mon] = month.split('-').map(Number);
    return { month: WATER_MONTHS[(mon || 1) - 1] || WATER_MONTHS[0], year };
}

export function previousBillingMonth(month: string): string {
    const [year, mon] = month.split('-').map(Number);
    return mon === 1 ? `${year - 1}-12` : `${year}-${String(mon - 1).padStart(2, '0')}`;
}

/** m³ entre dos lecturas consecutivas. null si falta la anterior o el medidor retrocedió. */
export function consumptionM3(current: number, previous: number | null): number | null {
    if (previous === null || !Number.isFinite(current) || !Number.isFinite(previous)) return null;
    if (current < previous) return null;
    return Math.round((current - previous) * 100) / 100;
}

function readingOf(
    readings: WaterReadingSnapshot[],
    unitId: string,
    period: { month: string; year: number },
): number | null {
    const match = readings.find(row =>
        row.unitId === unitId && row.periodMonth === period.month && row.year === period.year);
    if (!match) return null;
    const value = Number(match.value);
    return Number.isFinite(value) ? value : null;
}

function formatM3(value: number): string {
    return value.toLocaleString('es-CL', { maximumFractionDigits: 2 });
}

/**
 * Si hay egresos de agua y lecturas consecutivas, pasa esos egresos a consumo.
 * El total del egreso no cambia: se reparte por m³. La tarifa $/m³, si viene,
 * solo informa el desglose; no inventa cobros.
 */
export function applyWaterConsumption(input: {
    billingMonth: string;
    expenses: ProrationExpense[];
    units: ProrationUnit[];
    readings: WaterReadingSnapshot[];
    waterRatePerM3?: number;
}): { expenses: ProrationExpense[]; units: ProrationUnit[]; warnings: string[] } {
    const warnings: string[] = [];
    const waterExpenses = input.expenses.filter(expense => expense.category === 'water');
    if (waterExpenses.length === 0 || input.units.length === 0) {
        return { expenses: input.expenses, units: input.units, warnings };
    }

    const currentPeriod = waterPeriodFromBillingMonth(input.billingMonth);
    const previousPeriod = waterPeriodFromBillingMonth(previousBillingMonth(input.billingMonth));
    const units = input.units.map(unit => {
        const current = readingOf(input.readings, unit.id, currentPeriod);
        const previous = readingOf(input.readings, unit.id, previousPeriod);
        return {
            ...unit,
            consumptionM3: current === null ? null : consumptionM3(current, previous),
        };
    });

    const withConsumption = units.filter(unit => (unit.consumptionM3 ?? 0) > 0);
    const missing = units.filter(unit => unit.consumptionM3 === null);
    if (withConsumption.length === 0) {
        warnings.push(
            'Hay un egreso de agua, pero ninguna unidad tiene dos lecturas consecutivas. '
            + 'Se reparte por alícuota o partes iguales, no por m³.',
        );
        return { expenses: input.expenses, units, warnings };
    }

    if (missing.length > 0) {
        warnings.push(
            `${missing.length} unidad(es) sin consumo calculable (falta lectura anterior o el medidor retrocedió). `
            + 'Esas unidades no reciben línea de agua por m³; el resto se reparte entre quienes sí tienen consumo.',
        );
    }

    const rate = Number(input.waterRatePerM3 || 0);
    const expenses = input.expenses.map(expense => {
        if (expense.category !== 'water') return expense;
        const rateNote = rate > 0
            ? ` · tarifa informativa ${formatM3(rate)}/m³`
            : '';
        return {
            ...expense,
            prorateMethod: 'consumption' as const,
            label: `${expense.label}${rateNote}`,
        };
    });

    return { expenses, units, warnings };
}
