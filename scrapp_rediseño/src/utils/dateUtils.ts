// /var/www/datawiseconsultoria.com/app/frontend/src/utils/dateUtils.ts

import { format, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * Formatea fechas de forma segura, manejando TODOS los casos edge
 */
export const safeFormatDate = (
  date: string | Date | null | undefined,
  formatStr: string = "d 'de' MMMM, yyyy"
): string => {
  // Caso 1: null/undefined
  if (!date) return 'Sin fecha';

  try {
    // Caso 2: String vacío
    if (typeof date === 'string' && date.trim() === '') return 'Sin fecha';

    // Caso 3: Parsear fecha
    const parsedDate = typeof date === 'string' ? parseISO(date) : new Date(date);

    // Caso 4: Validar antes de formatear
    if (!isValid(parsedDate)) {
      console.warn('Fecha inválida detectada:', date);
      return 'Fecha inválida';
    }

    // Caso 5: Formatear con date-fns
    return format(parsedDate, formatStr, { locale: es });
    
  } catch (error) {
    console.error('Error formateando fecha:', { date, error });
    return 'Error de fecha';
  }
};

/**
 * Valida si una fecha es válida ANTES de usarla
 */
export const isValidDate = (date: any): boolean => {
  if (!date) return false;
  if (typeof date === 'string' && date.trim() === '') return false;
  
  try {
    const parsed = typeof date === 'string' ? parseISO(date) : new Date(date);
    return isValid(parsed);
  } catch {
    return false;
  }
};