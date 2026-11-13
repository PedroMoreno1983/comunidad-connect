import 'server-only';

import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';

/**
 * Reseña de un vecino a un maestro. La usan la ruta /api/reviews y CoCo
 * (rate_provider), con las mismas reglas: el maestro tiene que ser de la
 * comunidad del vecino o de la Red Convive, una reseña por vecino y maestro
 * (si vuelve a valorar, se actualiza), y se marca "servicio verificado" cuando
 * tuvo una solicitud completada con ese maestro.
 */

export class ProviderReviewError extends Error {
    constructor(message: string, readonly status: number) {
        super(message);
    }
}

export type ProviderReviewInput = { providerId: string; rating: number; comment: string; serviceType?: string };

function cleanText(value: unknown, max: number) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function submitProviderReview(userId: string, input: ProviderReviewInput) {
    const providerId = cleanText(input.providerId, 80);
    const comment = cleanText(input.comment, 1200);
    const serviceType = cleanText(input.serviceType, 80) || 'general';
    const rating = Number(input.rating);
    if (!providerId || !comment || !Number.isInteger(rating) || rating < 1 || rating > 5) {
        throw new ProviderReviewError('La reseña necesita una nota de 1 a 5 y un comentario.', 400);
    }

    const [{ data: profile }, { data: provider }] = await Promise.all([
        supabaseAdmin.from('profiles').select('id, community_id').eq('id', userId).maybeSingle(),
        supabaseAdmin.from('service_providers').select('id, name, community_id, user_id').eq('id', providerId).maybeSingle(),
    ]);
    if (!profile) throw new ProviderReviewError('Perfil no encontrado.', 403);
    if (!provider) throw new ProviderReviewError('Proveedor no encontrado.', 404);
    // Un maestro de la red (sin comunidad) lo puede evaluar cualquier vecino.
    if (!profile.community_id || (provider.community_id && provider.community_id !== profile.community_id)) {
        throw new ProviderReviewError('Ese proveedor pertenece a otra comunidad.', 403);
    }
    if (provider.user_id === userId) throw new ProviderReviewError('No puedes valorar tu propio perfil.', 403);

    const { data: completed } = await supabaseAdmin.from('service_requests').select('id')
        .eq('provider_id', provider.id).eq('user_id', userId).eq('status', 'completed')
        .order('created_at', { ascending: false }).limit(1).maybeSingle();

    const { data: review, error } = await supabaseAdmin.from('reviews').upsert({
        provider_id: provider.id,
        user_id: userId,
        rating,
        comment,
        service_type: serviceType,
        verified_service: Boolean(completed),
        service_request_id: completed?.id ?? null,
    }, { onConflict: 'provider_id,user_id' })
        .select('id, provider_id, user_id, rating, comment, service_type, created_at, verified_service')
        .single();
    if (error || !review) throw new ProviderReviewError('No se pudo guardar la reseña.', 500);

    const { data: reviews } = await supabaseAdmin.from('reviews').select('rating').eq('provider_id', provider.id);
    const rows = reviews || [];
    const average = rows.length ? rows.reduce((sum, item) => sum + Number(item.rating || 0), 0) / rows.length : rating;
    await supabaseAdmin.from('service_providers')
        .update({ rating: Math.round(average * 10) / 10, review_count: rows.length })
        .eq('id', provider.id);

    return { review, providerName: String(provider.name), verifiedService: Boolean(completed) };
}
