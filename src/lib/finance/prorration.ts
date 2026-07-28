/**
 * Prorrateo de egresos del edificio entre las unidades.
 *
 * El peso chileno no tiene decimales, así que cualquier reparto arrastra un
 * resto: $1.000.000 entre 3 unidades da 333.333,33 cada una. Redondear cada
 * cobro por separado hace que la suma NO cuadre con el total de egresos, lo
 * que en contabilidad de copropiedad es un error real: la administración
 * cobraría de menos (o de más) sin poder explicar la diferencia.
 *
 * Se usa el método del resto mayor: se reparte la parte entera y los pesos
 * sobrantes se asignan de a uno a las unidades con mayor fracción pendiente.
 * Así la suma cuadra exactamente y la diferencia máxima entre unidades con la
 * misma alícuota es de $1.
 */

export type ProrateMethod = 'share' | 'equal';

export interface ProrationUnit {
    id: string;
    label: string;
    /** Alícuota en tanto por mil. null cuando la unidad no la tiene definida. */
    sharePermille: number | null;
}

export interface ProrationExpense {
    id: string;
    category: string;
    label: string;
    /** Monto en pesos. Se redondea a entero antes de repartir. */
    amount: number;
    prorateMethod: ProrateMethod;
}

export interface ProratedItem {
    expenseId: string;
    category: string;
    label: string;
    amount: number;
}

export interface ProratedUnit {
    unitId: string;
    label: string;
    sharePermille: number | null;
    total: number;
    items: ProratedItem[];
}

export interface ProrationResult {
    units: ProratedUnit[];
    /** Suma de los egresos, redondeada a pesos enteros. */
    totalExpenses: number;
    /** Suma de lo efectivamente cobrado. Debe ser igual a totalExpenses. */
    totalCharged: number;
    /**
     * true cuando alguna unidad no tiene alícuota y el reparto por alícuota
     * tuvo que caer a partes iguales. La UI debe advertirlo antes de emitir.
     */
    fellBackToEqualSplit: boolean;
    warnings: string[];
}

/**
 * Reparte un monto entero entre pesos según una lista de ponderadores,
 * garantizando que la suma de las partes sea exactamente el monto.
 */
function distributeByWeights(amount: number, weights: number[]): number[] {
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    if (weights.length === 0) return [];

    // Sin ponderadores útiles (todos cero o negativos), reparte en partes iguales.
    if (totalWeight <= 0) {
        return distributeByWeights(amount, weights.map(() => 1));
    }

    const exact = weights.map(weight => (amount * weight) / totalWeight);
    const floors = exact.map(value => Math.floor(value));
    const distributed = floors.reduce((sum, value) => sum + value, 0);
    let remainder = amount - distributed;

    // Reparte los pesos sobrantes a quienes tienen la fracción más alta.
    // Ante empate, gana el índice menor: hace el resultado determinista, así
    // dos previsualizaciones del mismo mes dan exactamente lo mismo.
    const order = exact
        .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
        .sort((left, right) => (right.fraction - left.fraction) || (left.index - right.index));

    const result = [...floors];
    let cursor = 0;
    while (remainder > 0 && order.length > 0) {
        result[order[cursor % order.length].index] += 1;
        remainder -= 1;
        cursor += 1;
    }
    return result;
}

export function prorateExpenses(
    expenses: ProrationExpense[],
    units: ProrationUnit[],
): ProrationResult {
    const warnings: string[] = [];

    if (units.length === 0) {
        return {
            units: [],
            totalExpenses: 0,
            totalCharged: 0,
            fellBackToEqualSplit: false,
            warnings: ['La comunidad no tiene unidades registradas, no hay entre quiénes repartir.'],
        };
    }

    const unitsWithoutShare = units.filter(unit => unit.sharePermille === null || unit.sharePermille <= 0);
    const shareTotal = units.reduce((sum, unit) => sum + (unit.sharePermille ?? 0), 0);
    const needsShare = expenses.some(expense => expense.prorateMethod === 'share');
    const fellBackToEqualSplit = needsShare && unitsWithoutShare.length > 0;

    if (fellBackToEqualSplit) {
        warnings.push(
            unitsWithoutShare.length === units.length
                ? 'Ninguna unidad tiene alícuota definida: se repartirá en partes iguales.'
                : `${unitsWithoutShare.length} de ${units.length} unidades no tienen alícuota definida, `
                  + 'así que el reparto por alícuota se hará en partes iguales para no cobrar de más a unas y de menos a otras.',
        );
    } else if (needsShare && Math.abs(shareTotal - 1000) > 1) {
        // No es bloqueante: el reparto usa proporciones, así que funciona igual.
        // Pero una suma lejos de 1000‰ casi siempre significa datos mal cargados.
        warnings.push(
            `Las alícuotas suman ${shareTotal.toFixed(2)}‰ en vez de 1000‰. `
            + 'El reparto se hará en proporción, pero conviene revisar la carga de unidades.',
        );
    }

    const useShare = needsShare && !fellBackToEqualSplit;
    const accumulator = new Map<string, ProratedItem[]>(units.map(unit => [unit.id, []]));
    let totalExpenses = 0;

    for (const expense of expenses) {
        const amount = Math.round(expense.amount);
        if (amount <= 0) continue;
        totalExpenses += amount;

        const weights = expense.prorateMethod === 'share' && useShare
            ? units.map(unit => unit.sharePermille ?? 0)
            : units.map(() => 1);

        const shares = distributeByWeights(amount, weights);
        shares.forEach((share, index) => {
            if (share === 0) return;
            accumulator.get(units[index].id)!.push({
                expenseId: expense.id,
                category: expense.category,
                label: expense.label,
                amount: share,
            });
        });
    }

    const proratedUnits: ProratedUnit[] = units.map(unit => {
        const items = accumulator.get(unit.id) ?? [];
        return {
            unitId: unit.id,
            label: unit.label,
            sharePermille: unit.sharePermille,
            total: items.reduce((sum, item) => sum + item.amount, 0),
            items,
        };
    });

    const totalCharged = proratedUnits.reduce((sum, unit) => sum + unit.total, 0);

    return { units: proratedUnits, totalExpenses, totalCharged, fellBackToEqualSplit, warnings };
}

/**
 * Reparte 1000‰ entre n unidades de forma EXACTA (la suma da 1000.0000).
 * Trabaja en diezmilésimas enteras y asigna el sobrante a las primeras unidades
 * — el mismo criterio de "no perder milésimas por redondeo" que el prorrateo.
 * Compartido por la página de Unidades y las herramientas de CoCo.
 */
export function equalSplitPermille(n: number): number[] {
    if (n <= 0) return [];
    const totalUnits = 1000 * 10000; // 10.000.000 diezmilésimas de ‰
    const base = Math.floor(totalUnits / n);
    const remainder = totalUnits - base * n;
    return Array.from({ length: n }, (_, i) => (base + (i < remainder ? 1 : 0)) / 10000);
}
