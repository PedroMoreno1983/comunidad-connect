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
import { Booking } from "@/lib/types";
import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

// TAILWIND SAFELIST FOR DYNAMIC DB GRADIENTS:
// from-orange-500 to-red-600 from-cyan-400 to-blue-600 from-fuchsia-500 to-pink-600 
// from-slate-600 to-slate-900 from-emerald-400 to-teal-600 from-violet-500 to-purple-700 
// from-purple-500 to-pink-500 from-blue-500 to-indigo-600

// Icon mapping for amenities
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    Flame,
    Waves,
    PartyPopper,
    Dumbbell,
    Monitor,
    Gamepad2,
};

export default function AmenitiesPage() {
    const { user } = useAuth();
    const [bookings, setBookings] = useState<any[]>([]);
    const [amenities, setAmenities] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [bookingLoading, setBookingLoading] = useState(false);
    const [selectedAmenity, setSelectedAmenity] = useState<any | null>(null);
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
            setAmenities(amenitiesData || []);
            setBookings(bookingsData || []);
        } catch (error: any) {
            console.error("Error loading amenities data:", error?.message || error);
            setAmenities([]);
            setBookings([]);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenBooking = (amenity: any) => {
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
            b.amenity_id === selectedAmenity.id &&
            b.date === selectedDate &&
            b.start_time.startsWith(selectedTime.split(':')[0])
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
            const newBooking = await AmenitiesService.createBooking({
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
        } catch (error: any) {
            toast({
                title: "Error al reservar",
                description: error.message || "Hubo un problema procesando tu reserva.",
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

    const userBookings = bookings.filter(b => b.user_id === user?.id);

    const getIcon = (iconName: string) => {
        return iconMap[iconName] || Calendar;
    };

    return (
        <div className="max-w-7xl space-y-8">
            {/* Header */}
            <div>
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl">
                        <Calendar className="h-5 w-5 text-white" />
                    </div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Espacios Comunes</h1>
                </div>
                <p className="text-slate-500 dark:text-slate-400">
                    Reserva amenidades del edificio para tu uso exclusivo
                </p>
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
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {amenities.map((amenity, idx) => {
                            const Icon = getIcon(amenity.icon_name);
                            const gradient = amenity.gradient || 'from-blue-500 to-indigo-600';
                            return (
                                <article
                                    key={amenity.id}
                                    className="group relative bg-white/60 dark:bg-slate-800/40 backdrop-blur-xl rounded-3xl shadow-xl shadow-slate-200/20 dark:shadow-black/40 border border-white/50 dark:border-slate-700/50 overflow-hidden hover:shadow-2xl hover:border-white/80 dark:hover:border-slate-600 hover:-translate-y-1 transition-all duration-300 animate-slide-up opacity-0"
                                    style={{ animationDelay: `${idx * 0.1}s`, animationFillMode: 'forwards' }}
                                >
                                    {/* Background glow effect behind the card */}
                                    <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-[0.03] transition-opacity duration-500`}></div>
                                    {/* Professional Icon Banner */}
                                    <div className={`relative h-32 bg-gradient-to-br ${gradient} flex items-center justify-center overflow-hidden`}>
                                        {/* Decorative circles */}
                                        <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -translate-y-12 translate-x-12" />
                                        <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full translate-y-16 -translate-x-16" />

                                        {/* Icon */}
                                        <div className="relative p-4 bg-white/20 backdrop-blur-sm rounded-2xl group-hover:scale-110 transition-transform duration-300">
                                            <Icon className="h-10 w-10 text-white" />
                                        </div>

                                        {amenity.hourly_rate > 0 && (
                                            <div className="absolute top-3 right-3 px-2.5 py-1 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-full shadow-lg">
                                                ${amenity.hourly_rate.toLocaleString()}/hr
                                            </div>
                                        )}
                                        {amenity.hourly_rate === 0 && (
                                            <div className="absolute top-3 right-3 px-2.5 py-1 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm text-emerald-600 dark:text-emerald-400 text-xs font-semibold rounded-full flex items-center gap-1 shadow-lg">
                                                <Sparkles className="h-3 w-3" />
                                                Gratis
                                            </div>
                                        )}
                                    </div>

                                    {/* Content */}
                                    <div className="p-5">
                                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{amenity.name}</h3>
                                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 line-clamp-2">{amenity.description}</p>

                                        <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400 mb-5">
                                            <div className="flex items-center gap-1.5">
                                                <Users className="h-4 w-4 text-slate-400" />
                                                <span>Máx. {amenity.max_capacity}</span>
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => handleOpenBooking(amenity)}
                                            className={`w-full py-3 bg-gradient-to-r ${gradient} text-white font-semibold rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 relative z-10`}
                                        >
                                            Reservar Ahora
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
                    <div className="bg-white/60 dark:bg-slate-800/40 backdrop-blur-xl rounded-3xl shadow-xl shadow-slate-200/20 dark:shadow-black/40 border border-white/50 dark:border-slate-700/50 p-6">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-purple-100 dark:bg-purple-500/20 rounded-lg">
                                <Check className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                            </div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Mis Reservas</h2>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {userBookings.map((booking) => {
                                const amenity = booking.amenities;
                                if (!amenity) return null;
                                const Icon = getIcon(amenity.icon_name);
                                return (
                                    <div key={booking.id} className={`flex items-center gap-4 p-4 bg-white/40 dark:bg-slate-800/40 backdrop-blur-md rounded-2xl border border-white/50 dark:border-slate-700/50 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group`}>
                                        <div className={`absolute inset-0 bg-gradient-to-r ${amenity.gradient} opacity-5 group-hover:opacity-10 transition-opacity`}></div>
                                        <div className={`p-2 rounded-lg bg-gradient-to-br ${amenity.gradient}`}>
                                            <Icon className="h-5 w-5 text-white" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-slate-900 dark:text-white truncate">{amenity.name}</p>
                                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                                {
                                                    // Prevenir desfase de zona horaria forzando el parseo local a mediodía
                                                    new Date(`${booking.date}T12:00:00`).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })
                                                }
                                            </p>
                                            <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">{booking.start_time.substring(0, 5)} - {booking.end_time.substring(0, 5)}</p>
                                        </div>
                                        <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${booking.status === 'confirmed' ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400' : 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400'
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
                                <div className={`p-2 rounded-lg bg-gradient-to-br ${selectedAmenity.gradient}`}>
                                    {(() => { const Icon = getIcon(selectedAmenity.icon_name); return <Icon className="h-5 w-5 text-white" />; })()}
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
                                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                                >
                                    <ChevronLeft className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                                </button>
                                <span className="text-sm font-semibold text-slate-900 dark:text-white capitalize">{monthName}</span>
                                <button
                                    onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
                                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                                >
                                    <ChevronRight className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                                </button>
                            </div>
                            <div className="grid grid-cols-7 gap-1 text-center">
                                {['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'].map(day => (
                                    <div key={day} className="text-xs font-medium text-slate-500 dark:text-slate-400 py-2">{day}</div>
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
                                                ? `bg-gradient-to-r ${selectedAmenity?.gradient || 'from-purple-500 to-pink-500'} text-white shadow-lg`
                                                : isPast
                                                    ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                                                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
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
                                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                    <Clock className="h-4 w-4 text-slate-400" />
                                    Horario Disponible
                                </label>
                                <div className="grid grid-cols-4 gap-2">
                                    {timeSlots.map(time => {
                                        const isBooked = bookings.some(b =>
                                            b.amenity_id === selectedAmenity?.id &&
                                            b.date === selectedDate &&
                                            b.start_time.startsWith(time.split(':')[0])
                                        );
                                        return (
                                            <button
                                                key={time}
                                                disabled={isBooked}
                                                onClick={() => setSelectedTime(time)}
                                                className={`py-2 px-3 rounded-lg text-sm font-medium transition-all ${isBooked
                                                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed line-through'
                                                    : selectedTime === time
                                                        ? `bg-gradient-to-r ${selectedAmenity?.gradient || 'from-purple-500 to-pink-500'} text-white shadow-lg`
                                                        : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
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
                            className={`bg-gradient-to-r ${selectedAmenity?.gradient || 'from-purple-500 to-pink-500'} border-0 flex gap-2`}
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
