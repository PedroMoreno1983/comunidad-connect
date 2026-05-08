"use client";

import { useState, useEffect } from 'react';
import { AmenitiesService } from "@/lib/api";
import {
    Calendar, Clock, Users, Check, ChevronLeft, ChevronRight, Sparkles,
    Flame, Waves, PartyPopper, Dumbbell, Monitor, Gamepad2
} from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/authContext";
import { Button } from "@/components/ui/Button";
import { Booking, Amenity } from "@/lib/types";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { EmptyState } from "@/components/ui/EmptyState";
import { ModuleHeader, ModuleStat } from "@/components/ui/ModuleHeader";

// TAILWIND SAFELIST FOR DYNAMIC DB GRADIENTS:
// from-orange-500 to-red-600 from-cyan-400 to-blue-600 from-fuchsia-500 to-pink-600 
// from-slate-600 to-slate-900 from-emerald-400 to-teal-600 from-violet-500 to-purple-700 
// from-purple-500 to-pink-500 from-[#3B82F6] to-[#6D28D9]

// Icon mapping for amenities
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    Flame,
    Waves,
    PartyPopper,
    Dumbbell,
    Monitor,
    Gamepad2,
};

const demoAmenities: Amenity[] = [
    {
        id: "demo-amenity-quincho",
        name: "Quincho panoramico",
        description: "Terraza equipada para reuniones familiares, con parrilla, mesones y aforo controlado por administracion.",
        maxCapacity: 18,
        hourlyRate: 12000,
        iconName: "Flame",
        gradient: "from-orange-500 to-red-600",
    },
    {
        id: "demo-amenity-sala",
        name: "Sala multiuso",
        description: "Espacio cerrado para reuniones, clases, cumpleaños infantiles o actividades del comite.",
        maxCapacity: 24,
        hourlyRate: 0,
        iconName: "PartyPopper",
        gradient: "from-[#3B82F6] to-[#6D28D9]",
    },
    {
        id: "demo-amenity-gym",
        name: "Gimnasio",
        description: "Equipamiento funcional para residentes, con control de horarios peak y mantencion programada.",
        maxCapacity: 10,
        hourlyRate: 0,
        iconName: "Dumbbell",
        gradient: "from-emerald-400 to-teal-600",
    },
];

type AmenityRow = Record<string, unknown>;
type BookingRow = Record<string, unknown> & {
    amenities?: AmenityRow | AmenityRow[] | null;
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
    if (Array.isArray(value)) return value[0] ?? null;
    return value ?? null;
}

function toAmenity(row: AmenityRow): Amenity {
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

function toBooking(row: BookingRow): Booking & { amenities?: AmenityRow | null } {
    return {
        id: String(row.id || ""),
        amenityId: String(row.amenity_id ?? row.amenityId ?? ""),
        userId: String(row.user_id ?? row.userId ?? ""),
        date: String(row.date || ""),
        startTime: String(row.start_time ?? row.startTime ?? ""),
        endTime: String(row.end_time ?? row.endTime ?? ""),
        status: (row.status === "pending" || row.status === "cancelled" ? row.status : "confirmed"),
        amenities: firstRelation(row.amenities),
    };
}

function formatTime(value?: string) {
    return value ? value.slice(0, 5) : "--:--";
}

export default function AmenitiesPage() {
    const { user } = useAuth();
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [amenities, setAmenities] = useState<Amenity[]>([]);
    const [loading, setLoading] = useState(true);
    const [bookingLoading, setBookingLoading] = useState(false);
    const [selectedAmenity, setSelectedAmenity] = useState<Amenity | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [selectedDate, setSelectedDate] = useState('');
    const [selectedTime, setSelectedTime] = useState('');
    const { toast } = useToast();

    const [currentMonth, setCurrentMonth] = useState(new Date());

    const timeSlots = [
        '08:00', '09:00', '10:00', '11:00', '12:00', '13:00',
        '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'
    ];

    useEffect(() => {
        if (user) {
            loadData();
        }
    }, [user]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [amenitiesData, bookingsData] = await Promise.all([
                AmenitiesService.getAmenities(),
                AmenitiesService.getAllBookings()
            ]);
            const normalizedAmenities = ((amenitiesData as AmenityRow[]) || []).map(toAmenity);
            const normalizedBookings = ((bookingsData as BookingRow[]) || []).map(toBooking);
            setAmenities(normalizedAmenities.length ? normalizedAmenities : demoAmenities);
            setBookings(normalizedBookings);
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : "Error desconocido";
            console.error("Error loading amenities data:", errorMessage);
            setAmenities(demoAmenities);
            setBookings([]);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenBooking = (amenity: Amenity) => {
        setSelectedAmenity(amenity);
        setIsDialogOpen(true);
        setSelectedDate('');
        setSelectedTime('');
    };

    const handleBook = async () => {
        if (!user) {
            toast({ title: "Acceso Denegado", description: "Debes iniciar sesión para reservar.", variant: "destructive" });
            return;
        }
        if (!selectedAmenity) return;
        if (!selectedDate) {
            toast({ title: "Faltan datos", description: "Por favor, selecciona un día en el calendario.", variant: "destructive" });
            return;
        }
        if (!selectedTime) {
            toast({ title: "Faltan datos", description: "Por favor, selecciona un horario disponible.", variant: "destructive" });
            return;
        }

        // Validar que no haya una reserva existente para esta amenidad en esta fecha y hora
        const isConflict = bookings.some(b =>
            b.amenityId === selectedAmenity.id &&
            b.date === selectedDate &&
            b.startTime.startsWith(selectedTime.split(':')[0])
        );

        if (isConflict) {
            toast({
                title: "Horario No Disponible",
                description: "Este espacio ya se encuentra reservado en el horario seleccionado.",
                variant: "destructive"
            });
            return;
        }

        setBookingLoading(true);
        try {
            const endTime = `${parseInt(selectedTime) + 2}:00`;
            await AmenitiesService.createBooking({
                amenity_id: selectedAmenity.id,
                user_id: user.id,
                date: selectedDate,
                start_time: selectedTime,
                end_time: endTime
            });

            // Recargar datos
            await loadData();

            setIsDialogOpen(false);
            toast({
                title: "¡Reserva Confirmada!",
                description: `${selectedAmenity.name} reservado para el ${selectedDate} a las ${selectedTime}.`,
                variant: "success",
            });
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : "Hubo un problema procesando tu reserva.";
            toast({
                title: "Error al reservar",
                description: errorMessage,
                variant: "destructive",
            });
        } finally {
            setBookingLoading(false);
        }
    };

    // Calendar helpers
    const getDaysInMonth = (date: Date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDay = firstDay.getDay();
        return { daysInMonth, startingDay };
    };

    const { daysInMonth, startingDay } = getDaysInMonth(currentMonth);
    const monthName = currentMonth.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });

    const userBookings = bookings.filter(b => b.userId === user?.id);

    const getIcon = (iconName: string) => {
        return iconMap[iconName] || Calendar;
    };

    return (
        <div className="mx-auto max-w-6xl space-y-7 px-4 py-8 sm:px-6">
            <ModuleHeader
                eyebrow="Reservas"
                title="Espacios Comunes"
                description="Revisa disponibilidad, compara capacidad y reserva horarios sin pasar por administración."
                icon={<Calendar className="h-5 w-5" />}
                meta={`${amenities.length} espacios activos · ${userBookings.length} reservas tuyas`}
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <ModuleStat label="Espacios activos" value={amenities.length} icon={<Calendar className="h-4 w-4" />} />
                <ModuleStat label="Mis reservas" value={userBookings.length} icon={<Check className="h-4 w-4" />} />
                <ModuleStat label="Horarios diarios" value={timeSlots.length} icon={<Clock className="h-4 w-4" />} />
            </div>

            {/* Amenities Grid */}
            <ErrorBoundary name="Espacios Comunes">
                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="animate-pulse">
                                <SkeletonCard />
                            </div>
                        ))}
                    </div>
                ) : amenities.length === 0 ? (
                    <EmptyState
                        icon={<Calendar className="h-6 w-6" />}
                        title="No hay espacios configurados"
                        description="Cuando administración active quinchos, salas o piscinas, aparecerán acá para reservar."
                    />
                ) : (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {amenities.map((amenity) => {
                            const Icon = getIcon(amenity.iconName);
                            const amenityBookings = bookings.filter(booking => booking.amenityId === amenity.id);
                            const upcomingBookings = amenityBookings.filter(booking => new Date(`${booking.date}T${booking.startTime || "00:00"}`) >= new Date());
                            const nextBooking = [...upcomingBookings].sort((a, b) => new Date(`${a.date}T${a.startTime || "00:00"}`).getTime() - new Date(`${b.date}T${b.startTime || "00:00"}`).getTime())[0];
                            return (
                                <article
                                    key={amenity.id}
                                    className="group flex min-h-[300px] flex-col rounded-lg border border-subtle bg-surface p-5 shadow-sm transition-colors hover:border-brand-200"
                                >
                                    <div className="mb-5 flex items-start justify-between gap-4">
                                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                                            <Icon className="h-6 w-6" />
                                        </div>

                                        {amenity.hourlyRate > 0 && (
                                            <div className="rounded-md bg-elevated px-2.5 py-1 text-xs font-semibold cc-text-secondary">
                                                ${amenity.hourlyRate.toLocaleString()}/hr
                                            </div>
                                        )}
                                        {amenity.hourlyRate === 0 && (
                                            <div className="flex items-center gap-1 rounded-md bg-success-bg px-2.5 py-1 text-xs font-semibold text-success-fg">
                                                <Sparkles className="h-3 w-3" />
                                                Gratis
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex flex-1 flex-col">
                                        <h3 className="mb-2 text-lg font-bold cc-text-primary">{amenity.name}</h3>
                                        <p className="mb-4 line-clamp-3 text-sm leading-6 cc-text-secondary">{amenity.description}</p>

                                        <div className="mb-2 grid grid-cols-2 gap-2 text-sm cc-text-secondary">
                                            <div className="flex items-center gap-1.5 rounded-lg bg-elevated px-3 py-2">
                                                <Users className="h-4 w-4 text-slate-400" />
                                                <span>Máx. {amenity.maxCapacity}</span>
                                            </div>
                                        </div>

                                        <div className="mb-5 rounded-lg border border-subtle bg-elevated/50 px-3 py-2">
                                            <p className="text-[10px] font-bold uppercase tracking-[0.14em] cc-text-tertiary">Proxima reserva</p>
                                            <p className="mt-1 text-sm font-semibold cc-text-primary">
                                                {nextBooking
                                                    ? `${new Date(`${nextBooking.date}T12:00:00`).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })} - ${formatTime(nextBooking.startTime)}`
                                                    : "Sin reservas futuras"}
                                            </p>
                                        </div>

                                        <button
                                            onClick={() => handleOpenBooking(amenity)}
                                            className="mt-auto w-full rounded-lg bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-600"
                                        >
                                            Reservar ahora
                                        </button>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}
            </ErrorBoundary>

            {/* My Bookings */}
            {!loading && userBookings.length > 0 && (
                <ErrorBoundary name="Mis Reservas">
                    <div className="rounded-lg border border-subtle bg-surface p-5 shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="rounded-lg bg-brand-50 p-2 text-brand-600">
                                <Check className="h-5 w-5" />
                            </div>
                            <h2 className="text-lg font-bold cc-text-primary">Mis Reservas</h2>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {userBookings.map((booking) => {
                                const amenity = firstRelation((booking as Booking & { amenities?: AmenityRow | AmenityRow[] | null }).amenities);
                                if (!amenity) return null;
                                const Icon = getIcon(String(amenity.icon_name || amenity.iconName || "Calendar"));
                                const amenityName = String(amenity.name || "Espacio común");
                                return (
                                    <div key={booking.id} className="flex items-center gap-4 rounded-lg border border-subtle bg-elevated p-4">
                                        <div className="rounded-lg bg-surface p-2 cc-text-secondary">
                                            <Icon className="h-5 w-5" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="break-words font-semibold leading-snug cc-text-primary">{amenityName}</p>
                                            <p className="text-sm cc-text-secondary">
                                                {
                                                    // Prevenir desfase de zona horaria forzando el parseo local a mediodía
                                                    new Date(`${booking.date}T12:00:00`).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })
                                                }
                                            </p>
                                            <p className="text-sm cc-text-secondary font-medium">{formatTime(booking.startTime)} - {formatTime(booking.endTime)}</p>
                                        </div>
                                        <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${booking.status === 'confirmed' ? 'bg-success-bg text-success-fg' : 'bg-warning-bg text-warning-fg'
                                            }`}>
                                            {booking.status === 'confirmed' ? 'Confirmado' : 'Pendiente'}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </ErrorBoundary>
            )}

            {/* Booking Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-3">
                            {selectedAmenity && (
                                <div className="rounded-lg bg-brand-50 p-2 text-brand-600">
                                    {(() => { const Icon = getIcon(selectedAmenity.iconName); return <Icon className="h-5 w-5" />; })()}
                                </div>
                            )}
                            Reservar {selectedAmenity?.name}
                        </DialogTitle>
                        <DialogDescription>
                            Selecciona fecha y hora para tu reserva
                        </DialogDescription>
                    </DialogHeader>

                    <div className="py-4 space-y-6">
                        {/* Mini Calendar */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <button
                                    onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
                                    className="p-2 hover:bg-elevated rounded-lg transition-colors"
                                >
                                    <ChevronLeft className="h-5 w-5 cc-text-secondary" />
                                </button>
                                <span className="text-sm font-semibold cc-text-primary capitalize">{monthName}</span>
                                <button
                                    onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
                                    className="p-2 hover:bg-elevated rounded-lg transition-colors"
                                >
                                    <ChevronRight className="h-5 w-5 cc-text-secondary" />
                                </button>
                            </div>
                            <div className="grid grid-cols-7 gap-1 text-center">
                                {['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'].map(day => (
                                    <div key={day} className="text-xs font-medium cc-text-secondary py-2">{day}</div>
                                ))}
                                {Array.from({ length: startingDay }).map((_, i) => (
                                    <div key={`empty-${i}`} />
                                ))}
                                {Array.from({ length: daysInMonth }).map((_, i) => {
                                    const day = i + 1;
                                    const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                    const isSelected = selectedDate === dateStr;

                                    // Prevenir bug de zona horaria parseando el dateStr como mediodía local
                                    const dayDate = new Date(`${dateStr}T12:00:00`);
                                    const today = new Date();
                                    today.setHours(0, 0, 0, 0); // Inicio del día actual
                                    const isPast = dayDate < today;

                                    return (
                                        <button
                                            key={day}
                                            disabled={isPast}
                                            onClick={() => setSelectedDate(dateStr)}
                                            className={`py-2 rounded-lg text-sm font-medium transition-all ${isSelected
                                                ? 'bg-brand-500 text-white shadow-sm'
                                                : isPast
                                                    ? 'cc-text-tertiary cursor-not-allowed'
                                                    : 'cc-text-secondary hover:bg-elevated'
                                                }`}
                                        >
                                            {day}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Time Slots */}
                        {selectedDate && (
                            <div className="space-y-3">
                                <label className="text-sm font-medium cc-text-secondary flex items-center gap-2">
                                    <Clock className="h-4 w-4 text-slate-400" />
                                    Horario Disponible
                                </label>
                                <div className="grid grid-cols-4 gap-2">
                                    {timeSlots.map(time => {
                                        const isBooked = bookings.some(b =>
                                            b.amenityId === selectedAmenity?.id &&
                                            b.date === selectedDate &&
                                            b.startTime.startsWith(time.split(':')[0])
                                        );
                                        return (
                                            <button
                                                key={time}
                                                disabled={isBooked}
                                                onClick={() => setSelectedTime(time)}
                                                className={`py-2 px-3 rounded-lg text-sm font-medium transition-all ${isBooked
                                                    ? 'bg-elevated cc-text-tertiary cursor-not-allowed line-through'
                                                    : selectedTime === time
                                                        ? 'bg-brand-500 text-white shadow-sm'
                                                        : 'bg-elevated cc-text-secondary hover:bg-elevated'
                                                    }`}
                                            >
                                                {time}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                        <Button
                            onClick={handleBook}
                            disabled={bookingLoading}
                            className="flex gap-2 border-0 bg-brand-500 hover:bg-brand-600"
                        >
                            {bookingLoading && <div className="animate-spin h-4 w-4 border-2 border-white rounded-full border-t-transparent" />}
                            {bookingLoading ? 'Reservando...' : 'Confirmar Reserva'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
