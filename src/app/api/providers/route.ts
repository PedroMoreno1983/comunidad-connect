import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';

const VALID_CATEGORIES = ['plumbing', 'electrical', 'locksmith', 'cleaning', 'general'] as const;
type ProviderCategory = typeof VALID_CATEGORIES[number];

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

function cleanNumber(value: unknown, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function cleanStringList(value: unknown, maxItems = 12) {
    if (!Array.isArray(value)) return [];
    return value
        .map(item => cleanText(item, 80))
        .filter(Boolean)
        .slice(0, maxItems);
}

export async function POST(request: NextRequest) {
    try {
        const supabaseUser = await getSupabaseUserClient();
        const { data: { user }, error: authError } = await supabaseUser.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const body = await request.json();
        const name = cleanText(body.name, 120);
        const category = cleanText(body.category, 40) as ProviderCategory;
        const contactPhone = cleanText(body.contactPhone, 40);
        const email = cleanText(body.email, 160);

        if (!name || !category || !contactPhone) {
            return NextResponse.json(
                { error: 'Faltan campos obligatorios (nombre, categoria o telefono)' },
                { status: 400 }
            );
        }

        if (!VALID_CATEGORIES.includes(category)) {
            return NextResponse.json({ error: 'Categoria no valida' }, { status: 400 });
        }

        const { data: profile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('id, name, email, role, community_id')
            .eq('id', user.id)
            .single();

        if (profileError || !profile) {
            return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 403 });
        }

        if (profile.email?.toLowerCase().endsWith('@demo.com')) {
            return NextResponse.json(
                { error: 'Modo demo compartido: el registro real de proveedores esta deshabilitado.' },
                { status: 403 }
            );
        }

        const { data: existingProvider } = await supabaseAdmin
            .from('service_providers')
            .select('id')
            .eq('user_id', profile.id)
            .maybeSingle();

        if (existingProvider) {
            return NextResponse.json(
                { error: 'Ya existe un perfil de proveedor asociado a tu usuario.' },
                { status: 409 }
            );
        }

        const { data: provider, error: insertError } = await supabaseAdmin
            .from('service_providers')
            .insert({
                name,
                category,
                contact_phone: contactPhone,
                email: email || null,
                photo: cleanText(body.photo, 2_000_000) || null,
                bio: cleanText(body.bio, 1200),
                years_experience: Math.round(cleanNumber(body.yearsExperience)),
                specialties: cleanStringList(body.specialties),
                certifications: cleanStringList(body.certifications),
                hourly_rate: cleanNumber(body.hourlyRate),
                availability: 'available',
                response_time: cleanText(body.responseTime, 60) || 'N/A',
                rating: 0,
                review_count: 0,
                completed_jobs: 0,
                verified: false,
                user_id: profile.id,
                community_id: profile.community_id,
            })
            .select('id, name, category, rating, review_count, contact_phone, email, photo, bio, years_experience, specialties, certifications, hourly_rate, availability, response_time, completed_jobs, verified')
            .single();

        if (insertError || !provider) {
            return NextResponse.json(
                { error: insertError?.message || 'No se pudo crear proveedor' },
                { status: 500 }
            );
        }

        await supabaseAdmin.from('notifications').insert({
            user_id: profile.id,
            type: 'success',
            category: 'service_provider',
            title: 'Perfil de tecnico creado',
            body: 'Tu perfil quedo registrado y pendiente de verificacion.',
            link: `/services/provider/${provider.id}`,
            community_id: profile.community_id,
        });

        return NextResponse.json({
            id: provider.id,
            name: provider.name,
            category: provider.category,
            rating: provider.rating,
            reviewCount: provider.review_count,
            contactPhone: provider.contact_phone,
            email: provider.email,
            photo: provider.photo,
            bio: provider.bio,
            yearsExperience: provider.years_experience,
            specialties: provider.specialties,
            certifications: provider.certifications,
            hourlyRate: provider.hourly_rate,
            availability: provider.availability,
            responseTime: provider.response_time,
            completedJobs: provider.completed_jobs,
            verified: provider.verified,
        }, { status: 201 });
    } catch (error: unknown) {
        console.warn('Error in POST /api/providers:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Error interno del servidor al crear proveedor' },
            { status: 500 }
        );
    }
}
