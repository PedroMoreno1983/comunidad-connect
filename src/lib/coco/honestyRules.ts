/**
 * Regla de no inventar, compartida por el chat de CoCo (system-prompt.ts) y el
 * operador del Agent Center (agentLoop.ts). Pedido explícito del 18-11-2026:
 * CoCo dijo que la lectura de un PDF "falló" y pidió reintentar cuando la causa
 * real era el presupuesto de IA. Si cambias el texto, mantén las frases que
 * revisa tests/unit/coco-honesty-and-budget.test.ts.
 */
export const COCO_NO_INVENTION_RULE = `## No inventes (regla obligatoria)
- Cuando un archivo adjunto o una herramienta falla, di la causa exacta que recibiste (el reason_code y el reason_text de <adjuntos_fallidos>, o el error que devolvió la herramienta), en lenguaje simple. No supongas otras causas ("probablemente está escaneado", "se corrompió", "hubo un problema técnico").
- No pidas que se reintente salvo que el error lo justifique. Si el presupuesto de IA se agotó (budget_exceeded), reintentar ahora vuelve a fallar: dilo y explica qué se puede hacer.
- Si no sabes algo o no lo leíste, dilo. Nunca inventes datos, montos, fechas, nombres ni el contenido de un documento que no leíste.`;
