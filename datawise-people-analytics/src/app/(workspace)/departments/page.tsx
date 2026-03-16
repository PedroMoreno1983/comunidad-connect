import { Activity, Flame, Users } from "lucide-react";

import { CompanySwitcher } from "@/components/company-switcher";
import { SparklineChart } from "@/components/charts/sparkline-chart";
import { SectionCard } from "@/components/section-card";
import { Badge } from "@/components/ui/badge";
import { getDepartmentDashboard } from "@/lib/analytics/department-summary";
import { listCompanies } from "@/lib/company";

export const dynamic = "force-dynamic";

function formatPercentage(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export default async function DepartmentsPage(props: PageProps<"/departments">) {
  const searchParams = await props.searchParams;
  const selectedCompanyId =
    typeof searchParams.companyId === "string" ? searchParams.companyId : undefined;
  const [dashboard, companies] = await Promise.all([
    getDepartmentDashboard(selectedCompanyId),
    listCompanies(),
  ]);

  if (!dashboard) {
    return (
      <div className="rounded-[32px] border border-slate-200 bg-white/90 p-8">
        <p className="text-sm text-slate-500">
          Aun no hay analitica por areas disponible. Carga el seed y ejecuta primero el pipeline de analytics.
        </p>
      </div>
    );
  }

  const criticalCount = dashboard.departments.filter(
    (department) => department.tone === "critical",
  ).length;
  const warningCount = dashboard.departments.filter(
    (department) => department.tone === "warning",
  ).length;
  const healthyCount = dashboard.departments.filter(
    (department) => department.tone === "positive",
  ).length;

  return (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <div className="rounded-[34px] border border-slate-200/80 bg-white/90 p-8 shadow-[0_24px_80px_-40px_rgba(15,23,42,0.5)]">
          <Badge variant="neutral">Vista por equipos</Badge>
          <div className="mt-5 max-w-sm">
            <CompanySwitcher
              companies={companies}
              selectedCompanyId={dashboard.companyId}
            />
          </div>
          <h1 className="mt-5 font-serif text-4xl font-semibold tracking-tight text-slate-950">
            Salud de equipos en {dashboard.companyName}.
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600">
            Este espacio esta orientado a la operacion, no solo al comite ejecutivo:
            estado actual, contexto de tendencia, drivers recurrentes y senales que requieren intervencion primero.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              label: "En riesgo",
              value: criticalCount,
              icon: Flame,
              tone: "critical" as const,
            },
            {
              label: "Atencion",
              value: warningCount,
              icon: Activity,
              tone: "warning" as const,
            },
            {
              label: "Saludable",
              value: healthyCount,
              icon: Users,
              tone: "positive" as const,
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-[28px] border border-slate-200/80 bg-white/90 p-6"
            >
              <div className="flex items-center justify-between gap-3">
                <Badge variant={item.tone}>{item.label}</Badge>
                <item.icon className="size-4 text-slate-500" />
              </div>
              <p className="mt-4 font-serif text-4xl font-semibold text-slate-950">
                {item.value}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Equipos actualmente en este estado operativo.
              </p>
            </div>
          ))}
        </div>
      </section>

      <SectionCard
        eyebrow="Vista operativa"
        title="Tarjetas por area"
        description="Ordenadas primero por severidad y luego por riesgo promedio de fuga."
      >
        <div className="grid gap-5 xl:grid-cols-2">
          {dashboard.departments.map((department) => (
            <div
              key={department.departmentId}
              className="rounded-[28px] border border-slate-200 bg-white p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold text-slate-950">
                      {department.name}
                    </h2>
                    <Badge variant={department.tone}>{department.health}</Badge>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Ultimo mes {department.latestMonth ?? "N/D"} / Dotacion {department.headcount}
                  </p>
                </div>
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl bg-slate-50 p-3">
                  <dt className="text-slate-500">Rotacion</dt>
                  <dd className="mt-1 font-semibold text-slate-950">
                    {formatPercentage(department.turnoverRate)}
                  </dd>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <dt className="text-slate-500">Ausentismo</dt>
                  <dd className="mt-1 font-semibold text-slate-950">
                    {formatPercentage(department.absenteeismRate)}
                  </dd>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <dt className="text-slate-500">Engagement</dt>
                  <dd className="mt-1 font-semibold text-slate-950">
                    {department.engagementScore.toFixed(0)}/100
                  </dd>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <dt className="text-slate-500">Burnout</dt>
                  <dd className="mt-1 font-semibold text-slate-950">
                    {department.burnoutRiskAvg.toFixed(0)}/100
                  </dd>
                </div>
              </dl>

              <div className="mt-5">
                <p className="text-sm font-medium text-slate-700">
                  Tendencia de fuga
                </p>
                <SparklineChart
                  data={department.trends}
                  yKey="attritionRiskAvg"
                  stroke="#ef4444"
                  format="score"
                />
              </div>

              <div className="mt-5">
                <p className="text-sm font-medium text-slate-700">Drivers principales</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {department.topDrivers.length > 0 ? (
                    department.topDrivers.map((driver) => (
                      <Badge key={driver} variant="neutral">
                        {driver}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-sm text-slate-500">Aun no hay drivers dominantes capturados.</span>
                  )}
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {department.insights.map((insight) => (
                  <div
                    key={insight}
                    className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm leading-6 text-slate-700"
                  >
                    {insight}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Comparacion"
        title="Tabla comparativa por area"
        description="Lectura rapida entre equipos para liderazgo de RR.HH. y gerencia general."
      >
        <div className="overflow-hidden rounded-[24px] border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Area</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Dotacion</th>
                <th className="px-4 py-3 font-medium">Fuga</th>
                <th className="px-4 py-3 font-medium">Burnout</th>
                <th className="px-4 py-3 font-medium">Engagement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {dashboard.departments.map((department) => (
                <tr key={department.departmentId}>
                  <td className="px-4 py-4 font-medium text-slate-950">
                    {department.name}
                  </td>
                  <td className="px-4 py-4">
                    <Badge variant={department.tone}>{department.health}</Badge>
                  </td>
                  <td className="px-4 py-4 text-slate-600">{department.headcount}</td>
                  <td className="px-4 py-4 text-slate-600">
                    {department.attritionRiskAvg.toFixed(0)}/100
                  </td>
                  <td className="px-4 py-4 text-slate-600">
                    {department.burnoutRiskAvg.toFixed(0)}/100
                  </td>
                  <td className="px-4 py-4 text-slate-600">
                    {department.engagementScore.toFixed(0)}/100
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
