import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { recordAiEvent } from '@/lib/ai/telemetry';
import { changeCaseStatus } from '@/lib/cases/caseStatus';

async function getSupabaseUserClient() {
    const cookieStore = await cookies();
    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll: () => cookieStore.getAll(),
                setAll: () => {},
            },
        }
    );
}

/** La lógica vive en changeCaseStatus, compartida con CoCo (update_case_status). */
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const started = Date.now();
    const { id } = await params;

    try {
        const body = await req.json();

        const supabaseUser = await getSupabaseUserClient();
        const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const { data: actorProfile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('id, role, community_id, name')
            .eq('id', user.id)
            .single();
        if (profileError || !actorProfile) {
            return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 });
        }

        const result = await changeCaseStatus(supabaseAdmin, {
            id: actorProfile.id, role: actorProfile.role, communityId: actorProfile.community_id, name: actorProfile.name,
        }, id, String(body.status ?? ''), 'admin_dashboard');

        if ('error' in result) {
            if (result.status === 500) {
                recordAiEvent({ provider: 'system', feature: 'coco.case_status', status: 'error', model: 'api-v1', latencyMs: Date.now() - started, error: result.cause });
            }
            return NextResponse.json({ error: result.error }, { status: result.status });
        }

        recordAiEvent({
            provider: 'system', feature: 'coco.case_status', status: 'success', model: 'api-v1',
            latencyMs: Date.now() - started, outputChars: String(result.case.title ?? '').length,
        });
        return NextResponse.json({ case: result.case }, { status: 200 });
    } catch (error) {
        recordAiEvent({ provider: 'system', feature: 'coco.case_status', status: 'error', model: 'api-v1', latencyMs: Date.now() - started, error });
        return NextResponse.json({ error: 'No se pudo actualizar el caso.' }, { status: 500 });
    }
}
