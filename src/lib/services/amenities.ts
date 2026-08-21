/**
 * AmenitiesService: instalaciones comunes y reservas.
 *
 * Extraído de `src/lib/api.ts`, que reexporta estos servicios para no
 * romper a quienes los importan desde `@/lib/api`.
 * Ver docs/deuda-arquitectonica.md.
 */

import { supabase } from '../supabase';
import type {
    AdminBooking,
    Amenity,
    Booking,
    CreateAmenityInput,
} from '../types';

export type AmenityDatabaseRow = {
    id?: string | null;
    name?: string | null;
    description?: string | null;
    max_capacity?: number | string | null;
    maxCapacity?: number | string | null;
    hourly_rate?: number | string | null;
    hourlyRate?: number | string | null;
    icon_name?: string | null;
    iconName?: string | null;
    gradient?: string | null;
    is_active?: boolean | null;
};

export type BookingDatabaseRow = {
    id?: string | null;
    amenity_id?: string | null;
    amenityId?: string | null;
    user_id?: string | null;
    userId?: string | null;
    date?: string | null;
    start_time?: string | null;
    startTime?: string | null;
    end_time?: string | null;
    endTime?: string | null;
    status?: string | null;
};

export function mapAmenity(row: AmenityDatabaseRow): Amenity {
    return {
        id: String(row.id || ""),
        name: String(row.name || "Espacio común"),
        description: String(row.description || "Disponible para residentes de la comunidad."),
        maxCapacity: Number(row.max_capacity ?? row.maxCapacity ?? 0),
        hourlyRate: Number(row.hourly_rate ?? row.hourlyRate ?? 0),
        iconName: String(row.icon_name ?? row.iconName ?? "Calendar"),
        gradient: String(row.gradient || "from-[#3B82F6] to-[#6D28D9]"),
    };
}

export function mapBooking(row: BookingDatabaseRow): Booking {
    return {
        id: String(row.id || ""),
        amenityId: String(row.amenity_id ?? row.amenityId ?? ""),
        userId: String(row.user_id ?? row.userId ?? ""),
        date: String(row.date || ""),
        startTime: String(row.start_time ?? row.startTime ?? ""),
        endTime: String(row.end_time ?? row.endTime ?? ""),
        status: (row.status === "pending" || row.status === "cancelled" ? row.status : "confirmed"),
    };
}

// ==========================================
// AMENITIES & BOOKINGS
// ==========================================
async function sendBookingConfirmation(payload: {
    bookingId: string;
}) {
    return fetch('/api/email/booking-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

export const AmenitiesService = {
    async getAmenities(): Promise<Amenity[]> {
        const { data, error } = await supabase
            .from('amenities')
            .select('*')
            .order('name');

        if (error) {
            console.error("Error fetching amenities:", error);
            throw error;
        }
        return ((data || []) as AmenityDatabaseRow[])
            .filter(amenity => amenity.is_active !== false)
            .map(mapAmenity);
    },

    async createAmenity(input: CreateAmenityInput) {
        const payload: Record<string, unknown> = {
            name: input.name,
            description: input.description,
            max_capacity: input.maxCapacity,
            hourly_rate: input.hourlyRate,
            icon_name: input.iconName,
            gradient: input.gradient,
            is_active: true,
        };
        if (input.communityId) payload.community_id = input.communityId;

        const { data, error } = await supabase
            .from('amenities')
            .insert(payload)
            .select('*')
            .single();

        if (error) {
            console.error("Error creating amenity:", error);
            throw error;
        }

        return mapAmenity(data as AmenityDatabaseRow);
    },

    async getAllBookings(): Promise<Booking[]> {
        const { data, error } = await supabase
            .from('bookings')
            .select('*, amenities(name, icon_name, gradient)')
            .order('date', { ascending: false })
            .order('start_time', { ascending: false });

        if (error) {
            console.error("Error fetching all bookings:", error);
            throw error;
        }
        return ((data || []) as BookingDatabaseRow[]).map(mapBooking);
    },

    async getAdminBookings(): Promise<AdminBooking[]> {
        const { data, error } = await supabase
            .from('bookings')
            .select(`
                id, date, start_time, end_time, status, created_at,
                profiles:user_id (name, email),
                amenities:amenity_id (name, icon_name, gradient)
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return (data || []) as unknown as AdminBooking[];
    },

    async updateBookingStatus(id: string, status: AdminBooking["status"]) {
        const { error } = await supabase
            .from('bookings')
            .update({ status })
            .eq('id', id);

        if (error) throw error;
    },

    async getBookings(userId: string): Promise<Booking[]> {
        const { data, error } = await supabase
            .from('bookings')
            .select('*, amenities(name, icon_name, gradient)')
            .eq('user_id', userId)
            .order('date', { ascending: false })
            .order('start_time', { ascending: false });

        if (error) {
            console.error("Error fetching bookings:", error);
            throw error;
        }
        return ((data || []) as BookingDatabaseRow[]).map(mapBooking);
    },

    async createBooking(bookingData: {
        amenity_id: string;
        user_id: string;
        date: string;
        start_time: string;
        end_time: string;
    }) {
        // Bloqueo de topes: no se permite una reserva confirmada del mismo espacio
        // y día cuyo horario se pise con otra. Antes no existía y dos personas
        // podían reservar el mismo bloque. Los horarios son HH:MM (24h, con cero a
        // la izquierda), así que la comparación de strings equivale a la temporal.
        const { data: sameDay, error: overlapError } = await supabase
            .from('bookings')
            .select('start_time, end_time')
            .eq('amenity_id', bookingData.amenity_id)
            .eq('date', bookingData.date)
            .eq('status', 'confirmed');
        if (overlapError) {
            console.error('Error checking booking overlap:', overlapError);
            throw overlapError;
        }
        const clashes = (sameDay ?? []).some((existing: { start_time: string | null; end_time: string | null }) =>
            bookingData.start_time < String(existing.end_time)
            && bookingData.end_time > String(existing.start_time));
        if (clashes) {
            throw new Error('Ese espacio ya está reservado en ese horario. Elige otro bloque disponible.');
        }

        const { data, error } = await supabase
            .from('bookings')
            .insert({
                ...bookingData,
                status: 'confirmed'
            })
            .select('*, amenities(name)')
            .single();

        if (error) {
            console.error("Error creating booking:", error);
            const bookingError = error as { code?: string };
            if (bookingError.code === '23P01') {
                throw new Error('Ese espacio ya está reservado en ese horario. Elige otro bloque disponible.');
            }
            throw error;
        }

        // El servidor resuelve destinatario y detalles desde la reserva creada.
        try {
            await sendBookingConfirmation({ bookingId: String(data.id) });
        } catch (emailError) {
            // El email falla silenciosamente — la reserva ya fue creada
            console.warn('[Email] Booking confirmation failed to send:', emailError);
        }

        return mapBooking(data as BookingDatabaseRow);
    }
};
