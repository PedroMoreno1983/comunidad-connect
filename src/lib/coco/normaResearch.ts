import 'server-only';

/**
 * Investigación jurídica de CoCo sobre Norma (base regulatoria chilena de DataWise).
 *
 * consult_official_legal_source lee el texto de 11 leyes fijas en BCN. Norma suma lo que
 * esa herramienta no puede: jurisprudencia del Poder Judicial, sentencias del TC, dictámenes
 * de Contraloría, sanciones de reguladores, búsqueda en todo el corpus normativo e
 * indicadores (UF/UTM) para convertir multas. Se habla con su servidor MCP por JSON-RPC.
 *
 * Solo lectura. La llave (NORMA_MCP_KEY) es del espacio DataWise y no gasta créditos de IA.
 */

const DEFAULT_URL = 'https://norma.datawiseconsultoria.com/api/mcp';
// Medido el 2026-11-10: jurisprudencia y normativa tardan ~12 s (consultan en vivo);
// dictámenes, sanciones e indicadores, menos de 1 s.
const TIMEOUT_MS = 25_000;
// Solo la vía directa de Twilio responde dentro del webhook (corte a los 15 s). El número
// compartido de Norma procesa en segundo plano y espera hasta 90 s: ahí sí caben.
const SLOW_SOURCES = new Set<string>(['jurisprudencia', 'tribunal_constitucional', 'normativa', 'corpus']);
const MAX_RESULT_CHARS = 12_000;

const SOURCES = {
    normativa: 'buscar_normativa',
    corpus: 'buscar_corpus_regulatorio',
    jurisprudencia: 'buscar_jurisprudencia_judicial',
    tribunal_constitucional: 'buscar_sentencias_tc',
    dictamenes_cgr: 'buscar_dictamenes_cgr',
    sanciones: 'buscar_sanciones',
    indicadores: 'indicadores_economicos',
} as const;

export type NormaSource = keyof typeof SOURCES;

export const NORMA_SOURCES = Object.keys(SOURCES) as NormaSource[];

export const NORMA_TRIBUNALS = ['CORTE_SUPREMA', 'CORTES_APELACIONES', 'LABORAL', 'CIVIL', 'PENAL', 'FAMILIA', 'COBRANZA'] as const;

export type NormaResearchInput = {
    source?: string;
    query?: string;
    tribunal?: string;
    limit?: number;
    date?: string;
    convert?: Array<{ monto: number; unidad: string; etiqueta?: string }>;
    /** La respuesta va dentro del webhook síncrono de Twilio: las búsquedas lentas se derivan a la app. */
    syncReply?: boolean;
};

type RpcResponse = {
    result?: { content?: Array<{ type: string; text?: string }>; isError?: boolean };
    error?: { message?: string };
};

export function isNormaConfigured() {
    return Boolean(process.env.NORMA_MCP_KEY);
}

function buildArguments(source: NormaSource, input: NormaResearchInput): Record<string, unknown> | { error: string } {
    const query = (input.query || '').trim().slice(0, 300);
    const limit = Number.isFinite(input.limit) ? Math.max(2, Math.min(8, Math.trunc(input.limit as number))) : undefined;

    if (source === 'indicadores') {
        const args: Record<string, unknown> = {};
        if (input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date)) args.fecha = input.date;
        const convert = (input.convert || [])
            .filter(item => Number.isFinite(item?.monto) && ['UF', 'UTM', 'UTA', 'USD'].includes(item?.unidad))
            .slice(0, 10);
        if (convert.length) args.convertir = convert;
        return args;
    }
    if (!query) return { error: 'Dime qué materia o pregunta jurídica investigar.' };
    if (source === 'sanciones') return { materia: query };

    const args: Record<string, unknown> = { consulta: query };
    if (limit) args.limite = limit;
    if (source === 'jurisprudencia' && input.tribunal && (NORMA_TRIBUNALS as readonly string[]).includes(input.tribunal)) {
        args.tribunal = input.tribunal;
    }
    return args;
}

function parseText(text: string): unknown {
    try { return JSON.parse(text); } catch { return text.slice(0, MAX_RESULT_CHARS); }
}

export async function researchChileanLaw(input: NormaResearchInput) {
    const source = input.source as NormaSource;
    if (!Object.prototype.hasOwnProperty.call(SOURCES, source || '')) {
        return { error: `Fuente no disponible. Usa una de: ${NORMA_SOURCES.join(', ')}.` };
    }
    if (input.syncReply && SLOW_SOURCES.has(source)) {
        return { error: 'Esa búsqueda tarda más de lo que permite WhatsApp. Dile a la persona que la pida en el chat de CoCo en la app; por aquí puedes usar dictamenes_cgr, sanciones o indicadores.' };
    }
    const key = process.env.NORMA_MCP_KEY;
    if (!key) {
        return { error: 'La investigación jurídica ampliada (Norma) no está configurada. Usa consult_official_legal_source para el texto de la ley.' };
    }
    const args = buildArguments(source, input);
    if ('error' in args && typeof args.error === 'string') return args;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const response = await fetch(process.env.NORMA_MCP_URL || DEFAULT_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${key}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: SOURCES[source], arguments: args } }),
            signal: controller.signal,
        });
        if (!response.ok) return { error: `No pude consultar Norma (HTTP ${response.status}). No cites jurisprudencia ni dictámenes que no hayas verificado.` };
        const payload = await response.json() as RpcResponse;
        if (payload.error) return { error: `Norma rechazó la consulta: ${payload.error.message || 'sin detalle'}.` };
        const text = (payload.result?.content || []).filter(block => block.type === 'text').map(block => block.text || '').join('\n');
        if (!text) return { error: 'Norma no devolvió resultados.' };
        if (payload.result?.isError) return { error: text.slice(0, 500) };
        return {
            source,
            provider: 'Norma (DataWise) sobre fuentes oficiales',
            consultedAt: new Date().toISOString(),
            result: parseText(text.length > MAX_RESULT_CHARS ? text.slice(0, MAX_RESULT_CHARS) : text),
            truncated: text.length > MAX_RESULT_CHARS,
        };
    } catch (error) {
        const reason = error instanceof Error && error.name === 'AbortError' ? 'tardó demasiado' : 'no respondió';
        return { error: `Norma ${reason}. No cites jurisprudencia ni dictámenes que no hayas verificado.` };
    } finally {
        clearTimeout(timer);
    }
}
