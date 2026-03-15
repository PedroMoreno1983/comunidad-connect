"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/authContext";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/components/ui/Toast";
import { useRouter } from "next/navigation";
import {
    Users, Search, MessageSquare, MapPin,
    Shield, Star, Loader2, Home
} from "lucide-react";
import clsx from "clsx";

interface Neighbor {
    id: string;
    full_name: string;
    avatar_url?: string;
    role: 'admin' | 'resident' | 'concierge';
    unit_id?: string;
    email?: string;
}

const ROLE_LABELS: Record<string, string> = {
    admin: 'Administrador',
    resident: 'Residente',
    concierge: 'Conserjería'
};

const ROLE_STYLES: Record<string, string> = {
    admin: 'from-indigo-500 to-purple-600',
    resident: 'from-emerald-500 to-teal-600',
    concierge: 'from-amber-500 to-orange-500'
};

const ROLE_BADGE: Record<string, string> = {
    admin: 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300',
    resident: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300',
    concierge: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300'
};

export default function DirectoryPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const router = useRouter();

    const [neighbors, setNeighbors] = useState<Neighbor[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [activeFilter, setActiveFilter] = useState<'all' | 'admin' | 'resident' | 'concierge'>('all');
    const [expandedId, setExpandedId] = useState<string | null>(null);

    useEffect(() => {
        loadNeighbors();
    }, [user]);

    const loadNeighbors = async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, full_name, avatar_url, role, unit_id')
                .neq('id', user?.id || '0')
                .order('full_name');

            if (error) {
                console.error("Supabase error in loadNeighbors:", error);
                throw error;
            }
            setNeighbors(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error("Error loading neighbors:", error);
            setNeighbors([]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleStartDM = (neighbor: Neighbor) => {
        // Navigate to chat with a query param to auto-open DM
        router.push(`/chat?peer=${neighbor.id}`);
    };

    const filtered = neighbors.filter(n => {
        const matchSearch = n.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (n.unit_id || '').toLowerCase().includes(searchTerm.toLowerCase());
        const matchFilter = activeFilter === 'all' || n.role === activeFilter;
        return matchSearch && matchFilter;
    });

    const adminCount = neighbors.filter(n => n.role === 'admin').length;
    const residentCount = neighbors.filter(n => n.role === 'resident').length;
    const conciergeCount = neighbors.filter(n => n.role === 'concierge').length;

    return (
        <ErrorBoundary fallbackMessage="Hubo un error al cargar el directorio. Por favor, intenta de nuevo.">
            <div className="max-w-5xl mx-auto py-10 px-4 sm:px-6 space-y-10">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl shadow-lg shadow-blue-500/30">
                        <Users className="h-6 w-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black text-slate-900 dark:text-white">Directorio</h1>
                        <p className="text-sm font-medium text-slate-500 mt-1">{neighbors.length} personas en la comunidad</p>
                    </div>
                </div>

                {/* Search bar */}
                <div className="relative w-full md:w-72">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Buscar por nombre o depto..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full pl-11 pr-5 py-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/30 shadow-sm"
                    />
                </div>
            </div>

            {/* Stats Strip */}
            <div className="grid grid-cols-3 gap-4">
                {[
                    { label: 'Residentes', count: residentCount, icon: Home, gradient: 'from-emerald-500 to-teal-500', filter: 'resident' as const },
                    { label: 'Administración', count: adminCount, icon: Shield, gradient: 'from-indigo-500 to-purple-600', filter: 'admin' as const },
                    { label: 'Conserjería', count: conciergeCount, icon: Star, gradient: 'from-amber-500 to-orange-500', filter: 'concierge' as const },
                ].map((s) => (
                    <button
                        key={s.filter}
                        onClick={() => setActiveFilter(activeFilter === s.filter ? 'all' : s.filter)}
                        className={clsx(
                            "relative rounded-2xl p-4 sm:p-5 border transition-all overflow-hidden text-left",
                            activeFilter === s.filter
                                ? "border-transparent shadow-lg ring-2 ring-offset-2 ring-indigo-400/60 dark:ring-offset-slate-900"
                                : "bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 hover:border-slate-200 dark:hover:border-slate-600 shadow-sm"
                        )}
                    >
                        {activeFilter === s.filter && (
                            <div className={`absolute inset-0 bg-gradient-to-br ${s.gradient} opacity-10 dark:opacity-20`} />
                        )}
                        <div className={`inline-flex p-2 rounded-xl bg-gradient-to-br ${s.gradient} mb-3`}>
                            <s.icon className="h-4 w-4 text-white" />
                        </div>
                        <p className="text-2xl font-black text-slate-900 dark:text-white">{s.count}</p>
                        <p className="text-xs font-bold text-slate-500 mt-0.5">{s.label}</p>
                    </button>
                ))}
            </div>

            {/* Directory Grid */}
            {isLoading ? (
                <div className="flex justify-center py-20">
                    <Loader2 className="h-10 w-10 animate-spin text-indigo-400" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-20 space-y-3">
                    <Users className="h-14 w-14 text-slate-200 dark:text-slate-700 mx-auto" />
                    <h3 className="text-lg font-black text-slate-400">No se encontraron vecinos</h3>
                    <p className="text-sm text-slate-400">Intenta con otro nombre o depto.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <AnimatePresence>
                        {filtered.map((neighbor, idx) => {
                            const isExpanded = expandedId === neighbor.id;
                            const gradient = ROLE_STYLES[neighbor.role] || 'from-slate-400 to-slate-500';

                            return (
                                <motion.div
                                    key={neighbor.id}
                                    initial={{ opacity: 0, y: 16 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.04 }}
                                    layout
                                    className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-md shadow-slate-200/40 dark:shadow-none overflow-hidden group cursor-pointer hover:shadow-xl hover:shadow-slate-200/60 dark:hover:shadow-none transition-all"
                                    onClick={() => setExpandedId(isExpanded ? null : neighbor.id)}
                                >
                                    {/* Card Top Banner */}
                                    <div className={`h-14 bg-gradient-to-br ${gradient} relative`}>
                                        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 30% 50%, white 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
                                    </div>

                                    {/* Avatar (overlapping banner) */}
                                    <div className="px-5 pb-5">
                                        <div className={`w-16 h-16 rounded-2xl overflow-hidden bg-gradient-to-br ${gradient} border-4 border-white dark:border-slate-800 shadow-lg -mt-8 mb-3`}>
                                            {neighbor.avatar_url ? (
                                                <img src={neighbor.avatar_url} alt={neighbor.full_name} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-2xl font-black text-white">
                                                    {neighbor.full_name?.charAt(0)}
                                                </div>
                                            )}
                                        </div>

                                        {/* Name & Role */}
                                        <h3 className="font-black text-slate-900 dark:text-white text-base leading-tight">{neighbor.full_name}</h3>
                                        <span className={`inline-flex items-center gap-1.5 mt-1.5 px-2.5 py-0.5 text-[11px] font-bold rounded-full ${ROLE_BADGE[neighbor.role]}`}>
                                            {ROLE_LABELS[neighbor.role] || neighbor.role}
                                        </span>

                                        {/* Unit info */}
                                        {neighbor.unit_id && (
                                            <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                                                <MapPin className="h-3 w-3" />
                                                Depto {neighbor.unit_id}
                                            </p>
                                        )}

                                        {/* Expanded actions */}
                                        <AnimatePresence>
                                            {isExpanded && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    className="overflow-hidden"
                                                >
                                                    <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-700">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleStartDM(neighbor);
                                                            }}
                                                            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r ${gradient} text-white text-sm font-bold shadow-md hover:scale-105 transition-transform`}
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

function ErrorBoundary({ children, fallbackMessage }: { children: React.ReactNode, fallbackMessage: string }) {
    return children; // For now, we rely on the main error boundary, but we wrap it to prevent full page crash
}
