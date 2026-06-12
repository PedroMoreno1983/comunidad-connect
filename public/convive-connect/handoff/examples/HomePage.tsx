/* src/app/(dashboard)/home/page.tsx ─────────────────────────── */
"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, ChevronRight, ArrowRight, Mic, Sparkles, Droplets, Waves, BellRing } from "lucide-react";
import { Brand } from "@/components/cc/Brand";
import { Eyebrow, DisplayHeading } from "@/components/cc/Eyebrow";
import { Tag } from "@/components/cc/Tag";
import { Button } from "@/components/cc/Button";

/**
 * Residente — Home dashboard, premium editorial.
 *
 * Reemplaza a tu actual src/app/(dashboard)/home/page.tsx.
 * Conserva tus hooks de auth/data — solo cambia el render.
 */
export default function HomePage() {
  // Reemplaza con datos reales (gastoActual, reservas, consumoAgua, etc.)
  const user = { firstName: "Martina", building: "Edificio Aurelia", unit: "Torre B · 12C" };
  const billing = { month: "Mayo 2026", dueIn: 8, amount: 187420 };

  return (
    <div className="max-w-md mx-auto px-5 pt-3.5 pb-6">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-8 pt-1">
        <div className="flex items-center gap-2.5">
          <Brand size={16} withMark />
        </div>
        <div className="flex gap-2">
          <button
            className="grid place-items-center relative"
            style={{ width: 36, height: 36, borderRadius: 12, border: "1px solid var(--cc-line)" }}
          >
            <Bell size={16} />
            <span
              className="absolute"
              style={{
                top: 9, right: 9,
                width: 6, height: 6,
                borderRadius: 999, background: "var(--cc-copper)",
              }}
            />
          </button>
          <Link
            href="/profile"
            className="grid place-items-center font-mono text-[12px] font-semibold"
            style={{ width: 36, height: 36, borderRadius: 12, border: "1px solid var(--cc-line)" }}
          >
            {user.firstName[0]}A
          </Link>
        </div>
      </div>

      {/* Greeting — editorial */}
      <div className="mb-7">
        <Eyebrow className="mb-3">Martes, 25 de mayo</Eyebrow>
        <DisplayHeading size={46}>
          Buenos días,<br />
          <em style={{ color: "var(--cc-copper)" }}>{user.firstName}.</em>
        </DisplayHeading>
        <p className="mt-3.5" style={{ fontSize: 14, color: "var(--cc-ink-muted)", lineHeight: 1.5, maxWidth: 290 }}>
          Tu comunidad está al día. Tienes <span className="text-ink">una reserva</span> esta semana y{" "}
          <span className="text-ink">nada pendiente</span> por pagar.
        </p>
      </div>

      {/* Featured: pending bill */}
      <div
        className="relative overflow-hidden mb-3.5"
        style={{ borderRadius: 22, padding: 22, background: "var(--cc-ink)", color: "var(--cc-paper)" }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute", top: -20, right: -30,
            width: 180, height: 180, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(181,102,78,0.35) 0%, transparent 60%)",
          }}
        />
        <div className="relative flex justify-between items-start mb-6">
          <div>
            <Eyebrow style={{ color: "rgba(244,239,230,0.55)", marginBottom: 10 }}>Gasto común</Eyebrow>
            <div style={{ fontSize: 13, color: "rgba(244,239,230,0.75)" }}>{billing.month} · vence en {billing.dueIn} días</div>
          </div>
          <Tag tone="ink" solid dot>Por pagar</Tag>
        </div>

        <div className="relative flex items-baseline gap-1.5 mb-5">
          <span style={{ fontSize: 14, color: "rgba(244,239,230,0.6)" }}>$</span>
          <span style={{ fontFamily: "var(--cc-font-display)", fontSize: 54, lineHeight: 1, letterSpacing: "-0.02em" }}>
            {billing.amount.toLocaleString("es-CL")}
          </span>
          <span className="font-mono ml-1.5" style={{ fontSize: 11, color: "rgba(244,239,230,0.5)" }}>CLP</span>
        </div>

        <Link href="/expenses">
          <Button variant="copper" size="lg" block>
            Pagar ahora <ArrowRight size={16} />
          </Button>
        </Link>
      </div>

      {/* For today — grid */}
      <Eyebrow className="mt-5 mb-3">Para hoy</Eyebrow>
      <div className="grid grid-cols-2 gap-2.5 mb-3.5">
        <QuickCard
          icon={<Waves size={14} color="var(--cc-sage)" />}
          tint="var(--cc-sage-tint)"
          eyebrow="Reserva"
          title="Piscina"
          sub="Sáb · 11:00 – 12:30"
        />
        <QuickCard
          icon={<Droplets size={14} color="#3B82F6" />}
          tint="rgba(96,165,250,0.12)"
          eyebrow="Consumo agua"
          title="8.4 m³"
          sub="−12% vs abril"
          subColor="var(--cc-sage)"
        />
      </div>

      {/* Announcement */}
      <Link
        href="/feed"
        className="flex gap-3 items-start mb-3.5 bg-paper border rounded-xl"
        style={{ borderColor: "var(--cc-line)", borderRadius: 18, padding: 16 }}
      >
        <div
          className="grid place-items-center shrink-0"
          style={{ width: 36, height: 36, borderRadius: 10, background: "var(--cc-copper-tint)", color: "var(--cc-copper)" }}
        >
          <BellRing size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Tag tone="copper" size="sm">Asamblea</Tag>
            <span className="font-mono" style={{ fontSize: 10, color: "var(--cc-ink-tertiary)" }}>hace 2h</span>
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.35, fontWeight: 500 }}>Asamblea ordinaria de copropietarios</div>
          <div style={{ fontSize: 12, color: "var(--cc-ink-muted)", marginTop: 4, lineHeight: 1.4 }}>
            Sáb 30 de mayo, 19:00 — Salón comunitario.
          </div>
        </div>
        <ChevronRight size={16} color="var(--cc-ink-faint)" />
      </Link>

      {/* Coco prompt */}
      <Link
        href="/chat"
        className="flex items-center gap-3 bg-paper sticky bottom-0 mt-2"
        style={{
          borderRadius: 999,
          padding: "14px 18px",
          border: "1px solid var(--cc-line-strong)",
          boxShadow: "var(--cc-shadow-lg)",
        }}
      >
        <div
          className="grid place-items-center"
          style={{ width: 26, height: 26, borderRadius: 999, background: "var(--cc-ink)", color: "var(--cc-copper-soft)" }}
        >
          <Sparkles size={12} color="var(--cc-copper-soft)" />
        </div>
        <span className="flex-1 text-left" style={{ fontSize: 13, color: "var(--cc-ink-muted)" }}>
          Pregúntale a Coco…
        </span>
        <Mic size={16} color="var(--cc-ink-tertiary)" />
      </Link>
    </div>
  );
}

function QuickCard({
  icon, tint, eyebrow, title, sub, subColor,
}: { icon: React.ReactNode; tint: string; eyebrow: string; title: string; sub: string; subColor?: string }) {
  return (
    <div className="border rounded-xl" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)", padding: 16, borderRadius: 18 }}>
      <div className="flex items-center gap-2 mb-4">
        <div className="grid place-items-center" style={{ width: 28, height: 28, borderRadius: 8, background: tint }}>
          {icon}
        </div>
        <div style={{ fontSize: 11, color: "var(--cc-ink-tertiary)" }}>{eyebrow}</div>
      </div>
      <div style={{ fontFamily: "var(--cc-font-display)", fontSize: 20, lineHeight: 1.05, marginBottom: 4 }}>{title}</div>
      <div className="font-mono" style={{ fontSize: 11, color: subColor ?? "var(--cc-ink-muted)" }}>{sub}</div>
    </div>
  );
}
