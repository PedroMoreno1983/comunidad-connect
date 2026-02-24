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
        const { provider_id, preferred_date, preferred_time, description } = body;

        // Validate input
        if (!provider_id || !preferred_date || !preferred_time || !description) {
            return NextResponse.json(
                { error: 'Datos incompletos' },
                { status: 400 }
            );
        }

        // Insert the service request
        const { data: serviceRequest, error } = await supabase
            .from('service_requests')
            .insert({
                provider_id,
                user_id: session.user.id,
                preferred_date,
                preferred_time,
                description,
                status: 'pending',
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating service request:', error);
            return NextResponse.json(
                { error: 'Error al crear la solicitud' },
                { status: 500 }
            );
        }

        return NextResponse.json(serviceRequest, { status: 201 });
    } catch (error) {
        console.error('Error in POST /api/service-requests:', error);
        return NextResponse.json(
            { error: 'Error interno del servidor' },
            { status: 500 }
        );
    }
}

// GET endpoint to fetch user's service requests
export async function GET(request: NextRequest) {
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

        // Fetch user's service requests with provider info
        const { data: requests, error } = await supabase
            .from('service_requests')
            .select(`
        *,
        service_providers (
          id,
          name,
          category,
          contact_phone
        )
      `)
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching service requests:', error);
            return NextResponse.json(
                { error: 'Error al obtener solicitudes' },
                { status: 500 }
            );
        }

        return NextResponse.json(requests);
    } catch (error) {
        console.error('Error in GET /api/service-requests:', error);
        return NextResponse.json(
            { error: 'Error interno del servidor' },
            { status: 500 }
        );
    }
}
