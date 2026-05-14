"use client";

import { useEffect, useMemo, useState } from "react";
import {
    AlertCircle,
    BarChart3,
    Bell,
    CalendarDays,
    CheckCircle2,
    Clock,
    MessageCircle,
    Plus,
    Send,
    Smartphone,
    Trash2,
    Vote,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Poll } from "@/lib/types";
import { PollService } from "@/lib/services/supabaseServices";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/authContext";

type PollFormState = {
    title: string;
    description: string;
    category: Poll["category"];
    endDate: string;
    options: string[];
    sendChat: boolean;
    sendNotifications: boolean;
    sendWhatsapp: boolean;
};

type DeliverySummary = {
    mode: "demo" | "real";
    title: string;
    chatSent: boolean;
    notificationsSent: number;
    whatsappSent: number;
    whatsappSkipped: number;
    whatsappFailed: number;
    whatsappConfigured: boolean;
};

const demoPolls: Poll[] = [
    {
        id: "demo-admin-poll-1",
        title: "Renovacion de ascensores Torre B",
        description: "Consulta formal para aprobar presupuesto y calendario de obra.",
        options: [{ id: "yes", text: "A favor", votes: 74 }, { id: "no", text: "En contra", votes: 18 }],
        endDate: "2026-05-18",
        totalVotes: 92,
        status: "active",
        category: "maintenance",
        createdAt: "2026-05-01",
    },
    {
        id: "demo-admin-poll-2",
        title: "Actualizacion reglamento de mascotas",
        description: "Ajustes de horarios y zonas de circulacion.",
        options: [{ id: "yes", text: "A favor", votes: 58 }, { id: "no", text: "En contra", votes: 21 }],
        endDate: "2026-05-12",
        totalVotes: 79,
        status: "active",
        category: "rules",
        createdAt: "2026-04-28",
    },
];

const categoryLabels: Record<Poll["category"], string> = {
    community: "Comunidad",
    maintenance: "Mantencion",
    rules: "Reglamento",
    other: "Otro",
};

const demoStorageKey = "cc_demo_admin_polls";
const demoChatStorageKey = "cc_demo_global_chat_messages";

function getDefaultEndDate() {
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function defaultForm(): PollFormState {
    return {
        title: "",
        description: "",
        category: "community",
        endDate: getDefaultEndDate(),
        options: ["A favor", "En contra"],
        sendChat: true,
        sendNotifications: true,
        sendWhatsapp: true,
    };
}

function mapPollRecord(record: any): Poll {
    const rawOptions = record.options || record.poll_options || [];
    const options = rawOptions.map((option: any, index: number) => ({
        id: option.id || `${record.id}-option-${index}`,
        text: option.text || option.label || `Opcion ${index + 1}`,
        votes: Number(option.votes || 0),
    }));
    return {
        id: record.id,
        title: record.title,
        description: record.description || "",
        options,
        endDate: record.endDate || record.end_date,
        totalVotes: Number(record.totalVotes ?? options.reduce((sum: number, option: { votes: number }) => sum + option.votes, 0)),
        status: record.status || "active",
        category: record.category || "community",
        createdAt: record.createdAt || record.created_at || new Date().toISOString(),
    };
}

function loadDemoPolls() {
    if (typeof window === "undefined") return demoPolls;
    try {
        const saved = JSON.parse(window.localStorage.getItem(demoStorageKey) || "[]") as Poll[];
        return [...saved, ...demoPolls];
    } catch {
        return demoPolls;
    }
}

function saveDemoPoll(poll: Poll) {
    if (typeof window === "undefined") return;
    const existing = JSON.parse(window.localStorage.getItem(demoStorageKey) || "[]") as Poll[];
    window.localStorage.setItem(demoStorageKey, JSON.stringify([poll, ...existing].slice(0, 20)));
}

function saveDemoChatPollAnnouncement(poll: Poll) {
    if (typeof window === "undefined") return;
    const existing = JSON.parse(window.localStorage.getItem(demoChatStorageKey) || "[]");
    const message = {
        id: `demo-poll-chat-${poll.id}`,
        sender_id: "demo-admin",
        content: [
            `Nueva votacion: ${poll.title}`,
            "",
            poll.description,
            "",
            `Cierre: ${new Date(poll.endDate).toLocaleDateString("es-CL")}`,
            "Vota en Convive Connect > Votaciones.",
        ].join("\n"),
        created_at: new Date().toISOString(),
        profiles: { name: "Admin Demo" },
    };
    window.localStorage.setItem(demoChatStorageKey, JSON.stringify([message, ...existing].slice(0, 20)));
}

export function PollManager() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [polls, setPolls] = useState<Poll[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isPublishing, setIsPublishing] = useState(false);
    const [form, setForm] = useState<PollFormState>(() => defaultForm());
    const [deliverySummary, setDeliverySummary] = useState<DeliverySummary | null>(null);

    const isDemoUser = user?.email.toLowerCase().endsWith("@demo.com") ?? false;

    useEffect(() => {
        const loadPolls = async () => {
            setIsLoading(true);
            try {
                if (isDemoUser) {
                    setPolls(loadDemoPolls());
                    return;
                }

                const data = await PollService.getAll();
                setPolls((data || []).map(mapPollRecord));
            } catch (err) {
                console.error("Error loading polls:", err);
                setPolls([]);
            } finally {
                setIsLoading(false);
            }
        };
        loadPolls();
    }, [isDemoUser]);

    const stats = useMemo(() => {
        const active = polls.filter(poll => poll.status === "active");
        const closingSoon = active.filter(poll => {
            const daysLeft = Math.ceil((new Date(poll.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            return daysLeft <= 3;
        }).length;
        const totalVotes = polls.reduce((sum, poll) => sum + poll.totalVotes, 0);
        return { active: active.length, closingSoon, totalVotes };
    }, [polls]);

    const updateOption = (index: number, value: string) => {
        setForm(prev => ({
            ...prev,
            options: prev.options.map((option, currentIndex) => currentIndex === index ? value : option),
        }));
    };

    const removeOption = (index: number) => {
        setForm(prev => ({
            ...prev,
            options: prev.options.filter((_, currentIndex) => currentIndex !== index),
        }));
    };

    const addOption = () => {
        setForm(prev => ({ ...prev, options: [...prev.options, ""] }));
    };

    const resetForm = () => {
        setForm(defaultForm());
    };

    const validateForm = () => {
        const cleanOptions = form.options.map(option => option.trim()).filter(Boolean);
        if (!form.title.trim() || !form.description.trim() || !form.endDate) {
            return "Completa titulo, descripcion y fecha de cierre.";
        }
        if (cleanOptions.length < 2) {
            return "Agrega al menos dos opciones de voto.";
        }
        return null;
    };

    const handleCreatePoll = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!user) return;

        const validationError = validateForm();
        if (validationError) {
            toast({ title: "Faltan datos", description: validationError, variant: "destructive" });
            return;
        }

        const options = form.options.map(option => option.trim()).filter(Boolean);
        setIsPublishing(true);
        setDeliverySummary(null);

        try {
            if (isDemoUser) {
                const createdPoll: Poll = {
                    id: `demo-admin-poll-${Date.now()}`,
                    title: form.title.trim(),
                    description: form.description.trim(),
                    category: form.category,
                    endDate: new Date(form.endDate).toISOString(),
                    totalVotes: 0,
                    status: "active",
                    options: options.map((text, index) => ({ id: `demo-option-${Date.now()}-${index}`, text, votes: 0 })),
                    createdAt: new Date().toISOString(),
                };
                saveDemoPoll(createdPoll);
                if (form.sendChat) saveDemoChatPollAnnouncement(createdPoll);
                setPolls([createdPoll, ...polls]);
                setDeliverySummary({
                    mode: "demo",
                    title: createdPoll.title,
                    chatSent: form.sendChat,
                    notificationsSent: form.sendNotifications ? 18 : 0,
                    whatsappSent: form.sendWhatsapp ? 12 : 0,
                    whatsappSkipped: form.sendWhatsapp ? 6 : 0,
                    whatsappFailed: 0,
                    whatsappConfigured: true,
                });
                resetForm();
                toast({ title: "Votacion demo publicada", description: "Quedo visible en el gestor y el envio fue simulado.", variant: "success" });
                return;
            }

            const response = await fetch("/api/polls", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: form.title,
                    description: form.description,
                    category: form.category,
                    end_date: new Date(form.endDate).toISOString(),
                    options,
                    channels: {
                        chat: form.sendChat,
                        notifications: form.sendNotifications,
                        whatsapp: form.sendWhatsapp,
                    },
                }),
            });

            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(result.error || "No se pudo publicar la votacion");
            }

            const createdPoll = mapPollRecord({ ...result.poll, options: result.options });
            setPolls([createdPoll, ...polls]);
            setDeliverySummary({
                mode: "real",
                title: createdPoll.title,
                chatSent: Boolean(result.delivery?.chat?.sent),
                notificationsSent: Number(result.delivery?.notifications?.sent || 0),
                whatsappSent: Number(result.delivery?.whatsapp?.sent || 0),
                whatsappSkipped: Number(result.delivery?.whatsapp?.skipped || 0),
                whatsappFailed: Number(result.delivery?.whatsapp?.failed || 0),
                whatsappConfigured: Boolean(result.delivery?.whatsapp?.configured),
            });
            resetForm();
            toast({ title: "Votacion publicada", description: "La consulta quedo disponible y se ejecuto la distribucion.", variant: "success" });
        } catch (error) {
            console.error("Error creating poll:", error);
            toast({
                title: "No se pudo publicar",
                description: error instanceof Error ? error.message : "Hubo un problema al crear la consulta.",
                variant: "destructive",
            });
        } finally {
            setIsPublishing(false);
        }
    };

    return (
        <div className="space-y-8">
            <section className="grid gap-4 md:grid-cols-3">
                <StatCard icon={<Vote className="h-5 w-5" />} label="Consultas activas" value={stats.active} helper="Disponibles para votar" />
                <StatCard icon={<Clock className="h-5 w-5" />} label="Cierran pronto" value={stats.closingSoon} helper="En los proximos 3 dias" />
                <StatCard icon={<BarChart3 className="h-5 w-5" />} label="Votos registrados" value={stats.totalVotes} helper="Historico en el modulo" dark />
            </section>

            <section className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)]">
                <form id="crear-votacion" onSubmit={handleCreatePoll} className="min-w-0 rounded-lg border border-subtle bg-surface shadow-sm">
                    <div className="border-b border-subtle p-5">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                                <Plus className="h-5 w-5" />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold cc-text-primary">Nueva votacion</h2>
                                <p className="text-sm cc-text-secondary">Crea la consulta y decide por que canales enviarla.</p>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-5 p-5">
                        <Field label="Titulo">
                            <Input
                                value={form.title}
                                onChange={event => setForm({ ...form, title: event.target.value })}
                                placeholder="Ej: Aprobacion presupuesto ascensor Torre B"
                                className="rounded-md"
                            />
                        </Field>

                        <Field label="Descripcion para residentes">
                            <textarea
                                value={form.description}
                                onChange={event => setForm({ ...form, description: event.target.value })}
                                placeholder="Explica que se vota, por que importa y que pasa si se aprueba."
                                className="min-h-28 w-full resize-none rounded-md border border-subtle bg-surface px-4 py-3 text-sm outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                            />
                        </Field>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="Categoria">
                                <select
                                    value={form.category}
                                    onChange={event => setForm({ ...form, category: event.target.value as Poll["category"] })}
                                    className="h-11 w-full rounded-md border border-subtle bg-surface px-3 text-sm font-medium cc-text-primary outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                                >
                                    <option value="community">Comunidad</option>
                                    <option value="maintenance">Mantencion</option>
                                    <option value="rules">Reglamento</option>
                                    <option value="other">Otro</option>
                                </select>
                            </Field>
                            <Field label="Fecha de cierre">
                                <Input
                                    type="date"
                                    value={form.endDate}
                                    onChange={event => setForm({ ...form, endDate: event.target.value })}
                                    className="rounded-md"
                                />
                            </Field>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between gap-3">
                                <p className="text-xs font-bold uppercase tracking-[0.12em] cc-text-secondary">Opciones de voto</p>
                                <button type="button" onClick={addOption} className="text-xs font-semibold text-brand-600 hover:text-brand-700">
                                    Agregar opcion
                                </button>
                            </div>
                            {form.options.map((option, index) => (
                                <div key={index} className="flex min-w-0 gap-2">
                                    <Input
                                        value={option}
                                        onChange={event => updateOption(index, event.target.value)}
                                        placeholder={`Opcion ${index + 1}`}
                                        className="min-w-0 rounded-md"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => removeOption(index)}
                                        disabled={form.options.length <= 2}
                                        className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-subtle text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                                        title="Eliminar opcion"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            ))}
                        </div>

                        <div className="rounded-lg border border-subtle bg-canvas p-4">
                            <p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] cc-text-secondary">Canales de envio</p>
                            <ChannelToggle
                                checked={form.sendChat}
                                onChange={checked => setForm({ ...form, sendChat: checked })}
                                icon={<MessageCircle className="h-4 w-4" />}
                                label="Chat general de la aplicacion"
                                helper="Publica un mensaje visible para la comunidad."
                            />
                            <ChannelToggle
                                checked={form.sendNotifications}
                                onChange={checked => setForm({ ...form, sendNotifications: checked })}
                                icon={<Bell className="h-4 w-4" />}
                                label="Notificacion in-app"
                                helper="Crea una alerta para cada residente."
                            />
                            <ChannelToggle
                                checked={form.sendWhatsapp}
                                onChange={checked => setForm({ ...form, sendWhatsapp: checked })}
                                icon={<Smartphone className="h-4 w-4" />}
                                label="WhatsApp"
                                helper="Envia a residentes con telefono y WhatsApp habilitado."
                            />
                        </div>

                        <div className="rounded-lg border border-warning-border bg-warning-bg p-4">
                            <div className="flex gap-3">
                                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-warning-fg" />
                                <p className="text-sm leading-6 text-amber-900">
                                    Revisa el texto antes de enviar. Si activas WhatsApp, se mandara solo a residentes que hayan habilitado ese canal y tengan telefono valido.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 border-t border-subtle p-5 sm:flex-row">
                        <Button type="button" variant="outline" className="sm:flex-1" onClick={resetForm} disabled={isPublishing}>
                            Limpiar
                        </Button>
                        <Button type="submit" className="sm:flex-[2]" disabled={isPublishing}>
                            <Send className="h-4 w-4" />
                            {isPublishing ? "Publicando..." : "Publicar y enviar"}
                        </Button>
                    </div>
                </form>

                <div className="min-w-0 space-y-5">
                    {deliverySummary && (
                        <DeliverySummaryCard summary={deliverySummary} />
                    )}

                    <section id="votaciones-publicadas" className="overflow-hidden rounded-lg border border-subtle bg-surface shadow-sm">
                        <div className="flex flex-col gap-3 border-b border-subtle p-5 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h2 className="text-lg font-semibold cc-text-primary">Votaciones publicadas</h2>
                                <p className="text-sm cc-text-secondary">Seguimiento de consultas, participacion y fecha de cierre.</p>
                            </div>
                            <div className="inline-flex items-center gap-2 rounded-md border border-subtle bg-canvas px-3 py-2 text-xs font-semibold cc-text-secondary">
                                <CalendarDays className="h-4 w-4" />
                                Ordenadas por publicacion
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[760px] text-sm">
                                <thead className="border-b border-subtle bg-canvas text-xs font-bold uppercase tracking-[0.08em] cc-text-secondary">
                                    <tr>
                                        <th className="px-5 py-4 text-left">Votacion</th>
                                        <th className="px-5 py-4 text-left">Opciones</th>
                                        <th className="px-5 py-4 text-left">Participacion</th>
                                        <th className="px-5 py-4 text-left">Estado</th>
                                        <th className="px-5 py-4 text-left">Cierre</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-subtle">
                                    {isLoading ? (
                                        <tr>
                                            <td colSpan={5} className="px-5 py-12 text-center cc-text-secondary">Cargando consultas...</td>
                                        </tr>
                                    ) : polls.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-5 py-12 text-center cc-text-secondary">Aun no hay votaciones publicadas.</td>
                                        </tr>
                                    ) : polls.map((poll) => {
                                        const daysLeft = Math.max(0, Math.ceil((new Date(poll.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
                                        return (
                                            <tr key={poll.id} className="hover:bg-elevated/50">
                                                <td className="px-5 py-5">
                                                    <div className="flex items-start gap-3">
                                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                                                            <Vote className="h-5 w-5" />
                                                        </div>
                                                        <div>
                                                            <p className="font-semibold cc-text-primary">{poll.title}</p>
                                                            <p className="mt-1 line-clamp-2 max-w-md text-xs cc-text-secondary">{poll.description}</p>
                                                            <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.12em] text-brand-600">{categoryLabels[poll.category]}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-5">
                                                    <div className="flex flex-wrap gap-2">
                                                        {poll.options.slice(0, 3).map(option => (
                                                            <span key={option.id} className="rounded-md border border-subtle bg-canvas px-2.5 py-1 text-xs font-semibold cc-text-secondary">
                                                                {option.text}
                                                            </span>
                                                        ))}
                                                        {poll.options.length > 3 && (
                                                            <span className="rounded-md bg-elevated px-2.5 py-1 text-xs font-semibold cc-text-secondary">+{poll.options.length - 3}</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-5 py-5">
                                                    <p className="font-semibold cc-text-primary">{poll.totalVotes} votos</p>
                                                    <div className="mt-2 h-1.5 w-28 overflow-hidden rounded-full bg-elevated">
                                                        <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, (poll.totalVotes / 80) * 100)}%` }} />
                                                    </div>
                                                </td>
                                                <td className="px-5 py-5">
                                                    <span className={`rounded-md px-2.5 py-1 text-xs font-bold uppercase tracking-[0.08em] ${poll.status === "active" ? "bg-success-bg text-success-fg" : "bg-elevated cc-text-secondary"}`}>
                                                        {poll.status === "active" ? "Activa" : "Cerrada"}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-5 font-semibold cc-text-secondary">{daysLeft} dias</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </div>
            </section>
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block min-w-0 space-y-2">
            <span className="text-xs font-bold uppercase tracking-[0.12em] cc-text-secondary">{label}</span>
            {children}
        </label>
    );
}

function StatCard({ icon, label, value, helper, dark = false }: { icon: React.ReactNode; label: string; value: number; helper: string; dark?: boolean }) {
    return (
        <article className={`rounded-lg border p-5 shadow-sm ${dark ? "border-slate-900 bg-slate-950 text-white" : "border-subtle bg-surface"}`}>
            <div className="flex items-center justify-between">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${dark ? "bg-white/10 text-blue-300" : "bg-brand-50 text-brand-600"}`}>
                    {icon}
                </div>
                {dark && <CheckCircle2 className="h-5 w-5 text-emerald-400" />}
            </div>
            <p className={`mt-5 text-3xl font-semibold ${dark ? "text-white" : "cc-text-primary"}`}>{value}</p>
            <p className={`mt-1 text-xs font-bold uppercase tracking-[0.12em] ${dark ? "text-slate-400" : "cc-text-secondary"}`}>{label}</p>
            <p className={`mt-2 text-sm ${dark ? "text-slate-300" : "cc-text-secondary"}`}>{helper}</p>
        </article>
    );
}

function ChannelToggle({
    checked,
    onChange,
    icon,
    label,
    helper,
}: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    icon: React.ReactNode;
    label: string;
    helper: string;
}) {
    return (
        <label className="flex cursor-pointer items-start gap-3 border-t border-subtle py-3 first:border-t-0 first:pt-0 last:pb-0">
            <input
                type="checkbox"
                checked={checked}
                onChange={event => onChange(event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-subtle accent-brand-500"
            />
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface cc-text-secondary">{icon}</span>
            <span>
                <span className="block text-sm font-semibold cc-text-primary">{label}</span>
                <span className="mt-0.5 block text-xs leading-5 cc-text-secondary">{helper}</span>
            </span>
        </label>
    );
}

function DeliverySummaryCard({ summary }: { summary: DeliverySummary }) {
    return (
        <section className="rounded-lg border border-success-border bg-success-bg p-5 shadow-sm">
            <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
                    <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                    <h3 className="font-semibold text-success-fg">
                        {summary.mode === "demo" ? "Envio simulado" : "Votacion enviada"}
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-emerald-900">{summary.title}</p>
                </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-md bg-white/70 p-3">
                    <p className="text-xs font-bold uppercase tracking-[0.1em] cc-text-secondary">Chat app</p>
                    <p className="mt-1 text-sm font-semibold cc-text-primary">{summary.chatSent ? "Publicado" : "No enviado"}</p>
                </div>
                <div className="rounded-md bg-white/70 p-3">
                    <p className="text-xs font-bold uppercase tracking-[0.1em] cc-text-secondary">Notificaciones</p>
                    <p className="mt-1 text-sm font-semibold cc-text-primary">{summary.notificationsSent}</p>
                </div>
                <div className="rounded-md bg-white/70 p-3">
                    <p className="text-xs font-bold uppercase tracking-[0.1em] cc-text-secondary">WhatsApp</p>
                    <p className="mt-1 text-sm font-semibold cc-text-primary">
                        {summary.whatsappConfigured ? `${summary.whatsappSent} enviados` : "Sin configurar"}
                    </p>
                    {(summary.whatsappSkipped > 0 || summary.whatsappFailed > 0) && (
                        <p className="mt-1 text-xs cc-text-secondary">{summary.whatsappSkipped} omitidos, {summary.whatsappFailed} fallidos</p>
                    )}
                </div>
            </div>
        </section>
    );
}
