/**
 * Configuracion global de la aplicacion.
 * Maneja la deteccion de entorno para Capacitor y URLs publicas/API.
 */

const DEFAULT_SITE_URL = 'https://conviveconnect.com';

export const PUBLIC_SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || DEFAULT_SITE_URL
).replace(/\/$/, '');

export const SUPPORT_EMAIL = 'soporte@conviveconnect.com';

// Detectar si estamos corriendo en un dispositivo movil (Capacitor).
export const isNative = typeof window !== 'undefined' &&
  window.location.protocol === 'capacitor:';

// En el celular no podemos usar "/api/..." relativo, necesitamos la URL absoluta de producción.
export const API_BASE_URL = PUBLIC_SITE_URL;

export const getPublicUrl = (path = ''): string => {
  const cleanPath = path ? (path.startsWith('/') ? path : `/${path}`) : '';
  return `${PUBLIC_SITE_URL}${cleanPath}`;
};

/**
 * Helper para construir URLs de API.
 * @param path El path de la api empezando con / (ej: /api/coco)
 */
export const getApiUrl = (path: string): string => {
  // En el navegador web usamos rutas relativas para evitar CORS y permitir previews de Vercel.
  if (typeof window !== 'undefined' && !isNative) {
    return path;
  }

  const baseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  return `${baseUrl}${cleanPath}`;
};
