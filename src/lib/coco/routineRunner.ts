/**
 * Persiste y corre las rutinas. El aviso va solo a quien la creó, dentro de la app.
 */

import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { chileTodayISO } from '@/lib/agent-center/chileDate';
import { nextRoutineInstant, parseRoutineRequest, routineDelivery, type RoutineDraft } from './routines';

const MAX_ROUTINES = 10;

function draftColumns(draft: RoutineDraft, now: Date) {
    return {
        cadence: draft.cadence,
        weekday: draft.weekday,
        day_of_month: draft.dayOfMonth,
        time_local: draft.timeLocal,
        instruction: draft.instruction,
        next_run_at: nextRoutineInstant(draft, now).toISOString(),
    };
}

export async function createRoutine(input: { communityId: string; userId: string; request: string }) {
    const parsed = parseRoutineRequest(input.request);
    if ('error' in parsed) return parsed;
    const admin = getSupabaseAdmin();
    const { count, error: countError } = await admin
        .from('coco_routines')
        .select('id', { count: 'exact', head: true })
        .eq('community_id', input.communityId)
        .in('status', ['active', 'paused']);
    if (countError) return { error: 'No pude revisar las rutinas.' };
    if ((count || 0) >= MAX_ROUTINES) return { error: 'Ya hay 10 rutinas. Pausa o borra una antes de crear otra.' };
    const { data, error } = await admin.from('coco_routines').insert({
        community_id: input.communityId,
        created_by: input.userId,
        status: 'active',
        ...draftColumns(parsed, new Date()),
    }).select('id, next_run_at, time_local, cadence').single();
    if (error || !data) return { error: 'No pude guardar la rutina.' };
    return {
        success: true,
        routine_id: data.id,
        next_run_at: data.next_run_at,
        message: `Quedó activa, a las ${data.time_local} (hora de Chile). Te aviso en la app. No sale un correo solo.`,
    };
}

export async function listRoutines(communityId: string) {
    const { data, error } = await getSupabaseAdmin()
        .from('coco_routines')
        .select('id, instruction, cadence, weekday, day_of_month, time_local, status, next_run_at')
        .eq('community_id', communityId)
        .in('status', ['active', 'paused'])
        .order('created_at', { ascending: false })
        .limit(MAX_ROUTINES);
    if (error) return { error: 'No pude listar las rutinas.' };
    return { routines: data || [] };
}

async function setStatus(communityId: string, routineId: string, status: 'paused' | 'deleted') {
    const { data, error } = await getSupabaseAdmin()
        .from('coco_routines')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', routineId)
        .eq('community_id', communityId)
        .in('status', ['active', 'paused'])
        .select('id')
        .maybeSingle();
    if (error) return { error: 'No pude actualizar la rutina.' };
    if (!data) return { error: 'No encontré esa rutina activa.' };
    return { success: true, routine_id: data.id, status };
}

export function pauseRoutine(communityId: string, routineId: string) {
    return setStatus(communityId, routineId, 'paused');
}

export function deleteRoutine(communityId: string, routineId: string) {
    return setStatus(communityId, routineId, 'deleted');
}

export async function runDueRoutines(now = new Date()) {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
        .from('coco_routines')
        .select('id, community_id, created_by, instruction, cadence, weekday, day_of_month, time_local, next_run_at')
        .eq('status', 'active')
        .lte('next_run_at', now.toISOString())
        .order('next_run_at', { ascending: true })
        .limit(20);
    if (error) throw error;
    const ran: string[] = [];
    for (const routine of data || []) {
        const draft = {
            cadence: routine.cadence as RoutineDraft['cadence'],
            weekday: routine.weekday,
            dayOfMonth: routine.day_of_month,
            timeLocal: String(routine.time_local).slice(0, 5),
            instruction: String(routine.instruction),
        };
        const next = nextRoutineInstant(draft, now).toISOString();
        const claimed = await admin.from('coco_routines').update({
            last_run_at: now.toISOString(),
            next_run_at: next,
            updated_at: now.toISOString(),
        }).eq('id', routine.id).eq('status', 'active').eq('next_run_at', routine.next_run_at).select('id').maybeSingle();
        if (claimed.error || !claimed.data || !routine.created_by) continue;
        const today = chileTodayISO(now);
        const [assemblies, bookings] = await Promise.all([
            admin.from('assemblies').select('id', { count: 'exact', head: true })
                .eq('community_id', routine.community_id)
                .gte('scheduled_at', `${today}T00:00:00`)
                .in('status', ['cited', 'in_progress']),
            admin.from('bookings').select('id', { count: 'exact', head: true })
                .eq('community_id', routine.community_id)
                .gte('date', today)
                .in('status', ['pending', 'confirmed']),
        ]);
        const body = routineDelivery(draft.instruction, {
            assemblies: assemblies.count || 0,
            bookings: bookings.count || 0,
        });
        await admin.from('notifications').insert({
            user_id: routine.created_by,
            community_id: routine.community_id,
            type: 'info',
            category: 'coco_routine',
            title: 'Tu rutina de CoCo',
            body: body.slice(0, 400),
            link: '/chat',
            read: false,
        });
        ran.push(String(routine.id));
    }
    return { ran };
}
