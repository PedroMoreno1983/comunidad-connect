"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Clapperboard,
  Copy,
  Download,
  Film,
  Hash,
  Instagram,
  Loader2,
  Music2,
  Play,
  RefreshCw,
  Send,
  Sparkles,
  Timer,
} from "lucide-react";
import { clsx } from "clsx";
import type {
  InstagramConnectionSummary,
  MarketingCampaign,
  MarketingReelRecord,
  MarketingReelStatus,
  ReelAgentInput,
  ReelAudience,
  ReelTone,
} from "@/lib/types";

type DashboardResponse = {
  reel?: MarketingReelRecord;
  reels?: MarketingReelRecord[];
  campaigns?: MarketingCampaign[];
  instagram?: InstagramConnectionSummary;
  capabilities?: {
    aiScriptGeneration: boolean;
    videoRendering: boolean;
    instagramPublishing: boolean;
    cronSecretConfigured: boolean;
  };
  error?: string;
};

const AUDIENCE_OPTIONS: Array<{ value: ReelAudience; label: string }> = [
  { value: "administrators", label: "Administradores" },
  { value: "committee", label: "Comites" },
  { value: "property_managers", label: "Empresas" },
  { value: "residents", label: "Residentes" },
];

const TONE_OPTIONS: Array<{ value: ReelTone; label: string }> = [
  { value: "premium", label: "Premium" },
  { value: "urgent", label: "Dolor directo" },
  { value: "warm", label: "Humano" },
  { value: "educational", label: "Educativo" },
];

const FEATURE_OPTIONS = [
  "Agent Center",
  "Gastos comunes",
  "Reservas de amenidades",
  "Conserjeria y visitas",
  "Marketplace vecinal",
  "Comunicaciones",
  "Onboarding de edificios",
];

const DEFAULT_FORM: ReelAgentInput = {
  objective: "Generar interes y demos para ConviveConnect mostrando una operacion de edificio mas clara, auditable y moderna.",
  audience: "administrators",
  tone: "premium",
  durationSeconds: 35,
  featureFocus: "Agent Center",
  proofPoint: "acciones con permisos, confirmacion humana y auditoria",
  offer: "demo guiada para administradores y comites",
  callToAction: "Agenda una demo en conviveconnect.com",
};

const STATUS_LABELS: Record<MarketingReelStatus, string> = {
  draft: "Borrador",
  generated: "Generado",
  rendering: "Renderizando",
  rendered: "Video listo",
  approved: "Aprobado",
  scheduled: "Agendado",
  publishing: "Publicando",
  published: "Publicado",
  blocked: "Bloqueado",
  failed: "Error",
};

function statusClass(status: MarketingReelStatus) {
  if (status === "published") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "blocked" || status === "failed") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "scheduled" || status === "publishing" || status === "rendering") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-[var(--cc-line)] bg-[var(--cc-ivory)] cc-text-secondary";
}

function formatDate(value?: string | null) {
  if (!value) return "Sin fecha";
  try {
    return new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}

function buildFullScript(reel: MarketingReelRecord) {
  return reel.creativePackage.scenes
    .map(scene => `[${scene.time}] ${scene.voiceOver}`)
    .join("\n\n");
}

function captionBlock(reel: MarketingReelRecord) {
  return `${reel.caption}\n\n${reel.hashtags.join(" ")}`.trim();
}

function copyText(text: string) {
  return navigator.clipboard?.writeText(text).catch(() => undefined);
}

function downloadJson(reel: MarketingReelRecord) {
  const blob = new Blob([JSON.stringify(reel, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${reel.id}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="text-xs font-semibold uppercase tracking-[0.12em] cc-text-tertiary">{children}</label>;
}

function CopyButton({ text, label = "Copiar" }: { text: string; label?: string }) {
  return (
    <button
      type="button"
      onClick={() => copyText(text)}
      title={label}
      className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--cc-line)] bg-white px-3 text-xs font-semibold cc-text-secondary transition hover:bg-[var(--cc-ivory)]"
    >
      <Copy className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function CapabilityPill({ ready, label }: { ready: boolean; label: string }) {
  return (
    <span className={clsx(
      "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em]",
      ready ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"
    )}>
      {ready ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
      {label}
    </span>
  );
}

export default function MarketingReelsPage() {
  const [form, setForm] = useState<ReelAgentInput>(DEFAULT_FORM);
  const [reels, setReels] = useState<MarketingReelRecord[]>([]);
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
  const [selectedReelId, setSelectedReelId] = useState<string | null>(null);
  const [instagram, setInstagram] = useState<InstagramConnectionSummary>({ status: "not_connected" });
  const [capabilities, setCapabilities] = useState<DashboardResponse["capabilities"]>();
  const [scheduleByReel, setScheduleByReel] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  const selectedReel = useMemo(
    () => reels.find(reel => reel.id === selectedReelId) || reels[0] || null,
    [reels, selectedReelId]
  );

  function hydrate(data: DashboardResponse) {
    const nextReels = Array.isArray(data.reels) ? data.reels : [];
    setReels(nextReels);
    setCampaigns(Array.isArray(data.campaigns) ? data.campaigns : []);
    if (data.instagram) setInstagram(data.instagram);
    if (data.capabilities) setCapabilities(data.capabilities);
    if (data.reel) setSelectedReelId(data.reel.id);
    else if (!selectedReelId && nextReels[0]) setSelectedReelId(nextReels[0].id);
  }

  async function loadDashboard() {
    const response = await fetch("/api/marketing/reels", { cache: "no-store" });
    const data = await response.json().catch(() => ({})) as DashboardResponse;
    if (!response.ok) throw new Error(data.error || "No se pudo cargar Reels Agent.");
    hydrate(data);
  }

  useEffect(() => {
    loadDashboard().catch(err => setError(err instanceof Error ? err.message : "No se pudo cargar Reels Agent."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateForm<K extends keyof ReelAgentInput>(key: K, value: ReelAgentInput[K]) {
    setForm(current => ({ ...current, [key]: value }));
  }

  async function postAction(payload: Record<string, unknown>) {
    const response = await fetch("/api/marketing/reels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({})) as DashboardResponse;
    if (!response.ok) throw new Error(data.error || "No se pudo procesar la accion.");
    hydrate(data);
    return data.reel || null;
  }

  async function generate(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      await postAction({ action: "generate", ...form });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar el reel.");
    } finally {
      setLoading(false);
    }
  }

  async function runReelAction(action: "approve" | "render" | "publish", reelId: string) {
    setActionLoading(`${action}:${reelId}`);
    setError("");
    try {
      await postAction({ action, reelId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo procesar la accion.");
    } finally {
      setActionLoading(null);
    }
  }

  async function scheduleReel(reelId: string) {
    const scheduledAt = scheduleByReel[reelId];
    if (!scheduledAt) {
      setError("Elige fecha y hora para agendar.");
      return;
    }
    setActionLoading(`schedule:${reelId}`);
    setError("");
    try {
      await postAction({ action: "schedule", reelId, scheduledAt });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo agendar el reel.");
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="flex flex-col gap-4 border-b border-[var(--cc-line)] pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="cc-eyebrow">Marketing Agent</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal cc-text-primary md:text-4xl">
              Reels Agent
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 cc-text-secondary">
              Genera, guarda, aprueba, agenda y publica reels de ConviveConnect con estados auditables.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <CapabilityPill ready={Boolean(capabilities?.videoRendering)} label="Video MP4" />
            <CapabilityPill ready={instagram.status === "connected" || Boolean(capabilities?.instagramPublishing)} label="Instagram" />
            <CapabilityPill ready={Boolean(capabilities?.cronSecretConfigured)} label="Agenda" />
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <div className="space-y-4">
            <form onSubmit={generate} className="rounded-lg border border-[var(--cc-line)] bg-[var(--cc-paper)] p-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-[var(--cc-line)] pb-3">
                <div className="flex items-center gap-2">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--cc-ink)] text-white">
                    <Clapperboard className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold cc-text-primary">Brief creativo</h2>
                    <p className="text-xs cc-text-tertiary">Cada generación queda guardada</p>
                  </div>
                </div>
                <Sparkles className="h-4 w-4 text-[var(--cc-copper)]" />
              </div>

              <div className="mt-4 space-y-4">
                <div className="space-y-2">
                  <FieldLabel>Objetivo</FieldLabel>
                  <textarea
                    value={form.objective}
                    onChange={event => updateForm("objective", event.target.value)}
                    rows={4}
                    className="w-full resize-none rounded-lg border border-[var(--cc-line)] bg-white px-3 py-2 text-sm leading-6 outline-none transition focus:border-[var(--cc-copper)]"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <FieldLabel>Audiencia</FieldLabel>
                    <select value={form.audience} onChange={event => updateForm("audience", event.target.value as ReelAudience)} className="h-11 w-full rounded-lg border border-[var(--cc-line)] bg-white px-3 text-sm outline-none transition focus:border-[var(--cc-copper)]">
                      {AUDIENCE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <FieldLabel>Tono</FieldLabel>
                    <select value={form.tone} onChange={event => updateForm("tone", event.target.value as ReelTone)} className="h-11 w-full rounded-lg border border-[var(--cc-line)] bg-white px-3 text-sm outline-none transition focus:border-[var(--cc-copper)]">
                      {TONE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <FieldLabel>Foco</FieldLabel>
                  <select value={form.featureFocus} onChange={event => updateForm("featureFocus", event.target.value)} className="h-11 w-full rounded-lg border border-[var(--cc-line)] bg-white px-3 text-sm outline-none transition focus:border-[var(--cc-copper)]">
                    {FEATURE_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
                  </select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <FieldLabel>Duracion</FieldLabel>
                    <span className="text-xs font-semibold cc-text-secondary">{form.durationSeconds}s</span>
                  </div>
                  <input type="range" min={15} max={60} step={5} value={form.durationSeconds} onChange={event => updateForm("durationSeconds", Number(event.target.value))} className="w-full accent-[var(--cc-copper)]" />
                </div>

                <div className="grid gap-3">
                  <input value={form.proofPoint || ""} onChange={event => updateForm("proofPoint", event.target.value)} placeholder="Prueba: acciones con auditoria..." className="h-11 w-full rounded-lg border border-[var(--cc-line)] bg-white px-3 text-sm outline-none transition focus:border-[var(--cc-copper)]" />
                  <input value={form.offer || ""} onChange={event => updateForm("offer", event.target.value)} placeholder="Oferta: demo guiada..." className="h-11 w-full rounded-lg border border-[var(--cc-line)] bg-white px-3 text-sm outline-none transition focus:border-[var(--cc-copper)]" />
                  <input value={form.callToAction || ""} onChange={event => updateForm("callToAction", event.target.value)} placeholder="CTA" className="h-11 w-full rounded-lg border border-[var(--cc-line)] bg-white px-3 text-sm outline-none transition focus:border-[var(--cc-copper)]" />
                </div>
              </div>

              <div className="mt-5 flex gap-2">
                <button type="submit" disabled={loading} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--cc-copper)] px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Generar y guardar
                </button>
                <button type="button" onClick={() => setForm(DEFAULT_FORM)} title="Restaurar brief" className="grid min-h-11 w-11 place-items-center rounded-lg border border-[var(--cc-line)] bg-white cc-text-secondary transition hover:bg-[var(--cc-ivory)]">
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
            </form>

            <div className="rounded-lg border border-[var(--cc-line)] bg-[var(--cc-paper)] p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <Instagram className="h-4 w-4 text-[var(--cc-copper)]" />
                <h2 className="text-sm font-semibold cc-text-primary">Instagram</h2>
              </div>
              <div className="mt-3 rounded-lg border border-[var(--cc-line)] bg-[var(--cc-ivory)] p-3">
                <p className="text-sm font-semibold cc-text-primary">
                  {instagram.status === "connected" ? `Conectado: @${instagram.username || "instagram"}` : "Pendiente de conexion Meta"}
                </p>
                <p className="mt-1 text-xs leading-5 cc-text-secondary">
                  Cuenta profesional detectada por tu confirmacion. Falta OAuth/token Meta para publicar automaticamente sin contrasenas.
                </p>
                {instagram.lastError && <p className="mt-2 text-xs text-rose-700">{instagram.lastError}</p>}
              </div>
            </div>
          </div>

          <section className="space-y-4">
            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            )}

            {selectedReel ? (
              <div className="rounded-lg border border-[var(--cc-line)] bg-[var(--cc-paper)] shadow-sm">
                <div className="flex flex-col gap-3 border-b border-[var(--cc-line)] p-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <span className={clsx("inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]", statusClass(selectedReel.status))}>
                      {STATUS_LABELS[selectedReel.status]}
                    </span>
                    <h2 className="mt-3 text-2xl font-semibold cc-text-primary">{selectedReel.title}</h2>
                    <p className="mt-2 max-w-3xl text-sm leading-6 cc-text-secondary">{selectedReel.creativePackage.angle}</p>
                    {selectedReel.failureReason && (
                      <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                        {selectedReel.failureReason}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <CopyButton text={captionBlock(selectedReel)} label="Caption" />
                    <CopyButton text={buildFullScript(selectedReel)} label="Guion" />
                    <button type="button" onClick={() => downloadJson(selectedReel)} className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--cc-line)] bg-white px-3 text-xs font-semibold cc-text-secondary transition hover:bg-[var(--cc-ivory)]">
                      <Download className="h-3.5 w-3.5" />
                      JSON
                    </button>
                  </div>
                </div>

                <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="space-y-4">
                    <div className="rounded-lg border border-[var(--cc-line)] bg-[var(--cc-ivory)] p-4">
                      <div className="flex items-center gap-2">
                        <Film className="h-4 w-4 text-[var(--cc-copper)]" />
                        <h3 className="text-sm font-semibold cc-text-primary">Video</h3>
                      </div>
                      {selectedReel.videoUrl ? (
                        <video controls src={selectedReel.videoUrl} className="mt-3 aspect-[9/16] max-h-[520px] w-full rounded-lg bg-black object-cover" />
                      ) : (
                        <div className="mt-3 grid aspect-[9/16] max-h-[520px] place-items-center rounded-lg border border-dashed border-[var(--cc-line)] bg-white p-5 text-center">
                          <div>
                            <p className="text-sm font-semibold cc-text-primary">MP4 pendiente</p>
                            <p className="mt-2 text-xs leading-5 cc-text-secondary">
                              Usa Renderizar video cuando este conectado MARKETING_VIDEO_RENDER_WEBHOOK_URL.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-3">
                      {selectedReel.creativePackage.scenes.map((scene, index) => (
                        <article key={`${selectedReel.id}-${scene.time}-${index}`} className="rounded-lg border border-[var(--cc-line)] bg-white p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-md bg-[var(--cc-ink)] px-2 py-1 text-xs font-semibold text-white">{scene.time}</span>
                            <span className="text-xs font-semibold uppercase tracking-[0.12em] cc-text-tertiary">Escena {index + 1}</span>
                          </div>
                          <p className="mt-3 text-sm font-semibold leading-6 cc-text-primary">{scene.onScreenText}</p>
                          <p className="mt-1 text-sm leading-6 cc-text-secondary">{scene.voiceOver}</p>
                          <p className="mt-2 text-xs leading-5 cc-text-tertiary">{scene.visual}</p>
                        </article>
                      ))}
                    </div>
                  </div>

                  <aside className="space-y-4">
                    <div className="rounded-lg border border-[var(--cc-line)] bg-white p-4">
                      <h3 className="text-sm font-semibold cc-text-primary">Acciones</h3>
                      <div className="mt-3 grid gap-2">
                        <button type="button" onClick={() => runReelAction("approve", selectedReel.id)} disabled={Boolean(actionLoading)} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[var(--cc-ink)] px-3 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-60">
                          {actionLoading === `approve:${selectedReel.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                          Aprobar
                        </button>
                        <button type="button" onClick={() => runReelAction("render", selectedReel.id)} disabled={Boolean(actionLoading)} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[var(--cc-line)] bg-white px-3 text-xs font-semibold cc-text-secondary transition hover:bg-[var(--cc-ivory)] disabled:opacity-60">
                          {actionLoading === `render:${selectedReel.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                          Renderizar video
                        </button>
                        <button type="button" onClick={() => runReelAction("publish", selectedReel.id)} disabled={Boolean(actionLoading)} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60">
                          {actionLoading === `publish:${selectedReel.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                          Publicar ahora
                        </button>
                      </div>
                      <div className="mt-4 space-y-2">
                        <FieldLabel>Agendar</FieldLabel>
                        <input
                          type="datetime-local"
                          value={scheduleByReel[selectedReel.id] || ""}
                          onChange={event => setScheduleByReel(current => ({ ...current, [selectedReel.id]: event.target.value }))}
                          className="h-10 w-full rounded-md border border-[var(--cc-line)] bg-white px-3 text-xs outline-none focus:border-[var(--cc-copper)]"
                        />
                        <button type="button" onClick={() => scheduleReel(selectedReel.id)} disabled={Boolean(actionLoading)} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-[var(--cc-line)] bg-[var(--cc-ivory)] px-3 text-xs font-semibold cc-text-secondary transition hover:bg-white disabled:opacity-60">
                          {actionLoading === `schedule:${selectedReel.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarClock className="h-3.5 w-3.5" />}
                          Guardar agenda
                        </button>
                      </div>
                    </div>

                    <div className="rounded-lg border border-[var(--cc-line)] bg-white p-4">
                      <div className="flex items-center gap-2">
                        <Hash className="h-4 w-4 text-[var(--cc-copper)]" />
                        <h3 className="text-sm font-semibold cc-text-primary">Caption</h3>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 cc-text-secondary">{selectedReel.caption}</p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {selectedReel.hashtags.map(tag => (
                          <span key={tag} className="rounded-full bg-[var(--cc-copper-tint)] px-2 py-1 text-[11px] font-semibold text-[var(--cc-copper)]">{tag}</span>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-lg border border-[var(--cc-line)] bg-white p-4">
                      <div className="flex items-center gap-2">
                        <Music2 className="h-4 w-4 text-[var(--cc-copper)]" />
                        <h3 className="text-sm font-semibold cc-text-primary">Audio</h3>
                      </div>
                      <p className="mt-2 text-sm leading-6 cc-text-secondary">{selectedReel.creativePackage.audioDirection}</p>
                    </div>
                  </aside>
                </div>
              </div>
            ) : (
              <div className="grid min-h-[620px] place-items-center rounded-lg border border-[var(--cc-line)] bg-[var(--cc-paper)] p-6 text-center shadow-sm">
                <div className="max-w-md">
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-lg bg-[var(--cc-ink)] text-white">
                    <Instagram className="h-6 w-6" />
                  </div>
                  <h2 className="mt-4 text-xl font-semibold cc-text-primary">Crea el primer reel de la campaña</h2>
                  <p className="mt-2 text-sm leading-6 cc-text-secondary">
                    El agente guardara el historial, preparara el video y dejara el camino listo para publicar en Instagram.
                  </p>
                  <button type="button" onClick={() => generate()} disabled={loading} className="mt-5 inline-flex h-11 items-center gap-2 rounded-lg bg-[var(--cc-copper)] px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Generar primer reel
                  </button>
                </div>
              </div>
            )}

            <div className="rounded-lg border border-[var(--cc-line)] bg-[var(--cc-paper)] p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold cc-text-primary">Historial y campañas</h2>
                  <p className="mt-1 text-xs cc-text-tertiary">{campaigns.length} campaña(s), {reels.length} reel(s)</p>
                </div>
                <Timer className="h-4 w-4 text-[var(--cc-copper)]" />
              </div>
              <div className="mt-4 grid gap-2">
                {reels.map(reel => (
                  <button
                    key={reel.id}
                    type="button"
                    onClick={() => setSelectedReelId(reel.id)}
                    className={clsx(
                      "rounded-lg border p-3 text-left transition hover:bg-[var(--cc-ivory)]",
                      selectedReel?.id === reel.id ? "border-[var(--cc-copper)] bg-[var(--cc-copper-tint)]" : "border-[var(--cc-line)] bg-white"
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-semibold cc-text-primary">{reel.title}</span>
                      <span className={clsx("shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold", statusClass(reel.status))}>{STATUS_LABELS[reel.status]}</span>
                    </div>
                    <p className="mt-1 text-xs cc-text-tertiary">
                      {reel.scheduledAt ? `Agendado: ${formatDate(reel.scheduledAt)}` : `Creado: ${formatDate(reel.createdAt)}`}
                    </p>
                  </button>
                ))}
                {reels.length === 0 && (
                  <div className="rounded-lg border border-dashed border-[var(--cc-line)] p-4 text-sm cc-text-secondary">
                    Todavia no hay reels guardados.
                  </div>
                )}
              </div>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
