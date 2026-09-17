import { describe, expect, it } from 'vitest';
import {
    buildStructuredTrainingFallback,
    ensureInteractiveTrainingCourse,
    isPublishableTrainingCourse,
    parseTrainingSlides,
    trainingActivityCount,
} from '@/lib/training/courseContent';

describe('training course content', () => {
    it('normalizes legacy visual themes without losing slide content', () => {
        const slides = parseTrainingSlides(JSON.stringify([{
            id: 'legacy-1',
            title: 'Caso de prueba',
            bullets: ['Registrar el hecho', 'Escalar al responsable'],
            visual_theme: 'blue-glass',
            notes: 'Explicar el flujo.',
        }]));
        expect(slides).toHaveLength(1);
        expect(slides[0].visual_theme).toBe('ink');
    });

    it('rejects malformed activities instead of showing a broken interaction', () => {
        const slides = parseTrainingSlides(JSON.stringify([{
            id: 'bad-activity',
            title: 'Actividad incompleta',
            bullets: ['Contenido válido'],
            visual_theme: 'copper',
            notes: 'Revisar.',
            activity: { type: 'scenario', prompt: '¿Qué haces?', options: ['A'] },
        }]));
        expect(slides[0].activity).toBeUndefined();
    });

    it('builds a publishable fallback with practice and a closing checklist', () => {
        const slides = buildStructuredTrainingFallback(
            'Registrar cada novedad importante. Confirmar los antecedentes antes de actuar. Escalar al responsable y comunicar el avance.',
            'concierge',
        );
        expect(slides.length).toBeGreaterThanOrEqual(5);
        expect(trainingActivityCount(slides)).toBeGreaterThanOrEqual(2);
        expect(isPublishableTrainingCourse(slides)).toBe(true);
    });

    it('adds practice to a valid AI outline that omitted interactions', () => {
        const slides = ensureInteractiveTrainingCourse(
            Array.from({ length: 6 }, (_, index) => ({
                id: `slide-${index + 1}`,
                title: `Sección ${index + 1}`,
                bullets: ['Una conducta observable y aplicable.'],
                visual_theme: 'copper',
                notes: 'Explicar el criterio con un caso del edificio.',
            })),
            'Registrar, escalar y cerrar cada situación con evidencia.',
            'admin',
        );
        expect(slides).toHaveLength(6);
        expect(trainingActivityCount(slides)).toBeGreaterThanOrEqual(2);
        expect(isPublishableTrainingCourse(slides)).toBe(true);
    });
});
