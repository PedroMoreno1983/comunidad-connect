import { NextResponse } from 'next/server';
import { providersService } from '@/lib/services/providersService';

export async function POST(request: Request) {
    try {
        const body = await request.json();

        // Validate basic required fields
        if (!body.name || !body.category || !body.contactPhone) {
            return NextResponse.json(
                { error: 'Faltan campos obligatorios (nombre, categoría o teléfono)' },
                { status: 400 }
            );
        }

        // Map expected form data to database schema fields
        // ensure default arrays if null
        const providerData = {
            name: body.name,
            category: body.category,
            contact_phone: body.contactPhone,
            email: body.email || null,
            bio: body.bio || null,
            years_experience: body.yearsExperience || 0,
            specialties: Array.isArray(body.specialties) ? body.specialties : [],
            certifications: Array.isArray(body.certifications) ? body.certifications : [],
            hourly_rate: body.hourlyRate || 0,
            verified: false, // Default newly registered to unverified
        };

        const newProvider = await providersService.create(providerData as any);

        return NextResponse.json(newProvider, { status: 201 });
    } catch (error: any) {
        console.error('Error in POST /api/providers:', error);
        return NextResponse.json(
            { error: error.message || 'Error interno del servidor al crear proveedor' },
            { status: 500 }
        );
    }
}
