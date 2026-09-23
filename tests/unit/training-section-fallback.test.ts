import { describe, expect, it } from 'vitest';
import { answerFromTrainingSection, trainingSectionFromCourseContent } from '@/lib/training/sectionFallback';

describe('training section fallback', () => {
    it('answers from the open section instead of a generic coexistence script', () => {
        const answer = answerFromTrainingSection({
            title: 'Recibir una encomienda',
            lead: 'Registrar el paquete antes de avisar.',
            bullets: ['Anotar la unidad', 'Avisar una sola vez'],
            notes: 'No dejes el paquete sin destinatario.',
        });
        expect(answer?.text).toContain('Recibir una encomienda');
        expect(answer?.text).toContain('Registrar el paquete antes de avisar.');
        expect(answer?.blackboard).toBe('');
        expect(answer?.text).not.toContain('No dejes el paquete sin destinatario.');
        expect(answer?.text).not.toMatch(/charla no arregla la convivencia/i);
    });

    it('returns null when the section has no usable content', () => {
        expect(answerFromTrainingSection({ title: '  ', lead: '', bullets: [' '], notes: '' })).toBeNull();
        expect(answerFromTrainingSection(null)).toBeNull();
    });

    it('reads currentSection from the course payload', () => {
        const section = trainingSectionFromCourseContent(JSON.stringify({
            currentSection: { title: 'Turno de conserjería', bullets: ['Revisar el libro'] },
        }));
        expect(section?.title).toBe('Turno de conserjería');
        expect(trainingSectionFromCourseContent('not-json')).toBeNull();
        expect(trainingSectionFromCourseContent(undefined)).toBeNull();
    });
});
