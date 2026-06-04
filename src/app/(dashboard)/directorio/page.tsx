"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/authContext";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
    Users, Search, MessageSquare, MapPin,
    Loader2, Wrench, Zap, Key, Sparkles, SlidersHorizontal, X, HandCoins, ArrowRight
} from "lucide-react";
import Image from "next/image";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { ModuleHeader } from "@/components/ui/ModuleHeader";
import { Tag } from "@/components/cc/Tag";
import { Button } from "@/components/cc/Button";
import { providersService } from "@/lib/services/providersService";
import { DirectoryNeighbor, ServiceProvider } from "@/lib/types";
import { ProviderCard } from "@/components/services/ProviderCard";
import { getInitials } from "@/lib/utils/avatar";
import { DirectoryService } from "@/lib/api";

const ROLE_LABELS: Record<string, string> = {
    admin: 'Administración',
    resident: 'Residente',
    concierge: 'Conserjería'
};

const ROLE_TONES: Record<string, "copper" | "sage" | "amber" | "rose" | "plum" | "ink" | "neutral"> = {
    admin: "copper",
    resident: "sage",
    concierge: "amber"
};

const CATEGORIES = [
    { id: 'plumbing', name: 'Gasfitería', icon: Wrench, tone: 'copper' as const },
    { id: 'electrical', name: 'Electricidad', icon: Zap, tone: 'amber' as const },
    { id: 'locksmith', name: 'Cerrajería', icon: Key, tone: 'plum' as const },
    { id: 'cleaning', name: 'Aseo / Limpieza', icon: Sparkles, tone: 'sage' as const }
];

const NEIGHBOR_FILTERS: Array<{ id: 'all' | 'admin' | 'resident' | 'concierge'; label: string }> = [
    { id: 'all', label: 'Todos' },
    { id: 'resident', label: 'Residentes' },
    { id: 'admin', label: 'Administración' },
    { id: 'concierge', label: 'Conserjería' }
];

export default function DirectoryPage() {
    const { user } = useAuth();
    const router = useRouter();

    const [viewMode, setViewMode] = useState<'neighbors' | 'services'>('neighbors');
    const [neighbors, setNeighbors] = useState<DirectoryNeighbor[]>([]);
    const [providers, setProviders] = useState<ServiceProvider[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    
    // Filters for Neighbors
    const [activeNeighborFilter, setActiveNeighborFilter] = useState<'all' | 'admin' | 'resident' | 'concierge'>('all');
    
    // Filters for Services
    const [activeServiceCategory, setActiveServiceCategory] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);

        try {
            const [allProviders, allNeighbors] = await Promise.all([
                providersService.getAll(),
                DirectoryService.getNeighbors(user),
            ]);
            setProviders(allProviders);
            setNeighbors(allNeighbors);
        } catch (error) {
            console.error("Error loading directory data:", error);
        } finally {
            setIsLoading(false);
        }
    }, [user]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleStartDM = (neighbor: DirectoryNeighbor) => {
        router.push(`/chat?peer=${neighbor.id}`);
    };

    // Filter neighbors
    const filteredNeighbors = neighbors.filter(n => {
        const fullName = n.name || "";
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch = fullName.toLowerCase().includes(searchLower) ||
            (n.unitLabel || '').toLowerCase().includes(searchLower);
        const matchesRole = activeNeighborFilter === 'all' || n.role === activeNeighborFilter;
        return matchesSearch && matchesRole;
    });

    // Filter providers
    const filteredProviders = providers.filter(p => {
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch = p.name.toLowerCase().includes(searchLower) ||
            p.bio.toLowerCase().includes(searchLower) ||
            (p.specialties || []).some(s => s.toLowerCase().includes(searchLower));
        const matchesCategory = !activeServiceCategory || p.category === activeServiceCategory;
        return matchesSearch && matchesCategory;
    });

    return (
        <ErrorBoundary name="Directorio de Vecinos y Servicios">
            <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 space-y-7">
                {/* Header */}
                <ModuleHeader
                    eyebrow="Comunidad"
                    title="Directorio"
                    description={
                        viewMode === 'neighbors'
                            ? "Encuentra residentes, administración y conserjería de tu edificio."
                            : "Busca proveedores verificados por la comunidad para solucionar incidencias."
                    }
                    icon={<Users className="h-5 w-5" />}
                    meta={
                        viewMode === 'neighbors'
                            ? `${neighbors.length} personas registradas`
                            : `${providers.length} proveedores listos`
                    }
                    actions={
                        <div className="relative w-full md:w-80">
                            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                placeholder={viewMode === 'neighbors' ? "Buscar por nombre o depto..." : "Buscar por nombre, especialidad..."}
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="h-11 w-full rounded-xl border border-subtle bg-surface pl-10 pr-4 text-sm font-medium shadow-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                            />
                        </div>
                    }
                />

                <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-5 shadow-sm">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-start gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-white">
                                <HandCoins className="h-5 w-5" />
                            </div>
                            <div>
                                <h2 className="text-base font-semibold cc-text-primary">Banco de tiempo y mapa de habilidades</h2>
                                <p className="mt-1 max-w-2xl text-sm leading-6 cc-text-secondary">
                                    Haz visible lo que los vecinos pueden compartir: herramientas, apoyo digital,
                                    cuidado temporal, tutorias y favores coordinados sin dinero.
                                </p>
                            </div>
                        </div>
                        <Link href="/convivencia" className="inline-flex items-center justify-center gap-2 rounded-lg border border-brand-200 bg-surface px-4 py-2 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-50">
                            Abrir banco <ArrowRight className="h-4 w-4" />
                        </Link>
                    </div>
                </div>

                {/* Segmented Control Toggle */}
                <div className="flex justify-center">
                    <div className="inline-flex rounded-xl bg-elevated p-1.5 border border-subtle">
                        <button
                            onClick={() => { setViewMode('neighbors'); setSearchTerm(""); }}
                            className={`rounded-lg px-6 py-2.5 text-xs font-semibold tracking-wide transition-colors ${
                                viewMode === 'neighbors'
                                    ? "bg-brand-500 text-white shadow-sm"
                                    : "cc-text-secondary hover:bg-surface"
                            }`}
                        >
                            Vecinos y Staff
                        </button>
                        <button
                            onClick={() => { setViewMode('services'); setSearchTerm(""); }}
                            className={`rounded-lg px-6 py-2.5 text-xs font-semibold tracking-wide transition-colors ${
                                viewMode === 'services'
                                    ? "bg-brand-500 text-white shadow-sm"
                                    : "cc-text-secondary hover:bg-surface"
                            }`}
                        >
                            Directorio de Servicios
                        </button>
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex justify-center py-20">
                        <Loader2 className="h-10 w-10 animate-spin text-brand-500" />
                    </div>
                ) : (
                    <AnimatePresence mode="wait">
                        {viewMode === 'neighbors' ? (
                            <motion.div
                                key="neighbors-view"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="space-y-6"
                            >
                                {/* Filter Chips */}
                                <div className="flex flex-wrap gap-2">
                                    {NEIGHBOR_FILTERS.map(item => (
                                        <button
                                            key={item.id}
                                            onClick={() => setActiveNeighborFilter(item.id)}
                                            className={`rounded-lg px-4 py-2 text-xs font-semibold border transition-all ${
                                                activeNeighborFilter === item.id
                                                    ? 'bg-brand-500 text-white border-brand-500'
                                                    : 'bg-surface text-slate-600 border-subtle hover:border-brand-200'
                                            }`}
                                        >
                                            {item.label}
                                        </button>
                                    ))}
                                </div>

                                {filteredNeighbors.length === 0 ? (
                                    <div className="text-center py-16 border border-dashed border-slate-200 rounded-2xl bg-surface/50 shadow-inner max-w-sm mx-auto my-6">
                                        <div className="p-3 bg-brand-50 text-brand-500 rounded-full w-fit mx-auto mb-4 border border-brand-100 shadow-sm">
                                            <Users className="h-6 w-6" />
                                        </div>
                                        <h3 className="text-sm font-bold cc-text-primary">No se encontraron vecinos</h3>
                                        <p className="text-xs cc-text-secondary mt-1 px-6 leading-relaxed">No hay residentes o personal que coincidan con la búsqueda activa.</p>
                                        <button 
                                            onClick={() => setSearchTerm("")}
                                            className="mt-5 inline-flex items-center justify-center h-8 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                                        >
                                            Limpiar búsqueda
                                        </button>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                                        {filteredNeighbors.map((neighbor, idx) => {
                                            const tone = ROLE_TONES[neighbor.role] || "neutral";
                                            return (
                                                <motion.div
                                                    key={neighbor.id}
                                                    initial={{ opacity: 0, y: 8 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{ delay: idx * 0.03 }}
                                                    className="group overflow-hidden rounded-xl border border-subtle bg-surface shadow-sm transition-all hover:border-brand-200"
                                                >
                                                    <div className="relative h-16 bg-[#111827]">
                                                        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(181,102,78,0.76),rgba(17,24,39,0.94))]" />
                                                        <div className="absolute left-4 top-4">
                                                            <Tag tone={tone} solid>{ROLE_LABELS[neighbor.role]}</Tag>
                                                        </div>
                                                    </div>
                                                    <div className="relative p-5 pt-0">
                                                        <div className="-mt-7 mb-4 h-14 w-14 rounded-2xl flex-shrink-0 flex items-center justify-center overflow-hidden border-4 border-surface text-sm font-bold text-white shadow-md"
                                                             style={{ backgroundColor: `var(--cc-${tone})` }}>
                                                            {neighbor.avatar_url ? (
                                                                <Image src={neighbor.avatar_url} alt={neighbor.name} width={56} height={56} className="h-full w-full object-cover" />
                                                            ) : (
                                                                getInitials(neighbor.name)
                                                            )}
                                                        </div>
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="min-w-0 flex-1">
                                                                <h3 className="truncate text-lg font-bold leading-tight cc-text-primary transition-colors group-hover:text-brand-700">
                                                                    {neighbor.name}
                                                                </h3>
                                                                <p className="mt-1 truncate text-sm font-medium cc-text-secondary">
                                                                    {neighbor.role === "resident" ? "Miembro de la comunidad" : ROLE_LABELS[neighbor.role]}
                                                                </p>
                                                            </div>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => handleStartDM(neighbor)}
                                                                className="flex-shrink-0"
                                                                aria-label={`Enviar mensaje a ${neighbor.name}`}
                                                            >
                                                                <MessageSquare className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                        <div className="mt-4 flex flex-wrap items-center gap-2">
                                                            {neighbor.unitLabel && (
                                                                <Tag tone="neutral">
                                                                    <MapPin className="mr-1 inline h-3 w-3" />
                                                                    Depto {neighbor.unitLabel}
                                                                </Tag>
                                                            )}
                                                            <Tag tone="neutral">Directorio interno</Tag>
                                                        </div>
                                                        {neighbor.email && (
                                                            <p className="mt-4 truncate border-t border-subtle pt-4 text-xs font-medium cc-text-tertiary">
                                                                {neighbor.email}
                                                            </p>
                                                        )}
                                                    </div>
                                                </motion.div>
                                            );
                                        })}
                                    </div>
                                )}
                            </motion.div>
                        ) : (
                            <motion.div
                                key="services-view"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="space-y-6"
                            >
                                {/* Grid 4 Col de Categorías con Íconos Line */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                    {CATEGORIES.map(cat => {
                                        const Icon = cat.icon;
                                        const isSelected = activeServiceCategory === cat.id;
                                        return (
                                            <button
                                                key={cat.id}
                                                onClick={() => setActiveServiceCategory(isSelected ? null : cat.id)}
                                                className={`p-4 rounded-xl border text-left transition-all ${
                                                    isSelected
                                                        ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500/10'
                                                        : 'border-subtle bg-surface hover:border-brand-200'
                                                }`}
                                            >
                                                <div className={`p-2 w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${
                                                    isSelected ? 'bg-brand-500 text-white' : 'bg-elevated cc-text-secondary'
                                                }`}>
                                                    <Icon className="h-5 w-5" />
                                                </div>
                                                <p className="text-xs font-bold uppercase tracking-wider cc-text-secondary">Categoría</p>
                                                <p className="mt-0.5 text-sm font-semibold cc-text-primary">{cat.name}</p>
                                            </button>
                                        );
                                    })}
                                </div>

                                <div className="flex items-center justify-between mt-4">
                                    <div className="text-xs font-semibold cc-text-secondary flex items-center gap-1.5">
                                        <SlidersHorizontal className="h-4 w-4" />
                                        {filteredProviders.length} proveedores encontrados
                                    </div>
                                    {activeServiceCategory && (
                                        <button
                                            onClick={() => setActiveServiceCategory(null)}
                                            className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1"
                                        >
                                            <X className="h-3 w-3" /> Limpiar filtro de categoría
                                        </button>
                                    )}
                                </div>

                                {filteredProviders.length === 0 ? (
                                    <div className="text-center py-16 border border-dashed border-slate-200 rounded-2xl bg-surface/50 shadow-inner max-w-sm mx-auto my-6">
                                        <div className="p-3 bg-brand-50 text-brand-500 rounded-full w-fit mx-auto mb-4 border border-brand-100 shadow-sm">
                                            <Wrench className="h-6 w-6" />
                                        </div>
                                        <h3 className="text-sm font-bold cc-text-primary">No se encontraron proveedores</h3>
                                        <p className="text-xs cc-text-secondary mt-1 px-6 leading-relaxed">Prueba ampliando tu búsqueda o borrando los filtros activos.</p>
                                        <button 
                                            onClick={() => { setSearchTerm(""); setActiveServiceCategory(null); }}
                                            className="mt-5 inline-flex items-center justify-center h-8 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                                        >
                                            Restablecer filtros
                                        </button>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                                        {filteredProviders.map((provider) => (
                                            <ProviderCard key={provider.id} provider={provider} showCategory compact />
                                        ))}
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                )}
            </div>
        </ErrorBoundary>
    );
}
