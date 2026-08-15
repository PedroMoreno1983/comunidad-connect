/**
 * Helpers y utilidades para el módulo de Estacionamientos de ComunidadConnect.
 * Incluye gestión de tiempos, disponibilidad, formateo chileno,
 * cálculos de sobreestadía, navegación GPS y códigos de acceso.
 */

import type { ParkingFloorLevel } from './types';

export const VEHICLE_SIZE_LABELS: Record<string, string> = {
    moto: 'Moto',
    auto: 'Auto',
    suv: 'SUV',
    camioneta: 'Camioneta',
};

export const SPOT_STATUS_LABELS: Record<string, string> = {
    draft: 'Borrador',
    published: 'Disponible',
    paused: 'Pausado',
    occupied: 'Ocupado',
    archived: 'Archivado',
};

export const SPOT_STATUS_TONES: Record<string, 'neutral' | 'sage' | 'amber' | 'rose' | 'copper'> = {
    draft: 'neutral',
    published: 'sage',
    paused: 'amber',
    occupied: 'rose',
    archived: 'neutral',
};

export const BOOKING_STATUS_LABELS: Record<string, string> = {
    pending: 'Pendiente',
    confirmed: 'Confirmada',
    active: 'En curso',
    completed: 'Finalizada',
    cancelled: 'Cancelada',
    overstay: 'Tiempo Excedido',
};

export const BOOKING_STATUS_TONES: Record<string, 'neutral' | 'sage' | 'amber' | 'rose' | 'copper'> = {
    pending: 'amber',
    confirmed: 'sage',
    active: 'copper',
    completed: 'neutral',
    cancelled: 'rose',
    overstay: 'rose',
};

export const DRIVER_VERIFICATION_LABELS: Record<string, string> = {
    pending: 'Pendiente de verificación',
    verified: 'Vehículo Verificado',
    rejected: 'Verificación rechazada',
};

export const FLOOR_LEVEL_LABELS: Record<ParkingFloorLevel, string> = {
    S1: 'Subterráneo -1 (S1)',
    S2: 'Subterráneo -2 (S2)',
    S3: 'Subterráneo -3 (S3)',
    PB: 'Planta Baja / Nivel 1',
    EXT: 'Exterior / Superficie',
};

export const SUGGESTED_HOURLY_RATES = [
    { label: 'Económica', rate: 1500 },
    { label: 'Estándar', rate: 2000 },
    { label: 'Techado / Amplio', rate: 2500 },
    { label: 'Con Cargador EV', rate: 3200 },
];

export const WEEKDAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/** Convierte "YYYY-MM-DDTHH:mm" a Date válido o null si es inválido */
export function parseLocalDateTime(value: string): Date | null {
    if (!value) return null;
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
}

/** Devuelve la fecha actual + N horas en formato "YYYY-MM-DDTHH:mm" */
export function nextHourInputValue(plusHours = 1): string {
    const d = new Date();
    d.setHours(d.getHours() + plusHours);
    d.setMinutes(0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Rangos de búsqueda predefinidos */
export function getPresetSearchRange(preset: '2h' | 'afternoon' | 'night' | 'fullday'): { start: string; end: string } {
    const pad = (n: number) => String(n).padStart(2, '0');
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    if (preset === '2h') {
        const start = nextHourInputValue(0);
        const end = nextHourInputValue(2);
        return { start, end };
    }

    if (preset === 'afternoon') {
        return {
            start: `${todayStr}T14:00`,
            end: `${todayStr}T19:30`,
        };
    }

    if (preset === 'night') {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;
        return {
            start: `${todayStr}T20:00`,
            end: `${tomorrowStr}T08:00`,
        };
    }

    // fullday
    return {
        start: `${todayStr}T08:30`,
        end: `${todayStr}T19:30`,
    };
}

/** Formatea una fecha ISO para Chile */
export function formatChileanDateTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString('es-CL', {
        timeZone: 'America/Santiago',
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    });
}

/** Formatea un rango de reserva para Chile */
export function formatParkingRange(startsAt: string, endsAt: string): string {
    const s = new Date(startsAt);
    const e = new Date(endsAt);
    const dateStr = s.toLocaleDateString('es-CL', {
        timeZone: 'America/Santiago',
        weekday: 'short',
        day: 'numeric',
        month: 'short',
    });
    const startTime = s.toLocaleTimeString('es-CL', {
        timeZone: 'America/Santiago',
        hour: '2-digit',
        minute: '2-digit',
    });
    const endTime = e.toLocaleTimeString('es-CL', {
        timeZone: 'America/Santiago',
        hour: '2-digit',
        minute: '2-digit',
    });
    return `${dateStr} · ${startTime} - ${endTime}`;
}

/** Calcula la cantidad de horas (decimales con 1 dígito) entre dos fechas */
export function parkingDurationHours(startsAt: string, endsAt: string): number {
    const s = new Date(startsAt).getTime();
    const e = new Date(endsAt).getTime();
    const diffMs = Math.max(0, e - s);
    return Math.max(1, Math.round((diffMs / 3600000) * 10) / 10);
}

/** Construye enlace directo a Waze para llegar al estacionamiento */
export function buildWazeNavigationUrl(address: string, lat?: number, lng?: number): string {
    if (lat && lng) {
        return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
    }
    return `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;
}

/** Construye enlace directo a Google Maps */
export function buildGoogleMapsNavigationUrl(address: string, lat?: number, lng?: number): string {
    if (lat && lng) {
        return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    }
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
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
        // Recargo de sobreestadía: 1.5x la tarifa por hora proporcional
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
export function buildAccessQrPayload(data: {
    bookingId: string;
    accessCode: string;
    spotLabel: string;
    plate: string;
    driverName: string;
}): string {
    return JSON.stringify({
        app: 'CONVIVE_ACCESS',
        v: 1,
        bid: data.bookingId,
        code: data.accessCode,
        spot: data.spotLabel,
        plt: data.plate,
        drv: data.driverName,
    });
}

/** Construye enlace de WhatsApp para compartir el pase digital */
export function buildParkingShareWhatsAppUrl(params: {
    spotLabel: string;
    accessCode: string;
    plate: string;
    buildingName: string;
    buildingAddress: string;
    range: string;
}): string {
    const text = `🚗 *Pase Digital de Estacionamiento - ${params.buildingName}*
📍 Dirección: ${params.buildingAddress}
🅿️ Puesto asignado: *${params.spotLabel}*
🔑 Código de Portería: *${params.accessCode}*
🚙 Patente autorizada: *${params.plate}*
⏰ Horario: ${params.range}

_Muestra este mensaje o código al ingresar por la barrera de conserjería._`;

    return `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
}

/** Calcula el ahorro estimado frente a un estacionamiento comercial / público tradicional */
export function calculateCommercialSavings(communityAmount: number): {
    commercialEstimate: number;
    savingsAmount: number;
    savingsPercent: number;
} {
    // Tarifa comercial promedio en Santiago/capital suele ser ~1.6x - 1.8x
    const commercialEstimate = Math.round(communityAmount * 1.65);
    const savingsAmount = Math.max(0, commercialEstimate - communityAmount);
    const savingsPercent = Math.round((savingsAmount / commercialEstimate) * 100);
    return {
        commercialEstimate,
        savingsAmount,
        savingsPercent,
    };
}

/** Formatea tarifa por minuto (ej: $33/min) */
export function formatMinuteRate(hourlyRate: number): string {
    const minRate = Math.round(hourlyRate / 60);
    return `$${minRate.toLocaleString('es-CL')}/min`;
}
