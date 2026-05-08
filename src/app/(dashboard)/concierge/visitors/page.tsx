"use client";

import { useEffect, useState } from "react";
import { QRScannerSimulator } from "@/components/admin/QRScannerSimulator";
import { useAuth } from "@/lib/authContext";
import { VisitorLog } from "@/lib/types";
import { VisitorService } from "@/lib/services/supabaseServices";
import { WaterService } from "@/lib/api";
import {
    Plus, ClipboardList, MoreHorizontal, QrCode, ShieldCheck, UserCheck
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

// interface VisitorLog moved to @/lib/types.ts

interface Unit {
    id: string;
    number: string;
}

const demoVisitorLogs: VisitorLog[] = [
    { id: "demo-v1", visitorName: "Camila Rojas", unitId: "1204", entryTime: new Date().toISOString(), isQr: true },
    { id: "demo-v2", visitorName: "Luis Araya", unitId: "805", entryTime: new Date(Date.now() - 38 * 60000).toISOString(), isQr: false },
    { id: "demo-v3", visitorName: "Courier Chilexpress", unitId: "1505", entryTime: new Date(Date.now() - 74 * 60000).toISOString(), isQr: false },
];

const demoUnits: Unit[] = [
    { id: "demo-u1", number: "805" },
    { id: "demo-u2", number: "1204" },
    { id: "demo-u3", number: "1505" },
];

export default function VisitorsPage() {
    const { user } = useAuth();
    const [visitors, setVisitors] = useState<VisitorLog[]>([]);
    const [units, setUnits] = useState<Unit[]>([]);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [newVisitor, setNewVisitor] = useState({ name: "", unit: "" });
    const { toast } = useToast();
    const qrEntries = visitors.filter(visitor => visitor.isQr).length;
    const manualEntries = visitors.length - qrEntries;

    useEffect(() => {
        const loadData = async () => {
            try {
                if (user?.email?.toLowerCase().endsWith("@demo.com")) {
                    setVisitors(demoVisitorLogs);
                    setUnits(demoUnits);
                    return;
                }

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
            }
        };

        loadData();
    }, [user?.email]);

    const handleRegisterVisitor = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (user?.email?.toLowerCase().endsWith("@demo.com")) {
                const visitor = {
                    id: `demo-v-${Date.now()}`,
                    visitorName: newVisitor.name,
                    unitId: newVisitor.unit,
                    entryTime: new Date().toISOString(),
                    isQr: false
                };
                setVisitors([visitor, ...visitors]);
                setIsDialogOpen(false);
                setNewVisitor({ name: "", unit: "" });
                toast({
                    title: "Registro demo listo",
                    description: `Se agrego ${visitor.visitorName} a la bitacora local.`,
                    variant: "success",
                });
                return;
            }

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
                    <h2 className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-[0.08em]">Módulo de Seguridad</h2>
                    <h1 className="text-3xl font-semibold cc-text-primary">Control de Accesos</h1>
                </div>

                <div className="flex items-center gap-4">
                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogTrigger asChild>
                            <button className="flex items-center gap-3 px-8 py-4 bg-surface  cc-text-primary font-semibold rounded-lg border border-subtle hover:bg-surface dark:hover:bg-slate-800/60 transition-all shadow-sm shadow-slate-200/20 dark:shadow-black/20 ">
                                <Plus className="h-5 w-5 text-blue-600" />
                                Registro Manual
                            </button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[480px] bg-surface  border-subtle rounded-lg p-10 shadow-sm">
                            <DialogHeader>
                                <DialogTitle className="text-2xl font-semibold">Registro de Visita</DialogTitle>
                                <DialogDescription className="font-medium">
                                    Use esta opción si el invitado no posee un código QR.
                                </DialogDescription>
                            </DialogHeader>
                            <form onSubmit={handleRegisterVisitor} className="space-y-6 pt-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.08em] ml-1">Nombre Completo</label>
                                    <Input
                                        placeholder="Nombre del visitante"
                                        className="h-14 rounded-lg font-bold"
                                        required
                                        value={newVisitor.name}
                                        onChange={(e) => setNewVisitor({ ...newVisitor, name: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.08em] ml-1">Unidad Destino</label>
                                    <select
                                        className="w-full h-14 rounded-lg border border-subtle bg-surface cc-text-primary px-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 appearance-none cursor-pointer"
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
                                    <Button type="submit" className="w-full h-16 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-lg shadow-sm shadow-blue-500/20 transition-all">
                                        Registrar Ingreso
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            <section className="grid gap-4 md:grid-cols-3">
                {[
                    { label: "Ingresos hoy", value: visitors.length, icon: <UserCheck className="h-5 w-5" /> },
                    { label: "Con QR", value: qrEntries, icon: <QrCode className="h-5 w-5" /> },
                    { label: "Manual", value: manualEntries, icon: <ClipboardList className="h-5 w-5" /> },
                ].map(item => (
                    <div key={item.label} className="rounded-lg border border-subtle bg-surface p-5 shadow-sm">
                        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-elevated cc-text-secondary">
                            {item.icon}
                        </div>
                        <p className="text-2xl font-semibold cc-text-primary">{item.value}</p>
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] cc-text-secondary">{item.label}</p>
                    </div>
                ))}
            </section>

            <section className="rounded-lg border border-subtle bg-surface p-5 shadow-sm">
                <div className="grid gap-4 md:grid-cols-3">
                    {[
                        { title: "Verificar", description: "Validar QR o registrar manualmente cuando el visitante no trae codigo.", icon: <ShieldCheck className="h-4 w-4" /> },
                        { title: "Autorizar", description: "Confirmar unidad destino y registrar hora de entrada para auditoria.", icon: <UserCheck className="h-4 w-4" /> },
                        { title: "Consultar", description: "La bitacora queda disponible para administracion y cambios de turno.", icon: <ClipboardList className="h-4 w-4" /> },
                    ].map(item => (
                        <div key={item.title} className="flex gap-4 rounded-lg border border-subtle bg-elevated/40 p-4">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface cc-text-secondary">
                                {item.icon}
                            </div>
                            <div>
                                <h2 className="font-semibold cc-text-primary">{item.title}</h2>
                                <p className="mt-1 text-sm leading-6 cc-text-secondary">{item.description}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Main Scanner Section */}
            <QRScannerSimulator onScanSuccess={(newLog: VisitorLog) => setVisitors([newLog, ...visitors])} />

            {/* Activity Log Section */}
            <div className="space-y-8">
                <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-elevated rounded-lg">
                            <ClipboardList className="h-6 w-6 cc-text-primary" />
                        </div>
                        <h2 className="text-2xl font-semibold cc-text-primary">Bitácora de Ingresos</h2>
                    </div>
                </div>

                <div className="bg-surface  rounded-lg border border-subtle overflow-hidden shadow-sm shadow-slate-200/20 dark:shadow-black/40">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-subtle">
                                    <th className="px-10 py-6 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-[0.08em]">Visitante</th>
                                    <th className="px-10 py-6 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-[0.08em]">Destino</th>
                                    <th className="px-10 py-6 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-[0.08em]">Hora Entrada</th>
                                    <th className="px-10 py-6 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-[0.08em]">Tipo</th>
                                    <th className="px-10 py-6 text-right text-[10px] font-semibold text-slate-400 uppercase tracking-[0.08em]">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                                {visitors.map((visitor) => (
                                    <tr key={visitor.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                                        <td className="px-10 py-8">
                                            <div className="flex items-center gap-4">
                                                <div className="h-12 w-12 rounded-xl bg-elevated flex items-center justify-center text-slate-400 font-bold">
                                                    {visitor.visitorName.charAt(0)}
                                                </div>
                                                <div>
                                                    <p className="font-semibold cc-text-primary">{visitor.visitorName}</p>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.08em]">Registrado hoy</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-10 py-8">
                                            <span className="px-4 py-2 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl text-sm font-semibold">
                                                Unidad {visitor.unitId}
                                            </span>
                                        </td>
                                        <td className="px-10 py-8 text-sm font-bold cc-text-secondary">
                                            {new Date(visitor.entryTime).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })} hrs
                                        </td>
                                        <td className="px-10 py-8">
                                            <div className="flex items-center gap-2">
                                                <div className={`h-2 w-2 rounded-full ${visitor.isQr ? 'bg-brand-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]' : 'bg-slate-300'}`} />
                                                <span className="text-xs font-bold text-slate-500">{visitor.isQr ? "Código QR" : "Manual"}</span>
                                            </div>
                                        </td>
                                        <td className="px-10 py-8 text-right">
                                            <button className="p-3 hover:bg-elevated rounded-xl transition-colors">
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
