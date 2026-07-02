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
type AutonomyLevel = "manual" | "semi_autonomous" | "autonomous";

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
  autonomyLevel: AutonomyLevel;
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

type AgentWorkflow = {
  key: string;
  agentKey: AgentKey;
  name: string;
  status: "ready" | "needs_review" | "blocked";
  priority: "high" | "medium" | "low";
  nextAction: string;
  pendingActions: number;
  completedActions: number;
  estimatedMinutesSaved: number;
  targetHref: string;
  summary: string;
  metrics: Array<{ label: string; value: string; tone: "success" | "warning" | "neutral" }>;
};

type AgentCenterGetResponse = {
  activity?: ActivityRow[];
  policies?: AgentPolicy[];
  summary?: AgentSummary;
  workflows?: AgentWorkflow[];
  playbooks?: AgentPlaybook[];
};

const AGENTS = [
  {
    key: "finance" as const,
    name: "Finanzas",
    label: "Cobros, gastos comunes y morosidad",
    autonomy: "Propone y ordena",
    icon: DollarSign,
    accent: "text-emerald-700",
    bg: "bg-emerald-50",
  },
  {
    key: "maintenance" as const,
    name: "Mantencion",
    label: "Tickets, proveedores y seguimiento",
    autonomy: "Solo propone",
    icon: Wrench,
    accent: "text-cyan-700",
    bg: "bg-cyan-50",
  },
  {
    key: "concierge" as const,
    name: "Conserjeria",
    label: "Visitas, paquetes y accesos",
    autonomy: "Solo propone",
    icon: ConciergeBell,
    accent: "text-amber-700",
    bg: "bg-amber-50",
  },
  {
    key: "community" as const,
    name: "Comunidad",
    label: "Avisos, marketplace y convivencia",
    autonomy: "Propone y ordena",
    icon: MessageSquareText,
    accent: "text-rose-700",
    bg: "bg-rose-50",
  },
];

const EXAMPLES = [
  "Cargar residentes desde una nomina",
  "Revisar morosos y preparar cobranza",
  "Publicar comunicado: corte de agua manana a las 10",
  "Registrar visita de Juan Perez al depto 501",
];

type QuickAction = {
  label: string;
  description: string;
  message: string;
  playbookKey?: string;
};

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: "Cargar residentes",
    description: "Revisa nomina y prepara accesos por unidad.",
    message: "Prepara la carga de residentes desde una nomina del edificio.",
    playbookKey: "onboarding_import_review",
  },
  {
    label: "Revisar morosos",
    description: "Ordena deuda y deja avisos privados listos.",
    message: "Revisar morosos y preparar avisos privados de cobranza.",
    playbookKey: "finance_collection_review",
  },
  {
    label: "Crear comunicado",
    description: "Redacta un aviso antes de publicarlo.",
    message: "Preparar comunicado comunitario para los residentes.",
    playbookKey: "community_broadcast",
  },
  {
    label: "Abrir ticket",
    description: "Convierte un problema en seguimiento.",
    message: "Crear ticket por una falla en el edificio.",
  },
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

const ACTIVITY_AGENT_LABELS: Record<AgentKey, string> = {
  finance: "Finanzas",
  maintenance: "Mantenimiento",
  concierge: "Conserjeria",
  community: "Comunidad",
};

const ACTIVITY_TOOL_LABELS: Record<string, string> = {
  create_announcement: "Comunicado preparado",
  create_booking: "Reserva preparada",
  create_marketplace_item: "Publicacion marketplace",
  create_service_request: "Solicitud de mantencion",
  get_my_expenses: "Consulta de gastos",
  policy_update: "Politica actualizada",
  register_visitor: "Visita registrada",
  run_playbook: "Revision preparada",
};

const ACTIVITY_PLAYBOOK_LABELS: Record<string, string> = {
  community_broadcast: "Comunicado comunitario",
  finance_collection_review: "Cobranza privada",
  iot_emergency_readiness: "Emergencia IoT",
  maintenance_ticket_triage: "Revision de mantencion",
  onboarding_import_review: "Carga de residentes",
};

function cleanActivityText(value: string) {
  return value
    .replace(/Ejecutado:\s*Ejecutar playbook\b:?/gi, "Ejecutado:")
    .replace(/Rechazado:\s*Ejecutar playbook\b:?/gi, "Rechazado:")
    .replace(/Ejecutar playbook\b:?/gi, "Preparar revision:")
    .replace(/\brun_playbook\b/gi, "revision operativa")
    .replace(/Preparar workflow\b:?/gi, "Preparar revision:")
}

function playbookLabelFromText(value: string) {
  const lower = value.toLowerCase();
  for (const [key, label] of Object.entries(ACTIVITY_PLAYBOOK_LABELS)) {
    if (lower.includes(key) || lower.includes(label.toLowerCase())) {
      return label;
    }
  }
  return null;
}

function humanizeActivityAction(item: ActivityRow) {
  if (item.metadata?.displayAction) return cleanActivityText(item.metadata.displayAction);

  const action = item.action || "";
  const summary = item.summary || "";
  const metadataText = JSON.stringify(item.metadata || {});
  const combined = `${action} ${summary} ${metadataText}`.toLowerCase();
  const playbookLabel = playbookLabelFromText(combined);
  if (playbookLabel) return playbookLabel;
  if (item.metadata?.proposedAction?.title) return cleanActivityText(item.metadata.proposedAction.title);

  return ACTIVITY_TOOL_LABELS[action] || ACTIVITY_AGENT_LABELS[item.agent_key] || "Actividad CoCo";
}

function humanizeActivitySummary(item: ActivityRow) {
  if (item.metadata?.displaySummary) return cleanActivityText(item.metadata.displaySummary);

  const rawSummary = item.summary || item.metadata?.proposedAction?.summary || "Accion registrada con trazabilidad operacional.";
  const summary = cleanActivityText(rawSummary);
  const metadataText = JSON.stringify(item.metadata || {});
  const playbookLabel = playbookLabelFromText(`${item.action} ${rawSummary} ${metadataText}`);

  if (playbookLabel) {
    const playbookName = playbookLabel;
    if (/^ejecutado:/i.test(summary)) return `Ejecutado: ${playbookName}`;
    if (/^rechazado:/i.test(summary)) return `Rechazado: ${playbookName}`;
    if (/preparar revision|revision operativa/i.test(summary)) return `Listo para revisar: ${playbookName}`;
  }

  return summary;
}

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
    key: "iot_emergency_readiness",
    agentKey: "maintenance",
    name: "Emergencia IoT",
    description: "Verifica staff y proveedores para alertas criticas.",
    targetHref: "/admin/mantenimiento",
    requiresAdmin: true,
    steps: ["Revisar staff", "Revisar proveedores", "Registrar brechas"],
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

const DEFAULT_WORKFLOWS: AgentWorkflow[] = [
  {
    key: "maintenance_ticket_triage",
    agentKey: "maintenance",
    name: "Mantenimiento y tickets",
    status: "ready",
    priority: "high",
    nextAction: "Ordenar tickets abiertos y preparar seguimiento",
    pendingActions: 0,
    completedActions: 0,
    estimatedMinutesSaved: 0,
    targetHref: "/admin/mantenimiento",
    summary: "Ordena incidencias, proveedores y seguimiento operativo.",
    metrics: [
      { label: "Tickets abiertos", value: "0", tone: "success" },
      { label: "Tiempo potencial", value: "0 min", tone: "neutral" },
    ],
  },
  {
    key: "finance_collection_review",
    agentKey: "finance",
    name: "Cobranza mensual",
    status: "ready",
    priority: "medium",
    nextAction: "Revisar gastos pendientes",
    pendingActions: 0,
    completedActions: 0,
    estimatedMinutesSaved: 0,
    targetHref: "/admin/finanzas",
    summary: "Prepara cobranza privada y auditable.",
    metrics: [
      { label: "Cobros pendientes", value: "0", tone: "success" },
      { label: "Tiempo potencial", value: "0 min", tone: "neutral" },
    ],
  },
];

function policyListToMap(policies?: AgentPolicy[]) {
  const output = { ...DEFAULT_POLICIES };
  for (const policy of policies || []) {
    output[policy.agentKey] = policy;
  }
  return output;
}

function editableValue(value: unknown): string | number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  return "";
}

function editableArgs(args: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(args).map(([key, value]) => [key, editableValue(value)])
  ) as Record<string, string | number>;
}

function workflowStatusLabel(status: AgentWorkflow["status"]) {
  if (status === "blocked") return "Bloqueado";
  if (status === "needs_review") return "Revisar";
  return "Listo";
}

function workflowStatusClass(status: AgentWorkflow["status"]) {
  if (status === "blocked") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "needs_review") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function metricToneClass(tone: "success" | "warning" | "neutral") {
  if (tone === "success") return "text-emerald-700";
  if (tone === "warning") return "text-amber-700";
  return "cc-text-primary";
}

function areaLabel(agentKey: AgentKey) {
  return ACTIVITY_AGENT_LABELS[agentKey];
}

export default function AgentCenterPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<AgentMessage[]>([
    {
      id: "welcome",
      role: "agent",
      content: "Soy CoCo. Elige una accion o escribeme lo que necesitas; dejare una propuesta lista antes de tocar datos del edificio.",
      status: "executed",
      steps: [
        { kind: "reasoning", title: "Modo comercial", detail: "Acciones reales, permisos por rol y auditoria." },
        { kind: "tool", title: "Herramientas activas", detail: "Reservas, marketplace, tickets, visitas, avisos y gastos." },
      ],
    },
  ]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [summary, setSummary] = useState<AgentSummary>(DEFAULT_SUMMARY);
  const [workflows, setWorkflows] = useState<AgentWorkflow[]>(DEFAULT_WORKFLOWS);
  const [policies, setPolicies] = useState<Record<AgentKey, AgentPolicy>>(DEFAULT_POLICIES);
  const [playbooks, setPlaybooks] = useState<AgentPlaybook[]>(DEFAULT_PLAYBOOKS);
  const [loading, setLoading] = useState(false);
  const [workflowLoadingKey, setWorkflowLoadingKey] = useState<string | null>(null);

  // Action inline editing states
  const [editingActionId, setEditingActionId] = useState<string | null>(null);
  const [editingArgs, setEditingArgs] = useState<Record<string, string | number>>({});

  async function handleAutonomyChange(agentKey: AgentKey, value: AutonomyLevel) {
    const previous = policies[agentKey];
    const updatedPolicy = { ...previous, autonomyLevel: value };
    setPolicies(current => ({ ...current, [agentKey]: updatedPolicy }));

    const response = await fetch("/api/agent-center", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "policy_update",
        agentKey,
        autonomyLevel: value,
        active: updatedPolicy.active,
        maxDailyActions: updatedPolicy.maxDailyActions,
      }),
    });

    const data = await response.json().catch(() => ({})) as AgentCenterGetResponse & { error?: string };
    if (!response.ok) {
      setPolicies(current => ({ ...current, [agentKey]: previous }));
      throw new Error(data.error || "No se pudo actualizar la politica del agente.");
    }

    setPolicies(policyListToMap(data.policies));
    if (data.summary) setSummary(data.summary);
    if (data.workflows?.length) setWorkflows(data.workflows);
    if (data.playbooks) setPlaybooks(data.playbooks);
    await loadActivity();
  }

  async function loadActivity() {
    const response = await fetch("/api/agent-center", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json() as AgentCenterGetResponse;
    setActivity(Array.isArray(data.activity) ? data.activity : []);
    setPolicies(policyListToMap(data.policies));
    setSummary(data.summary || DEFAULT_SUMMARY);
    setWorkflows(data.workflows?.length ? data.workflows : DEFAULT_WORKFLOWS);
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
      if (data.workflows?.length) setWorkflows(data.workflows);
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

  async function requestPlaybook(playbook: AgentPlaybook) {
    if (loading) return;
    const message = `Prepara esta accion: ${playbook.name}`;
    setMessages((current) => [...current, { id: nowId(), role: "user", content: message }]);
    await sendAgentRequest({ message, type: "playbook_request", playbookKey: playbook.key });
  }

  async function requestQuickAction(action: QuickAction) {
    if (loading) return;
    setInput("");
    setMessages((current) => [...current, { id: nowId(), role: "user", content: action.message }]);
    await sendAgentRequest({
      message: action.message,
      ...(action.playbookKey ? { type: "playbook_request", playbookKey: action.playbookKey } : {}),
    });
  }

  async function requestWorkflow(workflow: AgentWorkflow) {
    if (loading || workflowLoadingKey) return;
    const message = `Revisa esto con CoCo: ${workflow.name}. ${workflow.nextAction}`;
    setWorkflowLoadingKey(workflow.key);
    setMessages((current) => [...current, { id: nowId(), role: "user", content: message }]);
    try {
      await sendAgentRequest({ message, type: "playbook_request", playbookKey: workflow.key });
    } finally {
      setWorkflowLoadingKey(null);
    }
  }

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="flex flex-col gap-4 border-b border-[var(--cc-line)] pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="cc-eyebrow">Inteligencia Operativa</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal cc-text-primary md:text-4xl">
              CoCo Operaciones
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 cc-text-secondary">
              Acciones diarias del edificio en lenguaje simple: CoCo prepara, tu revisas y luego se ejecuta con registro.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-[var(--cc-line)] bg-[var(--cc-paper)] px-3 py-2 text-xs font-semibold cc-text-secondary">
            <ShieldCheck className="h-4 w-4 text-[var(--cc-sage)]" />
            Tu apruebas antes de ejecutar
          </div>
        </section>

        <section className="rounded-lg border border-[var(--cc-line)] bg-[var(--cc-paper)] p-4 shadow-sm">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--cc-copper)]">Inicio rapido</p>
              <h2 className="mt-1 text-lg font-semibold cc-text-primary">Que quieres resolver ahora</h2>
            </div>
            <span className="text-xs font-semibold cc-text-tertiary">CoCo deja la propuesta lista para aprobar.</span>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={`top-${action.label}`}
                type="button"
                onClick={() => requestQuickAction(action)}
                disabled={loading}
                className="rounded-lg border border-[var(--cc-line)] bg-[var(--cc-ivory)] p-4 text-left transition hover:border-[var(--cc-copper)] hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="block text-sm font-semibold cc-text-primary">{action.label}</span>
                <span className="mt-1 block text-xs leading-5 cc-text-secondary">{action.description}</span>
              </button>
            ))}
          </div>
        </section>
        <section className="rounded-lg border border-[var(--cc-line)] bg-[var(--cc-paper)] p-4 shadow-sm">
          <div className="flex flex-col gap-2 border-b border-[var(--cc-line)] pb-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--cc-copper)]">Pendientes</p>
              <h2 className="mt-1 text-lg font-semibold cc-text-primary">Lo que CoCo puede preparar ahora</h2>
              <p className="mt-1 text-xs cc-text-tertiary">
                Elige una tarea y CoCo dejara la propuesta lista para revisar.
              </p>
            </div>
            <div className="rounded-md border border-[var(--cc-line)] bg-[var(--cc-ivory)] px-3 py-2 text-xs font-semibold cc-text-secondary">
              {workflows.reduce((sum, item) => sum + item.pendingActions, 0)} pendientes
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {workflows.map((workflow) => {
              const blocked = workflow.status === "blocked";
              const isPreparing = workflowLoadingKey === workflow.key;
              return (
                <article key={workflow.key} className="rounded-lg border border-[var(--cc-line)] bg-[var(--cc-ivory)] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold cc-text-primary">{workflow.name}</h3>
                        <span className={clsx("rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em]", workflowStatusClass(workflow.status))}>
                          {workflowStatusLabel(workflow.status)}
                        </span>
                        {workflow.priority === "high" && (
                          <span className="rounded-full border border-rose-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-rose-700">
                            Prioridad alta
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-sm leading-6 cc-text-secondary">{workflow.summary}</p>
                      <p className="mt-3 text-xs font-semibold cc-text-primary">Siguiente paso: {workflow.nextAction}</p>
                    </div>
                    <div className="rounded-lg border border-[var(--cc-line)] bg-white px-3 py-2 text-right">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] cc-text-tertiary">Tiempo</p>
                      <p className="mt-1 text-lg font-bold cc-text-primary">{workflow.estimatedMinutesSaved} min</p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    {workflow.metrics.map((metric) => (
                      <div key={`${workflow.key}-${metric.label}`} className="rounded-md border border-[var(--cc-line)] bg-white px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] cc-text-tertiary">{metric.label}</p>
                        <p className={clsx("mt-1 text-sm font-bold", metricToneClass(metric.tone))}>{metric.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => requestWorkflow(workflow)}
                      disabled={isPreparing || blocked || !policies[workflow.agentKey]?.active}
                      className="inline-flex items-center justify-center gap-2 rounded-md bg-[var(--cc-ink)] px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isPreparing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                      {isPreparing ? "Preparando..." : "Revisar con CoCo"}
                    </button>
                    <Link
                      href={workflow.targetHref}
                      className="inline-flex items-center justify-center gap-2 rounded-md border border-[var(--cc-line)] bg-white px-3 py-2 text-xs font-semibold cc-text-secondary transition hover:bg-[var(--cc-paper)]"
                    >
                      Ir al modulo
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* Premium Stats Banner */}
        <section className="grid gap-4 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-lg border border-[var(--cc-line)] bg-[var(--cc-paper)] p-4 shadow-sm">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] cc-text-tertiary">Tareas resueltas</p>
              <h3 className="text-xl font-bold cc-text-primary">{summary.successRate}%</h3>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-[var(--cc-line)] bg-[var(--cc-paper)] p-4 shadow-sm">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-cyan-50 text-cyan-700">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] cc-text-tertiary">Tiempo estimado</p>
              <h3 className="text-xl font-bold cc-text-primary">{Math.round(summary.estimatedMinutesSaved / 60 * 10) / 10} hrs</h3>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-[var(--cc-line)] bg-[var(--cc-paper)] p-4 shadow-sm">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-amber-50 text-amber-700">
              <Play className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] cc-text-tertiary">Acciones ejecutadas</p>
              <h3 className="text-xl font-bold cc-text-primary">{summary.executedRuns}</h3>
            </div>
          </div>
        </section>

        {/* Agents autonomy selection grid */}
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {AGENTS.map((agent) => {
            const Icon = agent.icon;
            const policy = policies[agent.key];
            return (
              <article key={agent.key} className="rounded-lg border border-[var(--cc-line)] bg-[var(--cc-paper)] p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className={clsx("grid h-10 w-10 place-items-center rounded-lg", agent.bg)}>
                    <Icon className={clsx("h-5 w-5", agent.accent)} />
                  </div>
                  <span className={clsx(
                    "rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]",
                    policy.active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"
                  )}>
                    {policy.active ? "Activo" : "Pausado"}
                  </span>
                </div>
                <h2 className="mt-4 text-base font-semibold cc-text-primary">{agent.name}</h2>
                <p className="mt-1 min-h-10 text-sm leading-5 cc-text-secondary">{agent.label}</p>
                <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] cc-text-tertiary">
                  Limite diario: {policy.maxDailyActions} acciones
                </p>
                
                <div className="mt-4 flex items-center justify-between text-xs cc-text-tertiary">
                  <span className="flex items-center gap-1">
                    <Activity className="h-3.5 w-3.5" />
                    Nivel de ayuda:
                  </span>
                  <select
                    value={policy.autonomyLevel}
                    onChange={(e) => {
                      handleAutonomyChange(agent.key, e.target.value as AutonomyLevel).catch(error => {
                        const detail = error instanceof Error ? error.message : "No se pudo actualizar la politica.";
                        setMessages(current => [
                          ...current,
                          { id: nowId(), role: "agent", content: detail, status: "error", steps: [{ kind: "warning", title: "Politica no actualizada", detail }] },
                        ]);
                      });
                    }}
                    className="rounded border border-[var(--cc-line)] bg-white px-2 py-1 text-xs font-semibold cc-text-secondary outline-none transition focus:border-[var(--cc-copper)]"
                  >
                    <option value="manual">Solo proponer</option>
                    <option value="semi_autonomous">Proponer y ordenar</option>
                    <option value="autonomous">Ejecutar automatico</option>
                  </select>
                </div>
              </article>
            );
          })}
        </section>

        <section className="rounded-lg border border-[var(--cc-line)] bg-[var(--cc-paper)] p-4 shadow-sm">
          <div className="flex flex-col gap-2 border-b border-[var(--cc-line)] pb-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold cc-text-primary">Acciones frecuentes</h2>
              <p className="mt-1 text-xs cc-text-tertiary">Atajos seguros para preparar tareas comunes del edificio.</p>
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] cc-text-tertiary">
              {summary.pendingProposals} propuestas pendientes
            </span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {playbooks.map((playbook) => (
              <article key={playbook.key} className="flex min-h-44 flex-col justify-between rounded-lg border border-[var(--cc-line)] bg-[var(--cc-ivory)] p-4">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold cc-text-primary">{playbook.name}</h3>
                    <span className="rounded-full border border-[var(--cc-line)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] cc-text-tertiary">
                      {areaLabel(playbook.agentKey)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 cc-text-secondary">{playbook.description}</p>
                  <p className="mt-3 text-[11px] cc-text-tertiary">
                    {playbook.steps.slice(0, 3).join(" / ")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => requestPlaybook(playbook)}
                  disabled={loading || !policies[playbook.agentKey]?.active}
                  className="mt-4 inline-flex items-center justify-center gap-2 rounded-md bg-[var(--cc-ink)] px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                  Revisar con CoCo
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-lg border border-[var(--cc-line)] bg-[var(--cc-paper)] shadow-sm">
            <div className="flex items-center justify-between border-b border-[var(--cc-line)] px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--cc-ink)] text-white">
                  <Bot className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold cc-text-primary">Conversacion con CoCo</h2>
                  <p className="text-xs cc-text-tertiary">Propuestas claras antes de ejecutar</p>
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
                        <div className="mt-4 rounded-lg border border-[var(--cc-line)] bg-white/75 p-3 text-xs shadow-sm">
                          <div className="flex items-center justify-between border-b border-[var(--cc-line)] pb-2 mb-2">
                            <span className="text-[10px] uppercase tracking-wider cc-text-tertiary flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                              Trazabilidad de CoCo
                            </span>
                            <span className="text-[9px] cc-text-tertiary">{message.steps.length} paso(s)</span>
                          </div>
                          <div className="space-y-2">
                            {message.steps.map((step, index) => {
                              const kindColor = step.kind === 'result' ? 'text-emerald-700' : step.kind === 'warning' ? 'text-rose-700' : step.kind === 'confirmation' ? 'text-amber-700' : 'text-brand-700';
                              return (
                                <div key={`${message.id}-${index}`} className="rounded-md border border-[var(--cc-line)] bg-[var(--cc-ivory)] px-3 py-2 leading-5">
                                  <span className="mr-1.5 cc-text-tertiary">{index + 1}.</span>
                                  <span className={clsx("font-semibold mr-2", kindColor)}>{step.title}:</span>
                                  <span className="break-words cc-text-secondary">{step.detail}</span>
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
                                            value={editingArgs[key] ?? editableValue(message.action?.args[key])}
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
                                          value={editingArgs[key] ?? editableValue(message.action?.args[key])}
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
                                      setEditingArgs(editableArgs(message.action?.args || {}));
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
                                    Ir al modulo
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
              <div className="pb-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold cc-text-primary">Que necesitas hacer</p>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] cc-text-tertiary">Siempre revisas antes</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {QUICK_ACTIONS.map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      onClick={() => requestQuickAction(action)}
                      disabled={loading}
                      className="rounded-lg border border-[var(--cc-line)] bg-[var(--cc-ivory)] p-3 text-left transition hover:border-[var(--cc-copper)] hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span className="block text-xs font-semibold cc-text-primary">{action.label}</span>
                      <span className="mt-1 block text-[11px] leading-4 cc-text-secondary">{action.description}</span>
                    </button>
                  ))}
                </div>
              </div>
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
                  placeholder="Ej: carga residentes, prepara cobranza, registra una visita o crea un ticket..."
                  className="min-h-11 flex-1 rounded-lg border border-[var(--cc-line)] bg-white px-4 text-sm outline-none transition focus:border-[var(--cc-copper)]"
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--cc-copper)] px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Enviar
                </button>
              </div>
            </form>
          </div>

          <aside className="space-y-4">
            <div className="rounded-lg border border-[var(--cc-line)] bg-[var(--cc-paper)] p-4 shadow-sm">
              <h2 className="text-sm font-semibold cc-text-primary">Historial reciente</h2>
              <p className="mt-1 text-xs cc-text-tertiary">Ultimas propuestas y acciones registradas.</p>
              <div className="mt-4 space-y-3">
                {activity.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[var(--cc-line)] p-4 text-xs leading-5 cc-text-secondary">
                    No se registran acciones recientes. Pídele algo a CoCo en el chat para ver la actividad.
                  </div>
                ) : (
                  activity.map((item) => (
                    <div key={item.id} className="rounded-lg border border-[var(--cc-line)] bg-[var(--cc-ivory)] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold uppercase tracking-[0.12em] cc-text-tertiary">
                          {ACTIVITY_AGENT_LABELS[item.agent_key]}
                        </span>
                        <span className="text-[10px] cc-text-tertiary">{formatDate(item.created_at)}</span>
                      </div>
                      <p className="mt-2 text-[11px] font-semibold uppercase text-[var(--cc-copper)]">
                        {humanizeActivityAction(item)}
                      </p>
                      <p className="mt-1 text-sm leading-5 cc-text-primary">{humanizeActivitySummary(item)}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-lg border border-[var(--cc-line)] bg-[var(--cc-ink)] p-4 text-white shadow-sm">
              <CalendarCheck className="h-5 w-5 text-[var(--cc-copper)]" />
              <h2 className="mt-3 text-sm font-semibold">Control humano</h2>
              <p className="mt-2 text-xs leading-5 text-white/75">
                CoCo no publica ni cambia datos sensibles sin que alguien autorizado confirme primero.
              </p>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
