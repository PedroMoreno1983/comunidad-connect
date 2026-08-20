"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Clipboard, MessageCircle, RefreshCw, Send, Shield, Users, XCircle } from "lucide-react";
import { DisplayHeading, Eyebrow } from "@/components/cc/Eyebrow";
import { Button } from "@/components/cc/Button";
import { Tag } from "@/components/cc/Tag";
import { useToast } from "@/components/ui/Toast";

type WhatsAppStatus = {
    configured: boolean;
    webhookConfigured: boolean;
    accountSidMasked: string;
    fromMasked: string;
    webhookUrl: string;
    requiredEnv: Record<string, boolean>;
    setup?: {
        provider: string;
        inboundMethod: string;
        inboundContentType: string;
        inboundPath: string;
        outboundPath: string;
    };
};

type BroadcastResult = {
    sent: number;
    skipped: number;
    failed: number;
    recipients: number;
    truncated?: boolean;
    detail?: string;
    failures?: { userId: string; reason: string }[];
};

/**
 * Envio de un aviso a toda la comunidad.
 *
 * El aviso sale como plantilla aprobada, asi que solo viaja el titulo; el
 * cuerpo largo queda en la plataforma. Antes de enviar se consulta a cuantos
 * llegaria, porque son mensajes reales y no hay forma de deshacerlos.
 */
function BroadcastPanel() {
    const { toast } = useToast();
    const [title, setTitle] = useState("");
    const [body, setBody] = useState("");
    const [audience, setAudience] = useState<number | null>(null);
    const [checking, setChecking] = useState(false);
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState<BroadcastResult | null>(null);

    const checkAudience = async () => {
        setChecking(true);
        setResult(null);
        try {
            const response = await fetch("/api/whatsapp/broadcast", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: title.trim() || "consulta", dryRun: true }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "No se pudo consultar.");
            setAudience(data.recipients);
        } catch (error: unknown) {
            toast({
                title: "No se pudo consultar",
                description: error instanceof Error ? error.message : "Intenta nuevamente.",
                variant: "destructive",
            });
        } finally {
            setChecking(false);
        }
    };

    const send = async () => {
        if (!title.trim()) {
            toast({ title: "Falta el titulo", description: "Es lo unico que viaja en el mensaje.", variant: "destructive" });
            return;
        }
        const confirmed = window.confirm(
            `Se enviara un WhatsApp real${audience !== null ? ` a ${audience} residente(s)` : ""}. Esto no se puede deshacer. Continuar?`,
        );
        if (!confirmed) return;

        setSending(true);
        try {
            const response = await fetch("/api/whatsapp/broadcast", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: title.trim(), body: body.trim() }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "No se pudo enviar.");
            setResult(data);
            toast({
                title: "Aviso procesado",
                description: `${data.sent} enviado(s), ${data.skipped} omitido(s), ${data.failed} con error.`,
                variant: data.failed > 0 ? "destructive" : "success",
            });
        } catch (error: unknown) {
            toast({
                title: "No se pudo enviar",
                description: error instanceof Error ? error.message : "Intenta nuevamente.",
                variant: "destructive",
            });
        } finally {
            setSending(false);
        }
    };

    const field = "w-full rounded-lg border border-subtle bg-surface px-3 py-2.5 text-sm cc-text-primary";

    return (
        <div className="rounded-xl border border-subtle bg-surface p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                    <Eyebrow>Comunicacion</Eyebrow>
                    <h2 className="mt-1 text-xl font-semibold cc-text-primary">Aviso a la comunidad</h2>
                </div>
                <Tag tone="amber" solid>Mensajes reales</Tag>
            </div>

            <div className="space-y-3">
                <label className="block">
                    <span className="mb-1.5 block text-[11px] uppercase tracking-wider cc-text-tertiary">
                        Titulo &middot; max. 120 caracteres ({title.length})
                    </span>
                    <input
                        className={field}
                        maxLength={120}
                        placeholder="Corte de agua programado para el martes"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                    />
                </label>

                <label className="block">
                    <span className="mb-1.5 block text-[11px] uppercase tracking-wider cc-text-tertiary">
                        Detalle (queda en la plataforma, no viaja por WhatsApp)
                    </span>
                    <textarea
                        className={`${field} min-h-[80px]`}
                        placeholder="El corte va de 09:00 a 14:00 y afecta a las torres A y B."
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                    />
                </label>
            </div>

            <p className="mt-3 text-xs leading-6 cc-text-secondary">
                Solo reciben el aviso los residentes con WhatsApp activado y telefono cargado.
                El mensaje sale como plantilla aprobada por Meta, asi que unicamente viaja el titulo.
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-3">
                <Button type="button" variant="ghost" onClick={checkAudience} disabled={checking || sending}>
                    <Users className="h-4 w-4" />
                    {checking ? "Consultando..." : "A cuantos llega?"}
                </Button>
                {audience !== null && (
                    <Tag tone={audience > 0 ? "sage" : "neutral"} solid>
                        {audience} destinatario(s)
                    </Tag>
                )}
                <Button
                    type="button"
                    variant="copper"
                    className="ml-auto"
                    onClick={send}
                    disabled={sending || !title.trim()}
                >
                    <Send className="h-4 w-4" />
                    {sending ? "Enviando..." : "Enviar aviso"}
                </Button>
            </div>

            {result && (
                <div className="mt-5 rounded-lg border border-subtle bg-elevated/50 p-4 text-sm cc-text-secondary">
                    <p className="font-semibold cc-text-primary">
                        {result.sent} enviado(s) &middot; {result.skipped} omitido(s) &middot; {result.failed} con error
                    </p>
                    {result.detail && <p className="mt-1">{result.detail}</p>}
                    {result.truncated && (
                        <p className="mt-1">
                            Se corto en el tope por envio. Repite el aviso para alcanzar al resto.
                        </p>
                    )}
                    {result.failures?.length ? (
                        <ul className="mt-2 space-y-1 font-mono text-xs">
                            {result.failures.map((f) => (
                                <li key={f.userId}>{f.userId.slice(0, 8)}... &rarr; {f.reason}</li>
                            ))}
                        </ul>
                    ) : null}
                </div>
            )}
        </div>
    );
}

export default function AdminWhatsAppPage() {
    const { toast } = useToast();
    const [status, setStatus] = useState<WhatsAppStatus | null>(null);
    const [loading, setLoading] = useState(true);

    const loadStatus = async () => {
        setLoading(true);
        const response = await fetch("/api/whatsapp/status", { cache: "no-store" });
        const data = await response.json();
        setStatus(data);
        setLoading(false);
    };

    useEffect(() => {
        let mounted = true;

        async function fetchInitialStatus() {
            const response = await fetch("/api/whatsapp/status", { cache: "no-store" });
            const data = await response.json();
            if (!mounted) return;
            setStatus(data);
            setLoading(false);
        }

        fetchInitialStatus();

        return () => {
            mounted = false;
        };
    }, []);

    const copyWebhook = async () => {
        if (!status?.webhookUrl) return;
        await navigator.clipboard.writeText(status.webhookUrl);
        toast({ title: "Webhook copiado", description: "Pegalo en Twilio como incoming webhook POST.", variant: "success" });
    };

    return (
        <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <Eyebrow>Canal operativo</Eyebrow>
                    <DisplayHeading size={40}>
                        WhatsApp <em className="text-italic-serif text-brand-600">CoCo</em>.
                    </DisplayHeading>
                    <p className="mt-3 max-w-2xl text-sm leading-7 cc-text-secondary">
                        Configura Twilio para que residentes reciban notificaciones y conversen con CoCo sin descargar otra app.
                    </p>
                </div>
                <Button type="button" variant="ghost" onClick={loadStatus} disabled={loading}>
                    <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                    Actualizar estado
                </Button>
            </div>

            <section className="grid gap-4 md:grid-cols-3">
                <StatusCard label="Twilio outbound" ok={Boolean(status?.configured)} detail={status?.configured ? "Credenciales y numero configurados" : "Faltan variables Twilio"} />
                <StatusCard label="Webhook seguro" ok={Boolean(status?.webhookConfigured)} detail={status?.webhookConfigured ? "WHATSAPP_WEBHOOK_SECRET presente" : "Configura secreto interno"} />
                <StatusCard label="Numero origen" ok={Boolean(status?.fromMasked)} detail={status?.fromMasked || "Sin TWILIO_WHATSAPP_FROM"} />
            </section>

            <BroadcastPanel />

            <section className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
                <div className="rounded-xl border border-subtle bg-surface p-6 shadow-sm">
                    <div className="mb-5 flex items-center justify-between gap-3">
                        <div>
                            <Eyebrow>Twilio console</Eyebrow>
                            <h2 className="mt-1 text-xl font-semibold cc-text-primary">Incoming webhook</h2>
                        </div>
                        <Tag tone="sage" solid>POST</Tag>
                    </div>
                    <p className="text-sm leading-7 cc-text-secondary">
                        En el Sandbox o numero WhatsApp aprobado de Twilio, usa este endpoint como URL de recepcion de mensajes.
                    </p>
                    <div className="mt-5 rounded-lg border border-subtle bg-elevated/50 p-4 font-mono text-xs cc-text-secondary">
                        {status?.webhookUrl || "Cargando..."}
                    </div>
                    <Button type="button" variant="copper" className="mt-4" onClick={copyWebhook} disabled={!status?.webhookUrl}>
                        Copiar webhook <Clipboard className="h-4 w-4" />
                    </Button>
                </div>

                <div className="rounded-xl border border-subtle p-6 text-white shadow-sm" style={{ background: "var(--cc-carbon)" }}>
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10">
                            <MessageCircle className="h-5 w-5 text-brand-300" />
                        </div>
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50">Checklist</p>
                            <h2 className="text-xl font-semibold">Variables requeridas</h2>
                        </div>
                    </div>
                    <div className="mt-6 space-y-3">
                        {Object.entries(status?.requiredEnv || {}).map(([key, ok]) => (
                            <div key={key} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3">
                                <span className="font-mono text-xs text-white/75">{key}</span>
                                {ok ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <XCircle className="h-4 w-4 text-rose-300" />}
                            </div>
                        ))}
                    </div>
                    <div className="mt-6 rounded-lg border border-white/10 bg-white/5 p-4">
                        <p className="flex items-start gap-2 text-xs leading-6 text-white/70">
                            <Shield className="mt-0.5 h-4 w-4 shrink-0 text-brand-300" />
                            El webhook entrante autentica al residente por telefono con opt-in y unidad. Las notificaciones salientes usan el secreto interno.
                        </p>
                    </div>
                </div>
            </section>
        </div>
    );
}

function StatusCard({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
    return (
        <div className="rounded-xl border border-subtle bg-surface p-5 shadow-sm">
            <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] cc-text-tertiary">{label}</p>
                {ok ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <XCircle className="h-5 w-5 text-rose-500" />}
            </div>
            <p className="mt-3 text-sm font-semibold cc-text-primary">{ok ? "Listo" : "Pendiente"}</p>
            <p className="mt-1 text-xs cc-text-secondary">{detail}</p>
        </div>
    );
}
