import type {
    TrainingActivity,
    TrainingActivityType,
    TrainingQualityReport,
    TrainingRoleCard,
    TrainingSlide,
    TrainingSlideLayout,
} from '@/lib/types';

const THEMES = new Set<TrainingSlide['visual_theme']>(['copper', 'sage', 'ink', 'amber']);
const LAYOUTS = new Set<TrainingSlideLayout>(['opening', 'framework', 'process', 'comparison', 'scenario', 'checklist', 'summary']);
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

function inferredLayout(index: number, length: number, activity?: TrainingActivity): TrainingSlideLayout {
    if (index === 0) return 'opening';
    if (activity?.type === 'scenario') return 'scenario';
    if (activity?.type === 'checklist') return 'checklist';
    if (index === length - 1) return 'summary';
    if (index === 2) return 'process';
    if (index === 3) return 'comparison';
    return 'framework';
}

function normalizeRoleCards(value: unknown): TrainingRoleCard[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const cards = value.flatMap(item => {
        if (!item || typeof item !== 'object') return [];
        const raw = item as Record<string, unknown>;
        const role = cleanString(raw.role, '', 80);
        const responsibility = cleanString(raw.responsibility, '', 220);
        const action = cleanString(raw.action, '', 220);
        return role && responsibility && action ? [{ role, responsibility, action }] : [];
    }).slice(0, 3);
    return cards.length ? cards : undefined;
}

export function normalizeTrainingSlides(value: unknown): TrainingSlide[] {
    if (!Array.isArray(value)) return [];

    const candidates = value.slice(0, 16);
    return candidates.flatMap((item, index) => {
        if (!item || typeof item !== 'object') return [];
        const raw = item as Record<string, unknown>;
        const title = cleanString(raw.title, '', 180);
        const bullets = cleanStringArray(raw.bullets, 6, 300);
        if (!title || bullets.length === 0) return [];
        const activity = normalizeActivity(raw.activity);
        const requestedLayout = cleanString(raw.layout) as TrainingSlideLayout;
        const layout = LAYOUTS.has(requestedLayout) ? requestedLayout : inferredLayout(index, candidates.length, activity);

        return [{
            id: cleanString(raw.id, `section-${index + 1}`, 80),
            title,
            eyebrow: cleanString(raw.eyebrow, '', 80) || undefined,
            lead: cleanString(raw.lead, bullets[0], 360),
            bullets,
            layout,
            role_cards: normalizeRoleCards(raw.role_cards),
            source_note: cleanString(raw.source_note, '', 240) || undefined,
            visual_theme: normalizeTheme(raw.visual_theme),
            notes: cleanString(raw.notes, 'Relaciona esta sección con el trabajo diario, define quién actúa y qué evidencia debe quedar.', 3_000),
            activity,
        } satisfies TrainingSlide];
    });
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

/** El lead a veces se copia del primer bullet. En la diapositiva se muestra una sola vez. */
export function visibleSlideBullets(slide: Pick<TrainingSlide, 'lead' | 'bullets'>): string[] {
    const lead = slide.lead?.trim();
    const unique = slide.bullets.filter(bullet => bullet.trim() !== lead);
    return unique.length > 0 ? unique : slide.bullets;
}

export function trainingQualityReport(slides: TrainingSlide[]): TrainingQualityReport {
    const activityTypes = new Set(slides.flatMap(slide => slide.activity ? [slide.activity.type] : []));
    const layouts = new Set(slides.map(slide => slide.layout));
    const checks = [
        { id: 'structure', label: '6 o más secciones con recorrido completo', passed: slides.length >= 6, points: 20 },
        { id: 'practice', label: 'Evaluación, escenario y lista de aplicación', passed: trainingActivityCount(slides) >= 3 && ['knowledge_check', 'scenario', 'checklist'].every(type => activityTypes.has(type as TrainingActivityType)), points: 20 },
        { id: 'visual', label: 'Variedad visual y apertura editorial', passed: layouts.size >= 4 && slides[0]?.layout === 'opening', points: 15 },
        { id: 'leads', label: 'Mensaje central visible en cada sección', passed: slides.length > 0 && slides.every(slide => Boolean(slide.lead?.trim())), points: 10 },
        { id: 'readability', label: 'Contenido breve y escaneable', passed: slides.length > 0 && slides.every(slide => slide.bullets.length >= 2 && slide.bullets.length <= 5 && slide.bullets.every(bullet => bullet.length <= 300)), points: 10 },
        { id: 'facilitation', label: 'Guion operativo para la tutora CoCo', passed: slides.length > 0 && slides.every(slide => slide.notes.trim().length >= 35), points: 10 },
        { id: 'roles', label: 'Responsabilidades diferenciadas por rol', passed: slides.some(slide => (slide.role_cards?.length || 0) >= 2), points: 10 },
        { id: 'transfer', label: 'Cierre con verificación aplicable al trabajo', passed: slides.at(-1)?.activity?.type === 'checklist', points: 5 },
    ];
    const score = checks.reduce((total, check) => total + (check.passed ? check.points : 0), 0);
    return { score, publishable: score >= 80 && checks[0].passed && checks[1].passed && checks[7].passed, checks };
}

export function isPublishableTrainingCourse(slides: TrainingSlide[]) {
    return trainingQualityReport(slides).publishable;
}

function sourceSentences(source: string) {
    return source
        .replace(/\r/g, '')
        .split(/(?:\n{2,}|(?<=[.!?])\s+)/)
        .map(part => part.replace(/^[-*#\d.)\s]+/, '').trim().slice(0, 300))
        .filter(part => part.length >= 24)
        .slice(0, 18);
}

function clipTopic(value: string) {
    const clause = value.split(/[:.;!?]/)[0]?.trim() ?? '';
    if (clause.length < 18) return '';
    const clipped = clause.length > 72 ? clause.slice(0, 69).replace(/\s+\S*$/, '') : clause;
    return clipped.charAt(0).toLowerCase() + clipped.slice(1);
}

export function buildStructuredTrainingFallback(source: string, audience: 'admin' | 'concierge' | 'all'): TrainingSlide[] {
    const sentences = sourceSentences(source);
    const audienceLabel = audience === 'admin' ? 'administración' : audience === 'concierge' ? 'conserjería' : 'administración y conserjería';
    const topic = clipTopic(sentences[0] || '');
    const take = (start: number, fallback: string[], lead: string) => {
        const selected = sentences.slice(start, start + fallback.length).filter(item => item.trim() !== lead.trim());
        const base = selected.length >= 2 ? selected : fallback;
        const unique = base.filter(item => item.trim() !== lead.trim());
        return (unique.length >= 2 ? unique : fallback).slice(0, 4);
    };
    const roleCards: TrainingRoleCard[] = [
        { role: 'Administración', responsibility: 'Decide el criterio y quién cierra el caso', action: 'Asigna responsable, plazo y qué se puede comunicar' },
        { role: 'Conserjería', responsibility: 'Describe el turno sin resolver fuera de protocolo', action: 'Registra hora, lugar y hecho, y escala lo demás' },
    ];
    const openingLead = topic
        ? `Al cerrar esta sección, ${audienceLabel} puede aplicar este criterio sin improvisar: ${topic}.`
        : `Un criterio común permite que ${audienceLabel} actúe con registro, atribución y cierre.`;

    return [
        {
            id: 'proposito', title: 'Propósito y resultado esperado', eyebrow: 'Inicio', layout: 'opening',
            lead: openingLead,
            bullets: take(0, [`Este curso traduce el contenido fuente en decisiones para ${audienceLabel}.`, 'Cada actuación debe respetar el rol, dejar registro y permitir seguimiento.', 'Al finalizar podrás reconocer qué hacer, qué registrar y cuándo escalar.'], openingLead),
            visual_theme: 'ink',
            notes: `Presenta el alcance del curso para ${audienceLabel}, conecta el tema con una situación real y valida el resultado esperado.`,
        },
        {
            id: 'criterios', title: 'Criterios esenciales', eyebrow: 'Fundamentos', layout: 'framework',
            lead: 'Antes de actuar, confirma el hecho, la atribución del rol y el registro que debe quedar.',
            bullets: take(3, ['Confirma los antecedentes antes de actuar.', 'Aplica únicamente las atribuciones de tu rol.', 'Protege los datos personales y evita canales informales.'], 'Antes de actuar, confirma el hecho, la atribución del rol y el registro que debe quedar.'),
            visual_theme: 'copper',
            notes: 'Conecta cada criterio con una situación habitual del edificio y pide al participante justificar qué evidencia conservaría.',
            activity: {
                type: 'knowledge_check', prompt: 'El caso se resolvió de palabra y no quedó escrito. ¿Qué se pierde?',
                options: [
                    'Quien sigue el caso no tiene hecho, responsable ni próximo paso',
                    'Nada, si las personas involucradas quedaron conformes en el momento',
                    'Solo tiempo: el turno siguiente puede reconstruir lo ocurrido',
                    'El detalle, pero conviene omitirlo cuando el caso es delicado',
                ], correctIndex: 0,
                explanation: 'Sin registro, el turno siguiente no distingue lo ocurrido de lo que cada uno recuerda. Un caso delicado también se anota, con los datos mínimos y en el canal autorizado.',
            },
        },
        {
            id: 'procedimiento', title: 'Procedimiento paso a paso', eyebrow: 'Aplicación', layout: 'process',
            lead: 'La respuesta profesional avanza en cuatro movimientos visibles: clasificar, registrar, asignar y cerrar.',
            bullets: take(6, ['Recibe y clasifica la situación según impacto y urgencia.', 'Registra los hechos comprobados, sin suposiciones.', 'Asigna o escala al responsable correspondiente.', 'Informa el avance y cierra con evidencia.'], 'La respuesta profesional avanza en cuatro movimientos visibles: clasificar, registrar, asignar y cerrar.'),
            role_cards: roleCards,
            visual_theme: 'sage',
            notes: 'Recorre el procedimiento con un caso del turno y señala en qué pantalla de Convive Connect queda cada registro y cada responsable.',
        },
        {
            id: 'escenario', title: 'Escenario de decisión', eyebrow: 'Práctica', layout: 'scenario',
            lead: 'Cuando falta una respuesta exacta, el rol no improvisa: contiene, registra y escala.',
            bullets: take(9, ['Una situación urgente requiere contener el riesgo antes de continuar.', 'La persona que recibe no siempre es quien resuelve.', 'La administración debe conocer los hechos, el responsable y el estado.'], 'Cuando falta una respuesta exacta, el rol no improvisa: contiene, registra y escala.'),
            visual_theme: 'amber',
            notes: 'Pide al participante justificar su elección con hechos, atribuciones y trazabilidad antes de mostrar la retroalimentación.',
            activity: {
                type: 'scenario', prompt: 'La situación no está en tu atribución, pero hay un riesgo que el protocolo te permite contener. ¿Qué haces primero?',
                options: [
                    'Contengo lo inmediato, registro hora y hechos, y aviso al rol que decide',
                    'Resuelvo el fondo para no dejar el problema esperando',
                    'Dejo constancia solo si la persona lo pide por escrito',
                    'Aviso por teléfono y escribo el registro cuando tenga la respuesta',
                ], correctIndex: 0,
                explanation: 'La contención permitida y el registro no esperan la decisión de fondo. Resolver fuera de rol, o avisar sin dejar constancia, corta la trazabilidad.',
            },
        },
        {
            id: 'roles', title: 'Quién decide, quién ejecuta y quién verifica', eyebrow: 'Coordinación', layout: 'comparison',
            lead: 'Una tarea se pierde cuando todos participan, pero nadie tiene la responsabilidad explícita.',
            bullets: take(12, ['La administración fija el criterio y asigna al responsable autorizado.', 'Conserjería ejecuta las acciones previstas para el turno y registra lo observado.', 'El cierre identifica resultado, evidencia y próxima verificación.'], 'Una tarea se pierde cuando todos participan, pero nadie tiene la responsabilidad explícita.'),
            role_cards: roleCards,
            visual_theme: 'copper',
            notes: 'Contrasta las responsabilidades de ambos roles, marca los límites de atribución y acuerda el canal de escalamiento aplicable.',
        },
        {
            id: 'cierre', title: 'Lista de verificación de cierre', eyebrow: 'Transferencia al trabajo', layout: 'checklist',
            lead: 'El aprendizaje termina cuando la persona puede aplicar el protocolo y demostrar cómo cerró la gestión.',
            bullets: take(15, ['Los hechos y la decisión quedaron registrados.', 'Existe una persona responsable y un plazo visible.', 'Las personas involucradas recibieron una actualización.', 'El cierre incluye resultado o evidencia verificable.'], 'El aprendizaje termina cuando la persona puede aplicar el protocolo y demostrar cómo cerró la gestión.'),
            visual_theme: 'ink',
            notes: 'Usa esta lista antes de completar el curso y acuerda una acción concreta para el próximo turno o ciclo de administración.',
            activity: {
                type: 'checklist', prompt: 'Antes de completar, confirma que puedes aplicar estas acciones:',
                items: ['Identificar quién recibe y quién resuelve', 'Registrar hechos, responsable y plazo', 'Escalar sin exceder las atribuciones del rol', 'Cerrar con comunicación y evidencia'],
                explanation: 'Estas cuatro acciones convierten el contenido en una práctica operacional verificable.',
            },
        },
    ];
}

export function ensureInteractiveTrainingCourse(value: unknown, source: string, audience: 'admin' | 'concierge' | 'all') {
    const slides = normalizeTrainingSlides(value);
    const fallback = buildStructuredTrainingFallback(source, audience);
    if (slides.length < 6) return fallback;

    const existingTypes = new Set(slides.flatMap(slide => slide.activity ? [slide.activity.type] : []));
    const missingActivities = fallback.map(slide => slide.activity).filter((activity): activity is TrainingActivity => {
        if (!activity) return false;
        return !existingTypes.has(activity.type);
    });
    let activityIndex = 0;
    const preferredIndexes = [1, Math.floor(slides.length / 2), slides.length - 1];
    const supplemented = slides.map((slide, index) => {
        if (slide.activity || !preferredIndexes.includes(index) || !missingActivities[activityIndex]) return slide;
        const activity = missingActivities[activityIndex++];
        return { ...slide, activity, layout: activity.type === 'scenario' ? 'scenario' : activity.type === 'checklist' ? 'checklist' : slide.layout } satisfies TrainingSlide;
    });

    if (!supplemented.some(slide => (slide.role_cards?.length || 0) >= 2)) {
        const roleIndex = Math.min(2, supplemented.length - 1);
        supplemented[roleIndex] = { ...supplemented[roleIndex], role_cards: fallback[2].role_cards, layout: 'process' };
    }
    return isPublishableTrainingCourse(supplemented) ? supplemented : fallback;
}
