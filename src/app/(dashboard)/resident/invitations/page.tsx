"use client";

import { QRInvitationGenerator } from "@/components/resident/QRInvitationGenerator";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/authContext";
import { InvitationService } from "@/lib/services/supabaseServices";
import {
    QrCode, UserCheck, Clock, Share2,
    ChevronRight, ShieldCheck, History, Info
} from "lucide-react";
import { motion } from "framer-motion";

export default function ResidentInvitationsPage() {
    const { user } = useAuth();
    const [invitations, setInvitations] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchInvitations = async () => {
            if (!user) return;
            try {
                setIsLoading(true);
                const data = await InvitationService.getByResident(user.id);
                if (data) {
                    setInvitations(data.map((inv) => ({
                        id: inv.id,
                        residentId: inv.resident_id,
                        guestName: inv.guest_name,
                        guestDni: inv.guest_dni,
                        status: inv.status || 'active',
                        validFrom: inv.valid_from,
                        validTo: inv.valid_to,
                        qrCode: inv.qr_code
                    })));
                }
            } catch (error) {
                console.error("Error fetching invitations:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchInvitations();
    }, [user]);

    const activeInvitations = invitations.filter(i => i.status === 'active');
    const pastInvitations = invitations.filter(i => i.status !== 'active');

    return (
        <div className="max-w-7xl mx-auto py-10 px-4 md:px-8 space-y-12">
            {/* Professional Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
                <div className="space-y-2">
                    <h2 className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-[0.3em]">Gestión de Accesos</h2>
                    <h1 className="text-4xl font-black text-slate-900 dark:text-white">Mis Invitados</h1>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-12">
                {/* Left Side: Generator */}
                <div className="lg:col-span-2">
                    <QRInvitationGenerator />
                </div>

                {/* Right Side: Active Invitations & History */}
                <div className="lg:col-span-3 space-y-10">
                    {/* Active Cards */}
                    <div className="space-y-6">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl">
                                <ShieldCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                            </div>
                            <h2 className="text-2xl font-black text-slate-900 dark:text-white">Pases Activos</h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {isLoading && <p className="text-slate-500">Cargando invitaciones...</p>}
                            {!isLoading && activeInvitations.length === 0 && <p className="text-slate-500">No hay pases activos.</p>}
                            {activeInvitations.map((inv) => (
                                <motion.div
                                    key={inv.id}
                                    whileHover={{ y: -5 }}
                                    className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-xl shadow-slate-200/20 dark:shadow-none space-y-4"
                                >
                                    <div className="flex justify-between items-start">
                                        <div className="h-12 w-12 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400">
                                            <QrCode className="h-6 w-6" />
                                        </div>
                                        <div className="px-3 py-1 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg text-[10px] font-black uppercase tracking-wider">
                                            Activo
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-black text-slate-900 dark:text-white">{inv.guestName}</h3>
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{inv.guestDni}</p>
                                    </div>
                                    <div className="pt-4 border-t border-slate-50 dark:border-slate-800 flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-xs text-slate-400 font-bold">
                                            <Clock className="h-4 w-4" />
                                            <span>
                                                Vence: {new Date(inv.validTo).toLocaleString('es-CL', {
                                                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                                                })}
                                            </span>
                                        </div>
                                        <button className="p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors" title="Compartir Código">
                                            <Share2 className="h-4 w-4 text-slate-400" />
                                        </button>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>

                    {/* History List */}
                    <div className="space-y-6">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-2xl">
                                <History className="h-6 w-6 text-slate-900 dark:text-white" />
                            </div>
                            <h2 className="text-2xl font-black text-slate-900 dark:text-white">Bitácora de Visitas</h2>
                        </div>

                        <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 overflow-hidden shadow-xl shadow-slate-200/20 dark:shadow-none">
                            <div className="divide-y divide-slate-50 dark:divide-slate-800">
                                {isLoading && <div className="p-10 text-center text-slate-500">Cargando historial...</div>}
                                {!isLoading && pastInvitations.map((inv) => (
                                    <div key={inv.id} className="p-8 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                                        <div className="flex items-center gap-5">
                                            <div className="h-12 w-12 rounded-2xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-400 font-bold">
                                                {inv.guestName.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="font-black text-slate-900 dark:text-white">{inv.guestName}</p>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                                    Generado el {new Date(inv.validFrom).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                                                </p>
                                            </div>
                                        </div>
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                            {inv.status === 'expired' ? 'Expirado' : inv.status === 'cancelled' ? 'Cancelado' : 'Usado'}
                                        </span>
                                    </div>
                                ))}
                                {!isLoading && pastInvitations.length === 0 && (
                                    <div className="p-10 text-center text-slate-400 font-bold italic">
                                        No hay registros históricos.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
