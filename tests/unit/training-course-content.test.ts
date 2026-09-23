import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    buildStructuredTrainingFallback,
    ensureInteractiveTrainingCourse,
    isPublishableTrainingCourse,
    parseTrainingSlides,
    trainingActivityCount,
    trainingQualityReport,
    visibleSlideBullets,
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
        expect(slides[0].layout).toBe('opening');
        expect(slides[0].lead).toBe('Registrar el hecho');
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
        expect(slides.length).toBeGreaterThanOrEqual(6);
        expect(trainingActivityCount(slides)).toBeGreaterThanOrEqual(3);
        expect(new Set(slides.map(slide => slide.layout)).size).toBeGreaterThanOrEqual(4);
        expect(slides.some(slide => (slide.role_cards?.length || 0) >= 2)).toBe(true);
        expect(trainingQualityReport(slides).score).toBeGreaterThanOrEqual(80);
        expect(isPublishableTrainingCourse(slides)).toBe(true);
    });

    it('hides a bullet that repeats the lead and keeps the slide if every bullet matches', () => {
        expect(visibleSlideBullets({
            lead: 'Registrar el hecho',
            bullets: ['Registrar el hecho', 'Escalar al responsable'],
        })).toEqual(['Escalar al responsable']);
        expect(visibleSlideBullets({
            lead: 'Registrar el hecho',
            bullets: ['Registrar el hecho'],
        })).toEqual(['Registrar el hecho']);
    });

    it('builds a fallback whose lead does not repeat a bullet and whose wrong answers are real mistakes', () => {
        const source = 'Registrar cada novedad importante del turno. Confirmar los antecedentes antes de actuar. Escalar al responsable y comunicar el avance.';
        const slides = buildStructuredTrainingFallback(source, 'concierge');
        for (const slide of slides) {
            expect(slide.bullets.some(bullet => bullet.trim() === slide.lead?.trim())).toBe(false);
        }
        expect(slides.some(slide => slide.bullets.some(bullet => bullet.includes('Registrar cada novedad importante')))).toBe(true);
        const quiz = slides.find(slide => slide.activity?.type === 'knowledge_check')?.activity;
        expect(quiz?.options).toHaveLength(4);
        expect(quiz?.options?.join(' ')).not.toMatch(/borrar los mensajes|compartir todos los datos/i);
        expect(slides.some(slide => slide.role_cards?.some(card => card.responsibility === 'Define criterio, responsable y control'))).toBe(false);
    });

    it('publishes the official curriculum with distinct leads, specific roles and fair questions', () => {
        const sql = readFileSync('supabase/migrations/20260923194520_training_course_depth.sql', 'utf8');
        const blocks = [...sql.matchAll(/\$course\$([\s\S]*?)\$course\$/g)].map(match => match[1]);
        expect(blocks).toHaveLength(3);
        const expectedIds = [
            ['convivencia-proposito', 'convivencia-registro', 'convivencia-canal', 'convivencia-escenario', 'convivencia-seguimiento', 'convivencia-cierre'],
            ['datos-proposito', 'datos-minimizacion', 'datos-camaras', 'datos-escenario', 'datos-comunicaciones', 'datos-cierre'],
            ['turno-proposito', 'turno-clasificar', 'turno-procedimiento', 'turno-escenario', 'turno-entrega', 'turno-cierre'],
        ];
        blocks.forEach((block, index) => {
            const slides = parseTrainingSlides(block);
            expect(slides.map(slide => slide.id)).toEqual(expectedIds[index]);
            expect(trainingQualityReport(slides).score).toBe(100);
            expect(isPublishableTrainingCourse(slides)).toBe(true);
            for (const slide of slides) {
                expect(slide.bullets.some(bullet => bullet.trim() === slide.lead?.trim())).toBe(false);
                expect(slide.lead && slide.lead.length).toBeGreaterThan(40);
            }
            const questions = slides.flatMap(slide => slide.activity?.options ?? []);
            expect(questions.length).toBeGreaterThanOrEqual(8);
            expect(questions.join(' ')).not.toMatch(/Publicar el número de la unidad en el grupo comunitario|grabe la pantalla con su teléfono/);
            expect(slides.some(slide => slide.role_cards?.some(card => card.responsibility === 'Define criterio, responsable y control'))).toBe(false);
        });
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
        expect(trainingActivityCount(slides)).toBeGreaterThanOrEqual(3);
        expect(isPublishableTrainingCourse(slides)).toBe(true);
    });
});
