/**
 * Verifica los seis cursos base globales de la migración 20261014210000:
 * puntaje 100, publicables, estructura del aula e ilustración del catálogo.
 * Uso: npx tsx scripts/training-base-courses-check.ts
 */
import { readFileSync } from 'node:fs';
import { normalizeTrainingSlides, trainingQualityReport } from '../src/lib/training/courseContent';
import { slideTopic, type TrainingTopic } from '../src/lib/training/slideVisual';
import { readBaseCoursesFromMigration } from '../src/lib/training/baseCourseMigration';

const MIGRATION = 'supabase/migrations/20261014210000_training_six_base_courses.sql';
const EXPECTED: TrainingTopic[] = ['people', 'access', 'parcel', 'fire', 'cleaning', 'communication'];

const failures: string[] = [];
const check = (label: string, ok: boolean) => { if (!ok) failures.push(label); };

const courses = readBaseCoursesFromMigration(readFileSync(MIGRATION, 'utf8'));
check('Hay 6 cursos en la migración', courses.length === 6);

const topics = courses.map((course, index) => {
    const raw = JSON.parse(course.content) as Record<string, unknown>[];
    const slides = normalizeTrainingSlides(raw);
    const report = trainingQualityReport(slides);
    const graded = slides.filter(slide => slide.activity && slide.activity.type !== 'checklist');
    const correct = graded.map(slide => slide.activity!.correctIndex);
    const topic = slideTopic(course.title, course.description);
    const name = course.title;

    check(`${name}: puntaje 100 (obtuvo ${report.score})`, report.score === 100);
    check(`${name}: publicable`, report.publishable);
    check(`${name}: 8 o 9 secciones`, slides.length === raw.length && slides.length >= 8 && slides.length <= 9);
    check(`${name}: abre con opening`, slides[0]?.layout === 'opening');
    check(`${name}: al menos 4 layouts`, new Set(slides.map(slide => slide.layout)).size >= 4);
    check(`${name}: sin source_note`, slides.every(slide => !slide.source_note) && raw.every(item => !('source_note' in item)));
    check(`${name}: layouts y temas explícitos`, raw.every(item => typeof item.layout === 'string' && typeof item.visual_theme === 'string'));
    check(`${name}: id, eyebrow y lead en cada sección`, raw.every(item => item.id && item.eyebrow && typeof item.lead === 'string' && (item.lead as string).length > 40));
    check(`${name}: lead distinto de las viñetas`, slides.every(slide => !slide.bullets.includes(slide.lead || '')));
    check(`${name}: 2 a 5 viñetas de hasta 300 caracteres`, raw.every(item => Array.isArray(item.bullets) && item.bullets.length >= 2 && item.bullets.length <= 5 && (item.bullets as string[]).every(b => b.length <= 300)));
    check(`${name}: notas de 35 o más caracteres`, slides.every(slide => slide.notes.trim().length >= 35));
    check(`${name}: 3 o 4 preguntas con respuesta (knowledge_check y scenario)`, graded.length >= 3 && graded.length <= 4 && graded.some(s => s.activity!.type === 'scenario') && graded.some(s => s.activity!.type === 'knowledge_check'));
    check(`${name}: respuestas correctas en distintas posiciones`, new Set(correct).size >= 2 && correct.some(index => index !== 0));
    check(`${name}: explicación en cada pregunta`, graded.every(slide => (slide.activity!.explanation || '').length >= 40));
    check(`${name}: una sección con 2 o 3 role_cards`, slides.some(slide => (slide.role_cards?.length || 0) >= 2 && (slide.role_cards?.length || 0) <= 3));
    check(`${name}: termina en checklist`, slides.at(-1)?.layout === 'checklist' && slides.at(-1)?.activity?.type === 'checklist');
    check(`${name}: ilustración ${EXPECTED[index]} (obtuvo ${topic})`, topic === EXPECTED[index]);
    console.log(`${String(report.score).padStart(3)}  ${topic.padEnd(13)} ${slides.length} secciones  ${name}`);
    console.log(`      secciones: ${slides.map(slide => slideTopic(slide.title, slide.lead)).join(', ')}`);
    return topic;
});
check('Cada curso tiene una ilustración distinta', new Set(topics).size === topics.length);

if (failures.length) {
    console.error(`\n${failures.length} problema(s):\n- ${failures.join('\n- ')}`);
    process.exitCode = 1;
} else {
    console.log('\nLos 6 cursos base obtienen 100, son publicables y tienen ilustración propia.');
}
