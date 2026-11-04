/**
 * Agenda de la comunidad dentro de Convive: asambleas y reservas.
 * No crea asambleas (eso sigue el flujo de la Ley 21.442) ni muestra nombres.
 */

import { chileTodayISO } from '@/lib/agent-center/chileDate';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

export async function listCommunityAgenda(communityId: string, role: string | undefined, userId: string | undefined) {
    const admin = getSupabaseAdmin();
    const today = chileTodayISO();
    const staff = role === 'admin' || role === 'concierge';

    let bookingsQuery = admin
        .from('bookings')
        .select('date, start_time, end_time, status, amenity_id')
        .eq('community_id', communityId)
        .gte('date', today)
        .in('status', ['pending', 'confirmed'])
        .order('date', { ascending: true })
        .limit(20);
    if (!staff && userId) bookingsQuery = bookingsQuery.eq('user_id', userId);

    let assembliesQuery = admin
        .from('assemblies')
        .select('title, status, modality, scheduled_at')
        .eq('community_id', communityId)
        .gte('scheduled_at', `${today}T00:00:00`)
        .order('scheduled_at', { ascending: true })
        .limit(12);
    assembliesQuery = staff
        ? assembliesQuery.in('status', ['draft', 'cited', 'in_progress'])
        : assembliesQuery.in('status', ['cited', 'in_progress']);

    const [bookings, assemblies, amenities] = await Promise.all([
        bookingsQuery,
        assembliesQuery,
        admin.from('amenities').select('id, name').eq('community_id', communityId).limit(100),
    ]);
    if (bookings.error) throw bookings.error;
    if (assemblies.error) throw assemblies.error;

    const names = new Map((amenities.data || []).map(row => [String(row.id), String(row.name || 'Espacio')]));
    return {
        assemblies: (assemblies.data || []).map(row => ({
            title: row.title,
            status: row.status,
            modality: row.modality,
            when: row.scheduled_at,
        })),
        bookings: (bookings.data || []).map(row => ({
            date: row.date,
            start: row.start_time,
            end: row.end_time,
            status: row.status,
            space: names.get(String(row.amenity_id)) || 'Espacio común',
        })),
        note: 'Esto es la agenda de Convive. Para citar una asamblea se usa el módulo de asambleas, no esta lectura. Un recordatorio se crea con create_reminder.',
    };
}
