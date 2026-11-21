/**
 * Mensajes simples de CoCo con el modelo liviano (19-11-2026).
 *
 * Un mensaje de CoCo en Sonnet 5 cuesta ~20 centavos de dólar cuando la caché
 * está fría y ~1,5 cuando está tibia; con Haiku 5.5 (US$0,10/0,50 por millón,
 * 20× menos) el mismo mensaje cuesta ~1 centavo. Los saludos, agradecimientos
 * y preguntas de "dónde está" o "cómo hago" no necesitan el modelo grande. Lo
 * que escribe datos, lee adjuntos o retoma una acción pendiente sigue en Sonnet.
 */

export const LIGHT_COCO_MODEL = process.env.COCO_LIGHT_MODEL || 'claude-haiku-5-5';

const SMALL_TALK = /^(hola|holi|buen[oa]s?( d[ií]as| tardes| noches)?|gracias|muchas gracias|ok|okay|dale|perfecto|genial|chao|adi[óo]s|nos vemos|qu[ée] tal|c[óo]mo est[áa]s)\b/i;
const HOW_TO = /\b(d[óo]nde (est[áa]|veo|encuentro|queda|se ve|puedo)|c[óo]mo (hago|veo|encuentro|llego|funciona|se usa|puedo)|qu[ée] es|para qu[ée] sirve|qu[ée] puedo hacer|en qu[ée] me (puedes|pod[ée]s) ayudar)\b/i;
/**
 * Preguntas de cuenta que solo leen (21-11-2026): en la prueba de punta a punta
 * "¿cuánto debo y cuándo vence?" costó ~10 centavos en Sonnet. Haiku llama la
 * misma herramienta de solo lectura.
 */
const ACCOUNT_QUESTION = /\b(cu[áa]nto (debo|me toca pagar|tengo que pagar|sale el gasto)|cu[áa]ndo vence|mi saldo|estoy al d[íi]a|mi deuda|estado de (mi )?cuenta|qu[ée] debo)\b/i;

/** Verbos que piden cambiar algo: van al modelo grande aunque el mensaje sea corto. */
const ACTION = /\b(crea|cre[áa]|agrega|agreg[áa]|anota|registra|reserva|cancela|borra|elimina|publica|paga|cobra|env[íi]a|manda|asigna|cambia|actualiza|sube|carga|compra|compara|arma|programa|emite|aprueba|rechaza)\w*/i;

export interface LightTurnInput {
    message: string;
    /** Retoma una acción pendiente de confirmación. */
    resuming: boolean;
    /** Adjuntos (imágenes o documentos) en el turno. */
    attachments: number;
    /** Herramienta obligatoria detectada para el mensaje. */
    requiredTool: string | null;
}

/** El turno puede ir al modelo liviano. */
export function isLightTurn(input: LightTurnInput): boolean {
    if (process.env.COCO_LIGHT_MODEL === 'off') return false;
    if (input.resuming || input.attachments > 0 || input.requiredTool) return false;
    const text = input.message.trim();
    if (!text || text.length > 140) return false;
    if (ACTION.test(text)) return false;
    return SMALL_TALK.test(text) || HOW_TO.test(text) || ACCOUNT_QUESTION.test(text);
}
