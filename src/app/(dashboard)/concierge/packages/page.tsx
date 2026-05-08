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

const demoPackages: PackageItem[] = [
    { id: "demo-p1", recipientUnitId: "1204", description: "Caja Mercado Libre", receivedAt: new Date().toISOString(), status: "pending" },
    { id: "demo-p2", recipientUnitId: "805", description: "Sobre Chilexpress", receivedAt: new Date(Date.now() - 54 * 60000).toISOString(), status: "pending" },
    { id: "demo-p3", recipientUnitId: "1505", description: "Pedido farmacia", receivedAt: new Date(Date.now() - 3 * 36e5).toISOString(), status: "picked-up", pickedUpAt: new Date(Date.now() - 45 * 60000).toISOString() },
];

const demoUnits: Unit[] = [
    { id: "demo-u1", number: "805" },
    { id: "demo-u2", number: "1204" },
    { id: "demo-u3", number: "1505" },
];

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
    const { toast } = useToast();

    const pendingPackages = packages.filter(p => p.status === 'pending');
    const deliveredPackages = packages.filter(p => p.status === 'picked-up');

    useEffect(() => {
        const loadData = async () => {
            try {
                if (user?.email?.toLowerCase().endsWith("@demo.com")) {
                    setPackages(demoPackages);
                    setUnits(demoUnits);
                    return;
                }

                const pkgs = await PackageService.getAll();
                setPackages((pkgs as any[]).map((p) => ({
                    id: p.id,
                    recipientUnitId: p.recipient_unit_id,
                    description: p.description,
                    receivedAt: p.received_at,
                    status: p.status,
                    pickedUpAt: p.picked_up_at
                })));

                const uns = await WaterService.getUnits();
                setUnits(uns);
            } catch (error) {
                console.error("Error loading packages data:", error);
            }
        };

        loadData();
    }, [user?.email]);

    const handleReceivePackage = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (user?.email?.toLowerCase().endsWith("@demo.com")) {
                const pkg: PackageItem = {
                    id: `demo-p-${Date.now()}`,
                    recipientUnitId: newPackage.unit,
                    description: newPackage.description,
                    receivedAt: new Date().toISOString(),
                    status: "pending",
                };
                setPackages([pkg, ...packages]);
                setIsDialogOpen(false);
                setNewPackage({ unit: "", description: "" });
                toast({
                    title: "Paquete demo registrado",
                    description: `Se agrego a la bodega demo de la Unidad ${pkg.recipientUnitId}.`,
                    variant: "success",
                });
                return;
            }

            const data = await PackageService.register({
                recipient_unit_id: newPackage.unit,
                description: newPackage.description,
                registered_by: user?.id || 'admin'
            });

            const pkg: PackageItem = {
                id: data.id,
                recipientUnitId: data.recipient_unit_id,
                description: data.description,
                receivedAt: data.received_at,
                status: data.status,
            };

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

    const simulateScan = () => {
        setIsScanning(true);
        setTimeout(() => {
            if (units.length > 0) {
                const randomUnit = units[Math.floor(Math.random() * units.length)].number;
                const descriptions = ["Caja Mercado Libre", "Sobre Chilexpress", "Pedido PedidosYa", "Caja Amazon Prime"];
                const randomDesc = descriptions[Math.floor(Math.random() * descriptions.length)];

                setNewPackage({ unit: randomUnit, description: randomDesc });
            }
            setIsScanning(false);
            toast({
                title: "¿Escaneo Exitoso!",
                description: "Datos extraídos de la etiqueta correctamente.",
            });
        }, 1500);
    };

    const handleMarkDelivered = async (id: string) => {
        try {
            if (user?.email?.toLowerCase().endsWith("@demo.com")) {
                setPackages(prev => prev.map(pkg =>
                    pkg.id === id
                        ? { ...pkg, status: 'picked-up', pickedUpAt: new Date().toISOString() }
                        : pkg
                ));
                toast({
                    title: "Entrega demo actualizada",
                    description: "La bitacora local quedo al dia.",
                });
                return;
            }

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
        <div className="max-w-7xl mx-auto py-10 px-4 md:px-8 space-y-12">
            {/* Professional Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
                <div className="space-y-2">
                    <h2 className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-[0.08em]">Operaciones de Conserjería</h2>
                    <h1 className="text-3xl font-semibold cc-text-primary">Bitácora de Encomiendas</h1>
                </div>

                <div className="flex items-center gap-4">
                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogTrigger asChild>
                            <button className="flex items-center gap-3 px-8 py-4 bg-slate-900 dark:bg-slate-800 text-white font-semibold rounded-lg hover:bg-slate-800 transition-all shadow-sm ">
                                <Plus className="h-5 w-5" />
                                Nueva Recepción
                            </button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[480px] bg-surface  border-subtle rounded-lg p-0 overflow-hidden shadow-sm">
                            <div className="p-8 md:p-10 space-y-8">
                                <DialogHeader>
                                    <DialogTitle className="text-2xl font-semibold">Registrar Encomienda</DialogTitle>
                                    <DialogDescription className="font-medium">
                                        Use el escáner para agilizar el registro o ingrese manualmente.
                                    </DialogDescription>
                                </DialogHeader>

                                {/* Scanner Simulation Button */}
                                <button
                                    onClick={simulateScan}
                                    disabled={isScanning}
                                    className={`w-full py-8 border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-4 transition-all ${isScanning
                                        ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-500/10'
                                        : 'border-subtle hover:border-blue-500/50 hover:bg-elevated/50'
                                        }`}
                                >
                                    <div className={`p-4 rounded-lg bg-surface shadow-sm ${isScanning ? 'animate-pulse' : ''}`}>
                                        <Scan className={`h-8 w-8 ${isScanning ? 'text-blue-500' : 'text-slate-400'}`} />
                                    </div>
                                    <div className="text-center">
                                        <p className="font-semibold cc-text-primary">
                                            {isScanning ? 'Escaneando Etiqueta...' : 'Simular Escaneo OCR'}
                                        </p>
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.08em] mt-1">Detección automática de Depto</p>
                                    </div>
                                </button>

                                <form onSubmit={handleReceivePackage} className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.08em] ml-1">Unidad Destino</label>
                                        <select
                                            className="w-full h-14 rounded-lg border border-subtle bg-surface cc-text-primary px-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 appearance-none cursor-pointer"
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
                                        <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.08em] ml-1">Descripción / Courier</label>
                                        <Input
                                            placeholder="Ej: Mercado Libre, Amazon, Sobres..."
                                            className="h-14 rounded-lg text-lg font-bold"
                                            required
                                            value={newPackage.description}
                                            onChange={(e) => setNewPackage({ ...newPackage, description: e.target.value })}
                                        />
                                    </div>
                                    <DialogFooter className="pt-4">
                                        <Button type="submit" className="w-full h-16 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-lg shadow-sm shadow-blue-500/20 transition-all ">
                                            Registrar y Notificar
                                        </Button>
                                    </DialogFooter>
                                </form>
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            <section className="rounded-lg border border-subtle bg-surface p-5 shadow-sm">
                <div className="grid gap-4 md:grid-cols-3">
                    {[
                        { title: "Recibir", description: "Registrar courier, unidad destino y hora exacta de ingreso a bodega.", icon: <Scan className="h-4 w-4" /> },
                        { title: "Notificar", description: "Avisar al residente y mantener trazabilidad mientras el paquete espera retiro.", icon: <BellRing className="h-4 w-4" /> },
                        { title: "Entregar", description: "Cerrar la encomienda solo cuando el residente retire y quede registro.", icon: <CheckCircle2 className="h-4 w-4" /> },
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

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-surface  p-8 rounded-lg border border-subtle shadow-sm shadow-slate-200/20 dark:shadow-black/40">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="p-3 bg-warning-bg rounded-lg">
                            <Clock className="h-6 w-6 text-warning-fg" />
                        </div>
                        <h3 className="font-semibold cc-text-primary">Por Entregar</h3>
                    </div>
                    <p className="text-3xl font-semibold cc-text-primary mb-1">{pendingPackages.length}</p>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.08em]">Paquetes en Bodega</p>
                </div>

                <div className="bg-surface  p-8 rounded-lg border border-subtle shadow-sm shadow-slate-200/20 dark:shadow-black/40">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="p-3 bg-success-bg rounded-lg">
                            <CheckCircle2 className="h-6 w-6 text-success-fg" />
                        </div>
                        <h3 className="font-semibold cc-text-primary">Entregados</h3>
                    </div>
                    <p className="text-3xl font-semibold cc-text-primary mb-1">{deliveredPackages.length}</p>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.08em]">Hoy Completados</p>
                </div>

                <div className="bg-slate-900/80 dark:bg-slate-950/80  border border-slate-800 p-8 rounded-lg shadow-sm shadow-blue-500/10 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:rotate-12 transition-transform duration-500">
                        <BellRing className="h-20 w-20 text-blue-500" />
                    </div>
                    <div className="relative z-10 flex flex-col justify-between h-full">
                        <div className="mb-6">
                            <h3 className="font-semibold text-white">Estado Alertas</h3>
                            <p className="text-[10px] text-blue-400 font-bold uppercase tracking-[0.08em]">Notificaciones Activas</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-sm font-bold text-slate-300">Sistema Online</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Packages Section */}
            <div className="space-y-8">
                <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-lg">
                            <Package2 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                        </div>
                        <h2 className="text-2xl font-semibold cc-text-primary">Encomiendas en Bodega</h2>
                    </div>
                    <div className="relative hidden md:block w-72">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                            placeholder="Buscar por Depto o ID..."
                            className="w-full h-12 pl-12 pr-4 bg-elevated border-none rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500/20 transition-all"
                        />
                    </div>
                </div>

                {pendingPackages.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                        <AnimatePresence mode="popLayout">
                            {pendingPackages.map((pkg, idx) => (
                                <motion.div
                                    key={pkg.id}
                                    layout
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    transition={{ duration: 0.3, delay: idx * 0.05 }}
                                    className="group bg-surface  rounded-lg border border-subtle shadow-sm shadow-slate-200/20 dark:shadow-black/40 hover:shadow-sm hover:border-white/80 dark:hover:border-slate-600  transition-all duration-300 overflow-hidden"
                                >
                                    <div className="p-8 space-y-6">
                                        <div className="flex justify-between items-start">
                                            <div className="h-14 w-14 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform">
                                                <PackageIcon className="h-7 w-7" />
                                            </div>
                                            <span className="px-3 py-1.5 bg-warning-bg text-warning-fg rounded-xl text-[10px] font-semibold uppercase tracking-wider border border-amber-100 dark:border-amber-500/20">
                                                En Bodega
                                            </span>
                                        </div>

                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.08em]">Unidad</span>
                                                <span className="text-xl font-semibold cc-text-primary">{pkg.recipientUnitId}</span>
                                            </div>
                                            <h3 className="text-lg font-bold cc-text-secondary line-clamp-1">{pkg.description}</h3>
                                        </div>

                                        <div className="pt-6 border-t border-subtle space-y-4">
                                            <div className="flex items-center gap-3 text-xs text-slate-400 font-bold">
                                                <History className="h-4 w-4" />
                                                <span>{receivedAgoLabel(pkg.receivedAt)}</span>
                                            </div>
                                            <button
                                                onClick={() => handleMarkDelivered(pkg.id)}
                                                className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg shadow-sm shadow-emerald-600/20 transition-all   flex items-center justify-center gap-2"
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
                ) : (
                    <div className="text-center py-24 bg-surface  rounded-lg border border-dashed border-subtle">
                        <div className="w-20 h-20 mx-auto mb-6 bg-elevated rounded-lg flex items-center justify-center">
                            <CheckCircle2 className="h-10 w-10 text-slate-400" />
                        </div>
                        <h3 className="text-2xl font-semibold cc-text-primary mb-2">Bodega Vacía</h3>
                        <p className="cc-text-secondary mb-8 max-w-xs mx-auto font-medium">
                            No hay encomiendas pendientes por retirar. El registro está al día.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
