import type { TrainingSectionContext } from '@/lib/types';

/** Respuesta de respaldo anclada a la sección publicada, cuando el motor de IA no responde. */
export function answerFromTrainingSection(section: TrainingSectionContext | null | undefined): { text: string; blackboard: string } | null {
    const title = section?.title?.trim() || '';
    const lead = section?.lead?.trim() || '';
    const notes = section?.notes?.trim() || '';
    const bullets = (section?.bullets || []).map(item => item.trim()).filter(Boolean).slice(0, 5);
    if (!title && !lead && !notes && bullets.length === 0) return null;

    const text = [
        title ? `Seguimos en **${title}**.` : 'Sigo con la sección que tienes abierta.',
        lead,
        bullets.length > 0 ? `De esta sección: ${bullets.map(item => `**${item}**`).join('; ')}.` : '',
        notes ? `La tutora lo aplica así: ${notes}` : '',
        'Llévalo a tu caso: qué pasó, qué regla de esta sección aplica y qué acción te toca en tu rol.',
    ].filter(Boolean).join(' ');

    const blackboard = [
        `# ${title || 'Sección del curso'}`,
        lead,
        ...bullets.map(item => `- ${item}`),
        notes,
    ].filter(Boolean).join('\n');

    return { text, blackboard };
}

export function trainingSectionFromCourseContent(courseContent: string | undefined): TrainingSectionContext | null {
    if (!courseContent) return null;
    try {
        const parsed = JSON.parse(courseContent) as { currentSection?: TrainingSectionContext | null };
        const section = parsed.currentSection;
        if (!section || typeof section !== 'object') return null;
        return section;
    } catch {
        return null;
    }
}
