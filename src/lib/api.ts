import { supabase } from './supabase';
import { Unit, WaterReading, MarketplaceItem } from './types';

async function sendBookingConfirmation(payload: {
    to: string;
    residentName: string;
    amenityName: string;
    date: string;
    startTime: string;
    endTime: string;
}) {
    return fetch('/api/email/booking-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

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
            `);

        if (error) {
            console.error('Error loading units:', error);
            // Return empty array instead of throwing so the page shows empty state
            return [] as (Unit & { profiles: { name: string; email: string; } | null })[];
        }
        return ((data || []) as (Unit & { profiles: { name: string; email: string; } | null })[])
            .sort((a, b) => {
                const rowA = a as unknown as Record<string, unknown>;
                const rowB = b as unknown as Record<string, unknown>;
                const towerA = String(rowA.tower || "");
                const towerB = String(rowB.tower || "");
                const numberA = String(rowA.number || rowA.unit_number || "");
                const numberB = String(rowB.number || rowB.unit_number || "");
                return towerA.localeCompare(towerB, "es") || numberA.localeCompare(numberB, "es", { numeric: true });
            });
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
        type AverageReadingRow = { unit_id: string | number | null; reading_value: string | number | null };
        const monthNames = [
            'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
        ];
        const monthIndex = monthNames.findIndex(item => item.toLowerCase() === month.toLowerCase());
        const previousDate = monthIndex >= 0
            ? new Date(year, monthIndex - 1, 1)
            : new Date(year, new Date().getMonth() - 1, 1);
        const previousMonth = monthNames[previousDate.getMonth()];
        const previousYear = previousDate.getFullYear();

        const { data: currentReadings, error: currentError } = await supabase
            .from('water_readings')
            .select('unit_id, reading_value')
            .eq('month', month)
            .eq('year', year);

        if (currentError) throw currentError;
        if (!currentReadings || currentReadings.length === 0) return 0;

        // Calcula consumo real comparando contra la lectura del periodo anterior.
        const { data: previousReadings, error: previousError } = await supabase
            .from('water_readings')
            .select('unit_id, reading_value')
            .eq('month', previousMonth)
            .eq('year', previousYear);

        if (previousError) throw previousError;

        const currentRows = currentReadings as AverageReadingRow[];
        const previousRows = (previousReadings || []) as AverageReadingRow[];
        const previousByUnit = new Map<string, number>(
            previousRows.map(row => [String(row.unit_id), Number(row.reading_value) || 0])
        );
        const consumptions = currentRows
            .map((row): number | null => {
                const currentValue = Number(row.reading_value) || 0;
                const previousValue = previousByUnit.get(String(row.unit_id));
                return previousValue === undefined ? null : Math.max(0, currentValue - previousValue);
            })
            .filter((value): value is number => value !== null);

        if (consumptions.length > 0) {
            const totalConsumption = consumptions.reduce((acc, value) => acc + value, 0);
            return totalConsumption / consumptions.length;
        }

        const fallbackTotal = currentRows.reduce((acc, curr) => acc + (Number(curr.reading_value) || 0), 0);
        return fallbackTotal / currentRows.length;
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
                votes:poll_votes(option_id)
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
                votes:poll_votes(option_id)
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
            .from('poll_votes')
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
            .from('poll_votes')
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
                priority: announcementData.priority,
                author_id: announcementData.author_id,
                author_name: announcementData.author_name
            }])
            .select()
            .single();

        if (error) throw error;

        return {
            id: data.id,
            title: data.title,
            content: data.content,
            priority: data.priority,
            author_name: data.author_name || announcementData.author_name,
            created_at: data.created_at
        };
    }
};
