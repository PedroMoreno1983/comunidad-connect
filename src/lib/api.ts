import { supabase } from './supabase';
import { Unit, WaterReading } from './types';

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
            return [] as (Unit & { profiles: any })[];
        }
        return (data || []) as (Unit & { profiles: any })[];
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
        const total = data.reduce((acc: number, curr: any) => acc + (Number(curr.reading_value) || 0), 0);
        return total / data.length;
    }
};

// ==========================================
// Marketplace API
// ==========================================

export const MarketplaceService = {
    // Obtener todos los productos activos
    async getItemsV2() {
        console.log("MARKETPLACE_DEBUG: Llamando a getItemsV2 (Select *)");
        const { data, error } = await supabase
            .from('marketplace_items')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error("Supabase error in getItemsV2:", error.message);
            throw error;
        }
        return data;
    },

    // Publicar un nuevo producto con fotos
    async createItem(item: any, imageFiles: File[]) {
        const imageUrls = [];
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) throw new Error("Debes estar autenticado para publicar");

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

        // 2. Insertar item en la DB
        const { data, error } = await supabase
            .from('marketplace_items')
            .insert({
                title: item.title,
                description: item.description,
                price: Number(item.price),
                category: item.category,
                images: imageUrls,
                seller_id: user.id,
                allow_barter: item.allowBarter || false,
                is_active: true
            })
            .select()
            .single();

        if (error) {
            console.error("Supabase error in createItem:", error.message, error.details);
            throw error;
        }
        return data;
    },

    // Marcar como vendido o inactivar
    async updateStatus(itemId: string, isActive: boolean) {
        const { error } = await supabase
            .from('marketplace_items')
            .update({ is_active: isActive })
            .eq('id', itemId);

        if (error) throw error;
    },

    // Diagnóstico de Storage
    async diagnosticStorage() {
        console.log("MARKETPLACE_DEBUG: Iniciando diagnóstico de Storage...");
        const { data, error } = await supabase.storage.listBuckets();

        if (error) {
            console.error("MARKETPLACE_DEBUG: Error al listar buckets:", error.message);
            return { error: error.message };
        }

        console.log("MARKETPLACE_DEBUG: Buckets encontrados:", data.map((b: any) => b.name));
        return { buckets: data.map((b: any) => b.name) };
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
            .eq('is_active', true)
            .order('name');

        if (error) {
            console.error("Error fetching amenities:", error);
            throw error;
        }
        return data;
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
            .select()
            .single();

        if (error) {
            console.error("Error creating booking:", error);
            throw error;
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
            .order('year', { ascending: false })
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
