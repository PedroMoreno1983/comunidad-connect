-- Profundiza los tres cursos oficiales sin cambiar módulos ni lecciones.
-- El avance y las respuestas quedan atados a los mismos ids de diapositiva.
-- La versión 1 se actualiza en el lugar: el aula lee training_lessons y la
-- corrección de actividades lee training_module_versions de esa misma versión.

UPDATE public.training_modules
SET description = $desc$Curso para separar un aviso de un caso, registrar solo lo observado y cerrar convivencia sin sancionar ni difundir desde el turno.$desc$,
    learning_objectives = to_jsonb(ARRAY[
      $obj$Distinguir un aviso, una observación directa y una decisión.$obj$,
      $obj$Elegir Comunicaciones, un caso o una votación según el tipo de situación.$obj$,
      $obj$Cerrar con responsable, plazo y un mensaje que no promete sanción.$obj$
    ]),
    estimated_minutes = 35,
    quality_version = 5,
    quality_score = 100,
    updated_at = now()
WHERE id = '4b7f3d4b-5a7f-4c9b-a6c1-6ef2e7a8c101';

UPDATE public.training_lessons
SET content = $course$[
  {
    "id": "convivencia-proposito",
    "eyebrow": "Inicio",
    "title": "Del reglamento al caso",
    "lead": "El reglamento dice qué rige en el edificio. El registro dice qué ocurrió, quién lo vio y quién sigue el caso.",
    "layout": "opening",
    "bullets": [
      "Una norma general se recuerda a toda la comunidad. Un hecho de una unidad se sigue como caso.",
      "Antes de escribir, separa lo que dice el reglamento, lo que alguien avisó y lo que tú observaste.",
      "Administración califica y decide. Conserjería aporta el turno: no multa, no entra al departamento y no publica la unidad."
    ],
    "visual_theme": "ink",
    "notes": "Abre con un reclamo de ruido de anoche. Pregunta quién vio el hecho y quién solo recibió el aviso. Recuerda que el curso ordena la gestión y no reemplaza una consulta jurídica cuando la medida es compleja."
  },
  {
    "id": "convivencia-registro",
    "eyebrow": "Criterio",
    "title": "Qué sí se escribe",
    "lead": "Si mañana otra persona retoma el caso, tiene que poder saber qué se constató y qué solo fue un relato.",
    "layout": "framework",
    "bullets": [
      "Anota fecha, hora, lugar, quién avisa y la conducta, en ese orden.",
      "Si no lo viste, escribe que avisaron. No conviertas un llamado en una constatación.",
      "Adjunta solo evidencia del canal del edificio. No uses chats privados ni datos de salud, deudas o familia.",
      "Puedes describir el hecho. No uses adjetivos sobre la persona, como irresponsable o conflictivo."
    ],
    "visual_theme": "copper",
    "notes": "Pide reescribir un registro que diga que el departamento es conflictivo. El resultado tiene que quedar en hechos, hora y si hubo observación directa.",
    "activity": {
      "type": "knowledge_check",
      "prompt": "Son las 22:40. La unidad 302 llama por citófono y dice que en el 304 hay música fuerte. Tú no subiste. ¿Qué registro sirve?",
      "options": [
        "22:40, citófono, 302 avisa música en 304. Sin observación directa. Queda informado a administración.",
        "22:40, se constató ruido reiterado en 304 y se aplicó el protocolo de sanción.",
        "Se anota que el 304 repitió el problema, porque el turno anterior ya tenía un aviso parecido.",
        "No se registra: un llamado por citófono no es una denuncia formal."
      ],
      "correctIndex": 0,
      "explanation": "El registro útil dice quién avisó, a qué hora y que nadie del turno observó el hecho. Darlo por constatado o por sancionado deja el caso indefendible. Omitirlo obliga al siguiente turno a empezar de cero."
    }
  },
  {
    "id": "convivencia-canal",
    "eyebrow": "Procedimiento",
    "title": "Dónde se gestiona",
    "lead": "El canal se elige por el tipo de decisión, no por el grupo donde llegó el reclamo.",
    "layout": "process",
    "bullets": [
      "Comunicaciones sirve para horario de silencio, mudanzas o estacionamientos, sin nombrar unidades ni personas.",
      "Un caso con responsable y plazo sirve cuando ya hay hechos: ruido reiterado, mascota o basura en un pasillo.",
      "Una votación sirve solo para materias que el reglamento entrega a la asamblea, no para un reclamo entre dos unidades.",
      "El grupo interno del personal no es el expediente. El caso vive en la plataforma."
    ],
    "role_cards": [
      {"role": "Administración", "responsibility": "Califica el hecho y elige el canal", "action": "Abre el seguimiento, fija plazo y dice qué se puede comunicar"},
      {"role": "Conserjería", "responsibility": "Aporta lo visto o avisado en el turno", "action": "Registra y deriva. No publica ni define una sanción"}
    ],
    "visual_theme": "sage",
    "notes": "Pide un ejemplo de cada canal con un caso del edificio. Si eligen el grupo interno, pregunta qué pasa con ese antecedente cuando cambia el turno."
  },
  {
    "id": "convivencia-escenario",
    "eyebrow": "Práctica",
    "title": "Segundo aviso de ruido",
    "lead": "El segundo aviso del mismo turno ya no es un comentario: tiene que salir del puesto con datos que administración pueda usar.",
    "layout": "scenario",
    "bullets": [
      "A las 23:10 y a las 23:35 la unidad 502 avisa música en 504. En el segundo aviso se escucha desde el pasillo del piso 5.",
      "El horario de silencio del edificio parte a las 22:00. Conserjería no multa ni ingresa al departamento.",
      "El turno anterior dejó un aviso similar, sin observación directa."
    ],
    "visual_theme": "amber",
    "notes": "Pide ordenar los primeros diez minutos. Detén la respuesta si incluye multa, ingreso al departamento o publicar el número de unidad.",
    "activity": {
      "type": "scenario",
      "prompt": "En los siguientes diez minutos, ¿qué actuación corresponde?",
      "options": [
        "Registro ambos avisos, anoto la observación desde el pasillo a las 23:35 y dejo el caso a administración, sin publicar la unidad.",
        "Subo, pido que bajen el volumen y, si no abren, dejo una advertencia escrita bajo la puerta.",
        "Publico en Comunicaciones que la unidad 504 está fuera de horario, para que el edificio tome nota.",
        "No agrego registro: ayer ya quedó un aviso parecido y este puede esperar a la mañana."
      ],
      "correctIndex": 0,
      "explanation": "La observación desde el espacio común sí se registra y se distingue del aviso. La sanción, el ingreso y la difusión del número de unidad no son decisiones del turno."
    }
  },
  {
    "id": "convivencia-seguimiento",
    "eyebrow": "Seguimiento",
    "title": "Quién sigue y hasta cuándo",
    "lead": "Un caso sin nombre y sin fecha de revisión vuelve a entrar como si nadie lo hubiera recibido.",
    "layout": "comparison",
    "bullets": [
      "El próximo paso nombra a una persona de administración, del comité o de un proveedor. Decir que se verá no asigna a nadie.",
      "Si el horario de silencio sigue vigente, la revisión es de este turno. Si el hecho ya terminó, el plazo es el día hábil siguiente.",
      "A quien avisó se le confirma la recepción. No se promete multa ni un resultado.",
      "El cierre dice qué se decidió y qué evidencia quedó, incluso cuando no hay sanción."
    ],
    "role_cards": [
      {"role": "Administración", "responsibility": "Cierra o mantiene el caso", "action": "Define la medida que el reglamento permite y deja el motivo por escrito"},
      {"role": "Conserjería", "responsibility": "Informa el estado del turno", "action": "Confirma la recepción al residente y no adelanta la decisión"}
    ],
    "visual_theme": "copper",
    "notes": "Contrasta un pendiente que dice se verá con uno que nombra a administración, la hora del registro y la revisión del día hábil siguiente."
  },
  {
    "id": "convivencia-cierre",
    "eyebrow": "Transferencia",
    "title": "Cierre que otra persona entiende",
    "lead": "El caso está listo cuando alguien que no estuvo en el turno entiende qué pasó, qué se decidió y qué no corresponde repetir.",
    "layout": "checklist",
    "bullets": [
      "El texto separa aviso, observación y decisión.",
      "El canal coincide con el tipo de situación y no nombra unidades en un aviso general.",
      "Hay responsable, plazo y un mensaje de recepción que no promete sanción."
    ],
    "visual_theme": "ink",
    "notes": "Usa la lista con el caso de ruido antes de dejar avanzar. Si falta el responsable, el caso sigue abierto.",
    "activity": {
      "type": "checklist",
      "prompt": "Antes de dar por cerrado un caso de convivencia, confirma:",
      "items": [
        "El registro distingue aviso, observación directa y decisión",
        "No quedaron juicios ni datos que no sirven para resolver",
        "El canal es el correcto y no expone a la unidad en un aviso general",
        "Hay responsable, plazo y confirmación de recepción"
      ],
      "explanation": "Esos cuatro controles permiten retomar o cerrar el caso sin depender de la memoria del turno."
    }
  }
]$course$
WHERE id = '9f6a1b41-4e1b-4472-8b11-bf3b98600101';

UPDATE public.training_modules
SET description = $desc$Formación para que administración use datos, cámaras y avisos con una finalidad concreta, permisos vigentes y un registro de cada entrega.$desc$,
    learning_objectives = to_jsonb(ARRAY[
      $obj$Reconocer qué datos del edificio identifican a una persona y para qué gestión existen.$obj$,
      $obj$Atender un pedido de imágenes por tramo, identidad y autorización, no por la jornada completa.$obj$,
      $obj$Separar un aviso general de una gestión individual y revisar quién conserva acceso.$obj$
    ]),
    estimated_minutes = 35,
    quality_version = 5,
    quality_score = 100,
    updated_at = now()
WHERE id = '4b7f3d4b-5a7f-4c9b-a6c1-6ef2e7a8c102';

UPDATE public.training_lessons
SET content = $course$[
  {
    "id": "datos-proposito",
    "eyebrow": "Inicio",
    "title": "Qué dato es personal aquí",
    "lead": "En el edificio, un dato personal es cualquier antecedente que permite identificar a una persona, aunque no lleve su nombre completo.",
    "layout": "opening",
    "bullets": [
      "Teléfono, correo, patente, deudas, visitas e imágenes de cámaras pueden identificar a alguien.",
      "Cada dato se usa para una gestión concreta: cobranza, acceso, seguridad o comunicación.",
      "Que el equipo pueda ver más información no hace más segura la operación."
    ],
    "visual_theme": "ink",
    "notes": "Pide tres datos que hoy circulan en el edificio y para qué gestión existe cada uno. No conviertas la sección en una clase de ley. Si el caso es delicado, el criterio queda en administración."
  },
  {
    "id": "datos-minimizacion",
    "eyebrow": "Criterio",
    "title": "Quién necesita verlo",
    "lead": "El acceso se abre para una tarea vigente. Cuando la tarea termina, el acceso también.",
    "layout": "framework",
    "bullets": [
      "Quien cobra ve la deuda de la unidad. Conserjería no necesita ese detalle para recibir una visita.",
      "El directorio muestra lo necesario para ubicar a un residente, no la ficha completa.",
      "No copies teléfonos, deudas o imágenes a planillas, chats o correos personales.",
      "Un proveedor recibe solo el dato del trabajo encargado, y solo mientras dura ese trabajo."
    ],
    "visual_theme": "copper",
    "notes": "Relaciona cada bullet con directorio, morosidad, visitas o proveedores del edificio. Pide cuál de esos datos sobra en el puesto de conserjería.",
    "activity": {
      "type": "knowledge_check",
      "prompt": "Hay que avisar un corte de agua y, aparte, seguir la deuda de tres unidades. ¿Qué envío es el correcto?",
      "options": [
        "Un aviso general del corte, sin nombres, y la deuda solo en el canal de cobranza de esas unidades.",
        "Un solo mensaje al edificio con el corte y el listado de unidades morosas, para no duplicar trabajo.",
        "La planilla de deudas al grupo de conserjería, porque en el turno responden las preguntas.",
        "El detalle de deuda al proveedor del corte, por si necesita priorizar los departamentos."
      ],
      "correctIndex": 0,
      "explanation": "El corte es información de todos. La deuda identifica a personas y solo la ve quien hace la cobranza. Juntar ambos fines en un mismo mensaje expone un dato que el aviso no necesita."
    }
  },
  {
    "id": "datos-camaras",
    "eyebrow": "Procedimiento",
    "title": "Pedido de imágenes",
    "lead": "Una solicitud de cámaras se registra antes de mostrar cualquier imagen, aunque la persona esté en el hall y diga que es urgente.",
    "layout": "process",
    "bullets": [
      "Anota quién pide, a qué hora, qué hecho, qué rango de tiempo y qué cámara.",
      "Confirma identidad y si esa persona puede recibir el material. La urgencia no reemplaza esa confirmación.",
      "Revisa el tramo pedido, no la jornada completa: en la imagen pueden aparecer otras personas.",
      "Entrega o muestra solo lo autorizado y deja constancia de quién vio el material."
    ],
    "role_cards": [
      {"role": "Administración", "responsibility": "Autoriza el acceso a la imagen", "action": "Define el tramo, registra la entrega y niega lo que sobra"},
      {"role": "Conserjería", "responsibility": "Recibe el pedido en el turno", "action": "Anota los datos y avisa a administración. No copia ni reenvía el video"}
    ],
    "visual_theme": "sage",
    "notes": "Recorre un pedido que llega al puesto un domingo por mensaje. Pregunta qué se anota antes de abrir el reproductor."
  },
  {
    "id": "datos-escenario",
    "eyebrow": "Práctica",
    "title": "Piden el video del día",
    "lead": "El pedido más frecuente es el video completo. El material que se puede revisar es solo el tramo del hecho.",
    "layout": "scenario",
    "bullets": [
      "Un residente escribe por mensaje directo y pide el video de toda la mañana por un roce en el estacionamiento a las 08:40.",
      "En ese rango la cámara muestra también a otras personas y patentes.",
      "Conserjería ve la pantalla, pero no está autorizada a exportar ni a reenviar."
    ],
    "visual_theme": "amber",
    "notes": "Pide la primera respuesta antes de discutir si el residente tiene o no razón. El criterio es identidad, tramo y canal de entrega.",
    "activity": {
      "type": "scenario",
      "prompt": "¿Cuál es la primera respuesta de administración?",
      "options": [
        "Registro el pedido, confirmo identidad y dejo solo el tramo de las 08:40 para una revisión autorizada, sin enviar el archivo por el chat.",
        "Pido a conserjería que recorte el video con el teléfono y lo mande al residente para cerrar el reclamo hoy.",
        "Envío la mañana completa: si no lo hago, el residente va a insistir y el caso se alarga.",
        "Espero a la asamblea para decidir si las cámaras se pueden mostrar."
      ],
      "correctIndex": 0,
      "explanation": "Se atiende el hecho concreto, no la jornada. Copiar la pantalla o mandar el archivo por chat saca el material del registro. Esperar a la asamblea no reemplaza el flujo de autorización del edificio."
    }
  },
  {
    "id": "datos-comunicaciones",
    "eyebrow": "Control",
    "title": "Qué va en un aviso y qué no",
    "lead": "Un aviso general informa un hecho del edificio. Una gestión de una persona va por un canal directo.",
    "layout": "comparison",
    "bullets": [
      "Cortes, mantenciones y normas se anuncian sin teléfonos, deudas ni números de unidad de un caso.",
      "Un reclamo o una cobranza se escribe solo a la persona o unidad que corresponde.",
      "El envío relevante queda en el canal institucional, no en un reenvío personal."
    ],
    "role_cards": [
      {"role": "Administración", "responsibility": "Elige destinatarios según el fin del mensaje", "action": "Separa el aviso de comunidad de la gestión individual"},
      {"role": "Conserjería", "responsibility": "No reenvía antecedentes del puesto", "action": "Deriva la pregunta al canal que ya tiene el permiso"}
    ],
    "visual_theme": "copper",
    "notes": "Toma un aviso de la semana y tacha cualquier dato que identifique a una persona sin ser necesario para ese aviso."
  },
  {
    "id": "datos-cierre",
    "eyebrow": "Auditoría",
    "title": "Revisión corta de accesos",
    "lead": "La privacidad se sostiene si cada cierto tiempo alguien mira quién sigue teniendo acceso y para qué.",
    "layout": "checklist",
    "bullets": [
      "Hay una finalidad y un responsable para cámaras, directorio, cobranza y visitas.",
      "Los permisos coinciden con el rol actual. Quien ya no trabaja no conserva acceso.",
      "Los pedidos de imágenes tienen registro de solicitud, autorización y entrega."
    ],
    "visual_theme": "ink",
    "notes": "Convierte la lista en una revisión con fecha y responsable. Una política guardada, sin esta revisión, no evita la copia informal.",
    "activity": {
      "type": "checklist",
      "prompt": "En la revisión de este mes, confirma:",
      "items": [
        "Cada tratamiento relevante tiene finalidad y responsable",
        "Los permisos coinciden con quien trabaja hoy y con su rol",
        "Los pedidos de imágenes quedaron registrados de punta a punta",
        "No hay copias de deudas, teléfonos o videos en chats o planillas paralelas"
      ],
      "explanation": "Esos controles se pueden revisar en una reunión corta. Una política guardada, sin esta revisión, no evita la copia informal."
    }
  }
]$course$
WHERE id = '9f6a1b41-4e1b-4472-8b11-bf3b98600102';

UPDATE public.training_modules
SET description = $desc$Entrenamiento de turno para clasificar lo que pasa, contener el riesgo permitido y entregar cada pendiente con responsable y hora de verificación.$desc$,
    learning_objectives = to_jsonb(ARRAY[
      $obj$Clasificar una novedad, una urgencia y una emergencia con el riesgo que se ve.$obj$,
      $obj$Contener, registrar y escalar sin prometer una reparación ni manipular una instalación.$obj$,
      $obj$Entregar el puesto con pendientes que el turno siguiente puede retomar sin llamar.$obj$
    ]),
    estimated_minutes = 35,
    quality_version = 5,
    quality_score = 100,
    updated_at = now()
WHERE id = '4b7f3d4b-5a7f-4c9b-a6c1-6ef2e7a8c103';

UPDATE public.training_lessons
SET content = $course$[
  {
    "id": "turno-proposito",
    "eyebrow": "Inicio",
    "title": "El turno se entrega por escrito",
    "lead": "Lo que no queda en la bitácora no existe para el turno que entra, aunque se haya conversado en el pasillo.",
    "layout": "opening",
    "bullets": [
      "Cada novedad relevante lleva hora, lugar, qué se vio y qué se hizo.",
      "La prioridad sale del riesgo para personas, departamentos y servicios, no de quién insistió más.",
      "Conserjería contiene lo que el protocolo permite, registra y escala. No promete reparación ni hora de un proveedor."
    ],
    "visual_theme": "ink",
    "notes": "Pide una novedad reciente que no quedó escrita. Pregunta qué habría necesitado el turno siguiente para continuarla."
  },
  {
    "id": "turno-clasificar",
    "eyebrow": "Criterio",
    "title": "Novedad, urgencia y emergencia",
    "lead": "Clasificar mal atrasa lo grave o dispara una emergencia por un aviso que puede esperar.",
    "layout": "framework",
    "bullets": [
      "Novedad: encomienda, visita, ampolleta fundida o filtración contenida que no avanza. Se registra y se informa.",
      "Urgencia: filtración que sigue, ascensor detenido con personas o portón que no cierra. Se actúa según protocolo y se avisa de inmediato.",
      "Emergencia: humo, olor a gas, persona lesionada o agua cerca de un tablero. Se protege a las personas y se llama al servicio que corresponde.",
      "No prometas hora de llegada de un maestro ni un descuento. Eso lo define administración."
    ],
    "visual_theme": "copper",
    "notes": "Usa un ejemplo de cada categoría del propio edificio. Corrige si llaman emergencia a una encomienda o novedad a un olor a gas.",
    "activity": {
      "type": "knowledge_check",
      "prompt": "A las 07:10 avisan agua en el pasillo del piso 3. El charco crece y se acerca a un tablero. ¿Cómo la clasificas?",
      "options": [
        "Emergencia: hay agua en movimiento cerca de un tablero. Aíslo el acceso al sector y aviso de inmediato.",
        "Novedad: es una filtración más. Queda en la bitácora para mantención en horario hábil.",
        "Urgencia solo si el residente insiste. Mientras tanto se espera a ver si el agua se detiene.",
        "Emergencia recién cuando administración autorice cortar el agua."
      ],
      "correctIndex": 0,
      "explanation": "Agua que avanza hacia un tablero es riesgo inmediato para las personas. No se espera autorización para aislar el sector. La reparación y el corte general se coordinan con quien corresponde, pero la contención parte en el momento."
    }
  },
  {
    "id": "turno-procedimiento",
    "eyebrow": "Procedimiento",
    "title": "Contener, anotar, avisar",
    "lead": "Escalar no es irse del caso. El turno sigue en el lugar hasta que otra persona toma el pendiente por escrito.",
    "layout": "process",
    "bullets": [
      "Primero la medida inmediata del protocolo: sector aislado, personas alejadas y llave de paso solo si está autorizada.",
      "Después el registro: hora, lugar, qué se vio, qué se hizo y a quién se avisó.",
      "El aviso describe el riesgo actual, no una causa supuesta. Decir que hay agua junto al tablero es útil.",
      "No cierres el pendiente hasta tener un responsable confirmado."
    ],
    "role_cards": [
      {"role": "Conserjería", "responsibility": "Contiene y describe el hecho", "action": "Ejecuta el protocolo del turno y mantiene el sector hasta el traspaso"},
      {"role": "Administración", "responsibility": "Decide la reparación y a quién se llama", "action": "Confirma responsable, plazo y qué se informa a los residentes"}
    ],
    "visual_theme": "sage",
    "notes": "Recorre el orden con la filtración del piso 3. Detén la respuesta si salta a llamar a un maestro antes de aislar y registrar."
  },
  {
    "id": "turno-escenario",
    "eyebrow": "Práctica",
    "title": "Filtración junto al tablero",
    "lead": "En este caso el origen todavía no importa. Importa que el agua sigue y hay un tablero cerca.",
    "layout": "scenario",
    "bullets": [
      "El charco del piso 3 aumenta. No está claro si viene de un departamento o de un shaft.",
      "No hay personal de mantención en el edificio.",
      "Dos residentes se acercan a mirar el tablero."
    ],
    "visual_theme": "amber",
    "notes": "Pide la primera acción, no el plan de reparación. La respuesta correcta protege a las personas y deja constancia.",
    "activity": {
      "type": "scenario",
      "prompt": "¿Qué haces primero?",
      "options": [
        "Alejo a las personas, aislo el sector según el protocolo, registro hora y lo que se ve, y aviso a administración y al contacto de emergencia del edificio.",
        "Espero a ubicar el departamento de origen para no cortar agua de más.",
        "Intento secar el tablero y revisar la tapa para ver si hay que cortar la luz.",
        "Aviso por el grupo de residentes que no usen el pasillo y sigo con las encomiendas."
      ],
      "correctIndex": 0,
      "explanation": "Primero se protege a las personas y se deja constancia. Buscar el origen y manipular el tablero atrasan la contención y agregan riesgo. Un aviso masivo no reemplaza al responsable."
    }
  },
  {
    "id": "turno-entrega",
    "eyebrow": "Continuidad",
    "title": "Entrega que el otro turno puede usar",
    "lead": "Una entrega útil dice qué sigue abierto. Una entrega de que todo está tranquilo esconde el pendiente.",
    "layout": "comparison",
    "bullets": [
      "Por cada pendiente: qué pasó, qué se hizo, quién quedó a cargo y a qué hora hay que verificar.",
      "Visitas y encomiendas van en su módulo, no solo en la bitácora.",
      "Lo crítico se dice de palabra y queda escrito. Si las versiones no coinciden, manda lo escrito."
    ],
    "role_cards": [
      {"role": "Conserjería que sale", "responsibility": "Deja el pendiente usable", "action": "Escribe estado, responsable y próxima verificación"},
      {"role": "Conserjería que entra", "responsibility": "Lee antes de recibir el puesto", "action": "Confirma los riesgos abiertos y pregunta lo que no está escrito"}
    ],
    "visual_theme": "copper",
    "notes": "Compara hubo una filtración, ya avisamos con un pendiente que tiene piso, hora, sector aislado y a quién se llamó."
  },
  {
    "id": "turno-cierre",
    "eyebrow": "Transferencia",
    "title": "Antes de soltar el puesto",
    "lead": "El turno se puede entregar cuando quien entra no necesita llamarte para saber qué sigue abierto.",
    "layout": "checklist",
    "bullets": [
      "La bitácora tiene hora, lugar, acción y aviso de cada novedad relevante.",
      "Encomiendas, visitas e incidentes están en el módulo que corresponde.",
      "Cada riesgo abierto tiene responsable y hora de próxima verificación."
    ],
    "visual_theme": "ink",
    "notes": "Completa la lista en voz alta con el pendiente de la filtración antes de dar por entregado el puesto.",
    "activity": {
      "type": "checklist",
      "prompt": "Confirma la entrega con esta lista:",
      "items": [
        "Cada novedad relevante tiene hora, lugar, acción tomada y a quién se avisó",
        "Los riesgos abiertos están clasificados y escalados al responsable",
        "Visitas, encomiendas e incidentes quedaron en su módulo",
        "El turno que entra puede decir cuál es el próximo pendiente sin llamar"
      ],
      "explanation": "Esa entrega permite seguir la operación con el registro, no con la memoria de quien ya se fue."
    }
  }
]$course$
WHERE id = '9f6a1b41-4e1b-4472-8b11-bf3b98600103';

UPDATE public.training_module_versions AS version
SET lesson_content = lesson.content,
    lesson_title = lesson.title,
    quality_score = module.quality_score,
    description = module.description,
    learning_objectives = module.learning_objectives,
    estimated_minutes = module.estimated_minutes,
    change_summary = $summary$Revisión editorial: casos del turno, preguntas con errores reales y responsabilidades distintas en cada curso.$summary$
FROM public.training_lessons AS lesson
JOIN public.training_modules AS module ON module.id = lesson.module_id
WHERE version.module_id = lesson.module_id
  AND version.version_number = module.version_number
  AND lesson.id IN (
    '9f6a1b41-4e1b-4472-8b11-bf3b98600101',
    '9f6a1b41-4e1b-4472-8b11-bf3b98600102',
    '9f6a1b41-4e1b-4472-8b11-bf3b98600103'
  );
