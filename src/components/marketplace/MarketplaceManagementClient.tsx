"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AlertTriangle, EyeOff, Loader2, PackageSearch, RotateCcw, ShieldCheck, ShoppingBag, Trash2 } from "lucide-react";
import { MarketplaceService } from "@/lib/api";
import { MarketplaceItem } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/components/ui/Toast";

type Mode = "mine" | "admin";
type MarketplaceStatus = MarketplaceItem["status"];

const STATUS_LABELS: Record<MarketplaceStatus, string> = {
    available: "Disponible",
    reserved: "Reservado",
    sold: "Vendido",
    hidden: "Oculto",
};

const STATUS_BADGES: Record<MarketplaceStatus, "success" | "warning" | "neutral" | "danger"> = {
    available: "success",
    reserved: "warning",
    sold: "neutral",
    hidden: "danger",
};

function getDeptNumber(item: MarketplaceItem) {
    return Array.from(item.sellerId ?? item.id).reduce((acc, char) => acc + char.charCodeAt(0), 0) % 900 + 100;
}

function getPrimaryImage(item: MarketplaceItem) {
    return item.imageUrl || item.images?.[0] || null;
}

interface MarketplaceManagementClientProps {
    mode: Mode;
}

export function MarketplaceManagementClient({ mode }: MarketplaceManagementClientProps) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [items, setItems] = useState<MarketplaceItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [filter, setFilter] = useState<MarketplaceStatus | "all">("all");

    const isAdminMode = mode === "admin";

    const loadItems = useCallback(async () => {
        if (!user) return;

        setLoading(true);
        try {
            const rows = isAdminMode
                ? await MarketplaceService.getModerationItems()
                : await MarketplaceService.getMyItems(user.id);
            setItems(rows);
        } catch (error) {
            toast({
                title: "No se pudieron cargar las publicaciones",
                description: error instanceof Error ? error.message : "Intenta nuevamente en unos segundos.",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    }, [isAdminMode, toast, user]);

    useEffect(() => {
        loadItems();
    }, [loadItems]);

    const filteredItems = useMemo(() => {
        if (filter === "all") return items;
        return items.filter(item => item.status === filter);
    }, [filter, items]);

    const stats = useMemo(() => ({
        total: items.length,
        available: items.filter(item => item.status === "available").length,
        reserved: items.filter(item => item.status === "reserved").length,
        sold: items.filter(item => item.status === "sold").length,
        hidden: items.filter(item => item.status === "hidden").length,
    }), [items]);

    const updateStatus = async (item: MarketplaceItem, status: MarketplaceStatus) => {
        setSavingId(item.id);
        try {
            const response = await fetch(`/api/marketplace-items/${item.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status }),
            });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "No se pudo actualizar la publicación");
            }

            setItems(current => current.map(row => row.id === item.id ? { ...row, status } : row));
            toast({
                title: "Publicación actualizada",
                description: `${item.title} quedó como ${STATUS_LABELS[status].toLowerCase()}.`,
                variant: "success",
            });
        } catch (error) {
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "No se pudo actualizar la publicación.",
                variant: "destructive",
            });
        } finally {
            setSavingId(null);
        }
    };

    const deleteItem = async (item: MarketplaceItem) => {
        if (!window.confirm(`¿Eliminar "${item.title}" del marketplace?`)) return;

        setSavingId(item.id);
        try {
            const response = await fetch(`/api/marketplace-items/${item.id}`, {
                method: "DELETE",
            });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "No se pudo eliminar la publicación");
            }

            setItems(current => current.filter(row => row.id !== item.id));
            toast({
                title: "Publicación eliminada",
                description: "Ya no aparecerá en el marketplace.",
                variant: "success",
            });
        } catch (error) {
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "No se pudo eliminar la publicación.",
                variant: "destructive",
            });
        } finally {
            setSavingId(null);
        }
    };

    if (isAdminMode && user?.role !== "admin") {
        return (
            <EmptyState
                icon={<ShieldCheck className="h-6 w-6" />}
                title="Acceso restringido"
                description="Esta vista está disponible solo para administración."
            />
        );
    }

    return (
        <div className="mx-auto max-w-6xl space-y-6 p-6">
            <header className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                <div>
                    <div className="mb-2 inline-flex items-center gap-2 rounded-md bg-brand-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-600">
                        {isAdminMode ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShoppingBag className="h-3.5 w-3.5" />}
                        {isAdminMode ? "Moderación" : "Mis publicaciones"}
                    </div>
                    <h1 className="text-3xl font-bold cc-text-primary">
                        {isAdminMode ? "Control del Marketplace" : "Gestiona tus publicaciones"}
                    </h1>
                    <p className="mt-1 max-w-2xl cc-text-secondary">
                        {isAdminMode
                            ? "Revisa estados, oculta anuncios problemáticos y mantén ordenada la vitrina comunitaria."
                            : "Marca artículos como reservados o vendidos y retira lo que ya no quieras mostrar."}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={loadItems} disabled={loading}>
                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                        Actualizar
                    </Button>
                    <Link href="/marketplace">
                        <Button>Ir al Marketplace</Button>
                    </Link>
                </div>
            </header>

            <div className="grid gap-3 md:grid-cols-5">
                {([
                    ["all", "Total", stats.total],
                    ["available", "Disponibles", stats.available],
                    ["reserved", "Reservados", stats.reserved],
                    ["sold", "Vendidos", stats.sold],
                    ["hidden", "Ocultos", stats.hidden],
                ] as Array<[MarketplaceStatus | "all", string, number]>).map(([key, label, value]) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => setFilter(key)}
                        className={`rounded-lg border p-4 text-left transition-colors ${
                            filter === key
                                ? "border-brand-300 bg-brand-50"
                                : "border-subtle bg-surface hover:bg-elevated"
                        }`}
                    >
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] cc-text-secondary">{label}</p>
                        <p className="mt-1 text-2xl font-semibold cc-text-primary">{value}</p>
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex items-center justify-center gap-3 rounded-lg border border-subtle bg-surface p-10 text-sm font-bold cc-text-secondary">
                    <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                    Cargando publicaciones...
                </div>
            ) : filteredItems.length === 0 ? (
                <EmptyState
                    icon={<PackageSearch className="h-6 w-6" />}
                    title="No hay publicaciones en esta vista"
                    description={isAdminMode ? "Cuando la comunidad publique artículos, aparecerán acá." : "Publica tu primer artículo desde el marketplace."}
                    action={
                        <Link href="/marketplace">
                            <Button>Publicar o explorar</Button>
                        </Link>
                    }
                />
            ) : (
                <div className="space-y-4">
                    {filteredItems.map(item => {
                        const image = getPrimaryImage(item);
                        const isSaving = savingId === item.id;

                        return (
                            <article key={item.id} className="overflow-hidden rounded-lg border border-subtle bg-surface shadow-sm">
                                <div className="grid gap-0 md:grid-cols-[180px_1fr]">
                                    <div className="relative h-48 bg-elevated md:h-full">
                                        {image ? (
                                            <Image src={image} alt={item.title} fill sizes="180px" className="object-cover" />
                                        ) : (
                                            <div className="flex h-full items-center justify-center">
                                                <ShoppingBag className="h-10 w-10 text-slate-300" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="space-y-5 p-5">
                                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                            <div className="min-w-0">
                                                <div className="mb-2 flex flex-wrap items-center gap-2">
                                                    <Badge variant={STATUS_BADGES[item.status]}>{STATUS_LABELS[item.status]}</Badge>
                                                    {item.allowSale !== false && <Badge variant="info">Venta</Badge>}
                                                    {item.allowSwap && <Badge variant="conserje">Permuta</Badge>}
                                                    {item.allowBarter && <Badge variant="success">Trueque</Badge>}
                                                </div>
                                                <h2 className="truncate text-lg font-semibold cc-text-primary">{item.title}</h2>
                                                <p className="mt-1 line-clamp-2 text-sm cc-text-secondary">{item.description}</p>
                                            </div>
                                            <div className="shrink-0 text-left md:text-right">
                                                <p className="text-[10px] font-bold uppercase tracking-[0.14em] cc-text-secondary">
                                                    {isAdminMode ? `Depto ${getDeptNumber(item)}` : "Precio"}
                                                </p>
                                                <p className="text-lg font-semibold text-brand-600">
                                                    {item.allowSale !== false ? `$${item.price.toLocaleString("es-CL")}` : "Intercambio"}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap gap-2">
                                            {item.status !== "available" && (
                                                <Button variant="outline" size="sm" disabled={isSaving} onClick={() => updateStatus(item, "available")}>
                                                    Disponible
                                                </Button>
                                            )}
                                            {item.status !== "reserved" && item.status !== "hidden" && (
                                                <Button variant="outline" size="sm" disabled={isSaving} onClick={() => updateStatus(item, "reserved")}>
                                                    Reservar
                                                </Button>
                                            )}
                                            {item.status !== "sold" && item.status !== "hidden" && (
                                                <Button variant="outline" size="sm" disabled={isSaving} onClick={() => updateStatus(item, "sold")}>
                                                    Vendido
                                                </Button>
                                            )}
                                            {isAdminMode && item.status !== "hidden" && (
                                                <Button variant="outline" size="sm" disabled={isSaving} onClick={() => updateStatus(item, "hidden")}>
                                                    <EyeOff className="mr-2 h-4 w-4" />
                                                    Ocultar
                                                </Button>
                                            )}
                                            <Button variant="outline" size="sm" disabled={isSaving} onClick={() => deleteItem(item)}>
                                                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                                                Eliminar
                                            </Button>
                                        </div>

                                        {item.status === "hidden" && (
                                            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                                Esta publicación está oculta para residentes en el marketplace público.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </article>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
