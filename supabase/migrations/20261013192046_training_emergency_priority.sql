-- A water leak approaching electrical equipment is an immediate risk. The
-- classroom must not teach staff to finish a written record before alerting.
-- Apply only to the global base course; community adaptations remain owned by
-- their administrators.
WITH target AS (
    SELECT lesson.id, lesson.content::jsonb AS slides
    FROM public.training_lessons AS lesson
    JOIN public.training_modules AS module ON module.id = lesson.module_id
    WHERE module.community_id IS NULL
      AND module.title = 'Operación diaria: conserjería, mantención y emergencias'
      AND lesson.content::jsonb -> 2 ->> 'id' = 'turno-primeros'
      AND lesson.content::jsonb -> 3 ->> 'id' = 'turno-procedimiento'
      AND lesson.content::jsonb -> 4 ->> 'id' = 'turno-escenario'
), revised AS (
    SELECT id,
        jsonb_set(
            jsonb_set(
                jsonb_set(
                    jsonb_set(
                        slides,
                        '{2}',
                        (slides -> 2) || jsonb_build_object(
                            'title', 'Proteger y avisar sin demora',
                            'lead', 'Si hay peligro inmediato, aleja a las personas y activa el aviso de emergencia sin esperar a terminar la bitácora.',
                            'bullets', to_jsonb(ARRAY[
                                'Mira desde un lugar seguro y aleja a las personas del sector. No entres a investigar ni toques un tablero, enchufe o equipo mojado.',
                                'Si hay agua cerca de electricidad, humo, gas o alguien lesionado, activa de inmediato el protocolo y el contacto de emergencia que corresponda. No esperes a conocer la causa.',
                                'Comunica lugar, riesgo visible y personas expuestas. La hora y los detalles se registran en cuanto sea seguro, o en paralelo si otra persona puede hacerlo.',
                                'Permanece en un lugar seguro y confirma quién tomó el incidente. No prometas una reparación ni manipules la instalación.'
                            ]::text[]),
                            'notes', 'Ante agua junto a un tablero, primero distancia y aviso inmediato según el protocolo del edificio. No pidas completar el registro antes de llamar. Pregunta qué datos mínimos se comunican desde un lugar seguro.'
                        ),
                        false
                    ),
                    '{3}',
                    (slides -> 3) || jsonb_build_object(
                        'bullets', to_jsonb(ARRAY[
                            'Primero protege a las personas y delimita el sector desde un lugar seguro. No manipules instalaciones eléctricas ni busques el origen del agua.',
                            'Si existe peligro inmediato, activa el contacto de emergencia previsto por el edificio y avisa a administración sin esperar a completar la bitácora.',
                            'Después registra hora, lugar, riesgo observado, medidas tomadas, avisos y quién asumió el caso.',
                            'No cierres el pendiente hasta tener un responsable confirmado.'
                        ]::text[])
                    ),
                    false
                ),
                '{4,activity,options,0}',
                to_jsonb('Alejo a las personas y aíslo el sector desde un lugar seguro. Activo de inmediato el protocolo y el contacto de emergencia, aviso a administración y registro lo ocurrido en cuanto sea seguro.'::text),
                false
            ),
            '{4,activity,explanation}',
            to_jsonb('Agua que avanza hacia un tablero exige proteger a las personas y activar de inmediato el aviso de emergencia. No se toca el tablero ni se espera a identificar la causa o completar la bitácora. El registro se hace cuando sea seguro.'::text),
            false
        ) AS slides
    FROM target
)
UPDATE public.training_lessons AS lesson
SET content = revised.slides::text
FROM revised
WHERE lesson.id = revised.id;
