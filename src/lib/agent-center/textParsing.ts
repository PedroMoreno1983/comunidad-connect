import { addDaysISO, chileMonthISO, chileTodayISO, nextWeekdayISO } from '@/lib/agent-center/chileDate';

export function normalizeText(value: string) {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

export function moneyFromText(text: string) {
    const compact = text.toLowerCase().replace(/\./g, '');
    // Prioridad 1: monto explicito con "$" o frase "a <monto>".
    const explicit = compact.match(/(?:\$\s*|\ba\s+)(\d{1,9})\s*(mil|k)?\b/);
    if (explicit) return explicit[2] ? Number(explicit[1]) * 1000 : Number(explicit[1]);
    // Prioridad 2: numero con sufijo "mil"/"k".
    const suffixed = compact.match(/\b(\d{1,9})\s*(mil|k)\b/);
    if (suffixed) return Number(suffixed[1]) * 1000;
    // Fallback: primer numero que NO sea el identificador de una unidad.
    const withoutUnits = compact.replace(
        /\b(?:departamento|depto|dpto|unidad|torre|casa)\.?\s*(?:n(?:[°ºo]|umero)?\.?\s*)?#?\s*[\p{L}\d][\p{L}\d-]{0,14}/giu,
        ' ',
    );
    const fallback = withoutUnits.match(/\b(\d{1,9})\b/);
    return fallback ? Number(fallback[1]) : 0;
}

export function dateFromText(text: string) {
    const lower = normalizeText(text);
    const iso = lower.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    if (iso) return iso[1];
    if (lower.includes('manana')) {
        return addDaysISO(chileTodayISO(), 1);
    }
    const weekdays: Record<string, number> = {
        domingo: 0,
        lunes: 1,
        martes: 2,
        miercoles: 3,
        jueves: 4,
        viernes: 5,
        sabado: 6,
    };
    const found = Object.entries(weekdays).find(([name]) => lower.includes(name));
    return found ? nextWeekdayISO(found[1]) : chileTodayISO();
}

export function currentMonth() {
    return chileMonthISO();
}

export function monthFromText(text: string) {
    const match = text.match(/\b(20\d{2}-(?:0[1-9]|1[0-2]))\b/);
    return match?.[1] || currentMonth();
}

export function defaultDueDate() {
    return addDaysISO(chileTodayISO(), 10);
}

export function dueDateForExpense(text: string) {
    const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    if (iso) return iso[1];
    if (/\b(venc|vence|vencimiento|hasta|pagar antes)\b/i.test(text)) return dateFromText(text);
    return defaultDueDate();
}

export function timeFromText(text: string) {
    // Evita confundir con horas los numeros de fechas ISO, montos o unidades.
    const match = text.match(/(?<![-\d.$:])([01]?\d|2[0-3])(?::([0-5]\d))?(?![-.\d])/);
    const hour = match ? Number(match[1]) : 10;
    const minute = match?.[2] || '00';
    const start = `${String(hour).padStart(2, '0')}:${minute}`;
    const endHour = Math.min(23, hour + 2);
    return { start, end: `${String(endHour).padStart(2, '0')}:${minute}` };
}
