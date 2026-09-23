-- Alarga los tres cursos oficiales de 6 a 8 secciones.
-- Inserta las nuevas diapositivas por posición y solo si el curso sigue
-- en el orden de 20260923194520. Los ids anteriores no se tocan: el avance
-- y las respuestas siguen ligados a ellos.

UPDATE public.training_lessons
SET content = jsonb_insert(
    jsonb_insert(
        content::jsonb,
        '{2}',
        $slide${
          "id": "convivencia-respuesta",
          "eyebrow": "Conversación",
          "title": "Qué se contesta en el minuto",
          "lead": "Quien avisó necesita saber que el caso quedó recibido. No necesita, en ese momento, la medida que todavía no existe.",
          "layout": "framework",
          "bullets": [
            "Confirma la hora de recepción y que el registro quedó en el canal del edificio.",
            "Di el paso que sí te corresponde: anotar, observar el espacio común si cabe, y derivar.",
            "No nombres la otra unidad, no adelantes una multa y no pidas que la persona resuelva de palabra.",
            "Si el hecho sigue, indica el próximo contacto del edificio. No des un teléfono personal."
          ],
          "visual_theme": "copper",
          "notes": "Pide la respuesta de citófono en dos frases. Corta cualquier promesa de sanción o cualquier dato de la unidad señalada."
        }$slide$::jsonb
    ),
    '{5}',
    $slide${
      "id": "convivencia-reiteracion",
      "eyebrow": "Continuidad",
      "title": "Cuando el mismo hecho vuelve",
      "lead": "Un aviso nuevo del mismo hecho no borra el anterior ni autoriza a publicar la unidad.",
      "layout": "process",
      "bullets": [
        "Abre el caso que ya existe. No partas otro registro paralelo por el mismo hecho.",
        "Agrega fecha, hora y si esta vez hubo observación desde un espacio común.",
        "Si cambió el riesgo, escríbelo en el mismo caso y avisa a quien ya es responsable.",
        "El cierre anterior no se reabre con un comentario de pasillo: hace falta un hecho nuevo."
      ],
      "visual_theme": "sage",
      "notes": "Usa el ruido de la misma unidad al día siguiente. Pregunta qué se agrega al caso y qué no se publica."
    }$slide$::jsonb
)::text
WHERE id = '9f6a1b41-4e1b-4472-8b11-bf3b98600101'
  AND content::jsonb -> 2 ->> 'id' = 'convivencia-canal'
  AND content::jsonb -> 5 ->> 'id' = 'convivencia-cierre'
  AND NOT (content::jsonb @> '[{"id":"convivencia-respuesta"}]');

UPDATE public.training_lessons
SET content = jsonb_insert(
    jsonb_insert(
        content::jsonb,
        '{2}',
        $slide${
          "id": "datos-puesto",
          "eyebrow": "Turno",
          "title": "Qué anota el puesto y qué no copia",
          "lead": "Conserjería necesita identificar una visita o un vehículo en ese momento. No necesita llevarse el dato cuando el turno termina.",
          "layout": "framework",
          "bullets": [
            "Visita: nombre de quien ingresa, unidad de destino y hora. Nada de la ficha del residente.",
            "Vehículo: patente y motivo del ingreso, en el registro del edificio. No en una libreta personal.",
            "Si preguntan un teléfono o una deuda, se deriva a administración. No se lee en voz alta en el hall.",
            "Al salir el turno, el dato queda en el módulo. No se reenvía al grupo del personal."
          ],
          "visual_theme": "amber",
          "notes": "Pide dos anotaciones del puesto: una que corresponde a la tarea y una que sobra. El criterio es la gestión de ese momento."
        }$slide$::jsonb
    ),
    '{5}',
    $slide${
      "id": "datos-copia",
      "eyebrow": "Entrega",
      "title": "Si piden una copia del archivo",
      "lead": "Mostrar un tramo autorizado no es lo mismo que dejar el archivo en el teléfono de quien lo pidió.",
      "layout": "process",
      "bullets": [
        "La copia solo sale si administración la autorizó para ese pedido y ese tramo.",
        "Se entrega por el canal institucional. Un mensaje directo o un pendrive del puesto no sirven.",
        "Queda escrito quién recibió el archivo, a qué hora y qué rango incluye.",
        "Conserjería no guarda una copia para el próximo turno. El archivo vive donde administración lo dejó."
      ],
      "visual_theme": "copper",
      "notes": "Contrasta mirar el tramo en la oficina con reenviar el video. Pregunta dónde queda constancia de la entrega."
    }$slide$::jsonb
)::text
WHERE id = '9f6a1b41-4e1b-4472-8b11-bf3b98600102'
  AND content::jsonb -> 2 ->> 'id' = 'datos-camaras'
  AND content::jsonb -> 5 ->> 'id' = 'datos-cierre'
  AND NOT (content::jsonb @> '[{"id":"datos-puesto"}]');

UPDATE public.training_lessons
SET content = jsonb_insert(
    jsonb_insert(
        content::jsonb,
        '{2}',
        $slide${
          "id": "turno-primeros",
          "eyebrow": "Primeros minutos",
          "title": "Qué se hace antes de llamar",
          "lead": "El llamado sirve cuando ya puedes decir qué se ve, qué se hizo y quién está cerca.",
          "layout": "process",
          "bullets": [
            "Mira el lugar y aleja a las personas si el protocolo lo pide. No entres a un departamento para investigar.",
            "Anota la hora y lo visible: agua, humo, puerta abierta o ascensor detenido.",
            "Recién ahí avisas, con ese dato y no con la causa que todavía no está clara.",
            "Te quedas en el sector hasta que alguien confirma que toma el pendiente."
          ],
          "visual_theme": "amber",
          "notes": "Pide el llamado en una frase para la filtración del piso 3. Tiene que incluir lugar y riesgo, no el departamento de origen."
        }$slide$::jsonb
    ),
    '{5}',
    $slide${
      "id": "turno-residentes",
      "eyebrow": "Comunicación",
      "title": "Qué se dice en el pasillo",
      "lead": "La gente que se acerca necesita una instrucción clara. No necesita la causa ni la hora de un maestro.",
      "layout": "comparison",
      "bullets": [
        "Indica el sector que no se usa y por dónde circular, si el protocolo ya lo definió.",
        "Di que administración está informada. No des un plazo de reparación ni un nombre de proveedor.",
        "No comentes de qué departamento crees que viene el problema.",
        "Si preguntan de nuevo, repite el mismo dato. No completes con una suposición."
      ],
      "role_cards": [
        {"role": "Conserjería", "responsibility": "Da la instrucción del momento", "action": "Señala el sector y confirma que el aviso ya salió"},
        {"role": "Administración", "responsibility": "Informa el avance del arreglo", "action": "Dice plazo o proveedor solo cuando ya está decidido"}
      ],
      "visual_theme": "copper",
      "notes": "Simula a dos residentes junto al tablero. La respuesta del turno nombra el sector y el aviso, no el origen."
    }$slide$::jsonb
)::text
WHERE id = '9f6a1b41-4e1b-4472-8b11-bf3b98600103'
  AND content::jsonb -> 2 ->> 'id' = 'turno-procedimiento'
  AND content::jsonb -> 5 ->> 'id' = 'turno-cierre'
  AND NOT (content::jsonb @> '[{"id":"turno-primeros"}]');

UPDATE public.training_modules
SET estimated_minutes = 45,
    quality_version = 6,
    updated_at = now()
WHERE id IN (
    '4b7f3d4b-5a7f-4c9b-a6c1-6ef2e7a8c101',
    '4b7f3d4b-5a7f-4c9b-a6c1-6ef2e7a8c102',
    '4b7f3d4b-5a7f-4c9b-a6c1-6ef2e7a8c103'
);

UPDATE public.training_module_versions AS version
SET lesson_content = lesson.content,
    estimated_minutes = module.estimated_minutes,
    quality_score = module.quality_score,
    change_summary = $summary$Dos secciones más por curso: la respuesta del momento y la continuidad del caso, sin cambiar las diapositivas ya recorridas.$summary$
FROM public.training_lessons AS lesson
JOIN public.training_modules AS module ON module.id = lesson.module_id
WHERE version.module_id = lesson.module_id
  AND version.version_number = module.version_number
  AND lesson.id IN (
    '9f6a1b41-4e1b-4472-8b11-bf3b98600101',
    '9f6a1b41-4e1b-4472-8b11-bf3b98600102',
    '9f6a1b41-4e1b-4472-8b11-bf3b98600103'
  );
