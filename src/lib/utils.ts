import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format as fnsFormat, isValid } from 'date-fns';
import { es } from 'date-fns/locale';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function formatCurrency(amount: any): string {
    const num = Number(amount);
    if (isNaN(num)) return '$0';
    return `$${num.toLocaleString('es-CL')}`;
}

export function safeFormatDate(dateStr: string | null | undefined, formatStr: string, useEsLocale: boolean = false): string {
    if (!dateStr) return 'N/A';
    
    // Normalize YYYY-MM to YYYY-MM-01T00:00:00 to avoid timezone shift
    let normalizedStr = dateStr;
    if (dateStr.length === 7) {
        normalizedStr = `${dateStr}-01T00:00:00`;
    }

    const date = new Date(normalizedStr);
    if (!isValid(date)) return 'Fecha inválida';

    return fnsFormat(date, formatStr, useEsLocale ? { locale: es } : undefined);
}
