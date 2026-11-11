-- The classroom displays training_lessons, while scoring reads the published
-- training_module_versions snapshot. Keep both copies aligned for the safety
-- correction to the global concierge course. Other versions and local courses
-- remain unchanged.
UPDATE public.training_module_versions AS version
SET lesson_content = lesson.content
FROM public.training_modules AS module
JOIN public.training_lessons AS lesson ON lesson.module_id = module.id
WHERE version.module_id = module.id
  AND version.version_number = module.version_number
  AND module.community_id IS NULL
  AND module.title = 'Operación diaria: conserjería, mantención y emergencias'
  AND lesson.content::jsonb -> 2 ->> 'id' = 'turno-primeros'
  AND lesson.content::jsonb -> 2 ->> 'title' = 'Proteger y avisar sin demora'
  AND version.lesson_content::jsonb -> 2 ->> 'id' = 'turno-primeros'
  AND version.lesson_content::jsonb -> 0 = lesson.content::jsonb -> 0
  AND version.lesson_content::jsonb -> 1 = lesson.content::jsonb -> 1
  AND version.lesson_content::jsonb -> 5 = lesson.content::jsonb -> 5
  AND version.lesson_content::jsonb -> 6 = lesson.content::jsonb -> 6
  AND version.lesson_content::jsonb -> 7 = lesson.content::jsonb -> 7;
