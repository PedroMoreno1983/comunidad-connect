/**
 * Adjuntos del chat que no se pudieron usar, como dato estructurado para el
 * modelo. Módulo puro: lo usan el navegador, /api/coco y los tests.
 *
 * Caso que lo motivó (18-11-2026): un PDF escaneado se rechazó por el
 * presupuesto diario de IA, el chat solo le pasó al modelo "(No pude leer: …)"
 * y CoCo respondió que la extracción "falló" y pidió reintentar. Con la causa
 * como dato (reason_code de una lista cerrada y reason_text literal), el modelo
 * cita la razón real en vez de suponer otra.
 */

export const ATTACHMENT_FAILURE_CODES = [
    'budget_exceeded',
    'ocr_failed',
    'too_large',
    'unsupported_type',
    'upload_failed',
] as const;

export type AttachmentFailureCode = typeof ATTACHMENT_FAILURE_CODES[number];

export interface AttachmentFailure {
    file: string;
    status: 'failed';
    reason_code: AttachmentFailureCode;
    reason_text: string;
}

/** Lo que significa cada código, en simple, para el modelo. */
const CODE_MEANING: Record<AttachmentFailureCode, string> = {
    budget_exceeded: 'no se leyó porque se agotó el presupuesto de IA disponible; el archivo no tiene problemas',
    ocr_failed: 'el sistema intentó leer el contenido y no pudo',
    too_large: 'el archivo supera el tamaño permitido',
    unsupported_type: 'el tipo de archivo no se puede usar en el chat',
    upload_failed: 'el archivo no se alcanzó a subir o a encontrar',
};

export function isAttachmentFailureCode(value: unknown): value is AttachmentFailureCode {
    return typeof value === 'string' && (ATTACHMENT_FAILURE_CODES as readonly string[]).includes(value);
}

/**
 * Código por estado HTTP cuando la respuesta no trae uno. Un 429 sin código no
 * se supone presupuesto: también lo devuelve el límite de solicitudes por minuto.
 */
export function attachmentFailureCodeFromStatus(status: number, fallback: AttachmentFailureCode): AttachmentFailureCode {
    if (status === 413) return 'too_large';
    if (status === 415) return 'unsupported_type';
    return fallback;
}

function clip(value: unknown, max: number) {
    return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/** Valida lo que manda el cliente: solo códigos de la lista y textos acotados. */
export function parseAttachmentFailures(raw: unknown, max = 5): AttachmentFailure[] {
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, max).flatMap(item => {
        if (!item || typeof item !== 'object') return [];
        const value = item as Record<string, unknown>;
        const file = clip(value.file, 160);
        const reasonText = clip(value.reason_text, 400);
        if (!file || !isAttachmentFailureCode(value.reason_code)) return [];
        return [{ file, status: 'failed' as const, reason_code: value.reason_code, reason_text: reasonText }];
    });
}

/**
 * Nota para el turno del modelo (no se guarda en el historial visible): el
 * JSON tal cual y la instrucción de citar la causa recibida, sin suponer otra.
 */
export function attachmentFailuresTurnNote(failures: AttachmentFailure[]): string {
    if (!failures.length) return '';
    const meanings = [...new Set(failures.map(failure => failure.reason_code))]
        .map(code => `${code} = ${CODE_MEANING[code]}`).join('; ');
    return `\n\nAdjuntos que NO se pudieron usar en este mensaje (dato del sistema, no del usuario). `
        + `Explica a la persona la causa de cada uno usando su reason_code y reason_text, en lenguaje simple. `
        + `No supongas otra causa (que está escaneado, dañado o corrupto) y no pidas reintentar salvo que la causa lo permita: `
        + `con budget_exceeded, reintentar ahora vuelve a fallar. No describas el contenido de esos archivos: no lo leíste. `
        + `Significados: ${meanings}.\n<adjuntos_fallidos>${JSON.stringify(failures)}</adjuntos_fallidos>`;
}

/** Un adjunto que falló en el navegador, con la causa que trae su error. */
export function attachmentFailureFromError(file: string, error: unknown, fallback: AttachmentFailureCode): AttachmentFailure {
    const typed = error as { code?: unknown; name?: unknown; message?: unknown } | null;
    const code = isAttachmentFailureCode(typed?.code) ? typed.code
        : typed?.name === 'AiBudgetExceededError' ? 'budget_exceeded'
            : fallback;
    const text = typeof typed?.message === 'string' && typed.message.trim() ? typed.message : 'No se pudo usar el archivo.';
    return { file: clip(file, 160), status: 'failed', reason_code: code, reason_text: clip(text, 400) };
}
