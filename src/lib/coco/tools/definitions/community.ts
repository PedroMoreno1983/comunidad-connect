import 'server-only';

/** Definiciones de herramientas de CoCo: community. Movidas tal cual desde tools.ts (21-11-2026). */

export const COMMUNITY_TOOL_DEFINITIONS = [
    {
        name: 'search_marketplace',
        description: 'Busca productos o artículos a la venta en el Marketplace de la comunidad.',
        input_schema: {
            type: 'object' as const,
            properties: {
                query: { type: 'string', description: 'Término de búsqueda (ej: bicicleta, silla, iphone)' },
            },
            required: ['query'],
        },
    },
    {
        name: 'publish_marketplace_item',
        description: 'Publica un artículo del usuario en el Marketplace de la comunidad (venta o permuta), sin fotos. Requiere confirmación. Las fotos se agregan después en Marketplace.',
        input_schema: {
            type: 'object' as const,
            properties: {
                title: { type: 'string', description: 'Qué vende, en pocas palabras.' },
                description: { type: 'string', description: 'Estado, medidas, detalles.' },
                price: { type: 'integer', description: 'Precio en pesos. 0 solo si es solo permuta.' },
                category: { type: 'string', enum: ['electronics', 'furniture', 'clothing', 'other'] },
                allow_swap: { type: 'boolean', description: 'Acepta permuta.' },
                swap_details: { type: 'string', description: 'Qué aceptaría a cambio.' },
            },
            required: ['title', 'price'],
        },
    },
    {
        name: 'update_marketplace_item',
        description: 'Cambia el estado de un artículo que el propio usuario publicó en el Marketplace: vendido, reservado, disponible otra vez u oculto (lo retira). Úsalo para "ya vendí la bicicleta", "saca mi publicación", "la silla está reservada". Busca por título entre SUS publicaciones; si hay varias parecidas, devuelve la lista para que elija. Requiere confirmación.',
        input_schema: {
            type: 'object' as const,
            properties: {
                title: { type: 'string', description: 'Título o parte del título de su publicación.' },
                item_id: { type: 'string', description: 'ID exacto, solo si una respuesta anterior de esta herramienta lo devolvió.' },
                status: { type: 'string', enum: ['sold', 'reserved', 'available', 'hidden'], description: 'sold = vendido, reserved = reservado, available = disponible de nuevo, hidden = retirar la publicación.' },
            },
            required: ['status'],
        },
    },
    {
        name: 'list_my_marketplace_conversations',
        description: 'Conversaciones del residente en el Marketplace (como comprador o vendedor): artículo, con quién, mensajes sin leer y los últimos mensajes. Úsalo para "¿me respondieron?", "¿tengo mensajes?" y antes de reply_marketplace_conversation.',
        input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
        name: 'message_marketplace_seller',
        description: 'Le escribe al vendedor de un artículo del Marketplace de la comunidad, en nombre del residente. Identifica el artículo por título (o item_id de search_marketplace). Redacta el mensaje con lo que el residente pidió y muéstraselo antes. Requiere confirmación.',
        input_schema: {
            type: 'object' as const,
            properties: {
                item_title: { type: 'string', description: 'Título o parte del título del artículo.' },
                item_id: { type: 'string', description: 'ID exacto, si search_marketplace lo devolvió.' },
                message: { type: 'string', description: 'El mensaje para el vendedor (máx. 2.000 caracteres).' },
            },
            required: ['message'],
        },
    },
    {
        name: 'reply_marketplace_conversation',
        description: 'Responde en una conversación del Marketplace del residente. Usa antes list_my_marketplace_conversations para el conversation_id; nunca lo inventes. Requiere confirmación.',
        input_schema: {
            type: 'object' as const,
            properties: {
                conversation_id: { type: 'string' },
                message: { type: 'string', description: 'Respuesta (máx. 2.000 caracteres).' },
            },
            required: ['conversation_id', 'message'],
        },
    },
    // ── MÓDULO: CONVENIOS COMUNITARIOS ───────────────────────────────────────
    {
        name: 'list_community_deals',
        description: 'Convenios de la comunidad: ferias o proveedores que venden en el edificio a cambio del espacio, servicios contratados para todo el edificio (internet, seguros, fumigación) e ingresos por espacios comunes. Devuelve estado, interesados y ahorro estimado.',
        input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
        name: 'suggest_community_deals',
        description: 'Detecta oportunidades de convenio a partir de reclamos y compras comunitarias de los últimos 90 días (por ejemplo, muchos vecinos con problemas de internet o comprando agua en bidón). Son señales, no demanda confirmada: preséntalas como ideas para proponer.',
        input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
        name: 'propose_community_deal',
        description: 'Propone un convenio comunitario. Si lo pide un residente queda para revisión de la administración; si lo pide la administración queda abierto a interesados. Si el convenio usa un espacio común o compromete a la comunidad en un contrato, advierte que puede requerir acuerdo de asamblea (Ley 21.442) y verifica el texto con consult_official_legal_source antes de afirmarlo.',
        input_schema: {
            type: 'object' as const,
            properties: {
                title: { type: 'string', description: 'Idea en pocas palabras, por ejemplo Feria los martes en el hall.' },
                kind: { type: 'string', enum: ['vendor_visit', 'bulk_service', 'space_income'], description: 'vendor_visit: feria o proveedor en el edificio. bulk_service: servicio para todo el edificio. space_income: arrendar un espacio común a un tercero.' },
                description: { type: 'string', description: 'Qué se ofrece, qué se pide a cambio, qué días.' },
            },
            required: ['title', 'kind'],
        },
    },
    {
        name: 'join_community_deal',
        description: 'Suma (o saca) al usuario de los interesados de un convenio abierto. Usa list_community_deals para obtener el deal_id.',
        input_schema: {
            type: 'object' as const,
            properties: {
                deal_id: { type: 'string' },
                interested: { type: 'boolean', description: 'true para sumarse, false para salirse.' },
                note: { type: 'string', description: 'Opcional, por ejemplo qué proveedor tiene hoy.' },
            },
            required: ['deal_id', 'interested'],
        },
    },
    {
        name: 'add_community_deal_quote',
        description: 'SOLO administradores. Registra la cotización de un proveedor para un convenio que suma interesados o está cotizando. Elegir la cotización y activar el convenio se hace desde la app.',
        input_schema: {
            type: 'object' as const,
            properties: {
                deal_id: { type: 'string' },
                provider_name: { type: 'string' },
                price: { type: 'integer', description: 'Precio en pesos, o porcentaje si price_unit es discount_percent.' },
                price_unit: { type: 'string', enum: ['unit_month', 'unit_once', 'community_month', 'discount_percent'] },
                offer: { type: 'string', description: 'Qué ofrece y condiciones.' },
                contact: { type: 'string', description: 'Contacto del proveedor (solo lo ve la administración).' },
            },
            required: ['deal_id', 'provider_name'],
        },
    },
    // ── MÓDULO: COMUNICACIÓN ─────────────────────────────────────────────────
    {
        name: 'create_circular',
        description: 'Redacta y publica una circular o aviso oficial para la comunidad. SOLO para administradores.',
        input_schema: {
            type: 'object' as const,
            properties: {
                community_id: { type: 'string' },
                title: { type: 'string' },
                body: { type: 'string' },
            },
            required: ['community_id', 'title', 'body'],
        },
    },
    {
        name: 'create_social_post',
        description: 'Publica un mensaje o anuncio en el muro social de la comunidad en nombre del residente.',
        input_schema: {
            type: 'object' as const,
            properties: {
                community_id: { type: 'string' },
                content: { type: 'string', description: 'Texto del post.' },
                author_unit_id: { type: 'string' },
            },
            required: ['community_id', 'content', 'author_unit_id'],
        },
    },
    // ── MÓDULO: VOTACIONES ───────────────────────────────────────────────────
    {
        name: 'list_active_polls',
        description: 'Lista las votaciones o encuestas activas en la comunidad.',
        input_schema: {
            type: 'object' as const,
            properties: { community_id: { type: 'string' } },
            required: ['community_id'],
        },
    },
    {
        name: 'vote_in_poll',
        description: 'Emite el voto del residente en una votación activa.',
        input_schema: {
            type: 'object' as const,
            properties: {
                poll_id: { type: 'string' },
                option_id: { type: 'string', description: 'ID de la opción a votar.' },
                unit_id: { type: 'string' },
            },
            required: ['poll_id', 'option_id', 'unit_id'],
        },
    },
    {
        name: 'create_poll',
        description: 'Crea una nueva votación o encuesta para la comunidad. SOLO administradores.',
        input_schema: {
            type: 'object' as const,
            properties: {
                community_id: { type: 'string' },
                title: { type: 'string' },
                description: { type: 'string' },
                options: {
                    type: 'string',
                    description: 'Opciones separadas por coma. Ej: "Sí,No,Abstención"',
                },
                closes_at: { type: 'string', description: 'Fecha/hora de cierre en formato ISO 8601.' },
            },
            required: ['community_id', 'title', 'options'],
        },
    },
    {
        name: 'delete_marketplace_item',
        description: 'Borra (definitivamente) una publicación del Marketplace: el vendedor las suyas, la administración cualquiera de la comunidad (moderación). Si solo quiere retirarla, usa update_marketplace_item con hidden. Requiere confirmación.',
        input_schema: { type: 'object' as const, properties: { title: { type: 'string' }, item_id: { type: 'string' } }, required: [] },
    },
    {
        name: 'update_community_deal',
        description: 'Administra un convenio comunitario: estado (gauging, quoting, active, closed, rejected), precio del convenio y de referencia, cotización elegida, condiciones, horario y fechas. Usa deal_id y quote_id de list_community_deals. Requiere confirmación. SOLO administradores.',
        input_schema: {
            type: 'object' as const,
            properties: {
                deal_id: { type: 'string' },
                status: { type: 'string', enum: ['proposed', 'gauging', 'quoting', 'active', 'closed', 'rejected'] },
                deal_price: { type: 'integer' },
                reference_price: { type: 'integer' },
                selected_quote_id: { type: 'string' },
                terms: { type: 'string' },
                schedule: { type: 'string' },
                starts_on: { type: 'string' },
                ends_on: { type: 'string' },
                review_note: { type: 'string' },
                deal_title: { type: 'string', description: 'Solo para la confirmación.' },
            },
            required: ['deal_id'],
        },
    },
    {
        name: 'delete_deal_quote',
        description: 'Borra una cotización de un convenio comunitario. Usa el quote_id de list_community_deals. Requiere confirmación. SOLO administradores.',
        input_schema: { type: 'object' as const, properties: { quote_id: { type: 'string' }, quote_label: { type: 'string', description: 'Solo para la confirmación.' } }, required: ['quote_id'] },
    },
    {
        name: 'list_my_mediations',
        description: 'Mediaciones con vecinos que pidió el usuario (o todas, si es administración): mediation_id, con qué depto, petición y estado.',
        input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
        name: 'update_mediation_status',
        description: 'Avanza una mediación: sent (ya envié el mensaje), agreement (llegamos a acuerdo) o escalated (pedir ayuda a la administración). La avanza quien la pidió o la administración. Requiere confirmación.',
        input_schema: {
            type: 'object' as const,
            properties: { mediation_id: { type: 'string' }, status: { type: 'string', enum: ['sent', 'agreement', 'escalated'] } },
            required: ['mediation_id', 'status'],
        },
    },
    {
        name: 'list_community_initiatives',
        description: 'Iniciativas de convivencia de la comunidad: banco de tiempo, compras colectivas y proyectos (aprobadas, más las propias pendientes), con initiative_id y estado; y las solicitudes de participación que el usuario debe resolver como coordinador (o todas, si es administración).',
        input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
        name: 'propose_initiative',
        description: 'Propone una iniciativa de convivencia a nombre del usuario: ofrecer algo en el banco de tiempo (title = qué ofrece), una compra colectiva (title, supplier, deadline AAAA-MM-DD, precios, mínimo de participantes) o un proyecto comunitario (title, description, area). Queda pendiente hasta que la administración la valida. Pide lo que falte. Requiere confirmación.',
        input_schema: {
            type: 'object' as const,
            properties: {
                type: { type: 'string', enum: ['time_bank', 'collective_purchase', 'community_project'], description: 'time_bank = banco de tiempo, collective_purchase = compra colectiva, community_project = proyecto comunitario.' },
                title: { type: 'string' },
                description: { type: 'string' },
                availability: { type: 'string', description: 'Banco de tiempo: cuándo puede.' },
                category: { type: 'string', description: 'Banco de tiempo: tools, care, digital, home, learning, other. Compra: water, gas, cleaning, food, eco, other.' },
                credits: { type: 'integer', description: 'Banco de tiempo: horas que vale.' },
                supplier: { type: 'string' },
                deadline: { type: 'string' },
                unit_price: { type: 'integer' },
                retail_price: { type: 'integer' },
                minimum_participants: { type: 'integer' },
                area: { type: 'string', enum: ['huerto', 'reciclaje', 'cuidados', 'mascotas', 'cultura', 'otro'] },
                impact: { type: 'string' },
                needed: { type: 'string' },
            },
            required: ['type', 'title'],
        },
    },
    {
        name: 'join_initiative',
        description: 'Pide sumarse a una iniciativa aprobada (o pedir un ofrecimiento del banco de tiempo). Usa antes list_community_initiatives para el initiative_id. El coordinador la acepta o rechaza. Requiere confirmación.',
        input_schema: {
            type: 'object' as const,
            properties: {
                type: { type: 'string', enum: ['time_bank', 'collective_purchase', 'community_project'], description: 'time_bank = banco de tiempo, collective_purchase = compra colectiva, community_project = proyecto comunitario.' },
                initiative_id: { type: 'string' },
                message: { type: 'string', description: 'Mensaje opcional para el coordinador.' },
                initiative_title: { type: 'string', description: 'Título, solo para la confirmación.' },
            },
            required: ['type', 'initiative_id'],
        },
    },
    {
        name: 'resolve_participation',
        description: 'Acepta o rechaza una solicitud para sumarse a una iniciativa que el usuario coordina (la administración puede resolver cualquiera). Usa el request_id de list_community_initiatives. Requiere confirmación.',
        input_schema: {
            type: 'object' as const,
            properties: { request_id: { type: 'string' }, accept: { type: 'boolean' } },
            required: ['request_id', 'accept'],
        },
    },
    {
        name: 'review_initiative',
        description: 'Valida una iniciativa propuesta: approved (con coordinador; por defecto quien la propuso), changes_requested o rejected (con motivo, que el vecino verá). Requiere confirmación. SOLO administradores.',
        input_schema: {
            type: 'object' as const,
            properties: {
                type: { type: 'string', enum: ['time_bank', 'collective_purchase', 'community_project'], description: 'time_bank = banco de tiempo, collective_purchase = compra colectiva, community_project = proyecto comunitario.' },
                initiative_id: { type: 'string' },
                decision: { type: 'string', enum: ['approved', 'changes_requested', 'rejected'] },
                coordinator_id: { type: 'string', description: 'Opcional: otro vecino como coordinador.' },
                note: { type: 'string' },
                initiative_title: { type: 'string', description: 'Título, solo para la confirmación.' },
            },
            required: ['type', 'initiative_id', 'decision'],
        },
    },
    {
        name: 'request_mediation',
        description: 'Prepara una mediación con un vecino (comunicación no violenta): a qué depto, qué observa (hechos), cómo se siente, qué necesita y qué le pide. Genera el borrador del mensaje; el residente lo revisa y envía desde Convivencia. Pide lo que falte. Requiere confirmación.',
        input_schema: {
            type: 'object' as const,
            properties: {
                target_unit: { type: 'string' },
                observation: { type: 'string' },
                feeling: { type: 'string' },
                need: { type: 'string' },
                request: { type: 'string' },
            },
            required: ['target_unit', 'observation', 'feeling', 'need', 'request'],
        },
    },
    {
        name: 'get_neighbor_invite_link',
        description: 'Entrega el enlace personal de la persona para invitar a sus vecinos a Convive, con el mensaje listo para WhatsApp. Úsalo cuando quiera invitar o sumar vecinos. Quien entra por el enlace queda como vecino por validar.',
        input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
        name: 'set_community_cover_photo',
        description: 'Pone como foto de portada del condominio (el fondo del inicio que ven la administración y todos los residentes) la imagen que la administración adjuntó al chat (viene un adjunto_id en su mensaje). Solo administración. Reemplaza la portada actual. Si no dice para qué es la imagen, pregunta.',
        input_schema: {
            type: 'object' as const,
            properties: {
                attachment_id: { type: 'string', description: 'El adjunto_id que viene en el mensaje.' },
            },
            required: ['attachment_id'],
        },
    },
] as const;
