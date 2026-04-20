/**
 * tools.ts — CoCo IA Súper Agente
 * 17 herramientas divididas por módulo y perfil.
 * El executor llama directamente a Supabase (ComunidadConnect DB).
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ── Definiciones de herramientas para Anthropic ──────────────────────────────

export const TOOL_DEFINITIONS = [

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
        name: 'get_payment_status',
        description: 'Consulta los gastos comunes del residente: monto, estado pagado/pendiente y fecha de vencimiento.',
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
        name: 'list_services',
        description: 'Consulta el directorio de servicios de mantenimiento (gasfíter, eléctrico, limpieza, etc.).',
        input_schema: {
            type: 'object' as const,
            properties: {
                category: { type: 'string', description: 'Categoría (ej: plumbing, electrical, locksmith, cleaning, general)' },
            },
            required: [],
        },
    },
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
                audience: {
                    type: 'string',
                    enum: ['TODOS', 'PROPIETARIOS', 'ARRENDATARIOS'],
                },
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

    // ── MÓDULO: CONSERJERÍA ──────────────────────────────────────────────────
    {
        name: 'register_visitor',
        description: 'Registra una visita que va a llegar al edificio. Incluye nombre, RUT y a qué depto va.',
        input_schema: {
            type: 'object' as const,
            properties: {
                community_id: { type: 'string' },
                visitor_name: { type: 'string' },
                visitor_rut: { type: 'string', description: 'RUT del visitante (opcional).' },
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

    // ── MÓDULO: ADMINISTRADOR ────────────────────────────────────────────────
    {
        name: 'get_defaulters_list',
        description: 'Obtiene la lista de unidades con gastos comunes impagos. SOLO administradores.',
        input_schema: {
            type: 'object' as const,
            properties: {
                community_id: { type: 'string' },
                month: { type: 'string', description: 'Formato YYYY-MM. Si omites, devuelve todos los impagos activos.' },
            },
            required: ['community_id'],
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

] as const;

// ── Executor ─────────────────────────────────────────────────────────────────

interface UserContext {
    unit_id?: string;
    role?: string;
    community_id?: string;
}

export async function executeTool(
    name: string,
    input: Record<string, string>,
    userCtx: UserContext
): Promise<unknown> {
    try {
        switch (name) {

            // ── RESIDENTE / FINANZAS ─────────────────────────────────────────
            case 'get_resident_info': {
                const { data } = await supabase
                    .from('units')
                    .select('unit_number, residents(name, email, phone), communities(name)')
                    .eq('id', input.unit_id)
                    .maybeSingle();
                return data ?? { error: 'Unidad no encontrada' };
            }

            case 'get_payment_status': {
                const month = input.month || new Date().toISOString().slice(0, 7);
                const { data } = await supabase
                    .from('fees')
                    .select('amount, status, due_date, paid_at')
                    .eq('unit_id', input.unit_id)
                    .like('period', `${month}%`)
                    .order('due_date', { ascending: false })
                    .limit(3);
                return data ?? { error: 'Sin datos de pago para ese período' };
            }

            case 'get_water_consumption': {
                const month = input.month || new Date().toISOString().slice(0, 7);
                const { data } = await supabase
                    .from('water_readings')
                    .select('period, m3_consumed, amount_charged, reading_date')
                    .eq('unit_id', input.unit_id)
                    .like('period', `${month}%`)
                    .order('reading_date', { ascending: false })
                    .limit(3);
                return data ?? { error: 'Sin datos de consumo para ese período' };
            }

            case 'list_services': {
                const query = supabase
                    .from('service_providers')
                    .select('id, name, category, rating, contact_phone')
                    .order('rating', { ascending: false });
                
                if (input.category) {
                    query.eq('category', input.category);
                }
                
                const { data, error } = await query.limit(10);
                if (error) return { error: 'No se pudo obtener el directorio de servicios' };
                return data ?? [];
            }

            case 'search_marketplace': {
                const { data } = await supabase
                    .from('marketplace_items')
                    .select('id, title, description, price, category, status')
                    .ilike('title', `%${input.query}%`)
                    .eq('status', 'available')
                    .limit(5);
                return data ?? [];
            }

            // ── RECLAMOS ────────────────────────────────────────────────────
            case 'create_claim': {
                const { data, error } = await supabase
                    .from('maintenance_requests')
                    .insert({
                        unit_id: input.unit_id,
                        category: input.category,
                        description: input.description,
                        priority: input.priority || 'MEDIA',
                        status: 'PENDIENTE',
                        source: 'COCO_IA',
                        created_at: new Date().toISOString(),
                    })
                    .select('id')
                    .single();
                if (error) return { error: 'No se pudo registrar el reclamo', detail: error.message };
                return { success: true, claim_id: data.id, message: 'Reclamo registrado correctamente.' };
            }

            case 'get_claim_status': {
                const { data } = await supabase
                    .from('maintenance_requests')
                    .select('id, category, description, status, priority, created_at, updated_at')
                    .eq('id', input.claim_id)
                    .maybeSingle();
                return data ?? { error: 'Reclamo no encontrado' };
            }

            case 'list_my_claims': {
                const { data } = await supabase
                    .from('maintenance_requests')
                    .select('id, category, description, status, priority, created_at')
                    .eq('unit_id', input.unit_id)
                    .neq('status', 'CERRADO')
                    .order('created_at', { ascending: false })
                    .limit(10);
                return data ?? [];
            }

            // ── RESERVAS ────────────────────────────────────────────────────
            case 'check_availability': {
                const { data } = await supabase
                    .from('amenity_bookings')
                    .select('start_time, end_time, amenities(name)')
                    .eq('date', input.date)
                    .ilike('amenities.name', `%${input.space_name}%`)
                    .eq('status', 'confirmed');
                return {
                    space: input.space_name,
                    date: input.date,
                    occupied_slots: data ?? [],
                    available: !data || data.length === 0,
                };
            }

            case 'create_reservation': {
                const { data: amenity } = await supabase
                    .from('amenities')
                    .select('id, name')
                    .ilike('name', `%${input.space_name}%`)
                    .maybeSingle();
                if (!amenity) return { error: `No se encontró el espacio "${input.space_name}"` };
                const { data, error } = await supabase
                    .from('amenity_bookings')
                    .insert({
                        unit_id: input.unit_id,
                        amenity_id: amenity.id,
                        date: input.date,
                        start_time: input.start_time,
                        end_time: input.end_time,
                        status: 'confirmed',
                        source: 'COCO_IA',
                    })
                    .select('id')
                    .single();
                if (error) return { error: 'No se pudo crear la reserva. Puede que ese horario ya esté ocupado.' };
                return { success: true, booking_id: data.id, message: `Reserva de ${amenity.name} confirmada.` };
            }

            // ── COMUNICACIÓN ─────────────────────────────────────────────────
            case 'create_circular': {
                if (userCtx.role !== 'admin') return { error: 'Solo los administradores pueden enviar circulares.' };
                const { data, error } = await supabase
                    .from('announcements')
                    .insert({
                        community_id: input.community_id || userCtx.community_id,
                        title: input.title,
                        content: input.body,
                        audience: input.audience || 'TODOS',
                        source: 'COCO_IA',
                        created_at: new Date().toISOString(),
                    })
                    .select('id')
                    .single();
                if (error) return { error: 'No se pudo publicar la circular.' };
                return { success: true, announcement_id: data.id, message: 'Circular publicada exitosamente.' };
            }

            case 'create_social_post': {
                const { data, error } = await supabase
                    .from('social_posts')
                    .insert({
                        community_id: input.community_id || userCtx.community_id,
                        content: input.content,
                        unit_id: input.author_unit_id || userCtx.unit_id,
                        source: 'COCO_IA',
                        created_at: new Date().toISOString(),
                    })
                    .select('id')
                    .single();
                if (error) return { error: 'No se pudo publicar en el muro.' };
                return { success: true, post_id: data.id, message: 'Publicación en el muro realizada.' };
            }

            // ── VOTACIONES ──────────────────────────────────────────────────
            case 'list_active_polls': {
                const { data } = await supabase
                    .from('polls')
                    .select('id, title, description, closes_at, options:poll_options(id, text)')
                    .eq('community_id', input.community_id || userCtx.community_id)
                    .gte('closes_at', new Date().toISOString())
                    .order('closes_at', { ascending: true });
                return data ?? [];
            }

            case 'vote_in_poll': {
                const { error } = await supabase
                    .from('poll_votes')
                    .insert({
                        poll_id: input.poll_id,
                        option_id: input.option_id,
                        unit_id: input.unit_id || userCtx.unit_id,
                        voted_at: new Date().toISOString(),
                    });
                if (error) return { error: 'No se pudo registrar el voto. ¿Ya votaste en esta encuesta?' };
                return { success: true, message: '¡Voto registrado exitosamente! 🗳️' };
            }

            // ── CONSERJERÍA ──────────────────────────────────────────────────
            case 'register_visitor': {
                const { data, error } = await supabase
                    .from('visitors')
                    .insert({
                        community_id: input.community_id || userCtx.community_id,
                        visitor_name: input.visitor_name,
                        visitor_rut: input.visitor_rut || null,
                        host_unit_id: input.host_unit_id,
                        expected_at: input.expected_at || null,
                        status: 'ESPERADO',
                        registered_at: new Date().toISOString(),
                        source: 'COCO_IA',
                    })
                    .select('id')
                    .single();
                if (error) return { error: 'No se pudo registrar la visita.' };
                return { success: true, visitor_id: data.id, message: `Visita de ${input.visitor_name} registrada.` };
            }

            case 'register_package': {
                const { data, error } = await supabase
                    .from('packages')
                    .insert({
                        community_id: input.community_id || userCtx.community_id,
                        unit_id: input.unit_id,
                        courier: input.courier || 'Sin especificar',
                        description: input.description || null,
                        status: 'PENDIENTE_RETIRO',
                        received_at: new Date().toISOString(),
                        source: 'COCO_IA',
                    })
                    .select('id')
                    .single();
                if (error) return { error: 'No se pudo registrar el paquete.' };
                return { success: true, package_id: data.id, message: 'Encomienda registrada. Se notificará al residente.' };
            }

            case 'get_pending_packages': {
                const { data } = await supabase
                    .from('packages')
                    .select('id, courier, description, received_at')
                    .eq('unit_id', input.unit_id)
                    .eq('status', 'PENDIENTE_RETIRO')
                    .order('received_at', { ascending: false });
                return data ?? [];
            }

            case 'send_whatsapp_notification': {
                // Find all profiles for this unit
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('id, name')
                    .eq('unit_id', input.unit_id);
                
                if (!profiles || profiles.length === 0) {
                    return { error: 'No se encontraron residentes registrados con WhatsApp para ese departamento.' };
                }

                const secret = process.env.WHATSAPP_WEBHOOK_SECRET || '';
                const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 
                    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
                
                let successCount = 0;
                for (const p of profiles) {
                    const res = await fetch(`${baseUrl}/api/whatsapp-notify`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${secret}`
                        },
                        body: JSON.stringify({
                            user_id: p.id,
                            title: 'Notificación de CoCo',
                            body: input.message,
                            type: 'info'
                        })
                    });
                    if (res.ok) successCount++;
                }
                
                return { 
                    success: true, 
                    message: `Mensaje de WhatsApp enviado a ${successCount} residente(s) del departamento.` 
                };
            }

            // ── ADMINISTRADOR ────────────────────────────────────────────────
            case 'get_defaulters_list': {
                if (userCtx.role !== 'admin') return { error: 'Solo los administradores pueden acceder a esta información.' };
                const query = supabase
                    .from('fees')
                    .select('unit_id, amount, due_date, period, units(unit_number)')
                    .eq('community_id', input.community_id || userCtx.community_id)
                    .eq('status', 'PENDIENTE')
                    .order('due_date', { ascending: true });
                if (input.month) query.like('period', `${input.month}%`);
                const { data } = await query.limit(20);
                return data ?? [];
            }

            case 'create_poll': {
                if (userCtx.role !== 'admin') return { error: 'Solo los administradores pueden crear votaciones.' };
                const options = input.options.split(',').map(o => o.trim()).filter(Boolean);
                const { data: poll, error: pollErr } = await supabase
                    .from('polls')
                    .insert({
                        community_id: input.community_id || userCtx.community_id,
                        title: input.title,
                        description: input.description || null,
                        closes_at: input.closes_at || null,
                        source: 'COCO_IA',
                    })
                    .select('id')
                    .single();
                if (pollErr) return { error: 'No se pudo crear la votación.' };
                await supabase.from('poll_options').insert(
                    options.map(text => ({ poll_id: poll.id, text }))
                );
                return { success: true, poll_id: poll.id, message: `Votación "${input.title}" creada con ${options.length} opciones.` };
            }

            case 'update_unit_data': {
                if (userCtx.role !== 'admin') return { error: 'Solo los administradores pueden modificar información de departamentos.' };
                
                const updates: Record<string, any> = {};
                if (input.number !== undefined) updates.number = input.number;
                if (input.floor !== undefined) updates.floor = Number(input.floor);

                if (Object.keys(updates).length === 0) return { error: 'No se enviaron datos para actualizar' };

                const { error } = await supabase
                    .from('units')
                    .update(updates)
                    .eq('id', input.unit_id);
                
                if (error) return { error: 'No se pudo actualizar el departamento', detail: error.message };
                return { success: true, message: `Información de la unidad actualizada correctamente.` };
            }

            default:
                return { error: `Herramienta desconocida: ${name}` };
        }
    } catch (err) {
        console.error(`[CoCo Tool Error] ${name}:`, err);
        return { error: `Error ejecutando herramienta ${name}` };
    }
}
