/* src/components/cc/KpiCard.tsx ─────────────────────────────── */
import * as React from "react";

type Trend = {
  /** Pre-formatted value e.g. "+4 pp", "↑ 6.2%", "−2". */
  value: string;
  direction?: "up" | "down" | "neutral";
};

type KpiTone = "copper" | "sage" | "amber" | "rose" | "plum" | "ink";
const TONE_BG: Record<KpiTone, string> = {
  copper: "var(--cc-copper-tint)",
  sage:   "var(--cc-sage-tint)",
  amber:  "var(--cc-amber-tint)",
  rose:   "var(--cc-rose-tint)",
  plum:   "var(--cc-plum-tint)",
  ink:    "rgba(26,22,17,0.05)",
};
const TONE_FG: Record<KpiTone, string> = {
  copper: "var(--cc-copper)",
  sage:   "var(--cc-sage)",
  amber:  "var(--cc-amber)",
  rose:   "var(--cc-rose)",
  plum:   "var(--cc-plum)",
  ink:    "var(--cc-ink)",
};

export type KpiCardProps = {
  eyebrow: string;
  /** Big number / display value. Pass as string for "+", "%" suffixes. */
  value: string | number;
  /** Smaller right-side context. e.g. "/ 192 unidades" or "$31.4M de $34.1M" */
  sub?: React.ReactNode;
  trend?: Trend;
  icon?: React.ReactNode;
  tone?: KpiTone;
  className?: string;
};

/**
 * KPI card used across admin/conserje dashboards.
 *
 *   <KpiCard
 *     eyebrow="Residentes activos"
 *     value="186"
 *     sub="/ 192 unidades"
 *     trend={{ value: "+3", direction: "up" }}
 *     icon={<Users size={15} />}
 *     tone="sage"
 *   />
 */
export function KpiCard({
  eyebrow,
  value,
  sub,
  trend,
  icon,
  tone = "copper",
  className = "",
}: KpiCardProps) {
  return (
    <div
      className={`bg-paper border border-[color:var(--cc-line)] rounded-xl p-5 ${className}`}
      style={{ borderRadius: 16 }}
    >
      <div className="flex items-start justify-between" style={{ marginBottom: 22 }}>
        {icon && (
          <div
            className="grid place-items-center"
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              background: TONE_BG[tone],
              color: TONE_FG[tone],
            }}
          >
            {icon}
          </div>
        )}
        {trend && (
          <div
            className="font-mono"
            style={{
              fontSize: 11,
              color: trend.direction === "down" ? "var(--cc-rose)" :
                     trend.direction === "up"   ? "var(--cc-sage)" :
                     "var(--cc-ink-muted)",
            }}
          >
            {trend.value}
          </div>
        )}
      </div>
      <div style={{ fontSize: 11, color: "var(--cc-ink-tertiary)", marginBottom: 6 }}>{eyebrow}</div>
      <div className="flex items-baseline gap-1.5">
        <span style={{ fontFamily: "var(--cc-font-display)", fontSize: 30, lineHeight: 1 }}>{value}</span>
        {sub && <span style={{ fontSize: 11, color: "var(--cc-ink-tertiary)" }}>{sub}</span>}
      </div>
    </div>
  );
}
