import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();

        // Get the session
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
            return NextResponse.json(
                { error: 'No autenticado' },
                { status: 401 }
            );
        }

        const body = await request.json();
        const { provider_id, rating, comment, service_type } = body;

        // Validate input
        if (!provider_id || !rating || !comment || !service_type) {
            return NextResponse.json(
                { error: 'Datos incompletos' },
                { status: 400 }
            );
        }

        if (rating < 1 || rating > 5) {
            return NextResponse.json(
                { error: 'Calificación debe estar entre 1 y 5' },
                { status: 400 }
            );
        }

        // Insert the review
        const { data: review, error } = await supabase
            .from('reviews')
            .insert({
                provider_id,
                user_id: session.user.id,
                rating,
                comment,
                service_type,
            })
            .select()
            .single();

        if (error) {
            // Check if it's a unique constraint violation (user already reviewed this provider)
            if (error.code === '23505') {
                return NextResponse.json(
                    { error: 'Ya has dejado una reseña para este técnico' },
                    { status: 400 }
                );
            }

            console.error('Error creating review:', error);
            return NextResponse.json(
                { error: 'Error al crear la reseña' },
                { status: 500 }
            );
        }

        // Update provider's average rating and review count
        const { data: allReviews } = await supabase
            .from('reviews')
            .select('rating')
            .eq('provider_id', provider_id);

        if (allReviews && allReviews.length > 0) {
            const avgRating = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;

            await supabase
                .from('service_providers')
                .update({
                    rating: Number(avgRating.toFixed(1)),
                    review_count: allReviews.length,
                })
                .eq('id', provider_id);
        }

        return NextResponse.json(review, { status: 201 });
    } catch (error) {
        console.error('Error in POST /api/reviews:', error);
        return NextResponse.json(
            { error: 'Error interno del servidor' },
            { status: 500 }
        );
    }
}
