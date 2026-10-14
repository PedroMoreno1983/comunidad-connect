"use client";

import * as React from "react";
import { Tag } from "@/components/cc/Tag";
import { DigestMarkdown } from "@/components/committeeDigest/DigestMarkdown";
import type {
  AgendaOutcome,
  AssemblyAgendaItem,
  AssemblyAlert,
  AssemblyModality,
  AssemblySessionType,
  AssemblyStatus,
  AttendanceCapacity,
  LiveQuorum,
  QuorumClass,
  VoteChoice,
} from "@/lib/assemblies/types";

export const SESSION_LABEL: Record<AssemblySessionType, string> = {
  ordinary: "Ordinaria",
  extraordinary: "Extraordinaria (mayoría absoluta)",
  reinforced: "Extraordinaria (mayoría reforzada)",
};

export const MODALITY_LABEL: Record<AssemblyModality, string> = {
  in_person: "Presencial",
  remote: "Telemática",
  hybrid: "Mixta",
};

export const CLASS_LABEL: Record<QuorumClass, string> = {
  ordinary: "Ordinaria",
  absolute: "Mayoría absoluta",
  reinforced: "Mayoría reforzada",
};

export const CAPACITY_LABEL: Record<AttendanceCapacity, string> = {
  owner: "Titular",
  proxy: "Con poder",
  occupant: "Arrendatario u ocupante",
};

export const CHOICE_LABEL: Record<VoteChoice, string> = { yes: "A favor", no: "En contra", abstain: "Abstención" };

const STATUS: Record<AssemblyStatus, { label: string; tone: "copper" | "sage" | "amber" | "rose" | "plum" | "neutral" }> = {
  draft: { label: "Borrador", tone: "neutral" },
  cited: { label: "Citada", tone: "amber" },
  in_progress: { label: "En curso", tone: "copper" },
  closed: { label: "Cerrada · acta por firmar", tone: "plum" },
  minutes_signed: { label: "Acta firmada", tone: "sage" },
  cancelled: { label: "Suspendida", tone: "rose" },
};

const OUTCOME: Record<AgendaOutcome, { label: string; tone: "sage" | "rose" | "amber" }> = {
  approved: { label: "Aprobado", tone: "sage" },
  rejected: { label: "No aprobado", tone: "rose" },
  no_quorum: { label: "Sin quórum", tone: "amber" },
};

export function StatusTag({ status }: { status: AssemblyStatus }) {
  const meta = STATUS[status];
  return <Tag tone={meta.tone} dot={status === "in_progress"}>{meta.label}</Tag>;
}

export function OutcomeTag({ outcome }: { outcome: AgendaOutcome }) {
  const meta = OUTCOME[outcome];
  return <Tag tone={meta.tone} solid>{meta.label}</Tag>;
}

export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function fmt(value: number) {
  return new Intl.NumberFormat("es-CL", { maximumFractionDigits: 4 }).format(value);
}

export function Card({ children, id, className = "" }: { children: React.ReactNode; id?: string; className?: string }) {
  return (
    <section id={id} className={`rounded-2xl border p-5 ${className}`} style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
      {children}
    </section>
  );
}

export function SectionTitle({ eyebrow, title }: { eyebrow?: string; title: string }) {
  return (
    <div className="mb-3">
      {eyebrow && <p className="cc-eyebrow">{eyebrow}</p>}
      <h2 className="text-xl cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>{title}</h2>
    </div>
  );
}

export function AlertList({ alerts }: { alerts: AssemblyAlert[] }) {
  if (!alerts.length) return null;
  const color = { info: "var(--cc-line)", warning: "var(--cc-amber)", error: "var(--cc-rose)" } as const;
  return (
    <ul className="space-y-2">
      {alerts.map((alert, index) => (
        <li key={index} role={alert.level === "error" ? "alert" : "status"} className="rounded-xl border px-3 py-2 text-sm cc-text-secondary" style={{ borderColor: color[alert.level] }}>
          {alert.message}
        </li>
      ))}
    </ul>
  );
}

export function QuorumMeter({ quorum, rightsMethod }: { quorum: LiveQuorum; rightsMethod: "share" | "equal" }) {
  const width = Math.min(100, Math.max(0, quorum.presentShare));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-3xl cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>{quorum.presentShare.toLocaleString("es-CL")}%</p>
        <Tag tone={quorum.constitutionMet ? "sage" : "amber"} solid>{quorum.constitutionMet ? "Quórum para sesionar" : "Sin quórum aún"}</Tag>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: "var(--cc-line)" }} aria-hidden>
        <div className="h-full" style={{ width: `${width}%`, background: quorum.constitutionMet ? "var(--cc-sage)" : "var(--cc-amber)" }} />
      </div>
      <p className="mt-2 text-xs cc-text-tertiary">
        {quorum.presentUnits} de {quorum.totalUnits} unidades acreditadas · {fmt(quorum.presentWeight)} de {fmt(quorum.totalWeight)} {rightsMethod === "share" ? "‰ de derechos" : "votos (1 unidad = 1 voto)"}
      </p>
      <p className="mt-1 text-xs cc-text-tertiary">{quorum.constitutionRule}</p>
      <EligibilityTotals quorum={quorum} rightsMethod={rightsMethod} />
      {quorum.pendingVerification > 0 && <p className="mt-1 text-xs" style={{ color: "var(--cc-amber)" }}>{quorum.pendingVerification} asistencia(s) esperan verificación.</p>}
    </div>
  );
}

/**
 * Totales del certificado de habilidad. Pantalla compartida: solo cuántas
 * unidades y cuántos derechos están habilitados, nunca cuáles.
 */
export function EligibilityTotals({ quorum, rightsMethod }: { quorum: LiveQuorum; rightsMethod: "share" | "equal" }) {
  const certificate = quorum.eligibility;
  if (!certificate) return <p className="mt-1 text-xs cc-text-tertiary">Certificado de habilidad: lo emite el administrador antes de la primera votación.</p>;
  return (
    <p className="mt-1 text-xs cc-text-tertiary">
      Habilitadas para votar: {certificate.eligibleUnits} de {certificate.totalUnits} unidades · {fmt(certificate.eligibleWeight)}{rightsMethod === "share" ? "‰" : ""} de {fmt(certificate.totalWeight)}{rightsMethod === "share" ? "‰ de derechos" : " votos"} ({certificate.eligibleShare.toLocaleString("es-CL")}%) · corte {certificate.cutoffDate}
    </p>
  );
}

export function ItemResult({ item }: { item: AssemblyAgendaItem }) {
  if (!item.result || !item.outcome) return null;
  const { tally, percentages } = item.result;
  return (
    <div className="mt-3 rounded-xl border p-3 text-sm cc-text-secondary" style={{ borderColor: "var(--cc-line)" }}>
      <div className="flex flex-wrap items-center gap-2"><OutcomeTag outcome={item.outcome} /><span>A favor {percentages.yesOfBase.toLocaleString("es-CL")}% de {percentages.base === "present" ? "los derechos presentes" : "los derechos del condominio"}</span></div>
      <p className="mt-2">A favor {fmt(tally.yes)} · En contra {fmt(tally.no)} · Abstención {fmt(tally.abstain)} · Presentes {percentages.presentOfTotal.toLocaleString("es-CL")}%</p>
      <p className="mt-1 text-xs cc-text-tertiary">Regla aplicada: {item.result.rule}</p>
      {item.result.pendingVerification > 0 && <p className="mt-1 text-xs cc-text-tertiary">{item.result.pendingVerification} voto(s) en línea sin verificar no se contaron.</p>}
    </div>
  );
}

export function MarkdownBlock({ content }: { content: string }) {
  return <DigestMarkdown content={content} />;
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium cc-text-primary">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs cc-text-tertiary">{hint}</span>}
    </label>
  );
}

export const inputClass = "w-full rounded-xl border px-3 py-2 text-sm cc-text-primary bg-transparent";
export const inputStyle: React.CSSProperties = { borderColor: "var(--cc-line-strong)" };
