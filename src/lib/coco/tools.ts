/**
 * tools.ts — CoCo IA
 * Define las 7 herramientas que Claude puede invocar.
 * El executor llama a los endpoints de ComunidadConnect (Supabase / API routes).
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ── Definiciones de herramientas para Anthropic ──────────────────────────────

export const TOOL_DEFINITIONS = [
    {
        name: 'get_resident_info',
        description: 'Obtiene nombre, depto, comunidad y datos del residente autenticado.',
        input_schema: {
            type: 'object' as const,
            properties: {
                unit_id: { type: 'string', description: 'ID de la unidad/depto' },
            },
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
                month: { type: 'string', description: 'Formato YYYY-MM. Si no se indica, usa el mes actual.' },
            },
            required: ['unit_id'],
        },
    },
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
                description: { type: 'string', description: 'Descripción del problema con el detalle dado por el residente.' },
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
            properties: {
                claim_id: { type: 'string' },
            },
            required: ['claim_id'],
        },
    },
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
        name: 'create_circular',
        description: 'Redacta y envía una circular a la comunidad. SOLO disponible para administradores.',
        input_schema: {
            type: 'object' as const,
            properties: {
                community_id: { type: 'string' },
                title: { type: 'string' },
                body: { type: 'string' },
                audience: {
                    type: 'string',
                    enum: ['TODOS', 'PROPIETARIOS', 'ARRENDATARIOS'],
                    description: 'A quién va dirigida la circular',
                },
            },
            required: ['community_id', 'title', 'body'],
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
                // Primero encontrar el amenity_id por nombre
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

            case 'create_circular': {
                if (userCtx.role !== 'admin') {
                    return { error: 'Solo los administradores pueden enviar circulares.' };
                }
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

            default:
                return { error: `Herramienta desconocida: ${name}` };
        }
    } catch (err) {
        console.error(`[CoCo Tool Error] ${name}:`, err);
        return { error: `Error ejecutando herramienta ${name}` };
    }
}
