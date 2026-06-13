"use client";

import { useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  ClipboardList,
  Clapperboard,
  Copy,
  Download,
  Hash,
  Instagram,
  Loader2,
  Music2,
  PlayCircle,
  RefreshCw,
  Scissors,
  Sparkles,
} from "lucide-react";
import { clsx } from "clsx";
import type { ReelAgentInput, ReelAudience, ReelCreativePackage, ReelTone } from "@/lib/types";

type ReelResponse = {
  reel?: ReelCreativePackage;
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

function buildFullScript(reel: ReelCreativePackage) {
  return reel.scenes
    .map(scene => `[${scene.time}] ${scene.voiceOver}`)
    .join("\n\n");
}

function copyText(text: string) {
  return navigator.clipboard?.writeText(text).catch(() => undefined);
}

function downloadJson(reel: ReelCreativePackage) {
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

export default function MarketingReelsPage() {
  const [form, setForm] = useState<ReelAgentInput>(DEFAULT_FORM);
  const [reel, setReel] = useState<ReelCreativePackage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fullScript = useMemo(() => reel ? buildFullScript(reel) : "", [reel]);
  const captionBlock = useMemo(() => reel ? `${reel.caption}\n\n${reel.hashtags.join(" ")}` : "", [reel]);

  function updateForm<K extends keyof ReelAgentInput>(key: K, value: ReelAgentInput[K]) {
    setForm(current => ({ ...current, [key]: value }));
  }

  async function generate(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/marketing/reels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json().catch(() => ({})) as ReelResponse;
      if (!response.ok || !data.reel) throw new Error(data.error || "No se pudo generar el reel.");
      setReel(data.reel);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar el reel.");
    } finally {
      setLoading(false);
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
              Genera piezas verticales para promocionar ConviveConnect con guion, escenas, caption, hashtags y prompt de edicion.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-[var(--cc-line)] bg-[var(--cc-paper)] px-3 py-2 text-xs font-semibold cc-text-secondary">
            <Instagram className="h-4 w-4 text-[var(--cc-copper)]" />
            9:16 listo para Instagram
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <form onSubmit={generate} className="rounded-lg border border-[var(--cc-line)] bg-[var(--cc-paper)] p-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-[var(--cc-line)] pb-3">
              <div className="flex items-center gap-2">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--cc-ink)] text-white">
                  <Clapperboard className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold cc-text-primary">Brief creativo</h2>
                  <p className="text-xs cc-text-tertiary">ConviveConnect comercial</p>
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
                  <select
                    value={form.audience}
                    onChange={event => updateForm("audience", event.target.value as ReelAudience)}
                    className="h-11 w-full rounded-lg border border-[var(--cc-line)] bg-white px-3 text-sm outline-none transition focus:border-[var(--cc-copper)]"
                  >
                    {AUDIENCE_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <FieldLabel>Tono</FieldLabel>
                  <select
                    value={form.tone}
                    onChange={event => updateForm("tone", event.target.value as ReelTone)}
                    className="h-11 w-full rounded-lg border border-[var(--cc-line)] bg-white px-3 text-sm outline-none transition focus:border-[var(--cc-copper)]"
                  >
                    {TONE_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <FieldLabel>Foco</FieldLabel>
                <select
                  value={form.featureFocus}
                  onChange={event => updateForm("featureFocus", event.target.value)}
                  className="h-11 w-full rounded-lg border border-[var(--cc-line)] bg-white px-3 text-sm outline-none transition focus:border-[var(--cc-copper)]"
                >
                  {FEATURE_OPTIONS.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <FieldLabel>Duracion</FieldLabel>
                  <span className="text-xs font-semibold cc-text-secondary">{form.durationSeconds}s</span>
                </div>
                <input
                  type="range"
                  min={15}
                  max={60}
                  step={5}
                  value={form.durationSeconds}
                  onChange={event => updateForm("durationSeconds", Number(event.target.value))}
                  className="w-full accent-[var(--cc-copper)]"
                />
              </div>

              <div className="grid gap-3">
                <div className="space-y-2">
                  <FieldLabel>Prueba</FieldLabel>
                  <input
                    value={form.proofPoint || ""}
                    onChange={event => updateForm("proofPoint", event.target.value)}
                    className="h-11 w-full rounded-lg border border-[var(--cc-line)] bg-white px-3 text-sm outline-none transition focus:border-[var(--cc-copper)]"
                  />
                </div>
                <div className="space-y-2">
                  <FieldLabel>Oferta</FieldLabel>
                  <input
                    value={form.offer || ""}
                    onChange={event => updateForm("offer", event.target.value)}
                    className="h-11 w-full rounded-lg border border-[var(--cc-line)] bg-white px-3 text-sm outline-none transition focus:border-[var(--cc-copper)]"
                  />
                </div>
                <div className="space-y-2">
                  <FieldLabel>CTA</FieldLabel>
                  <input
                    value={form.callToAction || ""}
                    onChange={event => updateForm("callToAction", event.target.value)}
                    className="h-11 w-full rounded-lg border border-[var(--cc-line)] bg-white px-3 text-sm outline-none transition focus:border-[var(--cc-copper)]"
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </div>
            )}

            <div className="mt-5 flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--cc-copper)] px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Generar reel
              </button>
              <button
                type="button"
                onClick={() => setForm(DEFAULT_FORM)}
                title="Restaurar brief"
                className="grid min-h-11 w-11 place-items-center rounded-lg border border-[var(--cc-line)] bg-white cc-text-secondary transition hover:bg-[var(--cc-ivory)]"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </form>

          <section className="rounded-lg border border-[var(--cc-line)] bg-[var(--cc-paper)] shadow-sm">
            {reel ? (
              <div className="flex h-full flex-col">
                <div className="flex flex-col gap-3 border-b border-[var(--cc-line)] p-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={clsx(
                        "rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]",
                        reel.modelSource === "anthropic"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                      )}>
                        {reel.modelSource === "anthropic" ? "IA" : "Plantilla"}
                      </span>
                      <span className="rounded-full border border-[var(--cc-line)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] cc-text-tertiary">
                        {reel.durationSeconds}s
                      </span>
                    </div>
                    <h2 className="mt-3 break-words text-2xl font-semibold cc-text-primary">{reel.title}</h2>
                    <p className="mt-2 max-w-3xl text-sm leading-6 cc-text-secondary">{reel.angle}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <CopyButton text={captionBlock} label="Caption" />
                    <CopyButton text={fullScript} label="Guion" />
                    <button
                      type="button"
                      onClick={() => downloadJson(reel)}
                      title="Descargar JSON"
                      className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--cc-line)] bg-white px-3 text-xs font-semibold cc-text-secondary transition hover:bg-[var(--cc-ivory)]"
                    >
                      <Download className="h-3.5 w-3.5" />
                      JSON
                    </button>
                  </div>
                </div>

                <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_300px]">
                  <div className="space-y-4">
                    <div className="rounded-lg border border-[var(--cc-line)] bg-[var(--cc-ivory)] p-4">
                      <div className="flex items-center gap-2">
                        <PlayCircle className="h-4 w-4 text-[var(--cc-copper)]" />
                        <h3 className="text-sm font-semibold cc-text-primary">Hook</h3>
                      </div>
                      <p className="mt-2 break-words text-lg font-semibold leading-7 cc-text-primary">{reel.hook}</p>
                      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] cc-text-tertiary">
                        Portada: {reel.coverText}
                      </p>
                    </div>

                    <div className="space-y-3">
                      {reel.scenes.map((scene, index) => (
                        <article key={`${reel.id}-${scene.time}-${index}`} className="rounded-lg border border-[var(--cc-line)] bg-white p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-md bg-[var(--cc-ink)] px-2 py-1 text-xs font-semibold text-white">{scene.time}</span>
                            <span className="text-xs font-semibold uppercase tracking-[0.12em] cc-text-tertiary">Escena {index + 1}</span>
                          </div>
                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] cc-text-tertiary">Visual</p>
                              <p className="mt-1 text-sm leading-6 cc-text-primary">{scene.visual}</p>
                            </div>
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] cc-text-tertiary">Texto</p>
                              <p className="mt-1 text-sm font-semibold leading-6 cc-text-primary">{scene.onScreenText}</p>
                            </div>
                          </div>
                          <p className="mt-3 text-sm leading-6 cc-text-secondary">{scene.voiceOver}</p>
                          <p className="mt-2 text-xs leading-5 cc-text-tertiary">{scene.productionNote}</p>
                        </article>
                      ))}
                    </div>
                  </div>

                  <aside className="space-y-4">
                    <div className="rounded-lg border border-[var(--cc-line)] bg-white p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Hash className="h-4 w-4 text-[var(--cc-copper)]" />
                          <h3 className="text-sm font-semibold cc-text-primary">Caption</h3>
                        </div>
                        <CopyButton text={captionBlock} label="Copiar" />
                      </div>
                      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 cc-text-secondary">{reel.caption}</p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {reel.hashtags.map(tag => (
                          <span key={tag} className="rounded-full bg-[var(--cc-copper-tint)] px-2 py-1 text-[11px] font-semibold text-[var(--cc-copper)]">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-lg border border-[var(--cc-line)] bg-white p-4">
                      <div className="flex items-center gap-2">
                        <Music2 className="h-4 w-4 text-[var(--cc-copper)]" />
                        <h3 className="text-sm font-semibold cc-text-primary">Audio</h3>
                      </div>
                      <p className="mt-2 text-sm leading-6 cc-text-secondary">{reel.audioDirection}</p>
                    </div>

                    <div className="rounded-lg border border-[var(--cc-line)] bg-white p-4">
                      <div className="flex items-center gap-2">
                        <ClipboardList className="h-4 w-4 text-[var(--cc-copper)]" />
                        <h3 className="text-sm font-semibold cc-text-primary">Checklist</h3>
                      </div>
                      <ul className="mt-3 space-y-2">
                        {reel.productionChecklist.map(item => (
                          <li key={item} className="text-sm leading-5 cc-text-secondary">{item}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="rounded-lg border border-[var(--cc-line)] bg-[var(--cc-ink)] p-4 text-white">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Scissors className="h-4 w-4 text-[var(--cc-copper)]" />
                          <h3 className="text-sm font-semibold">Prompt de edicion</h3>
                        </div>
                        <button
                          type="button"
                          onClick={() => copyText(reel.editingPrompt)}
                          title="Copiar prompt"
                          className="grid h-8 w-8 place-items-center rounded-md bg-white/10 transition hover:bg-white/15"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <p className="mt-3 break-words text-xs leading-5 text-white/75">{reel.editingPrompt}</p>
                    </div>
                  </aside>
                </div>
              </div>
            ) : (
              <div className="grid min-h-[680px] place-items-center p-6">
                <div className="max-w-md text-center">
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-lg bg-[var(--cc-ink)] text-white">
                    <Instagram className="h-6 w-6" />
                  </div>
                  <h2 className="mt-4 text-xl font-semibold cc-text-primary">Crea una pieza lista para producir</h2>
                  <p className="mt-2 text-sm leading-6 cc-text-secondary">
                    Elige un foco comercial y genera un reel con escenas, voz, caption, hashtags y prompt de edicion.
                  </p>
                  <button
                    type="button"
                    onClick={() => generate()}
                    disabled={loading}
                    className="mt-5 inline-flex h-11 items-center gap-2 rounded-lg bg-[var(--cc-copper)] px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Generar primer reel
                  </button>
                </div>
              </div>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
