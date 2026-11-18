import type { UtilityProvider, UtilityService } from '@/lib/types';

/**
 * Empresas de luz, agua y gas con su portal oficial de pago.
 *
 * Hoy no hay API que deje pagar la cuenta de un tercero sin contrato (Servipag,
 * Sencillito y Unired lo exigen), así que Convive lleva al residente al portal
 * de la empresa con su n° de cliente a mano para copiarlo. Ninguno de estos
 * portales documenta que acepte el número por la URL.
 *
 * URLs revisadas el 18-11-2026. Las que no tienen página propia de pago
 * (CGE respondió 403; Esval y Lipigas tienen el formulario en la portada)
 * apuntan a la portada.
 */
export const UTILITY_PROVIDERS: readonly UtilityProvider[] = [
    { id: 'enel', name: 'Enel', service: 'electricity', customerNumberLabel: 'N° de cliente',
        payUrl: 'https://www.enel.cl/es/clientes/servicios-en-linea/pago-de-cuenta.html' },
    { id: 'cge', name: 'CGE', service: 'electricity', customerNumberLabel: 'N° de cliente',
        payUrl: 'https://www.cge.cl' },
    { id: 'aguas-andinas', name: 'Aguas Andinas', service: 'water', customerNumberLabel: 'N° de cuenta',
        payUrl: 'https://www.aguasandinas.cl' },
    { id: 'essbio', name: 'Essbio', service: 'water', customerNumberLabel: 'N° de servicio',
        payUrl: 'https://www.essbio.cl/PagoExpress' },
    { id: 'esval', name: 'Esval', service: 'water', customerNumberLabel: 'N° de servicio',
        payUrl: 'https://www.esval.cl' },
    { id: 'metrogas', name: 'Metrogas', service: 'gas', customerNumberLabel: 'N° de cliente',
        payUrl: 'https://www.metrogas.cl/pagar-mi-cuenta' },
    { id: 'lipigas', name: 'Lipigas', service: 'gas', customerNumberLabel: 'N° de cliente',
        payUrl: 'https://lipiappmicuenta.lipigas.cl/app' },
    { id: 'abastible', name: 'Abastible', service: 'gas', customerNumberLabel: 'N° de cliente',
        payUrl: 'https://pagodecuenta.abastible.cl/pago_abastible/' },
];

export const UTILITY_SERVICE_LABELS: Record<UtilityService, string> = {
    electricity: 'Luz',
    water: 'Agua',
    gas: 'Gas',
};

export const UTILITY_SERVICES = Object.keys(UTILITY_SERVICE_LABELS) as UtilityService[];

export function isUtilityService(value: unknown): value is UtilityService {
    return value === 'electricity' || value === 'water' || value === 'gas';
}

export function findUtilityProvider(id: string): UtilityProvider | undefined {
    return UTILITY_PROVIDERS.find(provider => provider.id === id);
}

/** Reconoce la empresa por el nombre que trae una boleta ("ENEL DISTRIBUCIÓN CHILE S.A." → enel). */
export function matchUtilityProvider(name: string): UtilityProvider | undefined {
    const normalized = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    if (!normalized.trim()) return undefined;
    return UTILITY_PROVIDERS.find(provider => normalized.includes(provider.name.toLowerCase()));
}

/** Deja solo dígitos, letras y guion: "12.345.678-9" y "12345678-9" son la misma cuenta. */
export function normalizeCustomerNumber(value: unknown): string {
    return String(value ?? '').toUpperCase().replace(/[^0-9A-Z-]/g, '').slice(0, 40);
}

/**
 * Próximo vencimiento de una cuenta con vencimiento en `dueDay` de cada mes.
 * Un día 31 en un mes de 30 días vence el último día del mes.
 */
export function nextDueDate(dueDay: number, today: string): string {
    const [year, month, day] = today.split('-').map(Number);
    const clamp = (y: number, m: number) => Math.min(dueDay, new Date(Date.UTC(y, m, 0)).getUTCDate());
    const thisMonthDay = clamp(year, month);
    if (day <= thisMonthDay) return `${year}-${String(month).padStart(2, '0')}-${String(thisMonthDay).padStart(2, '0')}`;
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    return `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(clamp(nextYear, nextMonth)).padStart(2, '0')}`;
}

/** Días entre dos fechas civiles AAAA-MM-DD. */
export function daysBetween(from: string, to: string): number {
    return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

/**
 * Compara una boleta con la anterior del mismo n° de cliente. Avisa si se
 * aleja más de un 40% (una fuga de agua, un medidor mal leído, un cobro doble).
 */
export function utilityAmountWarning(amount: number, previous: { amount: number; period: string } | null): string | null {
    if (!previous || previous.amount <= 0 || amount <= 0) return null;
    const change = (amount - previous.amount) / previous.amount;
    if (Math.abs(change) < 0.4) return null;
    const percent = Math.round(Math.abs(change) * 100);
    const money = `$${Math.round(previous.amount).toLocaleString('es-CL')}`;
    return change > 0
        ? `El monto sube ${percent}% frente a la boleta anterior (${previous.period}: ${money}). Revisa si hay una fuga o un error de lectura.`
        : `El monto baja ${percent}% frente a la boleta anterior (${previous.period}: ${money}). Comprueba que la boleta esté completa.`;
}
