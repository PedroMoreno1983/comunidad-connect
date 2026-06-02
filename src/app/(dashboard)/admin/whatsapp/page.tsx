"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Clipboard, MessageCircle, RefreshCw, Shield, XCircle } from "lucide-react";
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

                <div className="rounded-xl border border-subtle bg-[#111827] p-6 text-white shadow-sm">
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
