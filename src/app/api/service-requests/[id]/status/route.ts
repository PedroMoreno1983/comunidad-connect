import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { recordAiEvent } from '@/lib/ai/telemetry';
import { getRequestId } from '@/lib/operations/audit';
import { changeServiceRequestStatus } from '@/lib/services/requestStatus';

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

/** La lógica vive en changeServiceRequestStatus, compartida con CoCo (update_service_request_status). */
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
            .select('id, role, community_id')
            .eq('id', user.id)
            .single();
        if (profileError || !actorProfile) {
            return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 403 });
        }

        const result = await changeServiceRequestStatus(supabaseAdmin, {
            id: actorProfile.id, role: actorProfile.role, communityId: actorProfile.community_id,
        }, id, {
            status: String(body.status ?? ''),
            preferredDate: typeof body.preferred_date === 'string' ? body.preferred_date : '',
            preferredTime: typeof body.preferred_time === 'string' ? body.preferred_time : '',
        }, getRequestId(req) ?? undefined);

        if ('error' in result) {
            if (result.cause) {
                recordAiEvent({ provider: 'system', feature: 'service_request.status', status: 'error', model: 'api-v1', latencyMs: Date.now() - started, error: result.cause });
            }
            return NextResponse.json({ error: result.error }, { status: result.status });
        }

        recordAiEvent({
            provider: 'system', feature: 'service_request.status', status: 'success', model: 'api-v1',
            latencyMs: Date.now() - started, outputChars: String(result.request.description ?? '').length,
        });
        return NextResponse.json({ request: result.request }, { status: 200 });
    } catch (error) {
        recordAiEvent({ provider: 'system', feature: 'service_request.status', status: 'error', model: 'api-v1', latencyMs: Date.now() - started, error });
        return NextResponse.json({ error: 'No se pudo actualizar la solicitud.' }, { status: 500 });
    }
}
