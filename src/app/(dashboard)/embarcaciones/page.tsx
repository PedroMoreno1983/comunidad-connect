"use client";

import { useCallback, useEffect, useState } from "react";
import { Anchor, Loader2, Plus, Sailboat, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Eyebrow, DisplayHeading } from "@/components/cc/Eyebrow";
import { useToast } from "@/components/ui/Toast";
import { BoatsService } from "@/lib/api";
import { useAuth } from "@/lib/authContext";
import type { CommunityBoat, CommunityBoatInput } from "@/lib/types";

const KIND_LABELS: Record<CommunityBoat["kind"], string> = {
    lancha: "Lancha", velero: "Velero", kayak: "Kayak", moto_agua: "Moto de agua", bote: "Bote", otro: "Otra",
};
const field = "w-full rounded-lg border px-3 py-2 text-sm";
const fieldStyle = { borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" };
const EMPTY: CommunityBoatInput = { kind: "lancha", name: "", registration: "", lengthM: null, notes: "" };

export default function EmbarcacionesPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [boats, setBoats] = useState<CommunityBoat[]>([]);
    const [canSeeAll, setCanSeeAll] = useState(false);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState<CommunityBoatInput>(EMPTY);

    const load = useCallback(async () => {
        try {
            const data = await BoatsService.list();
            setBoats(data.boats);
            setCanSeeAll(data.canSeeAll);
        } catch (error) {
            toast({ title: "No pudimos cargar las embarcaciones", description: error instanceof Error ? error.message : "", variant: "destructive" });
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => { void load(); }, [load]);

    async function save(event: React.FormEvent) {
        event.preventDefault();
        setSaving(true);
        try {
            const boat = await BoatsService.create(form);
            setBoats(current => [boat, ...current]);
            setForm(EMPTY);
            setShowForm(false);
            toast({ title: "Embarcación registrada", variant: "success" });
        } catch (error) {
            toast({ title: "No se guardó", description: error instanceof Error ? error.message : "", variant: "destructive" });
        } finally {
            setSaving(false);
        }
    }

    async function remove(boat: CommunityBoat) {
        if (!window.confirm(`¿Quitar ${boat.name || KIND_LABELS[boat.kind].toLowerCase()} del registro?`)) return;
        try {
            await BoatsService.remove(boat.id);
            setBoats(current => current.filter(item => item.id !== boat.id));
        } catch (error) {
            toast({ title: "No se quitó", description: error instanceof Error ? error.message : "", variant: "destructive" });
        }
    }

    const mine = boats.filter(boat => boat.ownerId === user?.id);
    const others = canSeeAll ? boats.filter(boat => boat.ownerId !== user?.id) : [];

    const card = (boat: CommunityBoat, showOwner: boolean) => (
        <article key={boat.id} className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border p-4" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
            <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--cc-bg-elevated)" }}>
                    <Sailboat className="h-5 w-5 cc-text-secondary" />
                </span>
                <div>
                    <p className="font-semibold cc-text-primary">{KIND_LABELS[boat.kind]}{boat.name ? ` · ${boat.name}` : ""}</p>
                    <p className="text-sm cc-text-secondary">
                        {[boat.registration && `Matrícula ${boat.registration}`, boat.lengthM && `${boat.lengthM.toLocaleString("es-CL")} m`].filter(Boolean).join(" · ") || "Sin matrícula registrada"}
                    </p>
                    {showOwner && <p className="text-xs cc-text-tertiary">{boat.ownerName || "Residente"}{boat.unitNumber ? ` · Casa ${boat.unitNumber}` : ""}</p>}
                    {boat.notes && <p className="mt-1 text-xs cc-text-tertiary">{boat.notes}</p>}
                </div>
            </div>
            {(boat.ownerId === user?.id || canSeeAll) && (
                <button type="button" onClick={() => void remove(boat)} className="flex items-center gap-1 text-xs hover:underline" style={{ color: "var(--cc-danger-fg)" }}>
                    <Trash2 className="h-3.5 w-3.5" /> Quitar
                </button>
            )}
        </article>
    );

    return (
        <div className="mx-auto max-w-4xl space-y-8 px-4 py-6 sm:py-10 md:px-8">
            <div className="space-y-2">
                <Eyebrow>Vida junto al lago</Eyebrow>
                <DisplayHeading size={32}>Embarcaciones</DisplayHeading>
                <p className="max-w-2xl text-sm font-medium cc-text-secondary">
                    Registra tus lanchas, botes, kayaks y motos de agua. Sirve para ordenar el uso del muelle y la rampa, y para saber de quién es cada embarcación ante una emergencia en el lago.
                </p>
            </div>

            {loading ? (
                <p className="text-sm cc-text-secondary"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Cargando…</p>
            ) : (
                <section className="space-y-3">
                    <h2 className="font-semibold cc-text-primary">Mis embarcaciones</h2>
                    {mine.length === 0 && !showForm ? (
                        <EmptyState icon={<Anchor className="h-6 w-6" />} title="Aún no registras embarcaciones"
                            description="Agrega tu lancha, bote, kayak o moto de agua."
                            action={<Button type="button" onClick={() => setShowForm(true)} leadingIcon={<Plus className="h-4 w-4" />}>Registrar embarcación</Button>} />
                    ) : mine.map(boat => card(boat, false))}
                    {mine.length > 0 && !showForm && (
                        <Button type="button" variant="outline" onClick={() => setShowForm(true)} leadingIcon={<Plus className="h-4 w-4" />}>Registrar otra</Button>
                    )}
                </section>
            )}

            {showForm && (
                <form onSubmit={save} className="space-y-4 rounded-2xl border p-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    <h2 className="font-semibold cc-text-primary">Registrar embarcación</h2>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="space-y-1 text-xs cc-text-secondary">Tipo
                            <select value={form.kind} onChange={event => setForm({ ...form, kind: event.target.value as CommunityBoat["kind"] })} className={field} style={fieldStyle}>
                                {Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </select>
                        </label>
                        <label className="space-y-1 text-xs cc-text-secondary">Nombre (opcional)
                            <input value={form.name} maxLength={60} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Ej: La Gaviota" className={field} style={fieldStyle} />
                        </label>
                        <label className="space-y-1 text-xs cc-text-secondary">Matrícula (opcional)
                            <input value={form.registration} maxLength={40} onChange={event => setForm({ ...form, registration: event.target.value })} placeholder="Ej: VALP-1234" className={field} style={fieldStyle} />
                        </label>
                        <label className="space-y-1 text-xs cc-text-secondary">Largo en metros (opcional)
                            <input type="number" min={0.5} max={99} step={0.1} value={form.lengthM ?? ""} onChange={event => setForm({ ...form, lengthM: event.target.value ? Number(event.target.value) : null })} className={field} style={fieldStyle} />
                        </label>
                    </div>
                    <label className="block space-y-1 text-xs cc-text-secondary">Notas (opcional)
                        <input value={form.notes} maxLength={300} onChange={event => setForm({ ...form, notes: event.target.value })} placeholder="Ej: queda en la rampa en invierno" className={field} style={fieldStyle} />
                    </label>
                    <div className="flex gap-2">
                        <Button type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
                        <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
                    </div>
                </form>
            )}

            {canSeeAll && !loading && (
                <section className="space-y-3">
                    <h2 className="font-semibold cc-text-primary">Todas las de la comunidad ({others.length})</h2>
                    <p className="text-xs cc-text-tertiary">Solo la administración ve esta lista.</p>
                    {others.length === 0 ? <p className="text-sm cc-text-secondary">Ningún otro residente ha registrado embarcaciones todavía.</p> : others.map(boat => card(boat, true))}
                </section>
            )}
        </div>
    );
}
