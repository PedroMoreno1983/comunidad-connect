import Link from "next/link";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Briefcase,
  Building2,
  Flame,
  MapPin,
  ShieldAlert,
  UserRound,
  Users,
  Waves,
} from "lucide-react";

import { DistributionChart } from "@/components/charts/distribution-chart";
import { CompanySwitcher } from "@/components/company-switcher";
import { Badge } from "@/components/ui/badge";
import { getPeopleDashboard } from "@/lib/analytics/people-summary";
import type { PeopleDashboard } from "@/lib/analytics/types";
import { listCompanies } from "@/lib/company";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type PeoplePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const toneSurface = {
  critical:
    "border-rose-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,241,242,0.92))]",
  warning:
    "border-amber-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,247,237,0.92))]",
} as const;

const signalFill = {
  critical: "bg-rose-500",
  warning: "bg-amber-500",
  neutral: "bg-slate-400",
} as const;

function formatRiskScore(value: number) {
  return `${value.toFixed(0)}/100`;
}

function formatOptionalScore(value: number | null, suffix = "/100") {
  if (value == null) {
    return "N/D";
  }

  return `${value.toFixed(0)}${suffix}`;
}

function formatPerformanceDelta(value: number | null) {
  if (value == null) {
    return "Sin comparativo";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(1)} vs. ciclo previo`;
}

function KpiCard({
  label,
  value,
  detail,
  tone,
  index,
}: PeopleDashboard["kpis"][number] & { index: number }) {
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

function AlertMetricCell({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[20px] border border-slate-200 bg-white/78 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function AlertCard({
  alert,
  priority,
}: {
  alert: PeopleDashboard["alerts"][number];
  priority: number;
}) {
  return (
    <div
      className={cn(
        "rounded-[32px] border p-6 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.46)]",
        toneSurface[alert.tone],
      )}
    >
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Prioridad 0{priority}
            </span>
            <Badge variant={alert.tone}>{alert.status}</Badge>
          </div>

          <h2 className="mt-4 font-serif text-3xl font-semibold tracking-tight text-slate-950">
            {alert.name}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {alert.jobTitle ?? "Rol no informado"}
            {alert.externalCode ? ` / ${alert.externalCode}` : ""}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/78 px-3 py-1.5 text-xs text-slate-600">
              <Building2 className="size-3.5" />
              {alert.departmentName}
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/78 px-3 py-1.5 text-xs text-slate-600">
              <UserRound className="size-3.5" />
              {alert.managerName}
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/78 px-3 py-1.5 text-xs text-slate-600">
              <MapPin className="size-3.5" />
              {[alert.location, alert.workMode].filter(Boolean).join(" / ") ||
                "Ubicacion no informada"}
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/78 px-3 py-1.5 text-xs text-slate-600">
              <Briefcase className="size-3.5" />
              Tenure {alert.tenureLabel}
            </div>
          </div>
        </div>

        <div className="grid min-w-[280px] gap-3 sm:grid-cols-2 xl:w-[320px]">
          <AlertMetricCell label="Fuga" value={formatRiskScore(alert.attritionRisk)} />
          <AlertMetricCell label="Burnout" value={formatRiskScore(alert.burnoutRisk)} />
          <AlertMetricCell
            label="Engagement"
            value={formatOptionalScore(alert.latestEngagementScore)}
          />
          <AlertMetricCell
            label="Desempeno"
            value={
              alert.latestPerformanceScore == null
                ? "N/D"
                : `${alert.latestPerformanceScore.toFixed(1)}/5`
            }
          />
        </div>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(300px,0.92fr)]">
        <div className="space-y-4">
          <SignalBar
            label="Riesgo de fuga"
            value={alert.attritionRisk}
            display={formatRiskScore(alert.attritionRisk)}
            tone={alert.tone}
          />
          <SignalBar
            label="Riesgo de burnout"
            value={alert.burnoutRisk}
            display={formatRiskScore(alert.burnoutRisk)}
            tone={alert.tone}
          />
          <SignalBar
            label="Carga sostenible"
            value={alert.latestWorkloadScore ?? 0}
            display={formatOptionalScore(alert.latestWorkloadScore)}
            tone={alert.latestWorkloadScore == null ? "neutral" : alert.tone}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <AlertMetricCell
            label="Soporte manager"
            value={formatOptionalScore(alert.latestManagerSupportScore)}
          />
          <AlertMetricCell
            label="Ausencias 90d"
            value={`${alert.absenceDaysLast90} dias`}
          />
          <AlertMetricCell
            label="Ultima promocion"
            value={alert.lastPromotionDate ?? "Sin registro"}
          />
          <AlertMetricCell
            label="Performance delta"
            value={formatPerformanceDelta(alert.performanceDelta)}
          />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {alert.topDrivers.map((driver) => (
          <Badge key={`${alert.employeeId}-${driver}`} variant="neutral">
            {driver}
          </Badge>
        ))}
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(260px,0.95fr)]">
        <div className="rounded-[24px] border border-slate-200 bg-white/78 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Siguiente accion sugerida
          </p>
          <p className="mt-2 text-sm leading-7 text-slate-700">{alert.nextAction}</p>
        </div>
        <div className="rounded-[24px] border border-slate-200 bg-white/78 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Lectura operativa
          </p>
          <p className="mt-2 text-sm leading-7 text-slate-700">
            {formatPerformanceDelta(alert.performanceDelta)}. El foco inmediato es
            contener la senal dominante antes de que escale a salida o desgaste
            sostenido.
          </p>
        </div>
      </div>
    </div>
  );
}

function DriverCard({
  driver,
}: {
  driver: PeopleDashboard["topDrivers"][number];
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white/86 p-4">
      <div className="flex items-center justify-between gap-3">
        <Badge variant={driver.tone}>{driver.label}</Badge>
        <span className="text-sm font-semibold text-slate-950">
          {driver.value} personas
        </span>
      </div>
      <p className="mt-3 text-sm leading-7 text-slate-700">{driver.action}</p>
      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        Presente en {driver.share}% de la cola actual
      </p>
    </div>
  );
}

function ManagerCard({
  manager,
}: {
  manager: PeopleDashboard["managerHotspots"][number];
}) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(243,247,249,0.92))] p-5 shadow-[0_20px_56px_-42px_rgba(15,23,42,0.4)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-950">{manager.managerName}</h2>
            <Badge variant={manager.criticalCount > 0 ? "critical" : "warning"}>
              {manager.alertsCount} alertas
            </Badge>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {[manager.role, manager.departmentName].filter(Boolean).join(" / ")}
          </p>
        </div>
        <div className="rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-right">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Equipo
          </p>
          <p className="mt-1 font-semibold text-slate-950">{manager.teamSize} reportes</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <AlertMetricCell label="Criticas" value={String(manager.criticalCount)} />
        <AlertMetricCell
          label="Fuga prom."
          value={formatRiskScore(manager.attritionRiskAvg)}
        />
        <AlertMetricCell
          label="Burnout prom."
          value={formatRiskScore(manager.burnoutRiskAvg)}
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {manager.topDrivers.map((driver) => (
          <Badge key={`${manager.managerId}-${driver}`} variant="neutral">
            {driver}
          </Badge>
        ))}
      </div>

      <p className="mt-5 text-sm leading-7 text-slate-700">{manager.recommendation}</p>
    </div>
  );
}

export default async function PeoplePage(props: PeoplePageProps) {
  const searchParams = await props.searchParams;
  const selectedCompanyId =
    typeof searchParams.companyId === "string" ? searchParams.companyId : undefined;
  const [dashboard, companies] = await Promise.all([
    getPeopleDashboard(selectedCompanyId),
    listCompanies(),
  ]);

  if (!dashboard) {
    return (
      <div className="rounded-[32px] border border-slate-200 bg-white/90 p-8">
        <p className="text-sm text-slate-500">
          Aun no hay una cola de personas priorizadas disponible. Carga el seed y
          ejecuta primero el pipeline de analytics.
        </p>
      </div>
    );
  }

  const criticalAlerts = dashboard.alerts.filter((alert) => alert.tone === "critical").length;
  const highAttritionShare =
    dashboard.attritionDistribution.find((bucket) => bucket.label === "Alto")?.value ?? 0;
  const highBurnoutShare =
    dashboard.burnoutDistribution.find((bucket) => bucket.label === "Alto")?.value ?? 0;
  const topManager = dashboard.managerHotspots[0];
  const topDriver = dashboard.topDrivers[0];

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[38px] border border-[#17314f]/12 bg-[radial-gradient(circle_at_top_left,rgba(35,87,133,0.28),transparent_34%),radial-gradient(circle_at_82%_18%,rgba(208,145,76,0.14),transparent_24%),linear-gradient(135deg,rgba(249,247,242,0.98)_0%,rgba(239,244,247,0.98)_52%,rgba(255,255,255,1)_100%)] p-8 shadow-[0_38px_120px_-54px_rgba(16,33,60,0.72)] lg:p-10">
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <Badge variant="neutral">Alertas de personas</Badge>
              <div className="w-full max-w-sm">
                <CompanySwitcher
                  companies={companies}
                  selectedCompanyId={dashboard.companyId}
                />
              </div>
            </div>

            <div className="mt-8 max-w-4xl">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                Cola priorizada de intervencion
              </p>
              <h1 className="mt-4 font-serif text-5xl font-semibold tracking-tight text-slate-950 lg:text-6xl">
                La demo ya muestra a quien intervenir, por que y con que
                conversacion abrir.
              </h1>
              <p className="mt-5 max-w-3xl text-base leading-8 text-slate-600">
                Esta vista traduce la salud organizacional en decisiones concretas:
                personas en riesgo, managers con presion acumulada y drivers que ya
                justifican una accion priorizada para liderazgo y People.
              </p>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {[
                {
                  icon: ShieldAlert,
                  label: "Alertas activas",
                  value: String(dashboard.alerts.length),
                },
                {
                  icon: Flame,
                  label: "Criticas",
                  value: String(criticalAlerts),
                },
                {
                  icon: Waves,
                  label: "Burnout alto",
                  value: `${highBurnoutShare}%`,
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
                href={`/dashboard?companyId=${dashboard.companyId}`}
                className="inline-flex items-center gap-2 rounded-full border border-[#17314f]/15 bg-[#17314f] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_-24px_rgba(23,49,79,0.8)] transition hover:bg-[#21486f]"
              >
                Volver al dashboard ejecutivo
                <ArrowUpRight className="size-4" />
              </Link>
              <Link
                href={`/departments?companyId=${dashboard.companyId}`}
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
                    Responsable bajo presion
                  </p>
                  <h2 className="mt-3 font-serif text-3xl font-semibold tracking-tight">
                    {topManager?.managerName ?? "Sin datos"}
                  </h2>
                </div>
                <Users className="size-5 text-slate-300" />
              </div>
              <p className="mt-4 text-sm leading-7 text-slate-300">
                {topManager
                  ? `${topManager.departmentName} / ${topManager.alertsCount} alertas activas / recomendacion: ${topManager.recommendation}`
                  : "Aun no hay managers con foco operativo."}
              </p>

              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="rounded-[22px] border border-white/12 bg-white/8 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Fuga promedio
                  </p>
                  <p className="mt-3 text-2xl font-semibold">
                    {topManager ? formatRiskScore(topManager.attritionRiskAvg) : "N/D"}
                  </p>
                </div>
                <div className="rounded-[22px] border border-white/12 bg-white/8 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Burnout promedio
                  </p>
                  <p className="mt-3 text-2xl font-semibold">
                    {topManager ? formatRiskScore(topManager.burnoutRiskAvg) : "N/D"}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[32px] border border-slate-200/80 bg-white/90 p-6 shadow-[0_26px_80px_-46px_rgba(15,23,42,0.45)]">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                Driver dominante
              </p>
              <h2 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-slate-950">
                {topDriver?.label ?? "Sin dato dominante"}
              </h2>
              <p className="mt-4 text-sm leading-7 text-slate-600">
                {topDriver
                  ? `${topDriver.share}% de la cola actual comparte esta senal. ${topDriver.action}`
                  : "Aun no hay drivers destacados en la cola actual."}
              </p>

              <div className="mt-6 rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-950">
                    Riesgo alto de fuga
                  </span>
                  <span className="text-sm font-semibold text-slate-950">
                    {highAttritionShare}%
                  </span>
                </div>
                <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-rose-500"
                    style={{ width: `${Math.max(10, highAttritionShare)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {dashboard.kpis.map((item, index) => (
          <KpiCard key={item.label} index={index} {...item} />
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.16fr)_minmax(360px,0.84fr)]">
        <div className="rounded-[34px] border border-slate-200/80 bg-white/88 p-6 shadow-[0_28px_90px_-50px_rgba(15,23,42,0.5)] lg:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                Cola priorizada
              </p>
              <h2 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-slate-950">
                Personas que requieren intervencion primero.
              </h2>
              <p className="mt-4 text-sm leading-7 text-slate-600">
                Cada tarjeta mezcla riesgo, contexto y siguiente accion para que la
                demo no se vea como un score aislado sino como una herramienta para
                operar personas con criterio.
              </p>
            </div>
            <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-600">
              {dashboard.alerts.length} casos visibles / {criticalAlerts} criticos
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {dashboard.alerts.map((alert, index) => (
              <AlertCard key={alert.employeeId} alert={alert} priority={index + 1} />
            ))}
          </div>
        </div>

        <div className="grid gap-6">
          <div className="rounded-[34px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(242,246,249,0.94))] p-6 shadow-[0_26px_80px_-48px_rgba(15,23,42,0.45)]">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              Distribucion de riesgo
            </p>
            <h2 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-slate-950">
              Fuga y burnout se miran por separado.
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-600">
              Esto ayuda a distinguir si la presion actual tiene mas cara de salida,
              mas cara de desgaste o ambas al mismo tiempo.
            </p>

            <div className="mt-6 grid gap-5">
              <div className="rounded-[24px] border border-slate-200 bg-white/82 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-950">Riesgo de fuga</p>
                  <Flame className="size-4 text-rose-500" />
                </div>
                <DistributionChart data={dashboard.attritionDistribution} />
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-white/82 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-950">
                    Riesgo de burnout
                  </p>
                  <Activity className="size-4 text-amber-500" />
                </div>
                <DistributionChart data={dashboard.burnoutDistribution} />
              </div>
            </div>
          </div>

          <div className="rounded-[34px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(245,248,250,0.94))] p-6 shadow-[0_26px_80px_-48px_rgba(15,23,42,0.45)]">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              Palancas prioritarias
            </p>
            <h2 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-slate-950">
              Drivers que hoy explican la cola actual.
            </h2>

            <div className="mt-6 space-y-3">
              {dashboard.topDrivers.map((driver) => (
                <DriverCard key={driver.label} driver={driver} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[34px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(246,248,250,0.94))] p-6 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.45)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              Managers bajo presion
            </p>
            <h2 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-slate-950">
              El riesgo individual se convierte en foco operativo por lider.
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-600">
              Esta capa vuelve la demo mucho mas vendible porque muestra donde el
              negocio puede actuar, no solo donde existe un problema.
            </p>
          </div>
          <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-600">
            {dashboard.managerHotspots.length} managers visibles
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {dashboard.managerHotspots.map((manager) => (
            <ManagerCard key={manager.managerId} manager={manager} />
          ))}
        </div>
      </section>

      <section className="rounded-[34px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(246,248,250,0.94))] p-6 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.45)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              Siguiente lectura
            </p>
            <h2 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-slate-950">
              El recorrido comercial queda conectado de punta a punta.
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-600">
              Dashboard ejecutivo, cola de personas y vista por equipos ya hablan el
              mismo idioma y muestran una historia consistente para socios y clientes.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/departments?companyId=${dashboard.companyId}`}
              className="inline-flex items-center gap-2 rounded-full border border-[#17314f]/14 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
            >
              Ver managers y equipos
              <ArrowUpRight className="size-4" />
            </Link>
            <Link
              href={`/upload?companyId=${dashboard.companyId}`}
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
