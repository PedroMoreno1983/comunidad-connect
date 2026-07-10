"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Loader2,
  Play,
  Sparkles,
  XCircle,
} from "lucide-react";
import { Eyebrow, DisplayHeading } from "@/components/cc/Eyebrow";
import { Button } from "@/components/cc/Button";

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
  proposalId?: string | null;
  runId?: string | null;
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
  metadata?: {
    displayAction?: string;
    displaySummary?: string;
    proposedAction?: {
      title?: string;
      summary?: string;
      args?: Record<string, unknown>;
    };
  } | null;
};

type AgentPolicy = {
  agentKey: AgentKey;
  autonomyLevel: "manual" | "semi_autonomous" | "autonomous";
  active: boolean;
  maxDailyActions: number;
  updatedAt?: string | null;
};

type AgentSummary = {
  totalRuns: number;
  executedRuns: number;
  pendingProposals: number;
  failedRuns: number;
  successRate: number;
  estimatedMinutesSaved: number;
};

type AgentPlaybook = {
  key: string;
  agentKey: AgentKey;
  name: string;
  description: string;
  targetHref: string;
  requiresAdmin: boolean;
  steps: string[];
};

type AgentCenterGetResponse = {
  activity?: ActivityRow[];
  policies?: AgentPolicy[];
  summary?: AgentSummary;
  playbooks?: AgentPlaybook[];
};

const AREA_LABELS: Record<AgentKey, string> = {
  finance: "Cobranza",
  maintenance: "Mantención",
  concierge: "Conserjería",
  community: "Comunicados",
};

const AREA_TONE: Record<AgentKey, string> = {
  finance: "var(--cc-sage)",
  maintenance: "var(--cc-copper)",
  concierge: "var(--cc-plum)",
  community: "var(--cc-amber)",
};

const AREA_TINT: Record<AgentKey, string> = {
  finance: "var(--cc-sage-tint)",
  maintenance: "var(--cc-copper-tint)",
  concierge: "var(--cc-plum-tint)",
  community: "var(--cc-amber-tint)",
};

const STEPS = [
  { n: "1", title: "CoCo prepara", desc: "Revisa el edificio y arma la propuesta." },
  { n: "2", title: "Tú revisas", desc: "Miras qué hará, en lenguaje simple." },
  { n: "3", title: "Se ejecuta", desc: "Tú apruebas y queda en la bitácora." },
];

const DEFAULT_SUMMARY: AgentSummary = {
  totalRuns: 0,
  executedRuns: 0,
  pendingProposals: 0,
  failedRuns: 0,
  successRate: 0,
  estimatedMinutesSaved: 0,
};

const DEFAULT_POLICIES: Record<AgentKey, AgentPolicy> = {
  finance: { agentKey: "finance", autonomyLevel: "semi_autonomous", active: true, maxDailyActions: 120 },
  community: { agentKey: "community", autonomyLevel: "semi_autonomous", active: true, maxDailyActions: 80 },
  maintenance: { agentKey: "maintenance", autonomyLevel: "manual", active: true, maxDailyActions: 80 },
  concierge: { agentKey: "concierge", autonomyLevel: "manual", active: true, maxDailyActions: 100 },
};

const DEFAULT_PLAYBOOKS: AgentPlaybook[] = [
  {
    key: "finance_collection_review",
    agentKey: "finance",
    name: "Revisar morosos",
    description: "Detecta gastos impagos y notifica de forma privada.",
    targetHref: "/admin/finanzas",
    requiresAdmin: true,
    steps: ["Detectar impagos", "Notificar residentes", "Auditar gestion"],
  },
  {
    key: "maintenance_ticket_triage",
    agentKey: "maintenance",
    name: "Ordenar tickets",
    description: "Ordena tickets abiertos, proveedores y seguimiento operativo.",
    targetHref: "/admin/mantenimiento",
    requiresAdmin: true,
    steps: ["Detectar tickets", "Revisar proveedores", "Registrar brechas"],
  },
  {
    key: "onboarding_import_review",
    agentKey: "community",
    name: "Cargar residentes",
    description: "Guia carga masiva, revision de calidad y sincronizacion.",
    targetHref: "/admin/onboarding",
    requiresAdmin: true,
    steps: ["Subir archivo", "Revisar calidad", "Sincronizar"],
  },
  {
    key: "community_broadcast",
    agentKey: "community",
    name: "Comunicado comunitario",
    description: "Prepara difusion oficial con control editorial.",
    targetHref: "/comunicaciones",
    requiresAdmin: false,
    steps: ["Redactar", "Confirmar", "Auditar"],
  },
];

function nowId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function policyListToMap(policies?: AgentPolicy[]) {
  const output = { ...DEFAULT_POLICIES };
  for (const policy of policies || []) {
    output[policy.agentKey] = policy;
  }
  return output;
}

export default function AgentCenterPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [summary, setSummary] = useState<AgentSummary>(DEFAULT_SUMMARY);
  const [policies, setPolicies] = useState<Record<AgentKey, AgentPolicy>>(DEFAULT_POLICIES);
  const [playbooks, setPlaybooks] = useState<AgentPlaybook[]>(DEFAULT_PLAYBOOKS);
  const [loading, setLoading] = useState(false);
  const [showBitacora, setShowBitacora] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function loadActivity() {
    const response = await fetch("/api/agent-center", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json() as AgentCenterGetResponse;
    setActivity(Array.isArray(data.activity) ? data.activity : []);
    setPolicies(policyListToMap(data.policies));
    setSummary(data.summary || DEFAULT_SUMMARY);
    setPlaybooks(data.playbooks?.length ? data.playbooks : DEFAULT_PLAYBOOKS);
  }

  useEffect(() => {
    loadActivity();
  }, []);

  async function sendAgentRequest(payload: { message: string; confirmed?: boolean; action?: AgentAction; rejected?: boolean; type?: string; playbookKey?: string }) {
    setLoading(true);
    try {
      const response = await fetch("/api/agent-center", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({})) as AgentCenterGetResponse & {
        error?: string;
        reply?: string;
        status?: AgentMessage["status"];
        steps?: AgentStep[];
        action?: AgentAction;
        result?: AgentMessage["result"];
      };
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
      if (data.policies) setPolicies(policyListToMap(data.policies));
      if (data.summary) setSummary(data.summary);
      if (data.playbooks) setPlaybooks(data.playbooks);
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
    await sendAgentRequest({ message });
  }

  async function confirmAction(messageId: string, action: AgentAction) {
    if (loading) return;
    setMessages((current) => current.map((message) => message.id === messageId ? { ...message, status: "executed" } : message));
    await sendAgentRequest({ message: action.summary, confirmed: true, action });
  }

  async function rejectAction(messageId: string, action: AgentAction) {
    if (loading) return;
    setMessages((current) => current.map((message) => message.id === messageId ? { ...message, status: "rejected" } : message));
    await sendAgentRequest({ message: action.summary, rejected: true, action });
  }

  async function requestPlaybook(playbook: AgentPlaybook) {
    if (loading) return;
    await sendAgentRequest({ message: `Prepara esta accion: ${playbook.name}`, type: "playbook_request", playbookKey: playbook.key });
  }

  const queue = messages.filter((message) => message.status === "awaiting_confirmation" && message.action);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Eyebrow className="mb-3">Inteligencia operativa</Eyebrow>
      <DisplayHeading size={40}>
        CoCo prepara. <em style={{ color: "var(--cc-ink)", fontStyle: "italic" }}>Tú decides.</em>
      </DisplayHeading>
      <p className="mt-3.5 max-w-xl text-[15px] leading-relaxed cc-text-secondary">
        CoCo revisa el edificio y deja las acciones listas para ti. Nada se envía ni se ejecuta
        hasta que tú lo apruebes.
      </p>

      {/* Tira de 3 pasos */}
      <div
        className="mt-7 grid grid-cols-1 overflow-hidden rounded-2xl border sm:grid-cols-3"
        style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}
      >
        {STEPS.map((step, i) => (
          <div
            key={step.n}
            className="flex items-start gap-3.5 p-5"
            style={i > 0 ? { borderLeft: "1px solid var(--cc-line)" } : undefined}
          >
            <div
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-[13px]"
              style={{ background: "var(--cc-ink)", color: "var(--cc-paper)" }}
            >
              {step.n}
            </div>
            <div>
              <p className="text-[17px] leading-none cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>{step.title}</p>
              <p className="mt-1 text-[13px] leading-snug cc-text-secondary">{step.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Cola de aprobación */}
      <div className="mt-8 flex items-baseline justify-between">
        <h2 className="text-2xl leading-none cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>Listo para tu aprobación</h2>
        <span className="inline-flex items-center gap-1.5 text-[13px] cc-text-secondary">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--cc-copper)" }} />
          {queue.length} esperan tu revisión
        </span>
      </div>

      <div className="mt-3.5 overflow-hidden rounded-2xl border" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
        {queue.length === 0 ? (
          <div className="p-8 text-center text-sm cc-text-tertiary">
            No hay nada esperando tu aprobación. Pídele algo a CoCo abajo para ver una propuesta acá.
          </div>
        ) : (
          queue.map((message, i) => {
            const action = message.action as AgentAction;
            const tone = AREA_TONE[action.agentKey];
            const tint = AREA_TINT[action.agentKey];
            const expanded = expandedId === message.id;
            return (
              <div key={message.id} style={i > 0 ? { borderTop: "1px solid var(--cc-line)" } : undefined}>
                <div className="flex flex-col gap-3.5 p-5 sm:flex-row sm:items-center">
                  <span
                    className="inline-flex w-[118px] shrink-0 items-center justify-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
                    style={{ background: tint, color: tone }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone }} />
                    {AREA_LABELS[action.agentKey]}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-medium leading-snug cc-text-primary">{action.title}</p>
                    <p className="mt-0.5 text-[13px] leading-snug cc-text-tertiary">{action.summary}</p>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : message.id)}
                      className="rounded-lg border px-4 py-2.5 text-[13px] font-medium cc-text-secondary transition hover:bg-[var(--cc-paper-warm)]"
                      style={{ borderColor: "var(--cc-line-strong)" }}
                    >
                      Ver qué hará
                    </button>
                    <button
                      type="button"
                      onClick={() => rejectAction(message.id, action)}
                      disabled={loading}
                      className="rounded-lg border px-4 py-2.5 text-[13px] font-medium transition hover:bg-[var(--cc-rose-tint)] disabled:opacity-50"
                      style={{ borderColor: "var(--cc-line-strong)", color: "var(--cc-rose)" }}
                    >
                      Rechazar
                    </button>
                    <Button variant="primary" size="sm" onClick={() => confirmAction(message.id, action)} disabled={loading}>
                      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3 w-3" />}
                      Aprobar
                    </Button>
                  </div>
                </div>

                {expanded && (
                  <div className="mx-5 mb-5 rounded-xl p-4" style={{ background: "var(--cc-paper-warm)" }}>
                    <p className="text-[11px] uppercase tracking-[0.1em] cc-text-tertiary">Trazabilidad de CoCo</p>
                    <div className="mt-2.5 space-y-2">
                      {(message.steps || []).map((step, si) => (
                        <div key={si} className="text-[13px] leading-relaxed cc-text-secondary">
                          <span className="cc-text-tertiary">{si + 1}. </span>
                          <span className="font-medium cc-text-primary">{step.title}:</span> {step.detail}
                        </div>
                      ))}
                    </div>
                    <Link href={action.targetHref} className="mt-3 inline-block text-[13px] font-medium" style={{ color: "var(--cc-copper)" }}>
                      Ir al módulo →
                    </Link>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Resultados recientes de mensajes ejecutados/rechazados/error, para no perder el feedback */}
      {messages.some((m) => m.status && m.status !== "awaiting_confirmation") && (
        <div className="mt-4 space-y-2.5">
          {messages.filter((m) => m.status && m.status !== "awaiting_confirmation").slice(-3).map((message) => (
            <div
              key={message.id}
              className="flex items-start gap-2.5 rounded-xl border p-3.5 text-[13px]"
              style={{
                borderColor: message.status === "executed" ? "rgba(110,130,104,0.25)" : message.status === "rejected" ? "rgba(181,82,78,0.25)" : "var(--cc-line)",
                background: message.status === "executed" ? "var(--cc-sage-tint)" : message.status === "rejected" ? "var(--cc-rose-tint)" : "var(--cc-paper)",
              }}
            >
              {message.status === "executed" && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--cc-sage)" }} />}
              {message.status === "rejected" && <XCircle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--cc-rose)" }} />}
              <span className="cc-text-secondary">{message.result?.message || message.content}</span>
            </div>
          ))}
        </div>
      )}

      {/* Pedir algo nuevo — necesario para poder crear propuestas */}
      <div className="mt-8 rounded-2xl border p-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}>
        <p className="text-[13px] font-medium cc-text-primary">Pídele algo a CoCo</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {playbooks.map((playbook) => (
            <button
              key={playbook.key}
              type="button"
              onClick={() => requestPlaybook(playbook)}
              disabled={loading || !policies[playbook.agentKey]?.active}
              className="rounded-full border px-3.5 py-2 text-[12.5px] font-medium cc-text-secondary transition hover:bg-[var(--cc-paper)] disabled:cursor-not-allowed disabled:opacity-50"
              style={{ borderColor: "var(--cc-line)" }}
            >
              {playbook.name}
            </button>
          ))}
        </div>
        <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ej: registra una visita, revisa morosos, crea un ticket..."
            className="min-h-11 flex-1 rounded-xl border px-4 text-sm outline-none transition focus:border-[var(--cc-copper)]"
            style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}
          />
          <Button variant="copper" size="md" type="submit" disabled={loading || !input.trim()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Enviar
          </Button>
        </form>
      </div>

      {/* Pie tranquilo */}
      <div className="mt-6 flex flex-wrap items-center gap-3 text-[13px] cc-text-tertiary">
        <CheckCircle2 className="h-4 w-4" style={{ color: "var(--cc-sage)" }} />
        <span>
          Hoy CoCo ya dejó resueltas <strong className="font-medium cc-text-secondary">{summary.executedRuns} tareas</strong> y te ahorró cerca de{" "}
          <strong className="font-medium cc-text-secondary">{Math.round((summary.estimatedMinutesSaved / 60) * 10) / 10} horas</strong>.
        </span>
        <button
          type="button"
          onClick={() => setShowBitacora((current) => !current)}
          className="ml-auto inline-flex items-center gap-1.5 font-medium"
          style={{ color: "var(--cc-copper)" }}
        >
          Ver la bitácora →
        </button>
      </div>

      {showBitacora && (
        <div className="mt-3 space-y-2.5">
          {activity.length === 0 ? (
            <div className="rounded-xl border border-dashed p-5 text-center text-[13px] cc-text-secondary" style={{ borderColor: "var(--cc-line)" }}>
              No se registran acciones recientes todavía.
            </div>
          ) : (
            activity.map((item) => (
              <div key={item.id} className="rounded-xl border p-3.5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] font-medium uppercase tracking-[0.1em] cc-text-tertiary">{AREA_LABELS[item.agent_key]}</span>
                  <span className="text-[11px] cc-text-tertiary">{new Date(item.created_at).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })}</span>
                </div>
                <p className="mt-1.5 text-sm cc-text-primary">{item.metadata?.displaySummary || item.summary}</p>
              </div>
            ))
          )}
        </div>
      )}
    </main>
  );
}
