/* src/app/(dashboard)/expenses/page.tsx ─────────────────────── */
"use client";

import * as React from "react";
import { ChevronLeft, MoreHorizontal, ArrowRight } from "lucide-react";
import { Eyebrow, DisplayHeading } from "@/components/cc/Eyebrow";
import { Button } from "@/components/cc/Button";

type Row = { label: string; amount: number };

const BREAKDOWN: Row[] = [
  { label: "Administración",                amount: 42500 },
  { label: "Agua caliente comunitaria",     amount: 38900 },
  { label: "Electricidad espacios comunes", amount: 28200 },
  { label: "Ascensores y mantención",       amount: 31700 },
  { label: "Conserjería 24/7",              amount: 38900 },
  { label: "Fondo de reserva",              amount: 7220  },
];

const HISTORY = [
  { m: "Ene", v: 142, paid: true },
  { m: "Feb", v: 168, paid: true },
  { m: "Mar", v: 155, paid: true },
  { m: "Abr", v: 178, paid: true },
  { m: "May", v: 187, paid: false },
];

const MAX = 200;
const TOTAL = BREAKDOWN.reduce((s, r) => s + r.amount, 0);

export default function ExpensesPage() {
  return (
    <div className="max-w-md mx-auto px-5 py-3.5 flex flex-col min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 pt-1.5">
        <IconButton aria-label="Volver"><ChevronLeft size={16} /></IconButton>
        <span className="font-mono uppercase tracking-[0.08em]" style={{ fontSize: 11, color: "var(--cc-ink-tertiary)" }}>
          Gastos comunes
        </span>
        <IconButton aria-label="Más"><MoreHorizontal size={16} /></IconButton>
      </div>

      {/* Period */}
      <Eyebrow className="mb-2">Mayo 2026</Eyebrow>
      <DisplayHeading size={42}>
        Tu cuenta <em>del mes</em>
      </DisplayHeading>

      {/* Amount */}
      <div className="mt-6 pb-5 border-b" style={{ borderColor: "var(--cc-line)" }}>
        <div className="text-[12px]" style={{ color: "var(--cc-ink-tertiary)", marginBottom: 8 }}>
          Total a pagar antes del 02 jun
        </div>
        <div className="flex items-baseline gap-1.5">
          <span style={{ fontSize: 18, color: "var(--cc-ink-muted)" }}>$</span>
          <span style={{ fontFamily: "var(--cc-font-display)", fontSize: 56, lineHeight: 1, letterSpacing: "-0.02em" }}>
            {TOTAL.toLocaleString("es-CL")}
          </span>
        </div>
      </div>

      {/* Breakdown */}
      <div className="mt-5 mb-6">
        {BREAKDOWN.map((row, i) => (
          <div
            key={row.label}
            className="flex justify-between items-center py-3"
            style={{ borderBottom: i < BREAKDOWN.length - 1 ? "1px solid var(--cc-line)" : "none" }}
          >
            <div className="text-[13px]" style={{ color: "var(--cc-ink-soft)" }}>{row.label}</div>
            <div className="font-mono text-[13px]">${row.amount.toLocaleString("es-CL")}</div>
          </div>
        ))}
      </div>

      {/* History chart */}
      <Eyebrow className="mb-3">Histórico · últimos 5 meses</Eyebrow>
      <div
        className="rounded-xl border bg-paper-warm"
        style={{ borderColor: "var(--cc-line)", padding: "20px 18px 14px", borderRadius: 18 }}
      >
        <div className="flex items-end gap-3.5 mb-2.5" style={{ height: 100 }}>
          {HISTORY.map((m) => (
            <div key={m.m} className="flex-1 flex flex-col items-center gap-1.5">
              <div
                className="w-full"
                style={{
                  height: `${(m.v / MAX) * 100}%`,
                  background: m.paid ? "var(--cc-ink)" : "var(--cc-copper)",
                  borderRadius: 6,
                }}
              />
              <div className="font-mono" style={{ fontSize: 10, color: "var(--cc-ink-tertiary)" }}>{m.m}</div>
            </div>
          ))}
        </div>
        <div className="flex justify-between items-center pt-2.5" style={{ borderTop: "1px solid var(--cc-line)" }}>
          <div style={{ fontSize: 12, color: "var(--cc-ink-muted)" }}>Promedio</div>
          <div className="font-mono" style={{ fontSize: 12 }}>$166.000</div>
        </div>
      </div>

      {/* CTA */}
      <div className="mt-auto pt-6 pb-3">
        <Button variant="primary" size="lg" block>
          <span className="flex-1 text-left">Pagar ${TOTAL.toLocaleString("es-CL")}</span>
          <ArrowRight size={16} />
        </Button>
        <div className="text-center mt-3" style={{ fontSize: 11, color: "var(--cc-ink-tertiary)" }}>
          Webpay · transferencia · cuotas con Klap
        </div>
      </div>
    </div>
  );
}

function IconButton({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className="grid place-items-center"
      style={{ width: 36, height: 36, borderRadius: 12, border: "1px solid var(--cc-line)", background: "transparent" }}
    >
      {children}
    </button>
  );
}
