"use client";

import { motion, Variants } from "framer-motion";
import {
    TrendingUp, TrendingDown, DollarSign, Wallet,
    PieChart, Activity, ArrowUpRight, ArrowDownRight,
    Users, AlertCircle, CheckCircle2, Calendar,
    BarChart3
} from "lucide-react";
import { CommunityFinance } from "@/lib/types";
import { ExpenseAreaChart, ExpensePieChart } from "@/components/charts/Charts";

interface FinanceDashboardProps {
    data: CommunityFinance;
}

export function FinanceDashboard({ data }: FinanceDashboardProps) {
    const stats = [
        {
            label: "Recaudación Mensual",
            value: `$${(data.totalRevenue || 0).toLocaleString('es-CL')}`,
            change: "+12.5%",
            trend: "up",
            icon: DollarSign,
            color: "blue",
            description: "Ingresos por gastos comunes y reservas"
        },
        {
            label: "Egresos Totales",
            value: `$${(data.totalExpenses || 0).toLocaleString('es-CL')}`,
            change: "-4.2%",
            trend: "down",
            icon: TrendingDown,
            color: "rose",
            description: "Pagos a proveedores y salarios"
        },
        {
            label: "Fondo de Reserva",
            value: `$${(data.reserveFund || 0).toLocaleString('es-CL')}`,
            change: "+2.1%",
            trend: "up",
            icon: Wallet,
            color: "emerald",
            description: "Capital para emergencias y mejoras"
        },
        {
            label: "Tasa de Cobranza",
            value: `${data.collectionRate}%`,
            change: "+0.8%",
            trend: "up",
            icon: Activity,
            color: "amber",
            description: "Porcentaje de vecinos al día"
        }
    ];

    const expenseChartData = [
        { month: 'Sep', monto: 12500000 },
        { month: 'Oct', monto: 11200000 },
        { month: 'Nov', monto: 13800000 },
        { month: 'Dic', monto: 15900000 },
        { month: 'Ene', monto: 12100000 },
        { month: 'Feb', monto: 14500000 },
    ];

    const expenseCategoryData = [
        { name: 'Mantención', value: 4500000, color: '#6366f1' },
        { name: 'Sueldos', value: 6500000, color: '#10b981' },
        { name: 'Seguridad', value: 2500000, color: '#f59e0b' },
        { name: 'Servicios', value: 1000000, color: '#ef4444' },
    ];

    const container: Variants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1
            }
        }
    };

    const item: Variants = {
        hidden: { y: 30, opacity: 0, scale: 0.95 },
        show: { y: 0, opacity: 1, scale: 1, transition: { type: "spring", stiffness: 100 } }
    };

    return (
        <div className="space-y-10">
            {/* Header Animado */}
            <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col md:flex-row md:items-end justify-between gap-6"
            >
                <div className="space-y-2">
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full text-xs font-black uppercase tracking-widest mb-1">
                        <Activity className="h-3 w-3" /> Dashboard Analytics
                    </div>
                    <h1 className="text-4xl lg:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-400">
                        Inteligencia Financiera
                    </h1>
                </div>
                <div className="flex items-center gap-3 bg-white/60 dark:bg-slate-800/60 backdrop-blur-md p-2 rounded-2xl border border-white dark:border-slate-700 shadow-lg">
                    <div className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl shadow-md">
                        <span className="text-sm font-bold text-white">Marzo 2026</span>
                    </div>
                    <button className="p-3 hover:bg-elevated rounded-xl transition-all hover:scale-105 active:scale-95">
                        <Calendar className="h-5 w-5 cc-text-secondary" />
                    </button>
                </div>
            </motion.div>

            {/* Stats Grid con Glassmorphism Fuerte */}
            <motion.div
                variants={container}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
            >
                {stats.map((stat, idx) => (
                    <motion.div
                        key={idx}
                        variants={item}
                        className="group relative overflow-hidden bg-white/70 dark:bg-slate-800/50 backdrop-blur-2xl p-8 rounded-[2rem] border border-white/80 dark:border-slate-700/50 shadow-xl hover:shadow-2xl hover:-translate-y-2 transition-all duration-500"
                    >
                        <div className={`absolute top-0 right-0 w-32 h-32 bg-${stat.color}-500/10 dark:bg-${stat.color}-400/10 rounded-full blur-3xl -translate-y-10 translate-x-10 group-hover:scale-150 transition-transform duration-700`} />
                        
                        <div className="relative z-10">
                            <div className="flex justify-between items-start mb-6">
                                <div className={`p-4 rounded-2xl bg-${stat.color}-50 dark:bg-${stat.color}-500/20 text-${stat.color}-600 dark:text-${stat.color}-400 shadow-inner`}>
                                    <stat.icon className="h-6 w-6" />
                                </div>
                                <div className={`flex items-center gap-1 font-black text-sm px-3 py-1 rounded-full ${stat.trend === 'up' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400' : 'bg-rose-50 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400'}`}>
                                    {stat.trend === 'up' ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                                    {stat.change}
                                </div>
                            </div>
                            <p className="text-sm font-bold cc-text-secondary uppercase tracking-widest mb-2">{stat.label}</p>
                            <h3 className="text-3xl font-black cc-text-primary mb-3 tracking-tight">{stat.value}</h3>
                            <p className="text-xs font-semibold cc-text-tertiary">
                                {stat.description}
                            </p>
                        </div>
                    </motion.div>
                ))}
            </motion.div>

            {/* Sección Gráficos Interactivos Recharts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* BIG CHART AREA */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, type: "spring", stiffness: 80 }}
                    className="lg:col-span-2 bg-white/70 dark:bg-slate-800/50 backdrop-blur-2xl p-8 rounded-[2.5rem] border border-white/80 dark:border-slate-700/50 shadow-2xl shadow-indigo-500/5 dark:shadow-black/40 relative overflow-hidden group"
                >
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/50 to-purple-50/50 dark:from-indigo-900/10 dark:to-purple-900/10 opacity-50 z-0"></div>
                    <div className="relative z-10">
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-4">
                                <div className="p-4 bg-brand-600 shadow-lg shadow-indigo-600/30 rounded-2xl transform group-hover:rotate-6 transition-transform">
                                    <BarChart3 className="h-6 w-6 text-white" />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-black cc-text-primary">Evolución de Egresos</h3>
                                    <p className="text-sm font-bold text-slate-500">Histórico de 6 meses operativos</p>
                                </div>
                            </div>
                            <button className="hidden sm:flex text-sm font-bold text-role-admin-fg bg-brand-50 dark:bg-indigo-500/20 px-4 py-2 rounded-xl hover:bg-brand-100 transition-colors">
                                Descargar PDF
                            </button>
                        </div>
                        <div className="h-80 w-full mt-4">
                            <ExpenseAreaChart data={expenseChartData} />
                        </div>
                    </div>
                </motion.div>

                {/* PIE CHART AREA */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, type: "spring", stiffness: 80 }}
                    className="bg-white/70 dark:bg-slate-800/50 backdrop-blur-2xl p-8 rounded-[2.5rem] border border-white/80 dark:border-slate-700/50 shadow-2xl shadow-purple-500/5 dark:shadow-black/40 flex flex-col relative overflow-hidden"
                >
                    <div className="relative z-10 flex flex-col h-full">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="p-3 bg-brand-100 dark:bg-purple-500/20 rounded-2xl">
                                <PieChart className="h-6 w-6 text-brand-600 dark:text-brand-400" />
                            </div>
                            <h3 className="text-xl font-black cc-text-primary">Distribución</h3>
                        </div>
                        <div className="flex-1 w-full flex items-center justify-center min-h-[200px]">
                            <ExpensePieChart data={expenseCategoryData} />
                        </div>
                        <div className="mt-6 space-y-3">
                            {expenseCategoryData.map((item) => (
                                <div key={item.name} className="flex items-center justify-between p-3 rounded-2xl bg-surface/50 hover:bg-white dark:hover:bg-slate-700 shadow-sm border border-subtle/50 transition-all cursor-crosshair hover:scale-[1.02]">
                                    <div className="flex items-center gap-3">
                                        <div className="w-4 h-4 rounded-full shadow-md" style={{ backgroundColor: item.color }} />
                                        <span className="font-bold cc-text-secondary">{item.name}</span>
                                    </div>
                                    <span className="font-black cc-text-primary">
                                        ${(item.value / 1000000).toFixed(1)}M
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* Fila Inferior: Movimientos y Alertas */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Recent Activity */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="lg:col-span-2 bg-white/70 dark:bg-slate-800/50 backdrop-blur-2xl rounded-[2.5rem] border border-white/80 dark:border-slate-700/50 overflow-hidden shadow-xl"
                >
                    <div className="p-8 border-b border-subtle/50 flex justify-between items-center bg-white/40 dark:bg-slate-800/40">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-blue-100 dark:bg-blue-500/20 rounded-2xl">
                                <Activity className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                            </div>
                            <h3 className="text-xl font-black cc-text-primary">Movimientos Recientes</h3>
                        </div>
                        <button className="text-sm font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300">Ver todo</button>
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
                        {data.recentActivity.map((activity) => (
                            <div key={activity.id} className="p-6 md:p-8 flex items-center justify-between hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-colors">
                                <div className="flex items-center gap-5">
                                    <div className={`h-14 w-14 rounded-2xl shadow-sm flex items-center justify-center ${activity.type === 'income'
                                        ? 'bg-success-bg text-emerald-500'
                                        : 'bg-rose-50 dark:bg-rose-500/10 text-rose-500'
                                        }`}>
                                        {activity.type === 'income' ? <TrendingUp className="h-6 w-6" /> : <TrendingDown className="h-6 w-6" />}
                                    </div>
                                    <div>
                                        <p className="font-extrabold cc-text-primary text-lg">{activity.title}</p>
                                        <p className="text-sm font-semibold text-slate-500">{new Date(activity.date).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className={`text-xl font-black ${activity.type === 'income' ? 'text-emerald-500' : 'cc-text-primary'}`}>
                                        {activity.type === 'income' ? '+' : '-'}${(activity.amount || 0).toLocaleString('es-CL')}
                                    </p>
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-elevated px-2 py-1 rounded-md mt-1 inline-block">Liquidado</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>

                {/* Panel de Alertas Morosidad */}
                <div className="space-y-6">
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.5 }}
                        className="bg-gradient-to-br from-slate-900 to-slate-800 p-8 rounded-[2.5rem] border border-slate-700 shadow-2xl relative overflow-hidden group"
                    >
                        <div className="absolute top-0 right-0 p-6 opacity-10 transform translate-x-4 -translate-y-4 group-hover:rotate-12 group-hover:scale-110 transition-transform duration-500">
                            <AlertCircle className="h-32 w-32 text-blue-500" />
                        </div>
                        <div className="relative z-10">
                            <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-[10px] font-black uppercase tracking-[0.2em] mb-6">
                                <CheckCircle2 className="h-3 w-3" /> Estado de Cobro Sano
                            </div>
                            <div className="space-y-6">
                                <div>
                                    <p className="text-5xl font-black text-white tracking-tighter">{data.collectionRate}%</p>
                                    <p className="text-sm font-bold text-slate-400 mt-1">Recaudación Lograda</p>
                                </div>
                                <div className="w-full h-4 bg-slate-950/50 rounded-full overflow-hidden shadow-inner p-0.5">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${data.collectionRate}%` }}
                                        transition={{ duration: 2, ease: "easeOut", delay: 0.6 }}
                                        className="h-full bg-gradient-to-r from-blue-500 via-indigo-400 to-emerald-400 rounded-full shadow-[0_0_15px_rgba(59,130,246,0.6)]"
                                    />
                                </div>
                                <div className="flex justify-between items-center text-xs font-bold bg-white/5 p-3 rounded-xl border border-white/10">
                                    <span className="text-slate-400">Objetivo: 95%</span>
                                    <span className="text-emerald-400 flex items-center gap-1">
                                        Meta alcanzada 🚀
                                    </span>
                                </div>
                            </div>
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.6 }}
                        className="bg-amber-50 dark:bg-amber-900/20 p-8 rounded-[2.5rem] border border-amber-200 dark:border-amber-700/50 shadow-lg"
                    >
                        <div className="flex items-center gap-4 mb-6">
                            <div className="p-3 bg-amber-500 text-white rounded-2xl shadow-lg shadow-amber-500/40">
                                <Users className="h-6 w-6" />
                            </div>
                            <h3 className="text-lg font-black text-amber-900 dark:text-amber-500 tracking-tight">Atención Requerida</h3>
                        </div>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center bg-white/60 dark:bg-slate-900/40 p-4 rounded-2xl">
                                <span className="text-sm font-bold cc-text-secondary">Morosos crónicos (+3m)</span>
                                <span className="font-black text-rose-600 dark:text-rose-500 text-lg">4</span>
                            </div>
                            <div className="flex justify-between items-center bg-white/60 dark:bg-slate-900/40 p-4 rounded-2xl">
                                <span className="text-sm font-bold cc-text-secondary">Avisos de corte enviados</span>
                                <span className="font-black text-amber-600 dark:text-amber-500 text-lg">2</span>
                            </div>
                            <button className="w-full mt-2 py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow-md transition-colors">
                                Gestionar Cobranza
                            </button>
                        </div>
                    </motion.div>
                </div>
            </div>
        </div>
    );
}
