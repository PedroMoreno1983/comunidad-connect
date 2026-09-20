import { NextRequest, NextResponse } from 'next/server';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import type { TrainingAssignmentRecord } from '@/lib/types';

function cleanId(value: unknown) {
    return typeof value === 'string' ? value.trim().slice(0, 80) : '';
}

export async function GET(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'training.assignments.read', { limit: 60, windowMs: 60_000 });
    if (limited) return limited;
    const profile = await getAuthenticatedAgentProfile();
    if (!profile?.community_id || !['admin', 'concierge'].includes(profile.role)) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    const { data, error } = await getSupabaseAdmin()
        .from('training_assignments')
        .select('id,module_id,user_id,community_id,assigned_by,module_version,mandatory,due_at,status,assigned_at,completed_at,updated_at')
        .eq('community_id', profile.community_id)
        .eq('user_id', profile.id)
        .neq('status', 'cancelled')
        .order('assigned_at', { ascending: false });
    if (error) return NextResponse.json({ error: 'No se pudieron cargar tus asignaciones.' }, { status: 500 });
    return NextResponse.json((data || []) as TrainingAssignmentRecord[]);
}

export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'training.assignments.create', { limit: 20, windowMs: 60_000 });
    if (limited) return limited;
    const profile = await getAuthenticatedAgentProfile();
    if (profile?.role !== 'admin' || !profile.community_id) {
        return NextResponse.json({ error: 'Solo administración puede asignar cursos.' }, { status: 403 });
    }

    const body = await req.json() as Record<string, unknown>;
    const moduleId = cleanId(body.moduleId);
    const assigneeIds = Array.isArray(body.assigneeIds)
        ? [...new Set(body.assigneeIds.map(cleanId).filter(Boolean))].slice(0, 100)
        : [];
    const mandatory = body.mandatory !== false;
    const dueAt = typeof body.dueAt === 'string' && body.dueAt ? new Date(body.dueAt) : null;
    if (!moduleId || assigneeIds.length === 0) return NextResponse.json({ error: 'Selecciona un curso y al menos una persona.' }, { status: 400 });
    if (dueAt && Number.isNaN(dueAt.getTime())) return NextResponse.json({ error: 'La fecha límite no es válida.' }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const { data: courseModule } = await supabase
        .from('training_modules')
        .select('id,title,target_audience,community_id,version_number,is_active')
        .eq('id', moduleId)
        .eq('is_active', true)
        .or(`community_id.is.null,community_id.eq.${profile.community_id}`)
        .maybeSingle();
    if (!courseModule) return NextResponse.json({ error: 'El curso no está disponible para tu comunidad.' }, { status: 404 });

    const { data: staff } = await supabase
        .from('profiles')
        .select('id,name,role')
        .eq('community_id', profile.community_id)
        .in('id', assigneeIds)
        .in('role', ['admin', 'concierge']);
    const eligible = (staff || []).filter(member => courseModule.target_audience === 'all' || courseModule.target_audience === member.role);
    if (eligible.length !== assigneeIds.length) {
        return NextResponse.json({ error: 'Una o más personas no pertenecen a la comunidad o no corresponden a la audiencia del curso.' }, { status: 400 });
    }

    const { data: existing } = await supabase
        .from('training_assignments')
        .select('user_id,status')
        .eq('module_id', moduleId)
        .eq('module_version', courseModule.version_number)
        .in('user_id', assigneeIds);
    const previousStatus = new Map((existing || []).map(item => [item.user_id, item.status]));
    const now = new Date().toISOString();
    const payload = eligible.map(member => ({
        module_id: moduleId,
        user_id: member.id,
        community_id: profile.community_id,
        assigned_by: profile.id,
        module_version: courseModule.version_number,
        mandatory,
        due_at: dueAt?.toISOString() || null,
        status: previousStatus.get(member.id) === 'completed' ? 'completed' : previousStatus.get(member.id) === 'in_progress' ? 'in_progress' : 'assigned',
        updated_at: now,
    }));
    const { data, error } = await supabase
        .from('training_assignments')
        .upsert(payload, { onConflict: 'module_id,user_id,module_version' })
        .select('id,module_id,user_id,community_id,assigned_by,module_version,mandatory,due_at,status,assigned_at,completed_at,updated_at');
    if (error) {
        console.error('[training/assignments] Create failed:', error.message);
        return NextResponse.json({ error: 'No se pudieron guardar las asignaciones.' }, { status: 500 });
    }

    const pendingRecipients = (data || []).filter(item => item.status !== 'completed');
    if (pendingRecipients.length) {
        const dueLabel = dueAt ? ` Debe completarse antes del ${new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium' }).format(dueAt)}.` : '';
        await supabase.from('notifications').insert(pendingRecipients.map(item => ({
            user_id: item.user_id,
            type: 'info',
            category: 'training',
            title: mandatory ? 'Curso obligatorio asignado' : 'Curso recomendado',
            body: `${courseModule.title}.${dueLabel}`,
            link: '/staff/training',
            community_id: profile.community_id,
        })));
    }
    return NextResponse.json({ assignments: (data || []) as TrainingAssignmentRecord[] }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'training.assignments.update', { limit: 20, windowMs: 60_000 });
    if (limited) return limited;
    const profile = await getAuthenticatedAgentProfile();
    if (profile?.role !== 'admin' || !profile.community_id) {
        return NextResponse.json({ error: 'Solo administración puede cambiar asignaciones.' }, { status: 403 });
    }
    const body = await req.json() as Record<string, unknown>;
    const assignmentId = cleanId(body.assignmentId);
    if (!assignmentId || body.status !== 'cancelled') return NextResponse.json({ error: 'Solicitud no válida.' }, { status: 400 });
    const { data, error } = await getSupabaseAdmin()
        .from('training_assignments')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', assignmentId)
        .eq('community_id', profile.community_id)
        .neq('status', 'completed')
        .select('id')
        .maybeSingle();
    if (error) return NextResponse.json({ error: 'No se pudo cancelar la asignación.' }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Asignación no encontrada o ya completada.' }, { status: 404 });
    return NextResponse.json({ success: true });
}
