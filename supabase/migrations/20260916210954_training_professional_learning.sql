-- Upgrade the official staff curriculum without replacing module or lesson IDs.
-- Keeping IDs preserves every user's existing progress record.

BEGIN;

UPDATE public.training_modules
SET description = 'Curso práctico para aplicar reglas de convivencia, registrar hechos y derivar cada situación al canal responsable.',
    learning_objectives = to_jsonb(ARRAY[
      'Distinguir una comunicación general de un caso que requiere seguimiento.',
      'Registrar hechos verificables sin exponer datos innecesarios.',
      'Escalar y cerrar situaciones de convivencia con trazabilidad.'
    ]),
    estimated_minutes = 28,
    quality_version = 3
WHERE id = '4b7f3d4b-5a7f-4c9b-a6c1-6ef2e7a8c101';

UPDATE public.training_lessons
SET title = 'Convivencia: criterios, decisiones y cierre',
    content = $course$[
  {"id":"convivencia-proposito","eyebrow":"Propósito","title":"Convivencia con reglas claras","bullets":["La Ley 21.442 y el reglamento de copropiedad orientan la vida comunitaria.","Una regla general se comunica; una situación concreta se registra y sigue.","Administración conduce el procedimiento y conserjería aporta hechos del turno."],"visual_theme":"ink","notes":"Aclara que el curso ordena la gestión operativa y no reemplaza asesoría jurídica para decisiones complejas."},
  {"id":"convivencia-registro","eyebrow":"Criterio","title":"Registrar hechos, no conclusiones","bullets":["Anota fecha, hora, lugar y conducta observada.","Adjunta solo evidencia pertinente y obtenida por canales autorizados.","Evita calificaciones personales o información que no ayuda a resolver."],"visual_theme":"copper","notes":"Conserjería registra lo observado; administración evalúa antecedentes y determina el curso de acción.","activity":{"type":"knowledge_check","prompt":"¿Cuál es el registro más útil para iniciar una gestión de convivencia?","options":["Fecha, hora, lugar, hecho observado y evidencia pertinente","La opinión de terceros sin identificar cuándo ocurrió","Una advertencia pública en el chat de residentes"],"correctIndex":0,"explanation":"Un registro objetivo permite revisar el caso, proteger a las personas y sostener el seguimiento."}},
  {"id":"convivencia-canal","eyebrow":"Procedimiento","title":"Elegir el canal correcto","bullets":["Usa Comunicaciones para recordar normas a toda la comunidad.","Usa un caso con responsable y plazo cuando existe una situación individual.","Usa Votaciones solo cuando corresponda una decisión comunitaria formal."],"visual_theme":"sage","notes":"Muestra la diferencia entre informar, gestionar un caso y someter una materia a decisión."},
  {"id":"convivencia-escenario","eyebrow":"Práctica","title":"Ruido reiterado fuera de horario","bullets":["Conserjería recibe un segundo aviso durante el mismo turno.","Existe hora, unidad y observación directa, pero no corresponde confrontar.","La administración debe recibir un registro suficiente para continuar."],"visual_theme":"amber","notes":"Pide justificar la decisión según atribuciones y trazabilidad.","activity":{"type":"scenario","prompt":"¿Qué actuación corresponde a conserjería?","options":["Registrar los hechos, aplicar el protocolo autorizado y escalar a administración","Publicar el número de la unidad en el grupo comunitario","Definir y cobrar una multa inmediatamente"],"correctIndex":0,"explanation":"Conserjería actúa dentro del protocolo y deja antecedentes; administración conduce las medidas posteriores."}},
  {"id":"convivencia-seguimiento","eyebrow":"Seguimiento","title":"Responsable, plazo y comunicación","bullets":["Cada caso debe mostrar quién realizará la próxima acción.","Informa recepción y cambios relevantes sin prometer resultados no autorizados.","Cierra con la decisión adoptada y la evidencia disponible."],"visual_theme":"copper","notes":"Relaciona el cierre con una actualización comprensible para quienes corresponda, sin difusión innecesaria."},
  {"id":"convivencia-cierre","eyebrow":"Transferencia","title":"Lista de cierre responsable","bullets":["La situación quedó clasificada y en el canal correcto.","Los hechos están separados de opiniones o supuestos.","Existe responsable, próximo paso y comunicación de cierre."],"visual_theme":"ink","notes":"Esta lista debe poder aplicarse al finalizar cualquier gestión de convivencia.","activity":{"type":"checklist","prompt":"Confirma que puedes cerrar una gestión de convivencia con estos controles:","items":["Registrar hechos verificables y evidencia pertinente","Proteger los datos de las personas involucradas","Asignar responsable y plazo","Comunicar el resultado por el canal adecuado"],"explanation":"Una gestión profesional combina debido registro, privacidad, responsabilidad y cierre visible."}}
]$course$
WHERE id = '9f6a1b41-4e1b-4472-8b11-bf3b98600101';

UPDATE public.training_modules
SET description = 'Formación para que Administración gestione datos, cámaras, comunicaciones y accesos con finalidad, permisos y trazabilidad.',
    learning_objectives = to_jsonb(ARRAY[
      'Reconocer datos personales y limitar su uso a una finalidad legítima.',
      'Responder solicitudes de imágenes o antecedentes mediante un proceso autorizado.',
      'Revisar permisos, registros y canales de comunicación del condominio.'
    ]),
    estimated_minutes = 32,
    quality_version = 3
WHERE id = '4b7f3d4b-5a7f-4c9b-a6c1-6ef2e7a8c102';

UPDATE public.training_lessons
SET title = 'Privacidad y seguridad para Administración',
    content = $course$[
  {"id":"datos-proposito","eyebrow":"Propósito","title":"Datos personales bajo responsabilidad","bullets":["Contactos, identificadores, deudas e imágenes pueden identificar a una persona.","La administración debe definir para qué usa cada dato y quién necesita acceder.","Más información visible no significa una gestión más segura."],"visual_theme":"ink","notes":"Enfatiza finalidad, acceso por rol y minimización; evita convertir el curso en una asesoría jurídica cerrada."},
  {"id":"datos-minimizacion","eyebrow":"Fundamento","title":"Finalidad y mínimo acceso","bullets":["Solicita y conserva solo los datos necesarios para una gestión definida.","Revisa que cada rol vea únicamente lo que necesita para actuar.","Evita copiar datos sensibles en chats, planillas paralelas o mensajes informales."],"visual_theme":"copper","notes":"Relaciona los principios con directorio, morosidad, visitas y proveedores.","activity":{"type":"knowledge_check","prompt":"¿Qué configuración reduce mejor el riesgo sobre datos personales?","options":["Acceso por rol, finalidad definida y registro de acciones relevantes","Una planilla compartida con todo el personal y proveedores","Enviar copias completas por mensajería para resolver más rápido"],"correctIndex":0,"explanation":"Limitar el acceso y mantener trazabilidad reduce exposición y permite demostrar una gestión responsable."}},
  {"id":"datos-camaras","eyebrow":"Procedimiento","title":"Solicitudes de cámaras y antecedentes","bullets":["Confirma identidad, motivo, alcance temporal y persona autorizada para decidir.","Registra quién pidió, quién autorizó y qué material fue entregado o revisado.","No difundas imágenes por canales informales ni más allá de la finalidad aprobada."],"visual_theme":"sage","notes":"Define un flujo interno antes de que ocurra una solicitud urgente."},
  {"id":"datos-escenario","eyebrow":"Práctica","title":"Una persona pide revisar cámaras","bullets":["La solicitud llega por un mensaje directo y alude a un incidente reciente.","El solicitante exige recibir el video completo de la jornada.","El material podría mostrar a otras personas y espacios comunes."],"visual_theme":"amber","notes":"Evalúa identidad, necesidad, autorización y alcance antes de cualquier entrega.","activity":{"type":"scenario","prompt":"¿Cuál es la primera respuesta de Administración?","options":["Registrar la solicitud y validar identidad, finalidad y autorización aplicable","Enviar el video completo para evitar un reclamo","Pedir a conserjería que grabe la pantalla con su teléfono"],"correctIndex":0,"explanation":"La urgencia percibida no elimina los controles de identidad, finalidad, alcance y autorización."}},
  {"id":"datos-comunicaciones","eyebrow":"Control","title":"Notificaciones y comunicaciones","bullets":["Selecciona destinatarios según el propósito del mensaje.","No incluyas deudas, teléfonos o antecedentes privados en avisos generales.","Usa canales institucionales y conserva evidencia de envíos relevantes."],"visual_theme":"copper","notes":"Distingue recordatorios generales de comunicaciones personales y casos restringidos."},
  {"id":"datos-cierre","eyebrow":"Auditoría","title":"Control periódico de privacidad","bullets":["Revisa usuarios con acceso y elimina permisos que ya no corresponden.","Comprueba que las solicitudes sensibles tengan responsable y registro.","Corrige integraciones o prácticas que dupliquen información sin necesidad."],"visual_theme":"ink","notes":"Convierte la revisión en una rutina de administración, con fecha y responsable.","activity":{"type":"checklist","prompt":"Antes de cerrar la revisión, confirma estos controles:","items":["Finalidad y responsable definidos para cada tratamiento relevante","Permisos alineados con el rol actual","Solicitudes y accesos sensibles registrados","Canales informales fuera del flujo operativo"],"explanation":"La privacidad se sostiene con controles periódicos, no solo con una política escrita."}}
]$course$
WHERE id = '9f6a1b41-4e1b-4472-8b11-bf3b98600102';

UPDATE public.training_modules
SET title = 'Operación diaria: conserjería, mantención y emergencias',
    description = 'Entrenamiento de turno para registrar novedades, responder emergencias, coordinar accesos y entregar pendientes sin perder trazabilidad.',
    learning_objectives = to_jsonb(ARRAY[
      'Clasificar novedades, urgencias y emergencias antes de actuar.',
      'Registrar acciones y escalarlas al responsable autorizado.',
      'Entregar el turno con pendientes, responsables y plazos claros.'
    ]),
    estimated_minutes = 30,
    quality_version = 3
WHERE id = '4b7f3d4b-5a7f-4c9b-a6c1-6ef2e7a8c103';

UPDATE public.training_lessons
SET title = 'Turno seguro y trazable de Conserjería',
    content = $course$[
  {"id":"turno-proposito","eyebrow":"Propósito","title":"Un turno sin improvisación","bullets":["Cada novedad relevante debe quedar en la bitácora con contexto suficiente.","La prioridad depende del riesgo para personas, bienes y continuidad del edificio.","Conserjería contiene, registra y escala dentro del protocolo autorizado."],"visual_theme":"ink","notes":"Presenta el curso como una rutina práctica para reducir pérdidas de información entre turnos."},
  {"id":"turno-clasificar","eyebrow":"Criterio","title":"Clasificar antes de responder","bullets":["Una novedad informa; una urgencia requiere respuesta pronta; una emergencia implica riesgo inmediato.","Confirma ubicación, personas afectadas y evolución de la situación.","No prometas reparaciones ni decisiones que corresponden a Administración."],"visual_theme":"copper","notes":"Usa ejemplos del edificio para separar las tres categorías.","activity":{"type":"knowledge_check","prompt":"¿Qué dato es indispensable al clasificar una alerta?","options":["Ubicación, riesgo actual, personas afectadas y evolución","Solo el nombre de quien llama","La opinión del turno anterior sin verificar"],"correctIndex":0,"explanation":"La clasificación se basa en hechos actuales que permiten priorizar y activar el protocolo correcto."}},
  {"id":"turno-procedimiento","eyebrow":"Procedimiento","title":"Contener, registrar y escalar","bullets":["Activa primero las medidas inmediatas permitidas por el protocolo.","Registra hora, lugar, evidencia y acciones ya realizadas.","Escala a Administración, emergencia o proveedor según el tipo de riesgo.","Mantén actualizaciones hasta que exista un responsable confirmado."],"visual_theme":"sage","notes":"Aclara que escalar no es abandonar: conserjería conserva seguimiento hasta el traspaso efectivo."},
  {"id":"turno-escenario","eyebrow":"Práctica","title":"Filtración activa en un pasillo","bullets":["El agua aumenta y podría alcanzar una instalación eléctrica.","No está confirmado el origen ni existe personal de mantención presente.","Residentes comienzan a acercarse al sector."],"visual_theme":"amber","notes":"Pide ordenar las primeras acciones sin exceder las atribuciones del rol.","activity":{"type":"scenario","prompt":"¿Cuál es la respuesta inicial más segura?","options":["Aislar el sector según protocolo, registrar, avisar y escalar de inmediato","Esperar a conocer el origen exacto antes de informar","Intentar una reparación eléctrica sin autorización"],"correctIndex":0,"explanation":"Primero se contiene el riesgo permitido, se protege el sector y se activa al responsable con información verificable."}},
  {"id":"turno-entrega","eyebrow":"Continuidad","title":"Entrega de turno que permite continuar","bullets":["Resume qué ocurrió, qué se hizo y cuál es el estado actual.","Identifica cada pendiente con responsable y plazo comprometido.","Señala riesgos abiertos y la próxima verificación necesaria.","Confirma verbalmente solo lo crítico; el registro sigue siendo la fuente oficial."],"visual_theme":"copper","notes":"Compara una entrega vaga con una entrega accionable y verificable."},
  {"id":"turno-cierre","eyebrow":"Transferencia","title":"Lista operativa de cierre","bullets":["La bitácora refleja novedades y acciones del turno.","Visitas, paquetes e incidentes quedaron en su módulo correspondiente.","Los pendientes tienen responsable, plazo y próxima acción."],"visual_theme":"ink","notes":"Completa esta lista antes de entregar el puesto al siguiente turno.","activity":{"type":"checklist","prompt":"Confirma que puedes entregar el turno con estos controles:","items":["Registrar hechos, hora, lugar y acción tomada","Escalar cada riesgo al responsable autorizado","Identificar pendientes y próxima verificación","Comunicar al siguiente turno los riesgos aún abiertos"],"explanation":"Una entrega profesional permite continuar la operación sin depender de memoria o mensajes dispersos."}}
]$course$
WHERE id = '9f6a1b41-4e1b-4472-8b11-bf3b98600103';

COMMIT;
