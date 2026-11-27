import { normalizeCustomerNumber } from './providers';
import type { PersonalBillExtract } from '@/lib/types';

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function isBillDate(value: unknown): value is string {
    if (typeof value !== 'string' || !/^(?:19|20)\d{2}-\d{2}-\d{2}$/.test(value)) return false;
    const time = Date.parse(value + 'T00:00:00Z');
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

/** Si hay dos valores distintos en un campo, queda pendiente de revisión. */
export function parsePersonalBill(text: string): PersonalBillExtract {
    const source = text.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').toLowerCase();
    const dates = new Set<string>();
    for (const match of source.matchAll(/(?:fecha\s+(?:de\s+)?vencimiento|vencimiento|vence|pagar\s+hasta|pague\s+hasta)\s*(?:el\s+)?[:.]?\s*(?:(\d{4})-(\d{2})-(\d{2})|(\d{1,2})[./-](\d{1,2})[./-](\d{4})|(\d{1,2})\s+(?:de\s+)?([a-z]+)\s+(?:de[l]?\s+)?(\d{4}))\b/g)) {
        const [, isoYear, isoMonth, isoDay, numericDay, numericMonth, numericYear, wordDay, monthName, wordYear] = match;
        const month = isoMonth ?? numericMonth ?? String(MONTHS.indexOf(monthName === 'setiembre' ? 'septiembre' : monthName) + 1);
        const date = [isoYear ?? numericYear ?? wordYear, month.padStart(2, '0'), (isoDay ?? numericDay ?? wordDay).padStart(2, '0')].join('-');
        if (isBillDate(date)) dates.add(date);
    }

    const amounts = new Set<number>();
    for (const match of source.matchAll(/(?:total\s+a\s+pagar|monto\s+a\s+pagar)\s*[:.]?\s*(?:clp\s*)?\$?\s*(-?(?:\d{1,3}(?:\.\d{3})+|\d+))(?![\d.,])/g)) {
        const amount = Number(match[1].replaceAll('.', ''));
        if (Number.isSafeInteger(amount) && amount >= 0 && amount <= 2_147_483_647) amounts.add(amount);
    }

    const identifiers = new Set<string>();
    for (const match of source.matchAll(/(?:n[.°ºo\s]*(?:umero)?\s*(?:de\s+)?(?:cliente|servicio|cuenta)|(?:codigo\s+(?:de\s+)?|id\s+)(?:cliente|servicio))\s*[:#]?\s*(\d[\d.]{2,24}(?:\s*-\s*[\dk])?)(?![\d./-])/g)) {
        identifiers.add(normalizeCustomerNumber(match[1]));
    }

    return {
        customerNumber: identifiers.size === 1 ? [...identifiers][0] : null,
        dueDate: dates.size === 1 ? [...dates][0] : null,
        amount: amounts.size === 1 ? [...amounts][0] : null,
    };
}
