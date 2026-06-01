import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';

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

function cleanText(value: unknown, max: number) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function POST(req: NextRequest) {
    try {
        const supabaseUser = await getSupabaseUserClient();
        const { data: { user }, error: authError } = await supabaseUser.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const body = await req.json();
        const providerId = cleanText(body.provider_id, 80);
        const serviceType = cleanText(body.service_type, 80) || 'general';
        const comment = cleanText(body.comment, 1200);
        const rating = Number(body.rating);

        if (!providerId || !comment || !Number.isInteger(rating) || rating < 1 || rating > 5) {
            return NextResponse.json({ error: 'Datos de resena no validos' }, { status: 400 });
        }

        const [{ data: profile, error: profileError }, { data: provider, error: providerError }] = await Promise.all([
            supabaseAdmin
                .from('profiles')
                .select('id, name, email, community_id')
                .eq('id', user.id)
                .single(),
            supabaseAdmin
                .from('service_providers')
                .select('id, name, community_id')
                .eq('id', providerId)
                .single(),
        ]);

        if (profileError || !profile) {
            return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 403 });
        }


        if (providerError || !provider) {
            return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 });
        }

        if (provider.community_id && provider.community_id !== profile.community_id) {
            return NextResponse.json({ error: 'Proveedor pertenece a otra comunidad' }, { status: 403 });
        }

        const { data: review, error: reviewError } = await supabaseAdmin
            .from('reviews')
            .upsert(
                {
                    provider_id: provider.id,
                    user_id: profile.id,
                    rating,
                    comment,
                    service_type: serviceType,
                },
                { onConflict: 'provider_id,user_id' }
            )
            .select('id, provider_id, user_id, rating, comment, service_type, created_at')
            .single();

        if (reviewError || !review) {
            return NextResponse.json({ error: reviewError?.message || 'No se pudo guardar la resena' }, { status: 500 });
        }

        const { data: reviews } = await supabaseAdmin
            .from('reviews')
            .select('rating')
            .eq('provider_id', provider.id);

        const reviewRows = reviews || [];
        const reviewCount = reviewRows.length;
        const average = reviewCount
            ? reviewRows.reduce((sum, item) => sum + Number(item.rating || 0), 0) / reviewCount
            : rating;

        await supabaseAdmin
            .from('service_providers')
            .update({
                rating: Math.round(average * 10) / 10,
                review_count: reviewCount,
            })
            .eq('id', provider.id);

        return NextResponse.json({ review }, { status: 201 });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Error desconocido' },
            { status: 500 }
        );
    }
}
