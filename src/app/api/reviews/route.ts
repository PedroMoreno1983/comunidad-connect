import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { ProviderReviewError, submitProviderReview } from '@/lib/services/providerReviews';

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

/** Reseña de un vecino a un maestro (mismas reglas que CoCo: providerReviews.ts). */
export async function POST(req: NextRequest) {
    try {
        const supabaseUser = await getSupabaseUserClient();
        const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const body = await req.json().catch(() => ({})) as Record<string, unknown>;
        const { review } = await submitProviderReview(user.id, {
            providerId: String(body.provider_id ?? ''),
            rating: Number(body.rating),
            comment: String(body.comment ?? ''),
            serviceType: typeof body.service_type === 'string' ? body.service_type : undefined,
        });
        return NextResponse.json({ review }, { status: 201 });
    } catch (error) {
        if (error instanceof ProviderReviewError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        console.error('[reviews] create failed', error);
        return NextResponse.json({ error: 'No se pudo guardar la reseña.' }, { status: 500 });
    }
}
