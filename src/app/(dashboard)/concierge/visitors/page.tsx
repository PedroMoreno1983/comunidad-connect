"use client";

import { useEffect, useState } from "react";
import { QRScannerSimulator } from "@/components/admin/QRScannerSimulator";
import { useAuth } from "@/lib/authContext";
import { VisitorLog } from "@/lib/types";
import { VisitorService } from "@/lib/services/supabaseServices";
import { WaterService } from "@/lib/api";
import {
    Users, Plus, ClipboardList, Shield,
    Search, Filter, Download, MoreHorizontal
} from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { motion } from "framer-motion";

// interface VisitorLog moved to @/lib/types.ts

interface Unit {
    id: string;
    number: string;
}

export default function VisitorsPage() {
    const { user } = useAuth();
    const [visitors, setVisitors] = useState<VisitorLog[]>([]);
    const [units, setUnits] = useState<Unit[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [newVisitor, setNewVisitor] = useState({ name: "", unit: "" });
    const { toast } = useToast();

    useEffect(() => {
        const loadData = async () => {
            setIsLoading(true);
            try {
                const logs = await VisitorService.getAll();
                setVisitors(logs.map((v: any) => ({
                    id: v.id,
                    visitorName: v.visitor_name,
                    unitId: (v.units as { number: string } | undefined)?.number || v.unit_id,
                    entryTime: v.entry_time,
                    isQr: v.is_qr || false
                })));

                const uns = await WaterService.getUnits();
                setUnits(uns);
            } catch (error) {
                console.error("Error loading visitors data:", error);
            } finally {
                setIsLoading(false);
            }
        };

        loadData();
    }, []);

    const handleRegisterVisitor = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const data = await VisitorService.register({
                visitor_name: newVisitor.name,
                unit_id: newVisitor.unit,
                registered_by: user?.id || 'admin',
                is_qr: false
            } as any);

            const visitor = {
                id: data.id,
                visitorName: data.visitor_name,
                unitId: data.unit_id,
                entryTime: data.entry_time,
                isQr: false
            };

            setVisitors([visitor, ...visitors]);
            setIsDialogOpen(false);
            setNewVisitor({ name: "", unit: "" });

            toast({
                title: "Registro Manual Exitoso",
                description: `Se ha registrado el ingreso de ${visitor.visitorName}.`,
                variant: "success",
            });
        } catch (error) {
            console.error("Error registering visitor:", error);
            toast({
                title: "Error",
                description: "No se pudo registrar la visita.",
                variant: "destructive"
            });
        }
    };

    return (
        <div className="max-w-7xl mx-auto py-10 px-4 md:px-8 space-y-12">
            {/* Professional Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
                <div className="space-y-2">
                    <h2 className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-[0.3em]">Módulo de Seguridad</h2>
                    <h1 className="text-4xl font-black text-slate-900 dark:text-white">Control de Accesos</h1>
                </div>

                <div className="flex items-center gap-4">
                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogTrigger asChild>
                            <button className="flex items-center gap-3 px-8 py-4 bg-white/60 dark:bg-slate-800/40 backdrop-blur-xl text-slate-900 dark:text-white font-black rounded-2xl border border-white/50 dark:border-slate-700/50 hover:bg-white/80 dark:hover:bg-slate-800/60 transition-all shadow-xl shadow-slate-200/20 dark:shadow-black/20 active:scale-95">
                                <Plus className="h-5 w-5 text-blue-600" />
                                Registro Manual
                            </button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[480px] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-white/20 dark:border-slate-800 rounded-[2.5rem] p-10 shadow-2xl">
                            <DialogHeader>
                                <DialogTitle className="text-2xl font-black">Registro de Visita</DialogTitle>
                                <DialogDescription className="font-medium">
                                    Use esta opción si el invitado no posee un código QR.
                                </DialogDescription>
                            </DialogHeader>
                            <form onSubmit={handleRegisterVisitor} className="space-y-6 pt-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Nombre Completo</label>
                                    <Input
                                        placeholder="Nombre del visitante"
                                        className="h-14 rounded-2xl font-bold"
                                        required
                                        value={newVisitor.name}
                                        onChange={(e) => setNewVisitor({ ...newVisitor, name: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Unidad Destino</label>
                                    <select
                                        className="w-full h-14 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 appearance-none cursor-pointer"
                                        required
                                        value={newVisitor.unit}
                                        onChange={(e) => setNewVisitor({ ...newVisitor, unit: e.target.value })}
                                    >
                                        <option value="">Seleccionar Departamento</option>
                                        {units.map((u) => (
                                            <option key={u.id} value={u.number}>Unidad {u.number}</option>
                                        ))}
                                    </select>
                                </div>
                                <DialogFooter className="pt-4">
                                    <Button type="submit" className="w-full h-16 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-lg shadow-xl shadow-blue-500/20 transition-all">
                                        Registrar Ingreso
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {/* Main Scanner Section */}
            <QRScannerSimulator onScanSuccess={(newLog: VisitorLog) => setVisitors([newLog, ...visitors])} />

            {/* Activity Log Section */}
            <div className="space-y-8">
                <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-2xl">
                            <ClipboardList className="h-6 w-6 text-slate-900 dark:text-white" />
                        </div>
                        <h2 className="text-2xl font-black text-slate-900 dark:text-white">Bitácora de Ingresos</h2>
                    </div>
                </div>

                <div className="bg-white/60 dark:bg-slate-800/40 backdrop-blur-xl rounded-[3rem] border border-white/50 dark:border-slate-700/50 overflow-hidden shadow-xl shadow-slate-200/20 dark:shadow-black/40">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-slate-50 dark:border-slate-800">
                                    <th className="px-10 py-6 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Visitante</th>
                                    <th className="px-10 py-6 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Destino</th>
                                    <th className="px-10 py-6 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Hora Entrada</th>
                                    <th className="px-10 py-6 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo</th>
                                    <th className="px-10 py-6 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                                {visitors.map((visitor, i) => (
                                    <tr key={visitor.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                                        <td className="px-10 py-8">
                                            <div className="flex items-center gap-4">
                                                <div className="h-12 w-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 font-bold">
                                                    {visitor.visitorName.charAt(0)}
                                                </div>
                                                <div>
                                                    <p className="font-black text-slate-900 dark:text-white">{visitor.visitorName}</p>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Registrado hoy</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-10 py-8">
                                            <span className="px-4 py-2 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl text-sm font-black">
                                                Unidad {visitor.unitId}
                                            </span>
                                        </td>
                                        <td className="px-10 py-8 text-sm font-bold text-slate-600 dark:text-slate-400">
                                            {new Date(visitor.entryTime).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })} hrs
                                        </td>
                                        <td className="px-10 py-8">
                                            <div className="flex items-center gap-2">
                                                <div className={`h-2 w-2 rounded-full ${visitor.isQr ? 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]' : 'bg-slate-300'}`} />
                                                <span className="text-xs font-bold text-slate-500">{visitor.isQr ? "Código QR" : "Manual"}</span>
                                            </div>
                                        </td>
                                        <td className="px-10 py-8 text-right">
                                            <button className="p-3 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                                                <MoreHorizontal className="h-5 w-5 text-slate-400" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
