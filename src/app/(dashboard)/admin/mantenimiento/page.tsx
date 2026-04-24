"use client";

import { useState } from "react";
import { AssetInventory } from "@/components/admin/AssetInventory";
import { MaintenanceDashboard } from "@/components/admin/MaintenanceDashboard";
import {
    Wrench, ClipboardList, Activity,
    Plus, Download, Filter, Search,
    BarChart3, ShieldCheck, HeartPulse, DollarSign
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

export default function MantenimientoAdminPage() {
    const [activeTab, setActiveTab] = useState<'overview' | 'assets' | 'iot'>('overview');

    return (
        <div className="max-w-7xl mx-auto py-10 px-4 md:px-8 space-y-12">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
                <div className="space-y-2">
                    <h2 className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-[0.3em]">Operaciones Técnicas</h2>
                    <h1 className="text-4xl font-black text-slate-900 dark:text-white">Mantenimiento Preventivo</h1>
                </div>

                <div className="flex items-center gap-4">
                    <button className="flex items-center gap-3 px-8 py-4 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-black rounded-2xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 transition-all shadow-xl active:scale-95">
                        <Download className="h-5 w-5 text-blue-600" />
                        Exportar Reporte
                    </button>
                    <button className="flex items-center gap-3 px-8 py-4 bg-slate-900 dark:bg-slate-800 text-white font-black rounded-2xl hover:bg-slate-800 transition-all shadow-xl active:scale-95">
                        <Plus className="h-5 w-5" />
                        Nueva Tarea
                    </button>
                </div>
            </div>

            {/* Administrative Management KPIs (Differentiated View) */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-xl shadow-slate-200/20 dark:shadow-none relative overflow-hidden group">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl text-emerald-600">
                            <HeartPulse className="h-6 w-6" />
                        </div>
                        <h3 className="font-black text-slate-900 dark:text-white uppercase text-[10px] tracking-widest leading-tight">Salud Global Infraestructura</h3>
                    </div>
                    <div className="flex items-end gap-3">
                        <p className="text-4xl font-black text-slate-900 dark:text-white">94%</p>
                        <span className="text-xs font-bold text-emerald-500 mb-1.5 uppercase tracking-widest">Óptimo</span>
                    </div>
                    <div className="mt-4 h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: '94%' }}
                            className="h-full bg-emerald-500"
                        />
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-xl shadow-slate-200/20 dark:shadow-none">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-2xl text-blue-600">
                            <BarChart3 className="h-6 w-6" />
                        </div>
                        <h3 className="font-black text-slate-900 dark:text-white uppercase text-[10px] tracking-widest leading-tight">Mantenimientos al Día</h3>
                    </div>
                    <p className="text-4xl font-black text-slate-900 dark:text-white">12/15</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">80% cumplimiento mensual</p>
                </div>

                <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-xl shadow-slate-200/20 dark:shadow-none">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="p-3 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl text-indigo-600">
                            <DollarSign className="h-6 w-6" />
                        </div>
                        <h3 className="font-black text-slate-900 dark:text-white uppercase text-[10px] tracking-widest leading-tight">Gasto Operativo Mes</h3>
                    </div>
                    <p className="text-4xl font-black text-slate-900 dark:text-white">$840.5k</p>
                    <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mt-2">+12% vs promedios históricos</p>
                </div>

                <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden group border border-white/10">
                    <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:rotate-12 transition-transform duration-500">
                        <ShieldCheck className="h-20 w-20 text-white" />
                    </div>
                    <div className="relative z-10 space-y-4">
                        <div>
                            <h3 className="font-black text-white text-sm">Seguros & Certificaciones</h3>
                            <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">Al día</p>
                        </div>
                        <div className="pt-2">
                            <button className="text-[10px] font-black text-white uppercase tracking-widest border-b border-white/20 hover:border-white transition-all pb-1">Ver certificados</button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tabs System */}
            <div className="flex items-center gap-8 border-b border-slate-100 dark:border-slate-800 px-4">
                <button
                    onClick={() => setActiveTab('overview')}
                    className={`pb-6 text-sm font-black uppercase tracking-widest transition-all relative ${activeTab === 'overview' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
                        }`}
                >
                    Vista General
                    {activeTab === 'overview' && (
                        <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600 rounded-full" />
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('assets')}
                    className={`pb-6 text-sm font-black uppercase tracking-widest transition-all relative ${activeTab === 'assets' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
                        }`}
                >
                    Inventario de Activos
                    {activeTab === 'assets' && (
                        <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600 rounded-full" />
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('iot')}
                    className={`pb-6 text-sm font-black uppercase tracking-widest transition-all relative ${activeTab === 'iot' ? 'text-indigo-600' : 'text-slate-400 hover:text-indigo-600'
                        }`}
                >
                    Sensores IoT
                    {activeTab === 'iot' && (
                        <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-600 rounded-full" />
                    )}
                </button>
            </div>

            {/* Content Rendering */}
            <div className="min-h-[600px]">
                <ErrorBoundary name="Maintenance Tab Error">
                <AnimatePresence mode="wait">
                    {activeTab === 'overview' ? (
                        <motion.div
                            key="overview"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                        >
                            <MaintenanceDashboard />
                        </motion.div>
                    ) : activeTab === 'assets' ? (
                        <motion.div
                            key="assets"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                        >
                            <div className="space-y-8">
                                <div className="flex items-center justify-between px-2">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-2xl">
                                            <Activity className="h-6 w-6 text-slate-900 dark:text-white" />
                                        </div>
                                        <h2 className="text-2xl font-black text-slate-900 dark:text-white">Equipamiento Crítico</h2>
                                    </div>
                                    <div className="flex items-center gap-4 h-12">
                                        <div className="relative">
                                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                            <input
                                                className="h-full pl-12 pr-6 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                                placeholder="Buscar activo..."
                                            />
                                        </div>
                                        <button className="h-full px-6 bg-slate-100 dark:bg-slate-800 rounded-2xl text-slate-500 hover:bg-slate-200 transition-colors">
                                            <Filter className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                                <AssetInventory />
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="iot"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                        >
                            <div className="space-y-8">
                                <div className="flex items-center justify-between px-2">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-indigo-100 dark:bg-indigo-500/20 rounded-2xl">
                                            <Activity className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                                        </div>
                                        <h2 className="text-2xl font-black text-slate-900 dark:text-white">Hub IoT & Nodos Activos</h2>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {/* Shelly Mock */}
                                    <div className="p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm relative overflow-hidden">
                                        <div className="flex justify-between items-start mb-6">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Sensor de Agua</span>
                                                </div>
                                                <h3 className="font-bold text-slate-900 dark:text-white">SN-AGUA-402</h3>
                                            </div>
                                            <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-full text-xs font-bold text-slate-600 dark:text-slate-300">
                                                Depto 402
                                            </span>
                                        </div>
                                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 font-medium">Batería: 98% • Señal: Excelente</p>
                                        <button 
                                            onClick={async () => {
                                                alert('Enviando payload al webhook...');
                                                try {
                                                    const res = await fetch('/api/webhooks/iot', {
                                                        method: 'POST',
                                                        headers: {
                                                            'Content-Type': 'application/json',
                                                            'Authorization': 'Bearer dev-iot-secret-123'
                                                        },
                                                        body: JSON.stringify({
                                                            sensor_id: 'SN-AGUA-402',
                                                            type: 'FILTRACION_CRITICA',
                                                            unit_id: '402',
                                                            community_id: '1',
                                                            severity: 'URGENTE',
                                                            location_detail: 'Cocina - Lavaplatos'
                                                        })
                                                    });
                                                    const data = await res.json();
                                                    console.log(data);
                                                    alert('Evento procesado por IA. Revisa la consola o panel de mantención.');
                                                } catch(e) { console.error(e); }
                                            }}
                                            className="w-full py-3 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20 dark:text-red-400 rounded-xl font-bold transition-all text-sm flex justify-center items-center gap-2"
                                        >
                                            <HeartPulse className="h-4 w-4" />
                                            Test: Simular Filtración
                                        </button>
                                    </div>
                                    
                                    {/* Smart Lock Mock */}
                                    <div className="p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm relative overflow-hidden">
                                        <div className="flex justify-between items-start mb-6">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <div className="h-2 w-2 rounded-full bg-emerald-500" />
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Cerradura Inteligente</span>
                                                </div>
                                                <h3 className="font-bold text-slate-900 dark:text-white">LK-MAIN-402</h3>
                                            </div>
                                            <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-full text-xs font-bold text-slate-600 dark:text-slate-300">
                                                Depto 402
                                            </span>
                                        </div>
                                        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Estado: Cerrado (Seguro)</p>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
                </ErrorBoundary>
            </div>
        </div>
    );
}
