import 'server-only';

/** Definiciones de herramientas de CoCo: operations. Movidas tal cual desde tools.ts (21-11-2026). */

export const OPERATIONS_TOOL_DEFINITIONS = [
    // ── MÓDULO: RESIDENTE (Info & Finanzas) ─────────────────────────────────
    {
        name: 'get_resident_info',
        description: 'Obtiene nombre, depto, comunidad y datos del residente autenticado.',
        input_schema: {
            type: 'object' as const,
            properties: { unit_id: { type: 'string', description: 'ID de la unidad/depto' } },
            required: ['unit_id'],
        },
    },
    {
        name: 'get_water_consumption',
        description: 'Consulta el consumo de agua (m3) y el cobro correspondiente del residente para un período.',
        input_schema: {
            type: 'object' as const,
            properties: {
                unit_id: { type: 'string' },
                month: { type: 'string', description: 'Formato YYYY-MM. Si omites, usa el mes actual.' },
            },
            required: ['unit_id'],
        },
    },
    {
        name: 'update_my_name',
        description: 'Corrige el nombre con que aparece el usuario en la comunidad. Solo el nombre: el departamento lo asigna la administración, y el WhatsApp se activa en /privacy-center con el aviso a la vista. Requiere confirmación.',
        input_schema: {
            type: 'object' as const,
            properties: { full_name: { type: 'string' } },
            required: ['full_name'],
        },
    },
    // ── MÓDULO: RECLAMOS & MANTENCIÓN ───────────────────────────────────────
    {
        name: 'create_claim',
        description: 'Registra un reclamo o solicitud de mantención en nombre del residente.',
        input_schema: {
            type: 'object' as const,
            properties: {
                unit_id: { type: 'string' },
                category: {
                    type: 'string',
                    enum: ['MANTENCIÓN', 'RUIDO', 'ÁREA_COMÚN', 'ASCENSOR', 'SEGURIDAD', 'ESCALACIÓN_URGENTE', 'OTRO'],
                },
                description: { type: 'string', description: 'Descripción del problema.' },
                priority: { type: 'string', enum: ['BAJA', 'MEDIA', 'ALTA', 'URGENTE'] },
            },
            required: ['unit_id', 'category', 'description'],
        },
    },
    {
        name: 'get_claim_status',
        description: 'Consulta el estado actualizado de un reclamo previamente registrado.',
        input_schema: {
            type: 'object' as const,
            properties: { claim_id: { type: 'string' } },
            required: ['claim_id'],
        },
    },
    {
        name: 'list_my_claims',
        description: 'Lista todos los reclamos activos de una unidad, con su estado actual.',
        input_schema: {
            type: 'object' as const,
            properties: { unit_id: { type: 'string' } },
            required: ['unit_id'],
        },
    },
    // ── MÓDULO: CONSERJERÍA ──────────────────────────────────────────────────
    {
        name: 'register_visitor',
        description: 'Registra una visita usando solo el nombre y el departamento de destino. No solicita RUT.',
        input_schema: {
            type: 'object' as const,
            properties: {
                community_id: { type: 'string' },
                visitor_name: { type: 'string' },
                host_unit_id: { type: 'string', description: 'Depto o unidad donde va la visita.' },
                expected_at: { type: 'string', description: 'Hora esperada en formato HH:MM (opcional).' },
            },
            required: ['community_id', 'visitor_name', 'host_unit_id'],
        },
    },
    {
        name: 'register_package',
        description: 'Registra la llegada de un paquete o encomienda para un departamento.',
        input_schema: {
            type: 'object' as const,
            properties: {
                community_id: { type: 'string' },
                unit_id: { type: 'string', description: 'Depto destinatario del paquete.' },
                courier: { type: 'string', description: 'Nombre del courier (ej: Chilexpress, DHL).' },
                description: { type: 'string', description: 'Descripción breve del paquete.' },
            },
            required: ['community_id', 'unit_id'],
        },
    },
    {
        name: 'get_pending_packages',
        description: 'Lista los paquetes pendientes de retiro para un departamento.',
        input_schema: {
            type: 'object' as const,
            properties: { unit_id: { type: 'string' } },
            required: ['unit_id'],
        },
    },
    {
        name: 'update_unit_data',
        description: 'Modifica configuración de un departamento. SOLO administradores.',
        input_schema: {
            type: 'object' as const,
            properties: {
                unit_id: { type: 'string' },
                number: { type: 'string', description: 'Nuevo número o identificador del departamento' },
                floor: { type: 'string', description: 'Nuevo piso del departamento' },
            },
            required: ['unit_id'],
        },
    },
    {
        name: 'preview_resident_import',
        description: 'Lee la nómina de residentes de un archivo que la administración adjuntó al chat (Excel, CSV, PDF o Word; usa el document_id que viene con el archivo) y la deja en revisión: cuántos residentes, cuántos con correo, avisos y una muestra. No crea cuentas. SOLO administradores.',
        input_schema: { type: 'object' as const, properties: { document_id: { type: 'string', description: 'Opcional: sin él, el último archivo que la administración adjuntó al chat.' } }, required: [] },
    },
    {
        name: 'apply_resident_import',
        description: 'Carga los residentes de un lote revisado con preview_resident_import: une cada uno a su unidad y crea su acceso (si tiene correo). Requiere confirmación. SOLO administradores.',
        input_schema: {
            type: 'object' as const,
            properties: {
                batch_id: { type: 'string', description: 'Opcional: el id del lote.' },
                codigo: { type: 'string', description: 'El código corto que entregó preview_resident_import. Sin id ni código, solo funciona si hay un único lote en revisión.' },
                summary: { type: 'string', description: 'Resumen para la confirmación, por ejemplo "79 residentes, 64 con correo".' },
                fuente: { type: 'string', description: 'Solo si la administración indica de dónde salen los derechos (reglamento, escritura). Sin fuente quedan provisorios.' },
            },
            required: [],
        },
    },
    {
        name: 'set_unit_owner',
        description: 'Fija o cambia el dueño (propietario) de una unidad, o la deja sin dueño (clear: true). Si la persona no tiene cuenta en Convive, queda anotado su nombre (resident_name) como propietario y el resultado explica cómo sumarla. Distinto de assign_resident_unit, que asigna el departamento a un residente. Requiere confirmación. SOLO administradores.',
        input_schema: {
            type: 'object' as const,
            properties: {
                unit_number: { type: 'string' },
                tower: { type: 'string' },
                resident_name: { type: 'string' },
                resident_id: { type: 'string' },
                clear: { type: 'boolean' },
            },
            required: ['unit_number'],
        },
    },
    {
        name: 'register_incident',
        description: 'Registra una incidencia del edificio (portón trabado, ascensor detenido, filtración en áreas comunes…) y avisa a la administración. Urgencia: baja, media, alta o emergencia. Requiere confirmación. SOLO conserjería y administración.',
        input_schema: {
            type: 'object' as const,
            properties: {
                title: { type: 'string', description: 'Qué pasa, en una línea.' },
                description: { type: 'string' },
                urgency: { type: 'string', enum: ['baja', 'media', 'alta', 'emergencia'] },
            },
            required: ['title'],
        },
    },
    {
        name: 'record_water_reading',
        description: 'Registra la lectura del medidor de agua (m³) de un departamento para un mes (por defecto el actual). Si ya hay lectura de ese mes, no la reemplaza. Requiere confirmación. SOLO administradores.',
        input_schema: {
            type: 'object' as const,
            properties: {
                unit_number: { type: 'string' },
                tower: { type: 'string', description: 'Solo si hay varias torres con ese número.' },
                reading_value: { type: 'number', description: 'Lectura del medidor en m³.' },
                month: { type: 'string', description: 'AAAA-MM; por defecto el mes actual.' },
            },
            required: ['unit_number', 'reading_value'],
        },
    },
    {
        name: 'list_open_cases',
        description: 'Casos abiertos o en revisión de la comunidad (reclamos y solicitudes que registró CoCo): case_id, título, estado, urgencia y unidad. Úsalo para "¿qué casos hay pendientes?" y antes de update_case_status. SOLO administración y conserjería.',
        input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
        name: 'update_case_status',
        description: 'Cambia el estado de un caso: in_progress (en revisión), resolved, closed o cancelled. El residente recibe el aviso. Usa antes list_open_cases para el case_id. Requiere confirmación. SOLO administración y conserjería.',
        input_schema: {
            type: 'object' as const,
            properties: {
                case_id: { type: 'string' },
                status: { type: 'string', enum: ['open', 'in_progress', 'resolved', 'closed', 'cancelled'] },
                case_title: { type: 'string', description: 'Título, solo para mostrar en la confirmación.' },
            },
            required: ['case_id', 'status'],
        },
    },
    {
        name: 'list_pending_residents',
        description: 'Vecinos que se registraron solos (link de registro o invitación) y esperan que la administración confirme que viven en el edificio. Devuelve residente_id, nombre, departamento y fecha. Úsalo para "¿quién está pendiente?", "valida a los nuevos". SOLO administradores.',
        input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
        name: 'decide_pending_resident',
        description: 'Valida a un vecino pendiente (vive en el edificio: queda con acceso completo y ligado a su departamento) o lo quita (no vive aquí: pierde el acceso a la comunidad). Usa antes list_pending_residents para el residente_id; nunca lo inventes. Requiere confirmación. SOLO administradores.',
        input_schema: {
            type: 'object' as const,
            properties: {
                resident_id: { type: 'string', description: 'residente_id tal como lo devolvió list_pending_residents.' },
                approve: { type: 'boolean', description: 'true = validar; false = quitar porque no vive en el edificio.' },
                resident_name: { type: 'string', description: 'Nombre, solo para mostrar en la confirmación.' },
            },
            required: ['resident_id', 'approve'],
        },
    },
    {
        name: 'assign_resident_unit',
        description: 'Asigna o corrige el departamento de un residente de la comunidad. Búscalo por nombre (resident_name) o usa resident_id si ya lo tienes; si hay varios con ese nombre, la herramienta devuelve la lista para que elija. Requiere confirmación. SOLO administradores.',
        input_schema: {
            type: 'object' as const,
            properties: {
                resident_name: { type: 'string', description: 'Nombre o parte del nombre del residente.' },
                resident_id: { type: 'string', description: 'ID exacto, solo si una respuesta anterior lo devolvió.' },
                unit_number: { type: 'string', description: 'Departamento o unidad, ej. 504 o B-12.' },
            },
            required: ['unit_number'],
        },
    },
    // ── MÓDULO: IOT & PREDICTIVE MAINTENANCE ─────────────────────────────────
    {
        name: 'request_urgent_access_approval',
        description: 'Envía una notificación push/WhatsApp urgente al residente pidiendo aprobación explícita para abrir la cerradura inteligente (SmarLock) en caso de una emergencia (ej. filtración).',
        input_schema: {
            type: 'object' as const,
            properties: {
                unit_id: { type: 'string' },
                reason: { type: 'string', description: 'Por qué se necesita acceso urgente.' },
            },
            required: ['unit_id', 'reason'],
        },
    },
] as const;
