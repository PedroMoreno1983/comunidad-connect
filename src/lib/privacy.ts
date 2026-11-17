// 2026-11-17: qué ve y qué no ve la administración de las conversaciones con CoCo.
export const PRIVACY_POLICY_VERSION = '2026-11-17';
export const TERMS_VERSION = '2026-07-20';

export const PRIVACY_CONTACT_EMAIL = process.env.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL
    || 'soporte@conviveconnect.com';

export const PRIVACY_RESPONSIBLE_NAME = process.env.NEXT_PUBLIC_PRIVACY_RESPONSIBLE_NAME
    || 'Convive Connect';

export const PRIVACY_RESPONSIBLE_ADDRESS = process.env.NEXT_PUBLIC_PRIVACY_RESPONSIBLE_ADDRESS
    || 'Chile';

/**
 * Aviso de CoCo, en las palabras que ve el residente. El mismo texto en el chat,
 * en el centro de privacidad y en la política: lo que se acepta es esto.
 */
export const COCO_PRIVACY_NOTICE = {
    title: 'Cómo cuida CoCo tus conversaciones',
    points: [
        'Tus conversaciones con CoCo son privadas: la administración de tu comunidad no las lee, no recibe resúmenes ni sabe qué le preguntas.',
        'La administración solo recibe lo que tú le pides a CoCo que le envíe, como una solicitud, una reserva o un reclamo.',
        'Sí ve datos en conjunto, como cuántos vecinos usan CoCo y sobre qué temas consultan, sin textos ni nombres y nunca de grupos de menos de 3 personas.',
        'Tus mensajes los procesa un proveedor de inteligencia artificial para responderte.',
    ],
    accept: 'Entendido',
} as const;

/** Una línea para el primer mensaje por WhatsApp. */
export const COCO_WHATSAPP_PRIVACY_LINE =
    '🔒 Tus mensajes los procesa una inteligencia artificial para responderte; nadie de una administración los lee. Más en conviveconnect.com/privacy';
