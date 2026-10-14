import { addDaysISO, chileTodayISO } from '@/lib/agent-center/chileDate';
import type { CommitteeDigestWindow } from './types';

const CHILE_TIMEZONE = 'America/Santiago';

/** Día de la semana en Chile (0 = domingo). */
export function chileWeekdayOf(now: Date): number {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: CHILE_TIMEZONE, weekday: 'short' }).format(now);
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name);
}

/** Hora civil (0-23) en Chile; respeta el horario de verano. */
export function chileHourOf(now: Date): number {
    const hour = new Intl.DateTimeFormat('en-US', { timeZone: CHILE_TIMEZONE, hour: '2-digit', hourCycle: 'h23' }).format(now);
    return Number(hour) % 24;
}

/**
 * Ventana del resumen. La edición se identifica por el lunes de la semana
 * chilena en curso, así el cron del lunes y un botón a pedido el miércoles
 * apuntan a la misma fila (un resumen por comunidad y semana).
 * Se revisan los 7 días previos a hoy y se mira lo que viene en los próximos 7.
 */
export function committeeDigestWindow(now: Date = new Date()): CommitteeDigestWindow {
    const today = chileTodayISO(now);
    const offsetFromMonday = (chileWeekdayOf(now) + 6) % 7;
    return {
        weekStart: addDaysISO(today, -offsetFromMonday),
        periodStart: addDaysISO(today, -7),
        periodEnd: addDaysISO(today, -1),
        today,
        upcomingEnd: addDaysISO(today, 6),
    };
}

/**
 * Vercel agenda en UTC. Se programan dos disparos los lunes (11:00 y 12:00 UTC)
 * y solo el que cae a las 8:00 de Chile genera: 11:00 UTC en horario de verano
 * (UTC-3) y 12:00 UTC en horario de invierno (UTC-4).
 */
export function isCommitteeDigestCronHour(now: Date = new Date()): boolean {
    return chileWeekdayOf(now) === 1 && chileHourOf(now) === 8;
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "7 al 13 de octubre" o "28 de septiembre al 4 de octubre". */
export function periodLabel(start: string, end: string): string {
    const [, startMonth, startDay] = start.split('-').map(Number);
    const [, endMonth, endDay] = end.split('-').map(Number);
    if (startMonth === endMonth) return `${startDay} al ${endDay} de ${MONTHS[endMonth - 1]}`;
    return `${startDay} de ${MONTHS[startMonth - 1]} al ${endDay} de ${MONTHS[endMonth - 1]}`;
}

/** "13 de octubre". */
export function dayLabel(iso: string): string {
    const [, month, day] = iso.split('-').map(Number);
    return `${day} de ${MONTHS[month - 1]}`;
}
