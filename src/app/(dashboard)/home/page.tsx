"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/authContext";
import { supabase } from "@/lib/supabase";
import { motion } from "framer-motion";
import {
    Users, ShoppingBag, Wrench, ClipboardList, TrendingUp, Bell,
    Calendar, DollarSign, ArrowUpRight, Building2, Clock, Sparkles,
    ChevronRight, BarChart3, PieChart as PieChartIcon
} from "lucide-react";
import Link from "next/link";
import { StatCard } from "@/components/ui/StatCard";
import { ActionCard } from "@/components/ui/ActionCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonStats, SkeletonList } from "@/components/ui/Skeleton";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { ExpenseAreaChart, ExpensePieChart, AmenityUsageChart } from "@/components/charts/Charts";
import { WhatsNew } from "@/components/ui/WhatsNew";
import { DebugStats } from "@/components/ui/DebugStats";

// Mock data for charts
const expenseChartData = [
    { month: 'Sep', monto: 82000 },
    { month: 'Oct', monto: 85000 },
    { month: 'Nov', monto: 83500 },
    { month: 'Dic', monto: 90000 },
    { month: 'Ene', monto: 87000 },
    { month: 'Feb', monto: 85000 },
];

const expenseCategoryData = [
    { name: 'Mantención', value: 35000, color: '#7C3AED' },
    { name: 'Limpieza', value: 25000, color: '#10b981' },
    { name: 'Seguridad', value: 15000, color: '#f59e0b' },
    { name: 'Servicios', value: 10000, color: '#ef4444' },
];

const amenityUsageData = [
    { name: 'Quincho', reservas: 12 },
    { name: 'Piscina', reservas: 28 },
    { name: 'Gimnasio', reservas: 45 },
    { name: 'Cowork', reservas: 18 },
    { name: 'Eventos', reservas: 8 },
];

export default function HomePage() {
    const { user } = useAuth();
    const [isLoading, setIsLoading] = useState(true);
    const [statsData, setStatsData] = useState({
        announcements: 0,
        marketplace: 0,
        bookings: 0,
        pendingExpenses: 0,
        residents: 0,
        pendingRequests: 0,
        visitorsToday: 0,
        visitorsExpected: 0, // Placeholder
        pendingPackages: 0,
        recentAnnouncements: [] as { id: string; title: string; content: string; priority: string; createdAt: string; author: string }[]
    });

    useEffect(() => {
        if (!user) return;

        const fetchDashboardData = async () => {
            setIsLoading(true);
            try {
                // Fetch basic announcements and count in parallel
                const [annCountRes, recentAnnRes] = await Promise.all([
                    supabase.from('announcements').select('*', { count: 'exact', head: true }),
                    supabase.from('announcements')
                        .select('id, title, content, priority, created_at, profiles(name)')
                        .order('created_at', { ascending: false })
                        .limit(3)
                ]);

                const annCount = annCountRes.count;
                const recentAnn = recentAnnRes.data;

                let commonStats = {
                    announcements: annCount || 0,
                    recentAnnouncements: (recentAnn || []).map((a: any) => {
                        const profiles = a.profiles;
                        const authorName = Array.isArray(profiles) 
                            ? (profiles[0] as any)?.name 
                            : (profiles as any)?.name;

                        return {
                            id: a.id,
                            title: a.title,
                            content: a.content,
                            priority: a.priority,
                            createdAt: a.created_at,
                            author: authorName || 'Admin',
                        };
                    })
                };

                if (user.role === 'resident') {
                    const [mpRes, expRes, bookRes] = await Promise.all([
                        supabase.from('marketplace_items').select('*', { count: 'exact', head: true }),
                        supabase.from('expenses').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
                        supabase.from('bookings').select('*', { count: 'exact', head: true }).gte('date', new Date().toISOString())
                    ]);

                    setStatsData(prev => ({
                        ...prev, ...commonStats,
                        marketplace: mpRes.count || 0,
                        pendingExpenses: expRes.count || 0,
                        bookings: bookRes.count || 0
                    }));
                } else if (user.role === 'admin') {
                    const [resProp, reqProp, expProp] = await Promise.all([
                        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'resident'),
                        supabase.from('service_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
                        supabase.from('expenses').select('*', { count: 'exact', head: true }).neq('status', 'paid')
                    ]);

                    setStatsData(prev => ({
                        ...prev, ...commonStats,
                        residents: resProp.count || 0,
                        pendingRequests: reqProp.count || 0,
                        pendingExpenses: expProp.count || 0
                    }));
                } else if (user.role === 'concierge') {
                    const today = new Date().toISOString().split('T')[0];
                    const [visTodayRes, packRes] = await Promise.all([
                        supabase.from('visitor_logs').select('*', { count: 'exact', head: true }).gte('entry_time', today),
                        supabase.from('packages').select('*', { count: 'exact', head: true }).eq('status', 'pending')
                    ]);

                    setStatsData(prev => ({
                        ...prev, ...commonStats,
                        visitorsToday: visTodayRes.count || 0,
                        pendingPackages: packRes.count || 0
                    }));
                }
            } catch (err) {
                console.error("Error fetching dashboard stats:", err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchDashboardData();
    }, [user]);

    if (!user) return null;

    const statsResident = [
        {
            label: "Avisos Nuevos",
            value: statsData.announcements,
            icon: Bell,
            tone: "brand",
            link: "/feed"
        },
        {
            label: "En Marketplace",
            value: statsData.marketplace,
            icon: ShoppingBag,
            tone: "success",
            link: "/marketplace"
        },
        {
            label: "Próximas Reservas",
            value: statsData.bookings,
            icon: Calendar,
            tone: "info",
            link: "/amenities"
        },
        {
            label: "Gastos Pendientes",
            value: statsData.pendingExpenses,
            icon: DollarSign,
            tone: "danger",
            trend: { direction: 'down', value: 'Al día', inverted: true },
            link: "/resident/finances"
        },
    ];

    const statsAdmin = [
        {
            label: "Residentes",
            value: statsData.residents,
            icon: Users,
            tone: "brand",
            trend: { direction: 'up', value: 'Conectados' },
            link: "/admin/users"
        },
        {
            label: "Avisos Activos",
            value: statsData.announcements,
            icon: Bell,
            tone: "info",
            link: "/feed"
        },
        {
            label: "Solicitudes",
            value: statsData.pendingRequests,
            icon: Wrench,
            tone: "warning",
            link: "/services"
        },
        {
            label: "Pagos Pendientes",
            value: statsData.pendingExpenses,
            icon: DollarSign,
            tone: "danger",
            link: "/expenses"
        },
    ];

    const statsConcierge = [
        {
            label: "Visitas Hoy",
            value: statsData.visitorsToday,
            icon: ClipboardList,
            tone: "success",
            link: "/concierge/visitors"
        },
        {
            label: "Visitas Esperadas",
            value: statsData.visitorsExpected,
            icon: Users,
            tone: "brand",
            link: "/concierge/visitors"
        },
        {
            label: "Paquetes",
            value: statsData.pendingPackages,
            icon: ShoppingBag,
            tone: "warning",
            link: "/concierge/packages"
        },
        {
            label: "Avisos",
            value: statsData.announcements,
            icon: Bell,
            tone: "info",
            link: "/feed"
        },
    ];

    const stats = user.role === 'admin' ? statsAdmin : user.role === 'concierge' ? statsConcierge : statsResident;

    const recentAnnouncements = statsData.recentAnnouncements;

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Buenos días';
        if (hour < 18) return 'Buenas tardes';
        return 'Buenas noches';
    };

    const container = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1
            }
        }
    };

    const item = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0 }
    };

    return (
        <div className="max-w-7xl space-y-8">
            {/* Welcome Header */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
            >
                <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-gradient-to-br from-[#7C3AED] to-[#5B21B6] rounded-xl shadow-lg shadow-indigo-500/30">
                                <Building2 className="h-5 w-5 text-white" />
                            </div>
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-amber-100 to-orange-100 dark:from-amber-500/20 dark:to-orange-500/20 rounded-full">
                                <Sparkles className="h-3.5 w-3.5 text-warning-fg" />
                                <span className="text-xs font-semibold text-warning-fg">
                                    {user.role === 'admin' ? 'Panel Admin' : user.role === 'concierge' ? 'Conserjería' : 'Mi Edificio'}
                                </span>
                            </div>
                        </div>
                        <h1 className="text-2xl lg:text-3xl font-bold cc-text-primary">
                            {getGreeting()}, <span className="bg-gradient-to-r from-[#6D28D9] to-[#5B21B6] bg-clip-text text-transparent">
                                {user.name.split(' ')[0]}
                            </span>
                        </h1>
                        <p className="cc-text-secondary mt-1">
                            {user.role === 'admin'
                                ? 'Gestiona tu comunidad desde un solo lugar'
                                : user.role === 'concierge'
                                    ? 'Control de accesos y servicios del edificio'
                                    : `Bienvenido a ComunidadConnect${user.unitName ? ` • ${user.unitName}` : ''}`
                            }
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="px-4 py-2 bg-surface rounded-xl shadow-sm border border-subtle flex items-center gap-2">
                            <Clock className="h-4 w-4 text-slate-400" />
                            <span className="text-sm font-medium cc-text-secondary">
                                {new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
                            </span>
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Stats Cards */}
            {isLoading ? (
                <SkeletonStats />
            ) : (
                <motion.div
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6"
                    variants={container}
                    initial="hidden"
                    animate="show"
                >
                    {stats.map((stat, idx) => {
                        const Icon = stat.icon;
                        return (
                            <motion.div key={idx} variants={item} className="h-full">
                                <StatCard
                                    className="h-full"
                                    href={stat.link}
                                    icon={<Icon className="h-5 w-5" style={{ color: 'inherit' }} />}
                                    label={stat.label}
                                    value={stat.value}
                                    tone={stat.tone as any}
                                    trend={(stat as any).trend}
                                />
                            </motion.div>
                        );
                    })}
                </motion.div>
            )}

            {/* Analytics Section - Admin Only */}
            {user.role === 'admin' && !isLoading && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                    className="grid grid-cols-1 lg:grid-cols-3 gap-6"
                >
                    {/* Expense Chart */}
                    <div className="lg:col-span-2 bg-white dark:bg-[#12121D] border border-subtle rounded-2xl shadow-md p-6 lg:p-8 relative overflow-hidden">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-xl" style={{ backgroundColor: 'rgba(124,58,237,0.12)', color: '#A58FFC' }}>
                                    <BarChart3 className="h-5 w-5 text-role-admin-fg" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold cc-text-primary">Gastos Mensuales</h2>
                                    <p className="text-xs cc-text-secondary">Últimos 6 meses</p>
                                </div>
                            </div>
                            <Link href="/expenses" className="text-sm font-medium text-role-admin-fg hover:text-brand-700 dark:hover:text-brand-300 flex items-center gap-1">
                                Ver más <ArrowUpRight className="h-4 w-4" />
                            </Link>
                        </div>
                        <ErrorBoundary name="Resumen de gastos">
                            <ExpenseAreaChart data={expenseChartData} />
                        </ErrorBoundary>
                    </div>

                    {/* Category Breakdown */}
                    <div className="bg-white dark:bg-[#12121D] border border-subtle rounded-2xl shadow-md p-6 lg:p-8 relative overflow-hidden">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 rounded-xl" style={{ backgroundColor: 'rgba(59,130,246,0.12)', color: '#60A5FA' }}>
                                <PieChartIcon className="h-5 w-5 text-brand-600 dark:text-brand-400" />
                            </div>
                            <h2 className="text-lg font-bold cc-text-primary">Por Categoría</h2>
                        </div>
                        <ErrorBoundary name="Distribución por categoría">
                            <ExpensePieChart data={expenseCategoryData} />
                        </ErrorBoundary>
                        <div className="mt-4 space-y-2">
                            {expenseCategoryData.map((item) => (
                                <div key={item.name} className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                                        <span className="text-sm cc-text-secondary">{item.name}</span>
                                    </div>
                                    <span className="text-sm font-medium cc-text-primary">
                                        ${item.value.toLocaleString('es-CL')}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </motion.div>
            )}

            {/* Amenity Usage Chart - Admin Only */}
            {user.role === 'admin' && !isLoading && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                >
                    <div className="bg-white dark:bg-[#12121D] border border-subtle rounded-2xl shadow-md p-6 lg:p-8 relative overflow-hidden">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-xl" style={{ backgroundColor: 'rgba(16,185,129,0.12)', color: '#34D399' }}>
                                    <Calendar className="h-5 w-5 text-success-fg" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold cc-text-primary">Uso de Amenidades</h2>
                                    <p className="text-xs cc-text-secondary">Reservas este mes</p>
                                </div>
                            </div>
                            <Link href="/amenities" className="text-sm font-medium text-success-fg hover:text-emerald-700 dark:hover:text-emerald-300 flex items-center gap-1">
                                Gestionar <ArrowUpRight className="h-4 w-4" />
                            </Link>
                        </div>
                        <ErrorBoundary name="Uso de amenidades">
                            <AmenityUsageChart data={amenityUsageData} />
                        </ErrorBoundary>
                    </div>
                </motion.div>
            )}

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Recent Announcements */}
                {user.role !== 'concierge' && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="lg:col-span-2"
                    >
                        <div className="bg-white dark:bg-[#12121D] border border-subtle rounded-2xl shadow-md overflow-hidden">
                            <div className="p-5 lg:p-6 flex items-center justify-between border-b border-subtle">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-xl" style={{ backgroundColor: 'rgba(59, 130, 246, 0.12)', color: '#60A5FA' }}>
                                        <Bell className="h-5 w-5" />
                                    </div>
                                    <h2 className="text-lg font-bold">Avisos Recientes</h2>
                                </div>
                                <Link href="/feed" className="text-sm font-medium flex items-center gap-1" style={{ color: '#A58FFC' }}>
                                    Ver todos <ArrowUpRight className="h-4 w-4" />
                                </Link>
                            </div>
                            {isLoading ? (
                                <div className="p-6">
                                    <SkeletonList count={3} />
                                </div>
                            ) : recentAnnouncements.length === 0 ? (
                                <div className="p-6">
                                    <EmptyState
                                        icon={<Bell className="h-6 w-6" />}
                                        title="Sin avisos recientes"
                                        description="No hay comunicados oficiales de la administración en este momento."
                                        tone="info"
                                        dashed={false}
                                    />
                                </div>
                            ) : (
                                <div className="divide-y divide-subtle">
                                    {recentAnnouncements.map((ann, idx) => (
                                        <motion.div
                                            key={ann.id}
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: 0.4 + idx * 0.1 }}
                                            className="p-4 lg:p-5 hover:bg-elevated/50 transition-colors"
                                        >
                                            <div className="flex items-start gap-4">
                                                <div className={`p-2 rounded-xl flex-shrink-0 ${ann.priority === 'alert'
                                                    ? 'bg-danger-bg text-danger-fg'
                                                    : ann.priority === 'event'
                                                        ? 'bg-brand-100 dark:bg-purple-500/20 text-brand-600 dark:text-purple-400'
                                                        : 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400'
                                                    }`}>
                                                    <Bell className="h-4 w-4" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <h3 className="font-semibold cc-text-primary truncate">{ann.title}</h3>
                                                    <p className="text-sm cc-text-secondary line-clamp-1 mt-0.5">{ann.content}</p>
                                                    <p className="text-xs cc-text-tertiary mt-2">{ann.author} • {new Date(ann.createdAt).toLocaleDateString('es-CL')}</p>
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}

                {/* Quick Actions */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className={user.role === 'concierge' ? 'lg:col-span-3 max-w-lg mx-auto w-full' : ''}
                >
                    <div className="bg-white dark:bg-[#12121D] border border-subtle rounded-2xl shadow-md p-6 lg:p-8">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 rounded-xl" style={{ backgroundColor: 'rgba(124, 58, 237, 0.12)', color: '#A58FFC' }}>
                                <TrendingUp className="h-5 w-5" />
                            </div>
                            <h2 className="text-lg font-bold">Acceso Rápido</h2>
                        </div>
                        <div className="space-y-3">
                            {user.role === 'concierge' ? (
                                <>
                                    <ActionCard
                                        href="/concierge/visitors"
                                        title="Registrar Visita"
                                        description="Control de acceso peatonal"
                                        icon={<Users className="h-5 w-5" />}
                                        tone="brand"
                                    />
                                    <ActionCard
                                        href="/concierge/packages"
                                        title="Recibir Paquete"
                                        description="Encomiendas y delivery"
                                        icon={<ShoppingBag className="h-5 w-5" />}
                                        tone="warning"
                                    />
                                    <ActionCard
                                        href="/services"
                                        title="Activar Emergencia"
                                        description="Notificar a todos"
                                        icon={<Bell className="h-5 w-5" />}
                                        tone="danger"
                                    />
                                </>
                            ) : (
                                <>
                                    <ActionCard
                                        href="/amenities"
                                        title="Reservar Espacio"
                                        description="Quinchos, salas y más"
                                        icon={<Calendar className="h-5 w-5" />}
                                        tone="info"
                                    />
                                    <ActionCard
                                        href="/marketplace"
                                        title="Publicar Artículo"
                                        description="Vende en el edificio"
                                        icon={<ShoppingBag className="h-5 w-5" />}
                                        tone="success"
                                    />
                                    <ActionCard
                                        href="/services"
                                        title="Solicitar Servicio"
                                        description="Reportar mantenimientos"
                                        icon={<Wrench className="h-5 w-5" />}
                                        tone="warning"
                                    />
                                    <ActionCard
                                        href="/resident/finances"
                                        title="Pagar Gastos"
                                        description="Ponte al día revisando tu estado"
                                        icon={<DollarSign className="h-5 w-5" />}
                                        tone="danger"
                                    />
                                </>
                            )}
                        </div>
                    </div>
                </motion.div>
            </div>
            <WhatsNew />
            <DebugStats />
        </div>
    );
}
