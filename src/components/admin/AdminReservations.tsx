"use client";

import { useState, useEffect } from "react";
import { Calendar as CalendarIcon, Clock, Users, Check, X, Building } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/Toast";

interface Booking {
    id: string;
    date: string;
    start_time?: string | null;
    end_time?: string | null;
    status: 'pending' | 'confirmed' | 'cancelled';
    created_at?: string | null;
    profiles?: Relation<{ name?: string | null; email?: string | null }>;
    amenities?: Relation<{ name?: string | null; icon_name?: string | null; gradient?: string | null }>;
}

type Relation<T> = T | T[] | null | undefined;

function firstRelation<T>(value: Relation<T>): T | null {
    if (Array.isArray(value)) return value[0] ?? null;
    return value ?? null;
}

function formatTime(value?: string | null) {
    return typeof value === 'string' && value.length > 0 ? value.slice(0, 5) : '--:--';
}

function formatDate(value?: string | null) {
    if (!value) return 'Sin fecha';
    const date = new Date(value.includes('T') ? value : `${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('es-CL');
}

export function AdminReservations() {
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const { toast } = useToast();

    const fetchBookings = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('bookings')
                .select(`
                    id, date, start_time, end_time, status, created_at,
                    profiles:user_id (name, email),
                    amenities:amenity_id (name, icon_name, gradient)
                `)
                .order('created_at', { ascending: false });

            if (data && !error) {
                setBookings(data as unknown as Booking[]);
            }
        } catch (err) {
            console.error("Error fetching bookings:", err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchBookings();
    }, []);

    const handleUpdateStatus = async (id: string, newStatus: 'confirmed' | 'cancelled') => {
        try {
            const { error } = await supabase
                .from('bookings')
                .update({ status: newStatus })
                .eq('id', id);

            if (error) throw error;

            toast({
                title: newStatus === 'confirmed' ? "Reserva Aprobada" : "Reserva Rechazada",
                description: "Se ha notificado al residente sobre la resolución.",
                variant: newStatus === 'confirmed' ? "success" : "destructive"
            });

            // Update local state without fetching again
            setBookings(prev => prev.map((b: Booking) => b.id === id ? { ...b, status: newStatus } : b));

        } catch (err: unknown) {
            console.error("Error updating booking status", err);
            toast({
                title: "Error",
                description: "No se pudo actualizar el estado de la reserva",
                variant: "destructive"
            });
        }
    };

    const pendingCount = bookings.filter((b: Booking) => b.status === 'pending').length;

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-2xl font-black cc-text-primary flex items-center gap-3">
                        <CalendarIcon className="h-6 w-6 text-rose-500" />
                        Aprobación de Reservas
                    </h3>
                    <p className="text-sm font-medium text-slate-500 mt-1">Gestión de quinchos, salones y espacios comúnes.</p>
                </div>
                {pendingCount > 0 && (
                    <div className="px-4 py-2 bg-warning-bg text-warning-fg rounded-2xl text-xs font-black uppercase tracking-widest flex items-center gap-2 border border-amber-100 dark:border-amber-500/20 shadow-xl shadow-amber-500/10">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                        </span>
                        {pendingCount} Pendiente{pendingCount > 1 && 's'}
                    </div>
                )}
            </div>

            <div className="bg-surface rounded-[3rem] border border-subtle shadow-xl shadow-slate-200/20 dark:shadow-none overflow-hidden">
                <div className="divide-y divide-slate-50 dark:divide-slate-800">
                    {isLoading && <div className="p-10 text-center text-slate-500 font-bold">Cargando solicitudes...</div>}
                    {!isLoading && bookings.length === 0 && (
                        <div className="p-16 text-center space-y-4 flex flex-col items-center justify-center">
                            <div className="w-20 h-20 bg-elevated rounded-[2rem] flex items-center justify-center text-slate-300">
                                <Building className="h-10 w-10" />
                            </div>
                            <p className="text-slate-500 font-bold italic max-w-[200px]">No hay reservas solicitadas por el momento.</p>
                        </div>
                    )}

                    {!isLoading && bookings.map((booking: Booking) => {
                        const amenity = firstRelation(booking.amenities);
                        const resident = firstRelation(booking.profiles);

                        return (
                        <div key={booking.id} className="p-8 hover:bg-elevated/50 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-6">

                            <div className="flex items-start gap-6">
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${amenity?.gradient || 'bg-slate-200'} text-white shadow-lg`}>
                                    <CalendarIcon className="h-7 w-7" />
                                </div>
                                <div className="space-y-1">
                                    <div className="flex items-center gap-3">
                                        <h4 className="text-xl font-black cc-text-primary">
                                            {amenity?.name || 'Espacio Desconocido'}
                                        </h4>
                                        {booking.status === 'pending' && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[9px] font-black uppercase tracking-wider rounded-md">Pendiente</span>}
                                        {booking.status === 'confirmed' && <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[9px] font-black uppercase tracking-wider rounded-md">Aprobado</span>}
                                        {booking.status === 'cancelled' && <span className="px-2 py-0.5 bg-rose-100 text-rose-700 text-[9px] font-black uppercase tracking-wider rounded-md">Rechazado</span>}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-slate-500">
                                        <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                                            <Users className="h-4 w-4" />
                                            {resident?.name || resident?.email || 'Residente'}
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <CalendarIcon className="h-4 w-4" />
                                            {formatDate(booking.date)}
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <Clock className="h-4 w-4" />
                                            {formatTime(booking.start_time)} - {formatTime(booking.end_time)}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {booking.status === 'pending' ? (
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => handleUpdateStatus(booking.id, 'confirmed')}
                                        className="h-12 px-6 bg-emerald-50 hover:bg-emerald-500 hover:text-white text-emerald-600 dark:bg-emerald-500/10 dark:hover:bg-emerald-500 rounded-2xl font-black text-sm flex items-center gap-2 transition-all active:scale-95"
                                    >
                                        <Check className="h-5 w-5" /> Aprobar
                                    </button>
                                    <button
                                        onClick={() => handleUpdateStatus(booking.id, 'cancelled')}
                                        className="h-12 w-12 bg-rose-50 hover:bg-rose-500 hover:text-white text-rose-600 dark:bg-rose-500/10 dark:hover:bg-rose-500 rounded-2xl flex items-center justify-center transition-all active:scale-95"
                                        title="Rechazar"
                                    >
                                        <X className="h-5 w-5" />
                                    </button>
                                </div>
                            ) : (
                                <div className="text-right">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        Solicitado el {formatDate(booking.created_at)}
                                    </p>
                                </div>
                            )}

                        </div>
                    )})}
                </div>
            </div>
        </div>
    );
}
