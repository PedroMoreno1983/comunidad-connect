const CHILE_TIMEZONE = 'America/Santiago';

/** Fecha civil actual en Chile (YYYY-MM-DD), evitando el desfase UTC de toISOString(). */
export function chileTodayISO(now: Date = new Date()): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: CHILE_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(now);
}

/** Mes civil actual en Chile (YYYY-MM). */
export function chileMonthISO(now: Date = new Date()): string {
    return chileTodayISO(now).slice(0, 7);
}

function chileWeekday(now: Date): number {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: CHILE_TIMEZONE, weekday: 'short' }).format(now);
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name);
}

/** Suma días a una fecha ISO sin cruzar zonas horarias (anclada a mediodía UTC). */
export function addDaysISO(isoDate: string, days: number): string {
    const date = new Date(`${isoDate}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

/** Próxima ocurrencia (>= 1 día adelante) de un día de semana, en calendario chileno. */
export function nextWeekdayISO(targetWeekday: number, now: Date = new Date()): string {
    const current = chileWeekday(now);
    const delta = (targetWeekday + 7 - current) % 7 || 7;
    return addDaysISO(chileTodayISO(now), delta);
}
