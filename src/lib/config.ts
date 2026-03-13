/**
 * Configuración global de la aplicación.
 * Maneja la detección de entorno para Capacitor y URLs de API.
 */

// Detectar si estamos corriendo en un dispositivo móvil (Capacitor)
export const isNative = typeof window !== 'undefined' && 
  (window.location.protocol === 'capacitor:' || window.location.protocol === 'http:');

// URL base para las llamadas a la API
// En el celular no podemos usar "/api/..." relativo, necesitamos la URL absoluta de producción.
export const API_BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://comunidadconnect.vercel.app';

/**
 * Helper para construir URLs de API
 * @param path El path de la api empezando con / (ej: /api/coco)
 */
export const getApiUrl = (path: string): string => {
  // Si estamos en un navegador web y NO es Capacitor, usamos la ruta relativa para mayor compatibilidad
  if (typeof window !== 'undefined' && !isNative) {
    return path;
  }
  
  // En Capacitor o ambientes externos, usamos la URL absoluta
  const baseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  
  return `${baseUrl}${cleanPath}`;
};
