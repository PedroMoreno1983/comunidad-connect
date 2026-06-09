"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/authContext";
import { AnnouncementsService } from "@/lib/api";
import { Announcement } from "@/lib/types";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/cc/Button";
import { DisplayHeading, Eyebrow } from "@/components/cc/Eyebrow";
import { Tag } from "@/components/cc/Tag";
import { CheckCircle2, Send, Users } from "lucide-react";

type Priority = 'info' | 'alert' | 'event';
type AnnouncementRow = {
    id: string;
    title: string;
    content: string;
    author_name?: string | null;
    priority: Priority;
    created_at: string;
};

export default function ComunicacionesPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);

    // Form state
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [priority, setPriority] = useState<Priority>("info");
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Channels selection
    const [sendApp, setSendApp] = useState(true);
    const [sendMail, setSendMail] = useState(true);
    const [sendWhatsApp, setSendWhatsApp] = useState(false);

    useEffect(() => {
        const fetch = async () => {
            try {
                const data = await AnnouncementsService.getAnnouncements();
                const mapped = (data as AnnouncementRow[]).map((ann): Announcement => ({
                    id: ann.id,
                    title: ann.title,
                    content: ann.content,
                    author: ann.author_name || "Administración",
                    priority: ann.priority,
                    createdAt: ann.created_at,
                }));
                setAnnouncements(mapped);
            } catch {
                toast({ title: "Error de conexión", description: "No se pudieron cargar los comunicados.", variant: "destructive" });
            }
        };
        fetch();
    }, [toast]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || user.role === "resident") {
            toast({ title: "Acceso Denegado", description: "No tienes permisos para publicar avisos.", variant: "destructive" });
            return;
        }
        if (!title.trim() || !content.trim()) {
            toast({ title: "Faltan datos", description: "Por favor, escribe un título y contenido.", variant: "destructive" });
            return;
        }

        setIsSubmitting(true);
        try {
            const data = await AnnouncementsService.createAnnouncement({
                title: title.trim(),
                content: content.trim(),
                priority,
                author_id: user.id,
                author_name: user.name || "Administración",
            });

            const newAnn: Announcement = {
                id: data.id,
                title: data.title,
                content: data.content,
                author: data.author_name || "Administración",
                priority: data.priority,
                createdAt: data.created_at,
            };

            setAnnouncements([newAnn, ...announcements]);
            setTitle("");
            setContent("");
            setPriority("info");
            toast({ title: "Aviso publicado", description: "La comunicación quedó registrada para la comunidad.", variant: "success" });
        } catch {
            toast({ title: "Error", description: "Hubo un problema al publicar el aviso.", variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const getPriorityLabel = (priority: string) => {
        switch (priority) {
            case 'alert': return 'Urgente';
            case 'event': return 'Mantención';
            default: return 'Información';
        }
    };

    const getPriorityTone = (priority: string): "rose" | "amber" | "sage" | "plum" | "copper" | "neutral" => {
        switch (priority) {
            case 'alert': return 'rose';
            case 'event': return 'amber';
            default: return 'sage';
        }
    };

    const getPriorityLeftColor = (priority: string) => {
        switch (priority) {
            case 'alert': return 'var(--cc-rose)';
            case 'event': return 'var(--cc-amber)';
            default: return 'var(--cc-sage)';
        }
    };


    return (
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 space-y-8">
            {/* Header */}
            <div className="border-b pb-6" style={{ borderColor: "var(--cc-line)" }}>
                <Eyebrow>Operaciones</Eyebrow>
                <DisplayHeading size={36} className="mt-2">
                    Publicar <em className="text-italic-serif text-brand-600">comunicación</em>
                </DisplayHeading>
                <p className="mt-2 text-sm cc-text-secondary">
                    Redacta anuncios oficiales y notifica a los residentes por múltiples canales simultáneamente.
                </p>
            </div>

            {/* 2-Column Section */}
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
                
                {/* Left Column: Form */}
                <section className="rounded-xl border bg-paper p-6 shadow-sm space-y-6" style={{ borderColor: "var(--cc-line)" }}>
                    <h3 className="text-lg font-bold cc-text-primary">Detalles del Comunicado</h3>
                    
                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Category Chips with semantic tints */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold uppercase tracking-wider cc-text-tertiary">Categoría / Prioridad</label>
                            <div className="flex gap-2">
                                {(['info', 'event', 'alert'] as Priority[]).map(p => {
                                    const isSelected = priority === p;
                                    return (
                                        <button
                                            key={p}
                                            type="button"
                                            onClick={() => setPriority(p)}
                                            className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-all ${
                                                isSelected 
                                                    ? 'bg-ink text-paper border-ink shadow-sm'
                                                    : 'bg-paper-warm text-slate-600 border-subtle hover:border-copper'
                                            }`}
                                        >
                                            {getPriorityLabel(p)}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Title Input: Editorial style label uppercase */}
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-wider cc-text-tertiary">Título del Aviso *</label>
                            <input
                                required
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="Ej: Corte de agua programado"
                                className="w-full h-11 px-4 rounded-xl border bg-paper-warm text-sm font-medium cc-text-primary outline-none transition-all focus:border-copper focus:ring-4 focus:ring-[rgba(181,102,78,0.16)]"
                                style={{ borderColor: "var(--cc-line)" }}
                            />
                        </div>

                        {/* Message Textarea: Editorial style label uppercase */}
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-wider cc-text-tertiary">Mensaje del Comunicado *</label>
                            <textarea
                                required
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                placeholder="Escribe el cuerpo del aviso..."
                                className="w-full min-h-[140px] px-4 py-3 rounded-xl border bg-paper-warm text-sm font-medium cc-text-primary outline-none transition-all focus:border-copper focus:ring-4 focus:ring-[rgba(181,102,78,0.16)]"
                                style={{ borderColor: "var(--cc-line)" }}
                            />
                        </div>

                        {/* Channel Selection */}
                        <div className="space-y-2 pt-2 border-t border-subtle">
                            <label className="text-[10px] font-bold uppercase tracking-wider cc-text-tertiary">Canales de Envío</label>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                {[
                                    { label: "App Push", checked: sendApp, onChange: setSendApp },
                                    { label: "Email", checked: sendMail, onChange: setSendMail },
                                    { label: "WhatsApp", checked: sendWhatsApp, onChange: setSendWhatsApp }
                                ].map(ch => (
                                    <label key={ch.label} className="flex items-center gap-2 p-3 rounded-lg border bg-paper-warm cursor-pointer hover:bg-paper transition-colors text-xs font-semibold cc-text-secondary select-none" style={{ borderColor: "var(--cc-line)" }}>
                                        <input
                                            type="checkbox"
                                            checked={ch.checked}
                                            onChange={(e) => ch.onChange(e.target.checked)}
                                            className="h-4 w-4 rounded border-subtle text-brand-600 focus:ring-brand-500"
                                        />
                                        {ch.label}
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Submit */}
                        <div className="pt-4">
                            <Button
                                type="submit"
                                variant="copper"
                                block
                                disabled={isSubmitting || !title.trim() || !content.trim()}
                            >
                                <Send className="h-4 w-4" />
                                {isSubmitting ? "Publicando..." : "Publicar Anuncio"}
                            </Button>
                        </div>
                    </form>
                </section>

                {/* Right Column: Live Preview & Reach */}
                <section className="space-y-6">
                    {/* Live Preview Card */}
                    <div className="rounded-xl border bg-paper p-6 shadow-sm space-y-4" style={{ borderColor: "var(--cc-line)" }}>
                        <div className="flex items-center justify-between border-b border-subtle pb-3">
                            <h3 className="text-sm font-bold uppercase tracking-wider cc-text-tertiary">Vista Previa</h3>
                            <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-sage" style={{ background: "var(--cc-sage-tint)" }}>Tiempo real</span>
                        </div>
                        
                        <article 
                            className="rounded-xl border bg-paper-warm p-5 relative overflow-hidden transition-all duration-300"
                            style={{ borderLeft: `4px solid ${getPriorityLeftColor(priority)}` }}
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <h4 className="text-base font-bold cc-text-primary truncate">
                                        {title || "Título del Comunicado"}
                                    </h4>
                                    <p className="text-[10px] cc-text-tertiary mt-1">
                                        {user?.name || "Administrador"} • Hace un momento
                                    </p>
                                </div>
                                <Tag tone={getPriorityTone(priority)} solid>
                                    {getPriorityLabel(priority)}
                                </Tag>
                            </div>
                            <p className="mt-4 text-xs cc-text-secondary leading-relaxed whitespace-pre-wrap">
                                {content || "Escribe el cuerpo del aviso en el formulario de la izquierda para ver cómo se renderizará para los vecinos."}
                            </p>
                        </article>
                    </div>

                    {/* Reach Card */}
                    <div className="bg-ink text-paper rounded-xl p-6 shadow-sm space-y-4">
                        <div className="flex items-center justify-between border-b border-white/10 pb-3">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-white/55">Canales seleccionados</h3>
                            <Users className="h-4 w-4 text-copper-soft" />
                        </div>
                        <div className="space-y-3">
                            {[
                                { name: "App Push", status: sendApp ? "Activo" : "Deshabilitado", detail: sendApp ? "Se registrará para notificación interna" : "No se usará este canal", enabled: sendApp },
                                { name: "Email", status: sendMail ? "Activo" : "Deshabilitado", detail: sendMail ? "Listo para envío transaccional" : "No se usará este canal", enabled: sendMail },
                                { name: "WhatsApp", status: sendWhatsApp ? "Pendiente" : "Deshabilitado", detail: sendWhatsApp ? "Requiere Twilio configurado" : "No se usará este canal", enabled: sendWhatsApp }
                            ].map(channel => (
                                <div key={channel.name} className={`flex items-center justify-between p-3 rounded-lg border ${channel.enabled ? 'bg-white/5 border-white/10' : 'bg-transparent border-white/5 opacity-55'}`}>
                                    <div className="text-xs font-semibold text-slate-200">{channel.name}</div>
                                    <div className="text-right">
                                        <p className="text-sm font-bold text-white">{channel.status}</p>
                                        <p className="text-[10px] text-slate-400">{channel.detail}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            </div>

            {/* Bottom Section: Enviadas esta semana */}
            <section className="rounded-xl border bg-paper p-6 shadow-sm space-y-4" style={{ borderColor: "var(--cc-line)" }}>
                <h3 className="text-lg font-bold cc-text-primary">Enviadas esta semana</h3>
                
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-subtle text-[10px] font-bold uppercase tracking-wider cc-text-tertiary">
                                <th className="pb-3">Título</th>
                                <th className="pb-3">Fecha</th>
                                <th className="pb-3">Categoría</th>
                                <th className="pb-3 text-right">Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {announcements.map((ann) => {
                                return (
                                    <tr key={ann.id} className="border-b border-subtle/50 text-xs cc-text-secondary hover:bg-elevated/40 transition-colors">
                                        <td className="py-3.5 font-semibold cc-text-primary truncate max-w-[200px]">{ann.title}</td>
                                        <td className="py-3.5">{new Date(ann.createdAt).toLocaleDateString("es-CL")}</td>
                                        <td className="py-3.5">
                                            <Tag tone={getPriorityTone(ann.priority)}>{getPriorityLabel(ann.priority)}</Tag>
                                        </td>
                                        <td className="py-3.5 text-right font-mono font-semibold">
                                            <span className="inline-flex items-center justify-end gap-1.5 text-sage">
                                                <CheckCircle2 className="h-3.5 w-3.5" />
                                                Registrado
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                            {announcements.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="py-8 text-center text-xs cc-text-tertiary font-semibold">
                                        No se registran envíos esta semana.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}
