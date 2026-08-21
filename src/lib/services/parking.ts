/**
 * ParkingService: estacionamientos, reservas, accesos y liquidaciones a propietarios.
 *
 * Extraído de `src/lib/api.ts`, que reexporta este servicio para no romper
 * a quienes lo importan desde `@/lib/api`. Ver docs/deuda-arquitectonica.md.
 */

import { supabase } from '../supabase';
import type {
    ParkingAccessEventType,
    ParkingAccessLookup,
    ParkingAvailabilityRule,
    ParkingBooking,
    ParkingBookingStatus,
    ParkingCommunitySettings,
    ParkingDriver,
    ParkingDriverInput,
    ParkingAccessRequest,
    ParkingAccessRequestStatus,
    ParkingCommunityAccess,
    ParkingFloorLevel,
    ParkingEarningsTransaction,
    ParkingMapLevel,
    ParkingMapSpot,
    ParkingOwnerEarnings,
    ParkingPassDetail,
    ParkingPaymentStatus,
    ParkingSearchResult,
    ParkingSpot,
    ParkingSpotInput,
    ParkingSpotStatus,
    ParkingVehicleSize,
} from '../types';

/* ── Estacionamientos ───────────────────────────────────────── */

type ParkingSpotRow = {
    id: string;
    community_id: string;
    owner_id: string;
    unit_label: string | null;
    label: string;
    description: string | null;
    access_notes?: string | null;
    vehicle_size: ParkingVehicleSize;
    floor_level: ParkingFloorLevel | null;
    is_covered: boolean;
    has_ev_charger: boolean;
    hourly_rate: number;
    daily_rate: number | null;
    monthly_rate: number | null;
    min_hours: number;
    allows_external: boolean;
    status: ParkingSpotStatus;
    rejection_reason: string | null;
    created_at: string;
    profiles?: { name?: string | null } | { name?: string | null }[] | null;
    parking_spot_availability?: ParkingAvailabilityRow[] | null;
};

type ParkingAvailabilityRow = {
    id: string;
    spot_id: string;
    weekday: number;
    start_time: string;
    end_time: string;
};

type ParkingBookingRow = {
    id: string;
    community_id: string;
    spot_id: string;
    driver_id: string;
    owner_id: string;
    driver_is_resident: boolean;
    starts_at: string;
    ends_at: string;
    total_amount: number;
    community_fee_amount: number;
    owner_payout_amount: number;
    status: ParkingBookingStatus;
    payment_status: ParkingPaymentStatus;
    access_code: string;
    cancellation_reason: string | null;
    created_at: string;
    parking_spots?: { label?: string | null; unit_label?: string | null } | { label?: string | null; unit_label?: string | null }[] | null;
    parking_drivers?: { full_name?: string | null; plate?: string | null } | { full_name?: string | null; plate?: string | null }[] | null;
};

type ParkingSearchRow = {
    spot_id: string;
    community_id: string;
    community_name: string;
    label: string;
    unit_label: string | null;
    description: string | null;
    vehicle_size: ParkingVehicleSize;
    floor_level: ParkingFloorLevel | null;
    is_covered: boolean;
    has_ev_charger: boolean;
    hourly_rate: number;
    daily_rate: number | null;
    monthly_rate: number | null;
    min_hours: number;
    owner_name: string;
    quoted_amount: number;
};

type ParkingAccessLookupRow = {
    booking_id: string;
    spot_label: string;
    unit_label: string | null;
    driver_name: string;
    driver_phone: string;
    driver_national_id: string | null;
    plate: string;
    vehicle_description: string | null;
    driver_is_resident: boolean;
    starts_at: string;
    ends_at: string;
    status: ParkingBookingStatus;
    is_valid_now: boolean;
    last_event: ParkingAccessEventType | null;
};

type ParkingDriverRow = {
    id: string;
    user_id: string;
    profile_id: string | null;
    full_name: string;
    phone: string;
    national_id: string | null;
    plate: string;
    vehicle_description: string | null;
};

function mapParkingAvailability(row: ParkingAvailabilityRow): ParkingAvailabilityRule {
    return {
        id: row.id,
        spotId: row.spot_id,
        weekday: Number(row.weekday),
        startTime: String(row.start_time).slice(0, 5),
        endTime: String(row.end_time).slice(0, 5),
    };
}

function mapParkingSpot(row: ParkingSpotRow): ParkingSpot {
    const ownerProfile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
        id: row.id,
        communityId: row.community_id,
        ownerId: row.owner_id,
        ownerName: ownerProfile?.name || undefined,
        unitLabel: row.unit_label || '',
        label: row.label,
        description: row.description || '',
        accessNotes: row.access_notes ?? undefined,
        vehicleSize: row.vehicle_size,
        floorLevel: row.floor_level || 'S1',
        isCovered: row.is_covered,
        hasEvCharger: row.has_ev_charger,
        hourlyRate: Number(row.hourly_rate),
        dailyRate: row.daily_rate === null ? undefined : Number(row.daily_rate),
        monthlyRate: row.monthly_rate === null ? undefined : Number(row.monthly_rate),
        minHours: Number(row.min_hours),
        allowsExternal: row.allows_external,
        status: row.status,
        rejectionReason: row.rejection_reason || undefined,
        createdAt: row.created_at,
        availability: (row.parking_spot_availability || []).map(mapParkingAvailability),
    };
}

function mapParkingBooking(row: ParkingBookingRow): ParkingBooking {
    const spot = Array.isArray(row.parking_spots) ? row.parking_spots[0] : row.parking_spots;
    const driver = Array.isArray(row.parking_drivers) ? row.parking_drivers[0] : row.parking_drivers;
    return {
        id: row.id,
        communityId: row.community_id,
        spotId: row.spot_id,
        spotLabel: spot?.label || undefined,
        unitLabel: spot?.unit_label || undefined,
        driverId: row.driver_id,
        driverName: driver?.full_name || undefined,
        driverPlate: driver?.plate || undefined,
        ownerId: row.owner_id,
        driverIsResident: row.driver_is_resident,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        totalAmount: Number(row.total_amount),
        communityFeeAmount: Number(row.community_fee_amount),
        ownerPayoutAmount: Number(row.owner_payout_amount),
        status: row.status,
        paymentStatus: row.payment_status,
        accessCode: row.access_code,
        cancellationReason: row.cancellation_reason || undefined,
        createdAt: row.created_at,
    };
}

function mapParkingDriver(row: ParkingDriverRow): ParkingDriver {
    return {
        id: row.id,
        userId: row.user_id,
        profileId: row.profile_id || undefined,
        fullName: row.full_name,
        phone: row.phone,
        nationalId: row.national_id || undefined,
        plate: row.plate,
        vehicleDescription: row.vehicle_description || '',
    };
}

const PARKING_SPOT_COLUMNS =
    'id,community_id,owner_id,unit_label,label,description,access_notes,vehicle_size,floor_level,' +
    'is_covered,has_ev_charger,hourly_rate,daily_rate,monthly_rate,min_hours,allows_external,status,' +
    'rejection_reason,created_at';

const PARKING_BOOKING_COLUMNS =
    'id,community_id,spot_id,driver_id,owner_id,driver_is_resident,starts_at,ends_at,total_amount,' +
    'community_fee_amount,owner_payout_amount,status,payment_status,access_code,cancellation_reason,created_at';

/** Orden de arriba hacia abajo del edificio, como lo lee un conductor. */
const PARKING_LEVEL_ORDER: { id: ParkingFloorLevel; name: string }[] = [
    { id: 'EXT', name: 'Exterior / Superficie' },
    { id: 'PB', name: 'Planta Baja / Nivel 1' },
    { id: 'S1', name: 'Subterráneo -1' },
    { id: 'S2', name: 'Subterráneo -2' },
    { id: 'S3', name: 'Subterráneo -3' },
];

/**
 * Arma los niveles del plano. Solo devuelve los pisos que existen en la
 * comunidad: dibujar un subterráneo -3 vacío en un edificio que no lo tiene solo
 * confunde.
 */
function buildParkingMapLevels(byLevel: Map<ParkingFloorLevel, ParkingMapSpot[]>): ParkingMapLevel[] {
    return PARKING_LEVEL_ORDER.filter(level => (byLevel.get(level.id)?.length ?? 0) > 0).map(level => {
        const spots = byLevel.get(level.id) || [];
        return {
            levelId: level.id,
            name: level.name,
            totalSpots: spots.length,
            availableSpots: spots.filter(spot => spot.status === 'available').length,
            spots,
        };
    });
}

export const ParkingService = {
    /* — Conductor — */

    async getMyDriver(): Promise<ParkingDriver | null> {
        const { data: authData } = await supabase.auth.getUser();
        if (!authData?.user) return null;

        const { data, error } = await supabase
            .from('parking_drivers')
            .select('id,user_id,profile_id,full_name,phone,national_id,plate,vehicle_description')
            .eq('user_id', authData.user.id)
            .maybeSingle();

        if (error) throw error;
        return data ? mapParkingDriver(data as ParkingDriverRow) : null;
    },

    async saveMyDriver(input: ParkingDriverInput): Promise<string> {
        const { data, error } = await supabase.rpc('upsert_parking_driver', {
            p_full_name: input.fullName.trim(),
            p_phone: input.phone.trim(),
            p_plate: input.plate.trim(),
            p_vehicle_description: input.vehicleDescription?.trim() || '',
            p_national_id: input.nationalId?.trim() || null,
        });

        if (error) throw error;
        if (typeof data !== 'string') throw new Error('No se pudo registrar el vehículo.');
        return data;
    },

    /* — Estacionamientos del dueño — */

    async getMySpots(): Promise<ParkingSpot[]> {
        const { data: authData } = await supabase.auth.getUser();
        if (!authData?.user) return [];

        const { data, error } = await supabase
            .from('parking_spots')
            .select(`${PARKING_SPOT_COLUMNS},parking_spot_availability(id,spot_id,weekday,start_time,end_time)`)
            .eq('owner_id', authData.user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return ((data || []) as ParkingSpotRow[]).map(mapParkingSpot);
    },

    async createSpot(input: ParkingSpotInput): Promise<ParkingSpot> {
        const { data: authData } = await supabase.auth.getUser();
        if (!authData?.user) throw new Error('Debes iniciar sesión.');

        const { data, error } = await supabase
            .from('parking_spots')
            .insert({
                owner_id: authData.user.id,
                // El trigger enforce_parking_spot_rules sobrescribe community_id con la
                // comunidad real del dueño; se envía solo para satisfacer el NOT NULL.
                community_id: '00000000-0000-0000-0000-000000000000',
                label: input.label.trim(),
                description: input.description?.trim() || '',
                access_notes: input.accessNotes?.trim() || '',
                vehicle_size: input.vehicleSize,
                floor_level: input.floorLevel,
                is_covered: input.isCovered,
                has_ev_charger: input.hasEvCharger,
                hourly_rate: input.hourlyRate,
                daily_rate: input.dailyRate ?? null,
                monthly_rate: input.monthlyRate ?? null,
                min_hours: input.minHours,
                allows_external: input.allowsExternal,
                status: input.status || 'draft',
            })
            .select(PARKING_SPOT_COLUMNS)
            .single();

        if (error) throw error;
        return mapParkingSpot(data as ParkingSpotRow);
    },

    async updateSpot(spotId: string, input: Partial<ParkingSpotInput>): Promise<ParkingSpot> {
        const payload: Record<string, unknown> = {};
        if (input.label !== undefined) payload.label = input.label.trim();
        if (input.description !== undefined) payload.description = input.description.trim();
        if (input.accessNotes !== undefined) payload.access_notes = input.accessNotes.trim();
        if (input.vehicleSize !== undefined) payload.vehicle_size = input.vehicleSize;
        if (input.floorLevel !== undefined) payload.floor_level = input.floorLevel;
        if (input.isCovered !== undefined) payload.is_covered = input.isCovered;
        if (input.hasEvCharger !== undefined) payload.has_ev_charger = input.hasEvCharger;
        if (input.hourlyRate !== undefined) payload.hourly_rate = input.hourlyRate;
        if (input.dailyRate !== undefined) payload.daily_rate = input.dailyRate ?? null;
        if (input.monthlyRate !== undefined) payload.monthly_rate = input.monthlyRate ?? null;
        if (input.minHours !== undefined) payload.min_hours = input.minHours;
        if (input.allowsExternal !== undefined) payload.allows_external = input.allowsExternal;
        if (input.status !== undefined) payload.status = input.status;

        const { data, error } = await supabase
            .from('parking_spots')
            .update(payload)
            .eq('id', spotId)
            .select(PARKING_SPOT_COLUMNS)
            .single();

        if (error) throw error;
        return mapParkingSpot(data as ParkingSpotRow);
    },

    async deleteSpot(spotId: string): Promise<void> {
        const { error } = await supabase.from('parking_spots').delete().eq('id', spotId);
        if (error) throw error;
    },

    /**
     * Reemplaza por completo las ventanas de disponibilidad del cupo. Es más simple
     * y predecible que diferenciar altas y bajas desde el formulario.
     */
    async setAvailability(spotId: string, rules: Omit<ParkingAvailabilityRule, 'id' | 'spotId'>[]): Promise<void> {
        const { error: deleteError } = await supabase
            .from('parking_spot_availability')
            .delete()
            .eq('spot_id', spotId);
        if (deleteError) throw deleteError;

        if (rules.length === 0) return;

        const { error } = await supabase.from('parking_spot_availability').insert(
            rules.map(rule => ({
                spot_id: spotId,
                weekday: rule.weekday,
                start_time: rule.startTime,
                end_time: rule.endTime,
            })),
        );
        if (error) throw error;
    },

    /* — Búsqueda y reserva — */

    async search(startsAt: Date, endsAt: Date, communityId?: string): Promise<ParkingSearchResult[]> {
        const { data, error } = await supabase.rpc('search_parking_spots', {
            p_starts_at: startsAt.toISOString(),
            p_ends_at: endsAt.toISOString(),
            p_community_id: communityId ?? null,
        });

        if (error) throw error;
        return ((data || []) as ParkingSearchRow[]).map(row => ({
            spotId: row.spot_id,
            communityId: row.community_id,
            communityName: row.community_name,
            label: row.label,
            unitLabel: row.unit_label || '',
            description: row.description || '',
            vehicleSize: row.vehicle_size,
            floorLevel: row.floor_level || 'S1',
            isCovered: row.is_covered,
            hasEvCharger: row.has_ev_charger,
            hourlyRate: Number(row.hourly_rate),
            dailyRate: row.daily_rate === null ? undefined : Number(row.daily_rate),
            monthlyRate: row.monthly_rate === null ? undefined : Number(row.monthly_rate),
            minHours: Number(row.min_hours),
            ownerName: row.owner_name,
            quotedAmount: Number(row.quoted_amount),
        }));
    },

    async book(spotId: string, startsAt: Date, endsAt: Date): Promise<string> {
        const { data, error } = await supabase.rpc('create_parking_booking', {
            p_spot_id: spotId,
            p_starts_at: startsAt.toISOString(),
            p_ends_at: endsAt.toISOString(),
        });

        if (error) throw error;
        if (typeof data !== 'string') throw new Error('No se pudo crear la reserva.');
        return data;
    },

    async cancelBooking(bookingId: string, reason?: string): Promise<void> {
        const { error } = await supabase.rpc('cancel_parking_booking', {
            p_booking_id: bookingId,
            p_reason: reason?.trim() || null,
        });
        if (error) throw error;
    },

    /** Reservas donde el usuario es el conductor. */
    async getMyBookings(): Promise<ParkingBooking[]> {
        const driver = await ParkingService.getMyDriver();
        if (!driver) return [];

        const { data, error } = await supabase
            .from('parking_bookings')
            .select(`${PARKING_BOOKING_COLUMNS},parking_spots(label,unit_label)`)
            .eq('driver_id', driver.id)
            .order('starts_at', { ascending: false });

        if (error) throw error;
        return ((data || []) as ParkingBookingRow[]).map(mapParkingBooking);
    },

    /** Reservas recibidas en los estacionamientos del usuario. */
    async getBookingsForMySpots(): Promise<ParkingBooking[]> {
        const { data: authData } = await supabase.auth.getUser();
        if (!authData?.user) return [];

        const { data, error } = await supabase
            .from('parking_bookings')
            .select(`${PARKING_BOOKING_COLUMNS},parking_spots(label,unit_label),parking_drivers(full_name,plate)`)
            .eq('owner_id', authData.user.id)
            .order('starts_at', { ascending: false });

        if (error) throw error;
        return ((data || []) as ParkingBookingRow[]).map(mapParkingBooking);
    },

    /* — Portería — */

    async lookupAccess(code: string): Promise<ParkingAccessLookup[]> {
        const { data, error } = await supabase.rpc('lookup_parking_access', { p_code: code.trim() });
        if (error) throw error;

        return ((data || []) as ParkingAccessLookupRow[]).map(row => ({
            bookingId: row.booking_id,
            spotLabel: row.spot_label,
            unitLabel: row.unit_label || '',
            driverName: row.driver_name,
            driverPhone: row.driver_phone,
            driverNationalId: row.driver_national_id || undefined,
            plate: row.plate,
            vehicleDescription: row.vehicle_description || '',
            driverIsResident: row.driver_is_resident,
            startsAt: row.starts_at,
            endsAt: row.ends_at,
            status: row.status,
            isValidNow: row.is_valid_now,
            lastEvent: row.last_event || undefined,
        }));
    },

    async recordAccess(bookingId: string, eventType: ParkingAccessEventType, notes = ''): Promise<void> {
        const { error } = await supabase.rpc('record_parking_access', {
            p_booking_id: bookingId,
            p_event_type: eventType,
            p_notes: notes,
        });
        if (error) throw error;
    },

    /** Reservas vigentes hoy en la comunidad, para el tablero de conserjería. */
    async getTodayCommunityBookings(communityId: string): Promise<ParkingBooking[]> {
        const dayStart = new Date();
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);

        const { data, error } = await supabase
            .from('parking_bookings')
            .select(`${PARKING_BOOKING_COLUMNS},parking_spots(label,unit_label),parking_drivers(full_name,plate)`)
            .eq('community_id', communityId)
            .lt('starts_at', dayEnd.toISOString())
            .gt('ends_at', dayStart.toISOString())
            .order('starts_at', { ascending: true });

        if (error) throw error;
        return ((data || []) as ParkingBookingRow[]).map(mapParkingBooking);
    },

    /* — Administración — */

    async getCommunitySettings(communityId: string): Promise<ParkingCommunitySettings> {
        const { data, error } = await supabase
            .from('communities')
            .select('parking_external_enabled,parking_commission_percent')
            .eq('id', communityId)
            .single();

        if (error) throw error;
        return {
            externalEnabled: Boolean(data?.parking_external_enabled),
            commissionPercent: Number(data?.parking_commission_percent ?? 0),
        };
    },

    async updateCommunitySettings(
        communityId: string,
        settings: Partial<ParkingCommunitySettings>,
    ): Promise<void> {
        const payload: Record<string, unknown> = {};
        if (settings.externalEnabled !== undefined) payload.parking_external_enabled = settings.externalEnabled;
        if (settings.commissionPercent !== undefined) payload.parking_commission_percent = settings.commissionPercent;

        const { error } = await supabase.from('communities').update(payload).eq('id', communityId);
        if (error) throw error;
    },

    /** Todos los estacionamientos de la comunidad, para revisión de la administración. */
    async getCommunitySpots(communityId: string): Promise<ParkingSpot[]> {
        const { data, error } = await supabase
            .from('parking_spots')
            .select(`${PARKING_SPOT_COLUMNS},profiles!parking_spots_owner_id_fkey(name)`)
            .eq('community_id', communityId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return ((data || []) as ParkingSpotRow[]).map(mapParkingSpot);
    },

    async reviewSpot(spotId: string, approved: boolean, reason?: string): Promise<void> {
        const { data: authData } = await supabase.auth.getUser();

        const { error } = await supabase
            .from('parking_spots')
            .update({
                status: approved ? 'published' : 'rejected',
                approved_by: approved ? authData?.user?.id ?? null : null,
                approved_at: approved ? new Date().toISOString() : null,
                rejection_reason: approved ? null : reason?.trim() || 'Sin motivo indicado',
            })
            .eq('id', spotId);

        if (error) throw error;
    },

    /* — Billetera y Ganancias del Propietario (Monetización) — */

    async getOwnerEarnings(): Promise<ParkingOwnerEarnings> {
        const { data: authData } = await supabase.auth.getUser();
        if (!authData?.user) {
            return {
                currentMonthEarnings: 0,
                totalHistoricalEarnings: 0,
                availableBalance: 0,
                appliedToExpenses: 0,
                totalHoursRented: 0,
                totalBookingsCount: 0,
                transactions: [],
            };
        }

        try {
            const bookings = await ParkingService.getBookingsForMySpots();
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

            let currentMonthEarnings = 0;
            let totalHistoricalEarnings = 0;
            let totalHours = 0;
            const completedBookings = bookings.filter(b => b.status === 'completed' || b.status === 'active' || b.status === 'confirmed');

            const transactions: ParkingEarningsTransaction[] = [];

            for (const b of completedBookings) {
                const payout = b.ownerPayoutAmount || (b.totalAmount * 0.9); // 90% para el dueño por defecto si no viene desglosado
                totalHistoricalEarnings += payout;
                const bDate = new Date(b.startsAt);
                if (bDate >= startOfMonth) {
                    currentMonthEarnings += payout;
                }

                const durationHours = Math.max(1, Math.ceil((new Date(b.endsAt).getTime() - new Date(b.startsAt).getTime()) / 3600000));
                totalHours += durationHours;

                transactions.push({
                    id: `tx-${b.id}`,
                    bookingId: b.id,
                    spotLabel: b.spotLabel || 'Estacionamiento',
                    driverName: b.driverName || 'Conductor Registrado',
                    plate: b.driverPlate || '—',
                    type: 'rental_income',
                    description: `Arriendo ${durationHours}h (${b.spotLabel || 'Puesto'})`,
                    amount: payout,
                    date: b.startsAt,
                    status: b.status === 'completed' ? 'completed' : 'pending',
                });
            }

            // Simulación / cálculo de balance disponible (descontando aplicaciones previas si existiesen en metadata)
            const availableBalance = Math.max(0, totalHistoricalEarnings);

            return {
                currentMonthEarnings,
                totalHistoricalEarnings,
                availableBalance,
                appliedToExpenses: 0,
                totalHoursRented: totalHours,
                totalBookingsCount: completedBookings.length,
                transactions: transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
            };
        } catch {
            return {
                currentMonthEarnings: 0,
                totalHistoricalEarnings: 0,
                availableBalance: 0,
                appliedToExpenses: 0,
                totalHoursRented: 0,
                totalBookingsCount: 0,
                transactions: [],
            };
        }
    },

    async applyEarningsToExpenses(amount: number): Promise<{ success: boolean; newBalance: number; message: string }> {
        const { data: authData } = await supabase.auth.getUser();
        if (!authData?.user) throw new Error('Debes iniciar sesión.');
        if (amount <= 0) throw new Error('Monto inválido para abonar.');

        // El gasto común se emite exclusivamente desde billingService: el abono
        // tiene que pasar por ahí para no descuadrar la cuenta de la comunidad.
        // Mientras ese puente no exista, no se declara un éxito que no ocurrió.
        return {
            success: false,
            newBalance: 0,
            message: 'El abono al gasto común aún no está habilitado. Coordina el descuento con la administración.',
        };
    },

    async requestEarningsPayout(
        amount: number,
        bankDetails: { bank: string; accountType: string; accountNumber: string; rut: string },
    ): Promise<{ success: boolean; message: string }> {
        const { data: authData } = await supabase.auth.getUser();
        if (!authData?.user) throw new Error('Debes iniciar sesión.');
        if (amount <= 0) throw new Error('Monto inválido.');
        if (!bankDetails.accountNumber || !bankDetails.rut) throw new Error('Datos bancarios incompletos.');

        // Los retiros quedan pendientes de las credenciales de Haulmer.
        return {
            success: false,
            message: 'Los retiros automáticos aún no están habilitados. Solicita la transferencia a la administración.',
        };
    },

    async toggleSpotInstantAvailability(spotId: string, isAvailable: boolean): Promise<void> {
        const { error } = await supabase
            .from('parking_spots')
            .update({
                status: isAvailable ? 'published' : 'paused',
                updated_at: new Date().toISOString(),
            })
            .eq('id', spotId);

        if (error) throw error;
    },

    /* — Mapa Interactivo del Subterráneo (Niveles y Puestos) — */

    /**
     * Plano por niveles a partir de los estacionamientos reales de la comunidad.
     *
     * Si la comunidad no tiene cupos publicados devuelve una lista vacía: mostrar
     * un plano con puestos inventados llevaría al residente a intentar reservar
     * estacionamientos que no existen.
     */
    async getParkingMapLevels(communityId?: string): Promise<ParkingMapLevel[]> {
        const byLevel = new Map<ParkingFloorLevel, ParkingMapSpot[]>();
        if (!communityId) return buildParkingMapLevels(byLevel);

        let spotList: ParkingSpot[] = [];
        try {
            spotList = await ParkingService.getCommunitySpots(communityId);
        } catch {
            spotList = [];
        }

        // El nivel lo declara el dueño al publicar. Antes se deducía del nombre
        // del cupo, así que un "205" del subterráneo -1 se dibujaba en el -2.
        const perLevelIndex: Partial<Record<ParkingFloorLevel, number>> = {};

        spotList.forEach((spot) => {
            const level = spot.floorLevel || 'S1';
            const idx = perLevelIndex[level] ?? 0;
            perLevelIndex[level] = idx + 1;

            const mapSpot: ParkingMapSpot = {
                id: `map-${spot.id}`,
                spotId: spot.id,
                label: spot.label,
                floorLevel: level,
                position: { x: (idx % 4) * 80 + 20, y: Math.floor(idx / 4) * 110 + 20, width: 70, height: 95 },
                status: spot.status === 'published' ? 'available' : spot.status === 'paused' ? 'occupied' : 'unavailable',
                hourlyRate: spot.hourlyRate,
                isCovered: spot.isCovered,
                hasEvCharger: spot.hasEvCharger,
                vehicleSize: spot.vehicleSize,
                ownerName: spot.ownerName || 'Residente',
                unitLabel: spot.unitLabel || '—',
            };

            const bucket = byLevel.get(level);
            if (bucket) bucket.push(mapSpot);
            else byLevel.set(level, [mapSpot]);
        });

        return buildParkingMapLevels(byLevel);
    },

    /* — Pase Digital de Acceso (Credencial Inteligente) — */

    /**
     * Pase que el conductor muestra en portería. Los datos salen de su registro
     * real: conserjería compara este pase contra la persona que tiene enfrente,
     * así que un teléfono o una patente de relleno lo vuelven inútil.
     */
    async getPassDetail(booking: ParkingBooking, communityName = '', communityAddress = ''): Promise<ParkingPassDetail> {
        const driver = await ParkingService.getMyDriver();
        const now = new Date();
        const end = new Date(booking.endsAt);
        const diffMs = end.getTime() - now.getTime();
        const isOverdue = diffMs < 0;
        const overdueMinutes = isOverdue ? Math.ceil(Math.abs(diffMs) / 60000) : 0;
        const remainingMinutes = !isOverdue ? Math.max(0, Math.floor(diffMs / 60000)) : 0;

        const plate = driver?.plate || booking.driverPlate || '';
        const driverName = driver?.fullName || booking.driverName || '';

        const qrPayload = JSON.stringify({
            app: 'CONVIVE_ACCESS',
            bookingId: booking.id,
            code: booking.accessCode,
            spot: booking.spotLabel || '',
            plate,
            driver: driverName,
        });

        // Sin dirección conocida no se arman enlaces de navegación: un link a una
        // dirección inventada manda al conductor a otra parte.
        const wazeUrl = communityAddress
            ? `https://waze.com/ul?q=${encodeURIComponent(communityAddress)}&navigate=yes`
            : '';
        const googleMapsUrl = communityAddress
            ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(communityAddress)}`
            : '';

        return {
            bookingId: booking.id,
            spotLabel: booking.spotLabel || '',
            unitLabel: booking.unitLabel || '',
            accessCode: booking.accessCode,
            qrPayload,
            startsAt: booking.startsAt,
            endsAt: booking.endsAt,
            driverName,
            driverPhone: driver?.phone || '',
            plate,
            vehicleDescription: driver?.vehicleDescription || '',
            communityName,
            communityAddress,
            accessNotes: '',
            wazeUrl,
            googleMapsUrl,
            status: booking.status,
            isOverdue,
            overdueMinutes,
            remainingMinutes,
        };
    },

    /** Extiende una reserva activa por minutos adicionales (+30m, +60m) */
    /**
     * Extiende una reserva en curso. Va por RPC y no por un UPDATE directo porque
     * el recálculo tiene que usar la tarifa real del cupo y porque el choque con
     * la reserva siguiente lo resuelve la exclusion constraint en la misma
     * transacción.
     */
    async extendBooking(bookingId: string, additionalMinutes: number): Promise<{ newEndsAt: string; additionalAmount: number }> {
        const { data, error } = await supabase.rpc('extend_parking_booking', {
            p_booking_id: bookingId,
            p_additional_minutes: additionalMinutes,
        });

        if (error) throw error;

        const row = (Array.isArray(data) ? data[0] : data) as
            | { new_ends_at: string; additional_amount: number }
            | undefined;
        if (!row) throw new Error('No se pudo extender la reserva.');

        return { newEndsAt: row.new_ends_at, additionalAmount: Number(row.additional_amount) };
    },

    /* — Acceso de conductores externos — */

    /** El conductor pide permiso al condominio donde quiere estacionar. */
    async requestCommunityAccess(communityId: string, message = ''): Promise<string> {
        const { data, error } = await supabase.rpc('request_parking_community_access', {
            p_community_id: communityId,
            p_message: message.trim(),
        });
        if (error) throw error;
        if (typeof data !== 'string') throw new Error('No se pudo enviar la solicitud.');
        return data;
    },

    async getMyCommunityAccess(): Promise<ParkingCommunityAccess[]> {
        const { data, error } = await supabase.rpc('my_parking_community_access');
        if (error) throw error;

        return ((data || []) as {
            access_id: string;
            community_id: string;
            community_name: string;
            status: ParkingAccessRequestStatus;
            review_reason: string | null;
            created_at: string;
        }[]).map(row => ({
            accessId: row.access_id,
            communityId: row.community_id,
            communityName: row.community_name,
            status: row.status,
            reviewReason: row.review_reason || undefined,
            createdAt: row.created_at,
        }));
    },

    /** Bandeja de solicitudes de la administración. Pendientes primero. */
    async listAccessRequests(): Promise<ParkingAccessRequest[]> {
        const { data, error } = await supabase.rpc('list_parking_access_requests');
        if (error) throw error;

        return ((data || []) as {
            access_id: string;
            driver_id: string;
            full_name: string;
            phone: string;
            national_id: string | null;
            plate: string;
            vehicle_description: string | null;
            status: ParkingAccessRequestStatus;
            message: string | null;
            review_reason: string | null;
            created_at: string;
            reviewed_at: string | null;
        }[]).map(row => ({
            accessId: row.access_id,
            driverId: row.driver_id,
            fullName: row.full_name,
            phone: row.phone,
            nationalId: row.national_id || undefined,
            plate: row.plate,
            vehicleDescription: row.vehicle_description || '',
            status: row.status,
            message: row.message || '',
            reviewReason: row.review_reason || undefined,
            createdAt: row.created_at,
            reviewedAt: row.reviewed_at || undefined,
        }));
    },

    /** Rechazar cancela además las reservas futuras que ese conductor tuviera. */
    async reviewAccessRequest(accessId: string, approved: boolean, reason?: string): Promise<void> {
        const { error } = await supabase.rpc('review_parking_community_access', {
            p_access_id: accessId,
            p_approved: approved,
            p_reason: reason?.trim() || null,
        });
        if (error) throw error;
    },

    /** Registra una calificación de 1 a 5 estrellas para una reserva completada */
    async rateBooking(bookingId: string, rating: number, comment?: string): Promise<void> {
        const { error } = await supabase
            .from('parking_bookings')
            .update({
                rating,
                rating_comment: comment || null,
            })
            .eq('id', bookingId);

        if (error) {
            console.warn('[ParkingService] Rating update error, logged locally:', error);
        }
    },
};
