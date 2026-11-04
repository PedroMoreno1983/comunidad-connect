/**
 * Recordatorios de CoCo: fechas en America/Santiago y textos que salen de la app.
 * Puro. La persistencia vive en el Agent Center (`agent_trigger_rules`).
 */

import { chileTodayISO, nextWeekdayISO } from '@/lib/agent-center/chileDate';

export const CHILE_TIME_ZONE = 'America/Santiago';
export const DEFAULT_REMINDER_TIME = '09:00';
/** El plan Hobby solo permite un cron al día: 12:00 UTC es las 09:00 en Chile (horario de verano). */
export const REMINDER_DAILY_REVIEW = 'Se entrega en la revisión diaria de las 09:00 (hora de Chile), cuando ya llegó la hora pedida.';
export const MAX_REMINDER_NOTE = 240;
export const MAX_ACTIVE_REMINDERS = 20;
export const MAX_ACTIVE_OVERDUE_REMINDERS = 3;

export type ReminderAudience = 'self' | 'overdue_residents' | 'community_notice';
export type ReminderCadence = 'once' | 'monthly';

export type ReminderSchedule = {
    cadence: ReminderCadence;
    dayOfMonth: number | null;
    timeLocal: string;
    runAt: Date;
};

const WEEKDAYS: Record<string, number> = {
    domingo: 0,
    lunes: 1,
    martes: 2,
    miercoles: 3,
    jueves: 4,
    viernes: 5,
    sabado: 6,
};

/** Aviso a quien tiene cobros pendientes: sin montos ni lenguaje de deudor. */
export const OVERDUE_REMINDER_NOTICE = {
    title: 'Tu aporte a la comunidad',
    body: 'Te escribimos para que revises los cobros de tu unidad. En tu estado de cuenta ves el saldo y los abonos. Si ya pagaste, gracias. Si quieres ordenarlos, conversemos un convenio con reserva.',
    whatsappSubject: 'Revisa los cobros de tu unidad',
};

const DEBT_LANGUAGE = /\$\s?\d|\d{1,3}(\.\d{3})+|\bCLP\b|\bpesos\b|\bdeudor|\bmoros|\bmorosidad|\bcorte de (luz|agua|servicio)|\bdemanda|\bcobranza judicial|\bembarg|\bsanci[oó]n/i;

export function noticeHasDebtLanguage(text: string): boolean {
    return DEBT_LANGUAGE.test(text);
}

function pad(value: number) {
    return String(value).padStart(2, '0');
}

export function stripAccents(value: string) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function chileDateISO(instant: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: CHILE_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(instant);
}

export function formatChileNow(now = new Date()): string {
    return new Intl.DateTimeFormat('es-CL', {
        timeZone: CHILE_TIME_ZONE,
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).format(now);
}

/** Instantáneo UTC cuya hora de pared en Chile es `isoDate` + `hhmm`. */
export function santiagoDateTimeToUtc(isoDate: string, hhmm: string): Date {
    const [year, month, day] = isoDate.split('-').map(Number);
    const [hour, minute] = hhmm.split(':').map(Number);
    const desired = Date.UTC(year, month - 1, day, hour, minute, 0);
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: CHILE_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    });
    let guess = desired;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).map(part => [part.type, part.value]));
        const shown = Date.UTC(
            Number(parts.year),
            Number(parts.month) - 1,
            Number(parts.day),
            Number(parts.hour),
            Number(parts.minute),
            Number(parts.second),
        );
        const delta = shown - desired;
        if (delta === 0) break;
        guess -= delta;
    }
    return new Date(guess);
}

export function normalizeReminderTime(value?: string): string | null {
    const time = (value || DEFAULT_REMINDER_TIME).trim();
    const match = time.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    return match ? `${match[1]}:${match[2]}` : null;
}

function nextDayOfMonth(day: number, time: string, now: Date, cadence: ReminderCadence): Date {
    const today = chileDateISO(now);
    const [year, month] = today.split('-').map(Number);
    const thisMonth = santiagoDateTimeToUtc(`${year}-${pad(month)}-${pad(day)}`, time);
    if (cadence === 'once') {
        if (thisMonth.getTime() > now.getTime()) return thisMonth;
        const nextMonth = month === 12 ? 1 : month + 1;
        const nextYear = month === 12 ? year + 1 : year;
        return santiagoDateTimeToUtc(`${nextYear}-${pad(nextMonth)}-${pad(day)}`, time);
    }
    if (thisMonth.getTime() > now.getTime()) return thisMonth;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    return santiagoDateTimeToUtc(`${nextYear}-${pad(nextMonth)}-${pad(day)}`, time);
}

export function nextMonthlyRun(day: number, time: string, after: Date): Date {
    return nextDayOfMonth(day, time, new Date(after.getTime() + 60_000), 'monthly');
}

export function resolveReminderSchedule(
    input: { when?: string; time?: string; repeat?: string },
    now = new Date(),
): { ok: true; schedule: ReminderSchedule } | { ok: false; error: string } {
    const timeLocal = normalizeReminderTime(input.time);
    if (!timeLocal) return { ok: false, error: 'La hora tiene que ser HH:MM, en hora de Chile.' };

    const repeat = stripAccents((input.repeat || 'once').trim().toLowerCase());
    const cadence: ReminderCadence = repeat === 'monthly' || repeat === 'mensual' ? 'monthly' : 'once';
    const when = stripAccents((input.when || '').trim().toLowerCase()).replace(/\s+/g, ' ');
    if (!when) return { ok: false, error: 'Falta el día del recordatorio.' };

    const dayMatch = when.match(/^(?:el\s+)?(?:dia\s+)?(\d{1,2})$/);
    if (dayMatch) {
        const day = Number(dayMatch[1]);
        if (day < 1 || day > 28) return { ok: false, error: 'El día del mes tiene que estar entre 1 y 28, para que exista en febrero.' };
        const runAt = nextDayOfMonth(day, timeLocal, now, cadence);
        return { ok: true, schedule: { cadence, dayOfMonth: day, timeLocal, runAt } };
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(when)) {
        const [year, month, day] = when.split('-').map(Number);
        const probe = new Date(Date.UTC(year, month - 1, day));
        if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
            return { ok: false, error: 'La fecha no existe.' };
        }
        if (cadence === 'monthly') {
            if (day < 1 || day > 28) return { ok: false, error: 'Para repetir cada mes, el día tiene que estar entre 1 y 28.' };
            const runAt = nextDayOfMonth(day, timeLocal, now, 'monthly');
            return { ok: true, schedule: { cadence: 'monthly', dayOfMonth: day, timeLocal, runAt } };
        }
        const runAt = santiagoDateTimeToUtc(when, timeLocal);
        if (runAt.getTime() <= now.getTime()) return { ok: false, error: 'Esa fecha y hora ya pasaron en Chile.' };
        return { ok: true, schedule: { cadence: 'once', dayOfMonth: null, timeLocal, runAt } };
    }

    const weekday = WEEKDAYS[when];
    if (weekday === undefined) return { ok: false, error: 'No entendí la fecha. Usa un día (viernes), una fecha AAAA-MM-DD o un día del mes (día 5).' };
    const date = cadence === 'monthly'
        ? null
        : nextWeekdayISO(weekday, now);
    if (!date) return { ok: false, error: 'Un día de la semana no se puede repetir como día fijo del mes.' };
    const runAt = santiagoDateTimeToUtc(date, timeLocal);
    return { ok: true, schedule: { cadence: 'once', dayOfMonth: null, timeLocal, runAt } };
}

export function reminderAudienceAllowed(role: string | undefined, audience: ReminderAudience): boolean {
    if (audience === 'self') return role === 'admin' || role === 'resident' || role === 'concierge';
    return role === 'admin';
}

/**
 * WhatsApp queda apagado aunque el chat lo pida. Pedro lo enciende con
 * COCO_REMINDER_WHATSAPP=true; recién ahí el scheduler usa la plantilla de aviso.
 */
export function reminderWhatsAppActive(requested: boolean): boolean {
    return requested && process.env.COCO_REMINDER_WHATSAPP === 'true';
}

export function whatsappSubjectForReminder(audience: ReminderAudience, note: string): string {
    if (audience === 'overdue_residents') return OVERDUE_REMINDER_NOTICE.whatsappSubject;
    const clean = note.replace(/\s+/g, ' ').trim();
    if (!clean || noticeHasDebtLanguage(clean)) return 'Tienes un recordatorio en Convive Connect';
    return clean.slice(0, 80);
}

export function describeReminderConfirmation(input: {
    audience: ReminderAudience;
    note: string;
    schedule: ReminderSchedule;
}): { title: string; summary: string } {
    const when = input.schedule.runAt.toLocaleString('es-CL', {
        timeZone: CHILE_TIME_ZONE,
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    });
    const repeat = input.schedule.cadence === 'monthly' ? ' Se repite cada mes.' : '';
    if (input.audience === 'community_notice') {
        return {
            title: 'Programar aviso a la comunidad',
            summary: `Para el ${when} (hora de Chile): ${input.note}.${repeat} ${REMINDER_DAILY_REVIEW}`,
        };
    }
    if (input.audience === 'overdue_residents') {
        return {
            title: 'Avisar por los cobros pendientes',
            summary: `Para el ${when} (hora de Chile) aviso dentro de la app a quien tenga cobros pendientes, sin montos.${repeat} ${REMINDER_DAILY_REVIEW} WhatsApp sigue apagado.`,
        };
    }
    return {
        title: 'Crear recordatorio',
        summary: `Para el ${when} (hora de Chile): ${input.note}.${repeat} ${REMINDER_DAILY_REVIEW}`,
    };
}

export function chileToday(now = new Date()): string {
    return chileTodayISO(now);
}
