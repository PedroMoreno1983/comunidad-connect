"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Activity, Shield, Settings, AlertTriangle,
    CheckCircle2, Clock, MapPin, Wrench,
    ChevronRight, MoreHorizontal, FlaskConical,
    Zap, Droplets, ArrowUpRight, FileText,
    History, DollarSign, User
} from "lucide-react";
import { BuildingAsset, MaintenanceLog } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/Dialog";

export function AssetInventory() {
    const [assets, setAssets] = useState<BuildingAsset[]>([]);
    const [selectedAsset, setSelectedAsset] = useState<BuildingAsset | null>(null);
    const [assetLogs, setAssetLogs] = useState<MaintenanceLog[]>([]);
    const [isLogOpen, setIsLogOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchAssets = async () => {
            try {
                const { data, error } = await supabase.from('building_assets').select('*');
                if (data && !error) {
                    const mappedAssets = data.map((dbAsset: Record<string, any>) => ({
                        id: dbAsset.id,
                        name: dbAsset.name,
                        category: dbAsset.category,
                        brand: dbAsset.brand,
                        model: dbAsset.model,
                        installationDate: dbAsset.installation_date || dbAsset.installationDate,
                        location: dbAsset.location,
                        healthStatus: dbAsset.health_status || dbAsset.healthStatus,
                        lastMaintenance: dbAsset.last_maintenance || dbAsset.lastMaintenance,
                        nextMaintenance: dbAsset.next_maintenance || dbAsset.nextMaintenance,
                    }));
                    setAssets(mappedAssets as BuildingAsset[]);
                }
            } catch (err) {
                console.error("Error fetching assets:", err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchAssets();
    }, []);

    const handleOpenLog = async (asset: BuildingAsset) => {
        setSelectedAsset(asset);
        setIsLogOpen(true);
        try {
            const { data, error } = await supabase.from('maintenance_logs').select('*').eq('asset_id', asset.id);
            if (data && !error) {
                const mappedLogs = data.map((log: Record<string, any>) => ({
                    id: log.id,
                    assetId: log.asset_id || log.assetId,
                    performedBy: log.performed_by || log.performedBy,
                    description: log.description,
                    cost: log.cost,
                    date: log.date
                }));
                setAssetLogs(mappedLogs as MaintenanceLog[]);
            } else {
                setAssetLogs([]);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const getStatusColor = (status: BuildingAsset['healthStatus']) => {
        switch (status) {
            case 'optimal': return 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.4)]';
            case 'warning': return 'bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.4)]';
            case 'critical': return 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.4)]';
            default: return 'bg-slate-500';
        }
    };

    const getCategoryIcon = (category: BuildingAsset['category']) => {
        switch (category) {
            case 'elevator': return <ArrowUpRight className="h-6 w-6" />;
            case 'pump': return <Droplets className="h-6 w-6" />;
            case 'generator': return <Zap className="h-6 w-6" />;
            default: return <Settings className="h-6 w-6" />;
        }
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {isLoading && <div className="col-span-full p-4 text-center">Cargando activos...</div>}
            {!isLoading && assets.length === 0 && <div className="col-span-full p-4 text-center text-slate-500">No hay activos registrados.</div>}
            {assets.map((asset, i) => (
                <motion.div
                    key={asset.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    whileHover={{ y: -5 }}
                    className="bg-surface rounded-[3rem] border border-subtle shadow-xl shadow-slate-200/20 dark:shadow-none overflow-hidden group"
                >
                    <div className="p-8 space-y-8">
                        {/* Header */}
                        <div className="flex justify-between items-start">
                            <div className={`p-4 rounded-2xl ${asset.healthStatus === 'optimal' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' :
                                asset.healthStatus === 'warning' ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' :
                                    'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400'
                                }`}>
                                {getCategoryIcon(asset.category)}
                            </div>
                            <div className="flex items-center gap-2 px-4 py-2 bg-elevated rounded-full border border-subtle">
                                <div className={`h-2.5 w-2.5 rounded-full ${getStatusColor(asset.healthStatus)}`} />
                                <span className="text-[10px] font-black uppercase tracking-widest cc-text-secondary">
                                    {asset.healthStatus === 'optimal' ? 'Operativo' :
                                        asset.healthStatus === 'warning' ? 'Atención' : 'Crítico'}
                                </span>
                            </div>
                        </div>

                        {/* Title & Stats */}
                        <div className="space-y-2">
                            <h3 className="text-xl font-black cc-text-primary leading-tight group-hover:text-blue-600 transition-colors">
                                {asset.name}
                            </h3>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                <MapPin className="h-3 w-3" />
                                {asset.location}
                            </p>
                        </div>

                        {/* Specs Table */}
                        <div className="grid grid-cols-2 gap-4 py-6 border-y border-slate-50 dark:border-slate-800">
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Marca / Modelo</p>
                                <p className="text-sm font-bold cc-text-secondary">{asset.brand} {asset.model}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Instalación</p>
                                <p className="text-sm font-bold cc-text-secondary">{new Date(asset.installationDate).getFullYear()}</p>
                            </div>
                        </div>

                        {/* Maintenance Info */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between text-xs font-bold">
                                <span className="text-slate-400 uppercase tracking-widest">Próxima Revisión</span>
                                <span className={`flex items-center gap-2 ${asset.healthStatus === 'critical' ? 'text-red-600' : 'cc-text-primary'
                                    }`}>
                                    <Clock className="h-3 w-3" />
                                    {new Date(asset.nextMaintenance).toLocaleDateString()}
                                </span>
                            </div>
                            <div className="h-1.5 w-full bg-elevated rounded-full overflow-hidden">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: asset.healthStatus === 'optimal' ? '85%' : asset.healthStatus === 'warning' ? '45%' : '15%' }}
                                    className={`h-full rounded-full ${asset.healthStatus === 'optimal' ? 'bg-emerald-500' :
                                        asset.healthStatus === 'warning' ? 'bg-amber-500' : 'bg-red-500'
                                        }`}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Footer Action */}
                    <button
                        onClick={() => handleOpenLog(asset)}
                        className="w-full py-6 bg-elevated/50 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-blue-600 hover:bg-elevated transition-all flex items-center justify-center gap-2 border-t border-slate-50 dark:border-slate-800"
                    >
                        Ver Bitácora Técnica
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </motion.div>
            ))}

            {/* Technical Log Dialog */}
            <Dialog open={isLogOpen} onOpenChange={setIsLogOpen}>
                <DialogContent className="sm:max-w-[600px] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-white/20 dark:border-slate-800 rounded-[2.5rem] p-0 shadow-2xl overflow-hidden">
                    <div className="bg-slate-900 p-10 text-white relative">
                        <div className="absolute top-0 right-0 p-8 opacity-10">
                            <History className="h-24 w-24 text-blue-400" />
                        </div>
                        <DialogHeader className="relative z-10">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-blue-500/20 rounded-lg">
                                    <FileText className="h-5 w-5 text-blue-400" />
                                </div>
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400">Bitácora Técnica</span>
                            </div>
                            <DialogTitle className="text-3xl font-black">{selectedAsset?.name}</DialogTitle>
                            <DialogDescription className="text-slate-400 font-medium">
                                Historial completo de intervenciones y mantenimiento preventivo.
                            </DialogDescription>
                        </DialogHeader>
                    </div>

                    <div className="p-10 space-y-8 max-h-[500px] overflow-y-auto custom-scrollbar">
                        {assetLogs.length > 0 ? (
                            <div className="space-y-8">
                                {assetLogs.map((log, i) => (
                                    <div key={log.id} className="relative pl-8">
                                        {i !== assetLogs.length - 1 && (
                                            <div className="absolute left-0 top-6 bottom-[-32px] w-[2px] bg-elevated" />
                                        )}
                                        <div className="absolute left-[-4px] top-1.5 h-2.5 w-2.5 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]" />

                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                                    {new Date(log.date).toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })}
                                                </span>
                                                <span className="px-3 py-1 bg-success-bg text-success-fg rounded-lg text-[10px] font-black tracking-wider uppercase">
                                                    Realizado
                                                </span>
                                            </div>

                                            <div className="bg-elevated/50 p-6 rounded-2xl space-y-3">
                                                <p className="text-sm font-bold cc-text-primary leading-relaxed">
                                                    {log.description}
                                                </p>
                                                <div className="flex flex-wrap gap-4 pt-2">
                                                    <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                                        <User className="h-3 w-3" />
                                                        {log.performedBy}
                                                    </div>
                                                    <div className="flex items-center gap-2 text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">
                                                        <DollarSign className="h-3 w-3" />
                                                        ${(log.cost || 0).toLocaleString('es-CL')}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-10 space-y-4">
                                <div className="mx-auto w-16 h-16 bg-elevated rounded-2xl flex items-center justify-center text-slate-300">
                                    <Activity className="h-8 w-8" />
                                </div>
                                <p className="text-slate-500 font-bold italic">No hay registros previos para este activo.</p>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
