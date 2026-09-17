import type {
    TrainingActivity,
    TrainingActivityType,
    TrainingSlide,
} from '@/lib/types';

const THEMES = new Set<TrainingSlide['visual_theme']>(['copper', 'sage', 'ink', 'amber']);
const LEGACY_THEME_MAP: Record<string, TrainingSlide['visual_theme']> = {
    'purple-gradient': 'ink',
    'blue-glass': 'ink',
    'tech-abstract': 'ink',
    'sunset-orange': 'copper',
    'nature-green': 'sage',
    default: 'copper',
};

function cleanString(value: unknown, fallback = '', max = 4_000) {
    return typeof value === 'string' ? value.trim().slice(0, max) : fallback;
}

function cleanStringArray(value: unknown, maxItems: number, maxLength: number) {
    return Array.isArray(value)
        ? value.map(item => cleanString(item, '', maxLength)).filter(Boolean).slice(0, maxItems)
        : [];
}

function normalizeActivity(value: unknown): TrainingActivity | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const raw = value as Record<string, unknown>;
    const type = cleanString(raw.type) as TrainingActivityType;
    if (!['knowledge_check', 'scenario', 'checklist'].includes(type)) return undefined;

    if (type === 'checklist') {
        const items = cleanStringArray(raw.items, 8, 240);
        if (items.length < 2) return undefined;
        return {
            type,
            prompt: cleanString(raw.prompt, 'Confirma que puedes aplicar estos pasos.', 500),
            items,
            explanation: cleanString(raw.explanation, '', 1_000) || undefined,
        };
    }

    const options = cleanStringArray(raw.options, 5, 300);
    const correctIndex = Number(raw.correctIndex);
    if (!cleanString(raw.prompt) || options.length < 2 || !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
        return undefined;
    }
    return {
        type,
        prompt: cleanString(raw.prompt, '', 500),
        options,
        correctIndex,
        explanation: cleanString(raw.explanation, 'Revisa el procedimiento y vuelve a intentarlo.', 1_000),
    };
}

function normalizeTheme(value: unknown): TrainingSlide['visual_theme'] {
    const raw = cleanString(value);
    if (THEMES.has(raw as TrainingSlide['visual_theme'])) return raw as TrainingSlide['visual_theme'];
    return LEGACY_THEME_MAP[raw] || 'copper';
}

export function normalizeTrainingSlides(value: unknown): TrainingSlide[] {
    if (!Array.isArray(value)) return [];

    return value.flatMap((item, index) => {
        if (!item || typeof item !== 'object') return [];
        const raw = item as Record<string, unknown>;
        const title = cleanString(raw.title, '', 180);
        const bullets = cleanStringArray(raw.bullets, 6, 400);
        if (!title || bullets.length === 0) return [];

        return [{
            id: cleanString(raw.id, `section-${index + 1}`, 80),
            title,
            eyebrow: cleanString(raw.eyebrow, '', 80) || undefined,
            bullets,
            visual_theme: normalizeTheme(raw.visual_theme),
            notes: cleanString(raw.notes, 'Revisa los puntos clave y relaciona esta sección con tu trabajo diario.', 3_000),
            activity: normalizeActivity(raw.activity),
        } satisfies TrainingSlide];
    }).slice(0, 16);
}

export function parseTrainingSlides(content?: string | null) {
    if (!content?.trim()) return [];
    try {
        return normalizeTrainingSlides(JSON.parse(content));
    } catch {
        return [];
    }
}

export function trainingActivityCount(slides: TrainingSlide[]) {
    return slides.filter(slide => Boolean(slide.activity)).length;
}

export function isPublishableTrainingCourse(slides: TrainingSlide[]) {
    return slides.length >= 5 && trainingActivityCount(slides) >= 2;
}

function sourceSentences(source: string) {
    return source
        .replace(/\r/g, '')
        .split(/(?:\n{2,}|(?<=[.!?])\s+)/)
        .map(part => part.replace(/^[-*#\d.)\s]+/, '').trim())
        .filter(part => part.length >= 24)
        .slice(0, 18);
}

export function buildStructuredTrainingFallback(source: string, audience: 'admin' | 'concierge' | 'all'): TrainingSlide[] {
    const sentences = sourceSentences(source);
    const audienceLabel = audience === 'admin'
        ? 'administración'
        : audience === 'concierge'
            ? 'conserjería'
            : 'administración y conserjería';
    const take = (start: number, fallback: string[]) => {
        const selected = sentences.slice(start, start + 3);
        return selected.length ? selected : fallback;
    };

    return [
        {
            id: 'proposito',
            title: 'Propósito y resultado esperado',
            eyebrow: 'Inicio',
            bullets: take(0, [
                `Este curso traduce el contenido fuente en decisiones para ${audienceLabel}.`,
                'Cada actuación debe respetar el rol, dejar registro y permitir seguimiento.',
                'Al finalizar podrás reconocer qué hacer, qué registrar y cuándo escalar.',
            ]),
            visual_theme: 'ink',
            notes: `Presenta el alcance del curso para ${audienceLabel} y valida que el equipo comprenda el resultado esperado.`,
        },
        {
            id: 'criterios',
            title: 'Criterios esenciales',
            eyebrow: 'Fundamentos',
            bullets: take(3, [
                'Confirma los antecedentes antes de actuar.',
                'Aplica únicamente las atribuciones de tu rol.',
                'Protege los datos personales y evita canales informales.',
            ]),
            visual_theme: 'copper',
            notes: 'Conecta cada criterio con una situación habitual del edificio y pide un ejemplo concreto.',
            activity: {
                type: 'knowledge_check',
                prompt: '¿Qué práctica permite una gestión responsable y auditable?',
                options: [
                    'Registrar antecedentes, acción tomada y responsable',
                    'Resolver verbalmente y borrar los mensajes',
                    'Compartir todos los datos con el grupo de turno',
                ],
                correctIndex: 0,
                explanation: 'La trazabilidad exige antecedentes, acción, responsable y estado; además deben compartirse solo los datos necesarios.',
            },
        },
        {
            id: 'procedimiento',
            title: 'Procedimiento paso a paso',
            eyebrow: 'Aplicación',
            bullets: take(6, [
                'Recibe y clasifica la situación según impacto y urgencia.',
                'Registra los hechos comprobados, sin suposiciones.',
                'Asigna o escala al responsable correspondiente.',
                'Informa el avance y cierra con evidencia.',
            ]),
            visual_theme: 'sage',
            notes: 'Recorre el procedimiento usando un ejemplo del turno y señala en qué pantalla de Convive Connect queda cada registro.',
        },
        {
            id: 'escenario',
            title: 'Escenario de decisión',
            eyebrow: 'Práctica',
            bullets: take(9, [
                'Una situación urgente requiere contener el riesgo antes de continuar.',
                'La persona que recibe no siempre es quien resuelve.',
                'La administración debe conocer los hechos, el responsable y el estado.',
            ]),
            visual_theme: 'amber',
            notes: 'Pide al participante justificar su elección antes de mostrar la retroalimentación.',
            activity: {
                type: 'scenario',
                prompt: 'Recibes una situación no prevista y no tienes atribuciones para resolverla. ¿Qué haces primero?',
                options: [
                    'Registro los hechos, contengo el riesgo inmediato y escalo al responsable',
                    'Prometo una solución y actúo fuera de mi rol',
                    'Espero al siguiente turno sin dejar constancia',
                ],
                correctIndex: 0,
                explanation: 'La actuación segura combina contención proporcional, registro inmediato y escalamiento al rol autorizado.',
            },
        },
        {
            id: 'errores',
            title: 'Errores que debemos evitar',
            eyebrow: 'Prevención',
            bullets: take(12, [
                'Cerrar una gestión sin evidencia ni comunicación.',
                'Confundir una consulta con una emergencia.',
                'Divulgar información que no es necesaria para resolver.',
                'Dejar un pendiente sin responsable ni plazo.',
            ]),
            visual_theme: 'copper',
            notes: 'Contrasta cada error con la conducta esperada y aclara las responsabilidades de cada rol.',
        },
        {
            id: 'cierre',
            title: 'Lista de verificación de cierre',
            eyebrow: 'Transferencia al trabajo',
            bullets: take(15, [
                'Los hechos y la decisión quedaron registrados.',
                'Existe una persona responsable y un plazo visible.',
                'Las personas involucradas recibieron una actualización.',
                'El cierre incluye resultado o evidencia verificable.',
            ]),
            visual_theme: 'ink',
            notes: 'Usa esta lista antes de completar el curso y acuerda una acción concreta para el próximo turno.',
            activity: {
                type: 'checklist',
                prompt: 'Antes de completar, confirma que puedes aplicar estas acciones:',
                items: [
                    'Identificar quién recibe y quién resuelve',
                    'Registrar hechos, responsable y plazo',
                    'Escalar sin exceder las atribuciones del rol',
                    'Cerrar con comunicación y evidencia',
                ],
                explanation: 'Estas cuatro acciones convierten el contenido en una práctica operacional verificable.',
            },
        },
    ];
}

export function ensureInteractiveTrainingCourse(
    value: unknown,
    source: string,
    audience: 'admin' | 'concierge' | 'all',
) {
    const slides = normalizeTrainingSlides(value);
    if (slides.length < 5) return buildStructuredTrainingFallback(source, audience);
    if (trainingActivityCount(slides) >= 2) return slides;

    const fallbackActivities = buildStructuredTrainingFallback(source, audience)
        .map(slide => slide.activity)
        .filter((activity): activity is TrainingActivity => Boolean(activity));
    const preferredIndexes = [1, Math.floor(slides.length / 2), slides.length - 1];
    let activityIndex = 0;

    return slides.map((slide, index) => {
        if (slide.activity || !preferredIndexes.includes(index) || !fallbackActivities[activityIndex]) {
            return slide;
        }
        const activity = fallbackActivities[activityIndex];
        activityIndex += 1;
        return { ...slide, activity };
    });
}
