/**
 * Rutinas que el administrador pide en el chat.
 * La hora es de Chile. Crear, pausar y borrar piden confirmación.
 * El scheduler (cada 15 min o el diario) entrega el aviso ya confirmado.
 */

import { addDaysISO } from '@/lib/agent-center/chileDate';
import { chileDateISO, santiagoDateTimeToUtc, stripAccents } from '@/lib/coco/reminders';

export type RoutineCadence = 'daily' | 'weekly' | 'monthly';

export type RoutineDraft = {
    cadence: RoutineCadence;
    weekday: number | null;
    dayOfMonth: number | null;
    timeLocal: string;
    instruction: string;
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

function weekdayOf(isoDate: string) {
    return new Date(`${isoDate}T12:00:00Z`).getUTCDay();
}

export function parseRoutineRequest(text: string): RoutineDraft | { error: string } {
    const plain = stripAccents(text.toLowerCase());
    const instruction = text.replace(/\s+/g, ' ').trim().slice(0, 240);
    if (instruction.length < 8) return { error: 'Dime la rutina con un poco más de detalle.' };

    let cadence: RoutineCadence | null = null;
    let weekday: number | null = null;
    let dayOfMonth: number | null = null;

    const week = plain.match(/\b(?:cada|todos los)\s+(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/);
    if (week) {
        cadence = 'weekly';
        weekday = WEEKDAYS[week[1]];
    } else if (/\b(cada dia|todos los dias)\b/.test(plain)) {
        cadence = 'daily';
    } else if (/\bcada mes\b/.test(plain)) {
        cadence = 'monthly';
        const day = plain.match(/\bdia\s+(\d{1,2})\b/);
        dayOfMonth = day ? Number(day[1]) : 1;
        if (!dayOfMonth || dayOfMonth < 1 || dayOfMonth > 28) return { error: 'El día del mes tiene que estar entre 1 y 28.' };
    }
    if (!cadence) return { error: 'Dime cada cuánto: cada lunes, cada día o el día 5 de cada mes.' };

    const clock = plain.match(/\ba las\s+(\d{1,2})(?::(\d{2}))?\b/);
    let timeLocal = '09:00';
    if (clock) {
        const hour = Number(clock[1]);
        const minute = Number(clock[2] || '0');
        if (hour > 23 || minute > 59) return { error: 'La hora no es válida.' };
        timeLocal = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }

    return { cadence, weekday, dayOfMonth, timeLocal, instruction };
}

/** Próxima ocurrencia estrictamente posterior a `now`, en hora de Chile. */
export function nextRoutineInstant(draft: Pick<RoutineDraft, 'cadence' | 'weekday' | 'dayOfMonth' | 'timeLocal'>, now: Date): Date {
    const today = chileDateISO(now);
    for (let offset = 0; offset < 40; offset += 1) {
        const day = addDaysISO(today, offset);
        const instant = santiagoDateTimeToUtc(day, draft.timeLocal);
        if (instant.getTime() <= now.getTime()) continue;
        if (draft.cadence === 'daily') return instant;
        if (draft.cadence === 'weekly' && weekdayOf(day) === draft.weekday) return instant;
        if (draft.cadence === 'monthly' && Number(day.slice(8, 10)) === draft.dayOfMonth) return instant;
    }
    throw new Error('No pude calcular la próxima ejecución.');
}

export function routineDelivery(instruction: string, snapshot: { assemblies: number; bookings: number }) {
    const asksSummary = /resumen/i.test(instruction);
    if (!asksSummary) {
        return `Corrí tu rutina. Pediste: ${instruction.slice(0, 180)}`;
    }
    const assemblies = snapshot.assemblies === 1 ? '1 asamblea próxima' : `${snapshot.assemblies} asambleas próximas`;
    const bookings = snapshot.bookings === 1 ? '1 reserva' : `${snapshot.bookings} reservas`;
    return `Tu resumen: hay ${assemblies} y ${bookings}. El detalle está en Convive.`;
}
