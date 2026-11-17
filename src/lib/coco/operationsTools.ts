import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { changeServiceRequestStatus } from '@/lib/services/requestStatus';
import { registerIncident } from '@/lib/concierge/incidents';
import { chileTodayISO } from '@/lib/agent-center/chileDate';

/**
 * Operación diaria por CoCo: solicitudes de servicio (ver y avanzar),
 * incidencias de conserjería y lecturas de agua. Usa las mismas funciones que
 * las pantallas; quien actúa es el perfil autenticado.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
type Row = Record<string, unknown>;
export type OpsActor = { id: string; role: string; communityId: string };

// ── Solicitudes de servicio ──────────────────────────────────────────────────

export async function listServiceRequests(admin: SupabaseClient, actor: OpsActor) {
    const staff = actor.role === 'admin' || actor.role === 'concierge';
    let query = admin
        .from('service_requests')
        .select('id, provider_id, user_id, preferred_date, preferred_time, description, status, created_at')
        .eq('community_id', actor.communityId)
        .in('status', ['pending', 'accepted', 'awaiting_confirmation'])
        .order('created_at', { ascending: false })
        .limit(20);
    if (!staff) query = query.eq('user_id', actor.id);
    const { data, error } = await query;
    if (error) return { error: 'No pude cargar las solicitudes de servicio.' };
    const rows = (data ?? []) as Row[];
    const providerIds = [...new Set(rows.map(row => row.provider_id).filter(Boolean).map(String))];
    const { data: providers } = providerIds.length
        ? await admin.from('service_providers').select('id, name').in('id', providerIds)
        : { data: [] };
    const nameOf = new Map(((providers ?? []) as Row[]).map(p => [String(p.id), String(p.name)]));
    return {
        solicitudes: rows.map(row => ({
            request_id: row.id,
            descripcion: String(row.description ?? '').slice(0, 140),
            proveedor: row.provider_id ? nameOf.get(String(row.provider_id)) ?? 'Proveedor' : 'sin asignar',
            estado: row.status,
            fecha: row.preferred_date, hora: row.preferred_time,
        })),
        nota: rows.length ? undefined : 'No hay solicitudes de servicio abiertas.',
    };
}

export async function updateServiceRequestStatusForUser(admin: SupabaseClient, actor: OpsActor, input: Record<string, unknown>) {
    const requestId = text(input.request_id, 36);
    if (!UUID.test(requestId)) return { error: 'Necesito el request_id que devuelve list_service_requests.' };
    const result = await changeServiceRequestStatus(admin, actor, requestId, {
        status: text(input.status, 30),
        preferredDate: text(input.preferred_date, 10),
        preferredTime: text(input.preferred_time, 5),
    });
    if ('error' in result) return { error: result.error };
    const status = String(result.request.status);
    const done: Record<string, string> = {
        accepted: 'quedó aceptada', awaiting_confirmation: 'quedó como realizada; falta que el vecino confirme',
        completed: 'quedó completada', cancelled: 'quedó cancelada', pending: 'volvió a pendiente',
    };
    return { success: true, message: `La solicitud ${done[status] ?? `quedó en ${status}`}.` };
}

// ── Incidencias ──────────────────────────────────────────────────────────────

export async function registerIncidentForStaff(admin: SupabaseClient, actor: OpsActor, input: Record<string, unknown>) {
    const result = await registerIncident(admin, actor, { title: input.title, description: input.description, urgency: input.urgency }, 'coco');
    if ('error' in result) return { error: result.error };
    return { success: true, message: `Registré la incidencia "${result.incident.title}" y le avisé a la administración.`, case_id: result.incident.id };
}

// ── Lecturas de agua ─────────────────────────────────────────────────────────

export async function recordWaterReading(admin: SupabaseClient, actor: OpsActor, input: Record<string, unknown>) {
    const unitNumber = text(input.unit_number, 20);
    if (!unitNumber) return { error: 'Dime el número de departamento.' };
    const value = Number(input.reading_value);
    if (!Number.isFinite(value) || value < 0 || value > 99_999_999) return { error: 'La lectura debe ser un número (m³ del medidor).' };

    const today = chileTodayISO();
    const period = text(input.month, 7) || today.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(period)) return { error: 'El periodo debe venir como AAAA-MM.' };
    const [year, monthNumber] = period.split('-').map(Number);
    const monthName = MONTHS[monthNumber - 1];
    if (!monthName) return { error: 'El periodo no es válido.' };

    const tower = text(input.tower, 10);
    let unitQuery = admin.from('units').select('id, number, tower').eq('community_id', actor.communityId).eq('number', unitNumber).limit(3);
    if (tower) unitQuery = unitQuery.eq('tower', tower);
    const { data: units, error: unitError } = await unitQuery;
    if (unitError) return { error: 'No pude buscar el departamento.' };
    const matches = (units ?? []) as Row[];
    if (!matches.length) return { error: `No encontré el departamento ${unitNumber} en tu comunidad.` };
    if (matches.length > 1) return { error: `Hay más de un ${unitNumber} (distintas torres). Dime la torre.`, torres: matches.map(u => u.tower) };
    const unit = matches[0];

    const { data: existing } = await admin.from('water_readings').select('id, reading_value')
        .eq('unit_id', String(unit.id)).eq('month', monthName).eq('year', year).maybeSingle();
    if (existing) {
        return { error: `El ${unitNumber} ya tiene lectura de ${monthName} ${year}: ${existing.reading_value} m³. Para corregirla, hazlo en Consumo de agua.` };
    }
    const { error } = await admin.from('water_readings').insert({
        unit_id: unit.id,
        reading_value: value,
        reading_date: today,
        month: monthName,
        year,
        created_by: actor.id,
        community_id: actor.communityId,
    });
    if (error) return { error: 'No se pudo guardar la lectura.' };
    return { success: true, message: `Registré la lectura del ${unitNumber}: ${value} m³ (${monthName} ${year}).` };
}
