import type { TrainingSectionContext } from '@/lib/types';

/** Respuesta de respaldo anclada a la sección publicada, cuando el motor de IA no responde. */
export function answerFromTrainingSection(section: TrainingSectionContext | null | undefined): { text: string; blackboard: string } | null {
    const title = section?.title?.trim() || '';
    const lead = section?.lead?.trim() || '';
    const notes = section?.notes?.trim() || '';
    const bullets = (section?.bullets || []).map(item => item.trim()).filter(Boolean).slice(0, 5);
    if (!title && !lead && !notes && bullets.length === 0) return null;

    const text = [
        title ? `Seguimos en «${title}», que ya está en la presentación.` : 'Sigo con la sección que tienes abierta.',
        lead,
        bullets[0] ? `El primer criterio de esta sección es: ${bullets[0]}` : '',
        '¿Qué harías tú, con el rol que tienes ahora?',
    ].filter(Boolean).join(' ');

    return { text, blackboard: '' };
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
