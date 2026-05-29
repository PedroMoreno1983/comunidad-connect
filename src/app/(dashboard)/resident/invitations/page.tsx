"use client";

import { GeneratedInvitation, QRInvitationGenerator } from "@/components/resident/QRInvitationGenerator";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/authContext";
import { InvitationService } from "@/lib/services/supabaseServices";
import {
    QrCode, Clock, Share2,
    ShieldCheck, History
} from "lucide-react";
import { motion } from "framer-motion";

interface Invitation {
    id: string;
    residentId: string;
    guestName: string;
    guestDni: string;
    status: 'active' | 'used' | 'expired' | 'cancelled';
    validFrom: string;
    validTo: string;
    qrCode: string;
}

type InvitationRow = {
    id: string;
    resident_id?: string | null;
    guest_name?: string | null;
    guest_dni?: string | null;
    status?: Invitation["status"] | null;
    valid_from?: string | null;
    valid_to?: string | null;
    qr_code?: string | null;
};

function mapInvitationRow(invitation: InvitationRow): Invitation {
    return {
        id: invitation.id,
        residentId: invitation.resident_id || "",
        guestName: invitation.guest_name || "Invitado",
        guestDni: invitation.guest_dni || "",
        status: invitation.status || "active",
        validFrom: invitation.valid_from || new Date().toISOString(),
        validTo: invitation.valid_to || new Date().toISOString(),
        qrCode: invitation.qr_code || "",
    };
}

const demoInvitations: Invitation[] = [
    { id: "demo-inv-1", residentId: "demo", guestName: "Ana Garcia", guestDni: "12.345.678-9", status: "active", validFrom: new Date().toISOString(), validTo: new Date(Date.now() + 8 * 36e5).toISOString(), qrCode: "INV-DEMO-ANA" },
    { id: "demo-inv-2", residentId: "demo", guestName: "Martin Soto", guestDni: "18.222.111-5", status: "used", validFrom: new Date(Date.now() - 2 * 864e5).toISOString(), validTo: new Date(Date.now() - 864e5).toISOString(), qrCode: "INV-DEMO-MAR" },
];

export default function ResidentInvitationsPage() {
    const { user } = useAuth();
    const [invitations, setInvitations] = useState<Invitation[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchInvitations = async () => {
            if (!user) return;
            try {
                setIsLoading(true);
                if (user.email.toLowerCase().endsWith("@demo.com")) {
                    setInvitations(demoInvitations);
                    return;
                }

                const data = await InvitationService.getByResident(user.id);
                if (data) setInvitations((data as InvitationRow[]).map(mapInvitationRow));
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
    const handleGenerated = (invitation: GeneratedInvitation) => {
        setInvitations(current => [invitation, ...current]);
    };

    return (
        <div className="max-w-7xl mx-auto py-10 px-4 md:px-8 space-y-12">
            {/* Professional Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
                <div className="space-y-2">
                    <h2 className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-[0.08em]">Gestión de Accesos</h2>
                    <h1 className="text-3xl font-semibold cc-text-primary">Mis Invitados</h1>
                    <p className="max-w-2xl text-sm cc-text-secondary">
                        Genera pases QR, comparte accesos temporales y revisa el historial de visitas asociadas a tu unidad.
                    </p>
                </div>
            </div>

            <section className="grid gap-4 md:grid-cols-3">
                {[
                    { label: "Pases activos", value: activeInvitations.length, icon: <ShieldCheck className="h-5 w-5" /> },
                    { label: "Historial", value: pastInvitations.length, icon: <History className="h-5 w-5" /> },
                    { label: "Flujo seguro", value: "QR", icon: <QrCode className="h-5 w-5" /> },
                ].map(item => (
                    <div key={item.label} className="rounded-lg border border-subtle bg-surface p-5 shadow-sm">
                        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-elevated cc-text-secondary">
                            {item.icon}
                        </div>
                        <p className="text-2xl font-semibold cc-text-primary">{item.value}</p>
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] cc-text-secondary">{item.label}</p>
                    </div>
                ))}
            </section>

            <section className="rounded-lg border border-subtle bg-surface p-5 shadow-sm">
                <div className="grid gap-4 md:grid-cols-3">
                    {[
                        { title: "Generar", description: "Crea un pase temporal con nombre, documento y vigencia.", icon: <QrCode className="h-4 w-4" /> },
                        { title: "Compartir", description: "Envia el codigo al invitado para ingreso controlado por conserjeria.", icon: <Share2 className="h-4 w-4" /> },
                        { title: "Auditar", description: "El uso queda en bitacora para revisar entradas pasadas.", icon: <History className="h-4 w-4" /> },
                    ].map(item => (
                        <div key={item.title} className="flex gap-4 rounded-lg border border-subtle bg-elevated/40 p-4">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface cc-text-secondary">
                                {item.icon}
                            </div>
                            <div>
                                <h2 className="font-semibold cc-text-primary">{item.title}</h2>
                                <p className="mt-1 text-sm leading-6 cc-text-secondary">{item.description}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-12">
                {/* Left Side: Generator */}
                <div className="lg:col-span-2">
                    <QRInvitationGenerator onGenerated={handleGenerated} />
                </div>

                {/* Right Side: Active Invitations & History */}
                <div className="lg:col-span-3 space-y-10">
                    {/* Active Cards */}
                    <div className="space-y-6">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-success-bg rounded-lg">
                                <ShieldCheck className="h-6 w-6 text-success-fg" />
                            </div>
                            <h2 className="text-2xl font-semibold cc-text-primary">Pases Activos</h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {isLoading && <p className="text-slate-500">Cargando invitaciones...</p>}
                            {!isLoading && activeInvitations.length === 0 && <p className="text-slate-500">No hay pases activos.</p>}
                            {activeInvitations.map((inv) => (
                                <motion.div
                                    key={inv.id}
                                    whileHover={{ y: -5 }}
                                    className="bg-surface p-8 rounded-lg border border-subtle shadow-sm shadow-slate-200/20 dark:shadow-none space-y-4"
                                >
                                    <div className="flex justify-between items-start">
                                        <div className="h-12 w-12 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400">
                                            <QrCode className="h-6 w-6" />
                                        </div>
                                        <div className="px-3 py-1 bg-success-bg text-success-fg rounded-lg text-[10px] font-semibold uppercase tracking-wider">
                                            Activo
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-semibold cc-text-primary">{inv.guestName}</h3>
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.08em]">{inv.guestDni}</p>
                                    </div>
                                    <div className="pt-4 border-t border-subtle flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-xs text-slate-400 font-bold">
                                            <Clock className="h-4 w-4" />
                                            <span>
                                                Vence: {new Date(inv.validTo).toLocaleString('es-CL', {
                                                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                                                })}
                                            </span>
                                        </div>
                                        <button className="p-2 hover:bg-elevated rounded-lg transition-colors" title="Compartir Código">
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
                            <div className="p-3 bg-elevated rounded-lg">
                                <History className="h-6 w-6 cc-text-primary" />
                            </div>
                            <h2 className="text-2xl font-semibold cc-text-primary">Bitácora de Visitas</h2>
                        </div>

                        <div className="bg-surface rounded-lg border border-subtle overflow-hidden shadow-sm shadow-slate-200/20 dark:shadow-none">
                            <div className="divide-y divide-slate-50 dark:divide-slate-800">
                                {isLoading && <div className="p-10 text-center text-slate-500">Cargando historial...</div>}
                                {!isLoading && pastInvitations.map((inv) => (
                                    <div key={inv.id} className="p-8 flex items-center justify-between hover:bg-elevated/20 transition-colors">
                                        <div className="flex items-center gap-5">
                                            <div className="h-12 w-12 rounded-lg bg-elevated flex items-center justify-center text-slate-400 font-bold">
                                                {inv.guestName.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="font-semibold cc-text-primary">{inv.guestName}</p>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.08em]">
                                                    Generado el {new Date(inv.validFrom).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                                                </p>
                                            </div>
                                        </div>
                                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.08em]">
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
