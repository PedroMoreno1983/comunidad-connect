/**
 * Helpers de presentación del módulo de estacionamientos.
 *
 * Solo formato y etiquetas: la lógica de datos vive en ParkingService (api.ts) y
 * las reglas de negocio en la base de datos.
 */
import type {
    ParkingBookingStatus,
    ParkingDriverVerification,
    ParkingSpotStatus,
    ParkingVehicleSize,
} from '@/lib/types';

/** Índice 0 = domingo, igual que Date.getDay() y que la columna weekday. */
export const WEEKDAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] as const;

export const VEHICLE_SIZE_LABELS: Record<ParkingVehicleSize, string> = {
    moto: 'Moto',
    auto: 'Auto',
    suv: 'SUV',
    camioneta: 'Camioneta',
};

export const SPOT_STATUS_LABELS: Record<ParkingSpotStatus, string> = {
    draft: 'Borrador',
    pending_approval: 'En revisión',
    published: 'Publicado',
    paused: 'Pausado',
    rejected: 'Rechazado',
};

export const SPOT_STATUS_TONES: Record<ParkingSpotStatus, 'neutral' | 'amber' | 'sage' | 'rose'> = {
    draft: 'neutral',
    pending_approval: 'amber',
    published: 'sage',
    paused: 'neutral',
    rejected: 'rose',
};

export const BOOKING_STATUS_LABELS: Record<ParkingBookingStatus, string> = {
    confirmed: 'Confirmada',
    active: 'En curso',
    completed: 'Finalizada',
    cancelled: 'Cancelada',
    no_show: 'No se presentó',
};

export const BOOKING_STATUS_TONES: Record<ParkingBookingStatus, 'sage' | 'copper' | 'neutral' | 'rose'> = {
    confirmed: 'sage',
    active: 'copper',
    completed: 'neutral',
    cancelled: 'rose',
    no_show: 'rose',
};

export const DRIVER_VERIFICATION_LABELS: Record<ParkingDriverVerification, string> = {
    pending: 'Pendiente de verificación',
    verified: 'Verificado',
    rejected: 'Rechazado',
};

/** "10 ago, 14:30" — suficiente para una reserva del mismo mes o del siguiente. */
export function formatParkingMoment(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('es-CL', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    });
}

/** Rango compacto: colapsa el día cuando la reserva empieza y termina el mismo día. */
export function formatParkingRange(startIso: string, endIso: string): string {
    const start = new Date(startIso);
    const end = new Date(endIso);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '—';

    const sameDay = start.toDateString() === end.toDateString();
    if (!sameDay) return `${formatParkingMoment(startIso)} → ${formatParkingMoment(endIso)}`;

    const day = start.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
    const from = start.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
    const to = end.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
    return `${day}, ${from} – ${to}`;
}

export function parkingDurationHours(startIso: string, endIso: string): number {
    const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
    if (!Number.isFinite(ms) || ms <= 0) return 0;
    return Math.ceil(ms / 3_600_000);
}

/**
 * Convierte los valores de un <input type="datetime-local"> a Date.
 * El input entrega hora local del navegador, que es la que el conductor tiene en
 * mente; el Date resultante ya lleva el offset correcto al serializarse a ISO.
 */
export function parseLocalDateTime(value: string): Date | null {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

/** Valor inicial para un <input type="datetime-local"> redondeado a la hora siguiente. */
export function nextHourInputValue(offsetHours = 1): string {
    const date = new Date();
    date.setMinutes(0, 0, 0);
    date.setHours(date.getHours() + offsetHours);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export const FLOOR_LEVEL_LABELS: Record<string, string> = {
    S1: 'Subterráneo -1',
    S2: 'Subterráneo -2',
    S3: 'Subterráneo -3',
    PB: 'Planta Baja',
    EXT: 'Exterior / Visitas',
};

export const SUGGESTED_HOURLY_RATES = [
    { label: 'Económica', rate: 1500, desc: 'Ideal para alta rotación' },
    { label: 'Estándar', rate: 2200, desc: 'Tarifa recomendada' },
    { label: 'Techado / EV', rate: 3000, desc: 'Con cargador o extra amplio' },
];

/** Construye URL directa para abrir la ubicación en Waze */
export function buildWazeNavigationUrl(addressOrDestination: string, coords?: { lat: number; lng: number }): string {
    if (coords && coords.lat && coords.lng) {
        return `https://waze.com/ul?ll=${coords.lat},${coords.lng}&navigate=yes`;
    }
    return `https://waze.com/ul?q=${encodeURIComponent(addressOrDestination)}&navigate=yes`;
}

/** Construye URL directa para abrir en Google Maps */
export function buildGoogleMapsNavigationUrl(addressOrDestination: string, coords?: { lat: number; lng: number }): string {
    if (coords && coords.lat && coords.lng) {
        return `https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lng}`;
    }
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressOrDestination)}`;
}

export interface ParkingTimeStatus {
    isStarted: boolean;
    isOverdue: boolean;
    remainingMinutes: number;
    overdueMinutes: number;
    formattedCountdown: string;
    overstayPenaltyAmount: number;
    progressPercentage: number; // 0 to 100
}

/** Calcula el estado temporal en tiempo real de una reserva activa */
export function calculateParkingTimeStatus(
    startIso: string,
    endIso: string,
    hourlyRate = 2000,
    now = new Date(),
): ParkingTimeStatus {
    const start = new Date(startIso).getTime();
    const end = new Date(endIso).getTime();
    const current = now.getTime();

    const isStarted = current >= start;
    const isOverdue = current > end;

    const totalDurationMs = Math.max(1, end - start);
    const elapsedMs = Math.max(0, current - start);
    const progressPercentage = Math.min(100, Math.max(0, Math.round((elapsedMs / totalDurationMs) * 100)));

    if (isOverdue) {
        const overdueMs = current - end;
        const overdueMinutes = Math.ceil(overdueMs / 60000);
        const hoursOverdue = Math.ceil(overdueMinutes / 60);
        // Recargo de sobreestadía Vimba: 1.5x la tarifa por hora proporcional
        const overstayPenaltyAmount = Math.round(hoursOverdue * (hourlyRate * 1.5));

        const hrs = Math.floor(overdueMinutes / 60);
        const mins = overdueMinutes % 60;
        const formattedCountdown = hrs > 0 ? `+${hrs}h ${mins}m excedido` : `+${mins} min excedido`;

        return {
            isStarted: true,
            isOverdue: true,
            remainingMinutes: 0,
            overdueMinutes,
            formattedCountdown,
            overstayPenaltyAmount,
            progressPercentage: 100,
        };
    }

    const remainingMs = end - current;
    const remainingMinutes = Math.max(0, Math.floor(remainingMs / 60000));
    const hrs = Math.floor(remainingMinutes / 60);
    const mins = remainingMinutes % 60;

    const formattedCountdown = !isStarted
        ? `Inicia en ${Math.max(1, Math.round((start - current) / 60000))} min`
        : hrs > 0
            ? `${hrs}h ${mins}m restantes`
            : `${mins} min restantes`;

    return {
        isStarted,
        isOverdue: false,
        remainingMinutes,
        overdueMinutes: 0,
        formattedCountdown,
        overstayPenaltyAmount: 0,
        progressPercentage,
    };
}

/** Genera la carga útil (payload) para el código QR del pase digital */
export function buildVimbaAccessQrPayload(data: {
    bookingId: string;
    accessCode: string;
    spotLabel: string;
    plate: string;
    driverName: string;
}): string {
    return JSON.stringify({
        app: 'VIMBA_CONVIVE',
        v: 1,
        bid: data.bookingId,
        code: data.accessCode,
        spot: data.spotLabel,
        plt: data.plate,
        drv: data.driverName,
    });
}

