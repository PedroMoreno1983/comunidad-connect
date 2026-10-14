/**
 * slideVisual.ts — Ayudas puras para que cada sección del aula tenga forma
 * visual propia sin pedir más datos al generador de cursos.
 */

export type TrainingTopic =
    | 'logbook' | 'emergency' | 'water' | 'electric' | 'fire' | 'people' | 'access'
    | 'parcel' | 'cleaning' | 'maintenance' | 'communication' | 'shift' | 'security' | 'general';

const TOPIC_WORDS: [TrainingTopic, string[]][] = [
    ['fire', ['incendio', 'humo', 'extintor', 'fuego', 'gas']],
    ['water', ['agua', 'filtracion', 'inundacion', 'cañeria', 'caneria', 'charco']],
    ['electric', ['tablero', 'electric', 'corte de luz', 'generador', 'enchufe']],
    ['emergency', ['emergencia', 'urgencia', 'lesionad', 'evacua', 'riesgo']],
    ['logbook', ['bitacora', 'registro', 'por escrito', 'anotar', 'anota']],
    ['shift', ['turno', 'relevo', 'puesto']],
    ['communication', ['pasillo', 'residente', 'comunica', 'avisa', 'informa', 'se dice']],
    ['access', ['acceso', 'porton', 'visita', 'llave', 'control de ingreso']],
    ['parcel', ['encomienda', 'paquete', 'paqueteria', 'delivery']],
    ['cleaning', ['aseo', 'limpieza', 'basura', 'residuos']],
    ['maintenance', ['mantencion', 'ascensor', 'bomba', 'proveedor', 'reparacion']],
    ['people', ['persona', 'vecino', 'comunidad', 'convivencia']],
    ['security', ['seguridad', 'proteger', 'contener', 'resguard']],
];

function normalize(value: string) {
    return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Tema principal de una sección, según su título y bajada (el título pesa doble). */
export function slideTopic(title: string, lead = ''): TrainingTopic {
    const head = normalize(title);
    const body = normalize(lead);
    let best: TrainingTopic = 'general';
    let bestScore = 0;
    for (const [topic, words] of TOPIC_WORDS) {
        const score = words.reduce((sum, word) => sum + (head.includes(word) ? 2 : 0) + (body.includes(word) ? 1 : 0), 0);
        if (score > bestScore) { best = topic; bestScore = score; }
    }
    return best;
}

/** "Novedad: encomienda…" → { label: "Novedad", text: "encomienda…" }. Etiquetas de hasta 4 palabras. */
export function splitLabeled(bullet: string): { label: string | null; text: string } {
    const match = bullet.match(/^([^:.!?]{2,40}):\s+([\s\S]+)$/);
    if (!match || match[1].trim().split(/\s+/).length > 4) return { label: null, text: bullet };
    const text = match[2].trim();
    return { label: match[1].trim(), text: text.charAt(0).toUpperCase() + text.slice(1) };
}

/** Separa lo que se hace de lo que no se hace (viñetas que parten con "No", "Nunca" o "Evita"). */
export function splitComparison(bullets: string[]) {
    const negative = /^(no|nunca|evita|jam[aá]s)\b/i;
    const dont = bullets.filter(bullet => negative.test(bullet.trim()));
    const doList = bullets.filter(bullet => !negative.test(bullet.trim()));
    return { doList, dont, contrasted: dont.length > 0 && doList.length > 0 };
}

/** Ilustración estática del tema (public/training/topics, generadas una vez con el mismo estilo). */
export function topicImage(topic: TrainingTopic) {
    return `/training/topics/${topic}.webp`;
}
