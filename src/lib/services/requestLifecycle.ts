import type { ServiceRequestTransitionInput } from '@/lib/types';

export function serviceRequestTransitionError(input: ServiceRequestTransitionInput): string | null {
    const { current, next, requester, manager, reschedule } = input;
    if (!requester && !manager) return 'Permisos insuficientes';
    if (current === 'completed' || current === 'cancelled') return 'Esta solicitud ya está cerrada. Crea una nueva solicitud.';
    if (reschedule) return (requester || manager) && ['pending', 'accepted'].includes(current) && next === 'pending'
        ? null : 'Solo se puede reagendar una solicitud pendiente o aceptada.';
    if (next === 'cancelled' && ['pending', 'accepted'].includes(current)) return null;
    if (manager && current === 'pending' && next === 'accepted') return null;
    if (manager && current === 'accepted' && next === 'awaiting_confirmation') return null;
    if (requester && current === 'awaiting_confirmation' && next === 'completed') return null;
    return 'El cambio de estado no corresponde al paso actual. El residente debe confirmar la finalización.';
}

export function validServiceSchedule(date: string, time: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return false;
    const parsed = new Date(`${date}T12:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}
