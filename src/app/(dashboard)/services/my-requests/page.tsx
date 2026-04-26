"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/authContext";
import { serviceRequestsService } from "@/lib/services/providersService";
import { motion, AnimatePresence } from "framer-motion";
import {
    Wrench, Clock, CheckCircle2, XCircle, AlertCircle,
    ArrowLeft, Calendar, Phone, ChevronRight, MessageSquare
} from "lucide-react";
import Link from "next/link";
import { SkeletonList } from "@/components/ui/Skeleton";

export default function MyRequestsPage() {
    const { user } = useAuth();
    const [requests, setRequests] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (user) {
            fetchRequests();
        }
    }, [user]);

    const fetchRequests = async () => {
        try {
            setLoading(true);
            const data = await serviceRequestsService.getByUser(user!.id);
            setRequests(data);
        } catch (error) {
            console.error("Error fetching requests:", error);
        } finally {
            setLoading(false);
        }
    };

    const getStatusConfig = (status: string) => {
        switch (status) {
            case 'pending':
                return {
                    label: 'Pendiente',
                    icon: Clock,
                    color: 'text-warning-fg',
                    bg: 'bg-warning-bg',
                    border: 'border-amber-100 dark:border-amber-500/20'
                };
            case 'accepted':
                return {
                    label: 'En Camino',
                    icon: Wrench,
                    color: 'text-blue-600 dark:text-blue-400',
                    bg: 'bg-blue-50 dark:bg-blue-500/10',
                    border: 'border-blue-100 dark:border-blue-500/20'
                };
            case 'completed':
                return {
                    label: 'Completado',
                    icon: CheckCircle2,
                    color: 'text-success-fg',
                    bg: 'bg-success-bg',
                    border: 'border-emerald-100 dark:border-emerald-500/20'
                };
            case 'cancelled':
                return {
                    label: 'Cancelado',
                    icon: XCircle,
                    color: 'text-rose-600 dark:text-rose-400',
                    bg: 'bg-rose-50 dark:bg-rose-500/10',
                    border: 'border-rose-100 dark:border-rose-500/20'
                };
            default:
                return {
                    label: status,
                    icon: AlertCircle,
                    color: 'cc-text-secondary',
                    bg: 'bg-slate-50 dark:bg-slate-500/10',
                    border: 'border-slate-100 dark:border-slate-500/20'
                };
        }
    };

    if (!user) return null;

    return (
        <div className="max-w-5xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 cc-text-secondary mb-2">
                        <Link href="/services" className="hover:text-blue-600 transition-colors">Servicios</Link>
                        <ChevronRight className="h-4 w-4" />
                        <span className="cc-text-primary font-medium">Mis Solicitudes</span>
                    </div>
                    <h1 className="text-3xl font-bold cc-text-primary">Gestión de Solicitudes</h1>
                    <p className="cc-text-secondary mt-1">Sigue el estado de tus pedidos técnicos y servicios.</p>
                </div>
                <Link
                    href="/services"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-surface cc-text-secondary font-semibold border border-subtle hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Volver a Catálogo
                </Link>
            </div>

            {/* List Section */}
            <div className="space-y-4">
                {loading ? (
                    <div className="bg-surface rounded-2xl p-6 shadow-lg border border-subtle">
                        <SkeletonList count={3} />
                    </div>
                ) : requests.length > 0 ? (
                    <div className="grid gap-4">
                        <AnimatePresence>
                            {requests.map((request, idx) => {
                                const status = getStatusConfig(request.status);
                                const StatusIcon = status.icon;

                                return (
                                    <motion.div
                                        key={request.id}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: idx * 0.05 }}
                                        className="group bg-surface rounded-2xl p-5 md:p-6 shadow-lg shadow-slate-200/50 dark:shadow-slate-950/50 border border-subtle hover:border-blue-200 dark:hover:border-blue-900/50 transition-all"
                                    >
                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                            <div className="flex items-start gap-4">
                                                <div className={`p-3 rounded-xl ${status.bg} ${status.color}`}>
                                                    <StatusIcon className="h-6 w-6" />
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <h3 className="font-bold text-lg cc-text-primary">
                                                            {request.service_providers?.name || "Técnico"}
                                                        </h3>
                                                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${status.bg} ${status.color} ${status.border}`}>
                                                            {status.label}
                                                        </span>
                                                    </div>
                                                    <p className="text-sm cc-text-secondary line-clamp-1 max-w-md">
                                                        {request.description}
                                                    </p>
                                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-2">
                                                        <div className="flex items-center gap-1.5 text-xs cc-text-secondary">
                                                            <Calendar className="h-3.5 w-3.5" />
                                                            {new Date(request.preferred_date).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })} a las {request.preferred_time}
                                                        </div>
                                                        <div className="flex items-center gap-1.5 text-xs cc-text-secondary">
                                                            <MessageSquare className="h-3.5 w-3.5" />
                                                            Solicitado el {new Date(request.created_at).toLocaleDateString('es-CL')}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-3">
                                                {request.service_providers?.contact_phone && (
                                                    <a
                                                        href={`tel:${request.service_providers.contact_phone}`}
                                                        className="flex-1 md:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-700/50 cc-text-secondary font-semibold border border-subtle hover:bg-elevated transition-all"
                                                    >
                                                        <Phone className="h-4 w-4" />
                                                        <span className="md:hidden lg:inline">Llamar</span>
                                                    </a>
                                                )}
                                                <Link
                                                    href={`/services/provider/${request.provider_id}`}
                                                    className="flex-1 md:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white font-semibold shadow-lg shadow-blue-500/25 hover:bg-blue-700 transition-all"
                                                >
                                                    Ver Perfil
                                                </Link>
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </div>
                ) : (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="bg-surface rounded-3xl p-12 text-center border-2 border-dashed border-subtle"
                    >
                        <div className="mx-auto w-20 h-20 rounded-2xl bg-elevated/50 flex items-center justify-center mb-6">
                            <Wrench className="h-10 w-10 text-slate-400" />
                        </div>
                        <h3 className="text-xl font-bold cc-text-primary mb-2">No tienes solicitudes activas</h3>
                        <p className="cc-text-secondary mb-8 max-w-sm mx-auto">
                            Cuando solicites un servicio a un técnico de la comunidad, aparecerá aquí para que puedas darle seguimiento.
                        </p>
                        <Link
                            href="/services"
                            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-600 text-white font-bold shadow-lg shadow-blue-500/25 hover:shadow-xl hover:-translate-y-0.5 transition-all"
                        >
                            Explorar Catálogo de Servicios
                        </Link>
                    </motion.div>
                )}
            </div>
        </div>
    );
}
