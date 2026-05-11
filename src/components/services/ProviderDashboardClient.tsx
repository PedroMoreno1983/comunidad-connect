"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
    Briefcase,
    Calendar,
    CheckCircle2,
    Clock,
    Loader2,
    Mail,
    RotateCcw,
    Search,
    ShieldCheck,
    User,
    Wrench,
    XCircle,
} from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { ServiceProvider } from "@/lib/types";
import { providersService, serviceRequestsService } from "@/lib/services/providersService";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";

type RequestStatus = "pending" | "accepted" | "completed" | "cancelled";
type StatusFilter = "all" | "active" | RequestStatus;

interface ProviderRequestRow {
    id: string;
    provider_id: string;
    user_id: string;
    preferred_date: string;
    preferred_time: string;
    description: string;
    status: RequestStatus;
    created_at: string;
    updated_at?: string;
    profiles?: {
        name?: string | null;
        email?: string | null;
    } | null;
}

const STATUS_LABELS: Record<RequestStatus, string> = {
    pending: "Pendiente",
    accepted: "Aceptada",
    completed: "Completada",
    cancelled: "Cancelada",
};

const STATUS_VARIANTS: Record<RequestStatus, "warning" | "info" | "success" | "danger"> = {
    pending: "warning",
    accepted: "info",
    completed: "success",
    cancelled: "danger",
};

const FILTERS: { key: StatusFilter; label: string }[] = [
    { key: "active", label: "Activas" },
    { key: "pending", label: "Pendientes" },
    { key: "accepted", label: "Aceptadas" },
    { key: "completed", label: "Completadas" },
    { key: "cancelled", label: "Canceladas" },
    { key: "all", label: "Todas" },
];

const demoProviders: ServiceProvider[] = [
    {
        id: "demo-provider-dashboard",
        name: "Gasfiter Certificado Torres",
        category: "plumbing",
        bio: "Atencion de fugas, griferia y mantencion preventiva para edificios.",
        rating: 4.8,
        reviewCount: 36,
        verified: true,
        availability: "available",
        contactPhone: "+569 5555 1212",
        yearsExperience: 8,
        responseTime: "< 2 horas",
        completedJobs: 124,
        specialties: ["Fugas", "Flexibles", "Mantencion"],
        certifications: ["SEC"],
    },
];

const demoProviderRequests: ProviderRequestRow[] = [
    {
        id: "demo-provider-request-1",
        provider_id: "demo-provider-dashboard",
        user_id: "demo-resident-1",
        preferred_date: new Date(Date.now() + 864e5).toISOString().slice(0, 10),
        preferred_time: "09:30",
        description: "Revision de fuga bajo lavaplatos y cambio de flexible si corresponde.",
        status: "pending",
        created_at: new Date(Date.now() - 45 * 60000).toISOString(),
        profiles: { name: "Andrea Dupre", email: "andrea@example.com" },
    },
    {
        id: "demo-provider-request-2",
        provider_id: "demo-provider-dashboard",
        user_id: "demo-resident-2",
        preferred_date: new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10),
        preferred_time: "15:00",
        description: "Mantencion preventiva de sifon y revision de presion.",
        status: "accepted",
        created_at: new Date(Date.now() - 22 * 36e5).toISOString(),
        profiles: { name: "Conserjeria Torre Norte", email: "conserjeria@example.com" },
    },
];

function formatDate(value: string) {
    if (!value) return "Sin fecha";
    return new Date(value).toLocaleDateString("es-CL", {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

function categoryLabel(category: string) {
    const labels: Record<string, string> = {
        plumbing: "Gasfitería",
        electrical: "Electricidad",
        locksmith: "Cerrajería",
        cleaning: "Limpieza",
        general: "Multiservicios",
    };
    return labels[category] || category;
}

export function ProviderDashboardClient() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [providers, setProviders] = useState<ServiceProvider[]>([]);
    const [selectedProviderId, setSelectedProviderId] = useState("");
    const [requests, setRequests] = useState<ProviderRequestRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
    const [query, setQuery] = useState("");

    const selectedProvider = providers.find(provider => provider.id === selectedProviderId) || providers[0];

    const loadProviders = useCallback(async () => {
        if (!user) return;

        setLoading(true);
        try {
            if (user.email.toLowerCase().endsWith("@demo.com")) {
                setProviders(demoProviders);
                setSelectedProviderId("demo-provider-dashboard");
                return;
            }
            const providerRows = await providersService.getByUser(user.id);
            setProviders(providerRows);
            setSelectedProviderId(current => current || providerRows[0]?.id || "");
        } catch (error) {
            toast({
                title: "No se pudo cargar tu perfil técnico",
                description: error instanceof Error ? error.message : "Intenta nuevamente en unos segundos.",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    }, [toast, user]);

    const loadRequests = useCallback(async (providerId: string) => {
        if (!providerId) {
            setRequests([]);
            return;
        }

        setLoading(true);
        try {
            if (providerId.startsWith("demo-")) {
                setRequests(demoProviderRequests);
                return;
            }
            const rows = await serviceRequestsService.getByProvider(providerId);
            setRequests(rows as ProviderRequestRow[]);
        } catch (error) {
            toast({
                title: "No se pudieron cargar las solicitudes",
                description: error instanceof Error ? error.message : "Intenta nuevamente en unos segundos.",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        loadProviders();
    }, [loadProviders]);

    useEffect(() => {
        if (selectedProvider?.id) {
            loadRequests(selectedProvider.id);
        }
    }, [loadRequests, selectedProvider?.id]);

    const stats = useMemo(() => ({
        active: requests.filter(item => item.status === "pending" || item.status === "accepted").length,
        pending: requests.filter(item => item.status === "pending").length,
        completed: requests.filter(item => item.status === "completed").length,
        cancelled: requests.filter(item => item.status === "cancelled").length,
        total: requests.length,
    }), [requests]);

    const filteredRequests = useMemo(() => {
        const normalized = query.trim().toLowerCase();

        return requests.filter(request => {
            const matchesStatus =
                statusFilter === "all"
                || (statusFilter === "active" && (request.status === "pending" || request.status === "accepted"))
                || request.status === statusFilter;

            const searchable = [
                request.description,
                request.profiles?.name,
                request.profiles?.email,
                request.preferred_date,
                request.preferred_time,
            ].filter(Boolean).join(" ").toLowerCase();

            return matchesStatus && (!normalized || searchable.includes(normalized));
        });
    }, [query, requests, statusFilter]);

    const updateStatus = async (request: ProviderRequestRow, status: RequestStatus) => {
        setSavingId(request.id);
        try {
            const response = await fetch(`/api/service-requests/${request.id}/status`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status }),
            });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "No se pudo actualizar la solicitud");
            }

            setRequests(current => current.map(row => row.id === request.id ? { ...row, status } : row));
            toast({
                title: "Solicitud actualizada",
                description: `Quedo como ${STATUS_LABELS[status].toLowerCase()}.`,
                variant: "success",
            });
        } catch (error) {
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "No se pudo actualizar la solicitud.",
                variant: "destructive",
            });
        } finally {
            setSavingId(null);
        }
    };

    if (!user) return null;

    if (loading && providers.length === 0) {
        return (
            <div className="flex items-center justify-center gap-3 rounded-lg border border-subtle bg-surface p-10 text-sm font-bold cc-text-secondary">
                <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                Cargando panel del proveedor...
            </div>
        );
    }

    if (providers.length === 0) {
        return (
            <EmptyState
                icon={<Briefcase className="h-6 w-6" />}
                title="Aún no tienes perfil técnico"
                description="Regístrate como proveedor para recibir solicitudes de residentes y administrarlas desde este panel."
                action={
                    <Link href="/services/register">
                        <Button>Crear perfil técnico</Button>
                    </Link>
                }
            />
        );
    }

    return (
        <div className="mx-auto max-w-6xl space-y-6">
            <section className="rounded-lg border border-subtle bg-surface p-6 shadow-sm">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                            <Wrench className="h-3.5 w-3.5" />
                            Panel proveedor
                        </div>
                        <h1 className="text-3xl font-semibold cc-text-primary">Solicitudes recibidas</h1>
                        <p className="mt-2 max-w-2xl text-sm font-medium cc-text-secondary">
                            Acepta trabajos, marca servicios completados y mantén informado al residente sin pasar por administración.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {providers.length > 1 && (
                            <select
                                value={selectedProvider?.id || ""}
                                onChange={event => setSelectedProviderId(event.target.value)}
                                className="h-10 rounded-xl border border-subtle bg-elevated px-3 text-sm font-bold cc-text-secondary outline-none focus:ring-2 focus:ring-blue-500/20"
                            >
                                {providers.map(provider => (
                                    <option key={provider.id} value={provider.id}>
                                        {provider.name}
                                    </option>
                                ))}
                            </select>
                        )}
                        <Button variant="outline" onClick={() => selectedProvider?.id && loadRequests(selectedProvider.id)} disabled={loading}>
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                            Actualizar
                        </Button>
                        <Link href={`/services/provider/${selectedProvider?.id}`}>
                            <Button variant="secondary">Ver perfil público</Button>
                        </Link>
                    </div>
                </div>

                {selectedProvider && (
                    <div className="mt-6 grid gap-3 md:grid-cols-4">
                        <div className="rounded-lg bg-elevated p-4">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] cc-text-secondary">Perfil</p>
                            <p className="mt-1 break-words text-lg font-semibold leading-snug cc-text-primary">{selectedProvider.name}</p>
                            <p className="text-xs font-semibold cc-text-secondary">{categoryLabel(selectedProvider.category)}</p>
                        </div>
                        <div className="rounded-lg bg-elevated p-4">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] cc-text-secondary">Activas</p>
                            <p className="mt-1 text-2xl font-semibold text-blue-600">{stats.active}</p>
                        </div>
                        <div className="rounded-lg bg-elevated p-4">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] cc-text-secondary">Completadas</p>
                            <p className="mt-1 text-2xl font-semibold text-emerald-600">{stats.completed}</p>
                        </div>
                        <div className="rounded-lg bg-elevated p-4">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] cc-text-secondary">Verificación</p>
                            <p className="mt-1 flex items-center gap-2 text-sm font-semibold cc-text-primary">
                                <ShieldCheck className="h-4 w-4 text-blue-500" />
                                {selectedProvider.verified ? "Verificado" : "Pendiente"}
                            </p>
                        </div>
                    </div>
                )}
            </section>

            <section className="rounded-lg border border-subtle bg-surface p-4 shadow-sm">
                <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                            value={query}
                            onChange={event => setQuery(event.target.value)}
                            placeholder="Buscar por residente, correo o descripción..."
                            className="w-full rounded-xl border border-subtle bg-elevated py-3 pl-11 pr-4 text-sm font-medium cc-text-primary outline-none focus:ring-2 focus:ring-blue-500/20"
                        />
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {FILTERS.map(filter => (
                            <button
                                key={filter.key}
                                type="button"
                                onClick={() => setStatusFilter(filter.key)}
                                className={`rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
                                    statusFilter === filter.key
                                        ? "bg-blue-600 text-white shadow-sm shadow-blue-500/20"
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
                <div className="flex items-center justify-center gap-3 rounded-lg border border-subtle bg-surface p-10 text-sm font-bold cc-text-secondary">
                    <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                    Actualizando solicitudes...
                </div>
            ) : filteredRequests.length === 0 ? (
                <EmptyState
                    icon={<Briefcase className="h-6 w-6" />}
                    title="No hay solicitudes en esta vista"
                    description="Cuando un residente solicite tus servicios, aparecerá acá con fecha, descripción y acciones."
                />
            ) : (
                <section className="space-y-4">
                    {filteredRequests.map(request => {
                        const isSaving = savingId === request.id;
                        const residentName = request.profiles?.name || "Residente";

                        return (
                            <article key={request.id} className="rounded-lg border border-subtle bg-surface p-5 shadow-sm">
                                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                                    <div className="min-w-0 space-y-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Badge variant={STATUS_VARIANTS[request.status]}>{STATUS_LABELS[request.status]}</Badge>
                                            <span className="inline-flex items-center gap-1.5 rounded-full bg-elevated px-2.5 py-1 text-[11px] font-bold cc-text-secondary">
                                                <Calendar className="h-3.5 w-3.5" />
                                                {formatDate(request.preferred_date)} a las {request.preferred_time}
                                            </span>
                                        </div>
                                        <div>
                                            <h2 className="flex items-center gap-2 text-xl font-semibold cc-text-primary">
                                                <User className="h-5 w-5 text-blue-500" />
                                                {residentName}
                                            </h2>
                                            {request.profiles?.email && (
                                                <a href={`mailto:${request.profiles.email}`} className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium cc-text-secondary hover:text-blue-600">
                                                    <Mail className="h-4 w-4" />
                                                    {request.profiles.email}
                                                </a>
                                            )}
                                        </div>
                                        <p className="max-w-3xl rounded-lg bg-elevated p-4 text-sm leading-6 cc-text-secondary">
                                            {request.description}
                                        </p>
                                        <p className="inline-flex items-center gap-1.5 text-xs font-semibold cc-text-secondary">
                                            <Clock className="h-3.5 w-3.5" />
                                            Recibida el {formatDate(request.created_at)}
                                        </p>
                                    </div>

                                    <div className="flex flex-wrap gap-2 lg:max-w-[260px] lg:justify-end">
                                        {request.status !== "accepted" && request.status !== "completed" && request.status !== "cancelled" && (
                                            <Button size="sm" disabled={isSaving} onClick={() => updateStatus(request, "accepted")}>
                                                Aceptar
                                            </Button>
                                        )}
                                        {request.status !== "completed" && request.status !== "cancelled" && (
                                            <Button variant="outline" size="sm" disabled={isSaving} onClick={() => updateStatus(request, "completed")}>
                                                <CheckCircle2 className="h-4 w-4" />
                                                Completar
                                            </Button>
                                        )}
                                        {request.status !== "cancelled" && request.status !== "completed" && (
                                            <Button variant="danger" size="sm" disabled={isSaving} onClick={() => updateStatus(request, "cancelled")}>
                                                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                                                Cancelar
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </article>
                        );
                    })}
                </section>
            )}
        </div>
    );
}
