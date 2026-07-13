"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/lib/authContext";
import { PackageService } from "@/lib/services/supabaseServices";
import { WaterService } from "@/lib/api";
import {
    Package as PackageIcon, Check, Clock, Plus,
    CheckCircle2, Package2, Search, Scan,
    BellRing, History
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
import { useToast } from "@/components/ui/Toast";
import { motion, AnimatePresence } from "framer-motion";
import { Eyebrow, DisplayHeading } from "@/components/cc/Eyebrow";

interface PackageItem {
    id: string;
    recipientUnitId: string;
    description: string;
    receivedAt: string;
    status: string;
    pickedUpAt?: string | null;
}

interface Unit {
    id: string;
    number: string;
}

type PackageRow = {
    id: string;
    recipient_unit_id?: string | null;
    description?: string | null;
    received_at?: string | null;
    status?: string | null;
    picked_up_at?: string | null;
};

function mapPackageRow(row: PackageRow): PackageItem {
    return {
        id: row.id,
        recipientUnitId: row.recipient_unit_id || "Sin unidad",
        description: row.description || "Encomienda sin descripcion",
        receivedAt: row.received_at || new Date().toISOString(),
        status: row.status || "pending",
        pickedUpAt: row.picked_up_at || null,
    };
}


function receivedAgoLabel(value: string) {
    const receivedAt = new Date(value).getTime();
    if (Number.isNaN(receivedAt)) return "Recibido hoy";
    const minutes = Math.max(1, Math.floor((Date.now() - receivedAt) / 60000));
    if (minutes < 60) return `Recibido hace ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    return `Recibido hace ${hours} ${hours === 1 ? "hora" : "horas"}`;
}

export default function PackagesPage() {
    const { user } = useAuth();
    const [packages, setPackages] = useState<PackageItem[]>([]);
    const [units, setUnits] = useState<Unit[]>([]);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    const [newPackage, setNewPackage] = useState({ unit: "", description: "" });
    const [query, setQuery] = useState("");
    const { toast } = useToast();

    const pendingPackages = packages.filter(p => p.status === 'pending');
    const deliveredPackages = packages.filter(p => p.status === 'picked-up');
    const filteredPendingPackages = pendingPackages.filter(pkg =>
        `${pkg.recipientUnitId} ${pkg.description} ${pkg.id}`.toLowerCase().includes(query.trim().toLowerCase())
    );

    useEffect(() => {
        const loadData = async () => {
            try {

                const pkgs = await PackageService.getAll();
                setPackages(((pkgs || []) as PackageRow[]).map(mapPackageRow));

                const uns = await WaterService.getUnits();
                setUnits(uns);
            } catch (error) {
                console.error("Error loading packages data:", error);
            }
        };

        loadData();
    }, [user?.id]);

    const handleReceivePackage = async (e: React.FormEvent) => {
        e.preventDefault();
        try {

            const data = await PackageService.register({
                recipient_unit_id: newPackage.unit,
                description: newPackage.description,
                registered_by: user?.id || 'admin'
            });

            const pkg = mapPackageRow(data as PackageRow);

            setPackages([pkg, ...packages]);
            setIsDialogOpen(false);
            setNewPackage({ unit: "", description: "" });
            toast({
                title: "Paquete Registrado",
                description: `Se ha notificado al Residente de la Unidad ${pkg.recipientUnitId}.`,
                variant: "success",
            });
        } catch (error) {
            console.error(error);
            toast({
                title: "Error",
                description: "Hubo un problema registrando el paquete.",
                variant: "destructive",
            });
        }
    };

    const handleReadLabel = () => {
        setIsScanning(true);
        setTimeout(() => {
            setIsScanning(false);
            toast({
                title: "Lectura OCR no configurada",
                description: "Ingresa la unidad y descripcion manualmente para mantener la bitacora real.",
            });
        }, 900);
    };

    const handleMarkDelivered = async (id: string) => {
        try {

            await PackageService.markPickedUp(id);
            setPackages(prev => prev.map(pkg =>
                pkg.id === id
                    ? { ...pkg, status: 'picked-up', pickedUpAt: new Date().toISOString() }
                    : pkg
            ));
            toast({
                title: "Paquete Entregado",
                description: "Registro actualizado en la bitácora.",
            });
        } catch {
            toast({
                title: "Error",
                description: "No se pudo actualizar el estado.",
                variant: "destructive"
            });
        }
    };

    return (
        <div className="max-w-7xl mx-auto py-6 px-4 sm:py-10 md:px-8 space-y-10 sm:space-y-12">
            {/* Professional Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
                <div className="space-y-2">
                    <Eyebrow>Operaciones de Conserjería</Eyebrow>
                    <DisplayHeading size={32}>Bitácora de Encomiendas</DisplayHeading>
                </div>

                <div className="flex items-center gap-4">
                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogTrigger asChild>
                            <button className="flex items-center gap-3 px-8 py-4 text-white font-semibold rounded-full transition-all" style={{ background: "var(--cc-ink)" }}>
                                <Plus className="h-5 w-5" />
                                Nueva Recepción
                            </button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[480px] rounded-2xl p-0 overflow-hidden" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                            <div className="p-8 md:p-10 space-y-8">
                                <DialogHeader>
                                    <DialogTitle className="text-2xl font-semibold" style={{ fontFamily: "var(--cc-font-display)" }}>Registrar Encomienda</DialogTitle>
                                    <DialogDescription className="font-medium">
                                        Use el escáner para agilizar el registro o ingrese manualmente.
                                    </DialogDescription>
                                </DialogHeader>

                                {/* Scanner Simulation Button */}
                                <button
                                    onClick={handleReadLabel}
                                    disabled={isScanning}
                                    className="w-full py-8 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-4 transition-all"
                                    style={isScanning
                                        ? { borderColor: "var(--cc-copper)", background: "var(--cc-copper-tint)" }
                                        : { borderColor: "var(--cc-line-strong)" }}
                                >
                                    <div className="p-4 rounded-full" style={{ background: "var(--cc-paper)", ...(isScanning ? { animation: "pulse 1.5s infinite" } : {}) }}>
                                        <Scan className="h-8 w-8" style={{ color: isScanning ? "var(--cc-copper)" : "var(--cc-ink-faint)" }} />
                                    </div>
                                    <div className="text-center">
                                        <p className="font-semibold cc-text-primary">
                                            {isScanning ? 'Leyendo etiqueta...' : 'Leer etiqueta'}
                                        </p>
                                        <p className="text-xs font-bold cc-text-tertiary uppercase tracking-[0.08em] mt-1">Completa los datos detectados antes de guardar</p>
                                    </div>
                                </button>

                                <form onSubmit={handleReceivePackage} className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-semibold cc-text-tertiary uppercase tracking-[0.08em] ml-1">Unidad Destino</label>
                                        <select
                                            className="w-full h-14 rounded-xl border px-4 text-sm font-bold cc-text-primary outline-none focus:ring-2 focus:ring-[var(--cc-copper)]/15 focus:border-[var(--cc-copper)] appearance-none cursor-pointer"
                                            style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}
                                            required
                                            value={newPackage.unit}
                                            onChange={(e) => setNewPackage({ ...newPackage, unit: e.target.value })}
                                        >
                                            <option value="">Seleccionar Departamento</option>
                                            {units.map((u) => (
                                                <option key={u.id} value={u.number}>Unidad {u.number}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-semibold cc-text-tertiary uppercase tracking-[0.08em] ml-1">Descripción / Courier</label>
                                        <Input
                                            placeholder="Ej: Mercado Libre, Amazon, Sobres..."
                                            className="h-14 rounded-xl text-lg font-bold"
                                            required
                                            value={newPackage.description}
                                            onChange={(e) => setNewPackage({ ...newPackage, description: e.target.value })}
                                        />
                                    </div>
                                    <DialogFooter className="pt-4">
                                        <Button type="submit" className="w-full h-16 rounded-full font-semibold text-lg transition-all" style={{ background: "var(--cc-copper)" }}>
                                            Registrar y Notificar
                                        </Button>
                                    </DialogFooter>
                                </form>
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            <section className="rounded-2xl border p-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                <div className="grid gap-4 md:grid-cols-3">
                    {[
                        { title: "Recibir", description: "Registrar courier, unidad destino y hora exacta de ingreso a bodega.", icon: <Scan className="h-4 w-4" /> },
                        { title: "Notificar", description: "Avisar al residente y mantener trazabilidad mientras el paquete espera retiro.", icon: <BellRing className="h-4 w-4" /> },
                        { title: "Entregar", description: "Cerrar la encomienda solo cuando el residente retire y quede registro.", icon: <CheckCircle2 className="h-4 w-4" /> },
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

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-8 rounded-2xl border" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    <div className="flex items-center gap-4 mb-6">
                        <div className="p-3 bg-warning-bg rounded-full">
                            <Clock className="h-6 w-6 text-warning-fg" />
                        </div>
                        <h3 className="font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>Por Entregar</h3>
                    </div>
                    <p className="text-3xl font-semibold cc-text-primary mb-1" style={{ fontFamily: "var(--cc-font-display)" }}>{pendingPackages.length}</p>
                    <p className="text-xs font-bold cc-text-tertiary uppercase tracking-[0.08em]">Paquetes en Bodega</p>
                </div>

                <div className="p-8 rounded-2xl border" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    <div className="flex items-center gap-4 mb-6">
                        <div className="p-3 bg-success-bg rounded-full">
                            <CheckCircle2 className="h-6 w-6 text-success-fg" />
                        </div>
                        <h3 className="font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>Entregados</h3>
                    </div>
                    <p className="text-3xl font-semibold cc-text-primary mb-1" style={{ fontFamily: "var(--cc-font-display)" }}>{deliveredPackages.length}</p>
                    <p className="text-xs font-bold cc-text-tertiary uppercase tracking-[0.08em]">Hoy Completados</p>
                </div>

                <div className="p-8 rounded-2xl relative overflow-hidden group" style={{ background: "var(--cc-ink)" }}>
                    <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:rotate-12 transition-transform duration-500">
                        <BellRing className="h-20 w-20" style={{ color: "var(--cc-copper-tint)" }} />
                    </div>
                    <div className="relative z-10 flex flex-col justify-between h-full">
                        <div className="mb-6">
                            <h3 className="font-semibold text-white" style={{ fontFamily: "var(--cc-font-display)" }}>Estado Alertas</h3>
                            <p className="text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--cc-copper-tint)" }}>Notificaciones Activas</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="h-3 w-3 rounded-full animate-pulse" style={{ background: "var(--cc-sage)" }} />
                            <span className="text-sm font-bold" style={{ color: "var(--cc-ink-muted)" }}>Sistema Online</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Packages Section */}
            <div className="space-y-8">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between px-2">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-full" style={{ background: "var(--cc-copper-tint)" }}>
                            <Package2 className="h-6 w-6" style={{ color: "var(--cc-copper)" }} />
                        </div>
                        <h2 className="text-2xl font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>Encomiendas en Bodega</h2>
                    </div>
                    <div className="relative w-full sm:w-72">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "var(--cc-ink-faint)" }} />
                        <input
                            placeholder="Buscar por Depto o ID..."
                            value={query}
                            onChange={event => setQuery(event.target.value)}
                            className="w-full h-12 pl-12 pr-4 border-none rounded-full text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--cc-copper)]/20 transition-all"
                            style={{ background: "var(--cc-paper-warm)" }}
                        />
                    </div>
                </div>

                {pendingPackages.length > 0 && filteredPendingPackages.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 sm:gap-8">
                        <AnimatePresence mode="popLayout">
                            {filteredPendingPackages.map((pkg, idx) => (
                                <motion.div
                                    key={pkg.id}
                                    layout
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    transition={{ duration: 0.3, delay: idx * 0.05 }}
                                    className="group rounded-2xl border transition-all duration-300 overflow-hidden hover:border-[var(--cc-copper)]"
                                    style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}
                                >
                                    <div className="p-8 space-y-6">
                                        <div className="flex justify-between items-start">
                                            <div className="h-14 w-14 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform" style={{ background: "var(--cc-copper-tint)", color: "var(--cc-copper)" }}>
                                                <PackageIcon className="h-7 w-7" />
                                            </div>
                                            <span className="px-3 py-1.5 bg-warning-bg text-warning-fg rounded-full text-[10px] font-semibold uppercase tracking-wider">
                                                En Bodega
                                            </span>
                                        </div>

                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-semibold cc-text-tertiary uppercase tracking-[0.08em]">Unidad</span>
                                                <span className="text-xl font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>{pkg.recipientUnitId}</span>
                                            </div>
                                            <h3 className="text-lg font-bold cc-text-secondary line-clamp-1">{pkg.description}</h3>
                                        </div>

                                        <div className="pt-6 border-t space-y-4" style={{ borderColor: "var(--cc-line)" }}>
                                            <div className="flex items-center gap-3 text-xs cc-text-tertiary font-bold">
                                                <History className="h-4 w-4" />
                                                <span>{receivedAgoLabel(pkg.receivedAt)}</span>
                                            </div>
                                            <button
                                                onClick={() => handleMarkDelivered(pkg.id)}
                                                className="w-full h-14 text-white font-semibold rounded-full transition-all flex items-center justify-center gap-2"
                                                style={{ background: "var(--cc-sage)" }}
                                            >
                                                <Check className="h-5 w-5" />
                                                Entregar a Residente
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                ) : pendingPackages.length > 0 ? (
                    <div className="text-center py-20 rounded-2xl border border-dashed" style={{ borderColor: "var(--cc-line-strong)", background: "var(--cc-paper)" }}>
                        <div className="w-16 h-16 mx-auto mb-5 rounded-full flex items-center justify-center" style={{ background: "var(--cc-paper-warm)" }}>
                            <Search className="h-8 w-8" style={{ color: "var(--cc-ink-faint)" }} />
                        </div>
                        <h3 className="text-xl font-semibold cc-text-primary mb-2" style={{ fontFamily: "var(--cc-font-display)" }}>Sin resultados</h3>
                        <p className="cc-text-secondary max-w-sm mx-auto font-medium">
                            No hay encomiendas pendientes que coincidan con esa busqueda.
                        </p>
                    </div>
                ) : (
                    <div className="text-center py-24 rounded-2xl border border-dashed" style={{ borderColor: "var(--cc-line-strong)", background: "var(--cc-paper)" }}>
                        <div className="w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center" style={{ background: "var(--cc-paper-warm)" }}>
                            <CheckCircle2 className="h-10 w-10" style={{ color: "var(--cc-ink-faint)" }} />
                        </div>
                        <h3 className="text-2xl font-semibold cc-text-primary mb-2" style={{ fontFamily: "var(--cc-font-display)" }}>Bodega Vacía</h3>
                        <p className="cc-text-secondary mb-8 max-w-xs mx-auto font-medium">
                            No hay encomiendas pendientes por retirar. El registro está al día.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
