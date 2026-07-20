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
import { EmptyState } from "@/components/ui/EmptyState";
import { Eyebrow, DisplayHeading } from "@/components/cc/Eyebrow";

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

export default function ResidentInvitationsPage() {
    const { user } = useAuth();
    const [invitations, setInvitations] = useState<Invitation[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchInvitations = async () => {
            if (!user) return;
            try {
                setIsLoading(true);
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
        <div className="max-w-7xl mx-auto py-6 px-4 sm:py-10 md:px-8 space-y-10 sm:space-y-12">
            {/* Professional Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
                <div className="space-y-2">
                    <Eyebrow>Gestión de Accesos</Eyebrow>
                    <DisplayHeading size={32}>Mis Invitados</DisplayHeading>
                    <p className="max-w-2xl text-sm font-medium cc-text-secondary">
                        Genera pases QR, comparte accesos temporales y revisa el historial de visitas asociadas a tu unidad.
                    </p>
                </div>
            </div>

            <section className="grid gap-4 sm:grid-cols-3">
                {[
                    { label: "Pases activos", value: activeInvitations.length, icon: <ShieldCheck className="h-5 w-5" /> },
                    { label: "Historial", value: pastInvitations.length, icon: <History className="h-5 w-5" /> },
                    { label: "Flujo seguro", value: "QR", icon: <QrCode className="h-5 w-5" /> },
                ].map(item => (
                    <div key={item.label} className="rounded-2xl border p-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full" style={{ background: "var(--cc-copper-tint)", color: "var(--cc-copper)" }}>
                            {item.icon}
                        </div>
                        <p className="text-2xl font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>{item.value}</p>
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] cc-text-secondary">{item.label}</p>
                    </div>
                ))}
            </section>

            <section className="rounded-2xl border p-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                <div className="grid gap-4 md:grid-cols-3">
                    {[
                        { title: "Generar", description: "Crea un pase temporal con nombre, documento y vigencia.", icon: <QrCode className="h-4 w-4" /> },
                    { title: "Compartir", description: "Envía el código al invitado para un ingreso controlado por Conserjería.", icon: <Share2 className="h-4 w-4" /> },
                        { title: "Auditar", description: "El uso queda en bitacora para revisar entradas pasadas.", icon: <History className="h-4 w-4" /> },
                    ].map(item => (
                        <div key={item.title} className="flex gap-4 rounded-xl border p-4" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}>
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--cc-paper)", color: "var(--cc-copper)" }}>
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
                            <div className="p-3 bg-success-bg rounded-full">
                                <ShieldCheck className="h-6 w-6 text-success-fg" />
                            </div>
                            <h2 className="text-2xl font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>Pases Activos</h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {isLoading && <p className="cc-text-tertiary">Cargando invitaciones...</p>}
                            {!isLoading && activeInvitations.length === 0 && (
                                <div className="col-span-full">
                                    <EmptyState
                                        icon={<QrCode className="h-6 w-6" />}
                                        title="No hay pases activos"
                                        description="Crea una nueva invitación en el panel de la izquierda para autorizar el acceso de tus visitas."
                                        tone="neutral"
                                    />
                                </div>
                            )}
                            {activeInvitations.map((inv) => (
                                <motion.div
                                    key={inv.id}
                                    whileHover={{ y: -5 }}
                                    className="p-8 rounded-2xl border space-y-4"
                                    style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}
                                >
                                    <div className="flex justify-between items-start">
                                        <div className="h-12 w-12 rounded-full flex items-center justify-center" style={{ background: "var(--cc-copper-tint)", color: "var(--cc-copper)" }}>
                                            <QrCode className="h-6 w-6" />
                                        </div>
                                        <div className="px-3 py-1 bg-success-bg text-success-fg rounded-full text-[10px] font-semibold uppercase tracking-wider">
                                            Activo
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>{inv.guestName}</h3>
                                        <p className="text-xs font-bold cc-text-tertiary uppercase tracking-[0.08em]">{inv.guestDni}</p>
                                    </div>
                                    <div className="pt-4 border-t flex items-center justify-between" style={{ borderColor: "var(--cc-line)" }}>
                                        <div className="flex items-center gap-2 text-xs cc-text-tertiary font-bold">
                                            <Clock className="h-4 w-4" />
                                            <span>
                                                Vence: {new Date(inv.validTo).toLocaleString('es-CL', {
                                                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                                                })}
                                            </span>
                                        </div>
                                        <button className="p-2 hover:bg-[var(--cc-paper-warm)] rounded-full transition-colors" title="Compartir Código">
                                            <Share2 className="h-4 w-4 cc-text-tertiary" />
                                        </button>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>

                    {/* History List */}
                    <div className="space-y-6">
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-full" style={{ background: "var(--cc-paper-warm)" }}>
                                <History className="h-6 w-6 cc-text-primary" />
                            </div>
                            <h2 className="text-2xl font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>Bitácora de Visitas</h2>
                        </div>

                        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                            <div className="divide-y divide-[var(--cc-line)]">
                                {isLoading && <div className="p-10 text-center cc-text-tertiary">Cargando historial...</div>}
                                {!isLoading && pastInvitations.map((inv) => (
                                    <div key={inv.id} className="p-8 flex items-center justify-between hover:bg-[var(--cc-paper-warm)] transition-colors">
                                        <div className="flex items-center gap-5">
                                            <div className="h-12 w-12 rounded-full flex items-center justify-center cc-text-tertiary font-bold" style={{ background: "var(--cc-paper-warm)" }}>
                                                {inv.guestName.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="font-semibold cc-text-primary">{inv.guestName}</p>
                                                <p className="text-[10px] font-bold cc-text-tertiary uppercase tracking-[0.08em]">
                                                    Generado el {new Date(inv.validFrom).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                                                </p>
                                            </div>
                                        </div>
                                        <span className="text-[10px] font-semibold cc-text-tertiary uppercase tracking-[0.08em]">
                                            {inv.status === 'expired' ? 'Expirado' : inv.status === 'cancelled' ? 'Cancelado' : 'Usado'}
                                        </span>
                                    </div>
                                ))}
                                {!isLoading && pastInvitations.length === 0 && (
                                    <div className="p-4">
                                        <EmptyState
                                            icon={<History className="h-6 w-6" />}
                                            title="Sin registros históricos"
                                            description="Aquí verás la bitácora de las visitas que han ingresado o cuyos pases han expirado."
                                            tone="neutral"
                                            dashed={false}
                                        />
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
