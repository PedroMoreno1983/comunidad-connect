import { supabase } from './supabase';
import { Unit, WaterReading, MarketplaceItem } from './types';
import { sendBookingConfirmation } from './email';

// ==========================================
// Water Consumption API
// ==========================================

export const WaterService = {
    // Obtener lecturas de una unidad específica
    async getReadingsByUnit(unitId: string) {
        const { data, error } = await supabase
            .from('water_readings')
            .select('*')
            .eq('unit_id', unitId)
            .order('reading_date', { ascending: true }); // Ordenar por fecha

        if (error) throw error;
        return data as WaterReading[];
    },

    // Guardar una nueva lectura (Admin)
    async saveReading(reading: Partial<WaterReading>) {
        const { data, error } = await supabase
            .from('water_readings')
            .insert(reading)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    // Obtener todas las unidades (con sus perfiles de residentes si existen)
    async getUnits() {
        const { data, error } = await supabase
            .from('units')
            .select(`
                *,
                profiles:owner_id (name, email)
            `)
            .order('tower', { ascending: true })
            .order('number', { ascending: true });

        if (error) {
            console.error('Error loading units:', error);
            // Return empty array instead of throwing so the page shows empty state
            return [] as (Unit & { profiles: { name: string; email: string; } | null })[];
        }
        return (data || []) as (Unit & { profiles: { name: string; email: string; } | null })[];
    },

    // Crear nueva unidad
    async createUnit(unit: Partial<Unit>) {
        const { data, error } = await supabase
            .from('units')
            .insert(unit)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    // Asignar residente a unidad (Actualiza units y opcionalmente user metadata si fuese necesario, 
    // pero por ahora la fuente de verdad es la tabla units)
    async assignResident(unitId: string, residentId: string | null) {
        const { error } = await supabase
            .from('units')
            .update({ owner_id: residentId })
            .eq('id', unitId);

        if (error) throw error;
    },

    // Obtener lista de perfiles (para dropdown de asignación)
    async getProfiles() {
        const { data, error } = await supabase
            .from('profiles')
            .select('id, name, email, role')
            .order('name', { ascending: true });

        if (error) throw error;
        return data;
    },

    // Obtener el promedio de consumo del edificio (para comparación)
    async getBuildingAverage(month: string, year: number) {
        const { data, error } = await supabase
            .from('water_readings')
            .select('reading_value')
            .eq('month', month)
            .eq('year', year);

        if (error) throw error;
        if (!data || data.length === 0) return 0;

        // Calcular consumo promedio (simplificado: asume lectura es consumo directo por ahora)
        // En realidad deberíamos restar lectura anterior, pero para MVP está bien.
        const total = data.reduce((acc: number, curr: Record<string, unknown>) => acc + (Number(curr.reading_value) || 0), 0);
        return total / data.length;
    }
};

// ==========================================
// Marketplace API
// ==========================================

type MarketplaceRow = Record<string, unknown>;

function mapMarketplaceItem(row: MarketplaceRow): MarketplaceItem {
    const imageUrl = (row.image_url as string | null | undefined) ?? (row.imageUrl as string | undefined);
    const images = Array.isArray(row.images)
        ? (row.images as string[])
        : imageUrl
            ? [imageUrl]
            : [];

    return {
        id: row.id as string,
        title: row.title as string,
        description: row.description as string,
        price: Number(row.price) || 0,
        category: row.category as MarketplaceItem['category'],
        sellerId: (row.seller_id as string | undefined) ?? (row.sellerId as string),
        imageUrl,
        images,
        status: ((row.status as MarketplaceItem['status'] | undefined) || 'available'),
        allowSale: (row.allow_sale as boolean | undefined) ?? (row.allowSale as boolean | undefined) ?? true,
        allowSwap: (row.allow_swap as boolean | undefined) ?? (row.allowSwap as boolean | undefined) ?? false,
        swapDetails: (row.swap_details as string | undefined) ?? (row.swapDetails as string | undefined) ?? '',
        allowBarter: (row.allow_barter as boolean | undefined) ?? (row.allowBarter as boolean | undefined) ?? false,
        barterDetails: (row.barter_details as string | undefined) ?? (row.barterDetails as string | undefined) ?? '',
        paymentStatus: (row.payment_status as MarketplaceItem['paymentStatus'] | undefined) ?? (row.paymentStatus as MarketplaceItem['paymentStatus'] | undefined) ?? 'none',
        createdAt: (row.created_at as string | undefined) ?? (row.createdAt as string) ?? new Date().toISOString(),
    };
}

function isMissingMarketplaceColumnError(error: { message?: string; code?: string } | null): boolean {
    if (!error) return false;
    const message = error.message?.toLowerCase() ?? '';
    return error.code === 'PGRST204' || error.code === '42703' || message.includes('allow_sale') || message.includes('images');
}

export const MarketplaceService = {
    // Obtener todos los productos activos
    async getItemsV2(): Promise<MarketplaceItem[]> {
        const { data, error } = await supabase
            .from('marketplace_items')
            .select('*')
            .neq('status', 'hidden')
            .order('created_at', { ascending: false });

        if (error) {
            console.error("Supabase error in getItemsV2:", error.message);
            throw error;
        }
        return (data || []).map(mapMarketplaceItem);
    },

    async getMyItems(userId: string): Promise<MarketplaceItem[]> {
        const { data, error } = await supabase
            .from('marketplace_items')
            .select('*')
            .eq('seller_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return (data || []).map(mapMarketplaceItem);
    },

    async getModerationItems(): Promise<MarketplaceItem[]> {
        const { data, error } = await supabase
            .from('marketplace_items')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return (data || []).map(mapMarketplaceItem);
    },

    // Publicar un nuevo producto con fotos
    async createItem(item: Partial<MarketplaceItem>, imageFiles: File[]): Promise<MarketplaceItem> {
        const imageUrls: string[] = [];
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) throw new Error("Debes estar autenticado para publicar");

        const { data: profile } = await supabase
            .from('profiles')
            .select('community_id')
            .eq('id', user.id)
            .single();

        // 1. Subir imágenes si existen
        for (const file of imageFiles) {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random()}.${fileExt}`;
            const filePath = `${user.id}/${fileName}`; // Organizado por carpeta de usuario

            const { error: uploadError } = await supabase.storage
                .from('marketplace')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('marketplace')
                .getPublicUrl(filePath);

            imageUrls.push(publicUrl);
        }

        const payload = {
            title: item.title,
            description: item.description,
            price: Number(item.price) || 0,
            category: item.category,
            image_url: imageUrls.length > 0 ? imageUrls[0] : null,
            images: imageUrls,
            allow_sale: item.allowSale !== false,
            allow_swap: Boolean(item.allowSwap),
            swap_details: item.swapDetails || '',
            allow_barter: Boolean(item.allowBarter),
            barter_details: item.barterDetails || '',
            payment_status: 'none',
            community_id: (profile as { community_id?: string | null } | null)?.community_id,
            seller_id: user.id
        };

        // 2. Insertar item en la DB
        let result = await supabase
            .from('marketplace_items')
            .insert(payload)
            .select()
            .single();

        if (isMissingMarketplaceColumnError(result.error)) {
            result = await supabase
                .from('marketplace_items')
                .insert({
                    title: payload.title,
                    description: payload.description,
                    price: payload.price,
                    category: payload.category,
                    image_url: payload.image_url,
                    seller_id: payload.seller_id
                })
                .select()
                .single();
        }

        const { data, error } = result;

        if (error) {
            console.error("Supabase error in createItem:", error.message, error.details);
            throw error;
        }
        return mapMarketplaceItem(data);
    },

    // Marcar como vendido o inactivar
    async updateStatus(itemId: string, status: 'available' | 'reserved' | 'sold') {
        const { error } = await supabase
            .from('marketplace_items')
            .update({ status })
            .eq('id', itemId);

        if (error) throw error;
    },

    async diagnosticStorage() {
        const { data, error } = await supabase.storage.listBuckets();
        if (error) return { error: error.message };
        return { buckets: data.map((b: { name: string }) => b.name) };
    }
};

// ==========================================
// AMENITIES & BOOKINGS
// ==========================================
export const AmenitiesService = {
    async getAmenities() {
        const { data, error } = await supabase
            .from('amenities')
            .select('*')
            .order('name');

        if (error) {
            console.error("Error fetching amenities:", error);
            throw error;
        }
        return (data || []).filter((amenity: Record<string, unknown>) => amenity.is_active !== false);
    },

    async getAllBookings() {
        const { data, error } = await supabase
            .from('bookings')
            .select('*, amenities(name, icon_name, gradient)')
            .order('date', { ascending: false })
            .order('start_time', { ascending: false });

        if (error) {
            console.error("Error fetching all bookings:", error);
            throw error;
        }
        return data;
    },

    async getBookings(userId: string) {
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
        return data;
    },

    async createBooking(bookingData: {
        amenity_id: string;
        user_id: string;
        date: string;
        start_time: string;
        end_time: string;
    }) {
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
            throw error;
        }

        // Disparar email de confirmación (no bloquea si falla)
        try {
            const { data: profile } = await supabase
                .from('profiles')
                .select('email, name')
                .eq('id', bookingData.user_id)
                .single();

            if (profile?.email) {
                await sendBookingConfirmation({
                    to: profile.email,
                    residentName: profile.name || 'Residente',
                    amenityName: (data as { amenities?: { name: string } }).amenities?.name || 'Instalación',
                    date: bookingData.date,
                    startTime: bookingData.start_time,
                    endTime: bookingData.end_time,
                });
            }
        } catch (emailError) {
            // El email falla silenciosamente — la reserva ya fue creada
            console.warn('[Email] Booking confirmation failed to send:', emailError);
        }

        return data;
    }
};

// ==========================================
// POLLS & VOTING
// ==========================================
export const PollsService = {
    async getActivePolls() {
        const { data: polls, error } = await supabase
            .from('polls')
            .select(`
                *,
                options:poll_options(*),
                votes:votes(option_id)
            `)
            .eq('status', 'active')
            .order('created_at', { ascending: false });

        if (error) {
            console.error("Error fetching polls:", error);
            throw error;
        }

        return polls;
    },

    async getClosedPolls() {
        const { data: polls, error } = await supabase
            .from('polls')
            .select(`
                *,
                options:poll_options(*),
                votes:votes(option_id)
            `)
            .eq('status', 'closed')
            .order('end_date', { ascending: false });

        if (error) {
            console.error("Error fetching closed polls:", error);
            throw error;
        }

        return polls;
    },

    async submitVote(pollId: string, optionId: string, userId: string) {
        // En modo Demo, el userId es un UUID quemado (ej. Pedro Dueño)
        const { data, error } = await supabase
            .from('votes')
            .insert({
                poll_id: pollId,
                option_id: optionId,
                user_id: userId
            })
            .select()
            .single();

        if (error) {
            console.error("Error submitting vote:", error);
            throw error;
        }

        return data;
    },

    async hasUserVoted(pollId: string, userId: string) {
        const { data, error } = await supabase
            .from('votes')
            .select('id, option_id')
            .eq('poll_id', pollId)
            .eq('user_id', userId)
            .maybeSingle();

        if (error) {
            console.error("Error checking vote status:", error);
            return null; // Asumir no votado en caso de error para no bloquear UI brutalmente
        }
        return data;
    }
};

// ==========================================
// EXPENSES (GASTOS COMUNES)
// ==========================================
export const ExpensesService = {
    // Fetch expenses for a specific unit, automatically joining items
    async getExpenses(unitId: string) {
        const { data, error } = await supabase
            .from('expenses')
            .select(`
                *,
                items:expense_items(*)
            `)
            .eq('unit_id', unitId)
            .order('month', { ascending: false });

        if (error) {
            console.error("Error fetching expenses:", error);
            throw error;
        }

        return data;
    },

    // Process a payment for a specific expense with Haulmer tax compliance
    async payExpense(expenseId: string, taxData?: { rut: string; type: 'boleta' | 'factura'; business_type?: string }) {
        const { data, error } = await supabase
            .from('expenses')
            .update({
                status: 'paid',
                paid_at: new Date().toISOString(),
                payment_metadata: {
                    ...taxData,
                    processor: 'haulmer',
                    issued_tax_doc: true
                }
            })
            .eq('id', expenseId)
            .select()
            .single();

        if (error) {
            console.error("Error processing payment:", error);
            throw error;
        }

        return data;
    }
};

// ==========================================
// FEED / ANUNCIOS (ANNOUNCEMENTS)
// ==========================================
export const AnnouncementsService = {
    async getAnnouncements() {
        const { data, error } = await supabase
            .from('announcements')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    },

    async createAnnouncement(announcementData: { title: string; content: string; priority: 'info' | 'alert' | 'event'; author_id: string; author_name: string }) {
        const { data, error } = await supabase
            .from('announcements')
            .insert([{
                title: announcementData.title,
                content: announcementData.content,
                category: announcementData.priority,
                condo_id: '11111111-1111-1111-1111-111111111111'
            }])
            .select()
            .single();

        if (error) throw error;

        return {
            id: data.id,
            title: data.title,
            content: data.content,
            priority: data.category || announcementData.priority,
            author_name: announcementData.author_name,
            created_at: data.created_at
        };
    }
};
