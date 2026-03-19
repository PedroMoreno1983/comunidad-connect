"use client";

import { motion } from "framer-motion";
import {
    TrendingUp, TrendingDown, DollarSign, Wallet,
    PieChart, Activity, ArrowUpRight, ArrowDownRight,
    Users, AlertCircle, CheckCircle2, Calendar
} from "lucide-react";
import { CommunityFinance } from "@/lib/types";

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
        hidden: { y: 20, opacity: 0 },
        show: { y: 0, opacity: 1 }
    };

    return (
        <div className="space-y-10">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-2">
                    <h2 className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-[0.3em]">Gestión Profesional</h2>
                    <h1 className="text-4xl font-black text-slate-900 dark:text-white">Estado Financiero</h1>
                </div>
                <div className="flex items-center gap-3 bg-white dark:bg-slate-800 p-2 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm">
                    <div className="px-4 py-2 bg-blue-50 dark:bg-blue-500/10 rounded-xl">
                        <span className="text-sm font-bold text-blue-600 dark:text-blue-400">Febrero 2026</span>
                    </div>
                    <button className="p-2 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl transition-colors">
                        <Calendar className="h-5 w-5 text-slate-400" />
                    </button>
                </div>
            </div>

            {/* Stats Grid */}
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
                        className="group bg-white/60 dark:bg-slate-800/40 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/50 dark:border-slate-700/50 shadow-xl shadow-slate-200/20 dark:shadow-black/40 hover:shadow-2xl hover:border-white/80 dark:hover:border-slate-600 hover:-translate-y-1 transition-all duration-300"
                    >
                        <div className="flex justify-between items-start mb-6">
                            <div className={`p-4 rounded-2xl bg-${stat.color}-50 dark:bg-${stat.color}-500/10 text-${stat.color}-600 dark:text-${stat.color}-400 group-hover:scale-110 transition-transform`}>
                                <stat.icon className="h-6 w-6" />
                            </div>
                            <div className={`flex items-center gap-1 font-black text-xs ${stat.trend === 'up' ? 'text-emerald-500' : 'text-rose-500'}`}>
                                {stat.trend === 'up' ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                                {stat.change}
                            </div>
                        </div>
                        <p className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">{stat.label}</p>
                        <h3 className="text-3xl font-black text-slate-900 dark:text-white mb-4">{stat.value}</h3>
                        <p className="text-[10px] leading-relaxed text-slate-400 dark:text-slate-500 font-medium italic">
                            {stat.description}
                        </p>
                    </motion.div>
                ))}
            </motion.div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Recent Activity */}
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="lg:col-span-2 bg-white/60 dark:bg-slate-800/40 backdrop-blur-xl rounded-[3rem] border border-white/50 dark:border-slate-700/50 overflow-hidden shadow-xl shadow-slate-200/20 dark:shadow-black/40"
                >
                    <div className="p-10 border-b border-slate-50 dark:border-slate-800 flex justify-between items-center">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-2xl">
                                <Activity className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                            </div>
                            <h3 className="text-xl font-black text-slate-900 dark:text-white">Movimientos Recientes</h3>
                        </div>
                        <button className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline">Ver reporte completo</button>
                    </div>
                    <div className="divide-y divide-slate-50 dark:divide-slate-800">
                        {data.recentActivity.map((activity) => (
                            <div key={activity.id} className="p-10 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                                <div className="flex items-center gap-5">
                                    <div className={`h-12 w-12 rounded-2xl flex items-center justify-center ${activity.type === 'income'
                                        ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600'
                                        : 'bg-rose-100 dark:bg-rose-500/20 text-rose-600'
                                        }`}>
                                        {activity.type === 'income' ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                                    </div>
                                    <div>
                                        <p className="font-black text-slate-900 dark:text-white">{activity.title}</p>
                                        <p className="text-xs font-bold text-slate-400">{new Date(activity.date).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className={`text-lg font-black ${activity.type === 'income' ? 'text-emerald-500' : 'text-slate-900 dark:text-white'}`}>
                                        {activity.type === 'income' ? '+' : '-'}${(activity.amount || 0).toLocaleString('es-CL')}
                                    </p>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Liquidado</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>

                {/* Morosidad & Summary Cards */}
                <div className="space-y-8">
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="bg-slate-900/80 dark:bg-slate-950/80 backdrop-blur-xl p-10 rounded-[3rem] border border-slate-800 relative overflow-hidden shadow-2xl shadow-blue-500/10"
                    >
                        <div className="absolute top-0 right-0 p-6 opacity-20 transform translate-x-4 -translate-y-4">
                            <AlertCircle className="h-24 w-24 text-blue-500" />
                        </div>
                        <div className="relative z-10">
                            <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-[0.3em] mb-4">Estado de Cobro</h4>
                            <div className="space-y-6">
                                <div>
                                    <p className="text-4xl font-black text-white">{data.collectionRate}%</p>
                                    <p className="text-sm font-bold text-slate-500">Recaudación Lograda</p>
                                </div>
                                <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${data.collectionRate}%` }}
                                        transition={{ duration: 1.5, ease: "easeOut" }}
                                        className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 shadow-[0_0_20px_rgba(59,130,246,0.5)]"
                                    />
                                </div>
                                <div className="flex justify-between items-center text-xs font-bold">
                                    <span className="text-slate-400">Objetivo: 95%</span>
                                    <span className="text-emerald-500 flex items-center gap-1">
                                        <CheckCircle2 className="h-3 w-3" />
                                        Meta alcanzada
                                    </span>
                                </div>
                            </div>
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 }}
                        className="bg-white/60 dark:bg-slate-800/40 backdrop-blur-xl p-10 rounded-[3rem] border border-white/50 dark:border-slate-700/50 shadow-xl shadow-slate-200/20 dark:shadow-black/40"
                    >
                        <div className="flex items-center gap-4 mb-6">
                            <div className="p-3 bg-amber-50 dark:bg-amber-500/10 rounded-2xl">
                                <Users className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                            </div>
                            <h3 className="text-lg font-black text-slate-900 dark:text-white">Gestión Unidades</h3>
                        </div>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl">
                                <span className="text-sm font-bold text-slate-500">Unidades Totales</span>
                                <span className="font-black text-slate-900 dark:text-white">124</span>
                            </div>
                            <div className="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl">
                                <span className="text-sm font-bold text-slate-500">En Mora (+3 meses)</span>
                                <span className="font-black text-rose-500">4</span>
                            </div>
                            <div className="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl">
                                <span className="text-sm font-bold text-slate-500">Pagos Pendientes</span>
                                <span className="font-black text-amber-500">12</span>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>
        </div>
    );
}
