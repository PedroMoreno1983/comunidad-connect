"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Bot,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  ConciergeBell,
  DollarSign,
  Loader2,
  MessageSquareText,
  Pencil,
  Play,
  ShieldCheck,
  Sparkles,
  Wrench,
  XCircle,
} from "lucide-react";
import { clsx } from "clsx";

type AgentKey = "finance" | "maintenance" | "concierge" | "community";

type AgentStep = {
  kind: "reasoning" | "tool" | "confirmation" | "result" | "warning";
  title: string;
  detail: string;
  metadata?: Record<string, unknown>;
};

type AgentAction = {
  agentKey: AgentKey;
  toolName: string;
  args: Record<string, unknown>;
  requiresConfirmation: boolean;
  title: string;
  summary: string;
  targetHref: string;
};

type AgentMessage = {
  id: string;
  role: "user" | "agent";
  content: string;
  status?: "awaiting_confirmation" | "executed" | "error" | "rejected";
  steps?: AgentStep[];
  action?: AgentAction;
  result?: {
    title?: string;
    message?: string;
    targetHref?: string;
  };
};

type ActivityRow = {
  id: string;
  agent_key: AgentKey;
  action: string;
  severity: "info" | "success" | "warning" | "error";
  summary: string;
  created_at: string;
};

const AGENTS = [
  {
    key: "finance" as const,
    name: "Finance Agent",
    label: "Cobros, gastos y morosidad",
    autonomy: "Semiautonomo",
    icon: DollarSign,
    accent: "text-emerald-700",
    bg: "bg-emerald-50",
  },
  {
    key: "maintenance" as const,
    name: "Maintenance Agent",
    label: "Reservas, tickets y proveedores",
    autonomy: "Manual con confirmacion",
    icon: Wrench,
    accent: "text-cyan-700",
    bg: "bg-cyan-50",
  },
  {
    key: "concierge" as const,
    name: "Concierge Agent",
    label: "Visitas, paquetes y accesos",
    autonomy: "Manual con bitacora",
    icon: ConciergeBell,
    accent: "text-amber-700",
    bg: "bg-amber-50",
  },
  {
    key: "community" as const,
    name: "Community Agent",
    label: "Marketplace, avisos y convivencia",
    autonomy: "Semiautonomo",
    icon: MessageSquareText,
    accent: "text-rose-700",
    bg: "bg-rose-50",
  },
];

const EXAMPLES = [
  "Reserva el quincho para este viernes a las 20:00",
  "Quiero vender mi televisor LED a 80 mil pesos",
  "Reporta que la luz del ascensor 2 parpadea",
  "Revisa mis gastos comunes pendientes",
];

function nowId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function AgentCenterPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<AgentMessage[]>([
    {
      id: "welcome",
      role: "agent",
      content: "Soy CoCo Agent Center. Puedo preparar acciones reales y pedir confirmacion antes de tocar datos del condominio.",
      status: "executed",
      steps: [
        { kind: "reasoning", title: "Modo comercial", detail: "Acciones reales, permisos por rol y auditoria." },
        { kind: "tool", title: "Herramientas activas", detail: "Reservas, marketplace, tickets, visitas, avisos y gastos." },
      ],
    },
  ]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Autonomy state config with LocalStorage persistence
  const [autonomy, setAutonomy] = useState<Record<AgentKey, 'manual' | 'semi_autonomous' | 'autonomous'>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("coco_agent_autonomy");
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          // fallback
        }
      }
    }
    return {
      finance: 'semi_autonomous',
      community: 'semi_autonomous',
      maintenance: 'manual',
      concierge: 'manual'
    };
  });

  // Action inline editing states
  const [editingActionId, setEditingActionId] = useState<string | null>(null);
  const [editingArgs, setEditingArgs] = useState<Record<string, any>>({});

  const handleAutonomyChange = (agentKey: AgentKey, value: 'manual' | 'semi_autonomous' | 'autonomous') => {
    const updated = { ...autonomy, [agentKey]: value };
    setAutonomy(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem("coco_agent_autonomy", JSON.stringify(updated));
    }
  };

  async function loadActivity() {
    const response = await fetch("/api/agent-center", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    setActivity(Array.isArray(data.activity) ? data.activity : []);
  }

  useEffect(() => {
    loadActivity();
  }, []);

  async function sendAgentRequest(payload: { message: string; confirmed?: boolean; action?: AgentAction; rejected?: boolean }) {
    setLoading(true);
    try {
      const response = await fetch("/api/agent-center", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          autonomyOverrides: autonomy, // Send dynamic autonomy configurations
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "No se pudo ejecutar CoCo.");

      setMessages((current) => [
        ...current,
        {
          id: nowId(),
          role: "agent",
          content: typeof data.reply === "string" ? data.reply : "Accion procesada.",
          status: data.status,
          steps: Array.isArray(data.steps) ? data.steps : [],
          action: data.action,
          result: data.result,
        },
      ]);
      await loadActivity();
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo ejecutar la accion.";
      setMessages((current) => [
        ...current,
        { id: nowId(), role: "agent", content: message, status: "error", steps: [{ kind: "warning", title: "Error controlado", detail: message }] },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = input.trim();
    if (!message || loading) return;
    setInput("");
    setMessages((current) => [...current, { id: nowId(), role: "user", content: message }]);
    await sendAgentRequest({ message });
  }

  async function confirmAction(messageId: string, action: AgentAction) {
    if (loading) return;
    const finalArgs = editingActionId === messageId ? { ...action.args, ...editingArgs } : action.args;
    if ('price' in finalArgs) {
      finalArgs.price = Number(finalArgs.price || 0);
    }
    const finalAction = { ...action, args: finalArgs };

    setMessages((current) => current.map((message) => message.id === messageId ? { ...message, status: "executed", action: finalAction } : message));
    setEditingActionId(null);
    await sendAgentRequest({ message: finalAction.summary, confirmed: true, action: finalAction });
  }

  async function rejectAction(messageId: string, action: AgentAction) {
    if (loading) return;
    setMessages((current) => current.map((message) => message.id === messageId ? { ...message, status: "rejected" } : message));
    setEditingActionId(null);
    await sendAgentRequest({ message: action.summary, rejected: true, action });
  }

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="flex flex-col gap-4 border-b border-[var(--cc-line)] pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="cc-eyebrow">Inteligencia Operativa</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal cc-text-primary md:text-4xl">
              Agent Center
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 cc-text-secondary">
              Consola de ejecucion con agentes especializados. Cada accion sensible queda en modo previsualizacion,
              requiere confirmacion y escribe en modulos reales.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-[var(--cc-line)] bg-[var(--cc-paper)] px-3 py-2 text-xs font-semibold cc-text-secondary">
            <ShieldCheck className="h-4 w-4 text-[var(--cc-sage)]" />
            Manual first, audit ready
          </div>
        </section>

        {/* Premium Stats Banner */}
        <section className="grid gap-4 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-lg border border-[var(--cc-line)] bg-[var(--cc-paper)] p-4 shadow-sm">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] cc-text-tertiary">Eficiencia Operacional</p>
              <h3 className="text-xl font-bold cc-text-primary">94.8%</h3>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-[var(--cc-line)] bg-[var(--cc-paper)] p-4 shadow-sm">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-cyan-50 text-cyan-700">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] cc-text-tertiary">Tiempo Ahorrado</p>
              <h3 className="text-xl font-bold cc-text-primary">12.5 hrs</h3>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-[var(--cc-line)] bg-[var(--cc-paper)] p-4 shadow-sm">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-amber-50 text-amber-700">
              <Play className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] cc-text-tertiary">Ejecuciones Totales</p>
              <h3 className="text-xl font-bold cc-text-primary">{activity.length + 15}</h3>
            </div>
          </div>
        </section>

        {/* Agents autonomy selection grid */}
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {AGENTS.map((agent) => {
            const Icon = agent.icon;
            return (
              <article key={agent.key} className="rounded-lg border border-[var(--cc-line)] bg-[var(--cc-paper)] p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className={clsx("grid h-10 w-10 place-items-center rounded-lg", agent.bg)}>
                    <Icon className={clsx("h-5 w-5", agent.accent)} />
                  </div>
                  <span className="rounded-full border border-[var(--cc-line)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] cc-text-tertiary">
                    Activo
                  </span>
                </div>
                <h2 className="mt-4 text-base font-semibold cc-text-primary">{agent.name}</h2>
                <p className="mt-1 min-h-10 text-sm leading-5 cc-text-secondary">{agent.label}</p>
                
                <div className="mt-4 flex items-center justify-between text-xs cc-text-tertiary">
                  <span className="flex items-center gap-1">
                    <Activity className="h-3.5 w-3.5" />
                    Autonomía:
                  </span>
                  <select
                    value={autonomy[agent.key]}
                    onChange={(e) => handleAutonomyChange(agent.key, e.target.value as any)}
                    className="rounded border border-[var(--cc-line)] bg-white px-2 py-1 text-xs font-semibold cc-text-secondary outline-none transition focus:border-[var(--cc-copper)]"
                  >
                    <option value="manual">Manual</option>
                    <option value="semi_autonomous">Semicontrolado</option>
                    <option value="autonomous">Autónomo</option>
                  </select>
                </div>
              </article>
            );
          })}
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-lg border border-[var(--cc-line)] bg-[var(--cc-paper)] shadow-sm">
            <div className="flex items-center justify-between border-b border-[var(--cc-line)] px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--cc-ink)] text-white">
                  <Bot className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold cc-text-primary">Consola de ejecucion</h2>
                  <p className="text-xs cc-text-tertiary">Razonamiento, herramienta y resultado visible</p>
                </div>
              </div>
              <Sparkles className="h-4 w-4 text-[var(--cc-copper)]" />
            </div>

            <div className="max-h-[620px] space-y-4 overflow-y-auto p-4">
              {messages.map((message) => (
                <article
                  key={message.id}
                  className={clsx(
                    "rounded-lg border p-4",
                    message.role === "user"
                      ? "ml-auto max-w-2xl border-[var(--cc-copper)] bg-[var(--cc-copper-tint)]"
                      : "mr-auto max-w-3xl border-[var(--cc-line)] bg-[var(--cc-ivory)]"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--cc-paper)]">
                      {message.role === "user" ? <MessageSquareText className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-6 cc-text-primary">{message.content}</p>

                      {/* Premium Unix/IA Terminal style for reasoning logs */}
                      {message.steps && message.steps.length > 0 && (
                        <div className="mt-4 rounded-lg border border-[var(--cc-line)] bg-[var(--cc-ink)] p-3 text-brand-100 shadow-inner font-mono text-xs">
                          <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2">
                            <span className="text-[10px] uppercase tracking-wider text-white/50 flex items-center gap-1.5 font-sans">
                              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                              Logs de razonamiento agéntico
                            </span>
                            <span className="text-[9px] text-white/30 font-sans">v1.2-core</span>
                          </div>
                          <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                            {message.steps.map((step, index) => {
                              const kindColor = step.kind === 'reasoning' ? 'text-cyan-400' : step.kind === 'tool' ? 'text-amber-400' : step.kind === 'result' ? 'text-emerald-400' : 'text-rose-400';
                              return (
                                <div key={`${message.id}-${index}`} className="leading-5">
                                  <span className="text-white/40 mr-1.5">[{index + 1}]</span>
                                  <span className={clsx("font-semibold mr-2", kindColor)}>{step.title} &gt;</span>
                                  <span className="text-white/90 break-words">{step.detail}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Action confirmation & inline parameter editing */}
                      {message.action && message.status === "awaiting_confirmation" && (
                        <div className="mt-4 rounded-lg border border-[var(--cc-copper)] bg-white p-4">
                          <div className="flex items-start gap-3">
                            <ClipboardCheck className="mt-0.5 h-5 w-5 text-[var(--cc-copper)]" />
                            <div className="min-w-0 flex-1">
                              <h3 className="text-sm font-semibold cc-text-primary">{message.action.title}</h3>
                              <p className="mt-1 text-xs leading-5 cc-text-secondary">{message.action.summary}</p>
                              
                              {editingActionId === message.id ? (
                                <div className="mt-3 space-y-3 rounded-md border border-[var(--cc-line)] bg-[var(--cc-ivory)] p-3">
                                  <h4 className="text-xs font-bold cc-text-primary">Editar Parámetros de la Acción</h4>
                                  {Object.keys(message.action.args).map((key) => {
                                    if (key === 'category' && message.action?.toolName === 'create_marketplace_item') {
                                      return (
                                        <div key={key}>
                                          <label className="text-[10px] font-bold uppercase tracking-wider cc-text-tertiary">Categoría</label>
                                          <select
                                            value={editingArgs[key] ?? message.action?.args[key] ?? ""}
                                            onChange={(e) => setEditingArgs(prev => ({ ...prev, [key]: e.target.value }))}
                                            className="mt-1 w-full rounded border border-[var(--cc-line)] bg-white px-2 py-1 text-xs outline-none focus:border-[var(--cc-copper)]"
                                          >
                                            <option value="electronics">Electrónica</option>
                                            <option value="furniture">Muebles</option>
                                            <option value="clothing">Ropa</option>
                                            <option value="other">Otro</option>
                                          </select>
                                        </div>
                                      );
                                    }
                                    return (
                                      <div key={key}>
                                        <label className="text-[10px] font-bold uppercase tracking-wider cc-text-tertiary">
                                          {key === 'amenityHint' ? 'Espacio / Amenidad' : key === 'startTime' ? 'Hora Inicio' : key === 'endTime' ? 'Hora Fin' : key === 'preferredDate' || key === 'date' ? 'Fecha' : key === 'preferredTime' ? 'Hora' : key === 'visitorName' ? 'Nombre Visitante' : key === 'title' ? 'Título' : key === 'price' ? 'Precio' : key}
                                        </label>
                                        <input
                                          type={key === 'price' ? 'number' : 'text'}
                                          value={editingArgs[key] ?? message.action?.args[key] ?? ""}
                                          onChange={(e) => setEditingArgs(prev => ({ ...prev, [key]: e.target.value }))}
                                          className="mt-1 w-full rounded border border-[var(--cc-line)] bg-white px-2 py-1 text-xs outline-none focus:border-[var(--cc-copper)]"
                                        />
                                      </div>
                                    );
                                  })}
                                  <div className="flex gap-2 pt-1">
                                    <button
                                      type="button"
                                      onClick={() => confirmAction(message.id, message.action as AgentAction)}
                                      disabled={loading}
                                      className="inline-flex items-center gap-1 rounded bg-[var(--cc-ink)] px-2.5 py-1 text-[11px] font-semibold text-white transition hover:opacity-90"
                                    >
                                      Guardar y ejecutar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingActionId(null)}
                                      className="inline-flex items-center gap-1 rounded border border-[var(--cc-line)] bg-white px-2.5 py-1 text-[11px] font-semibold cc-text-secondary transition hover:bg-[var(--cc-ivory)]"
                                    >
                                      Cancelar
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => confirmAction(message.id, message.action as AgentAction)}
                                    disabled={loading}
                                    className="inline-flex items-center gap-2 rounded-md bg-[var(--cc-ink)] px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                                  >
                                    {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                                    Confirmar y ejecutar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingActionId(message.id);
                                      setEditingArgs(message.action?.args || {});
                                    }}
                                    disabled={loading}
                                    className="inline-flex items-center gap-2 rounded-md border border-[var(--cc-line)] px-3 py-2 text-xs font-semibold cc-text-secondary transition hover:bg-[var(--cc-ivory)]"
                                  >
                                    <Pencil className="h-3.5 w-3.5 text-brand-600" />
                                    Editar propuesta
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => rejectAction(message.id, message.action as AgentAction)}
                                    disabled={loading}
                                    className="inline-flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                                  >
                                    Rechazar
                                  </button>
                                  <Link
                                    href={message.action.targetHref}
                                    className="inline-flex items-center gap-2 rounded-md border border-[var(--cc-line)] px-3 py-2 text-xs font-semibold cc-text-secondary"
                                  >
                                    Abrir modulo
                                  </Link>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Action executed card */}
                      {message.status === "executed" && message.result && (
                        <div className="mt-4 flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                          <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-700" />
                          <div>
                            <h3 className="text-sm font-semibold text-emerald-950">{message.result.title || "Accion ejecutada"}</h3>
                            <p className="mt-1 text-xs leading-5 text-emerald-900">{message.result.message}</p>
                          </div>
                        </div>
                      )}

                      {/* Action rejected card */}
                      {message.status === "rejected" && (
                        <div className="mt-4 flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3">
                          <XCircle className="mt-0.5 h-5 w-5 text-rose-700" />
                          <div>
                            <h3 className="text-sm font-semibold text-rose-950 font-sans">Acción rechazada</h3>
                            <p className="mt-1 text-xs leading-5 text-rose-900 font-sans">La propuesta de acción fue descartada por el usuario y registrada como descarte.</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="border-t border-[var(--cc-line)] p-4">
              <div className="flex flex-wrap gap-2 pb-3">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setInput(example)}
                    className="rounded-full border border-[var(--cc-line)] bg-[var(--cc-ivory)] px-3 py-1.5 text-xs cc-text-secondary transition hover:bg-[var(--cc-paper)]"
                  >
                    {example}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Pidele a CoCo una accion real..."
                  className="min-h-11 flex-1 rounded-lg border border-[var(--cc-line)] bg-white px-4 text-sm outline-none transition focus:border-[var(--cc-copper)]"
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--cc-copper)] px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Ejecutar
                </button>
              </div>
            </form>
          </div>

          <aside className="space-y-4">
            <div className="rounded-lg border border-[var(--cc-line)] bg-[var(--cc-paper)] p-4 shadow-sm">
              <h2 className="text-sm font-semibold cc-text-primary">Actividad agéntica</h2>
              <p className="mt-1 text-xs cc-text-tertiary">Registro en tiempo real de las acciones auditadas.</p>
              <div className="mt-4 space-y-3">
                {activity.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[var(--cc-line)] p-4 text-xs leading-5 cc-text-secondary">
                    No se registran acciones recientes. Pídele algo a CoCo en el chat para ver la actividad.
                  </div>
                ) : (
                  activity.map((item) => (
                    <div key={item.id} className="rounded-lg border border-[var(--cc-line)] bg-[var(--cc-ivory)] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold uppercase tracking-[0.12em] cc-text-tertiary">{item.agent_key}</span>
                        <span className="text-[10px] cc-text-tertiary">{formatDate(item.created_at)}</span>
                      </div>
                      <p className="mt-2 text-sm leading-5 cc-text-primary">{item.summary}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-lg border border-[var(--cc-line)] bg-[var(--cc-ink)] p-4 text-white shadow-sm">
              <CalendarCheck className="h-5 w-5 text-[var(--cc-copper)]" />
              <h2 className="mt-3 text-sm font-semibold">Regla premium</h2>
              <p className="mt-2 text-xs leading-5 text-white/75">
                Los agentes no reemplazan permisos: proponen, explican, piden confirmacion y dejan rastro operacional.
              </p>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
