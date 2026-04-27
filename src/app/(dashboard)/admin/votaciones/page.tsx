"use client";

import { PollManager } from "@/components/admin/PollManager";
import { motion } from "framer-motion";
import {
    Users, Vote, BarChart3,
    ShieldCheck, Calendar, Activity,
    TrendingUp, Info
} from "lucide-react";

export default function AdminVotacionesPage() {
    return (
        <div className="max-w-7xl mx-auto py-10 px-4 md:px-8 space-y-12">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
                <div className="space-y-2">
                    <h2 className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-[0.3em]">Gestión de Asambleas</h2>
                    <h1 className="text-4xl font-black cc-text-primary">Centro de Mando Electoral</h1>
                </div>

                <div className="flex items-center gap-4">
                    <button className="flex items-center gap-3 px-8 py-4 bg-surface cc-text-primary font-black rounded-2xl border border-subtle hover:bg-slate-50 transition-all shadow-xl active:scale-95">
                        <Calendar className="h-5 w-5 text-blue-600" />
                        Historial Legal
                    </button>
                </div>
            </div>

            {/* Voting Command Center KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="bg-surface p-8 rounded-[2.5rem] border border-subtle shadow-xl shadow-slate-200/20 dark:shadow-none relative overflow-hidden group">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-2xl text-blue-600">
                            <Users className="h-6 w-6" />
                        </div>
                        <h3 className="font-black cc-text-primary uppercase text-[10px] tracking-widest">Quórum Legal Asamblea</h3>
                    </div>
                    <div className="flex items-end gap-3 text-emerald-500">
                        <p className="text-4xl font-black cc-text-primary">65.4%</p>
                        <span className="text-xs font-bold mb-1.5 uppercase tracking-widest flex items-center gap-1">
                            <ShieldCheck className="h-3 w-3" />
                            Alcanzado
                        </span>
                    </div>
                    <div className="mt-4 h-1.5 w-full bg-elevated rounded-full overflow-hidden">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: '65.4%' }}
                            className="h-full bg-emerald-500"
                        />
                    </div>
                </div>

                <div className="bg-surface p-8 rounded-[2.5rem] border border-subtle shadow-xl shadow-slate-200/20 dark:shadow-none">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="p-3 bg-role-admin-bg rounded-2xl text-brand-600">
                            <Activity className="h-6 w-6" />
                        </div>
                        <h3 className="font-black cc-text-primary uppercase text-[10px] tracking-widest">Participación Activa</h3>
                    </div>
                    <p className="text-4xl font-black cc-text-primary">142</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Votantes únicos este mes</p>
                </div>

                <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:rotate-12 transition-transform duration-500 text-blue-500">
                        <TrendingUp className="h-20 w-20" />
                    </div>
                    <div className="relative z-10 space-y-4">
                        <div>
                            <h3 className="font-black text-white text-sm">Validación de Poderes</h3>
                            <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">12 Pendientes</p>
                        </div>
                        <div className="pt-2">
                            <button className="text-[10px] font-black text-white uppercase tracking-widest border-b border-white/20 hover:border-white transition-all pb-1">Gestionar poderes</button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Poll Manager Component */}
            <PollManager />
        </div>
    );
}
