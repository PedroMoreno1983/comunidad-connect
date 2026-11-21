import 'server-only';

/** Definiciones de herramientas de CoCo: assistant. Movidas tal cual desde tools.ts (21-11-2026). */
import { NORMA_SOURCES, NORMA_TRIBUNALS } from '../../normaResearch';

export const ASSISTANT_TOOL_DEFINITIONS = [
    {
        name: 'send_whatsapp_notification',
        description: 'Envía un mensaje de WhatsApp a un residente. Útil si el conserje o admin te pide avisar de algo urgente o encomienda.',
        input_schema: {
            type: 'object' as const,
            properties: {
                unit_id: { type: 'string', description: 'ID del departamento al cual notificar' },
                message: { type: 'string', description: 'El mensaje a enviar por WhatsApp.' },
            },
            required: ['unit_id', 'message'],
        },
    },
    {
        name: 'search_community_documents',
        description: 'Busca en los documentos de la comunidad (reglamento de copropiedad, actas, contratos) y en los que la persona subió al chat. Devuelve extractos con su página para citarla. Úsala ante cualquier pregunta sobre qué dice el reglamento: gastos comunes, multas, uso de espacios, mascotas, construcción.',
        input_schema: { type: 'object' as const, properties: { query: { type: 'string', description: 'Palabras clave en español, por ejemplo "gastos comunes partes iguales".' } }, required: ['query'] },
    },
    {
        name: 'save_community_document',
        description: 'Publica para toda la comunidad un documento que la administración subió al chat (el document_id viene con el documento). Desde ahí CoCo lo cita a cualquier vecino. Requiere confirmación. SOLO administradores.',
        input_schema: {
            type: 'object' as const,
            properties: {
                document_id: { type: 'string' },
                title: { type: 'string', description: 'Nombre claro, por ejemplo "Reglamento de copropiedad (1998)".' },
                kind: { type: 'string', enum: ['reglamento', 'acta', 'contrato', 'otro'] },
            },
            required: ['document_id', 'kind'],
        },
    },
    // ── MÓDULO: MEMORIA (todos los perfiles) ────────────────────────────────
    {
        name: 'remember_community_fact',
        description: 'Guarda o borra un hecho de la COMUNIDAD (reglamento interno, proveedor habitual o acuerdo del edificio) para que CoCo lo recuerde con todos. SOLO administradores. Requiere confirmación. No la uses para preferencias personales: eso es remember_preference.',
        input_schema: {
            type: 'object' as const,
            properties: {
                action: { type: 'string', enum: ['save', 'forget'], description: 'save guarda; forget borra el hecho indicado.' },
                fact: { type: 'string', description: 'El hecho, en una frase corta. Ej: "El quincho cierra a las 22:00".' },
                category: { type: 'string', enum: ['reglamento', 'proveedor', 'acuerdo', 'general'] },
            },
            required: ['fact'],
        },
    },
    {
        name: 'create_reminder',
        description: 'Agenda un recordatorio que la revisión diaria de las 09:00 (hora de Chile) entrega dentro de la app cuando ya llegó la hora pedida (notificación y, si hay hilo, un mensaje de CoCo). Ej: "recuérdame el viernes cobrar a la 302" o, solo administración, "avisa a las unidades con cobros pendientes el día 5". Las horas son de Chile (America/Santiago). No prometas la entrega en el minuto exacto: sale en esa revisión diaria. WhatsApp NO se envía salvo que la plataforma lo tenga encendido; por defecto queda apagado. Requiere confirmación.',
        input_schema: {
            type: 'object' as const,
            properties: {
                text: { type: 'string', description: 'Qué hay que recordar, en una frase.' },
                when: { type: 'string', description: 'viernes, AAAA-MM-DD, o día del mes ("5" o "día 5").' },
                time: { type: 'string', description: 'HH:MM en hora de Chile. Si no viene, 09:00.' },
                repeat: { type: 'string', enum: ['once', 'monthly'], description: 'once (por defecto) o monthly.' },
                audience: { type: 'string', enum: ['self', 'overdue_residents'], description: 'self avisa a quien lo pidió. overdue_residents solo lo puede pedir la administración.' },
                whatsapp: { type: 'string', enum: ['true', 'false'], description: 'true solo si la persona pidió WhatsApp. Igual queda apagado hasta activar el gancho.' },
            },
            required: ['text', 'when'],
        },
    },
    {
        name: 'list_reminders',
        description: 'Lista los recordatorios activos de quien habla. Solo lectura.',
        input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
        name: 'cancel_reminder',
        description: 'Cancela un recordatorio activo. Requiere confirmación. Usa el id que devolvió list_reminders o create_reminder.',
        input_schema: {
            type: 'object' as const,
            properties: { reminder_id: { type: 'string' } },
            required: ['reminder_id'],
        },
    },
    {
        name: 'create_routine',
        description: 'Crea una rutina recurrente pedida por el administrador, por ejemplo "cada lunes mándame el resumen". Hora de Chile. El aviso queda en la app. Requiere confirmación. No manda correos sola.',
        input_schema: {
            type: 'object' as const,
            properties: { request: { type: 'string', description: 'La frase del administrador, con el día y, si la dijo, la hora.' } },
            required: ['request'],
        },
    },
    {
        name: 'coordinate_specialists',
        description: 'Reparte un pedido entre los Cocos de cobranza, legal y mantención. Audita el traspaso. No avisa, no paga y no contrata: cada escritura sigue pidiendo confirmación. SOLO administradores.',
        input_schema: {
            type: 'object' as const,
            properties: { request: { type: 'string', description: 'El pedido, diciendo si es cobranza, legal, mantención o más de uno.' } },
            required: ['request'],
        },
    },
    {
        name: 'list_routines',
        description: 'Lista las rutinas activas o pausadas de esta comunidad. Solo lectura.',
        input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
        name: 'pause_routine',
        description: 'Pausa una rutina para que deje de correr. Requiere confirmación.',
        input_schema: {
            type: 'object' as const,
            properties: { routine_id: { type: 'string' } },
            required: ['routine_id'],
        },
    },
    {
        name: 'delete_routine',
        description: 'Deja una rutina como borrada para que no vuelva a correr. Requiere confirmación. No borra el historial.',
        input_schema: {
            type: 'object' as const,
            properties: { routine_id: { type: 'string' } },
            required: ['routine_id'],
        },
    },
    {
        name: 'list_my_gmail',
        description: 'Lee los últimos correos de la bandeja del administrador que conectó su Google. Solo asunto, remitente y un extracto. No envía nada.',
        input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
        name: 'list_my_calendar',
        description: 'Lee los próximos eventos del calendario de Google del administrador conectado. No crea nada.',
        input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
        name: 'send_gmail',
        description: 'Prepara UN correo desde el Gmail del administrador. No sale hasta que confirme. No es un envío masivo.',
        input_schema: {
            type: 'object' as const,
            properties: {
                to: { type: 'string' },
                subject: { type: 'string' },
                body: { type: 'string' },
            },
            required: ['to', 'subject', 'body'],
        },
    },
    {
        name: 'create_calendar_event',
        description: 'Prepara un evento en el Google Calendar del administrador. No se crea hasta que confirme.',
        input_schema: {
            type: 'object' as const,
            properties: {
                title: { type: 'string' },
                start: { type: 'string', description: 'Inicio en ISO, por ejemplo 2026-11-10T15:00:00-03:00.' },
                end: { type: 'string', description: 'Término en ISO, posterior al inicio.' },
            },
            required: ['title', 'start', 'end'],
        },
    },
    {
        name: 'delegate_background_task',
        description: 'Deja una revisión larga en segundo plano y avisa cuando termina, en la app o también por WhatsApp. SOLO administradores. No cambia datos ni envía avisos a los vecinos. Requiere confirmación.',
        input_schema: {
            type: 'object' as const,
            properties: {
                goal: { type: 'string', description: 'Qué hay que revisar, en una frase.' },
                notify: { type: 'string', enum: ['app', 'whatsapp', 'both'], description: 'Dónde avisar al terminar. Por defecto, la app.' },
            },
            required: ['goal'],
        },
    },
    {
        name: 'draft_committee_report',
        description: 'Arma un informe HTML y PDF para el comité, con la línea gráfica de Convive y solo totales (asambleas y reservas). Sin nombres, montos ni datos de contacto. SOLO administradores. Requiere confirmación. El PDF caduca en 15 minutos.',
        input_schema: {
            type: 'object' as const,
            properties: { title: { type: 'string', description: 'Título opcional, sin nombres ni montos.' } },
            required: [],
        },
    },
    {
        name: 'resume_agent_task',
        description: 'Retoma una tarea larga del Agent Center (cobranza, mantención o un ciclo pausado). SOLO administradores. No aprueba sola una escritura pendiente: si falta confirmación, la tarea sigue esperando. Requiere confirmación.',
        input_schema: {
            type: 'object' as const,
            properties: { task_id: { type: 'string', description: 'Id de la tarea a retomar.' } },
            required: ['task_id'],
        },
    },
    {
        name: 'remember_preference',
        description: 'Guarda un hecho durable y útil que la persona te contó sobre sí misma o sus preferencias (ej: "es electrodependiente", "prefiere que le avisen por la mañana", "tiene un perro"), para recordarlo en futuras conversaciones. Úsala solo con datos que la persona compartió y que valga la pena recordar. No la uses para datos sensibles innecesarios ni para cada detalle trivial.',
        input_schema: {
            type: 'object' as const,
            properties: {
                fact: { type: 'string', description: 'El hecho a recordar, en una frase corta y en tercera persona.' },
            },
            required: ['fact'],
        },
    },
    // ── MÓDULO: GUÍA DE LA PLATAFORMA (todos los perfiles, solo lectura) ────
    {
        name: 'get_platform_guide',
        description: 'Guía de Convive Connect: para "¿cómo hago X?" o "¿dónde está X?" devuelve las pantallas que el rol de la persona puede ver, con ruta, qué permite hacer y pasos típicos. No consulta datos de nadie.',
        input_schema: {
            type: 'object' as const,
            properties: {
                query: { type: 'string', description: 'Lo que la persona quiere hacer o encontrar, en sus palabras (ej: "reservar el quincho").' },
            },
            required: ['query'],
        },
    },
    {
        name: 'search_public_web',
        description: 'Busca en la web pública. Úsala para encontrar la página oficial y luego léela con read_official_page. No inventes resultados si la búsqueda viene vacía.',
        input_schema: {
            type: 'object' as const,
            properties: { query: { type: 'string', description: 'Qué buscar, en pocas palabras.' } },
            required: ['query'],
        },
    },
    {
        name: 'read_official_page',
        description: 'Lee un fragmento de una página HTTPS oficial: MINVU, SEREMI (gob.cl), DOM municipal (mun.cl o minvu.cl) o BCN. No lee otros sitios. Cita el enlace y no concluyas si la lectura falla.',
        input_schema: {
            type: 'object' as const,
            properties: {
                url: { type: 'string', description: 'URL https de la página oficial.' },
                query: { type: 'string', description: 'Tema o artículo que hay que ubicar en la página.' },
            },
            required: ['url', 'query'],
        },
    },
    {
        name: 'list_community_agenda',
        description: 'Agenda dentro de Convive: próximas asambleas y reservas de espacios. No crea asambleas ni muestra nombres de vecinos. Para anotar un recordatorio usa create_reminder.',
        input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
        name: 'draft_outbound_email',
        description: 'Prepara UN correo a una persona que ya está en la comunidad. No se envía hasta que la administración confirme. No sirve para avisos masivos.',
        input_schema: {
            type: 'object' as const,
            properties: {
                to: { type: 'string', description: 'Un solo correo, de alguien de esta comunidad.' },
                subject: { type: 'string' },
                body: { type: 'string', description: 'Texto del correo, sin lista de destinatarios.' },
            },
            required: ['to', 'subject', 'body'],
        },
    },
    {
        name: 'consult_official_legal_source',
        description: 'Consulta en tiempo real el texto oficial de BCN para orientar sobre copropiedad, administración, vivienda, construcción, DOM y SEREMI. Solo lectura. Cita el enlace y distingue norma de interpretación.',
        input_schema: {
            type: 'object' as const,
            properties: {
                source: { type: 'string', enum: ['copropiedad', 'reglamento_copropiedad', 'administradores', 'lguc', 'oguc', 'datos_personales', 'privacidad_actual', 'procedimiento_administrativo', 'municipalidades', 'trabajo', 'mascotas'] },
                query: { type: 'string', description: 'Artículo o tema específico, por ejemplo artículo 6 gastos comunes o permiso de edificación.' },
            },
            required: ['source', 'query'],
        },
    },
    {
        name: 'research_chilean_law',
        description: 'Investigación jurídica ampliada en Norma, solo lectura. source: jurisprudencia (sentencias del Poder Judicial, p. ej. cobro de gastos comunes, ruidos, filtraciones), tribunal_constitucional, dictamenes_cgr (Contraloría), sanciones (de reguladores), normativa o corpus (buscar en todo el derecho vigente, incluidas circulares y decretos fuera de las 11 leyes de consult_official_legal_source), indicadores (UF/UTM/UTA/USD del día y conversión de multas a pesos). Cita rol, tribunal, fecha y enlace tal como vienen; si el resultado no trae el texto de la sentencia, dilo.',
        input_schema: {
            type: 'object' as const,
            properties: {
                source: { type: 'string', enum: NORMA_SOURCES },
                query: { type: 'string', description: 'Materia en lenguaje jurídico, como la escribiría una sentencia o dictamen. No requerido para indicadores.' },
                tribunal: { type: 'string', enum: [...NORMA_TRIBUNALS], description: 'Solo para jurisprudencia. Por defecto Corte Suprema.' },
                limit: { type: 'integer', description: 'Cuántos resultados (2 a 8).' },
                date: { type: 'string', description: 'Solo indicadores: AAAA-MM-DD. Por defecto hoy.' },
                convert: {
                    type: 'array',
                    description: 'Solo indicadores: montos a pasar a pesos, p. ej. una multa de 3 UTM.',
                    items: {
                        type: 'object',
                        properties: {
                            monto: { type: 'number' },
                            unidad: { type: 'string', enum: ['UF', 'UTM', 'UTA', 'USD'] },
                            etiqueta: { type: 'string' },
                        },
                        required: ['monto', 'unidad'],
                    },
                },
            },
            required: ['source'],
        },
    },
    {
        name: 'prepare_legal_draft',
        description: 'Prepara (SOLO administradores) la base de un BORRADOR de documento de la comunidad (reglamento de copropiedad, contrato de trabajo de conserje/mayordomo/aseo, contrato de administración o mantención, acta o convocatoria de asamblea). Consulta BCN para citar artículos reales, lista los datos faltantes y entrega la estructura. Solo lectura: no guarda ni envía nada.',
        input_schema: {
            type: 'object' as const,
            properties: {
                document_type: { type: 'string', enum: ['reglamento_copropiedad', 'contrato_trabajo_conserje', 'contrato_administracion', 'contrato_mantencion', 'acta_asamblea', 'convocatoria_asamblea', 'otro'] },
                known_data: { type: 'object', description: 'Solo datos que la persona entregó explícitamente (claves como nombre_condominio, direccion, trabajador, remuneracion, jornada...). Nunca inventes valores.' },
                extra_queries: { type: 'array', description: 'Hasta 3 consultas oficiales adicionales.', items: { type: 'object', properties: { source: { type: 'string' }, query: { type: 'string' } } } },
            },
            required: ['document_type'],
        },
    },
    {
        name: 'schedule_community_notice',
        description: 'Programa un aviso para toda la comunidad. Se publica en la app en la revisión diaria de las 09:00 (hora de Chile), cuando llega la fecha. SOLO administradores. Muestra el texto y pide confirmación. Se cancela con cancel_reminder.',
        input_schema: {
            type: 'object' as const,
            properties: {
                text: { type: 'string', description: 'Texto del aviso, sin montos ni apodos de cobranza.' },
                when: { type: 'string', description: 'viernes, AAAA-MM-DD o día del mes.' },
                time: { type: 'string', description: 'HH:MM en hora de Chile. Por defecto 09:00.' },
                repeat: { type: 'string', enum: ['once', 'monthly'] },
            },
            required: ['text', 'when'],
        },
    },
] as const;
