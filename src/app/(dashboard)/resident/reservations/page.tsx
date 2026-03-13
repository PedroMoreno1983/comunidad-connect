"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/authContext";
import { ReservationService } from "@/lib/services/supabaseServices";
import {
    Calendar as CalendarIcon, MapPin, Users, Info,
    CheckCircle2, Clock, Plus
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { motion } from "framer-motion";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/Dialog";

export default function ReservationsPage() {
    const { user } = useAuth();
    const [amenities, setAmenities] = useState<any[]>([]);
    const [myBookings, setMyBookings] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    // Booking Form State
    const [selectedAmenity, setSelectedAmenity] = useState<string>("");
    const [bookingDate, setBookingDate] = useState<string>("");
    const [bookingStart, setBookingStart] = useState<string>("");
    const [bookingEnd, setBookingEnd] = useState<string>("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { toast } = useToast();

    useEffect(() => {
        const loadData = async () => {
            if (!user) return;
            setIsLoading(true);
            try {
                const [amenitiesData, bookingsData] = await Promise.all([
                    ReservationService.getAmenities(),
                    ReservationService.getBookingsByUser(user.id)
                ]);
                setAmenities(amenitiesData);
                setMyBookings(bookingsData);
            } catch (error) {
                console.error("Error loading reservations data:", error);
            } finally {
                setIsLoading(false);
            }
        };

        loadData();
    }, [user]);

    const handleCreateBooking = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setIsSubmitting(true);

        try {
            const newBooking = await ReservationService.createBooking({
                amenity_id: selectedAmenity,
                user_id: user.id,
                date: bookingDate,
                start_time: bookingStart,
                end_time: bookingEnd
            });

            // Find amenity name for local state
            const amenityData = amenities.find(a => a.id === selectedAmenity);

            // Prepend new booking locally
            setMyBookings([{
                ...newBooking,
                amenities: { name: amenityData?.name, icon_name: amenityData?.icon_name, gradient: amenityData?.gradient }
            }, ...myBookings]);

            toast({
                title: "Reserva Solicitada",
                description: "Tu reserva ha sido enviada a Administración para su aprobación.",
                variant: "success"
            });
            setIsDialogOpen(false);

            // reset form
            setSelectedAmenity("");
            setBookingDate("");
            setBookingStart("");
            setBookingEnd("");

        } catch (error) {
            console.error(error);
            toast({
                title: "Error",
                description: "No se pudo procesar la reserva. Verifica la disponibilidad.",
                variant: "destructive"
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="max-w-7xl mx-auto py-10 px-4 md:px-8 space-y-12">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
                <div className="space-y-2">
                    <h2 className="text-[10px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-[0.3em]">Instalaciones</h2>
                    <h1 className="text-4xl font-black text-slate-900 dark:text-white">Amenidades y Reservas</h1>
                </div>

                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <button className="flex items-center gap-3 px-8 py-4 bg-slate-900 dark:bg-slate-800 text-white font-black rounded-2xl border border-white/50 dark:border-slate-700/50 hover:bg-slate-800 dark:hover:bg-slate-700 transition-all shadow-xl active:scale-95">
                            <Plus className="h-5 w-5" />
                            Nueva Reserva
                        </button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[480px] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-white/20 dark:border-slate-800 rounded-[2.5rem] p-10 shadow-2xl">
                        <DialogHeader>
                            <DialogTitle className="text-2xl font-black">Solicitar Reserva</DialogTitle>
                            <DialogDescription className="font-medium">
                                Elige el espacio y el horario deseado.
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleCreateBooking} className="space-y-6 pt-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Espacio Común</label>
                                <select
                                    className="w-full h-14 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 appearance-none cursor-pointer"
                                    required
                                    value={selectedAmenity}
                                    onChange={(e) => setSelectedAmenity(e.target.value)}
                                >
                                    <option value="">Seleccionar Amenidad</option>
                                    {amenities.map(a => (
                                        <option key={a.id} value={a.id}>{a.name} (Max {a.max_capacity} px)</option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Fecha</label>
                                <Input
                                    type="date"
                                    required
                                    className="h-14 rounded-2xl font-bold"
                                    value={bookingDate}
                                    onChange={(e) => setBookingDate(e.target.value)}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Hora Inicio</label>
                                    <Input
                                        type="time"
                                        required
                                        className="h-14 rounded-2xl font-bold"
                                        value={bookingStart}
                                        onChange={(e) => setBookingStart(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Hora Fin</label>
                                    <Input
                                        type="time"
                                        required
                                        className="h-14 rounded-2xl font-bold"
                                        value={bookingEnd}
                                        onChange={(e) => setBookingEnd(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="p-4 bg-rose-50 dark:bg-rose-500/10 rounded-2xl flex gap-3">
                                <Info className="h-5 w-5 text-rose-500 shrink-0" />
                                <p className="text-[11px] font-medium text-slate-500 leading-relaxed">
                                    La reserva está sujeta a aprobación por parte de la administración. Cualquier cobro adicional se notificará por interno.
                                </p>
                            </div>

                            <DialogFooter className="pt-4">
                                <Button type="submit" disabled={isSubmitting} className="w-full h-16 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-black text-lg shadow-xl shadow-rose-500/20 transition-all hover:scale-[1.02]">
                                    {isSubmitting ? "Procesando..." : "Confirmar Solicitud"}
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                {/* Amenity Catalog Grid */}
                <div className="lg:col-span-2 space-y-6">
                    <h3 className="font-black text-slate-900 dark:text-white text-xl flex items-center gap-3">
                        <MapPin className="h-5 w-5 text-slate-400" />
                        Espacios Disponibles
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {isLoading && <p className="text-slate-500">Cargando instalaciones...</p>}
                        {!isLoading && amenities.map(amenity => (
                            <motion.div
                                key={amenity.id}
                                whileHover={{ y: -5 }}
                                className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-xl shadow-slate-200/20 dark:shadow-none relative overflow-hidden group"
                            >
                                <div className={`absolute top-0 left-0 w-2 h-full ${amenity.gradient || 'bg-slate-500'}`} />
                                <div className="pl-4 space-y-4">
                                    <h4 className="text-2xl font-black text-slate-900 dark:text-white">{amenity.name}</h4>
                                    <p className="text-sm font-medium text-slate-500 line-clamp-2 leading-relaxed">
                                        {amenity.description}
                                    </p>

                                    <div className="pt-4 border-t border-slate-50 dark:border-slate-800 flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                                            <Users className="h-4 w-4" />
                                            <span>Capacidad: {amenity.max_capacity}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400">
                                            {amenity.hourly_rate > 0 ? `$${amenity.hourly_rate} / hr` : 'Gratuito'}
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>

                {/* My Bookings Log */}
                <div className="lg:col-span-1 space-y-6">
                    <h3 className="font-black text-slate-900 dark:text-white text-xl flex items-center gap-3">
                        <CalendarIcon className="h-5 w-5 text-slate-400" />
                        Mis Reservas
                    </h3>

                    <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 overflow-hidden shadow-xl shadow-slate-200/20 dark:shadow-none">
                        <div className="divide-y divide-slate-50 dark:divide-slate-800">
                            {isLoading && <div className="p-10 text-center text-slate-500 font-bold">Cargando bitácora...</div>}

                            {!isLoading && myBookings.length === 0 && (
                                <div className="p-10 text-center text-slate-400 font-bold italic">
                                    No tienes reservas activas.
                                </div>
                            )}

                            {!isLoading && myBookings.map(booking => (
                                <div key={booking.id} className="p-6 hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <p className="font-black text-slate-900 dark:text-white">{booking.amenities?.name || 'Amenidad Desconocida'}</p>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                                                {new Date(booking.date).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'short' })}
                                            </p>
                                        </div>
                                        {booking.status === 'confirmed' ? (
                                            <div className="px-3 py-1 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 text-[10px] font-black uppercase tracking-wider rounded-lg flex items-center gap-1">
                                                <CheckCircle2 className="h-3 w-3" />
                                                Aprobado
                                            </div>
                                        ) : booking.status === 'cancelled' ? (
                                            <div className="px-3 py-1 bg-rose-50 dark:bg-rose-500/10 text-rose-600 text-[10px] font-black uppercase tracking-wider rounded-lg">
                                                Rechazado
                                            </div>
                                        ) : (
                                            <div className="px-3 py-1 bg-amber-50 dark:bg-amber-500/10 text-amber-600 text-[10px] font-black uppercase tracking-wider rounded-lg flex items-center gap-1">
                                                <Clock className="h-3 w-3" />
                                                Pendiente
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                                        <Clock className="h-3.5 w-3.5" />
                                        <span>{booking.start_time.substring(0, 5)} hrs — {booking.end_time.substring(0, 5)} hrs</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
