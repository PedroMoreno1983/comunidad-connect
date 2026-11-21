import 'server-only';

/** Definiciones de herramientas de CoCo: providers. Movidas tal cual desde tools.ts (21-11-2026). */

export const PROVIDERS_TOOL_DEFINITIONS = [
    {
        name: 'list_services',
        description: 'Busca proveedores del directorio de la comunidad por oficio o especialidad. Si la comunidad y el proveedor tienen ubicación, devuelve distancia aproximada; nunca presupongas cercanía si falta ubicación.',
        input_schema: {
            type: 'object' as const,
            properties: {
                category: { type: 'string', description: 'Categoría (ej: plumbing, electrical, locksmith, cleaning, general)' },
                query: { type: 'string', description: 'Oficio o especialidad en palabras de la persona (ej: reparación de ascensores).' },
            },
            required: [],
        },
    },
    {
        name: 'request_service',
        description: 'Pide un servicio a un proveedor del directorio (gasfiter, electricista, cerrajero, aseo…). Usa antes list_services para obtener provider_id. Requiere confirmación; el proveedor acepta o propone otro horario.',
        input_schema: {
            type: 'object' as const,
            properties: {
                provider_id: { type: 'string', description: 'ID tal como lo devolvió list_services.' },
                preferred_date: { type: 'string', description: 'Fecha AAAA-MM-DD.' },
                preferred_time: { type: 'string', description: 'Hora HH:MM.' },
                description: { type: 'string', description: 'Qué necesita, con el detalle que dio la persona.' },
            },
            required: ['provider_id', 'preferred_date', 'preferred_time', 'description'],
        },
    },
    {
        name: 'update_provider_profile',
        description: 'Edita el perfil de un maestro: el propio maestro el suyo, o la administración los de su comunidad. Campos: name, contactPhone, email, bio, responseTime, hourlyRate, yearsExperience, specialties, certifications, availability, serviceAddress. No verifica (eso es review_provider_document). Requiere confirmación.',
        input_schema: {
            type: 'object' as const,
            properties: {
                provider_id: { type: 'string', description: 'Opcional; sin él, el perfil de maestro del propio usuario.' },
                provider_name: { type: 'string', description: 'Opcional: la administración busca por nombre.' },
                fields: { type: 'object', description: 'Solo los campos a cambiar, con los nombres de la descripción.' },
            },
            required: ['fields'],
        },
    },
    {
        name: 'list_provider_photos',
        description: 'Fotos de trabajos del perfil de un maestro (photo_id, descripción, fecha). Para el propio maestro o la administración de su comunidad.',
        input_schema: { type: 'object' as const, properties: { provider_id: { type: 'string', description: 'Opcional; sin él, el perfil de maestro del propio usuario.' },
                provider_name: { type: 'string', description: 'Opcional: la administración busca por nombre.' }, }, required: [] },
    },
    {
        name: 'delete_provider_photo',
        description: 'Borra una foto de trabajos del perfil de un maestro. Usa el photo_id de list_provider_photos. Requiere confirmación.',
        input_schema: { type: 'object' as const, properties: { provider_id: { type: 'string', description: 'Opcional; sin él, el perfil de maestro del propio usuario.' },
                provider_name: { type: 'string', description: 'Opcional: la administración busca por nombre.' },
                photo_id: { type: 'string' } }, required: ['photo_id'] },
    },
    {
        name: 'list_service_requests',
        description: 'Solicitudes de servicio abiertas (pendientes, aceptadas o realizadas por confirmar): request_id, descripción, proveedor, estado, fecha y hora. La administración y conserjería ven las de la comunidad; un residente, las suyas. Úsalo antes de update_service_request_status.',
        input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
        name: 'update_service_request_status',
        description: 'Avanza una solicitud de servicio: accepted (aceptar), awaiting_confirmation (trabajo realizado), completed (el vecino confirma), cancelled, o reprograma con preferred_date y preferred_time. Las reglas de quién puede qué las aplica el sistema. Requiere confirmación.',
        input_schema: {
            type: 'object' as const,
            properties: {
                request_id: { type: 'string' },
                status: { type: 'string', enum: ['pending', 'accepted', 'awaiting_confirmation', 'completed', 'cancelled'] },
                preferred_date: { type: 'string', description: 'AAAA-MM-DD, solo al reprogramar.' },
                preferred_time: { type: 'string', description: 'HH:MM, solo al reprogramar.' },
                request_description: { type: 'string', description: 'Descripción, solo para la confirmación.' },
            },
            required: ['request_id', 'status'],
        },
    },
    {
        name: 'dispatch_provider',
        description: 'Identifica un proveedor externo disponible (ej. gasfíter de turno) y notifica al staff para confirmar el despacho de emergencia.',
        input_schema: {
            type: 'object' as const,
            properties: {
                category: { type: 'string', description: 'Categoría del técnico (ej: plumbing, electrical)' },
                urgency: { type: 'string', enum: ['ALTA', 'URGENTE'] },
                details: { type: 'string', description: 'Detalles del evento base enviados al proveedor.' },
            },
            required: ['category', 'urgency', 'details'],
        },
    },
    // ── MÓDULO: MAESTROS EXTERNOS (solo administración) ──────────────────────
    {
        name: 'register_external_provider',
        description: 'Registra en la comunidad a un maestro externo SIN cuenta en Convive (gasfíter, electricista, cerrajero, aseo). Solo administración. Queda sin verificar. Si el teléfono ya existe en la comunidad no lo duplica. Para que el maestro gestione su perfil y responda solicitudes, después usa send_provider_portal_link.',
        input_schema: {
            type: 'object' as const,
            properties: {
                name: { type: 'string', description: 'Nombre del maestro o empresa.' },
                category: { type: 'string', enum: ['plumbing', 'electrical', 'locksmith', 'cleaning', 'general'], description: 'plumbing = gasfitería; electrical = electricidad; locksmith = cerrajería; cleaning = aseo; general = otros.' },
                contact_phone: { type: 'string', description: 'Celular del maestro, por ejemplo +56 9 1234 5678.' },
                email: { type: 'string', description: 'Correo, opcional. Con correo le avisamos de solicitudes nuevas.' },
                specialties: { type: 'string', description: 'Especialidades separadas por coma, opcional (ej: calefont, cañerías).' },
                bio: { type: 'string', description: 'Descripción breve, opcional.' },
            },
            required: ['name', 'category', 'contact_phone'],
        },
    },
    {
        name: 'send_provider_portal_link',
        description: 'Genera el enlace personal con que un maestro externo (sin cuenta) edita su perfil y acepta, reagenda o cierra sus solicitudes. Solo administración. Vence en 90 días y revoca el enlace anterior del mismo maestro. Devuelve el enlace y un acceso a WhatsApp para enviárselo; CoCo no se lo manda directo.',
        input_schema: {
            type: 'object' as const,
            properties: {
                provider_id: { type: 'string', description: 'ID del proveedor si ya lo conoces (de list_services o register_external_provider).' },
                provider_name: { type: 'string', description: 'Nombre del maestro. Siempre: es lo que ve la administración al confirmar.' },
            },
            required: ['provider_name'],
        },
    },
    {
        name: 'rate_provider',
        description: 'Publica la reseña de la persona sobre un maestro de su comunidad o de la Red Convive: nota de 1 a 5 y comentario. Si ya lo había valorado, la actualiza. Se marca "servicio verificado" si tuvo un servicio completado con él. Pide la nota y el comentario si faltan; no los inventes.',
        input_schema: {
            type: 'object' as const,
            properties: {
                provider_name: { type: 'string', description: 'Nombre del maestro.' },
                provider_id: { type: 'string', description: 'ID del maestro si lo conoces.' },
                provider_trade: { type: 'string', enum: ['plumbing', 'electrical', 'locksmith', 'cleaning', 'general'], description: 'Solo para elegir entre maestros con el mismo nombre: provider_trade del candidato elegido.' },
                provider_scope: { type: 'string', enum: ['community', 'network'], description: 'Solo para elegir entre maestros con el mismo nombre: provider_scope del candidato elegido.' },
                rating: { type: 'string', enum: ['1', '2', '3', '4', '5'], description: 'Nota de 1 a 5.' },
                comment: { type: 'string', description: 'Comentario de la persona, con sus palabras.' },
            },
            required: ['provider_name', 'rating', 'comment'],
        },
    },
    {
        name: 'list_provider_documents',
        description: 'Solo administración: documentos (certificado de antecedentes, cédula) que subió un maestro de la comunidad, con su estado y el chequeo automático. No entrega el archivo: se ve en el perfil del maestro.',
        input_schema: {
            type: 'object' as const,
            properties: {
                provider_name: { type: 'string', description: 'Nombre del maestro.' },
                provider_id: { type: 'string', description: 'ID del maestro si lo conoces.' },
            },
            required: ['provider_name'],
        },
    },
    {
        name: 'review_provider_document',
        description: 'Solo administración: aprueba o rechaza un documento pendiente de un maestro de la comunidad (usa el document_id de list_provider_documents). Al aprobar, el perfil muestra antecedentes o identidad revisados. Para rechazar, pide el motivo: el maestro lo verá.',
        input_schema: {
            type: 'object' as const,
            properties: {
                provider_name: { type: 'string', description: 'Nombre del maestro (se muestra al confirmar).' },
                provider_id: { type: 'string' },
                document_id: { type: 'string', description: 'document_id de list_provider_documents.' },
                document_kind: { type: 'string', enum: ['background_certificate', 'identity'], description: 'kind_code del documento en list_provider_documents (se muestra al confirmar).' },
                uploaded_at: { type: 'string', description: 'uploaded del documento en list_provider_documents, tal cual (AAAA-MM-DD HH:MM, hora de Chile; se muestra al confirmar).' },
                decision: { type: 'string', enum: ['approve', 'reject'] },
                note: { type: 'string', description: 'Motivo, obligatorio si rechazas.' },
            },
            required: ['provider_name', 'document_id', 'document_kind', 'uploaded_at', 'decision'],
        },
    },
    {
        name: 'save_provider_attachment',
        description: 'Guarda en el perfil de un maestro la imagen que la persona adjuntó al chat (viene un adjunto_id en su mensaje): foto de perfil, foto de un trabajo, certificado de antecedentes o cédula. Lo puede hacer la administración (maestros de su comunidad) o el propio maestro. Los documentos quedan pendientes de revisión. Solo imágenes: un PDF se sube desde el perfil.',
        input_schema: {
            type: 'object' as const,
            properties: {
                attachment_id: { type: 'string', description: 'El adjunto_id que viene en el mensaje.' },
                provider_name: { type: 'string', description: 'Nombre del maestro (se muestra al confirmar).' },
                provider_id: { type: 'string' },
                provider_trade: { type: 'string', enum: ['plumbing', 'electrical', 'locksmith', 'cleaning', 'general'], description: 'Solo para elegir entre maestros con el mismo nombre: provider_trade del candidato elegido.' },
                provider_scope: { type: 'string', enum: ['community', 'network'], description: 'Solo para elegir entre maestros con el mismo nombre: provider_scope del candidato elegido.' },
                kind: { type: 'string', enum: ['profile_photo', 'work_photo', 'background_certificate', 'identity'] },
                caption: { type: 'string', description: 'Descripción de la foto de trabajo, opcional.' },
            },
            required: ['attachment_id', 'provider_name', 'kind'],
        },
    },
] as const;
