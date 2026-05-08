"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/authContext";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
    Users, Search, MessageSquare, MapPin,
    Shield, Star, Loader2, Home
} from "lucide-react";
import Image from "next/image";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { ModuleHeader } from "@/components/ui/ModuleHeader";

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
    admin: 'Administrador',
    resident: 'Residente',
    concierge: 'Conserjería'
};

const ROLE_STYLES: Record<string, string> = {
    admin: '#F45B3D',
    resident: '#10B981',
    concierge: '#F59E0B'
};

const ROLE_BADGE: Record<string, string> = {
    admin: 'bg-role-admin-bg text-role-admin-fg',
    resident: 'bg-success-bg text-success-fg',
    concierge: 'bg-warning-bg text-warning-fg'
};

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

export default function DirectoryPage() {
    const { user } = useAuth();
    const router = useRouter();

    const [neighbors, setNeighbors] = useState<Neighbor[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [activeFilter, setActiveFilter] = useState<'all' | 'admin' | 'resident' | 'concierge'>('all');
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const loadNeighbors = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .neq('id', user?.id || '0')
                .order('name');

            if (error) {
                console.error("Supabase error in loadNeighbors:", error);
                throw error;
            }

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
        } catch (error) {
            console.error("Error loading neighbors:", error);
            setNeighbors([]);
        } finally {
            setIsLoading(false);
        }
    }, [user]);

    useEffect(() => {
        loadNeighbors();
    }, [loadNeighbors]);

    const handleStartDM = (neighbor: Neighbor) => {
        // Navigate to chat with a query param to auto-open DM
        router.push(`/chat?peer=${neighbor.id}`);
    };

    const filtered = neighbors.filter(n => {
        if (!n) return false;
        const fullName = n.name || "";
        const searchTermLower = (searchTerm || "").toLowerCase();
        const matchSearch = fullName.toLowerCase().includes(searchTermLower) ||
            (n.unitLabel || '').toLowerCase().includes(searchTermLower);
        const matchFilter = activeFilter === 'all' || n.role === activeFilter;
        return matchSearch && matchFilter;
    });

    const adminCount = neighbors.filter(n => n.role === 'admin').length;
    const residentCount = neighbors.filter(n => n.role === 'resident').length;
    const conciergeCount = neighbors.filter(n => n.role === 'concierge').length;

    return (
        <ErrorBoundary name="Directorio de Vecinos">
            <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 space-y-7">
                <ModuleHeader
                    eyebrow="Comunidad"
                    title="Directorio"
                    description="Encuentra residentes, administración y conserjería con búsqueda por nombre o departamento."
                    icon={<Users className="h-5 w-5" />}
                    meta={`${neighbors.length} personas registradas`}
                    actions={
                        <div className="relative w-full md:w-80">
                            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Buscar nombre o depto"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="h-11 w-full rounded-lg border border-subtle bg-surface pl-10 pr-4 text-sm font-medium shadow-sm outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-500/20"
                            />
                        </div>
                    }
                />

            {/* Stats Strip */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                    { label: 'Residentes', count: residentCount, icon: Home, filter: 'resident' as const },
                    { label: 'Administración', count: adminCount, icon: Shield, filter: 'admin' as const },
                    { label: 'Conserjería', count: conciergeCount, icon: Star, filter: 'concierge' as const },
                ].map((s) => (
                    <button
                        key={s.filter}
                        onClick={() => setActiveFilter(activeFilter === s.filter ? 'all' : s.filter)}
                        className={`relative overflow-hidden rounded-lg border bg-surface p-4 text-left shadow-sm transition-colors ${
                            activeFilter === s.filter ? "border-brand-300 bg-brand-50" : "border-subtle hover:border-default"
                        }`}
                    >
                        <div className="mb-3 inline-flex rounded-lg bg-elevated p-2 cc-text-secondary">
                            <s.icon className="h-4 w-4" />
                        </div>
                        <p className="text-2xl font-semibold cc-text-primary">{s.count}</p>
                        <p className="mt-0.5 text-xs font-semibold cc-text-secondary">{s.label}</p>
                    </button>
                ))}
            </div>

            {/* Directory Grid */}
            {isLoading ? (
                <div className="flex justify-center py-20">
                    <Loader2 className="h-10 w-10 animate-spin text-brand-400" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-20 space-y-3">
                    <Users className="h-14 w-14 text-slate-200 dark:text-slate-700 mx-auto" />
                    <h3 className="text-lg font-semibold text-slate-400">No se encontraron vecinos</h3>
                    <p className="text-sm text-slate-400">Intenta con otro nombre o depto.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <AnimatePresence>
                        {filtered.map((neighbor, idx) => {
                            const isExpanded = expandedId === neighbor.id;
                            const accent = ROLE_STYLES[neighbor.role] || '#64748B';

                            return (
                                <motion.div
                                    key={neighbor.id}
                                    initial={{ opacity: 0, y: 16 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.04 }}
                                    layout
                                    className="group cursor-pointer overflow-hidden rounded-lg border border-subtle bg-surface shadow-sm transition-colors hover:border-brand-200"
                                    onClick={() => setExpandedId(isExpanded ? null : neighbor.id)}
                                >
                                    {/* Card Top Banner */}
                                    <div className="h-1.5" style={{ backgroundColor: accent }} />

                                    {/* Avatar (overlapping banner) */}
                                    <div className="p-5">
                                        <div className="flex items-start gap-4">
                                            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg shadow-sm" style={{ backgroundColor: accent }}>
                                                {neighbor.avatar_url ? (
                                                    <Image src={neighbor.avatar_url} alt={neighbor.name} width={48} height={48} className="h-full w-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-lg font-semibold text-white">
                                                        {neighbor.name?.charAt(0)}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="min-w-0 flex-1">
                                                <h3 className="truncate font-semibold cc-text-primary text-base leading-tight" title={neighbor.name || 'Vecino'}>
                                                    {neighbor.name || 'Vecino'}
                                                </h3>
                                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] font-bold rounded-full ${ROLE_BADGE[neighbor.role] || 'bg-elevated text-slate-600'}`}>
                                                        {ROLE_LABELS[neighbor.role] || 'Residente'}
                                                    </span>
                                                    {neighbor.unitLabel && (
                                                        <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-elevated px-2.5 py-0.5 text-[11px] font-bold cc-text-secondary">
                                                            <MapPin className="h-3 w-3 shrink-0" />
                                                            <span className="truncate">Depto {neighbor.unitLabel}</span>
                                                        </span>
                                                    )}
                                                </div>
                                                {neighbor.email && neighbor.email !== neighbor.name && (
                                                    <p className="mt-2 truncate text-xs font-medium cc-text-tertiary" title={neighbor.email}>
                                                        {neighbor.email}
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        {/* Expanded actions */}
                                        <AnimatePresence>
                                            {isExpanded && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    className="overflow-hidden"
                                                >
                                                    <div className="pt-4 mt-4 border-t border-subtle">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleStartDM(neighbor);
                                                            }}
                                                            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-brand-600"
                                                        >
                                                            <MessageSquare className="h-4 w-4" />
                                                            Enviar mensaje
                                                        </button>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            )}
        </div>
    </ErrorBoundary>
);
}

// Local ErrorBoundary helper replaced by the shared one
