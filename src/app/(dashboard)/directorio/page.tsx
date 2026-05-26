"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/authContext";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
    Users, Search, MessageSquare, MapPin,
    Shield, Star, Loader2, Home, Wrench, Zap, Key, Sparkles, SlidersHorizontal, X
} from "lucide-react";
import Image from "next/image";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { ModuleHeader } from "@/components/ui/ModuleHeader";
import { Tag } from "@/components/cc/Tag";
import { Button } from "@/components/cc/Button";
import { providersService } from "@/lib/services/providersService";
import { ServiceProvider } from "@/lib/types";

interface Neighbor {
    id: string;
    name: string;
    avatar_url?: string;
    role: 'admin' | 'resident' | 'concierge';
    unit_id?: string;
    unitLabel?: string;
    email?: string;
}

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

function isUuid(value?: string | null) {
    return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value));
}

function getProfileName(profile: Record<string, unknown>) {
    const rawName = String(profile.name || profile.full_name || "").trim();
    const email = String(profile.email || "").trim();
    if (rawName && rawName !== email) return rawName;
    if (email) return email.split("@")[0];
    return "Vecino";
}

function getUnitLabel(profile: Record<string, unknown>, unit?: Record<string, unknown>) {
    const profileDepartment = String(profile.department_number || "").trim();
    if (profileDepartment) return profileDepartment;

    const unitNumber = String(unit?.number || unit?.unit_number || unit?.department_number || "").trim();
    const tower = String(unit?.tower || "").trim();
    if (unitNumber && tower) return `${tower}-${unitNumber}`;
    if (unitNumber) return unitNumber;

    const rawUnitId = String(profile.unit_id || "").trim();
    return rawUnitId && !isUuid(rawUnitId) ? rawUnitId : "";
}

const demoNeighbors: Neighbor[] = [
    {
        id: "demo-resident-marta",
        name: "Marta Rojas",
        role: "resident",
        unit_id: "demo-unit-805",
        unitLabel: "805",
        email: "marta.rojas@demo.com",
    },
    {
        id: "demo-resident-diego",
        name: "Diego Salinas",
        role: "resident",
        unit_id: "demo-unit-1204",
        unitLabel: "1204",
        email: "diego.salinas@demo.com",
    },
    {
        id: "demo-concierge-turno",
        name: "Conserje Turno",
        role: "concierge",
        unitLabel: "Acceso principal",
        email: "conserjeria@demo.com",
    },
    {
        id: "demo-admin-community",
        name: "Administración Comunidad",
        role: "admin",
        unitLabel: "Oficina admin",
        email: "admin@demo.com",
    },
];

const demoOnboardingStorageKey = "cc_demo_onboarding_residents";

function getDemoOnboardedNeighbors(): Neighbor[] {
    if (typeof window === "undefined") return [];
    try {
        const rows = JSON.parse(window.localStorage.getItem(demoOnboardingStorageKey) || "[]") as Array<{
            id?: string;
            name?: string;
            unit_id?: string;
            email?: string;
        }>;

        return rows
            .filter(row => String(row.name || "").trim() && String(row.unit_id || "").trim())
            .map((row, index) => ({
                id: row.id || `demo-onboarded-neighbor-${index}`,
                name: String(row.name || "Vecino").trim(),
                role: "resident" as const,
                unit_id: `demo-onboarded-unit-${String(row.unit_id || "").trim()}`,
                unitLabel: String(row.unit_id || "").trim(),
                email: String(row.email || "").trim() || undefined,
            }));
    } catch {
        return [];
    }
}

export default function DirectoryPage() {
    const { user } = useAuth();
    const router = useRouter();

    const [viewMode, setViewMode] = useState<'neighbors' | 'services'>('neighbors');
    const [neighbors, setNeighbors] = useState<Neighbor[]>([]);
    const [providers, setProviders] = useState<ServiceProvider[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    
    // Filters for Neighbors
    const [activeNeighborFilter, setActiveNeighborFilter] = useState<'all' | 'admin' | 'resident' | 'concierge'>('all');
    
    // Filters for Services
    const [activeServiceCategory, setActiveServiceCategory] = useState<string | null>(null);

    const isDemoUser = user?.email.toLowerCase().endsWith("@demo.com") ?? false;

    const loadData = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);

        try {
            // Load Providers
            const allProviders = await providersService.getAll();
            setProviders(allProviders);

            // Load Neighbors
            if (isDemoUser) {
                const importedNeighbors = getDemoOnboardedNeighbors();
                const byKey = new Map<string, Neighbor>();
                [...importedNeighbors, ...demoNeighbors].forEach(neighbor => {
                    const key = neighbor.email || `${neighbor.role}-${neighbor.unitLabel || neighbor.id}`;
                    if (!byKey.has(key)) byKey.set(key, neighbor);
                });
                setNeighbors(Array.from(byKey.values()).filter(neighbor => neighbor.id !== user.id));
            } else {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('*')
                    .neq('id', user?.id || '0')
                    .order('name');

                if (error) throw error;

                const profiles = Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
                const unitIds = Array.from(new Set(
                    profiles
                        .map(profile => String(profile.unit_id || ""))
                        .filter(unitId => isUuid(unitId))
                ));

                let unitById = new Map<string, Record<string, unknown>>();
                if (unitIds.length > 0) {
                    const { data: unitsData, error: unitsError } = await supabase
                        .from('units')
                        .select('*')
                        .in('id', unitIds);

                    if (!unitsError && Array.isArray(unitsData)) {
                        unitById = new Map((unitsData as Array<Record<string, unknown>>).map(unit => [String(unit.id), unit]));
                    }
                }

                setNeighbors(profiles.map(profile => {
                    const unitId = String(profile.unit_id || "");
                    const unit = unitById.get(unitId);

                    return {
                        id: String(profile.id),
                        name: getProfileName(profile),
                        avatar_url: typeof profile.avatar_url === "string" ? profile.avatar_url : undefined,
                        role: (profile.role === "admin" || profile.role === "concierge" ? profile.role : "resident") as Neighbor["role"],
                        unit_id: unitId,
                        unitLabel: getUnitLabel(profile, unit),
                        email: typeof profile.email === "string" ? profile.email : undefined,
                    };
                }));
            }
        } catch (error) {
            console.error("Error loading directory data:", error);
        } finally {
            setIsLoading(false);
        }
    }, [isDemoUser, user]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleStartDM = (neighbor: Neighbor) => {
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
                                    {[
                                        { id: 'all', label: 'Todos' },
                                        { id: 'resident', label: 'Residentes' },
                                        { id: 'admin', label: 'Administración' },
                                        { id: 'concierge', label: 'Conserjería' }
                                    ].map(item => (
                                        <button
                                            key={item.id}
                                            onClick={() => setActiveNeighborFilter(item.id as any)}
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
                                    <div className="text-center py-20 border border-subtle rounded-xl bg-surface">
                                        <Users className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                                        <h3 className="text-base font-semibold cc-text-primary">No se encontraron vecinos</h3>
                                        <p className="text-xs cc-text-secondary">Prueba con otro término de búsqueda.</p>
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
                                                    className="overflow-hidden rounded-xl border border-subtle bg-surface shadow-sm transition-all hover:border-brand-200"
                                                >
                                                    <div className="h-1 w-full" style={{ backgroundColor: `var(--cc-${tone})` }} />
                                                    <div className="p-5 flex items-start gap-4">
                                                        <div className="h-12 w-12 rounded-xl flex-shrink-0 flex items-center justify-center font-bold text-white text-base"
                                                             style={{ backgroundColor: `var(--cc-${tone})` }}>
                                                            {neighbor.avatar_url ? (
                                                                <Image src={neighbor.avatar_url} alt={neighbor.name} width={48} height={48} className="h-full w-full object-cover rounded-xl" />
                                                            ) : (
                                                                neighbor.name.charAt(0).toUpperCase()
                                                            )}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <h3 className="font-semibold cc-text-primary text-sm truncate leading-snug">
                                                                {neighbor.name}
                                                            </h3>
                                                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                                                <Tag tone={tone} solid>{ROLE_LABELS[neighbor.role]}</Tag>
                                                                {neighbor.unitLabel && (
                                                                    <Tag tone="neutral">
                                                                        <MapPin className="h-3 w-3 inline mr-1" />
                                                                        Depto {neighbor.unitLabel}
                                                                    </Tag>
                                                                )}
                                                            </div>
                                                            {neighbor.email && (
                                                                <p className="mt-2 text-xs cc-text-tertiary truncate">
                                                                    {neighbor.email}
                                                                </p>
                                                            )}
                                                        </div>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleStartDM(neighbor)}
                                                            className="flex-shrink-0 animate-fade-in"
                                                        >
                                                            <MessageSquare className="h-4 w-4" />
                                                        </Button>
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
                                    <div className="text-center py-20 border border-subtle rounded-xl bg-surface">
                                        <Wrench className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                                        <h3 className="text-base font-semibold cc-text-primary">No se encontraron proveedores</h3>
                                        <p className="text-xs cc-text-secondary">Prueba con otro rubro o limpia los filtros.</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                                        {filteredProviders.map((provider, idx) => {
                                            const recommendedCount = Math.max(3, Math.round((provider.completedJobs || 12) * 0.35));
                                            return (
                                                <motion.div
                                                    key={provider.id}
                                                    initial={{ opacity: 0, y: 8 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{ delay: idx * 0.03 }}
                                                    className="rounded-xl border border-subtle bg-surface p-5 shadow-sm hover:border-brand-200 transition-all cursor-pointer flex flex-col justify-between"
                                                    onClick={() => router.push(`/services/provider/${provider.id}`)}
                                                >
                                                    <div className="space-y-4">
                                                        <div className="flex items-start gap-4">
                                                            <div className="h-12 w-12 rounded-xl flex-shrink-0 overflow-hidden bg-slate-100 border border-subtle">
                                                                {provider.photo ? (
                                                                    <img src={provider.photo} alt={provider.name} className="h-full w-full object-cover" />
                                                                ) : (
                                                                    <div className="w-full h-full flex items-center justify-center font-bold text-slate-400">
                                                                        {provider.name.charAt(0)}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <h3 className="font-semibold cc-text-primary text-sm leading-snug truncate">
                                                                    {provider.name}
                                                                </h3>
                                                                {/* Mono star rating */}
                                                                <p className="mt-1 text-xs font-semibold flex items-center gap-1 text-amber-500">
                                                                    ★ <span className="cc-text-primary">{provider.rating.toFixed(1)}</span>
                                                                    <span className="cc-text-tertiary">({provider.reviewCount} reviews)</span>
                                                                </p>
                                                            </div>
                                                        </div>

                                                        {/* Recommendation Badge in Copper Tint */}
                                                        <div>
                                                            <Tag tone="copper" solid>
                                                                Recomendado por {recommendedCount} vecinos
                                                            </Tag>
                                                        </div>

                                                        <p className="text-xs cc-text-secondary line-clamp-2 leading-relaxed">
                                                            {provider.bio}
                                                        </p>

                                                        {provider.specialties && provider.specialties.length > 0 && (
                                                            <div className="flex flex-wrap gap-1">
                                                                {provider.specialties.slice(0, 3).map((spec, sIdx) => (
                                                                    <span key={sIdx} className="text-[10px] bg-elevated px-2 py-0.5 rounded text-slate-600 font-medium">
                                                                        {spec}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="pt-4 border-t border-subtle mt-4 flex items-center justify-between text-xs font-semibold">
                                                        <span className="cc-text-tertiary">Tarifa: ${provider.hourlyRate?.toLocaleString("es-CL") || "25.000"}/hr</span>
                                                        <span className="text-brand-600 hover:underline">Ver perfil →</span>
                                                    </div>
                                                </motion.div>
                                            );
                                        })}
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
