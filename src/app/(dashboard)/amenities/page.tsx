"use client";

import { useCallback, useState, useEffect } from 'react';
import Image from "next/image";
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
import { Tag } from "@/components/cc/Tag";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";

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
    const [dataLoading, setDataLoading] = useState(true);
    
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
        setDataLoading(true);
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
        } finally {
            setDataLoading(false);
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
            <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-10 lg:py-12 space-y-8 pb-24">
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
                    <div className="flex flex-col gap-6 border-b pb-8 lg:flex-row lg:items-end lg:justify-between" style={{ borderColor: "var(--cc-line-strong)" }}>
                        <div>
                            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] cc-text-tertiary">Reservas · tu comunidad</p>
                            <h1 className="text-5xl font-normal leading-[0.94] tracking-[-0.03em] cc-text-primary sm:text-6xl" style={{ fontFamily: "var(--cc-font-display)" }}>
                                Espacios <em className="font-normal italic text-copper">comunes.</em>
                            </h1>
                            <p className="mt-4 max-w-2xl text-sm leading-6 cc-text-secondary sm:text-base">Elige un lugar, revisa su agenda y confirma tu horario sin pasar por administración.</p>
                        </div>
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
                        <div className="grid grid-cols-3 gap-4 border-y py-5" style={{ borderColor: "var(--cc-line)" }}>
                            {[
                                { label: "Espacios Activos", value: amenities.length, tone: "sage" as const },
                                { label: "Mis Reservas", value: userBookings.length, tone: "copper" as const },
                                { label: "Turnos Diarios", value: timeSlots.length, tone: "plum" as const }
                            ].map(card => (
                                <div key={card.label} className="border-r last:border-r-0" style={{ borderColor: "var(--cc-line)" }}>
                                    <p className="text-2xl font-normal cc-text-primary sm:text-3xl" style={{ fontFamily: "var(--cc-font-display)" }}>{card.value}</p>
                                    <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] cc-text-tertiary">{card.label}</p>
                                </div>
                            ))}
                        </div>

                        {/* List of Amenities */}
                        <div className="border-b" style={{ borderColor: "var(--cc-line-strong)" }}>
                            {dataLoading ? (
                                <div className="space-y-4 py-6">
                                    {[1, 2, 3].map(item => <Skeleton key={item} className="h-24 w-full rounded-xl" />)}
                                </div>
                            ) : amenities.length === 0 ? (
                                <div className="col-span-full max-w-md mx-auto my-6 w-full">
                                    <EmptyState
                                        icon={<Calendar className="h-6 w-6" />}
                                        title="No hay espacios comunes"
                                        description="Aún no se han configurado espacios comunes para tu condominio."
                                        tone="neutral"
                                    />
                                </div>
                            ) : (
                                amenities.map(amenity => {
                                    const Icon = getIcon(amenity.iconName);
                                    const tone = getAmenityTone(amenity.name);
                                    const isFree = amenity.hourlyRate === 0;

                                    return (
                                        <article key={amenity.id} className="group grid items-center gap-5 border-t py-6 sm:grid-cols-[72px_1fr_auto] sm:py-7" style={{ borderColor: "var(--cc-line)" }}>
                                            <div className="hidden h-16 w-16 place-items-center rounded-full sm:grid" style={{ background: `var(--cc-${tone}-tint)`, color: `var(--cc-${tone})` }}><Icon className="h-6 w-6" /></div>
                                            <div className="min-w-0">
                                                <div className="mb-2 flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-[0.12em] cc-text-tertiary">
                                                    <span>{isFree ? "Gratuito" : `$${amenity.hourlyRate.toLocaleString("es-CL")}/hora`}</span>
                                                    <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> Aforo {amenity.maxCapacity}</span>
                                                </div>
                                                <h3 className="text-2xl font-normal cc-text-primary sm:text-3xl" style={{ fontFamily: "var(--cc-font-display)" }}>{amenity.name}</h3>
                                                <p className="mt-2 line-clamp-2 max-w-2xl text-sm leading-6 cc-text-secondary">{amenity.description}</p>
                                            </div>
                                            <button type="button" onClick={() => handleSelectAmenity(amenity)} className="inline-flex items-center justify-center gap-2 border px-5 py-3 text-sm font-semibold transition hover:bg-ink hover:text-paper sm:justify-self-end" style={{ borderColor: "var(--cc-line-strong)" }}>
                                                Ver agenda <Calendar className="h-4 w-4" />
                                            </button>
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
                    <div className="space-y-7">
                        <div className="relative min-h-[300px] overflow-hidden sm:min-h-[390px] lg:min-h-[460px]">
                            <Image src="/edificio-malaga-patio.jpg" alt={selectedAmenity.name} fill sizes="(max-width: 1280px) 100vw, 1200px" className="object-cover" priority />
                            <div className="absolute inset-0" style={{ background: "linear-gradient(0deg, rgba(26,22,17,0.86) 0%, rgba(26,22,17,0.08) 64%)" }} />
                            <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-8 lg:p-10">
                                <p className="mb-2 text-[10px] uppercase tracking-[0.16em] text-white/65">Aforo {selectedAmenity.maxCapacity} · {selectedAmenity.hourlyRate > 0 ? `$${selectedAmenity.hourlyRate.toLocaleString("es-CL")}/hora` : "Gratuito"}</p>
                                <h2 className="text-4xl font-normal leading-none sm:text-5xl lg:text-6xl" style={{ fontFamily: "var(--cc-font-display)" }}>{selectedAmenity.name}</h2>
                                <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">{selectedAmenity.description}</p>
                            </div>
                        </div>

                        {/* Stats Row */}
                        <div className="grid grid-cols-3 border-b pb-5 text-center" style={{ borderColor: "var(--cc-line)" }}>
                            <div className="border-x" style={{ borderColor: "var(--cc-line)" }}>
                                <p className="text-xs font-bold uppercase tracking-wider cc-text-tertiary">Turnos libres</p>
                                <p className="mt-1 text-base font-semibold text-emerald-600">
                                    {timeSlots.filter(time => !bookings.some(booking => booking.amenityId === selectedAmenity.id && booking.date === selectedDate && booking.startTime.startsWith(time.split(':')[0]))).length} de {timeSlots.length}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wider cc-text-tertiary">Tarifa</p>
                                <p className="mt-1 text-base font-semibold cc-text-primary">
                                    {selectedAmenity.hourlyRate > 0 ? `$${selectedAmenity.hourlyRate.toLocaleString("es-CL")}` : "Gratis"}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wider cc-text-tertiary">Duración</p>
                                <p className="mt-1 text-base font-semibold cc-text-primary">Bloques de 2 horas</p>
                            </div>
                        </div>

                        {/* Date Strip 7 Días */}
                        <div className="space-y-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] cc-text-tertiary">Selecciona un día</p>
                            <div className="flex gap-7 overflow-x-auto border-b scrollbar-none" style={{ borderColor: "var(--cc-line-strong)" }}>
                                {next7Days.map(day => {
                                    const isSelected = selectedDate === day.dateStr;
                                    return (
                                        <button
                                            key={day.dateStr}
                                            onClick={() => { setSelectedDate(day.dateStr); setSelectedTime(''); }}
                                            className={`min-w-[48px] border-b-2 py-3 text-center transition-all ${isSelected ? 'border-copper' : 'border-transparent'}`}
                                        >
                                            <p className="text-[10px] font-bold uppercase tracking-wider cc-text-tertiary">{day.dayName}</p>
                                            <p className={`mt-1 text-xl font-normal ${isSelected ? 'text-copper' : 'cc-text-primary'}`} style={{ fontFamily: "var(--cc-font-display)" }}>{day.dayNumber}</p>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Slots como cards con estados */}
                        <div className="space-y-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] cc-text-tertiary">Bloques de dos horas</p>
                            <div className="grid grid-cols-1 gap-x-10 sm:grid-cols-2 lg:grid-cols-3">
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
                                            className={`flex items-center justify-between border-t py-4 text-left transition-all ${isBooked ? 'cursor-not-allowed cc-text-disabled' : 'cc-text-primary'} ${isSelected ? 'font-semibold text-copper' : ''}`}
                                            style={{ borderColor: "var(--cc-line)" }}
                                        >
                                            <p className="font-mono text-sm">{time}</p>
                                            <p className="text-[10px] uppercase tracking-wider font-semibold opacity-80">
                                                {isBooked ? "Reservado" : isSelected ? "Seleccionado" : "Libre"}
                                            </p>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Fixed / Floating CTA Bar at Bottom */}
                        {selectedDate && selectedTime && (
                            <div className="sticky bottom-3 z-40 border bg-paper px-4 py-4 shadow-xl sm:px-6" style={{ borderColor: "var(--cc-line-strong)" }}>
                                <div className="mx-auto flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="text-sm font-medium cc-text-primary">
                                        Confirmando <span className="font-bold">{selectedAmenity.name}</span> para el <span className="font-bold">{new Date(`${selectedDate}T12:00:00`).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}</span> a las <span className="font-bold">{selectedTime}</span>
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
