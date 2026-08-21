import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { getServiceProviderById } from '@/lib/server/data/serviceProviders';

function cleanText(value: unknown, max: number) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function POST(req: NextRequest) {
    try {
        const profile = await getAuthenticatedAgentProfile();
        if (!profile) {
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

        const provider = await getServiceProviderById(supabaseAdmin, providerId);
        if (!provider) {
            return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 });
        }

        if (!profile.community_id || provider.community_id !== profile.community_id) {
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
            console.error('[reviews] insert failed', reviewError);
            return NextResponse.json({ error: 'No se pudo guardar la reseña.' }, { status: 500 });
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
        console.error('[reviews] create failed', error);
        return NextResponse.json(
            { error: 'No se pudo guardar la reseña.' },
            { status: 500 }
        );
    }
}
