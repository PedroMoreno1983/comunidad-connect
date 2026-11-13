import type { ServiceProvider } from '@/lib/types';

/**
 * Qué puede cambiar quien edita un perfil de proveedor (el propio maestro, por
 * su panel o por su enlace, o la administración). Verificación, nota y trabajos
 * no están aquí: los maneja la administración (y la base lo impide además con
 * service_providers_guard).
 */

const AVAILABILITY: ServiceProvider['availability'][] = ['available', 'busy', 'unavailable'];

function text(value: unknown, max: number) {
    return typeof value === 'string' ? value.trim().slice(0, max) : undefined;
}

function list(value: unknown) {
    if (!Array.isArray(value)) return undefined;
    return value.map(item => (typeof item === 'string' ? item.trim().slice(0, 80) : '')).filter(Boolean).slice(0, 12);
}

function amount(value: unknown, max: number) {
    if (value === null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= max ? Math.round(parsed) : undefined;
}

export function providerProfileUpdate(body: Record<string, unknown>): { update: Record<string, unknown> } | { error: string } {
    const update: Record<string, unknown> = {};

    const name = text(body.name, 120);
    if (name !== undefined) {
        if (name.length < 2) return { error: 'El nombre es obligatorio.' };
        update.name = name;
    }
    const phone = text(body.contactPhone, 40);
    if (phone !== undefined) {
        if (phone.replace(/\D/g, '').length < 8) return { error: 'Indica un teléfono de contacto válido.' };
        update.contact_phone = phone;
    }
    const email = text(body.email, 160);
    if (email !== undefined) {
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'El correo no es válido.' };
        update.email = email || null;
    }
    const bio = text(body.bio, 1200);
    if (bio !== undefined) update.bio = bio;
    const responseTime = text(body.responseTime, 60);
    if (responseTime !== undefined) update.response_time = responseTime || '< 24 horas';
    const address = text(body.serviceAddress, 160);
    if (address !== undefined) update.service_address = address || null;

    const specialties = list(body.specialties);
    if (specialties !== undefined) update.specialties = specialties;
    const certifications = list(body.certifications);
    if (certifications !== undefined) update.certifications = certifications;

    if (body.yearsExperience !== undefined) {
        const years = amount(body.yearsExperience, 70);
        if (years === undefined) return { error: 'Los años de experiencia deben ser un número entre 0 y 70.' };
        update.years_experience = years ?? 0;
    }
    if (body.hourlyRate !== undefined) {
        const rate = amount(body.hourlyRate, 10_000_000);
        if (rate === undefined) return { error: 'La tarifa debe ser un número en pesos.' };
        update.hourly_rate = rate;
    }
    if (body.availability !== undefined) {
        if (!AVAILABILITY.includes(body.availability as ServiceProvider['availability'])) return { error: 'Disponibilidad no válida.' };
        update.availability = body.availability;
    }

    if (Object.keys(update).length === 0) return { error: 'No hay cambios para guardar.' };
    return { update };
}
