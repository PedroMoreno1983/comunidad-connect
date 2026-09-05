/**
 * Convierte el historial de compras en una propuesta de recompra.
 *
 * La diferencia con un historial es el trabajo que le ahorra a la persona.
 * "Aca estan tus 40 listas anteriores" la obliga a buscar entre ellas;
 * "compraste leche hace 12 dias, va de nuevo?" le resuelve el problema.
 *
 * Funcion pura a proposito: la parte dificil es decidir que proponer y cuando,
 * y eso se prueba mejor sin base de datos de por medio.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Se propone al llegar al 80% del intervalo tipico. Antes molesta; despues
 * llega tarde, que es peor: la persona ya fue al supermercado sin la leche.
 */
const DUE_RATIO = 0.8;

/**
 * Con una sola compra no hay intervalo que estimar, y adivinar uno seria
 * inventar un habito que no observamos. Se espera a la segunda.
 */
const MIN_PURCHASES = 2;

/** Un intervalo mas largo que esto ya no es un habito, es una coincidencia. */
const MAX_INTERVAL_DAYS = 120;

export interface PurchaseRecord {
  term: string;
  createdAt: string;
}

export interface RepurchaseSuggestion {
  term: string;
  daysSinceLast: number;
  typicalIntervalDays: number;
  purchases: number;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/**
 * Dos comparaciones el mismo dia son la misma compra: alguien que corrige su
 * lista y vuelve a comparar. Contarlas como dos daria un intervalo de cero
 * dias y arruinaria la mediana.
 */
function distinctDays(records: PurchaseRecord[]): number[] {
  const byDay = new Map<string, number>();
  for (const record of records) {
    const date = new Date(record.createdAt);
    if (Number.isNaN(date.getTime())) continue;
    const key = dayKey(date);
    const existing = byDay.get(key);
    if (existing === undefined || date.getTime() > existing) byDay.set(key, date.getTime());
  }
  return [...byDay.values()].sort((left, right) => left - right);
}

export function suggestRepurchases(
  records: PurchaseRecord[],
  now: Date = new Date(),
): RepurchaseSuggestion[] {
  const byTerm = new Map<string, PurchaseRecord[]>();
  for (const record of records) {
    const term = record.term.trim().toLowerCase();
    if (!term) continue;
    byTerm.set(term, [...(byTerm.get(term) ?? []), record]);
  }

  const suggestions: RepurchaseSuggestion[] = [];
  for (const [term, termRecords] of byTerm) {
    const days = distinctDays(termRecords);
    if (days.length < MIN_PURCHASES) continue;

    const intervals: number[] = [];
    for (let index = 1; index < days.length; index += 1) {
      intervals.push((days[index] - days[index - 1]) / DAY_MS);
    }
    const typical = median(intervals);
    if (typical <= 0 || typical > MAX_INTERVAL_DAYS) continue;

    const daysSinceLast = (now.getTime() - days[days.length - 1]) / DAY_MS;
    if (daysSinceLast < typical * DUE_RATIO) continue;

    suggestions.push({
      term,
      daysSinceLast: Math.round(daysSinceLast),
      typicalIntervalDays: Math.round(typical),
      purchases: days.length,
    });
  }

  // Primero lo que lleva mas tiempo sin comprarse respecto de su propio ritmo:
  // un pan que se compra cada 3 dias y lleva 9 urge mas que un detergente
  // mensual que lleva 35.
  return suggestions.sort((left, right) => (
    (right.daysSinceLast / right.typicalIntervalDays) - (left.daysSinceLast / left.typicalIntervalDays)
  ));
}
