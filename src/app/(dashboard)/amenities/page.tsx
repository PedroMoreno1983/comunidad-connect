"use client";

import { useCallback, useState, useEffect } from 'react';
import { AmenitiesService } from "@/lib/api";
import {
    Calendar, Users, Check, ArrowLeft,
    Flame, Waves, PartyPopper, Dumbbell, Monitor, Gamepad2, Plus, Settings2
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/authContext";
import { Button } from "@/components/cc/Button";
import { Booking, Amenity } from "@/lib/types";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { ModuleHeader } from "@/components/ui/ModuleHeader";
import { Tag } from "@/components/cc/Tag";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    Calendar,
    Flame,
    Waves,
    PartyPopper,
    Dumbbell,
    Monitor,
    Gamepad2,
};

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
    const [bookingLoading, setBookingLoading] = useState(false);
    
    // Booking flow state
    const [selectedAmenity, setSelectedAmenity] = useState<Amenity | null>(null);
    const [selectedDate, setSelectedDate] = useState('');
    const [selectedTime, setSelectedTime] = useState('');
    const [showAmenityForm, setShowAmenityForm] = useState(false);
    const [creatingAmenity, setCreatingAmenity] = useState(false);
    const [amenityForm, setAmenityForm] = useState({
        name: "",
        description: "",
        maxCapacity: 12,
        hourlyRate: 0,
        iconName: "Calendar",
        gradient: "from-[#B45F4B] to-[#8E3F31]",
    });
    const { toast } = useToast();
    const isAdmin = user?.role === "admin";

    const timeSlots = [
        '08:00', '10:00', '12:00', '14:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'
    ];

    const loadData = useCallback(async () => {

        try {
            const [amenitiesData, bookingsData] = await Promise.all([
                AmenitiesService.getAmenities(),
                AmenitiesService.getAllBookings()
            ]);
            const normalizedAmenities = ((amenitiesData as AmenityRow[]) || []).map(toAmenity);
            const normalizedBookings = ((bookingsData as BookingRow[]) || []).map(toBooking);
            setAmenities(normalizedAmenities);
            setBookings(normalizedBookings);
        } catch (error: unknown) {
            console.error("Error loading amenities data:", error);
            setAmenities([]);
            setBookings([]);
        }
    }, []);

    useEffect(() => {
        if (user) {
            loadData();
        }
    }, [loadData, user]);

    // Generar strip de los próximos 7 días a partir de hoy
    const getNext7Days = () => {
        const list = [];
        const daysOfWeek = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        for (let i = 0; i < 7; i++) {
            const d = new Date();
            d.setDate(d.getDate() + i);
            const dateStr = d.toISOString().slice(0, 10);
            list.push({
                dateStr,
                dayName: daysOfWeek[d.getDay()],
                dayNumber: d.getDate(),
                formattedLabel: d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
            });
        }
        return list;
    };

    const next7Days = getNext7Days();

    // Configurar primer día por defecto si hay amenidad seleccionada
    useEffect(() => {
        if (selectedAmenity && !selectedDate) {
            setSelectedDate(next7Days[0].dateStr);
        }
    }, [selectedAmenity, selectedDate, next7Days]);

    const handleSelectAmenity = (amenity: Amenity) => {
        setSelectedAmenity(amenity);
        setSelectedDate(next7Days[0].dateStr);
        setSelectedTime('');
    };

    const handleBook = async () => {
        if (!user) {
            toast({ title: "Acceso Denegado", description: "Debes iniciar sesión para reservar.", variant: "destructive" });
            return;
        }
        if (!selectedAmenity) return;
        if (!selectedDate) {
            toast({ title: "Faltan datos", description: "Por favor, selecciona una fecha.", variant: "destructive" });
            return;
        }
        if (!selectedTime) {
            toast({ title: "Faltan datos", description: "Por favor, selecciona un horario disponible.", variant: "destructive" });
            return;
        }

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

            await loadData();
            setSelectedAmenity(null);
            toast({
                title: "¡Reserva Confirmada!",
                description: `Tu reserva se guardó correctamente.`,
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

    const handleCreateAmenity = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!user || user.role !== "admin") {
            toast({ title: "Acceso restringido", description: "Solo administración puede crear espacios comunes.", variant: "destructive" });
            return;
        }
        if (!user.communityId) {
            toast({ title: "Comunidad no configurada", description: "Tu usuario no tiene comunidad asociada para crear el espacio.", variant: "destructive" });
            return;
        }
        if (!amenityForm.name.trim() || !amenityForm.description.trim()) {
            toast({ title: "Faltan datos", description: "Ingresa nombre y descripción del espacio.", variant: "destructive" });
            return;
        }

        setCreatingAmenity(true);
        try {
            await AmenitiesService.createAmenity({
                name: amenityForm.name.trim(),
                description: amenityForm.description.trim(),
                maxCapacity: Number(amenityForm.maxCapacity) || 0,
                hourlyRate: Number(amenityForm.hourlyRate) || 0,
                iconName: amenityForm.iconName,
                gradient: amenityForm.gradient,
                communityId: user.communityId,
            });
            await loadData();
            setAmenityForm({
                name: "",
                description: "",
                maxCapacity: 12,
                hourlyRate: 0,
                iconName: "Calendar",
                gradient: "from-[#B45F4B] to-[#8E3F31]",
            });
            setShowAmenityForm(false);
            toast({ title: "Espacio creado", description: "El nuevo espacio común ya está disponible para reservas.", variant: "success" });
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : "No se pudo crear el espacio.";
            toast({ title: "Error al crear espacio", description: errorMessage, variant: "destructive" });
        } finally {
            setCreatingAmenity(false);
        }
    };

    const userBookings = bookings.filter(b => b.userId === user?.id);

    const getIcon = (iconName: string) => {
        return iconMap[iconName] || Calendar;
    };

    // Resolver tono por nombre de la amenidad
    const getAmenityTone = (name: string): "copper" | "sage" | "plum" | "amber" | "neutral" => {
        const lower = name.toLowerCase();
        if (lower.includes("quincho")) return "sage";
        if (lower.includes("piscina")) return "copper";
        if (lower.includes("gimnasio") || lower.includes("sala")) return "plum";
        return "amber";
    };

    return (
        <ErrorBoundary name="Espacios Comunes y Reservas">
            <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 space-y-7 pb-24">
                {/* Back Link or Navigation */}
                {selectedAmenity ? (
                    <button
                        onClick={() => setSelectedAmenity(null)}
                        className="inline-flex items-center gap-2 text-sm cc-text-secondary hover:text-brand-600 transition-colors"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Volver a espacios comunes
                    </button>
                ) : (
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <ModuleHeader
                            eyebrow="Reservas"
                            title="Espacios Comunes"
                            description="Revisa disponibilidad, compara capacidad y reserva horarios sin pasar por administración."
                            icon={<Calendar className="h-5 w-5" />}
                            meta={`${amenities.length} espacios activos · ${userBookings.length} reservas activas`}
                        />
                        {isAdmin && (
                            <Button type="button" variant="copper" onClick={() => setShowAmenityForm(value => !value)}>
                                {showAmenityForm ? <Settings2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                                {showAmenityForm ? "Cerrar configuración" : "Nuevo espacio"}
                            </Button>
                        )}
                    </div>
                )}

                {/* Vista 1: Lista General de Espacios */}
                {!selectedAmenity ? (
                    <>
                        {isAdmin && showAmenityForm && (
                            <form onSubmit={handleCreateAmenity} className="rounded-xl border border-subtle bg-surface p-5 shadow-sm">
                                <div className="mb-5 flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-[0.14em] cc-text-tertiary">Administración</p>
                                        <h2 className="mt-1 text-xl font-semibold cc-text-primary">Crear tipo de espacio común</h2>
                                    </div>
                                    <Tag tone="sage" solid>Disponible al guardar</Tag>
                                </div>

                                <div className="grid gap-4 lg:grid-cols-2">
                                    <label className="space-y-2">
                                        <span className="text-xs font-semibold uppercase tracking-[0.12em] cc-text-secondary">Nombre</span>
                                        <input
                                            value={amenityForm.name}
                                            onChange={(event) => setAmenityForm(form => ({ ...form, name: event.target.value }))}
                                            placeholder="Sala cowork, lavandería, azotea..."
                                            className="w-full rounded-lg border border-subtle bg-elevated px-4 py-3 text-sm cc-text-primary outline-none focus:border-brand-400"
                                        />
                                    </label>
                                    <label className="space-y-2">
                                        <span className="text-xs font-semibold uppercase tracking-[0.12em] cc-text-secondary">Descripción</span>
                                        <input
                                            value={amenityForm.description}
                                            onChange={(event) => setAmenityForm(form => ({ ...form, description: event.target.value }))}
                                            placeholder="Condiciones, uso recomendado y reglas principales"
                                            className="w-full rounded-lg border border-subtle bg-elevated px-4 py-3 text-sm cc-text-primary outline-none focus:border-brand-400"
                                        />
                                    </label>
                                    <label className="space-y-2">
                                        <span className="text-xs font-semibold uppercase tracking-[0.12em] cc-text-secondary">Aforo máximo</span>
                                        <input
                                            type="number"
                                            min={1}
                                            value={amenityForm.maxCapacity}
                                            onChange={(event) => setAmenityForm(form => ({ ...form, maxCapacity: Number(event.target.value) }))}
                                            className="w-full rounded-lg border border-subtle bg-elevated px-4 py-3 text-sm cc-text-primary outline-none focus:border-brand-400"
                                        />
                                    </label>
                                    <label className="space-y-2">
                                        <span className="text-xs font-semibold uppercase tracking-[0.12em] cc-text-secondary">Tarifa por hora</span>
                                        <input
                                            type="number"
                                            min={0}
                                            step={500}
                                            value={amenityForm.hourlyRate}
                                            onChange={(event) => setAmenityForm(form => ({ ...form, hourlyRate: Number(event.target.value) }))}
                                            className="w-full rounded-lg border border-subtle bg-elevated px-4 py-3 text-sm cc-text-primary outline-none focus:border-brand-400"
                                        />
                                    </label>
                                    <label className="space-y-2">
                                        <span className="text-xs font-semibold uppercase tracking-[0.12em] cc-text-secondary">Icono</span>
                                        <select
                                            value={amenityForm.iconName}
                                            onChange={(event) => setAmenityForm(form => ({ ...form, iconName: event.target.value }))}
                                            className="w-full rounded-lg border border-subtle bg-elevated px-4 py-3 text-sm cc-text-primary outline-none focus:border-brand-400"
                                        >
                                            {Object.keys(iconMap).map(icon => <option key={icon} value={icon}>{icon}</option>)}
                                        </select>
                                    </label>
                                    <label className="space-y-2">
                                        <span className="text-xs font-semibold uppercase tracking-[0.12em] cc-text-secondary">Color</span>
                                        <select
                                            value={amenityForm.gradient}
                                            onChange={(event) => setAmenityForm(form => ({ ...form, gradient: event.target.value }))}
                                            className="w-full rounded-lg border border-subtle bg-elevated px-4 py-3 text-sm cc-text-primary outline-none focus:border-brand-400"
                                        >
                                            <option value="from-[#B45F4B] to-[#8E3F31]">Cobre</option>
                                            <option value="from-[#3F8F6B] to-[#1F5F4A]">Sage</option>
                                            <option value="from-[#6D5BD0] to-[#3B2F84]">Plum</option>
                                            <option value="from-[#D8A83A] to-[#9B6B16]">Ámbar</option>
                                        </select>
                                    </label>
                                </div>

                                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
                                    <Button type="button" variant="ghost" onClick={() => setShowAmenityForm(false)}>
                                        Cancelar
                                    </Button>
                                    <Button type="submit" variant="copper" disabled={creatingAmenity}>
                                        {creatingAmenity ? "Creando..." : "Crear espacio"}
                                    </Button>
                                </div>
                            </form>
                        )}

                        {/* Stats Summary Panel */}
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                            {[
                                { label: "Espacios Activos", value: amenities.length, tone: "sage" as const },
                                { label: "Mis Reservas", value: userBookings.length, tone: "copper" as const },
                                { label: "Turnos Diarios", value: timeSlots.length, tone: "plum" as const }
                            ].map(card => (
                                <div key={card.label} className="rounded-xl border border-subtle bg-surface p-5 shadow-sm">
                                    <p className="text-2xl font-bold cc-text-primary">{card.value}</p>
                                    <div className="mt-2">
                                        <Tag tone={card.tone} solid>{card.label}</Tag>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* List of Amenities */}
                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                            {amenities.length === 0 ? (
                                <div className="col-span-full text-center py-16 border border-dashed border-slate-200 rounded-2xl bg-surface/50 shadow-inner max-w-sm mx-auto my-6">
                                    <div className="p-3 bg-brand-50 text-brand-500 rounded-full w-fit mx-auto mb-4 border border-brand-100 shadow-sm">
                                        <Calendar className="h-6 w-6" />
                                    </div>
                                    <h3 className="text-sm font-bold cc-text-primary">No hay espacios comunes</h3>
                                    <p className="text-xs cc-text-secondary mt-1 px-6 leading-relaxed">Aún no se han configurado espacios comunes para tu condominio.</p>
                                </div>
                            ) : (
                                amenities.map(amenity => {
                                    const Icon = getIcon(amenity.iconName);
                                    const tone = getAmenityTone(amenity.name);
                                    const isFree = amenity.hourlyRate === 0;

                                    return (
                                        <article
                                            key={amenity.id}
                                            className="group rounded-xl border border-subtle bg-surface overflow-hidden shadow-sm hover:border-brand-200 transition-all flex flex-col justify-between"
                                        >
                                            {/* Dynamic color block banner */}
                                            <div className="h-2 w-full" style={{ backgroundColor: `var(--cc-${tone})` }} />
                                            <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                                                <div className="space-y-3">
                                                    <div className="flex items-center justify-between">
                                                        <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-elevated text-slate-700">
                                                            <Icon className="h-5 w-5" />
                                                        </div>
                                                        <Tag tone={tone} solid>
                                                            {isFree ? "Gratuito" : `$${amenity.hourlyRate.toLocaleString("es-CL")}/hr`}
                                                        </Tag>
                                                    </div>
                                                    <h3 className="text-lg font-bold cc-text-primary">{amenity.name}</h3>
                                                    <p className="text-xs cc-text-secondary leading-relaxed line-clamp-3">
                                                        {amenity.description}
                                                    </p>
                                                </div>

                                                <div className="pt-4 border-t border-subtle space-y-3">
                                                    <div className="flex items-center justify-between text-xs cc-text-tertiary font-semibold">
                                                        <span className="flex items-center gap-1">
                                                            <Users className="h-3.5 w-3.5" /> Máx {amenity.maxCapacity} pers
                                                        </span>
                                                    </div>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        block
                                                        onClick={() => handleSelectAmenity(amenity)}
                                                    >
                                                        Reservar ahora
                                                    </Button>
                                                </div>
                                            </div>
                                        </article>
                                    );
                                })
                            )}
                        </div>

                        {/* Stored Bookings list */}
                        {userBookings.length > 0 && (
                            <section className="rounded-xl border border-subtle bg-surface p-6 shadow-sm">
                                <h3 className="text-lg font-bold cc-text-primary mb-4 flex items-center gap-2">
                                    <Check className="h-5 w-5 text-brand-500" /> Mis próximas reservas
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {userBookings.map(booking => {
                                        const amenity = amenities.find(a => a.id === booking.amenityId);
                                        const name = amenity?.name || "Espacio común";
                                        const tone = getAmenityTone(name);
                                        const Icon = getIcon(amenity?.iconName || "Calendar");
                                        return (
                                            <div key={booking.id} className="flex items-center gap-4 rounded-xl border border-subtle bg-elevated p-4">
                                                <div className="rounded-lg bg-surface p-2 cc-text-secondary">
                                                    <Icon className="h-5 w-5" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-semibold leading-snug cc-text-primary truncate text-sm">{name}</p>
                                                    <p className="text-xs cc-text-secondary mt-1">
                                                        {new Date(`${booking.date}T12:00:00`).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })}
                                                    </p>
                                                    <p className="text-xs cc-text-tertiary font-medium">{formatTime(booking.startTime)} - {formatTime(booking.endTime)}</p>
                                                </div>
                                                <Tag tone={tone} solid>Confirmado</Tag>
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>
                        )}
                    </>
                ) : (
                    /* Vista 2: Proceso de Reserva de Amenidad (Flujo Integrado) */
                    <div className="space-y-6">
                        {/* Hero con Striped Placeholder */}
                        <div className="rounded-xl border border-subtle bg-surface overflow-hidden shadow-md relative">
                            {/* Striped textured pattern on background */}
                            <div className="h-32 w-full grid-bg relative overflow-hidden" 
                                 style={{ 
                                     backgroundColor: `var(--cc-${getAmenityTone(selectedAmenity.name)}-tint)`,
                                     backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.4) 10px, rgba(255,255,255,0.4) 20px)`
                                 }}>
                                <div className="absolute inset-0 bg-gradient-to-t from-surface to-transparent" />
                            </div>
                            <div className="p-6 relative -mt-10">
                                <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2">
                                            <Tag tone={getAmenityTone(selectedAmenity.name)} solid>{selectedAmenity.hourlyRate > 0 ? `$${selectedAmenity.hourlyRate.toLocaleString()}/hr` : "Gratuito"}</Tag>
                                            <Tag tone="neutral">Aforo {selectedAmenity.maxCapacity} máx</Tag>
                                        </div>
                                        <h2 className="text-2xl font-bold cc-text-primary">{selectedAmenity.name}</h2>
                                        <p className="text-sm cc-text-secondary max-w-3xl leading-relaxed">
                                            {selectedAmenity.description}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Stats Row */}
                        <div className="grid grid-cols-3 gap-4 border border-subtle rounded-xl bg-surface p-4 shadow-sm text-center">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wider cc-text-tertiary">Disponibilidad</p>
                                <p className="mt-1 text-base font-semibold text-emerald-600">85% libre</p>
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wider cc-text-tertiary">Tarifa</p>
                                <p className="mt-1 text-base font-semibold cc-text-primary">
                                    {selectedAmenity.hourlyRate > 0 ? `$${selectedAmenity.hourlyRate.toLocaleString("es-CL")}` : "Gratis"}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wider cc-text-tertiary">Mín-Máx Hora</p>
                                <p className="mt-1 text-base font-semibold cc-text-primary">1 - 4 hrs</p>
                            </div>
                        </div>

                        {/* Date Strip 7 Días */}
                        <div className="space-y-3">
                            <p className="text-sm font-semibold cc-text-secondary">Selecciona un día</p>
                            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
                                {next7Days.map(day => {
                                    const isSelected = selectedDate === day.dateStr;
                                    return (
                                        <button
                                            key={day.dateStr}
                                            onClick={() => { setSelectedDate(day.dateStr); setSelectedTime(''); }}
                                            className={`flex-1 min-w-[70px] py-3 rounded-xl border text-center transition-all ${
                                                isSelected
                                                    ? 'border-brand-500 bg-brand-50 shadow-sm'
                                                    : 'border-subtle bg-surface hover:border-brand-200'
                                            }`}
                                        >
                                            <p className="text-[10px] font-bold uppercase tracking-wider cc-text-tertiary">{day.dayName}</p>
                                            <p className={`text-base font-bold mt-1 ${isSelected ? 'text-brand-700' : 'cc-text-primary'}`}>{day.dayNumber}</p>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Slots como cards con estados */}
                        <div className="space-y-3">
                            <p className="text-sm font-semibold cc-text-secondary">Selecciona un bloque de horario (2 horas por sesión)</p>
                            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
                                {timeSlots.map(time => {
                                    const isBooked = bookings.some(b =>
                                        b.amenityId === selectedAmenity.id &&
                                        b.date === selectedDate &&
                                        b.startTime.startsWith(time.split(':')[0])
                                    );
                                    const isSelected = selectedTime === time;

                                    return (
                                        <button
                                            key={time}
                                            disabled={isBooked}
                                            onClick={() => setSelectedTime(time)}
                                            className={`p-4 rounded-xl border text-center transition-all ${
                                                isBooked
                                                    ? 'bg-elevated/70 border-subtle cc-text-disabled cursor-not-allowed line-through'
                                                    : isSelected
                                                        ? 'border-transparent text-white font-bold'
                                                        : 'border-subtle bg-surface hover:border-brand-200 cc-text-secondary'
                                            }`}
                                            style={{
                                                backgroundColor: isSelected ? 'var(--cc-ink)' : undefined
                                            }}
                                        >
                                            <p className="text-sm font-semibold">{time}</p>
                                            <p className="text-[10px] mt-1 uppercase tracking-wider font-semibold opacity-80">
                                                {isBooked ? "Reservado" : isSelected ? "Seleccionado" : "Libre"}
                                            </p>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Fixed / Floating CTA Bar at Bottom */}
                        {selectedDate && selectedTime && (
                            <div className="fixed bottom-0 left-0 right-0 bg-surface border-t border-subtle py-4 px-6 z-50 shadow-2xl flex items-center justify-between">
                                <div className="max-w-6xl mx-auto w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                    <div className="text-sm font-medium cc-text-primary">
                                        Confirmando <span className="font-bold">{selectedAmenity.name}</span> para el <span className="font-bold">{selectedDate}</span> a las <span className="font-bold">{selectedTime}</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button variant="ghost" onClick={() => setSelectedAmenity(null)}>Cancelar</Button>
                                        <Button
                                            variant="copper"
                                            onClick={handleBook}
                                            disabled={bookingLoading}
                                        >
                                            {bookingLoading
                                                ? "Confirmando..."
                                                : selectedAmenity.hourlyRate > 0
                                                    ? "Confirmar reserva"
                                                    : "Confirmar reserva gratis"}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </ErrorBoundary>
    );
}
