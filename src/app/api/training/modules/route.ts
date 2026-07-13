import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';

function cleanText(value: unknown, max: number) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function GET(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'training.modules.read', { limit: 60, windowMs: 60_000 });
    if (limited) return limited;

    const profile = await getAuthenticatedAgentProfile();
    if (!profile?.community_id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    let query = getSupabaseAdmin()
        .from('training_modules')
        .select('id,title,description,target_audience,is_active,community_id,created_at,training_lessons(id,title,content,order_index)')
        .eq('is_active', true)
        .or(`community_id.is.null,community_id.eq.${profile.community_id}`)
        .order('created_at', { ascending: false });

    if (profile.role !== 'admin') {
        query = query.in('target_audience', ['all', profile.role]);
    }

    const { data, error } = await query;
    if (error) {
        console.error('[training/modules] Read failed:', error.message);
        return NextResponse.json({ error: 'No se pudieron cargar los cursos.' }, { status: 500 });
    }
    return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'training.modules.create', { limit: 12, windowMs: 60_000 });
    if (limited) return limited;

    const profile = await getAuthenticatedAgentProfile();
    if (!profile) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    if (profile.role !== 'admin' || !profile.community_id) {
        return NextResponse.json({ error: 'Solo administracion puede publicar cursos.' }, { status: 403 });
    }

    const body = await req.json() as Record<string, unknown>;
    const title = cleanText(body.title, 180);
    const description = cleanText(body.description, 1_500);
    const content = cleanText(body.content, 100_000);
    const requestedAudience = cleanText(body.target_audience, 20);
    const targetAudience = ['all', 'resident', 'concierge', 'admin'].includes(requestedAudience) ? requestedAudience : 'all';
    if (!title || !content) return NextResponse.json({ error: 'Titulo y contenido son obligatorios.' }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const { data: module, error: moduleError } = await supabase
        .from('training_modules')
        .insert({ title, description, target_audience: targetAudience, is_active: true, community_id: profile.community_id, created_by: profile.id })
        .select('id,title,description,target_audience,community_id,created_at')
        .single();
    if (moduleError || !module) {
        console.error('[training/modules] Create failed:', moduleError?.message);
        return NextResponse.json({ error: 'No se pudo guardar el curso.' }, { status: 500 });
    }

    const { error: lessonError } = await supabase.from('training_lessons').insert({ module_id: module.id, title: 'Leccion principal', content, order_index: 0 });
    if (lessonError) {
        await supabase.from('training_modules').delete().eq('id', module.id).eq('community_id', profile.community_id);
        console.error('[training/modules] Lesson create failed:', lessonError.message);
        return NextResponse.json({ error: 'No se pudo guardar la leccion.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, module }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'training.modules.delete', { limit: 12, windowMs: 60_000 });
    if (limited) return limited;

    const profile = await getAuthenticatedAgentProfile();
    if (!profile) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    if (profile.role !== 'admin' || !profile.community_id) {
        return NextResponse.json({ error: 'Solo administracion puede eliminar cursos.' }, { status: 403 });
    }

    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Falta el ID del curso.' }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const { data: module } = await supabase.from('training_modules').select('id,community_id').eq('id', id).maybeSingle();
    if (!module) return NextResponse.json({ error: 'Curso no encontrado.' }, { status: 404 });
    if (!module.community_id) return NextResponse.json({ error: 'Los cursos oficiales no se pueden eliminar.' }, { status: 403 });
    if (module.community_id !== profile.community_id) return NextResponse.json({ error: 'Curso fuera de tu comunidad.' }, { status: 403 });

    const { error } = await supabase.from('training_modules').delete().eq('id', id).eq('community_id', profile.community_id);
    if (error) {
        console.error('[training/modules] Delete failed:', error.message);
        return NextResponse.json({ error: 'No se pudo eliminar el curso.' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
}
