"use client";

import { useEffect, useState } from "react";
import { QRAccessValidator } from "@/components/admin/QRAccessValidator";
import { useAuth } from "@/lib/authContext";
import { VisitorLog } from "@/lib/types";
import { VisitorService } from "@/lib/services/supabaseServices";
import { WaterService } from "@/lib/api";
import {
    Plus, ClipboardList, MoreHorizontal, QrCode, Search, ShieldCheck, UserCheck
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
import { Eyebrow, DisplayHeading } from "@/components/cc/Eyebrow";

// interface VisitorLog moved to @/lib/types.ts

interface Unit {
    id: string;
    number: string;
}

type VisitorRow = {
    id: string;
    visitor_name?: string | null;
    unit_id?: string | null;
    entry_time?: string | null;
    is_qr?: boolean | null;
    units?: {
        number?: string | null;
    } | null;
};

function mapVisitorRow(row: VisitorRow): VisitorLog {
    return {
        id: row.id,
        visitorName: row.visitor_name || "Visita",
        unitId: row.units?.number || row.unit_id || "Sin unidad",
        entryTime: row.entry_time || new Date().toISOString(),
        isQr: Boolean(row.is_qr),
    };
}


export default function VisitorsPage() {
    const { user } = useAuth();
    const [visitors, setVisitors] = useState<VisitorLog[]>([]);
    const [units, setUnits] = useState<Unit[]>([]);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [selectedVisitor, setSelectedVisitor] = useState<VisitorLog | null>(null);
    const [newVisitor, setNewVisitor] = useState({ name: "", unit: "" });
    const [query, setQuery] = useState("");
    const { toast } = useToast();
    const qrEntries = visitors.filter(visitor => visitor.isQr).length;
    const manualEntries = visitors.length - qrEntries;
    const filteredVisitors = visitors.filter(visitor =>
        `${visitor.visitorName} ${visitor.unitId} ${visitor.isQr ? "qr" : "manual"}`.toLowerCase().includes(query.trim().toLowerCase())
    );

    useEffect(() => {
        const loadData = async () => {
            try {

                const logs = await VisitorService.getAll();
                setVisitors(((logs || []) as VisitorRow[]).map(mapVisitorRow));

                const uns = await WaterService.getUnits();
                setUnits(uns);
            } catch (error) {
                console.error("Error loading visitors data:", error);
            }
        };

        loadData();
    }, [user?.id]);

    const handleRegisterVisitor = async (e: React.FormEvent) => {
        e.preventDefault();
        try {

            const data = await VisitorService.register({
                visitor_name: newVisitor.name,
                unit_id: newVisitor.unit,
                registered_by: user?.id || 'admin',
                is_qr: false
            });

            const visitor = mapVisitorRow({
                ...(data as VisitorRow),
                units: { number: units.find(unit => unit.id === (data as VisitorRow).unit_id)?.number },
            });

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
        <div className="max-w-7xl mx-auto py-6 px-4 sm:py-10 md:px-8 space-y-10 sm:space-y-12">
            {/* Professional Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
                <div className="space-y-2">
                    <Eyebrow>Módulo de Seguridad</Eyebrow>
                    <DisplayHeading size={32}>Control de Accesos</DisplayHeading>
                </div>

                <div className="flex items-center gap-4">
                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogTrigger asChild>
                            <button className="flex items-center gap-3 px-8 py-4 cc-text-primary font-semibold rounded-full border transition-all" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                                <Plus className="h-5 w-5" style={{ color: "var(--cc-copper)" }} />
                                Registro Manual
                            </button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[480px] rounded-2xl p-10" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                            <DialogHeader>
                                <DialogTitle className="text-2xl font-semibold" style={{ fontFamily: "var(--cc-font-display)" }}>Registro de Visita</DialogTitle>
                                <DialogDescription className="font-medium">
                                    Use esta opción si el invitado no posee un código QR.
                                </DialogDescription>
                            </DialogHeader>
                            <form onSubmit={handleRegisterVisitor} className="space-y-6 pt-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-semibold cc-text-tertiary uppercase tracking-[0.08em] ml-1">Nombre Completo</label>
                                    <Input
                                        placeholder="Nombre del visitante"
                                        className="h-14 rounded-xl font-bold"
                                        required
                                        value={newVisitor.name}
                                        onChange={(e) => setNewVisitor({ ...newVisitor, name: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-semibold cc-text-tertiary uppercase tracking-[0.08em] ml-1">Unidad Destino</label>
                                    <select
                                        className="w-full h-14 rounded-xl border px-4 text-sm font-bold cc-text-primary outline-none focus:ring-2 focus:ring-[var(--cc-copper)]/15 focus:border-[var(--cc-copper)] appearance-none cursor-pointer"
                                        style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}
                                        required
                                        value={newVisitor.unit}
                                        onChange={(e) => setNewVisitor({ ...newVisitor, unit: e.target.value })}
                                    >
                                        <option value="">Seleccionar Departamento</option>
                                        {units.map((u) => (
                                            <option key={u.id} value={u.id}>Unidad {u.number}</option>
                                        ))}
                                    </select>
                                </div>
                                <DialogFooter className="pt-4">
                                    <Button type="submit" className="w-full h-16 rounded-full font-semibold text-lg transition-all" style={{ background: "var(--cc-copper)" }}>
                                        Registrar Ingreso
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            <section className="grid gap-4 sm:grid-cols-3">
                {[
                    { label: "Ingresos hoy", value: visitors.length, icon: <UserCheck className="h-5 w-5" /> },
                    { label: "Con QR", value: qrEntries, icon: <QrCode className="h-5 w-5" /> },
                    { label: "Manual", value: manualEntries, icon: <ClipboardList className="h-5 w-5" /> },
                ].map(item => (
                    <div key={item.label} className="rounded-2xl border p-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full" style={{ background: "var(--cc-copper-tint)", color: "var(--cc-copper)" }}>
                            {item.icon}
                        </div>
                        <p className="text-2xl font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>{item.value}</p>
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] cc-text-secondary">{item.label}</p>
                    </div>
                ))}
            </section>

            <section className="rounded-2xl border p-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                <div className="grid gap-4 md:grid-cols-3">
                    {[
                        { title: "Verificar", description: "Validar QR o registrar manualmente cuando el visitante no trae codigo.", icon: <ShieldCheck className="h-4 w-4" /> },
                        { title: "Autorizar", description: "Confirmar unidad destino y registrar hora de entrada para auditoria.", icon: <UserCheck className="h-4 w-4" /> },
                        { title: "Consultar", description: "La bitácora queda disponible para administración y cambios de turno.", icon: <ClipboardList className="h-4 w-4" /> },
                    ].map(item => (
                        <div key={item.title} className="flex gap-4 rounded-xl border p-4" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}>
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--cc-paper)", color: "var(--cc-copper)" }}>
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
            <QRAccessValidator
                onScanSuccess={(newLog: VisitorLog) => {
                    const nextVisitors = [newLog, ...visitors];
                    setVisitors(nextVisitors);
                }}
            />

            {/* Activity Log Section */}
            <div className="space-y-8">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between px-2">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-full" style={{ background: "var(--cc-paper-warm)" }}>
                            <ClipboardList className="h-6 w-6 cc-text-primary" />
                        </div>
                        <h2 className="text-2xl font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>Bitácora de Ingresos</h2>
                    </div>
                    <div className="relative w-full sm:w-80">
                        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--cc-ink-faint)" }} />
                        <input
                            placeholder="Buscar visitante, unidad o tipo"
                            value={query}
                            onChange={event => setQuery(event.target.value)}
                            className="h-12 w-full rounded-full pl-12 pr-4 text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--cc-copper)]/20"
                            style={{ background: "var(--cc-paper-warm)" }}
                        />
                    </div>
                </div>

                <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b" style={{ borderColor: "var(--cc-line)" }}>
                                    <th className="px-10 py-6 text-left text-[10px] font-semibold cc-text-tertiary uppercase tracking-[0.08em]">Visitante</th>
                                    <th className="px-10 py-6 text-left text-[10px] font-semibold cc-text-tertiary uppercase tracking-[0.08em]">Destino</th>
                                    <th className="px-10 py-6 text-left text-[10px] font-semibold cc-text-tertiary uppercase tracking-[0.08em]">Hora Entrada</th>
                                    <th className="px-10 py-6 text-left text-[10px] font-semibold cc-text-tertiary uppercase tracking-[0.08em]">Tipo</th>
                                    <th className="px-10 py-6 text-right text-[10px] font-semibold cc-text-tertiary uppercase tracking-[0.08em]">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--cc-line)]">
                                {filteredVisitors.map((visitor) => (
                                    <tr key={visitor.id} className="hover:bg-[var(--cc-paper-warm)] transition-colors">
                                        <td className="px-10 py-8">
                                            <div className="flex items-center gap-4">
                                                <div className="h-12 w-12 rounded-full flex items-center justify-center cc-text-tertiary font-bold" style={{ background: "var(--cc-paper-warm)" }}>
                                                    {visitor.visitorName.charAt(0)}
                                                </div>
                                                <div>
                                                    <p className="font-semibold cc-text-primary">{visitor.visitorName}</p>
                                                    <p className="text-[10px] font-bold cc-text-tertiary uppercase tracking-[0.08em]">Registrado hoy</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-10 py-8">
                                            <span className="px-4 py-2 rounded-full text-sm font-semibold" style={{ background: "var(--cc-copper-tint)", color: "var(--cc-copper)" }}>
                                                Unidad {visitor.unitId}
                                            </span>
                                        </td>
                                        <td className="px-10 py-8 text-sm font-bold cc-text-secondary">
                                            {new Date(visitor.entryTime).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })} hrs
                                        </td>
                                        <td className="px-10 py-8">
                                            <div className="flex items-center gap-2">
                                                <div className="h-2 w-2 rounded-full" style={visitor.isQr ? { background: "var(--cc-copper)", boxShadow: "0 0 8px color-mix(in srgb, var(--cc-copper) 50%, transparent)" } : { background: "var(--cc-ink-faint)" }} />
                                                <span className="text-xs font-bold cc-text-secondary">{visitor.isQr ? "Código QR" : "Manual"}</span>
                                            </div>
                                        </td>
                                        <td className="px-10 py-8 text-right">
                                            <button
                                                type="button"
                                                onClick={() => setSelectedVisitor(visitor)}
                                                className="p-3 hover:bg-[var(--cc-paper-warm)] rounded-full transition-colors"
                                                aria-label={`Ver detalle de ${visitor.visitorName}`}
                                            >
                                                <MoreHorizontal className="h-5 w-5" style={{ color: "var(--cc-ink-faint)" }} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {filteredVisitors.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-10 py-16 text-center">
                                            <Search className="mx-auto mb-4 h-10 w-10" style={{ color: "var(--cc-ink-faint)" }} />
                                            <p className="font-semibold cc-text-primary">Sin registros para esta busqueda</p>
                                            <p className="mt-1 text-sm cc-text-secondary">Prueba con otro nombre, unidad o tipo de ingreso.</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <Dialog open={Boolean(selectedVisitor)} onOpenChange={(open) => !open && setSelectedVisitor(null)}>
                <DialogContent className="sm:max-w-[460px] rounded-2xl p-8" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-semibold" style={{ fontFamily: "var(--cc-font-display)" }}>Detalle de ingreso</DialogTitle>
                        <DialogDescription>
                            Registro operacional disponible para auditoria y cambio de turno.
                        </DialogDescription>
                    </DialogHeader>
                    {selectedVisitor && (
                        <div className="space-y-4 py-4 text-sm">
                            <div className="rounded-xl border p-4" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}>
                                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] cc-text-tertiary">Visitante</p>
                                <p className="mt-1 font-semibold cc-text-primary">{selectedVisitor.visitorName}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="rounded-xl border p-4" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}>
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] cc-text-tertiary">Destino</p>
                                    <p className="mt-1 font-semibold cc-text-primary">Unidad {selectedVisitor.unitId}</p>
                                </div>
                                <div className="rounded-xl border p-4" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}>
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] cc-text-tertiary">Tipo</p>
                                    <p className="mt-1 font-semibold cc-text-primary">{selectedVisitor.isQr ? "Codigo QR" : "Manual"}</p>
                                </div>
                            </div>
                            <div className="rounded-xl border p-4" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}>
                                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] cc-text-tertiary">Hora registrada</p>
                                <p className="mt-1 font-semibold cc-text-primary">
                                    {new Date(selectedVisitor.entryTime).toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" })}
                                </p>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button type="button" onClick={() => setSelectedVisitor(null)}>
                            Cerrar detalle
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
