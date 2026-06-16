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
  ExternalLink,
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
    instagramOAuth: boolean;
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

function getFriendlyFailure(message?: string | null) {
  if (!message) return "";
  if (message.includes("MARKETING_VIDEO_RENDER_WEBHOOK_URL")) {
    return "Render profesional pendiente. Hoy puedes usar el render rapido del navegador; para voz, musica y edicion final hay que conectar un proveedor MP4.";
  }
  return message;
}

function isWebmVideo(url?: string | null) {
  return Boolean(url?.toLowerCase().split("?")[0].endsWith(".webm"));
}

function getNextStep(reel: MarketingReelRecord, instagram: InstagramConnectionSummary) {
  if (!reel.videoUrl) return "Aprueba y renderiza el video.";
  if (isWebmVideo(reel.videoUrl)) return "El video es vista previa WEBM. Para publicar automatico en Instagram necesitas MP4.";
  if (instagram.status !== "connected") return "Conecta Instagram para publicar desde el agente.";
  if (reel.status === "published") return "Publicado. Puedes generar una nueva variante.";
  if (reel.status === "scheduled") return `Agendado para ${formatDate(reel.scheduledAt)}.`;
  return "Revisa el video, sube volumen y publica cuando este listo.";
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

function getSupportedVideoType() {
  const types = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4;codecs=avc1.4D401E,mp4a.40.2",
    "video/mp4;codecs=avc1.42E01E",
    "video/mp4;codecs=avc1.4D401E",
    "video/mp4;codecs=h264",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  return types.find(type => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) || "";
}

function getVideoExtension(type: string) {
  return type.toLowerCase().includes("mp4") ? "mp4" : "webm";
}

async function attachBrowserAudioTrack(stream: MediaStream, durationMs: number) {
  if (typeof window === "undefined") return () => undefined;
  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return () => undefined;

  const audioContext = new AudioContextCtor();
  const destination = audioContext.createMediaStreamDestination();
  const master = audioContext.createGain();
  const nodes: AudioScheduledSourceNode[] = [];
  const startAt = audioContext.currentTime + 0.08;
  const endAt = startAt + durationMs / 1000;

  master.gain.setValueAtTime(0.34, startAt);
  master.connect(destination);

  const pad = audioContext.createOscillator();
  const padGain = audioContext.createGain();
  pad.type = "sine";
  pad.frequency.setValueAtTime(164.81, startAt);
  padGain.gain.setValueAtTime(0.045, startAt);
  pad.connect(padGain);
  padGain.connect(master);
  pad.start(startAt);
  pad.stop(endAt);
  nodes.push(pad);

  for (let beat = 0; beat < durationMs / 1000; beat += 0.5) {
    const t = startAt + beat;
    const kick = audioContext.createOscillator();
    const kickGain = audioContext.createGain();
    kick.type = "square";
    kick.frequency.setValueAtTime(beat % 1 === 0 ? 92 : 128, t);
    kickGain.gain.setValueAtTime(0.0001, t);
    kickGain.gain.exponentialRampToValueAtTime(0.18, t + 0.018);
    kickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    kick.connect(kickGain);
    kickGain.connect(master);
    kick.start(t);
    kick.stop(t + 0.2);
    nodes.push(kick);
  }

  for (let step = 0; step < durationMs / 1000; step += 1) {
    const t = startAt + step + 0.24;
    const tone = audioContext.createOscillator();
    const toneGain = audioContext.createGain();
    tone.type = "sine";
    tone.frequency.setValueAtTime(step % 4 === 0 ? 329.63 : 246.94, t);
    toneGain.gain.setValueAtTime(0.0001, t);
    toneGain.gain.exponentialRampToValueAtTime(0.07, t + 0.02);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    tone.connect(toneGain);
    toneGain.connect(master);
    tone.start(t);
    tone.stop(t + 0.24);
    nodes.push(tone);
  }

  destination.stream.getAudioTracks().forEach(track => stream.addTrack(track));
  await audioContext.resume();

  return () => {
    nodes.forEach(node => {
      try {
        node.stop();
      } catch {
        // Already stopped by the scheduled render.
      }
    });
    destination.stream.getTracks().forEach(track => track.stop());
    void audioContext.close();
  };
}

async function generateBrowserVideo(reel: MarketingReelRecord) {
  if (typeof document === "undefined" || typeof MediaRecorder === "undefined") {
    throw new Error("Este navegador no permite renderizar video automaticamente.");
  }

  const canvas = document.createElement("canvas");
  const designWidth = 1080;
  const designHeight = 1920;
  const renderWidth = 720;
  const renderHeight = 1280;
  canvas.width = renderWidth;
  canvas.height = renderHeight;
  const ctx = canvas.getContext("2d")!;
  if (!ctx) throw new Error("No se pudo iniciar el lienzo de video.");
  ctx.scale(renderWidth / designWidth, renderHeight / designHeight);

  const scenes = reel.renderSpec.scenes.length > 0
    ? reel.renderSpec.scenes
    : reel.creativePackage.scenes.map((scene, index) => ({ ...scene, index }));
  const durationMs = Math.max(10, reel.durationSeconds) * 1000;
  const sceneMs = durationMs / Math.max(1, scenes.length);
  const startedAt = performance.now();
  const stream = canvas.captureStream(30);
  let cleanupAudio: () => void = () => undefined;
  try {
    cleanupAudio = await attachBrowserAudioTrack(stream, durationMs);
  } catch {
    cleanupAudio = () => undefined;
  }
  const mimeType = getSupportedVideoType();
  const recorder = new MediaRecorder(stream, {
    ...(mimeType ? { mimeType } : {}),
    videoBitsPerSecond: 550_000,
    audioBitsPerSecond: 96_000,
  });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = event => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  function wrapText(text: string, maxWidth: number, font: string) {
    ctx.font = font;
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines.slice(0, 8);
  }

  function drawRoundRect(x: number, y: number, width: number, height: number, radius: number) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fill();
  }

  function drawFrame(now: number) {
    const elapsed = Math.min(durationMs, now - startedAt);
    const sceneIndex = Math.min(scenes.length - 1, Math.floor(elapsed / sceneMs));
    const scene = scenes[Math.max(0, sceneIndex)];
    const progress = elapsed / durationMs;
    const localProgress = (elapsed - sceneIndex * sceneMs) / sceneMs;

    const gradient = ctx.createLinearGradient(0, 0, designWidth, designHeight);
    gradient.addColorStop(0, "#fbf8f3");
    gradient.addColorStop(0.48 + Math.sin(progress * Math.PI) * 0.05, "#f1e6d8");
    gradient.addColorStop(1, "#1f1713");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, designWidth, designHeight);

    ctx.fillStyle = "rgba(181, 102, 78, 0.22)";
    ctx.beginPath();
    ctx.arc(860, 240 + Math.sin(progress * Math.PI * 2) * 40, 220, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(31, 23, 19, 0.08)";
    ctx.beginPath();
    ctx.arc(180, 1480 + Math.cos(progress * Math.PI * 2) * 40, 260, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
    drawRoundRect(76, 128, 928, 1664, 42);

    ctx.fillStyle = "#1f1713";
    ctx.font = "700 44px Arial";
    ctx.fillText("ConviveConnect", 120, 210);
    ctx.fillStyle = "#b5664e";
    ctx.font = "700 24px Arial";
    ctx.fillText("OPERACION DE CONDOMINIOS", 120, 250);

    ctx.fillStyle = "#b5664e";
    drawRoundRect(120, 328, 190, 58, 29);
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 26px Arial";
    ctx.fillText(`${sceneIndex + 1}/${scenes.length}`, 170, 366);

    ctx.fillStyle = "#1f1713";
    const headlineFont = "700 68px Arial";
    const headlineLines = wrapText(scene?.onScreenText || reel.title, 820, headlineFont);
    ctx.font = headlineFont;
    headlineLines.forEach((line, index) => {
      ctx.fillText(line, 120, 510 + index * 82);
    });

    ctx.fillStyle = "#4f4038";
    const voiceFont = "400 38px Arial";
    const voiceLines = wrapText(scene?.voiceOver || reel.caption, 820, voiceFont);
    ctx.font = voiceFont;
    voiceLines.slice(0, 5).forEach((line, index) => {
      ctx.fillText(line, 120, 980 + index * 54);
    });

    ctx.fillStyle = "#fbf8f3";
    drawRoundRect(120, 1370, 820, 236, 28);
    ctx.fillStyle = "#75584c";
    ctx.font = "700 24px Arial";
    ctx.fillText("VISUAL", 160, 1430);
    ctx.fillStyle = "#1f1713";
    const visualLines = wrapText(scene?.visual || reel.featureFocus, 740, "400 31px Arial");
    ctx.font = "400 31px Arial";
    visualLines.slice(0, 3).forEach((line, index) => {
      ctx.fillText(line, 160, 1492 + index * 43);
    });

    ctx.fillStyle = "#b5664e";
    ctx.fillRect(120, 1692, 820 * progress, 12);
    ctx.fillStyle = "#1f1713";
    ctx.font = "700 34px Arial";
    ctx.fillText(reel.creativePackage.coverText || "Agenda una demo en conviveconnect.com", 120, 1756);

    ctx.globalAlpha = Math.min(1, Math.max(0.35, localProgress < 0.12 ? localProgress / 0.12 : 1));
    ctx.globalAlpha = 1;

    if (elapsed < durationMs) requestAnimationFrame(drawFrame);
    else recorder.stop();
  }

  const finished = new Promise<Blob>((resolve, reject) => {
    recorder.onerror = () => reject(new Error("No se pudo grabar el video."));
    recorder.onstop = () => {
      cleanupAudio();
      stream.getTracks().forEach(track => track.stop());
      resolve(new Blob(chunks, { type: recorder.mimeType || "video/webm" }));
    };
  });

  recorder.start(1000);
  requestAnimationFrame(drawFrame);
  return finished;
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

function SceneDetail({ label, children, strong = false }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <div className="min-w-0 rounded-md border border-[var(--cc-line)] bg-[var(--cc-ivory)] px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] cc-text-tertiary">{label}</p>
      <p className={clsx("mt-1 break-words leading-6", strong ? "text-sm font-semibold cc-text-primary" : "text-sm cc-text-secondary")}>
        {children}
      </p>
    </div>
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
  const [notice, setNotice] = useState("");

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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const instagramStatus = params.get("instagram");
    const detail = params.get("detail");
    if (instagramStatus === "connected") {
      setError("");
      setNotice("Instagram quedo conectado. Ya puedes publicar reels con video MP4 listo.");
    } else if (instagramStatus === "error") {
      setNotice("");
      setError(detail || "No se pudo conectar Instagram.");
    } else if (instagramStatus === "forbidden") {
      setNotice("");
      setError("Solo administracion puede conectar Instagram.");
    } else if (instagramStatus === "login_required") {
      setNotice("");
      setError("Inicia sesion nuevamente para terminar la conexion con Instagram.");
    }
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

  async function uploadBrowserRender(reel: MarketingReelRecord, video: Blob) {
    const formData = new FormData();
    const extension = getVideoExtension(video.type);
    formData.append("reelId", reel.id);
    formData.append("video", video, `${reel.id}.${extension}`);

    const response = await fetch("/api/marketing/reels/upload", {
      method: "POST",
      body: formData,
    });
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
      ? await response.json().catch(() => ({})) as DashboardResponse
      : {} as DashboardResponse;
    if (!response.ok) {
      if (response.status === 413) throw new Error("El video quedo demasiado pesado para subirlo. Intenta renderizar nuevamente.");
      throw new Error(data.error || `No se pudo guardar el video renderizado. HTTP ${response.status}`);
    }
    await loadDashboard();
    setNotice("Video renderizado y guardado. Abrelo grande y sube el volumen para revisar el audio base.");
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
      const updated = await postAction({ action, reelId });
      if (action === "render" && updated?.status === "blocked" && updated.failureReason?.includes("MARKETING_VIDEO_RENDER_WEBHOOK_URL")) {
        setActionLoading(`browser-render:${reelId}`);
        const video = await generateBrowserVideo(updated);
        setActionLoading(`upload:${reelId}`);
        await uploadBrowserRender(updated, video);
      }
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
      <div className="mx-auto flex max-w-[1500px] flex-col gap-6">
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
            <CapabilityPill ready label="Render rapido" />
            <CapabilityPill ready={instagram.status === "connected" || Boolean(capabilities?.instagramPublishing)} label="Instagram" />
            <CapabilityPill ready={Boolean(capabilities?.videoRendering)} label="MP4 pro" />
            <CapabilityPill ready={Boolean(capabilities?.cronSecretConfigured)} label="Agenda" />
          </div>
        </section>

        <section className="grid gap-6 2xl:grid-cols-[380px_minmax(0,1fr)]">
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
                  Conecta una cuenta profesional de Instagram asociada a una Pagina de Facebook para publicar desde el agente.
                </p>
                {instagram.lastError && <p className="mt-2 text-xs text-rose-700">{instagram.lastError}</p>}
                <a
                  href="/api/marketing/instagram/connect"
                  className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[var(--cc-ink)] px-3 text-xs font-semibold text-white transition hover:opacity-90"
                >
                  <Instagram className="h-3.5 w-3.5" />
                  {instagram.status === "connected" ? "Reconectar Instagram" : "Conectar Instagram"}
                </a>
                {!capabilities?.instagramOAuth && (
                  <p className="mt-2 text-xs leading-5 text-amber-800">
                    Falta configurar META_APP_ID y META_APP_SECRET en Vercel.
                  </p>
                )}
              </div>
            </div>
          </div>

          <section className="space-y-4">
            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            )}
            {notice && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {notice}
              </div>
            )}

            {selectedReel ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-[var(--cc-line)] bg-[var(--cc-paper)] p-4 shadow-sm">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <span className={clsx("inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]", statusClass(selectedReel.status))}>
                        {STATUS_LABELS[selectedReel.status]}
                      </span>
                      <h2 className="mt-3 max-w-4xl text-2xl font-semibold leading-tight cc-text-primary">{selectedReel.title}</h2>
                      <p className="mt-2 max-w-4xl text-sm leading-6 cc-text-secondary">{selectedReel.creativePackage.angle}</p>
                      <p className="mt-3 rounded-lg border border-[var(--cc-line)] bg-[var(--cc-ivory)] px-3 py-2 text-xs leading-5 cc-text-secondary">
                        Siguiente paso: <span className="font-semibold cc-text-primary">{getNextStep(selectedReel, instagram)}</span>
                      </p>
                      {selectedReel.failureReason && (
                        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                          {getFriendlyFailure(selectedReel.failureReason)}
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
                </div>

                <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(320px,560px)_minmax(280px,360px)]">
                  <div className="rounded-lg border border-[var(--cc-line)] bg-[var(--cc-paper)] p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Film className="h-4 w-4 text-[var(--cc-copper)]" />
                        <h3 className="text-sm font-semibold cc-text-primary">Video</h3>
                      </div>
                      {selectedReel.videoUrl && (
                        <a href={selectedReel.videoUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--cc-line)] bg-white px-2 text-[11px] font-semibold cc-text-secondary transition hover:bg-[var(--cc-ivory)]">
                          <ExternalLink className="h-3.5 w-3.5" />
                          Abrir grande
                        </a>
                      )}
                    </div>
                    {selectedReel.videoUrl ? (
                      <div className="mt-3 flex justify-center rounded-lg bg-[var(--cc-ink)] p-3">
                        <video controls playsInline src={selectedReel.videoUrl} className="aspect-[9/16] max-h-[72vh] w-full max-w-[430px] rounded-md bg-black object-contain shadow-sm" />
                      </div>
                    ) : (
                      <div className="mt-3 grid aspect-[9/16] max-h-[680px] place-items-center rounded-lg border border-dashed border-[var(--cc-line)] bg-[var(--cc-ivory)] p-5 text-center">
                        <div>
                          <p className="text-sm font-semibold cc-text-primary">Video pendiente</p>
                          <p className="mt-2 text-xs leading-5 cc-text-secondary">
                            Aprueba el guion y pulsa Renderizar. El render rapido se crea aqui mismo y se guarda en Supabase.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <aside className="space-y-4">
                    <div className="rounded-lg border border-[var(--cc-line)] bg-white p-4 shadow-sm">
                      <h3 className="text-sm font-semibold cc-text-primary">Control de publicacion</h3>
                      <div className="mt-3 grid gap-2">
                        <button type="button" onClick={() => runReelAction("approve", selectedReel.id)} disabled={Boolean(actionLoading)} className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[var(--cc-ink)] px-3 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-60">
                          {actionLoading === `approve:${selectedReel.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                          Aprobar guion
                        </button>
                        <button type="button" onClick={() => runReelAction("render", selectedReel.id)} disabled={Boolean(actionLoading)} className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-[var(--cc-line)] bg-white px-3 text-xs font-semibold cc-text-secondary transition hover:bg-[var(--cc-ivory)] disabled:opacity-60">
                          {actionLoading === `render:${selectedReel.id}` || actionLoading === `browser-render:${selectedReel.id}` || actionLoading === `upload:${selectedReel.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                          {actionLoading === `browser-render:${selectedReel.id}` ? "Creando video" : actionLoading === `upload:${selectedReel.id}` ? "Guardando video" : "Renderizar con audio base"}
                        </button>
                        <button type="button" onClick={() => runReelAction("publish", selectedReel.id)} disabled={Boolean(actionLoading)} className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60">
                          {actionLoading === `publish:${selectedReel.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                          Publicar ahora
                        </button>
                      </div>

                      <div className="mt-4 space-y-2 border-t border-[var(--cc-line)] pt-4">
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

                    <div className="rounded-lg border border-[var(--cc-line)] bg-white p-4 shadow-sm">
                      <h3 className="text-sm font-semibold cc-text-primary">Estado real</h3>
                      <div className="mt-3 space-y-2 text-xs leading-5">
                        <p className="flex items-start justify-between gap-3">
                          <span className="cc-text-secondary">Instagram</span>
                          <span className={instagram.status === "connected" ? "font-semibold text-emerald-700" : "font-semibold text-amber-700"}>
                            {instagram.status === "connected" ? "Conectado" : "Pendiente"}
                          </span>
                        </p>
                        <p className="flex items-start justify-between gap-3">
                          <span className="cc-text-secondary">Video</span>
                          <span className={selectedReel.videoUrl ? "font-semibold text-emerald-700" : "font-semibold text-amber-700"}>
                            {selectedReel.videoUrl ? "Guardado" : "Pendiente"}
                          </span>
                        </p>
                        <p className="flex items-start justify-between gap-3">
                          <span className="cc-text-secondary">Audio</span>
                          <span className="text-right font-semibold text-amber-700">Base en render nuevo</span>
                        </p>
                        <p className="flex items-start justify-between gap-3">
                          <span className="cc-text-secondary">Voz/musica pro</span>
                          <span className="text-right font-semibold text-amber-700">Requiere proveedor</span>
                        </p>
                      </div>
                      {selectedReel.videoUrl && (
                        <p className="mt-3 rounded-md bg-[var(--cc-ivory)] px-3 py-2 text-xs leading-5 cc-text-secondary">
                          Si este archivo fue creado antes del ajuste de audio, renderizalo otra vez y revisalo con el volumen del reproductor arriba.
                        </p>
                      )}
                    </div>
                  </aside>
                </div>

                <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_380px]">
                  <div className="rounded-lg border border-[var(--cc-line)] bg-[var(--cc-paper)] p-4 shadow-sm">
                    <h3 className="text-sm font-semibold cc-text-primary">Guion por escenas</h3>
                    <div className="mt-3 grid gap-3">
                      {selectedReel.creativePackage.scenes.map((scene, index) => (
                        <article key={`${selectedReel.id}-${scene.time}-${index}`} className="rounded-lg border border-[var(--cc-line)] bg-white p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-md bg-[var(--cc-ink)] px-2 py-1 text-xs font-semibold text-white">{scene.time}</span>
                            <span className="text-xs font-semibold uppercase tracking-[0.12em] cc-text-tertiary">Escena {index + 1}</span>
                          </div>
                          <div className="mt-3 grid min-w-0 gap-3 xl:grid-cols-2">
                            <SceneDetail label="Texto en pantalla" strong>{scene.onScreenText}</SceneDetail>
                            <SceneDetail label="Voz en off">{scene.voiceOver}</SceneDetail>
                          </div>
                          <div className="mt-3">
                            <SceneDetail label="Visual">{scene.visual}</SceneDetail>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>

                  <aside className="space-y-4">
                    <div className="rounded-lg border border-[var(--cc-line)] bg-white p-4 shadow-sm">
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

                    <div className="rounded-lg border border-[var(--cc-line)] bg-white p-4 shadow-sm">
                      <div className="flex items-center gap-2">
                        <Music2 className="h-4 w-4 text-[var(--cc-copper)]" />
                        <h3 className="text-sm font-semibold cc-text-primary">Audio</h3>
                      </div>
                      <p className="mt-2 text-sm leading-6 cc-text-secondary">{selectedReel.creativePackage.audioDirection}</p>
                      <p className="mt-3 rounded-md bg-[var(--cc-ivory)] px-3 py-2 text-xs leading-5 cc-text-secondary">
                        Ahora: beat base generado por navegador. Siguiente mejora: voz en off y musica real con proveedor MP4.
                      </p>
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
