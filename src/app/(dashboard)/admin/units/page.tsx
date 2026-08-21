"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Building2, CheckCircle2, Home, Loader2, Plus, Scale, Search, UserPlus, Users, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { ModuleHeader, ModuleStat } from "@/components/ui/ModuleHeader";
import { useToast } from "@/components/ui/Toast";
import { WaterService } from "@/lib/api";
import { equalSplitPermille } from "@/lib/finance/prorration";
import type { UnitAssignmentProfile, UnitWithResident } from "@/lib/services/water";

function getResidentName(unit: UnitWithResident) {
    return unit.profiles?.name || unit.profiles?.email || "";
}

/** Alícuota total esperada: la suma de la comunidad debe dar 1000‰. */
const TOTAL_PERMILLE = 1000;

/** Lee la alícuota cruda (share_permille, snake_case desde la BD) como número o null. */
function readPermille(unit: UnitWithResident): number | null {
    const raw = unit.share_permille;
    if (raw === null || raw === undefined || raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
}

/** Formatea ‰ para mostrar/editar: hasta 4 decimales, sin ceros de relleno. */
function fmtPermille(value: number | null): string {
    if (value === null) return "";
    return String(Math.round(value * 10000) / 10000);
}

/** Parsea lo tecleado ("12,3456" o "12.3456"). "" -> null. Inválido/negativo -> undefined. */
function parsePermille(raw: string): number | null | undefined {
    const trimmed = raw.trim().replace(",", ".");
    if (trimmed === "") return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0) return undefined;
    return Math.round(n * 10000) / 10000;
}

export default function UnitsPage() {
    const { toast } = useToast();
    const [units, setUnits] = useState<UnitWithResident[]>([]);
    const [profiles, setProfiles] = useState<UnitAssignmentProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState("");

    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [newUnit, setNewUnit] = useState({ tower: "", number: "", floor: "", permille: "" });
    const [creating, setCreating] = useState(false);

    // Borradores de la alícuota editable inline, por unidad (se guardan al salir del campo).
    const [permilleDrafts, setPermilleDrafts] = useState<Record<string, string>>({});
    const [savingPermilleId, setSavingPermilleId] = useState<string | null>(null);
    const [equalizing, setEqualizing] = useState(false);

    const [isAssignOpen, setIsAssignOpen] = useState(false);
    const [selectedUnit, setSelectedUnit] = useState<UnitWithResident | null>(null);
    const [selectedResident, setSelectedResident] = useState("");
    const [assigning, setAssigning] = useState(false);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [unitsData, profilesData] = await Promise.all([
                WaterService.getUnits(),
                WaterService.getProfiles(),
            ]);
            const rows = unitsData;
            setUnits(rows);
            setPermilleDrafts(Object.fromEntries(rows.map(unit => [unit.id, fmtPermille(readPermille(unit))])));
            setProfiles(profilesData);
        } catch (error) {
            console.error("Error loading units:", error);
            toast({
                title: "No se pudieron cargar las unidades",
                description: "Intenta nuevamente en unos segundos.",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const stats = useMemo(() => {
        const assigned = units.filter(unit => Boolean(getResidentName(unit))).length;
        const unassigned = Math.max(0, units.length - assigned);
        const towers = new Set(units.map(unit => unit.tower).filter(Boolean)).size;
        return { total: units.length, assigned, unassigned, towers };
    }, [units]);

    const alicuota = useMemo(() => {
        const values = units.map(readPermille);
        const withValue = values.filter((value): value is number => value !== null);
        const missing = values.length - withValue.length;
        const sum = Math.round(withValue.reduce((acc, value) => acc + value, 0) * 10000) / 10000;
        // Tolerancia de media milésima para no marcar en rojo por redondeos.
        const balanced = missing === 0 && units.length > 0 && Math.abs(sum - TOTAL_PERMILLE) < 0.5;
        return { sum, missing, balanced };
    }, [units]);

    const filteredUnits = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        return units.filter(unit => {
            const text = [
                unit.number,
                unit.tower,
                unit.floor,
                getResidentName(unit),
                unit.profiles?.email,
            ].filter(Boolean).join(" ").toLowerCase();

            return !normalized || text.includes(normalized);
        });
    }, [query, units]);

    async function handleCreateUnit(event: React.FormEvent) {
        event.preventDefault();
        setCreating(true);
        try {
            const createdUnit = {
                tower: newUnit.tower.trim(),
                number: newUnit.number.trim(),
                floor: parseInt(newUnit.floor, 10),
            };

            const parsedPermille = parsePermille(newUnit.permille);
            if (parsedPermille === undefined) {
                toast({ title: "Alícuota inválida", description: "Usa un número mayor o igual a 0 (ej: 8,3333).", variant: "destructive" });
                setCreating(false);
                return;
            }

            await WaterService.createUnit({
                tower: createdUnit.tower,
                number: createdUnit.number,
                floor: createdUnit.floor,
                share_permille: parsedPermille,
            });
            await loadData();

            toast({ title: "Unidad creada", description: `Depto ${createdUnit.number} quedo registrado.`, variant: "success" });
            setIsCreateOpen(false);
            setNewUnit({ tower: "", number: "", floor: "", permille: "" });
        } catch (error) {
            console.error("Error creating unit:", error);
            toast({ title: "No se pudo crear la unidad", description: "Revisa los datos e intenta nuevamente.", variant: "destructive" });
        } finally {
            setCreating(false);
        }
    }

    async function handleAssignResident() {
        if (!selectedUnit) return;
        setAssigning(true);
        try {
            await WaterService.assignResident(selectedUnit.id, selectedResident || null);
            await loadData();

            toast({
                title: selectedResident ? "Residente asignado" : "Unidad liberada",
                description: selectedResident ? `Depto ${selectedUnit.number} actualizado.` : "La unidad quedo sin residente asignado.",
                variant: "success",
            });
            setIsAssignOpen(false);
            setSelectedUnit(null);
            setSelectedResident("");
        } catch (error) {
            console.error("Error assigning resident:", error);
            toast({ title: "No se pudo actualizar", description: "Intenta nuevamente en unos segundos.", variant: "destructive" });
        } finally {
            setAssigning(false);
        }
    }

    // Guarda la alícuota de una unidad al salir del campo, solo si cambió.
    async function handleSaveAlicuota(unit: UnitWithResident) {
        const draft = permilleDrafts[unit.id] ?? "";
        const parsed = parsePermille(draft);
        const current = readPermille(unit);

        if (parsed === undefined) {
            toast({ title: "Alícuota inválida", description: "Usa un número mayor o igual a 0.", variant: "destructive" });
            setPermilleDrafts(prev => ({ ...prev, [unit.id]: fmtPermille(current) }));
            return;
        }
        if (parsed === current) return; // sin cambios

        setSavingPermilleId(unit.id);
        try {
            await WaterService.updateUnit(unit.id, { share_permille: parsed });
            setUnits(prev => prev.map(row => (row.id === unit.id ? { ...row, share_permille: parsed } : row)));
            setPermilleDrafts(prev => ({ ...prev, [unit.id]: fmtPermille(parsed) }));
        } catch (error) {
            console.error("Error updating alícuota:", error);
            toast({ title: "No se pudo guardar la alícuota", description: "Intenta nuevamente.", variant: "destructive" });
            setPermilleDrafts(prev => ({ ...prev, [unit.id]: fmtPermille(current) }));
        } finally {
            setSavingPermilleId(null);
        }
    }

    // Reparte 1000‰ en partes iguales entre todas las unidades (suma exacta = 1000).
    async function handleEqualize() {
        if (units.length === 0) return;
        setEqualizing(true);
        try {
            const shares = equalSplitPermille(units.length);
            await Promise.all(units.map((unit, index) => WaterService.updateUnit(unit.id, { share_permille: shares[index] })));
            setUnits(prev => prev.map((unit, index) => ({ ...unit, share_permille: shares[index] })));
            setPermilleDrafts(Object.fromEntries(units.map((unit, index) => [unit.id, fmtPermille(shares[index])])));
            toast({ title: "Alícuotas repartidas", description: `1000‰ dividido en partes iguales entre ${units.length} unidades.`, variant: "success" });
        } catch (error) {
            console.error("Error equalizing alícuotas:", error);
            toast({ title: "No se pudo repartir", description: "Intenta nuevamente en unos segundos.", variant: "destructive" });
            await loadData();
        } finally {
            setEqualizing(false);
        }
    }

    const openAssign = (unit: UnitWithResident) => {
        setSelectedUnit(unit);
        const matchingProfile = profiles.find(profile => profile.email === unit.profiles?.email);
        setSelectedResident(matchingProfile?.id || "");
        setIsAssignOpen(true);
    };

    return (
        <div className="mx-auto max-w-7xl space-y-7 px-4 py-8 sm:px-6">
            <ModuleHeader
                eyebrow="Administración"
                title="Gestion de unidades"
                description="Administra propiedades físicas, torres, alícuotas y su asignación. Las cuentas y permisos se gestionan en Usuarios; el listado de contacto está en Directorio."
                icon={<Building2 className="h-5 w-5" />}
                meta={`${stats.total} unidades · ${stats.assigned} asignadas`}
                actions={
                    <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                        <DialogTrigger asChild>
                            <Button>
                                <Plus className="mr-2 h-4 w-4" />
                                Nueva unidad
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Crear unidad</DialogTitle>
                                <DialogDescription>
                                    Registra departamento, piso y torre para habilitar gastos, agua y residentes.
                                </DialogDescription>
                            </DialogHeader>
                            <form onSubmit={handleCreateUnit} className="space-y-4 py-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold cc-text-secondary">Torre / bloque</label>
                                        <Input
                                            placeholder="Ej: A"
                                            value={newUnit.tower}
                                            onChange={event => setNewUnit({ ...newUnit, tower: event.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold cc-text-secondary">Piso</label>
                                        <Input
                                            type="number"
                                            placeholder="Ej: 12"
                                            value={newUnit.floor}
                                            onChange={event => setNewUnit({ ...newUnit, floor: event.target.value })}
                                            required
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold cc-text-secondary">Numero</label>
                                    <Input
                                        placeholder="Ej: 1204"
                                        value={newUnit.number}
                                        onChange={event => setNewUnit({ ...newUnit, number: event.target.value })}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold cc-text-secondary">Alícuota (‰) <span className="font-normal cc-text-tertiary">— opcional</span></label>
                                    <Input
                                        type="text"
                                        inputMode="decimal"
                                        placeholder="Ej: 8,3333"
                                        value={newUnit.permille}
                                        onChange={event => setNewUnit({ ...newUnit, permille: event.target.value })}
                                    />
                                    <p className="text-xs cc-text-tertiary">Tanto por mil del gasto común. Puedes dejarla vacía y repartir 1000‰ en partes iguales después.</p>
                                </div>
                                <DialogFooter>
                                    <Button type="submit" disabled={creating}>
                                        {creating ? "Creando..." : "Crear unidad"}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                }
            />

            <section className="grid gap-3 md:grid-cols-4">
                <ModuleStat label="Unidades" value={stats.total} icon={<Home className="h-4 w-4" />} />
                <ModuleStat label="Asignadas" value={stats.assigned} icon={<Users className="h-4 w-4" />} />
                <ModuleStat label="Sin asignar" value={stats.unassigned} icon={<UserPlus className="h-4 w-4" />} active={stats.unassigned > 0} />
                <ModuleStat label="Torres" value={stats.towers} icon={<Building2 className="h-4 w-4" />} />
            </section>

            {units.length > 0 && (
                <section
                    className="flex flex-col gap-4 rounded-xl border p-5 md:flex-row md:items-center md:justify-between"
                    style={{
                        borderColor: alicuota.balanced ? "var(--cc-line)" : "var(--cc-warning-border, var(--cc-line))",
                        background: "var(--cc-paper)",
                    }}
                >
                    <div className="flex items-start gap-3">
                        <div
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                            style={{ background: alicuota.balanced ? "var(--cc-success-bg)" : "var(--cc-warning-bg)", color: alicuota.balanced ? "var(--cc-success-fg)" : "var(--cc-warning-fg)" }}
                        >
                            {alicuota.balanced ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <Scale className="h-4 w-4 cc-text-tertiary" />
                                <p className="font-semibold cc-text-primary">
                                    Alícuota total: {fmtPermille(alicuota.sum) || "0"}‰ <span className="cc-text-tertiary">/ {TOTAL_PERMILLE}‰</span>
                                </p>
                            </div>
                            <p className="mt-1 text-sm cc-text-secondary">
                                {alicuota.balanced
                                    ? "El reparto cuadra: el prorrateo del gasto común usará estas alícuotas."
                                    : alicuota.missing > 0
                                        ? `${alicuota.missing} unidad(es) sin alícuota. Mientras falten o no sumen 1000‰, el prorrateo reparte en partes iguales.`
                                        : `La suma es ${fmtPermille(alicuota.sum)}‰, no 1000‰. Ajusta las alícuotas o repártelas en partes iguales.`}
                            </p>
                        </div>
                    </div>
                    <Button variant="outline" onClick={handleEqualize} disabled={equalizing}>
                        {equalizing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                        {equalizing ? "Repartiendo..." : "Repartir 1000‰ en partes iguales"}
                    </Button>
                </section>
            )}

            <section className="rounded-xl border" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                <div className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center" style={{ borderBottom: "1px solid var(--cc-line)" }}>
                    <div className="relative">
                        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--cc-ink-tertiary)" }} />
                        <input
                            value={query}
                            onChange={event => setQuery(event.target.value)}
                            placeholder="Buscar por unidad, torre, piso o residente"
                            className="h-11 w-full rounded-xl border pl-10 pr-4 text-sm outline-none transition-colors focus:border-[var(--cc-copper)]"
                            style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}
                        />
                    </div>
                    <Badge variant={stats.unassigned > 0 ? "warning" : "success"}>
                        {stats.unassigned > 0 ? `${stats.unassigned} pendientes` : "Asignacion completa"}
                    </Badge>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center gap-3 p-12 text-sm font-semibold cc-text-secondary">
                        <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
                        Cargando unidades...
                    </div>
                ) : filteredUnits.length === 0 ? (
                    <div className="p-6">
                        <EmptyState
                            icon={<Search className="h-6 w-6" />}
                            title={units.length === 0 ? "No hay unidades creadas" : "Sin resultados"}
                            description={units.length === 0 ? "Crea la primera unidad para comenzar la operacion del condominio." : "Ajusta la busqueda para encontrar otra unidad o residente."}
                            action={units.length === 0 ? <Button onClick={() => setIsCreateOpen(true)}>Crear unidad</Button> : undefined}
                        />
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[780px] text-left text-sm">
                            <thead className="text-[11px] font-medium uppercase tracking-[0.12em] cc-text-tertiary" style={{ borderBottom: "1px solid var(--cc-line)", background: "var(--cc-paper-warm)" }}>
                                <tr>
                                    <th className="px-5 py-3">Unidad</th>
                                    <th className="px-5 py-3">Ubicacion</th>
                                    <th className="px-5 py-3">Alícuota ‰</th>
                                    <th className="px-5 py-3">Residente</th>
                                    <th className="px-5 py-3">Estado</th>
                                    <th className="px-5 py-3 text-right">Accion</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredUnits.map(unit => {
                                    const residentName = getResidentName(unit);
                                    const assigned = Boolean(residentName);

                                    return (
                                        <tr key={unit.id} className="transition-colors hover:bg-[var(--cc-paper-warm)]" style={{ borderTop: "1px solid var(--cc-line)" }}>
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--cc-ink)", color: "var(--cc-copper-soft)" }}>
                                                        <Home className="h-5 w-5" />
                                                    </div>
                                                    <div>
                                                        <p className="font-semibold cc-text-primary">Depto {unit.number}</p>
                                                        <p className="text-xs cc-text-secondary">ID {unit.id.slice(0, 12)}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4 font-semibold cc-text-secondary">
                                                Torre {unit.tower || "-"}, piso {unit.floor || "-"}
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="relative w-28">
                                                    <input
                                                        type="text"
                                                        inputMode="decimal"
                                                        aria-label={`Alícuota de la unidad ${unit.number}`}
                                                        value={permilleDrafts[unit.id] ?? ""}
                                                        placeholder="—"
                                                        onChange={event => setPermilleDrafts(prev => ({ ...prev, [unit.id]: event.target.value }))}
                                                        onBlur={() => handleSaveAlicuota(unit)}
                                                        onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }}
                                                        disabled={savingPermilleId === unit.id}
                                                        className="h-9 w-full rounded-lg border pl-3 pr-7 text-sm font-semibold outline-none transition-colors focus:border-[var(--cc-copper)] disabled:opacity-60"
                                                        style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}
                                                    />
                                                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs cc-text-tertiary">
                                                        {savingPermilleId === unit.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "‰"}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4">
                                                {assigned ? (
                                                    <div>
                                                        <p className="font-semibold cc-text-primary">{residentName}</p>
                                                        <p className="text-xs cc-text-secondary">{unit.profiles?.email}</p>
                                                    </div>
                                                ) : (
                                                    <span className="text-sm font-semibold cc-text-tertiary">Sin asignar</span>
                                                )}
                                            </td>
                                            <td className="px-5 py-4">
                                                <Badge variant={assigned ? "success" : "warning"}>
                                                    {assigned ? "Operativa" : "Pendiente"}
                                                </Badge>
                                            </td>
                                            <td className="px-5 py-4 text-right">
                                                <Button variant="outline" size="sm" onClick={() => openAssign(unit)}>
                                                    <UserPlus className="mr-2 h-4 w-4" />
                                                    {assigned ? "Reasignar" : "Asignar"}
                                                </Button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <Dialog open={isAssignOpen} onOpenChange={(open) => {
                setIsAssignOpen(open);
                if (!open) {
                    setSelectedUnit(null);
                    setSelectedResident("");
                }
            }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Asignar residente</DialogTitle>
                        <DialogDescription>
                            {selectedUnit ? `Selecciona quien vive en el depto ${selectedUnit.number}.` : "Selecciona una unidad."}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-4">
                        <label className="text-sm font-semibold cc-text-secondary">Residente</label>
                        <select
                            className="h-11 w-full rounded-lg border border-subtle bg-surface px-3 text-sm font-semibold outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-500/20"
                            value={selectedResident}
                            onChange={event => setSelectedResident(event.target.value)}
                        >
                            <option value="">Dejar sin asignar</option>
                            {profiles
                                .filter(profile => profile.role === "resident")
                                .map(profile => (
                                    <option key={profile.id} value={profile.id}>
                                        {profile.name || profile.email}
                                    </option>
                                ))}
                        </select>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsAssignOpen(false)}>Cancelar</Button>
                        <Button onClick={handleAssignResident} disabled={assigning}>
                            {assigning ? "Guardando..." : "Guardar asignacion"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
