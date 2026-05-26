"use client";

import * as React from "react";
import { Users, Wrench, Coins, CheckSquare } from "lucide-react";
import { KpiCard } from "@/components/cc/KpiCard";
import { Eyebrow, DisplayHeading } from "@/components/cc/Eyebrow";

export default function AdminDashboardPage() {
    return (
        <div className="space-y-6">
            {/* Page title */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-7">
                <div>
                    <Eyebrow className="mb-2">Panel administrador</Eyebrow>
                    <DisplayHeading size={40}>
                        Tu edificio, <em style={{ color: "var(--cc-copper)", fontStyle: "italic" }}>de un vistazo</em>
                    </DisplayHeading>
                </div>
                <div className="flex gap-2">
                    {(["7D", "30D", "90D", "YTD"] as const).map((p, i) => (
                        <button
                            key={p}
                            className="font-mono cursor-pointer"
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
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
        </div>
    );
}
