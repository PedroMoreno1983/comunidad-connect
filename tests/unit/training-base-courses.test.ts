import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeTrainingSlides, trainingQualityReport } from '@/lib/training/courseContent';
import { slideTopic, splitComparison } from '@/lib/training/slideVisual';
import { readBaseCoursesFromMigration } from '@/lib/training/baseCourseMigration';

const MIGRATION = 'supabase/migrations/20261014210000_training_six_base_courses.sql';
const sql = readFileSync(MIGRATION, 'utf8');
const courses = readBaseCoursesFromMigration(sql);

describe('six global base courses', () => {
    it('ships six courses with their own catalog illustration', () => {
        expect(courses.map(course => slideTopic(course.title, course.description))).toEqual(['people', 'access', 'parcel', 'fire', 'cleaning', 'communication']);
    });

    it.each(courses.map(course => [course.title, course] as const))('%s scores 100 with the classroom structure', (_title, course) => {
        const raw = JSON.parse(course.content) as Record<string, unknown>[];
        const slides = normalizeTrainingSlides(raw);
        const report = trainingQualityReport(slides);
        expect(report.score).toBe(100);
        expect(report.publishable).toBe(true);
        expect(slides).toHaveLength(raw.length);
        expect(slides.length).toBeGreaterThanOrEqual(8);
        expect(slides.length).toBeLessThanOrEqual(9);
        expect(slides[0].layout).toBe('opening');
        expect(slides.at(-1)?.activity?.type).toBe('checklist');
        expect(raw.some(item => 'source_note' in item)).toBe(false);
        for (const slide of slides) {
            expect(slide.lead && slide.lead.length).toBeGreaterThan(40);
            expect(slide.bullets).not.toContain(slide.lead);
            expect(slide.notes.trim().length).toBeGreaterThanOrEqual(35);
        }
        const graded = slides.flatMap(slide => slide.activity && slide.activity.type !== 'checklist' ? [slide.activity] : []);
        expect(graded.length).toBeGreaterThanOrEqual(3);
        expect(graded.some(activity => activity.type === 'scenario')).toBe(true);
        expect(graded.every(activity => activity.options?.length === 4)).toBe(true);
        expect(graded.some(activity => activity.correctIndex !== 0)).toBe(true);
        for (const slide of slides.filter(item => item.layout === 'comparison')) {
            expect(splitComparison(slide.bullets).doList.length).toBeGreaterThan(0);
        }
        expect(course.content).not.toMatch(/moros|deudor|deuda/i);
    });

    it('keeps the lesson and the published version aligned and idempotent', () => {
        expect(sql.match(/ON CONFLICT \(id\) DO UPDATE/g)).toHaveLength(3);
        expect(sql).toContain("'Publicación inicial'");
        expect(sql).toContain('JOIN public.training_lessons l ON l.id = v.lesson_id');
        expect(sql).toContain("'interactive', NULL, now(), now()");
    });
});
