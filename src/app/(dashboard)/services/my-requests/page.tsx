"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
    AlertCircle,
    ArrowLeft,
    Calendar,
    CheckCircle2,
    ChevronRight,
    ClipboardList,
    Clock,
    Phone,
    Search,
    Wrench,
    XCircle,
} from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { serviceRequestsService } from "@/lib/services/providersService";
import { SkeletonList } from "@/components/ui/Skeleton";

type RequestStatus = "pending" | "accepted" | "completed" | "cancelled";
type StatusFilter = "all" | "active" | RequestStatus;

interface ServiceRequestRow {
    id: string;
    provider_id: string;
    preferred_date: string;
    preferred_time: string;
    description: string;
    status: RequestStatus;
    created_at: string;
    updated_at?: string;
    service_providers?: {
        name: string;
        category: string;
        contact_phone?: string | null;
    } | null;
}

const FILTERS: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "Todas" },
    { key: "active", label: "Activas" },
    { key: "pending", label: "Pendientes" },
    { key: "accepted", label: "En camino" },
    { key: "completed", label: "Completadas" },
    { key: "cancelled", label: "Canceladas" },
];

const CATEGORY_LABELS: Record<string, string> = {
    plumbing: "Gasfitería",
    electrical: "Electricidad",
    locksmith: "Cerrajería",
    cleaning: "Limpieza",
    general: "Multiservicios",
};

function getStatusConfig(status: RequestStatus) {
    switch (status) {
        case "pending":
            return {
                label: "Pendiente",
                icon: Clock,
                color: "text-amber-700 dark:text-amber-300",
                bg: "bg-amber-50 dark:bg-amber-500/10",
                border: "border-amber-200 dark:border-amber-500/20",
                nextStep: "Esperando confirmación del técnico.",
            };
        case "accepted":
            return {
                label: "En camino",
                icon: Wrench,
                color: "text-blue-700 dark:text-blue-300",
                bg: "bg-blue-50 dark:bg-blue-500/10",
                border: "border-blue-200 dark:border-blue-500/20",
                nextStep: "El técnico ya aceptó. Mantén el teléfono disponible.",
            };
        case "completed":
            return {
                label: "Completada",
                icon: CheckCircle2,
                color: "text-emerald-700 dark:text-emerald-300",
                bg: "bg-emerald-50 dark:bg-emerald-500/10",
                border: "border-emerald-200 dark:border-emerald-500/20",
                nextStep: "Puedes revisar el servicio desde el perfil del técnico.",
            };
        case "cancelled":
            return {
                label: "Cancelada",
                icon: XCircle,
                color: "text-rose-700 dark:text-rose-300",
                bg: "bg-rose-50 dark:bg-rose-500/10",
                border: "border-rose-200 dark:border-rose-500/20",
                nextStep: "Puedes crear una nueva solicitud si todavía lo necesitas.",
            };
        default:
            return {
                label: status,
                icon: AlertCircle,
                color: "cc-text-secondary",
                bg: "bg-elevated",
                border: "border-subtle",
                nextStep: "Estado en revisión.",
            };
    }
}

function formatDate(value: string, options?: Intl.DateTimeFormatOptions) {
    if (!value) return "Sin fecha";
    return new Date(value).toLocaleDateString("es-CL", options || {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

export default function MyRequestsPage() {
    const { user } = useAuth();
    const [requests, setRequests] = useState<ServiceRequestRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
    const [query, setQuery] = useState("");

    useEffect(() => {
        if (!user) return;

        const fetchRequests = async () => {
            try {
                setLoading(true);
                const data = await serviceRequestsService.getByUser(user.id);
                setRequests(data as ServiceRequestRow[]);
            } catch (error) {
                console.error("Error fetching requests:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchRequests();
    }, [user]);

    const stats = useMemo(() => {
        const active = requests.filter(item => item.status === "pending" || item.status === "accepted").length;
        const completed = requests.filter(item => item.status === "completed").length;
        const cancelled = requests.filter(item => item.status === "cancelled").length;

        return { active, completed, cancelled, total: requests.length };
    }, [requests]);

    const filteredRequests = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();

        return requests.filter(request => {
            const matchesStatus =
                statusFilter === "all"
                || (statusFilter === "active" && (request.status === "pending" || request.status === "accepted"))
                || request.status === statusFilter;

            const searchable = [
                request.description,
                request.service_providers?.name,
                request.service_providers?.category,
            ].filter(Boolean).join(" ").toLowerCase();

            return matchesStatus && (!normalizedQuery || searchable.includes(normalizedQuery));
        });
    }, [query, requests, statusFilter]);

    if (!user) return null;

    return (
        <div className="mx-auto max-w-6xl space-y-8">
            <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <div className="mb-2 flex items-center gap-2 text-sm cc-text-secondary">
                        <Link href="/services" className="font-medium transition-colors hover:text-blue-600">
                            Servicios
                        </Link>
                        <ChevronRight className="h-4 w-4" />
                        <span className="font-semibold cc-text-primary">Mis solicitudes</span>
                    </div>
                    <h1 className="text-3xl font-bold cc-text-primary">Seguimiento de servicios</h1>
                    <p className="mt-1 cc-text-secondary">
                        Revisa solicitudes técnicas, coordinación y contacto del proveedor.
                    </p>
                </div>
                <Link
                    href="/services"
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-subtle bg-surface px-4 py-2.5 text-sm font-bold cc-text-secondary shadow-sm transition-all hover:bg-elevated"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Volver al catálogo
                </Link>
            </header>

            <section className="grid gap-4 md:grid-cols-4">
                {[
                    { label: "Total", value: stats.total, icon: ClipboardList, tone: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" },
                    { label: "Activas", value: stats.active, icon: Clock, tone: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300" },
                    { label: "Completadas", value: stats.completed, icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" },
                    { label: "Canceladas", value: stats.cancelled, icon: XCircle, tone: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300" },
                ].map(item => {
                    const Icon = item.icon;
                    return (
                        <div key={item.label} className="rounded-2xl border border-subtle bg-surface p-5 shadow-sm">
                            <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl ${item.tone}`}>
                                <Icon className="h-5 w-5" />
                            </div>
                            <p className="text-2xl font-black cc-text-primary">{item.value}</p>
                            <p className="text-xs font-bold uppercase tracking-wide cc-text-secondary">{item.label}</p>
                        </div>
                    );
                })}
            </section>

            <section className="rounded-2xl border border-subtle bg-surface p-4 shadow-sm">
                <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                            value={query}
                            onChange={event => setQuery(event.target.value)}
                            placeholder="Buscar por técnico, rubro o descripción..."
                            className="w-full rounded-xl border border-subtle bg-elevated py-3 pl-11 pr-4 text-sm font-medium cc-text-primary outline-none focus:ring-2 focus:ring-blue-500/20"
                        />
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {FILTERS.map(filter => (
                            <button
                                key={filter.key}
                                type="button"
                                onClick={() => setStatusFilter(filter.key)}
                                className={`rounded-xl px-3 py-2 text-xs font-black transition-colors ${
                                    statusFilter === filter.key
                                        ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                                        : "bg-elevated cc-text-secondary hover:bg-slate-200 dark:hover:bg-slate-800"
                                }`}
                            >
                                {filter.label}
                            </button>
                        ))}
                    </div>
                </div>
            </section>

            {loading ? (
                <div className="rounded-2xl border border-subtle bg-surface p-6 shadow-sm">
                    <SkeletonList count={3} />
                </div>
            ) : filteredRequests.length > 0 ? (
                <section className="grid gap-4">
                    {filteredRequests.map((request, index) => {
                        const status = getStatusConfig(request.status);
                        const StatusIcon = status.icon;
                        const provider = request.service_providers;
                        const category = provider?.category ? CATEGORY_LABELS[provider.category] || provider.category : "Servicio";

                        return (
                            <motion.article
                                key={request.id}
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.03 }}
                                className="rounded-2xl border border-subtle bg-surface p-5 shadow-sm transition-all hover:border-blue-200 dark:hover:border-blue-900/50 md:p-6"
                            >
                                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                                    <div className="flex gap-4">
                                        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${status.bg} ${status.color}`}>
                                            <StatusIcon className="h-6 w-6" />
                                        </div>
                                        <div className="min-w-0 space-y-2">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h2 className="text-lg font-black cc-text-primary">
                                                    {provider?.name || "Técnico por confirmar"}
                                                </h2>
                                                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${status.bg} ${status.color} ${status.border}`}>
                                                    {status.label}
                                                </span>
                                                <span className="rounded-full bg-elevated px-2.5 py-1 text-[11px] font-bold cc-text-secondary">
                                                    {category}
                                                </span>
                                            </div>
                                            <p className="max-w-2xl text-sm leading-6 cc-text-secondary">
                                                {request.description}
                                            </p>
                                            <div className="flex flex-wrap gap-3 pt-1 text-xs cc-text-secondary">
                                                <span className="inline-flex items-center gap-1.5">
                                                    <Calendar className="h-3.5 w-3.5" />
                                                    Preferencia: {formatDate(request.preferred_date, { day: "numeric", month: "short" })} a las {request.preferred_time}
                                                </span>
                                                <span className="inline-flex items-center gap-1.5">
                                                    <Clock className="h-3.5 w-3.5" />
                                                    Creada el {formatDate(request.created_at)}
                                                </span>
                                            </div>
                                            <p className="rounded-xl bg-elevated px-3 py-2 text-xs font-semibold cc-text-secondary">
                                                {status.nextStep}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
                                        {provider?.contact_phone && (
                                            <a
                                                href={`tel:${provider.contact_phone}`}
                                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-subtle bg-elevated px-4 py-2.5 text-sm font-bold cc-text-secondary transition-all hover:bg-surface"
                                            >
                                                <Phone className="h-4 w-4" />
                                                Llamar
                                            </a>
                                        )}
                                        <Link
                                            href={`/services/provider/${request.provider_id}`}
                                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition-colors hover:bg-blue-700"
                                        >
                                            Ver perfil
                                        </Link>
                                    </div>
                                </div>
                            </motion.article>
                        );
                    })}
                </section>
            ) : (
                <motion.section
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="rounded-3xl border-2 border-dashed border-subtle bg-surface p-12 text-center"
                >
                    <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-elevated/70">
                        <Wrench className="h-10 w-10 text-slate-400" />
                    </div>
                    <h2 className="mb-2 text-xl font-bold cc-text-primary">No hay solicitudes para mostrar</h2>
                    <p className="mx-auto mb-8 max-w-md cc-text-secondary">
                        Ajusta los filtros o crea una nueva solicitud desde el catálogo de servicios.
                    </p>
                    <Link
                        href="/services"
                        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-600 px-6 py-3 font-bold text-white shadow-lg shadow-blue-500/25 transition-all hover:-translate-y-0.5 hover:shadow-xl"
                    >
                        Explorar catálogo
                    </Link>
                </motion.section>
            )}
        </div>
    );
}
