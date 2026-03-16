import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Building2,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Users2,
} from "lucide-react";

import { CompanySwitcher } from "@/components/company-switcher";
import { DistributionChart } from "@/components/charts/distribution-chart";
import { LineTrendChart } from "@/components/charts/line-trend-chart";
import { Badge } from "@/components/ui/badge";
import { getExecutiveSummary } from "@/lib/analytics/summary";
import type { ExecutiveSummary } from "@/lib/analytics/types";
import { listCompanies } from "@/lib/company";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const departmentToneOrder = {
  critical: 0,
  warning: 1,
  positive: 2,
} as const;

const toneSurface = {
  critical:
    "border-rose-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,241,242,0.92))]",
  warning:
    "border-amber-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,247,237,0.92))]",
  positive:
    "border-emerald-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(236,253,245,0.92))]",
  neutral:
    "border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(241,245,249,0.92))]",
} as const;

const signalFill = {
  critical: "bg-rose-500",
  warning: "bg-amber-500",
  positive: "bg-emerald-500",
  neutral: "bg-slate-400",
} as const;

function formatPercentage(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatScore(value: number) {
  return `${value.toFixed(0)}/100`;
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getMetricCellTone(
  kind: "risk" | "engagement" | "turnover" | "absence" | "neutral",
  value: number,
) {
  if (kind === "neutral") {
    return "neutral";
  }

  if (kind === "engagement") {
    if (value < 60) {
      return "critical";
    }

    if (value < 72) {
      return "warning";
    }

    return "positive";
  }

  if (kind === "turnover") {
    if (value > 0.06) {
      return "critical";
    }

    if (value > 0.03) {
      return "warning";
    }

    return "positive";
  }

  if (kind === "absence") {
    if (value > 0.08) {
      return "critical";
    }

    if (value > 0.04) {
      return "warning";
    }

    return "positive";
  }

  if (value >= 60) {
    return "critical";
  }

  if (value >= 40) {
    return "warning";
  }

  return "positive";
}

function getExecutiveStatus(
  criticalCount: number,
  warningCount: number,
  highRiskShare: number,
) {
  if (criticalCount >= 2 || highRiskShare >= 18) {
    return {
      label: "Intervencion inmediata",
      description:
        "Hay concentracion material de riesgo. La lectura ejecutiva debe ir directo a decisiones por area y manager.",
    };
  }

  if (criticalCount >= 1 || warningCount >= 2 || highRiskShare >= 10) {
    return {
      label: "Monitoreo activo",
      description:
        "La organizacion sigue operando, pero ya existen senales tempranas que conviene contener antes de que escalen.",
    };
  }

  return {
    label: "Estabilidad controlada",
    description:
      "La salud organizacional se ve contenida y permite enfocar a liderazgo en prevencion y performance sostenida.",
  };
}

function getTrendDelta<T extends Record<string, string | number>>(
  data: T[],
  key: keyof T,
) {
  if (data.length < 2) {
    return 0;
  }

  const first = Number(data[0]?.[key] ?? 0);
  const last = Number(data[data.length - 1]?.[key] ?? 0);

  return last - first;
}

function sortDepartments(summary: ExecutiveSummary) {
  return [...summary.departmentHealth].sort((left, right) => {
    const toneDelta = departmentToneOrder[left.tone] - departmentToneOrder[right.tone];
    if (toneDelta !== 0) {
      return toneDelta;
    }

    const leftScore =
      left.attritionRiskAvg + left.burnoutRiskAvg - left.engagementScore * 0.45;
    const rightScore =
      right.attritionRiskAvg + right.burnoutRiskAvg - right.engagementScore * 0.45;

    return rightScore - leftScore;
  });
}

function KpiCard({
  label,
  value,
  detail,
  tone,
  index,
}: ExecutiveSummary["kpis"][number] & { index: number }) {
  const accents = {
    critical:
      "border-rose-200/80 bg-[radial-gradient(circle_at_top_right,rgba(251,113,133,0.18),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(255,241,242,0.9))]",
    warning:
      "border-amber-200/80 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.18),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(255,247,237,0.9))]",
    positive:
      "border-emerald-200/80 bg-[radial-gradient(circle_at_top_right,rgba(52,211,153,0.18),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(236,253,245,0.9))]",
    neutral:
      "border-slate-200/80 bg-[radial-gradient(circle_at_top_right,rgba(71,85,105,0.12),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(241,245,249,0.92))]",
  } as const;

  return (
    <div
      className={cn(
        "rounded-[30px] border p-5 shadow-[0_22px_60px_-44px_rgba(15,23,42,0.45)]",
        accents[tone],
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
          {label}
        </p>
        <span className="text-xs font-medium text-slate-400">0{index + 1}</span>
      </div>
      <p className="mt-5 font-serif text-4xl font-semibold tracking-tight text-slate-950">
        {value}
      </p>
      <p className="mt-3 text-sm leading-6 text-slate-600">{detail}</p>
    </div>
  );
}

function TrendFlag({
  delta,
  kind,
}: {
  delta: number;
  kind: "better-when-down" | "better-when-up";
}) {
  const positiveDirection =
    kind === "better-when-down" ? delta <= 0 : delta >= 0;
  const Icon = positiveDirection ? TrendingUp : TrendingDown;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em]",
        positiveDirection
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-rose-200 bg-rose-50 text-rose-700",
      )}
    >
      <Icon className="size-3.5" />
      {delta === 0 ? "Sin cambio material" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`}
    </div>
  );
}

function MetricCell({
  label,
  value,
  display,
  kind,
}: {
  label: string;
  value: number;
  display: string;
  kind: "risk" | "engagement" | "turnover" | "absence" | "neutral";
}) {
  const tone = getMetricCellTone(kind, value);

  return (
    <div
      className={cn(
        "rounded-[20px] border px-4 py-3",
        toneSurface[tone],
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold text-slate-950">{display}</p>
    </div>
  );
}

function SignalBar({
  label,
  value,
  display,
  tone,
}: {
  label: string;
  value: number;
  display: string;
  tone: keyof typeof signalFill;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="font-semibold text-slate-900">{display}</span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200/80">
        <div
          className={cn("h-full rounded-full", signalFill[tone])}
          style={{ width: `${Math.max(8, Math.min(value, 100))}%` }}
        />
      </div>
    </div>
  );
}

function DepartmentRow({
  department,
  priority,
  maxHeadcount,
}: {
  department: ExecutiveSummary["departmentHealth"][number];
  priority: number;
  maxHeadcount: number;
}) {
  const headcountShare = Math.round((department.headcount / maxHeadcount) * 100);

  return (
    <div
      className={cn(
        "rounded-[30px] border p-5 shadow-[0_18px_48px_-36px_rgba(15,23,42,0.42)]",
        toneSurface[department.tone],
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-semibold text-slate-950">{department.name}</h3>
            <Badge variant={department.tone}>{department.health}</Badge>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Dotacion {department.headcount} colaboradores / Rotacion{" "}
            {formatPercentage(department.turnoverRate)} / Ausentismo{" "}
            {formatPercentage(department.absenteeismRate)}
          </p>
        </div>

        <div className="rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          Prioridad 0{priority}
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
        <div className="space-y-4">
          <SignalBar
            label="Riesgo de fuga"
            value={department.attritionRiskAvg}
            display={formatScore(department.attritionRiskAvg)}
            tone={getMetricCellTone("risk", department.attritionRiskAvg)}
          />
          <SignalBar
            label="Riesgo de burnout"
            value={department.burnoutRiskAvg}
            display={formatScore(department.burnoutRiskAvg)}
            tone={getMetricCellTone("risk", department.burnoutRiskAvg)}
          />
          <SignalBar
            label="Engagement"
            value={department.engagementScore}
            display={formatScore(department.engagementScore)}
            tone={getMetricCellTone("engagement", department.engagementScore)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <MetricCell
            label="Fuga"
            value={department.attritionRiskAvg}
            display={formatScore(department.attritionRiskAvg)}
            kind="risk"
          />
          <MetricCell
            label="Burnout"
            value={department.burnoutRiskAvg}
            display={formatScore(department.burnoutRiskAvg)}
            kind="risk"
          />
          <MetricCell
            label="Engagement"
            value={department.engagementScore}
            display={formatScore(department.engagementScore)}
            kind="engagement"
          />
          <MetricCell
            label="Escala equipo"
            value={headcountShare / 100}
            display={`${department.headcount} pers.`}
            kind="neutral"
          />
        </div>
      </div>
    </div>
  );
}

export default async function DashboardPage(props: PageProps<"/dashboard">) {
  const searchParams = await props.searchParams;
  const selectedCompanyId =
    typeof searchParams.companyId === "string" ? searchParams.companyId : undefined;
  const [summary, companies] = await Promise.all([
    getExecutiveSummary(selectedCompanyId),
    listCompanies(),
  ]);

  if (!summary) {
    return (
      <div className="rounded-[32px] border border-slate-200 bg-white/90 p-8">
        <p className="text-sm text-slate-500">
          Aun no hay analitica ejecutiva disponible. Carga el seed y ejecuta primero
          el pipeline de analytics.
        </p>
      </div>
    );
  }

  const rankedDepartments = sortDepartments(summary);
  const topDepartment = rankedDepartments[0];
  const healthiestDepartment = [...summary.departmentHealth].sort(
    (left, right) =>
      right.engagementScore - right.attritionRiskAvg * 0.35 - right.burnoutRiskAvg * 0.35 -
      (left.engagementScore - left.attritionRiskAvg * 0.35 - left.burnoutRiskAvg * 0.35),
  )[0];
  const criticalCount = summary.departmentHealth.filter(
    (department) => department.tone === "critical",
  ).length;
  const warningCount = summary.departmentHealth.filter(
    (department) => department.tone === "warning",
  ).length;
  const monitoredCount = criticalCount + warningCount;
  const highRiskShare =
    summary.attritionDistribution.find((bucket) => bucket.label === "Alto")?.value ?? 0;
  const executiveStatus = getExecutiveStatus(
    criticalCount,
    warningCount,
    highRiskShare,
  );
  const maxHeadcount = Math.max(
    ...summary.departmentHealth.map((department) => department.headcount),
    1,
  );
  const turnoverDelta = getTrendDelta(summary.turnoverTrend, "turnoverRate") * 100;
  const engagementDelta = getTrendDelta(summary.engagementTrend, "engagementScore");
  const avgBurnout = average(
    summary.departmentHealth.map((department) => department.burnoutRiskAvg),
  );

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[38px] border border-[#17314f]/12 bg-[radial-gradient(circle_at_top_left,rgba(35,87,133,0.28),transparent_34%),radial-gradient(circle_at_82%_18%,rgba(92,147,142,0.18),transparent_24%),linear-gradient(135deg,rgba(249,247,242,0.98)_0%,rgba(239,244,247,0.98)_52%,rgba(255,255,255,1)_100%)] p-8 shadow-[0_38px_120px_-54px_rgba(16,33,60,0.72)] lg:p-10">
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <Badge variant="neutral">Comite ejecutivo</Badge>
              <div className="w-full max-w-sm">
                <CompanySwitcher
                  companies={companies}
                  selectedCompanyId={summary.companyId}
                />
              </div>
            </div>

            <div className="mt-8 max-w-4xl">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                Una sola vista de salud organizacional
              </p>
              <h1 className="mt-4 font-serif text-5xl font-semibold tracking-tight text-slate-950 lg:text-6xl">
                Liderazgo puede ver donde esta la presion, cuanto arriesga y que
                requiere accion primero.
              </h1>
              <p className="mt-5 max-w-3xl text-base leading-8 text-slate-600">
                {summary.companyName} aparece aqui como una historia ejecutiva completa:
                salud general, concentracion de riesgo, tendencia reciente e
                intervenciones prioritarias por area. Sin reportes planos, sin lectura
                tecnica, sin perder contexto de negocio.
              </p>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {[
                {
                  icon: Building2,
                  label: "Corte mas reciente",
                  value: summary.latestMonth ?? "N/D",
                },
                {
                  icon: ShieldAlert,
                  label: "Equipos monitoreados",
                  value: `${monitoredCount} de ${summary.departmentHealth.length}`,
                },
                {
                  icon: Users2,
                  label: "Riesgo alto de fuga",
                  value: `${highRiskShare}%`,
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-[28px] border border-white/70 bg-white/72 p-5 backdrop-blur shadow-[0_24px_60px_-44px_rgba(15,23,42,0.6)]"
                >
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    <item.icon className="size-4" />
                    {item.label}
                  </div>
                  <p className="mt-4 font-serif text-3xl font-semibold text-slate-950">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href={`/people?companyId=${summary.companyId}`}
                className="inline-flex items-center gap-2 rounded-full border border-[#17314f]/15 bg-[#17314f] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_-24px_rgba(23,49,79,0.8)] transition hover:bg-[#21486f]"
              >
                Abrir alertas de personas
                <ArrowUpRight className="size-4" />
              </Link>
              <Link
                href={`/departments?companyId=${summary.companyId}`}
                className="inline-flex items-center gap-2 rounded-full border border-[#17314f]/14 bg-white/86 px-5 py-3 text-sm font-semibold text-slate-800 transition hover:bg-white"
              >
                Explorar equipos
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-[32px] border border-[#17314f]/10 bg-[linear-gradient(180deg,#10213c_0%,#17314f_58%,#1d4465_100%)] p-6 text-white shadow-[0_30px_80px_-42px_rgba(16,33,60,0.88)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-300">
                    Estado ejecutivo
                  </p>
                  <h2 className="mt-3 font-serif text-3xl font-semibold tracking-tight">
                    {executiveStatus.label}
                  </h2>
                </div>
                <AlertTriangle className="size-5 text-slate-300" />
              </div>
              <p className="mt-4 text-sm leading-7 text-slate-300">
                {executiveStatus.description}
              </p>

              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="rounded-[22px] border border-white/12 bg-white/8 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Burnout promedio
                  </p>
                  <p className="mt-3 text-2xl font-semibold">{formatScore(avgBurnout)}</p>
                </div>
                <div className="rounded-[22px] border border-white/12 bg-white/8 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Area mas estable
                  </p>
                  <p className="mt-3 text-xl font-semibold">
                    {healthiestDepartment?.name ?? "N/D"}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[32px] border border-slate-200/80 bg-white/90 p-6 shadow-[0_26px_80px_-46px_rgba(15,23,42,0.45)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                    Foco inmediato
                  </p>
                  <h2 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-slate-950">
                    {topDepartment?.name ?? "Sin datos"}
                  </h2>
                </div>
                {topDepartment ? <Badge variant={topDepartment.tone}>{topDepartment.health}</Badge> : null}
              </div>

              {topDepartment ? (
                <>
                  <p className="mt-4 text-sm leading-7 text-slate-600">
                    La combinacion de fuga, burnout y engagement ubica a esta area como
                    la conversacion prioritaria para el comite.
                  </p>

                  <div className="mt-6 grid grid-cols-2 gap-3">
                    <MetricCell
                      label="Fuga"
                      value={topDepartment.attritionRiskAvg}
                      display={formatScore(topDepartment.attritionRiskAvg)}
                      kind="risk"
                    />
                    <MetricCell
                      label="Burnout"
                      value={topDepartment.burnoutRiskAvg}
                      display={formatScore(topDepartment.burnoutRiskAvg)}
                      kind="risk"
                    />
                    <MetricCell
                      label="Engagement"
                      value={topDepartment.engagementScore}
                      display={formatScore(topDepartment.engagementScore)}
                      kind="engagement"
                    />
                    <MetricCell
                      label="Rotacion"
                      value={topDepartment.turnoverRate}
                      display={formatPercentage(topDepartment.turnoverRate)}
                      kind="turnover"
                    />
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {summary.kpis.map((kpi, index) => (
          <KpiCard key={kpi.label} index={index} {...kpi} />
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.16fr)_minmax(360px,0.84fr)]">
        <div className="rounded-[34px] border border-slate-200/80 bg-white/88 p-6 shadow-[0_28px_90px_-50px_rgba(15,23,42,0.5)] lg:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                Mapa de salud por area
              </p>
              <h2 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-slate-950">
                La lectura visual deja claro donde esta la presion.
              </h2>
              <p className="mt-4 text-sm leading-7 text-slate-600">
                Los equipos se ordenan primero por severidad y luego por intensidad de
                riesgo, para que liderazgo entre a la reunion sabiendo donde intervenir
                antes.
              </p>
            </div>
            <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-600">
              {criticalCount} criticos / {warningCount} en atencion
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {rankedDepartments.map((department, index) => (
              <DepartmentRow
                key={department.departmentId}
                department={department}
                priority={index + 1}
                maxHeadcount={maxHeadcount}
              />
            ))}
          </div>
        </div>

        <div className="grid gap-6">
          <div className="rounded-[34px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(242,246,249,0.94))] p-6 shadow-[0_26px_80px_-48px_rgba(15,23,42,0.45)]">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              Exposicion de fuga
            </p>
            <h2 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-slate-950">
              {highRiskShare}% de la dotacion cae en banda alta.
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-600">
              La distribucion muestra si el problema esta concentrado o si ya afecta a
              una parte significativa de la organizacion.
            </p>

            <DistributionChart data={summary.attritionDistribution} />

            <div className="mt-4 space-y-3">
              {summary.attritionDistribution.map((bucket) => (
                <div
                  key={bucket.label}
                  className="flex items-center justify-between rounded-[20px] border border-slate-200 bg-white/80 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "size-3 rounded-full",
                        signalFill[bucket.tone],
                      )}
                    />
                    <span className="text-sm font-medium text-slate-700">
                      {bucket.label}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-slate-950">
                    {bucket.value}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[34px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(245,248,250,0.94))] p-6 shadow-[0_26px_80px_-48px_rgba(15,23,42,0.45)]">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              Narrativa para liderazgo
            </p>
            <h2 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-slate-950">
              Lo que el comite deberia llevarse de esta lectura.
            </h2>

            <div className="mt-6 space-y-3">
              {summary.insights.map((insight, index) => (
                <div
                  key={`${index}-${insight}`}
                  className="rounded-[24px] border border-slate-200 bg-white/86 px-5 py-4 text-sm leading-7 text-slate-700"
                >
                  {insight}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-[34px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(241,246,248,0.94))] p-6 shadow-[0_26px_80px_-48px_rgba(15,23,42,0.45)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                Tendencia de rotacion
              </p>
              <h2 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-slate-950">
                La fuga no se mira como una foto; se mira como una curva.
              </h2>
              <p className="mt-4 text-sm leading-7 text-slate-600">
                Cuando la rotacion cambia de manera sostenida, el dashboard lo muestra
                como trayectoria y no como anomalia aislada.
              </p>
            </div>
            <TrendFlag delta={turnoverDelta} kind="better-when-down" />
          </div>

          <div className="mt-6 rounded-[28px] border border-slate-200 bg-white/82 p-5">
            <LineTrendChart
              data={summary.turnoverTrend}
              xKey="month"
              yKey="turnoverRate"
              stroke="#ca4c46"
              format="percent"
            />
          </div>
        </div>

        <div className="rounded-[34px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(241,247,247,0.94))] p-6 shadow-[0_26px_80px_-48px_rgba(15,23,42,0.45)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                Tendencia de engagement
              </p>
              <h2 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-slate-950">
                El clima se sigue con la misma disciplina que un KPI financiero.
              </h2>
              <p className="mt-4 text-sm leading-7 text-slate-600">
                Esta vista ayuda a detectar si la experiencia de los equipos se esta
                sosteniendo o si la organizacion empieza a desgastarse.
              </p>
            </div>
            <TrendFlag delta={engagementDelta} kind="better-when-up" />
          </div>

          <div className="mt-6 rounded-[28px] border border-slate-200 bg-white/82 p-5">
            <LineTrendChart
              data={summary.engagementTrend}
              xKey="month"
              yKey="engagementScore"
              stroke="#175a72"
              format="score"
            />
          </div>
        </div>
      </section>

      <section className="rounded-[34px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(246,248,250,0.94))] p-6 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.45)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              Siguiente paso
            </p>
            <h2 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-slate-950">
              Lleva la conversacion de salud organizacional a accion concreta.
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-600">
              Desde aqui la venta se entiende sola: comite ejecutivo, equipos y cola
              de personas hablan el mismo idioma y se conectan con un plan de accion.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/people?companyId=${summary.companyId}`}
              className="inline-flex items-center gap-2 rounded-full border border-[#17314f]/14 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
            >
              Ver personas en riesgo
              <ArrowUpRight className="size-4" />
            </Link>
            <Link
              href={`/upload?companyId=${summary.companyId}`}
              className="inline-flex items-center gap-2 rounded-full border border-[#17314f]/12 bg-[#e9f0f5] px-5 py-3 text-sm font-semibold text-[#17314f] transition hover:bg-[#dfeaf2]"
            >
              Revisar pipeline de datos
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
