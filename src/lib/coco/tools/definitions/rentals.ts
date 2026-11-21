import 'server-only';

/** Definiciones de herramientas de CoCo: rentals. Movidas tal cual desde tools.ts (21-11-2026). */

export const RENTALS_TOOL_DEFINITIONS = [
    {
        name: 'register_my_vehicle',
        description: 'Registra o actualiza el vehículo del residente (patente y teléfono de contacto), necesario para reservar estacionamiento. Úsalo cuando book_parking falle por falta de vehículo o lo pidan. Pide la patente y el teléfono; no los inventes. Requiere confirmación.',
        input_schema: {
            type: 'object' as const,
            properties: {
                plate: { type: 'string', description: 'Patente, ej. ABCD12.' },
                phone: { type: 'string', description: 'Teléfono de contacto.' },
                vehicle_description: { type: 'string', description: 'Ej. "Toyota Yaris gris".' },
                full_name: { type: 'string', description: 'Nombre del conductor; por defecto el del perfil.' },
            },
            required: ['plate', 'phone'],
        },
    },
    // ── MÓDULO: RESERVAS DE ESPACIOS COMUNES ────────────────────────────────
    {
        name: 'check_availability',
        description: 'Consulta si un espacio común (piscina, quincho, gym, salón) está disponible en una fecha.',
        input_schema: {
            type: 'object' as const,
            properties: {
                space_name: { type: 'string', description: 'Nombre del espacio, e.g. "piscina", "quincho"' },
                date: { type: 'string', description: 'Fecha en formato YYYY-MM-DD' },
            },
            required: ['space_name', 'date'],
        },
    },
    {
        name: 'create_reservation',
        description: 'Reserva un espacio común para el residente en la fecha y horario indicados.',
        input_schema: {
            type: 'object' as const,
            properties: {
                unit_id: { type: 'string' },
                space_name: { type: 'string' },
                date: { type: 'string', description: 'YYYY-MM-DD' },
                start_time: { type: 'string', description: 'HH:MM' },
                end_time: { type: 'string', description: 'HH:MM' },
            },
            required: ['unit_id', 'space_name', 'date', 'start_time', 'end_time'],
        },
    },
    {
        name: 'cancel_reservation',
        description: 'Cancela una reserva de espacio común (quincho, piscina, sala) que hizo el propio residente, de hoy en adelante. Identifícala por espacio y fecha; si ese día tiene más de una, agrega start_time. No tiene costo. Requiere confirmación.',
        input_schema: {
            type: 'object' as const,
            properties: {
                space_name: { type: 'string', description: 'Nombre del espacio, como lo dice el residente.' },
                date: { type: 'string', description: 'YYYY-MM-DD' },
                start_time: { type: 'string', description: 'HH:MM. Solo si ese día tiene más de una reserva del mismo espacio.' },
            },
            required: ['space_name', 'date'],
        },
    },
    // ── MÓDULO: ESTACIONAMIENTOS ─────────────────────────────────────────────
    {
        name: 'get_my_parking',
        description: 'Consulta la situación de estacionamientos del residente: los espacios que arrienda como propietario y sus reservas vigentes como conductor. Úsalo cuando pregunten "¿tengo estacionamiento?", "¿cuándo vence mi reserva?", "¿cuál es mi código de acceso?" o similares.',
        input_schema: {
            type: 'object' as const,
            properties: {},
            required: [],
        },
    },
    {
        name: 'search_parking',
        description: 'Busca estacionamientos disponibles para arrendar en la comunidad, dentro de un rango de fechas y horas. Úsalo cuando pregunten "¿hay estacionamiento libre?", "necesito estacionamiento el viernes" o quieran conocer precios.',
        input_schema: {
            type: 'object' as const,
            properties: {
                starts_at: { type: 'string', description: 'Inicio en ISO 8601, e.g. 2026-09-14T09:00:00-03:00' },
                ends_at: { type: 'string', description: 'Fin en ISO 8601' },
                covered_only: { type: 'boolean', description: 'Solo espacios techados' },
                needs_ev_charger: { type: 'boolean', description: 'Solo espacios con cargador eléctrico' },
            },
            required: ['starts_at', 'ends_at'],
        },
    },
    {
        name: 'book_parking',
        description: 'Reserva un estacionamiento para el residente. Usa primero search_parking para obtener el spot_id y mostrarle las opciones con su precio; nunca inventes un spot_id. Requiere que tenga un vehículo registrado.',
        input_schema: {
            type: 'object' as const,
            properties: {
                spot_id: { type: 'string', description: 'ID del estacionamiento, tal como lo devolvió search_parking' },
                starts_at: { type: 'string', description: 'Inicio en ISO 8601, e.g. 2026-09-14T09:00:00-03:00' },
                ends_at: { type: 'string', description: 'Fin en ISO 8601' },
            },
            required: ['spot_id', 'starts_at', 'ends_at'],
        },
    },
    {
        name: 'cancel_parking_booking',
        description: 'Cancela una reserva de estacionamiento que hizo el residente como conductor. Usa antes get_my_parking para obtener el reserva_id; nunca lo inventes. Sin costo si se cancela con la anticipación que fija la comunidad (2 h por defecto); después, si cancela el conductor, el cobro se mantiene: díselo antes de confirmar. Requiere confirmación.',
        input_schema: {
            type: 'object' as const,
            properties: {
                booking_id: { type: 'string', description: 'reserva_id tal como lo devolvió get_my_parking.' },
                reason: { type: 'string', description: 'Motivo, si lo dio.' },
            },
            required: ['booking_id'],
        },
    },
    // ── MÓDULO: BODEGAS ──────────────────────────────────────────────────────
    {
        name: 'get_my_storage',
        description: 'Bodegas del residente: las que arrienda a un vecino (fechas y cobro mensual), las que publicó y a quién están arrendadas. Úsalo para "¿hasta cuándo tengo la bodega?" o "¿mi bodega está arrendada?".',
        input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
        name: 'search_storage',
        description: 'Busca bodegas de vecinos libres para arrendar por meses en la comunidad. Se arriendan desde 1 hasta 24 meses y cada mes se carga a los gastos comunes. Úsalo cuando pidan una bodega o pregunten precios.',
        input_schema: {
            type: 'object' as const,
            properties: {
                starts_on: { type: 'string', description: 'Fecha de inicio AAAA-MM-DD. Si no la dicen, el primer día del mes siguiente.' },
                months: { type: 'integer', description: 'Cuántos meses (1 a 24).' },
            },
            required: ['starts_on', 'months'],
        },
    },
    {
        name: 'rent_storage',
        description: 'Arrienda una bodega para el residente. Usa antes search_storage para obtener el storage_id y mostrarle precio mensual y total; nunca inventes un storage_id. Genera un cargo mensual en sus gastos comunes. Requiere confirmación.',
        input_schema: {
            type: 'object' as const,
            properties: {
                storage_id: { type: 'string', description: 'ID tal como lo devolvió search_storage.' },
                starts_on: { type: 'string', description: 'Fecha de inicio AAAA-MM-DD.' },
                months: { type: 'integer', description: 'Cuántos meses (1 a 24).' },
            },
            required: ['storage_id', 'starts_on', 'months'],
        },
    },
    {
        name: 'cancel_storage_rental',
        description: 'Termina un arriendo de bodega del residente. Usa antes get_my_storage para obtener el arriendo_id; nunca lo inventes. Se anulan los cobros de los meses que aún no empiezan; el mes en curso y lo ya pagado se mantienen (díselo antes de confirmar). Requiere confirmación.',
        input_schema: {
            type: 'object' as const,
            properties: {
                rental_id: { type: 'string', description: 'arriendo_id tal como lo devolvió get_my_storage.' },
                reason: { type: 'string', description: 'Motivo, si lo dio.' },
            },
            required: ['rental_id'],
        },
    },
    {
        name: 'extend_parking_booking',
        description: 'Extiende una reserva de estacionamiento del residente (conductor) entre 1 y 720 minutos, si el dueño la tiene disponible hasta esa hora y nadie más la reservó. Cambia el cobro: dilo antes de confirmar. Usa el reserva_id de get_my_parking. Requiere confirmación.',
        input_schema: {
            type: 'object' as const,
            properties: {
                booking_id: { type: 'string' },
                additional_minutes: { type: 'integer', description: 'Minutos extra (60 = una hora).' },
            },
            required: ['booking_id', 'additional_minutes'],
        },
    },
    {
        name: 'rate_parking_booking',
        description: 'Califica de 1 a 5 estrellas una reserva de estacionamiento ya terminada (solo el conductor). Sin booking_id, la última que terminó. Requiere confirmación.',
        input_schema: {
            type: 'object' as const,
            properties: {
                rating: { type: 'integer', description: '1 a 5 estrellas.' },
                comment: { type: 'string' },
                booking_id: { type: 'string', description: 'Opcional; por defecto la última reserva terminada.' },
            },
            required: ['rating'],
        },
    },
    {
        name: 'set_my_spot_availability',
        description: 'Fija los horarios en que el estacionamiento propio se puede reservar. Reemplaza todos los horarios anteriores. Días: 0 = domingo … 6 = sábado. Usa el listing_id de list_my_listings. Requiere confirmación.',
        input_schema: {
            type: 'object' as const,
            properties: {
                listing_id: { type: 'string' },
                windows: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: { weekday: { type: 'integer' }, start_time: { type: 'string', description: 'HH:MM' }, end_time: { type: 'string', description: 'HH:MM' } },
                        required: ['weekday', 'start_time', 'end_time'],
                    },
                },
                listing_name: { type: 'string', description: 'Solo para la confirmación.' },
            },
            required: ['listing_id', 'windows'],
        },
    },
    {
        name: 'list_parking_access_requests',
        description: 'Solicitudes pendientes de conductores externos (de otros condominios) para usar los estacionamientos de la comunidad: access_id, nombre, patente y mensaje. SOLO administradores.',
        input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
        name: 'review_parking_access',
        description: 'Aprueba o rechaza a un conductor externo. Rechazar cancela sus reservas futuras en la comunidad. Usa el access_id de list_parking_access_requests. Requiere confirmación. SOLO administradores.',
        input_schema: {
            type: 'object' as const,
            properties: { access_id: { type: 'string' }, approve: { type: 'boolean' }, reason: { type: 'string' }, driver_name: { type: 'string', description: 'Solo para la confirmación.' } },
            required: ['access_id', 'approve'],
        },
    },
    {
        name: 'list_my_listings',
        description: 'Estacionamientos y bodegas que el residente publicó: listing_id, tipo, nombre, estado (pendiente, publicada, pausada, rechazada con motivo) y precios. Úsalo antes de editarlas, pausarlas o retirarlas.',
        input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
        name: 'update_my_listing',
        description: 'Cambia el precio o la descripción de un estacionamiento o bodega propio. Las reservas y arriendos ya confirmados mantienen su precio. Requiere confirmación.',
        input_schema: {
            type: 'object' as const,
            properties: {
                kind: { type: 'string', enum: ['parking', 'storage'], description: 'parking = estacionamiento, storage = bodega.' },
                listing_id: { type: 'string', description: 'Tal como lo devolvió list_my_listings.' },
                hourly_rate: { type: 'integer', description: 'Solo estacionamientos.' },
                daily_rate: { type: 'integer', description: 'Solo estacionamientos.' },
                monthly_rate: { type: 'integer' },
                description: { type: 'string' },
                listing_name: { type: 'string', description: 'Nombre, solo para la confirmación.' },
            },
            required: ['kind', 'listing_id'],
        },
    },
    {
        name: 'set_my_listing_status',
        description: 'Pausa (deja de recibir reservas), retoma (si la administración la aprobó antes) o reenvía a revisión (si fue rechazada) un estacionamiento o bodega propio. Requiere confirmación.',
        input_schema: {
            type: 'object' as const,
            properties: {
                kind: { type: 'string', enum: ['parking', 'storage'], description: 'parking = estacionamiento, storage = bodega.' },
                listing_id: { type: 'string', description: 'Tal como lo devolvió list_my_listings.' },
                action: { type: 'string', enum: ['pause', 'resume', 'resubmit'] },
                listing_name: { type: 'string', description: 'Nombre, solo para la confirmación.' },
            },
            required: ['kind', 'listing_id', 'action'],
        },
    },
    {
        name: 'remove_my_listing',
        description: 'Retira (borra) un estacionamiento o bodega propio. Solo si nunca tuvo reservas ni arriendos; si tiene historial, ofrece pausarlo. Requiere confirmación.',
        input_schema: {
            type: 'object' as const,
            properties: {
                kind: { type: 'string', enum: ['parking', 'storage'], description: 'parking = estacionamiento, storage = bodega.' },
                listing_id: { type: 'string', description: 'Tal como lo devolvió list_my_listings.' },
                listing_name: { type: 'string', description: 'Nombre, solo para la confirmación.' },
            },
            required: ['kind', 'listing_id'],
        },
    },
    {
        name: 'publish_my_parking_spot',
        description: 'Publica el estacionamiento PROPIO del residente para arrendarlo a vecinos por hora, día o mes. Queda pendiente hasta que la administración lo apruebe. Pide lo que falte (identificación y al menos un precio); no inventes precios. Úsalo para "quiero arrendar mi estacionamiento". Requiere confirmación.',
        input_schema: {
            type: 'object' as const,
            properties: {
                label: { type: 'string', description: 'Cómo se identifica (ej. "E-23").' },
                hourly_rate: { type: 'integer', description: 'Precio por hora en pesos.' },
                daily_rate: { type: 'integer', description: 'Precio por día en pesos.' },
                monthly_rate: { type: 'integer', description: 'Precio por mes en pesos.' },
                floor_level: { type: 'string', enum: ['S1', 'S2', 'S3', 'PB', 'EXT'], description: 'Subterráneo 1-3, primer piso (PB) o exterior.' },
                is_covered: { type: 'boolean' },
                has_ev_charger: { type: 'boolean' },
                vehicle_size: { type: 'string', enum: ['moto', 'auto', 'suv', 'camioneta'] },
                min_hours: { type: 'integer', description: 'Mínimo de horas por reserva (1 a 24).' },
                description: { type: 'string' },
            },
            required: ['label'],
        },
    },
    {
        name: 'publish_my_storage_unit',
        description: 'Publica la bodega PROPIA del residente para arrendarla a vecinos por meses; el arriendo se cobra en los gastos comunes del arrendatario. Queda pendiente hasta que la administración la apruebe. Pide la identificación y el precio mensual; no los inventes. Requiere confirmación.',
        input_schema: {
            type: 'object' as const,
            properties: {
                label: { type: 'string', description: 'Cómo se identifica (ej. "Bodega 12").' },
                monthly_rate: { type: 'integer', description: 'Precio mensual en pesos.' },
                min_months: { type: 'integer', description: 'Mínimo de meses (1 a 24).' },
                floor_level: { type: 'string', description: 'Piso o nivel, ej. "-1".' },
                area_m2: { type: 'number', description: 'Superficie en m².' },
                description: { type: 'string' },
            },
            required: ['label', 'monthly_rate'],
        },
    },
    {
        name: 'create_amenity',
        description: 'Crea un espacio común reservable (quincho, sala multiuso, gimnasio…): nombre, capacidad, tarifa por hora (0 = sin costo) y descripción. Requiere confirmación. SOLO administradores.',
        input_schema: {
            type: 'object' as const,
            properties: {
                name: { type: 'string' },
                description: { type: 'string' },
                max_capacity: { type: 'integer' },
                hourly_rate: { type: 'integer' },
                icon: { type: 'string', enum: ['Calendar', 'Flame', 'Waves', 'PartyPopper', 'Dumbbell', 'Monitor'] },
            },
            required: ['name'],
        },
    },
    {
        name: 'list_pending_listings',
        description: 'Estacionamientos y bodegas que publicaron vecinos y esperan aprobación: listing_id, tipo, nombre, dueño y precio. SOLO administradores.',
        input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
        name: 'review_listing',
        description: 'Aprueba (aparece para los vecinos) o rechaza (con motivo, que el vecino verá) un estacionamiento o bodega publicado. Usa antes list_pending_listings. Requiere confirmación. SOLO administradores.',
        input_schema: {
            type: 'object' as const,
            properties: {
                kind: { type: 'string', enum: ['parking', 'storage'] },
                listing_id: { type: 'string' },
                approve: { type: 'boolean' },
                reason: { type: 'string', description: 'Obligatorio al rechazar.' },
                listing_name: { type: 'string', description: 'Nombre, solo para mostrar en la confirmación.' },
            },
            required: ['kind', 'listing_id', 'approve'],
        },
    },
    {
        name: 'list_pending_bookings',
        description: 'Lista reservas de espacios comunes que están pendientes o confirmadas, para que la administración apruebe o anule. SOLO administradores. Solo lectura.',
        input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
        name: 'decide_booking',
        description: 'Aprueba una reserva pendiente o la anula (también una ya confirmada: es el deshacer). SOLO administradores. Requiere confirmación.',
        input_schema: {
            type: 'object' as const,
            properties: {
                booking_id: { type: 'string' },
                decision: { type: 'string', enum: ['approve', 'reject'] },
            },
            required: ['booking_id', 'decision'],
        },
    },
] as const;
