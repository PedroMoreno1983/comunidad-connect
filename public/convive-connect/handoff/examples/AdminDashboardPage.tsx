/* src/app/(dashboard)/admin/page.tsx ────────────────────────── */
"use client";

import * as React from "react";
import { Users, Bell, Wrench, Coins, CheckSquare, ChevronRight } from "lucide-react";
import { AdminShell } from "@/components/cc/AdminShell";
import { KpiCard } from "@/components/cc/KpiCard";
import { Tag } from "@/components/cc/Tag";
import { Eyebrow, DisplayHeading } from "@/components/cc/Eyebrow";
import { Button } from "@/components/cc/Button";

/**
 * Panel administrador — Resumen del edificio (premium).
 *
 * El AdminShell aquí va en src/app/(dashboard)/layout.tsx normalmente;
 * lo mostramos completo para que veas el ensamble.
 */
export default function AdminDashboardPage() {
  return (
    <AdminShell
      activeHref="/admin"
      role="admin"
      user={{ name: "Javier Lobos", initials: "JL", roleLabel: "Administrador" }}
      building="Edificio Aurelia"
      rightSubtitle="Lunes, 25 de mayo · 14:32"
      cta={{ label: "Anuncio", href: "/comunicaciones/nuevo" }}
    >
      {/* Page title */}
      <div className="flex items-end justify-between mb-7">
        <div>
          <Eyebrow className="mb-2">Panel administrador</Eyebrow>
          <DisplayHeading size={40}>
            Tu edificio, <em>de un vistazo</em>
          </DisplayHeading>
        </div>
        <div className="flex gap-2">
          {(["7D", "30D", "90D", "YTD"] as const).map((p, i) => (
            <button
              key={p}
              className="font-mono"
              style={{
                padding: "8px 14px",
                borderRadius: 10,
                fontSize: 12,
                background: i === 1 ? "var(--cc-ink)" : "var(--cc-paper)",
                color: i === 1 ? "var(--cc-paper)" : "var(--cc-ink-muted)",
                border: i === 1 ? "none" : "1px solid var(--cc-line)",
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3.5 mb-4">
        <KpiCard
          eyebrow="Residentes activos"
          value="186"
          sub="/ 192 unidades"
          trend={{ value: "+3", direction: "up" }}
          icon={<Users size={15} />}
          tone="sage"
        />
        <KpiCard
          eyebrow="Cobranza mayo"
          value="92%"
          sub="$31.4M de $34.1M"
          trend={{ value: "+4 pp", direction: "up" }}
          icon={<Coins size={15} />}
          tone="copper"
        />
        <KpiCard
          eyebrow="Solicitudes abiertas"
          value="12"
          sub="3 críticas"
          trend={{ value: "−2", direction: "up" }}
          icon={<Wrench size={15} />}
          tone="amber"
        />
        <KpiCard
          eyebrow="Quórum próxima asamblea"
          value="64%"
          sub="Falta 11% para sesionar"
          trend={{ value: "Sáb 30" }}
          icon={<CheckSquare size={15} />}
          tone="plum"
        />
      </div>

      {/* Resto del dashboard — replica el patrón del prototipo:
          - Recaudación mensual (chart)
          - Solicitudes activas (lista)
          - Gastos por categoría (donut)
          - Uso de amenidades (bars)
          - Votación activa (card dark)
         Mira examples del prototipo en screens-desktop.jsx. */}
    </AdminShell>
  );
}
