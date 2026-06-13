import Anthropic from '@anthropic-ai/sdk';
import type {
    ReelAgentInput,
    ReelAudience,
    ReelCreativePackage,
    ReelScene,
    ReelTone,
} from '@/lib/types';

const DEFAULT_DURATION = 35;
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-5';

const AUDIENCE_LABELS: Record<ReelAudience, string> = {
    administrators: 'Administradores de condominios',
    committee: 'Comites de administracion',
    residents: 'Residentes y propietarios',
    property_managers: 'Empresas de administracion',
};

const TONE_LABELS: Record<ReelTone, string> = {
    premium: 'premium, confiable y comercial',
    urgent: 'directo, urgente y orientado a dolor operativo',
    warm: 'cercano, humano y comunitario',
    educational: 'claro, didactico y consultivo',
};

const PRODUCT_FACTS = [
    'ConviveConnect es una plataforma SaaS multi-tenant para condominios en Chile.',
    'Incluye residentes, gastos comunes, amenidades, votaciones, marketplace vecinal, servicios, conserjeria, comunicaciones y CoCo Agent Center.',
    'CoCo Agent Center prepara acciones reales con permisos, confirmacion humana y auditoria.',
    'La app ya usa datos reales de Supabase en los modulos principales.',
    'Los pagos via Haulmer y WhatsApp quedan condicionados a credenciales/permisos externos cuando corresponda.',
].join('\n');

function cleanText(value: unknown, fallback = '') {
    return typeof value === 'string' ? value.trim() : fallback;
}

function clampDuration(value: unknown) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return DEFAULT_DURATION;
    return Math.max(15, Math.min(60, Math.round(numeric)));
}

function normalizeAudience(value: unknown): ReelAudience {
    return value === 'committee' || value === 'residents' || value === 'property_managers'
        ? value
        : 'administrators';
}

function normalizeTone(value: unknown): ReelTone {
    return value === 'urgent' || value === 'warm' || value === 'educational'
        ? value
        : 'premium';
}

export function normalizeReelInput(raw: Record<string, unknown>): ReelAgentInput {
    const featureFocus = cleanText(raw.featureFocus, 'Agent Center');
    const objective = cleanText(raw.objective, `Mostrar como ConviveConnect ayuda a gestionar condominios con ${featureFocus}.`);

    return {
        objective: objective.slice(0, 500),
        audience: normalizeAudience(raw.audience),
        tone: normalizeTone(raw.tone),
        durationSeconds: clampDuration(raw.durationSeconds),
        featureFocus: featureFocus.slice(0, 120),
        proofPoint: cleanText(raw.proofPoint).slice(0, 220) || undefined,
        offer: cleanText(raw.offer).slice(0, 180) || undefined,
        callToAction: cleanText(raw.callToAction, 'Agenda una demo en conviveconnect.com').slice(0, 160),
    };
}

function splitSceneTimes(durationSeconds: number, count: number) {
    const segment = Math.max(3, Math.round(durationSeconds / count));
    return Array.from({ length: count }, (_, index) => {
        const start = Math.min(durationSeconds - 1, index * segment);
        const end = index === count - 1 ? durationSeconds : Math.min(durationSeconds, (index + 1) * segment);
        return `${start}-${end}s`;
    });
}

function buildFallbackScenes(input: ReelAgentInput): ReelScene[] {
    const times = splitSceneTimes(input.durationSeconds, 5);
    const audience = AUDIENCE_LABELS[input.audience].toLowerCase();
    const proof = input.proofPoint || 'datos reales, permisos por rol y trazabilidad';
    const cta = input.callToAction || 'Agenda una demo en conviveconnect.com';

    return [
        {
            time: times[0],
            visual: 'Plano rapido de un administrador alternando Excel, WhatsApp y una bandeja de correos.',
            onScreenText: 'Administrar un edificio no deberia vivir en 5 sistemas.',
            voiceOver: `Si gestionas condominios, sabes que el problema no es solo cobrar: es coordinar, responder y dejar trazabilidad.`,
            productionNote: 'Usar cortes rapidos y pantalla con caos visual controlado.',
        },
        {
            time: times[1],
            visual: 'Captura o mockup de ConviveConnect mostrando gastos, reservas y solicitudes en una sola vista.',
            onScreenText: 'ConviveConnect centraliza la operacion.',
            voiceOver: `ConviveConnect ordena gastos, amenidades, solicitudes, comunicaciones y comunidad en una plataforma para ${audience}.`,
            productionNote: 'Mostrar interfaz real; evitar imagenes genericas.',
        },
        {
            time: times[2],
            visual: 'Vista del Agent Center preparando una accion y pidiendo confirmacion.',
            onScreenText: 'CoCo propone. Tu confirmas. Todo queda auditado.',
            voiceOver: `CoCo Agent Center prepara acciones reales, pide confirmacion y registra cada paso antes de tocar datos sensibles.`,
            productionNote: 'Acercamiento a la tarjeta de confirmacion y bitacora.',
        },
        {
            time: times[3],
            visual: 'Secuencia de residente reservando un espacio, conserjeria registrando visita y admin revisando estado.',
            onScreenText: proof,
            voiceOver: `El resultado es menos coordinacion manual y mas visibilidad para administracion, conserjeria y residentes.`,
            productionNote: 'Tres cortes de 1 segundo con iconos o pantallas reales.',
        },
        {
            time: times[4],
            visual: 'Cierre con logo ConviveConnect y URL visible.',
            onScreenText: cta,
            voiceOver: `${cta}. Convierte la administracion del edificio en una operacion clara y trazable.`,
            productionNote: 'Mantener URL grande y legible en vertical 9:16.',
        },
    ];
}

function fallbackPackage(input: ReelAgentInput): ReelCreativePackage {
    const scenes = buildFallbackScenes(input);
    const hook = input.tone === 'urgent'
        ? 'Tu condominio esta perdiendo horas en coordinacion manual.'
        : 'El edificio puede funcionar como una operacion moderna, no como un grupo de chats.';
    const hashtags = ['#ConviveConnect', '#CondominiosChile', '#AdministracionDeCondominios', '#PropTech', '#ComunidadDigital'];

    return {
        id: `reel-${Date.now()}`,
        title: `Reel ${input.featureFocus}: operacion visible`,
        angle: `Promocionar ${input.featureFocus} para ${AUDIENCE_LABELS[input.audience].toLowerCase()} con tono ${TONE_LABELS[input.tone]}.`,
        hook,
        audienceLabel: AUDIENCE_LABELS[input.audience],
        durationSeconds: input.durationSeconds,
        coverText: 'Tu edificio, en una sola plataforma',
        scenes,
        caption: [
            'Administrar un condominio no deberia depender de planillas, chats sueltos y memoria operacional.',
            `ConviveConnect centraliza ${input.featureFocus.toLowerCase()} y suma a CoCo Agent Center para preparar acciones con permisos, confirmacion y auditoria.`,
            input.offer ? `Hoy: ${input.offer}` : 'Agenda una demo y mira el flujo real.',
            input.callToAction || 'Agenda una demo en conviveconnect.com',
        ].join('\n\n'),
        hashtags,
        audioDirection: 'Beat moderno, limpio y ascendente. Volumen bajo bajo la voz; cierre con golpe suave en el logo.',
        productionChecklist: [
            'Formato 9:16, 1080x1920.',
            'Primer texto visible antes del segundo 2.',
            'Usar pantallas reales de ConviveConnect cuando sea posible.',
            'Subtitulos quemados, maximo 7 palabras por linea.',
            'CTA final con conviveconnect.com legible al menos 2 segundos.',
        ],
        editingPrompt: `Crea un video vertical 9:16 para Instagram Reels sobre ConviveConnect. Estilo SaaS chileno premium, cortes rapidos, interfaz real, textos grandes, ritmo moderno. Hook: "${hook}". CTA: "${input.callToAction || 'Agenda una demo en conviveconnect.com'}".`,
        createdAt: new Date().toISOString(),
        modelSource: 'template',
    };
}

function stringArray(value: unknown, fallback: string[]) {
    if (!Array.isArray(value)) return fallback;
    const cleaned = value.map(item => cleanText(item)).filter(Boolean);
    return cleaned.length ? cleaned.slice(0, 12) : fallback;
}

function sceneArray(value: unknown, fallback: ReelScene[]) {
    if (!Array.isArray(value)) return fallback;
    const scenes = value
        .map((item): ReelScene | null => {
            if (!item || typeof item !== 'object') return null;
            const row = item as Record<string, unknown>;
            return {
                time: cleanText(row.time),
                visual: cleanText(row.visual),
                onScreenText: cleanText(row.onScreenText),
                voiceOver: cleanText(row.voiceOver),
                productionNote: cleanText(row.productionNote),
            };
        })
        .filter((item): item is ReelScene => Boolean(item?.time && item.visual && item.onScreenText && item.voiceOver));
    return scenes.length ? scenes.slice(0, 7) : fallback;
}

function parsePackage(raw: string, input: ReelAgentInput): ReelCreativePackage | null {
    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const fallback = fallbackPackage(input);
        const scenes = sceneArray(parsed.scenes, fallback.scenes);
        return {
            id: `reel-${Date.now()}`,
            title: cleanText(parsed.title, fallback.title).slice(0, 120),
            angle: cleanText(parsed.angle, fallback.angle).slice(0, 280),
            hook: cleanText(parsed.hook, fallback.hook).slice(0, 180),
            audienceLabel: AUDIENCE_LABELS[input.audience],
            durationSeconds: input.durationSeconds,
            coverText: cleanText(parsed.coverText, fallback.coverText).slice(0, 80),
            scenes,
            caption: cleanText(parsed.caption, fallback.caption).slice(0, 2200),
            hashtags: stringArray(parsed.hashtags, fallback.hashtags),
            audioDirection: cleanText(parsed.audioDirection, fallback.audioDirection).slice(0, 260),
            productionChecklist: stringArray(parsed.productionChecklist, fallback.productionChecklist),
            editingPrompt: cleanText(parsed.editingPrompt, fallback.editingPrompt).slice(0, 1200),
            createdAt: new Date().toISOString(),
            modelSource: 'anthropic',
        };
    } catch {
        return null;
    }
}

function buildPrompt(input: ReelAgentInput) {
    return `
Eres el Marketing Reel Agent de ConviveConnect. Genera un paquete creativo para Instagram Reels en espanol chileno, listo para produccion.

Datos reales del producto:
${PRODUCT_FACTS}

Brief:
- Objetivo: ${input.objective}
- Foco: ${input.featureFocus}
- Audiencia: ${AUDIENCE_LABELS[input.audience]}
- Tono: ${TONE_LABELS[input.tone]}
- Duracion: ${input.durationSeconds} segundos
- Prueba o senal: ${input.proofPoint || 'No indicada'}
- Oferta: ${input.offer || 'No indicada'}
- CTA: ${input.callToAction || 'Agenda una demo en conviveconnect.com'}

Reglas:
- No prometas integraciones no configuradas como pagos automaticos Haulmer o WhatsApp si no son el foco.
- Hazlo vendible, concreto y visual, evitando jerga tecnica.
- El reel debe tener hook antes del segundo 2.
- Devuelve solo JSON valido con esta forma:
{
  "title": string,
  "angle": string,
  "hook": string,
  "coverText": string,
  "scenes": [
    { "time": "0-4s", "visual": string, "onScreenText": string, "voiceOver": string, "productionNote": string }
  ],
  "caption": string,
  "hashtags": string[],
  "audioDirection": string,
  "productionChecklist": string[],
  "editingPrompt": string
}
`.trim();
}

async function generateWithAnthropic(input: ReelAgentInput) {
    if (!process.env.ANTHROPIC_API_KEY) return null;
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1800,
        temperature: 0.7,
        messages: [{ role: 'user', content: buildPrompt(input) }],
    });
    const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map(block => block.text)
        .join('\n')
        .trim();
    return text ? parsePackage(text, input) : null;
}

export async function generateReelPackage(input: ReelAgentInput): Promise<ReelCreativePackage> {
    try {
        const generated = await generateWithAnthropic(input);
        if (generated) return generated;
    } catch (error) {
        console.warn('[MarketingReelAgent] Anthropic generation failed; using template fallback.', error);
    }

    return fallbackPackage(input);
}
