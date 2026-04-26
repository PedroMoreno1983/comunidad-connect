"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { WaterService } from "@/lib/api";
import { Unit } from "@/lib/types";
import { useToast } from "@/components/ui/Toast";
import {
    Building2,
    Plus,
    Search,
    UserPlus,
    UserX,
    Loader2,
    Home,
    MoreHorizontal
} from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/Dialog"; // Assuming you have a Dialog component based on Radix UI or similar
import { useAuth } from "@/lib/authContext";

interface Profile {
    id: string;
    name: string;
    email: string;
    role: string;
}

export default function UnitsPage() {
    const { toast } = useToast();
    const [units, setUnits] = useState<(Unit & { profiles: { name: string; email: string; } | null })[]>([]);
    const [loading, setLoading] = useState(true);
    const [profiles, setProfiles] = useState<Profile[]>([]);

    // Create Unit State
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [newUnit, setNewUnit] = useState({ tower: '', number: '', floor: '' });
    const [creating, setCreating] = useState(false);

    // Assign Resident State
    const [isAssignOpen, setIsAssignOpen] = useState(false);
    const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
    const [selectedResident, setSelectedResident] = useState<string>("");
    const [assigning, setAssigning] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        setLoading(true);
        try {
            const unitsData = await WaterService.getUnits();
            setUnits(unitsData);
        } catch (error) {
            console.error('Error loading units:', error);
            toast({
                title: "Error",
                description: "No se pudieron cargar las unidades.",
                variant: "destructive"
            });
        }

        try {
            const profilesData = await WaterService.getProfiles();
            setProfiles(profilesData as Profile[]);
        } catch (error) {
            console.error('Error loading profiles:', error);
            // Non-critical — profiles load silently fails, unit list is still usable
        }

        setLoading(false);
    }

    async function handleCreateUnit(e: React.FormEvent) {
        e.preventDefault();
        setCreating(true);
        try {
            await WaterService.createUnit({
                tower: newUnit.tower,
                number: newUnit.number,
                floor: parseInt(newUnit.floor)
            });
            toast({ title: "Unidad creada", variant: "success" });
            setIsCreateOpen(false);
            setNewUnit({ tower: '', number: '', floor: '' });
            loadData();
        } catch (error) {
            toast({ title: "Error al crear", variant: "destructive" });
        } finally {
            setCreating(false);
        }
    }

    async function handleAssignResident() {
        if (!selectedUnit) return;
        setAssigning(true);
        try {
            // If selectedResident is empty string, it means unassign (technically) but let's assume we send null if that was the case.
            // For now, only assign.
            await WaterService.assignResident(selectedUnit, selectedResident || null);
            toast({ title: "Residente asignado", variant: "success" });
            setIsAssignOpen(false);
            loadData();
        } catch (error) {
            toast({ title: "Error al asignar", variant: "destructive" });
        } finally {
            setAssigning(false);
        }
    }

    if (loading) {
        return (
            <div className="flex h-96 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-6xl mx-auto p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold cc-text-primary">Gestión de Unidades</h1>
                    <p className="cc-text-secondary">Administra departamentos y asigna residentes.</p>
                </div>

                <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-blue-600 hover:bg-blue-700">
                            <Plus className="mr-2 h-4 w-4" />
                            Nueva Unidad
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Crear Nueva Unidad</DialogTitle>
                            <DialogDescription>
                                Ingresa los detalles del departamento o casa.
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleCreateUnit} className="space-y-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Torre / Bloque</label>
                                    <Input
                                        placeholder="Ej: A"
                                        value={newUnit.tower}
                                        onChange={e => setNewUnit({ ...newUnit, tower: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Piso</label>
                                    <Input
                                        type="number"
                                        placeholder="Ej: 1"
                                        value={newUnit.floor}
                                        onChange={e => setNewUnit({ ...newUnit, floor: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Número de Unidad</label>
                                <Input
                                    placeholder="Ej: 101"
                                    value={newUnit.number}
                                    onChange={e => setNewUnit({ ...newUnit, number: e.target.value })}
                                    required
                                />
                            </div>
                            <DialogFooter>
                                <Button type="submit" disabled={creating}>
                                    {creating ? "Creando..." : "Crear Unidad"}
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <Card className="border-subtle shadow-sm">
                <CardHeader className="pb-4 border-b border-subtle/50">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-lg font-semibold flex items-center gap-2">
                            <Building2 className="h-5 w-5 text-slate-500" />
                            Unidades Registradas
                        </CardTitle>
                        <div className="relative w-64">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                            <Input placeholder="Buscar unidad..." className="pl-8 h-9" />
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-canvas/50 text-slate-500 font-medium border-b border-subtle">
                                <tr>
                                    <th className="px-6 py-4">Unidad</th>
                                    <th className="px-6 py-4">Ubicación</th>
                                    <th className="px-6 py-4">Residente Actual</th>
                                    <th className="px-6 py-4 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {units.map((unit) => (
                                    <tr key={unit.id} className="hover:bg-elevated/50 transition-colors">
                                        <td className="px-6 py-4 font-medium cc-text-primary">
                                            Depto {unit.number}
                                        </td>
                                        <td className="px-6 py-4 text-slate-500">
                                            Torre {unit.tower}, Piso {unit.floor}
                                        </td>
                                        <td className="px-6 py-4">
                                            {unit.profiles ? (
                                                <div className="flex items-center gap-2">
                                                    <div className="h-6 w-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
                                                        {(unit.profiles.name || unit.profiles.name)?.charAt(0) || 'U'}
                                                    </div>
                                                    <span className="cc-text-secondary">
                                                        {unit.profiles.name || unit.profiles.name || unit.profiles.email}
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="text-slate-400 text-xs italic">Sin asignar</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <Dialog open={isAssignOpen && selectedUnit === unit.id} onOpenChange={(open) => {
                                                if (!open) setSelectedUnit(null);
                                                setIsAssignOpen(open);
                                            }}>
                                                <DialogTrigger asChild>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => setSelectedUnit(unit.id)}
                                                    >
                                                        <UserPlus className="h-4 w-4 mr-2" />
                                                        Asignar
                                                    </Button>
                                                </DialogTrigger>
                                                <DialogContent>
                                                    <DialogHeader>
                                                        <DialogTitle>Asignar Residente</DialogTitle>
                                                        <DialogDescription>
                                                            Selecciona el usuario que vive en la unidad {unit.number}.
                                                        </DialogDescription>
                                                    </DialogHeader>
                                                    <div className="py-4">
                                                        <select
                                                            className="w-full p-2 rounded-md border border-default bg-surface"
                                                            value={selectedResident}
                                                            onChange={(e) => setSelectedResident(e.target.value)}
                                                        >
                                                            <option value="">Seleccionar usuario...</option>
                                                            {profiles.map((p: Profile) => (
                                                                <option key={p.id} value={p.id}>
                                                                    {p.name || p.email} ({p.role})
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <DialogFooter>
                                                        <Button onClick={handleAssignResident} disabled={assigning}>
                                                            {assigning ? "Guardando..." : "Confirmar Asignación"}
                                                        </Button>
                                                    </DialogFooter>
                                                </DialogContent>
                                            </Dialog>
                                        </td>
                                    </tr>
                                ))}
                                {units.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                                            No hay unidades creadas aún.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
