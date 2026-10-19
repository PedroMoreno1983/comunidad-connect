/**
 * Textos de "Lo próximo a la vista". Módulo puro.
 *
 * Convención de cobranza (AGENTS.md): la cuenta se cuenta construyendo
 * comunidad. Al residente, sobre su propia cuenta, se le puede mostrar el monto,
 * pero sin lenguaje de deudor ni amenazas, y siempre con una salida: pagar en
 * línea, conversar o pedir un convenio. `NEXT_UP_FORBIDDEN_LANGUAGE` lo vigila
 * en los tests.
 */
import type { NextBookingItem, NextChargeItem, NextEventItem, NextInstallmentItem } from './types';

const CHILE_TIME_ZONE = 'America/Santiago';

/** Palabras que no van en la tarjeta: deudor, amenazas o castigo. */
export const NEXT_UP_FORBIDDEN_LANGUAGE = /\b(moros[oa]s?|morosidad|deudor(es|a|as)?|deuda(s)?|impag[oa]s?|atrasad[oa]s?|atraso|cobranza|demanda|corte de|suspensi[oó]n|multa(s)?|sanci[oó]n|embarg|intereses? (de|por) mora|vencid[oa]s?|urgente|[úu]ltimo aviso)\b/i;

export function formatMoney(amount: number): string {
  return `$${Math.round(amount).toLocaleString('es-CL')}`;
}

function utcNoon(isoDate: string): Date {
  return new Date(`${isoDate.slice(0, 10)}T12:00:00Z`);
}

/** "5 de noviembre". */
export function formatDayMonth(isoDate: string): string {
  return utcNoon(isoDate).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', timeZone: 'UTC' });
}

/** "jueves 5 de noviembre". */
export function formatWeekdayDayMonth(isoDate: string): string {
  return utcNoon(isoDate).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((utcNoon(toIso).getTime() - utcNoon(fromIso).getTime()) / 86_400_000);
}

/** "hoy", "mañana", "en 3 días"; null si ya pasó. */
export function relativeDay(isoDate: string, today: string): string | null {
  const days = daysBetween(today, isoDate);
  if (days < 0) return null;
  if (days === 0) return 'hoy';
  if (days === 1) return 'mañana';
  return `en ${days} días`;
}

/** Día de la semana y fecha, o "hoy"/"mañana" cuando corresponde. */
export function friendlyDate(isoDate: string, today: string): string {
  const days = daysBetween(today, isoDate);
  if (days === 0) return 'hoy';
  if (days === 1) return 'mañana';
  return formatWeekdayDayMonth(isoDate);
}

export interface NextUpLine {
  title: string;
  detail: string;
  /** Monto que se puede mostrar al propio residente (null si no aplica). */
  amount: number | null;
  note?: string;
}

export function chargeCopy(charge: NextChargeItem, today: string): NextUpLine {
  if (charge.state === 'clear' || !charge.dueDate) {
    return {
      title: 'Estás al día',
      detail: 'Gracias por sostener la comunidad. Cuando se emita el próximo gasto común lo verás aquí.',
      amount: null,
    };
  }
  const others = charge.otherOpenCount > 0
    ? `Además ${charge.otherOpenCount === 1 ? 'hay 1 cobro más' : `hay ${charge.otherOpenCount} cobros más`} en tu cuenta.`
    : undefined;
  if (charge.state === 'upcoming') {
    const when = relativeDay(charge.dueDate, today);
    return {
      title: charge.label,
      detail: when === 'hoy'
        ? 'Vence hoy. Puedes pagarlo en línea en un par de minutos.'
        : `Vence el ${formatDayMonth(charge.dueDate)}${when ? ` (${when})` : ''}.`,
      amount: charge.amount,
      note: others,
    };
  }
  return {
    title: charge.label,
    detail: `Sigue pendiente desde el ${formatDayMonth(charge.dueDate)}. Cuando te acomode, págalo en línea o conversemos una alternativa: un convenio en cuotas también es una opción.`,
    amount: charge.amount,
    note: charge.otherOpenCount > 0 ? 'El monto suma lo pendiente de tu cuenta.' : undefined,
  };
}

export function installmentCopy(installment: NextInstallmentItem, today: string): NextUpLine {
  const when = relativeDay(installment.dueDate, today);
  const date = formatDayMonth(installment.dueDate);
  return {
    title: `Cuota ${installment.sequence} de ${installment.installmentCount} de tu convenio`,
    detail: when === null
      ? `Correspondía el ${date}. Si necesitas ajustar algo, conversemos.`
      : when === 'hoy' ? 'Corresponde hoy.' : `Corresponde el ${date} (${when}).`,
    amount: installment.amount,
  };
}

export function bookingCopy(booking: NextBookingItem, today: string): NextUpLine {
  const hours = booking.startTime && booking.endTime ? `, de ${booking.startTime} a ${booking.endTime}` : booking.startTime ? `, a las ${booking.startTime}` : '';
  return {
    title: booking.amenityName,
    detail: `${capitalize(friendlyDate(booking.date, today))}${hours}.`,
    amount: null,
    note: booking.status === 'pending' ? 'Esperando confirmación de la administración.' : undefined,
  };
}

const MODALITY_LABEL: Record<NextEventItem['modality'], string> = {
  in_person: 'Presencial',
  remote: 'En línea',
  hybrid: 'Presencial y en línea',
};

export function chileTimeOfInstant(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: CHILE_TIME_ZONE });
}

export function eventCopy(event: NextEventItem, today: string, eventDate: string): NextUpLine {
  if (event.inProgress) {
    return { title: event.title, detail: 'La asamblea está en curso. Tu voz suma: entra y participa.', amount: null };
  }
  const place = event.modality === 'in_person' && event.location ? ` · ${event.location}` : ` · ${MODALITY_LABEL[event.modality]}`;
  const time = chileTimeOfInstant(event.scheduledAt);
  return {
    title: event.title,
    detail: `${capitalize(friendlyDate(eventDate, today))}${time ? ` a las ${time}` : ''}${place}.`,
    amount: null,
  };
}

function capitalize(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/** Lo que ve el residente al pedir conversar un convenio desde el inicio. */
export const AGREEMENT_REQUEST_FROM_HOME_SENT = 'Listo: le avisamos a la administración que quieres conversar un convenio. Te contactarán con total reserva.';

/** Aviso en la app para la administración. Sin montos ni lenguaje de deudor. */
export function agreementRequestFromHomeAdminCopy(unitLabel: string) {
  return {
    title: 'Un vecino quiere conversar un convenio',
    body: `La unidad ${unitLabel} pidió conversar un convenio desde su inicio. Contáctala con reserva para acordar las cuotas. La primera cuota vence al firmar.`,
    link: '/admin/finanzas/convenios',
  };
}
