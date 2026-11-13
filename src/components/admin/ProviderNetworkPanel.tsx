"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgeCheck, Copy, FileCheck2, Link2, Network, Plus, Search, Undo2 } from "lucide-react";
import { ProviderDocumentsReview } from "@/components/services/ProviderDocumentsReview";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { ProviderNetworkService } from "@/lib/api";
import { getCategoryVisual } from "@/components/services/categoryVisuals";
import type { NetworkProviderRow, ProviderInviteLink, SuperAdminProvidersResponse } from "@/lib/types";

const CATEGORY_OPTIONS = [
    { value: "plumbing", label: "Gasfitería" },
    { value: "electrical", label: "Electricidad" },
    { value: "locksmith", label: "Cerrajería" },
    { value: "cleaning", label: "Aseo" },
    { value: "general", label: "Mantención general" },
];

const EMPTY_FORM = { name: "", category: "plumbing", contactPhone: "", email: "", specialties: "" };

/**
 * Red Convive de maestros (superadmin): los maestros que ven todas las
 * comunidades. Se registran directo aquí o se suman desde una comunidad.
 */
export default function ProviderNetworkPanel() {
    const { toast } = useToast();
    const [data, setData] = useState<SuperAdminProvidersResponse | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [form, setForm] = useState(EMPTY_FORM);
    const [showForm, setShowForm] = useState(false);
    const [invite, setInvite] = useState<(ProviderInviteLink & { phone: string }) | null>(null);
    const [returnTo, setReturnTo] = useState<Record<string, string>>({});
    const [docsFor, setDocsFor] = useState<string | null>(null);

    // La búsqueda va al servidor: los candidatos se filtran antes de cortar, así
    // ningún maestro queda fuera por haber muchos otros mejor evaluados.
    const [query, setQuery] = useState("");
    useEffect(() => {
        const timer = setTimeout(() => setQuery(search.trim()), 300);
        return () => clearTimeout(timer);
    }, [search]);

    const load = useCallback(async () => {
        try {
            setData(await ProviderNetworkService.load(query));
        } catch (error) {
            toast({ title: "Error", description: error instanceof Error ? error.message : "No se pudo cargar la red.", variant: "destructive" });
        }
    }, [query, toast]);

    useEffect(() => { void load(); }, [load]);

    const run = async (key: string, action: () => Promise<void>, done: string) => {
        setBusy(key);
        try {
            await action();
            toast({ title: done, variant: "success" });
            await load();
        } catch (error) {
            toast({ title: "Error", description: error instanceof Error ? error.message : "No se pudo completar.", variant: "destructive" });
        } finally {
            setBusy(null);
        }
    };

    const network = useMemo(() => data?.network || [], [data]);
    const candidates = useMemo(() => (data?.community || []).slice(0, 40), [data]);

    const createProvider = () => run("create", async () => {
        await ProviderNetworkService.create({
            name: form.name, category: form.category, contactPhone: form.contactPhone, email: form.email,
            specialties: form.specialties.split(",").map(item => item.trim()).filter(Boolean),
        });
        setForm(EMPTY_FORM);
        setShowForm(false);
    }, "Maestro sumado a la red");

    const sendLink = async (row: NetworkProviderRow) => {
        setBusy(`invite-${row.id}`);
        try {
            const link = await ProviderNetworkService.createInvite(row.id);
            setInvite({ ...link, phone: row.contactPhone });
        } catch (error) {
            toast({ title: "Error", description: error instanceof Error ? error.message : "No se pudo crear el enlace.", variant: "destructive" });
        } finally {
            setBusy(null);
        }
    };

    const inviteText = invite ? `Hola ${invite.providerName.split(" ")[0]}, este es tu enlace de la Red Convive para gestionar tu perfil y responder las solicitudes de los edificios: ${invite.url}` : "";
    const inviteDigits = invite ? invite.phone.replace(/\D/g, "") : "";
    const waDigits = inviteDigits.length === 9 && inviteDigits.startsWith("9") ? `56${inviteDigits}` : inviteDigits.length === 8 ? `569${inviteDigits}` : inviteDigits;

    return (
        <section className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
            <div className="flex flex-col gap-3 border-b p-6 md:flex-row md:items-center md:justify-between" style={{ borderColor: "var(--cc-line)" }}>
                <div>
                    <h2 className="flex items-center gap-2 text-xl font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>
                        <Network className="h-5 w-5" style={{ color: "var(--cc-copper)" }} />
                        Red Convive de maestros
                    </h2>
                    <p className="mt-1 text-sm cc-text-secondary">
                        Los maestros de la red aparecen en Servicios de todas las comunidades. Los de cada comunidad solo los ve su edificio.
                    </p>
                </div>
                <div className="flex gap-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 cc-text-secondary" />
                        <Input className="pl-9" placeholder="Buscar por nombre" value={search} onChange={event => setSearch(event.target.value)} />
                    </div>
                    <Button type="button" onClick={() => setShowForm(value => !value)}>
                        <Plus className="h-4 w-4" /> Registrar
                    </Button>
                </div>
            </div>

            {showForm && (
                <div className="grid gap-3 border-b p-6 md:grid-cols-2" style={{ borderColor: "var(--cc-line)", background: "var(--cc-copper-tint)" }}>
                    <Input placeholder="Nombre o empresa" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} />
                    <select
                        className="rounded-xl border px-3 py-2 text-sm"
                        style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}
                        value={form.category}
                        onChange={event => setForm({ ...form, category: event.target.value })}
                    >
                        {CATEGORY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    <Input placeholder="Celular (+56 9 …)" value={form.contactPhone} onChange={event => setForm({ ...form, contactPhone: event.target.value })} />
                    <Input placeholder="Correo (opcional)" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} />
                    <Input className="md:col-span-2" placeholder="Especialidades separadas por coma (opcional)" value={form.specialties} onChange={event => setForm({ ...form, specialties: event.target.value })} />
                    <div className="md:col-span-2">
                        <Button type="button" disabled={busy === "create"} onClick={createProvider}>Sumar a la red</Button>
                    </div>
                </div>
            )}

            {invite && (
                <div className="space-y-2 border-b p-6" style={{ borderColor: "var(--cc-line)", background: "var(--cc-copper-tint)" }}>
                    <p className="text-sm font-semibold cc-text-primary">Enlace de {invite.providerName} (vence el {invite.expiresAt.slice(0, 10)})</p>
                    <p className="break-all font-mono text-xs cc-text-secondary">{invite.url}</p>
                    <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" onClick={() => { void navigator.clipboard.writeText(inviteText); toast({ title: "Mensaje copiado", variant: "success" }); }}>
                            <Copy className="h-4 w-4" /> Copiar mensaje
                        </Button>
                        {waDigits.length >= 10 && (
                            <a href={`https://wa.me/${waDigits}?text=${encodeURIComponent(inviteText)}`} target="_blank" rel="noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white" style={{ background: "var(--cc-sage)" }}>
                                Enviar por WhatsApp
                            </a>
                        )}
                    </div>
                </div>
            )}

            <div className="grid gap-6 p-6 lg:grid-cols-2">
                <div>
                    <h3 className="mb-3 text-sm font-bold uppercase tracking-wider cc-text-secondary">En la red ({network.length})</h3>
                    {!data ? <p className="text-sm cc-text-secondary">Cargando…</p> : network.length === 0 ? (
                        <p className="text-sm cc-text-secondary">Todavía no hay maestros en la red. Registra uno o súmalo desde una comunidad.</p>
                    ) : (
                        <ul className="space-y-2">
                            {network.map(row => (
                                <li key={row.id} className="rounded-xl border p-3" style={{ borderColor: "var(--cc-line)" }}>
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="flex items-center gap-1.5 font-semibold cc-text-primary">
                                                <span className="truncate">{row.name}</span>
                                                {row.verified && <BadgeCheck className="h-4 w-4 shrink-0" style={{ color: "var(--cc-sage)" }} />}
                                            </p>
                                            <p className="text-xs cc-text-secondary">{getCategoryVisual(row.category).label} · {row.contactPhone} · ★ {row.rating.toFixed(1)} ({row.reviewCount})</p>
                                        </div>
                                        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                                            <Button type="button" size="sm" variant="outline" disabled={busy === `verify-${row.id}`}
                                                onClick={() => run(`verify-${row.id}`, () => ProviderNetworkService.act(row.id, { action: "verify", verified: !row.verified }), row.verified ? "Verificación quitada" : "Maestro verificado")}>
                                                {row.verified ? "Quitar verificación" : "Verificar"}
                                            </Button>
                                            {!row.hasAccount && (
                                                <Button type="button" size="sm" variant="outline" disabled={busy === `invite-${row.id}`} onClick={() => void sendLink(row)}>
                                                    <Link2 className="h-3.5 w-3.5" /> Enlace
                                                </Button>
                                            )}
                                            <Button type="button" size="sm" variant="outline" onClick={() => setDocsFor(docsFor === row.id ? null : row.id)}>
                                                <FileCheck2 className="h-3.5 w-3.5" /> Documentos
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="mt-2 flex items-center gap-2">
                                        <select
                                            className="min-w-0 flex-1 rounded-lg border px-2 py-1 text-xs"
                                            style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}
                                            value={returnTo[row.id] || ""}
                                            onChange={event => setReturnTo({ ...returnTo, [row.id]: event.target.value })}
                                        >
                                            <option value="">Devolver a una comunidad…</option>
                                            {(data?.communities || []).map(community => <option key={community.id} value={community.id}>{community.name}</option>)}
                                        </select>
                                        <Button type="button" size="sm" variant="ghost" disabled={!returnTo[row.id] || busy === `move-${row.id}`}
                                            onClick={() => run(`move-${row.id}`, () => ProviderNetworkService.act(row.id, { action: "to_community", communityId: returnTo[row.id] }), "Maestro devuelto a la comunidad")}>
                                            <Undo2 className="h-3.5 w-3.5" /> Mover
                                        </Button>
                                    </div>
                                    {docsFor === row.id && (
                                        <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--cc-line)" }}>
                                            <ProviderDocumentsReview providerId={row.id} scope="superadmin" />
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div>
                    <h3 className="mb-3 text-sm font-bold uppercase tracking-wider cc-text-secondary">Maestros de las comunidades</h3>
                    <p className="mb-3 text-xs cc-text-secondary">Los mejor evaluados. Al sumarlo a la red lo ven todas las comunidades y su enlace anterior deja de funcionar: envíale uno nuevo desde la red.</p>
                    {!data ? null : candidates.length === 0 ? (
                        <p className="text-sm cc-text-secondary">No hay maestros externos registrados por las comunidades.</p>
                    ) : (
                        <ul className="space-y-2">
                            {candidates.map(row => (
                                <li key={row.id} className="flex items-center justify-between gap-2 rounded-xl border p-3" style={{ borderColor: "var(--cc-line)" }}>
                                    <div className="min-w-0">
                                        <p className="truncate font-semibold cc-text-primary">{row.name}</p>
                                        <p className="text-xs cc-text-secondary">{row.communityName} · {getCategoryVisual(row.category).label} · ★ {row.rating.toFixed(1)} · {row.completedJobs} trabajos</p>
                                    </div>
                                    <Button type="button" size="sm" variant="outline" disabled={busy === `move-${row.id}`}
                                        onClick={() => run(`move-${row.id}`, () => ProviderNetworkService.act(row.id, { action: "to_network" }), "Maestro sumado a la red")}>
                                        Sumar a la red
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </section>
    );
}
