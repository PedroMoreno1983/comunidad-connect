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
        const {
            name,
            category,
            contactPhone,
            email,
            photo,
            bio,
            yearsExperience,
            specialties,
            certifications,
            hourlyRate,
        } = body;

        // Insert the provider
        const { data: provider, error } = await supabase
            .from('service_providers')
            .insert({
                user_id: session.user.id,
                name,
                category,
                contact_phone: contactPhone,
                email: email || session.user.email,
                photo: photo || null,
                bio,
                years_experience: yearsExperience,
                specialties: Array.isArray(specialties) ? specialties : [],
                certifications: Array.isArray(certifications) ? certifications : [],
                hourly_rate: hourlyRate,
                availability: 'available',
                response_time: '< 24 horas',
                rating: 5.0,
                completed_jobs: 0,
                verified: false,
                review_count: 0,
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating provider:', error);
            return NextResponse.json(
                { error: 'Error al crear el técnico' },
                { status: 500 }
            );
        }

        return NextResponse.json(provider, { status: 201 });
    } catch (error) {
        console.error('Error in POST /api/providers:', error);
        return NextResponse.json(
            { error: 'Error interno del servidor' },
            { status: 500 }
        );
    }
}
