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
import { SkeletonStats, SkeletonList } from "@/components/ui/Skeleton";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { ExpenseAreaChart, ExpensePieChart, AmenityUsageChart } from "@/components/charts/Charts";
import { WhatsNew } from "@/components/ui/WhatsNew";

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
    { name: 'Mantención', value: 35000, color: '#6366f1' },
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
        recentAnnouncements: [] as any[]
    });

    useEffect(() => {
        if (!user) return;

        const fetchDashboardData = async () => {
            setIsLoading(true);
            try {
                // Common queries
                const { count: annCount } = await supabase.from('announcements').select('*', { count: 'exact', head: true });
                const { data: recentAnn } = await supabase.from('announcements')
                    .select('id, title, content, priority, created_at, profiles(full_name)')
                    .order('created_at', { ascending: false })
                    .limit(3);

                let commonStats = {
                    announcements: annCount || 0,
                    recentAnnouncements: (recentAnn || []).map((a: { id: string; title: string; content: string; priority: string; created_at: string; profiles: { full_name: string } | { full_name: string }[] | null }) => ({
                        id: a.id,
                        title: a.title,
                        content: a.content,
                        priority: a.priority,
                        createdAt: a.created_at,
                        author: (Array.isArray(a.profiles) ? a.profiles[0]?.full_name : (a.profiles as { full_name: string } | null)?.full_name) || 'Admin',
                    }))
                };

                if (user.role === 'resident') {
                    const { count: mp } = await supabase.from('marketplace_items').select('*', { count: 'exact', head: true }) || { count: 0 };
                    const { count: exp } = await supabase.from('expenses').select('*', { count: 'exact', head: true }).eq('status', 'pending') || { count: 0 };
                    const { count: book } = await supabase.from('bookings').select('*', { count: 'exact', head: true }).gte('date', new Date().toISOString()) || { count: 0 };

                    setStatsData(prev => ({
                        ...prev, ...commonStats,
                        marketplace: mp || 0,
                        pendingExpenses: exp || 0,
                        bookings: book || 0
                    }));
                } else if (user.role === 'admin') {
                    const { count: res } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'resident') || { count: 0 };
                    const { count: req } = await supabase.from('service_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending') || { count: 0 };
                    const { count: exp } = await supabase.from('expenses').select('*', { count: 'exact', head: true }).neq('status', 'paid') || { count: 0 };

                    setStatsData(prev => ({
                        ...prev, ...commonStats,
                        residents: res || 0,
                        pendingRequests: req || 0,
                        pendingExpenses: exp || 0
                    }));
                } else if (user.role === 'concierge') {
                    const today = new Date().toISOString().split('T')[0];
                    const { count: visToday } = await supabase.from('visitor_logs').select('*', { count: 'exact', head: true }).gte('entry_time', today) || { count: 0 };
                    const { count: pack } = await supabase.from('packages').select('*', { count: 'exact', head: true }).eq('status', 'pending') || { count: 0 };

                    setStatsData(prev => ({
                        ...prev, ...commonStats,
                        visitorsToday: visToday || 0,
                        pendingPackages: pack || 0
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
            gradient: "from-indigo-500 to-purple-600",
            bg: "bg-indigo-100 dark:bg-indigo-500/20",
            link: "/feed"
        },
        {
            label: "En Marketplace",
            value: statsData.marketplace,
            icon: ShoppingBag,
            gradient: "from-emerald-500 to-teal-600",
            bg: "bg-emerald-100 dark:bg-emerald-500/20",
            link: "/marketplace"
        },
        {
            label: "Próximas Reservas",
            value: statsData.bookings,
            icon: Calendar,
            gradient: "from-purple-500 to-pink-600",
            bg: "bg-purple-100 dark:bg-purple-500/20",
            link: "/amenities"
        },
        {
            label: "Gastos Pendientes",
            value: statsData.pendingExpenses,
            icon: DollarSign,
            gradient: "from-rose-500 to-pink-600",
            bg: "bg-rose-100 dark:bg-rose-500/20",
            link: "/resident/finances"
        },
    ];

    const statsAdmin = [
        {
            label: "Residentes",
            value: statsData.residents,
            icon: Users,
            gradient: "from-indigo-500 to-purple-600",
            bg: "bg-indigo-100 dark:bg-indigo-500/20",
            link: "/admin/users"
        },
        {
            label: "Avisos Activos",
            value: statsData.announcements,
            icon: Bell,
            gradient: "from-amber-500 to-orange-600",
            bg: "bg-amber-100 dark:bg-amber-500/20",
            link: "/feed"
        },
        {
            label: "Solicitudes Abiertas",
            value: statsData.pendingRequests,
            icon: Wrench,
            gradient: "from-emerald-500 to-teal-600",
            bg: "bg-emerald-100 dark:bg-emerald-500/20",
            link: "/services"
        },
        {
            label: "Pagos Pendientes",
            value: statsData.pendingExpenses,
            icon: DollarSign,
            gradient: "from-rose-500 to-pink-600",
            bg: "bg-rose-100 dark:bg-rose-500/20",
            link: "/expenses"
        },
    ];

    const statsConcierge = [
        {
            label: "Visitas Hoy",
            value: statsData.visitorsToday,
            icon: ClipboardList,
            gradient: "from-amber-500 to-orange-600",
            bg: "bg-amber-100 dark:bg-amber-500/20",
            link: "/concierge/visitors"
        },
        {
            label: "Visitas Esperadas",
            value: statsData.visitorsExpected,
            icon: Users,
            gradient: "from-blue-500 to-cyan-600",
            bg: "bg-blue-100 dark:bg-blue-500/20",
            link: "/concierge/visitors"
        },
        {
            label: "Paquetes Pendientes",
            value: statsData.pendingPackages,
            icon: ShoppingBag,
            gradient: "from-emerald-500 to-teal-600",
            bg: "bg-emerald-100 dark:bg-emerald-500/20",
            link: "/concierge/packages"
        },
        {
            label: "Avisos",
            value: statsData.announcements,
            icon: Bell,
            gradient: "from-purple-500 to-pink-600",
            bg: "bg-purple-100 dark:bg-purple-500/20",
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
                            <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg shadow-indigo-500/30">
                                <Building2 className="h-5 w-5 text-white" />
                            </div>
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-amber-100 to-orange-100 dark:from-amber-500/20 dark:to-orange-500/20 rounded-full">
                                <Sparkles className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                                <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                                    {user.role === 'admin' ? 'Panel Admin' : user.role === 'concierge' ? 'Conserjería' : 'Mi Edificio'}
                                </span>
                            </div>
                        </div>
                        <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 dark:text-white">
                            {getGreeting()}, <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                                {user.name.split(' ')[0]}
                            </span>
                        </h1>
                        <p className="text-slate-500 dark:text-slate-400 mt-1">
                            {user.role === 'admin'
                                ? 'Gestiona tu comunidad desde un solo lugar'
                                : user.role === 'concierge'
                                    ? 'Control de accesos y servicios del edificio'
                                    : `Bienvenido a ComunidadConnect${user.unitName ? ` • ${user.unitName}` : ''}`
                            }
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="px-4 py-2 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center gap-2">
                            <Clock className="h-4 w-4 text-slate-400" />
                            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
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
                            <motion.div key={idx} variants={item}>
                                <Link
                                    href={stat.link}
                                    className="group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-800 p-5 lg:p-6 shadow-lg shadow-slate-200/50 dark:shadow-slate-950/50 border border-slate-100 dark:border-slate-700 hover:shadow-xl hover:border-slate-200 dark:hover:border-slate-600 hover:-translate-y-1 transition-all duration-300 block"
                                >
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br opacity-[0.07] group-hover:opacity-[0.12] transition-opacity rounded-full -translate-y-8 translate-x-8"
                                        style={{ backgroundImage: `linear-gradient(to bottom right, var(--tw-gradient-stops))` }} />
                                    <div className="relative">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className={`p-3 rounded-xl ${stat.bg}`}>
                                                <Icon className={`h-5 w-5 bg-gradient-to-r ${stat.gradient} bg-clip-text`} style={{ color: 'inherit' }} />
                                            </div>
                                            <ChevronRight className="h-5 w-5 text-slate-300 dark:text-slate-600 group-hover:text-slate-400 dark:group-hover:text-slate-500 group-hover:translate-x-1 transition-all" />
                                        </div>
                                        <p className="text-3xl font-bold text-slate-900 dark:text-white">
                                            {stat.value}
                                        </p>
                                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{stat.label}</p>
                                    </div>
                                </Link>
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
                    <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-2xl shadow-lg shadow-slate-200/50 dark:shadow-slate-950/50 border border-slate-100 dark:border-slate-700 p-5 lg:p-6">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-100 dark:bg-indigo-500/20 rounded-xl">
                                    <BarChart3 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">Gastos Mensuales</h2>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">Últimos 6 meses</p>
                                </div>
                            </div>
                            <Link href="/expenses" className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1">
                                Ver más <ArrowUpRight className="h-4 w-4" />
                            </Link>
                        </div>
                        <ErrorBoundary fallbackMessage="Error al cargar el resumen de gastos.">
                            <ExpenseAreaChart data={expenseChartData} />
                        </ErrorBoundary>
                    </div>

                    {/* Category Breakdown */}
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg shadow-slate-200/50 dark:shadow-slate-950/50 border border-slate-100 dark:border-slate-700 p-5 lg:p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-purple-100 dark:bg-purple-500/20 rounded-xl">
                                <PieChartIcon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                            </div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Por Categoría</h2>
                        </div>
                        <ErrorBoundary fallbackMessage="Error al cargar la distribución por categoría.">
                            <ExpensePieChart data={expenseCategoryData} />
                        </ErrorBoundary>
                        <div className="mt-4 space-y-2">
                            {expenseCategoryData.map((item) => (
                                <div key={item.name} className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                                        <span className="text-sm text-slate-600 dark:text-slate-400">{item.name}</span>
                                    </div>
                                    <span className="text-sm font-medium text-slate-900 dark:text-white">
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
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg shadow-slate-200/50 dark:shadow-slate-950/50 border border-slate-100 dark:border-slate-700 p-5 lg:p-6">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-emerald-100 dark:bg-emerald-500/20 rounded-xl">
                                    <Calendar className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">Uso de Amenidades</h2>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">Reservas este mes</p>
                                </div>
                            </div>
                            <Link href="/amenities" className="text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 flex items-center gap-1">
                                Gestionar <ArrowUpRight className="h-4 w-4" />
                            </Link>
                        </div>
                        <ErrorBoundary fallbackMessage="Error al cargar el uso de amenidades.">
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
                        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg shadow-slate-200/50 dark:shadow-slate-950/50 border border-slate-100 dark:border-slate-700 overflow-hidden">
                            <div className="p-5 lg:p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-indigo-100 dark:bg-indigo-500/20 rounded-xl">
                                        <Bell className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                                    </div>
                                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">Avisos Recientes</h2>
                                </div>
                                <Link href="/feed" className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1">
                                    Ver todos <ArrowUpRight className="h-4 w-4" />
                                </Link>
                            </div>
                            {isLoading ? (
                                <div className="p-6">
                                    <SkeletonList count={3} />
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-100 dark:divide-slate-700">
                                    {recentAnnouncements.map((ann, idx) => (
                                        <motion.div
                                            key={ann.id}
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: 0.4 + idx * 0.1 }}
                                            className="p-4 lg:p-5 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                                        >
                                            <div className="flex items-start gap-4">
                                                <div className={`p-2 rounded-xl flex-shrink-0 ${ann.priority === 'alert'
                                                    ? 'bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400'
                                                    : ann.priority === 'event'
                                                        ? 'bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400'
                                                        : 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400'
                                                    }`}>
                                                    <Bell className="h-4 w-4" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <h3 className="font-semibold text-slate-900 dark:text-white truncate">{ann.title}</h3>
                                                    <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">{ann.content}</p>
                                                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">{ann.author} • {new Date(ann.createdAt).toLocaleDateString('es-CL')}</p>
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
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg shadow-slate-200/50 dark:shadow-slate-950/50 border border-slate-100 dark:border-slate-700 p-5 lg:p-6">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-emerald-100 dark:bg-emerald-500/20 rounded-xl">
                                <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                            </div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Acceso Rápido</h2>
                        </div>
                        <div className="space-y-3">
                            {user.role === 'concierge' ? (
                                <>
                                    <Link
                                        href="/concierge/visitors"
                                        className="group flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-500/10 dark:to-orange-500/10 border border-amber-100 dark:border-amber-500/20 hover:border-amber-200 dark:hover:border-amber-500/30 transition-all"
                                    >
                                        <div className="flex items-center gap-3">
                                            <Users className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                                            <span className="font-medium text-slate-900 dark:text-white">Registrar Visita</span>
                                        </div>
                                        <ChevronRight className="h-5 w-5 text-amber-400 group-hover:translate-x-1 transition-transform" />
                                    </Link>
                                    <Link
                                        href="/concierge/packages"
                                        className="group flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-500/10 dark:to-teal-500/10 border border-emerald-100 dark:border-emerald-500/20 hover:border-emerald-200 dark:hover:border-emerald-500/30 transition-all"
                                    >
                                        <div className="flex items-center gap-3">
                                            <ShoppingBag className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                                            <span className="font-medium text-slate-900 dark:text-white">Recibir Paquete</span>
                                        </div>
                                        <ChevronRight className="h-5 w-5 text-emerald-400 group-hover:translate-x-1 transition-transform" />
                                    </Link>
                                    <Link
                                        href="/services"
                                        className="group flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-red-50 to-rose-50 dark:from-red-500/10 dark:to-rose-500/10 border border-red-100 dark:border-red-500/20 hover:border-red-200 dark:hover:border-red-500/30 transition-all"
                                    >
                                        <div className="flex items-center gap-3">
                                            <Bell className="h-5 w-5 text-red-600 dark:text-red-400" />
                                            <span className="font-medium text-slate-900 dark:text-white">Activar Emergencia</span>
                                        </div>
                                        <ChevronRight className="h-5 w-5 text-red-400 group-hover:translate-x-1 transition-transform" />
                                    </Link>
                                </>
                            ) : (
                                <>
                                    <Link
                                        href="/amenities"
                                        className="group flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-500/10 dark:to-pink-500/10 border border-purple-100 dark:border-purple-500/20 hover:border-purple-200 dark:hover:border-purple-500/30 transition-all"
                                    >
                                        <div className="flex items-center gap-3">
                                            <Calendar className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                                            <span className="font-medium text-slate-900 dark:text-white">Reservar Espacio</span>
                                        </div>
                                        <ChevronRight className="h-5 w-5 text-purple-400 group-hover:translate-x-1 transition-transform" />
                                    </Link>
                                    <Link
                                        href="/marketplace"
                                        className="group flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-500/10 dark:to-teal-500/10 border border-emerald-100 dark:border-emerald-500/20 hover:border-emerald-200 dark:hover:border-emerald-500/30 transition-all"
                                    >
                                        <div className="flex items-center gap-3">
                                            <ShoppingBag className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                                            <span className="font-medium text-slate-900 dark:text-white">Publicar Artículo</span>
                                        </div>
                                        <ChevronRight className="h-5 w-5 text-emerald-400 group-hover:translate-x-1 transition-transform" />
                                    </Link>
                                    <Link
                                        href="/services"
                                        className="group flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-500/10 dark:to-orange-500/10 border border-amber-100 dark:border-amber-500/20 hover:border-amber-200 dark:hover:border-amber-500/30 transition-all"
                                    >
                                        <div className="flex items-center gap-3">
                                            <Wrench className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                                            <span className="font-medium text-slate-900 dark:text-white">Solicitar Servicio</span>
                                        </div>
                                        <ChevronRight className="h-5 w-5 text-amber-400 group-hover:translate-x-1 transition-transform" />
                                    </Link>
                                    <Link
                                        href="/resident/finances"
                                        className="group flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-rose-50 to-pink-50 dark:from-rose-500/10 dark:to-pink-500/10 border border-rose-100 dark:border-rose-500/20 hover:border-rose-200 dark:hover:border-rose-500/30 transition-all"
                                    >
                                        <div className="flex items-center gap-3">
                                            <DollarSign className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                                            <span className="font-medium text-slate-900 dark:text-white">Pagar Gastos</span>
                                        </div>
                                        <ChevronRight className="h-5 w-5 text-rose-400 group-hover:translate-x-1 transition-transform" />
                                    </Link>
                                </>
                            )}
                        </div>
                    </div>
                </motion.div>
            </div>
            <WhatsNew />
        </div>
    );
}
