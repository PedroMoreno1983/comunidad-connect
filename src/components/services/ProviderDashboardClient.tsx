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
import { getInitials } from "@/lib/utils/avatar";

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
            <div className="flex items-center justify-center gap-3 rounded-2xl border p-10 text-sm font-bold cc-text-secondary" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--cc-copper)" }} />
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
            <section className="rounded-2xl border p-6 shadow-sm" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex items-center gap-4">
                        <div
                            className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl"
                            style={{ background: "var(--cc-ink)", color: "var(--cc-copper-soft)", fontFamily: "var(--cc-font-display)", fontSize: 20 }}
                        >
                            {selectedProvider ? getInitials(selectedProvider.name) : "?"}
                        </div>
                        <div>
                            <p className="text-[10px] font-medium uppercase tracking-[0.15em] cc-text-tertiary">Panel proveedor</p>
                            <h1 className="mt-1 text-3xl leading-none cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>
                                Hola, <em style={{ fontStyle: "italic" }}>{selectedProvider?.name.split(" ")[0] || "proveedor"}</em>
                            </h1>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {providers.length > 1 && (
                            <select
                                value={selectedProvider?.id || ""}
                                onChange={event => setSelectedProviderId(event.target.value)}
                                className="h-10 rounded-xl border px-3 text-sm font-medium cc-text-secondary outline-none focus:border-[var(--cc-copper)]"
                                style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}
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
                        <div className="rounded-xl border p-4" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}>
                            <p className="text-[10px] font-medium uppercase tracking-[0.1em] cc-text-tertiary">Perfil</p>
                            <p className="mt-1.5 break-words text-lg leading-snug cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>{selectedProvider.name}</p>
                            <p className="text-xs cc-text-secondary">{categoryLabel(selectedProvider.category)}</p>
                        </div>
                        <div className="rounded-xl border p-4" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}>
                            <p className="text-[10px] font-medium uppercase tracking-[0.1em] cc-text-tertiary">Activas</p>
                            <p className="mt-1.5 text-2xl leading-none" style={{ fontFamily: "var(--cc-font-display)", color: "var(--cc-copper)" }}>{stats.active}</p>
                        </div>
                        <div className="rounded-xl border p-4" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}>
                            <p className="text-[10px] font-medium uppercase tracking-[0.1em] cc-text-tertiary">Completadas</p>
                            <p className="mt-1.5 text-2xl leading-none cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>{stats.completed}</p>
                        </div>
                        <div className="rounded-xl border p-4" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}>
                            <p className="text-[10px] font-medium uppercase tracking-[0.1em] cc-text-tertiary">Verificación</p>
                            <p className="mt-1.5 flex items-center gap-2 text-sm font-medium cc-text-primary">
                                <ShieldCheck className="h-4 w-4" style={{ color: "var(--cc-sage)" }} />
                                {selectedProvider.verified ? "Verificado" : "Pendiente"}
                            </p>
                        </div>
                    </div>
                )}
            </section>

            <section className="rounded-2xl border p-4" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 cc-text-tertiary" />
                        <input
                            value={query}
                            onChange={event => setQuery(event.target.value)}
                            placeholder="Buscar por residente, correo o descripción..."
                            className="w-full rounded-xl border py-3 pl-11 pr-4 text-sm cc-text-primary outline-none focus:border-[var(--cc-copper)]"
                            style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}
                        />
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {FILTERS.map(filter => (
                            <button
                                key={filter.key}
                                type="button"
                                onClick={() => setStatusFilter(filter.key)}
                                className="rounded-xl px-3 py-2 text-xs font-medium transition-colors"
                                style={
                                    statusFilter === filter.key
                                        ? { background: "var(--cc-ink)", color: "var(--cc-paper)" }
                                        : { background: "var(--cc-paper-warm)", color: "var(--cc-ink-muted)" }
                                }
                            >
                                {filter.label}
                            </button>
                        ))}
                    </div>
                </div>
            </section>

            {loading ? (
                <div className="flex items-center justify-center gap-3 rounded-lg border p-10 text-sm cc-text-secondary" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--cc-copper)" }} />
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
            <article key={request.id} className="rounded-2xl border p-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                                    <div className="flex min-w-0 gap-4">
                                        <div
                                            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
                                            style={{ background: "var(--cc-copper-tint)" }}
                                        >
                                            <Wrench className="h-5 w-5" style={{ color: "var(--cc-copper)" }} />
                                        </div>
                                        <div className="min-w-0 space-y-3">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <Badge variant={STATUS_VARIANTS[request.status]}>{STATUS_LABELS[request.status]}</Badge>
                                                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium cc-text-secondary" style={{ background: "var(--cc-paper-warm)" }}>
                                                    <Calendar className="h-3.5 w-3.5" />
                                                    {formatDate(request.preferred_date)} a las {request.preferred_time}
                                                </span>
                                            </div>
                                            <div>
                                                <h2 className="flex items-center gap-2 text-xl cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>
                                                    <User className="h-4 w-4" style={{ color: "var(--cc-copper)" }} />
                                                    {residentName}
                                                </h2>
                                                {request.profiles?.email && (
                                                    <a href={`mailto:${request.profiles.email}`} className="mt-1 inline-flex items-center gap-1.5 text-sm cc-text-secondary transition hover:cc-text-primary">
                                                        <Mail className="h-4 w-4" />
                                                        {request.profiles.email}
                                                    </a>
                                                )}
                                            </div>
                                            <p className="max-w-3xl rounded-xl p-4 text-sm leading-6 cc-text-secondary" style={{ background: "var(--cc-paper-warm)" }}>
                                                {request.description}
                                            </p>
                                            <p className="inline-flex items-center gap-1.5 text-xs cc-text-tertiary">
                                                <Clock className="h-3.5 w-3.5" />
                                                Recibida el {formatDate(request.created_at)}
                                            </p>
                                        </div>
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
