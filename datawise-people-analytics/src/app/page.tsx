import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BriefcaseBusiness,
  Building2,
  MessagesSquare,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";

import { DistributionChart } from "@/components/charts/distribution-chart";
import { LineTrendChart } from "@/components/charts/line-trend-chart";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { getExecutiveSummary } from "@/lib/analytics/summary";
import { listCompanies } from "@/lib/company";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Summary = NonNullable<Awaited<ReturnType<typeof getExecutiveSummary>>>;

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function getHighRiskShare(summary: Summary) {
  return summary.attritionDistribution.find((bucket) => bucket.tone === "critical")?.value ?? 0;
}

function getRiskTone(summary: Summary) {
  const turnover = average(summary.departmentHealth.map((item) => item.turnoverRate));
  const engagement = average(summary.departmentHealth.map((item) => item.engagementScore));
  const burnout = average(summary.departmentHealth.map((item) => item.burnoutRiskAvg));
  const highRiskShare = getHighRiskShare(summary);

  if (highRiskShare >= 22 || burnout >= 55 || engagement < 65 || turnover >= 0.08) {
    return "critical" as const;
  }

  if (highRiskShare >= 12 || burnout >= 40 || engagement < 74 || turnover >= 0.05) {
    return "warning" as const;
  }

  return "positive" as const;
}

function getCompanyRiskIndex(summary: Summary) {
  const turnover = average(summary.departmentHealth.map((item) => item.turnoverRate));
  const engagement = average(summary.departmentHealth.map((item) => item.engagementScore));
  const burnout = average(summary.departmentHealth.map((item) => item.burnoutRiskAvg));

  return burnout + getHighRiskShare(summary) + turnover * 400 + (100 - engagement);
}

function getTrendDelta(values: number[]) {
  if (values.length < 2) {
    return 0;
  }

  return values[values.length - 1]! - values[values.length - 2]!;
}

function toneStyles(tone: "positive" | "warning" | "critical") {
  if (tone === "critical") {
    return {
      surface:
        "border-rose-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(255,241,242,0.92))]",
      text: "text-rose-700",
    };
  }

  if (tone === "warning") {
    return {
      surface:
        "border-amber-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(255,251,235,0.96))]",
      text: "text-amber-700",
    };
  }

  return {
    surface:
      "border-emerald-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(236,253,245,0.96))]",
    text: "text-emerald-700",
  };
}

export default async function HomePage() {
  const companies = await listCompanies();
  const summaries = (
    await Promise.all(companies.map((company) => getExecutiveSummary(company.id)))
  ).filter((summary): summary is Summary => summary !== null);

  if (summaries.length === 0) {
    return (
      <main className="mx-auto max-w-[1600px] px-4 py-8 lg:px-6 lg:py-12">
        <section className="rounded-[36px] border border-slate-200/80 bg-white/90 p-8 shadow-[0_24px_80px_-40px_rgba(16,33,60,0.45)] lg:p-12">
          <Badge variant="warning">Se requieren datos demo</Badge>
          <h1 className="mt-5 max-w-3xl font-serif text-5xl font-semibold tracking-tight text-slate-950">
            DataWise queda listo para una demo ejecutiva apenas carguemos los datos demo.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
            Carga las empresas sinteticas para habilitar la vista de salud organizacional,
            distribucion de riesgo y tendencias usadas a lo largo del demo.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/dashboard" className={buttonVariants({ size: "lg" })}>
              Abrir espacio de trabajo
            </Link>
            <Link
              href="/upload"
              className={buttonVariants({ variant: "secondary", size: "lg" })}
            >
              Abrir flujo de carga
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const featuredSummary = [...summaries].sort(
    (left, right) => getCompanyRiskIndex(right) - getCompanyRiskIndex(left),
  )[0]!;
  const featuredCompany = companies.find((company) => company.id === featuredSummary.companyId);
  const featuredTone = getRiskTone(featuredSummary);
  const featuredTurnover = average(
    featuredSummary.departmentHealth.map((item) => item.turnoverRate),
  );
  const featuredEngagement = average(
    featuredSummary.departmentHealth.map((item) => item.engagementScore),
  );
  const featuredBurnout = average(
    featuredSummary.departmentHealth.map((item) => item.burnoutRiskAvg),
  );
  const featuredHighRisk = getHighRiskShare(featuredSummary);
  const featuredDepartments = [...featuredSummary.departmentHealth]
    .sort((left, right) => {
      const leftScore =
        left.attritionRiskAvg * 0.45 +
        left.burnoutRiskAvg * 0.35 +
        (100 - left.engagementScore) * 0.2;
      const rightScore =
        right.attritionRiskAvg * 0.45 +
        right.burnoutRiskAvg * 0.35 +
        (100 - right.engagementScore) * 0.2;

      return rightScore - leftScore;
    })
    .slice(0, 3)
    .map((department) => {
      const pressure =
        department.attritionRiskAvg * 0.45 +
        department.burnoutRiskAvg * 0.35 +
        (100 - department.engagementScore) * 0.2;

      return {
        ...department,
        pressure,
      };
    });
  const engagementDelta = getTrendDelta(
    featuredSummary.engagementTrend.map((item) => item.engagementScore),
  );
  const turnoverDelta = getTrendDelta(
    featuredSummary.turnoverTrend.map((item) => item.turnoverRate),
  );
  const totalHeadcount = summaries.reduce(
    (sum, summary) =>
      sum + summary.departmentHealth.reduce((innerSum, item) => innerSum + item.headcount, 0),
    0,
  );
  const portfolioEngagement = average(
    summaries.map((summary) =>
      average(summary.departmentHealth.map((item) => item.engagementScore)),
    ),
  );
  const portfolioBurnout = average(
    summaries.map((summary) =>
      average(summary.departmentHealth.map((item) => item.burnoutRiskAvg)),
    ),
  );
  const portfolioHighRisk = average(summaries.map((summary) => getHighRiskShare(summary)));
  const companyStoryCards = summaries
    .map((summary) => {
      const company = companies.find((item) => item.id === summary.companyId);
      const tone = getRiskTone(summary);
      const topInsight =
        summary.insights[0] ?? "Signals are stable with no material people-risk alerts.";
      const hottestDepartment = [...summary.departmentHealth].sort(
        (left, right) =>
          right.attritionRiskAvg + right.burnoutRiskAvg - right.engagementScore -
          (left.attritionRiskAvg + left.burnoutRiskAvg - left.engagementScore),
      )[0];

      return {
        company,
        summary,
        tone,
        topInsight,
        hottestDepartment,
        highRisk: getHighRiskShare(summary),
        burnout: average(summary.departmentHealth.map((item) => item.burnoutRiskAvg)),
        engagement: average(summary.departmentHealth.map((item) => item.engagementScore)),
        turnover: average(summary.departmentHealth.map((item) => item.turnoverRate)),
      };
    })
    .sort((left, right) => getCompanyRiskIndex(right.summary) - getCompanyRiskIndex(left.summary));

  return (
    <main className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(circle_at_top_left,rgba(40,91,140,0.18),transparent_34%),radial-gradient(circle_at_75%_10%,rgba(108,163,160,0.18),transparent_26%),radial-gradient(circle_at_95%_24%,rgba(246,197,118,0.16),transparent_18%)]" />
      <div className="mx-auto max-w-[1600px] px-4 py-8 lg:px-6 lg:py-12">
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(410px,0.92fr)]">
          <div className="relative overflow-hidden rounded-[40px] border border-white/60 bg-[linear-gradient(145deg,rgba(255,255,255,0.93),rgba(247,250,252,0.88))] p-8 shadow-[0_32px_90px_-48px_rgba(16,33,60,0.5)] lg:p-12">
            <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(87,147,183,0.22),transparent_68%)]" />
            <Badge variant="neutral" className="border-sky-200 bg-sky-50 text-sky-800">
              Salud organizacional unificada
            </Badge>
            <h1 className="mt-6 max-w-4xl font-serif text-5xl font-semibold tracking-[-0.03em] text-slate-950 lg:text-7xl">
              Una sola vista de salud organizacional, engagement y riesgo para equipos de liderazgo.
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-600 lg:text-xl">
              DataWise convierte datos operativos de personas y senales de colaboradores
              en un sistema operativo ejecutivo: donde se concentra el riesgo, que equipos
              se estabilizan y que deberia hacer liderazgo a continuacion.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/dashboard" className={buttonVariants({ size: "lg" })}>
                Explorar demo ejecutivo
              </Link>
              <Link
                href="/departments"
                className={buttonVariants({ variant: "secondary", size: "lg" })}
              >
                Abrir vista por equipo
              </Link>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {[
                {
                  icon: Building2,
                  title: "Una sola lectura organizacional",
                  description:
                    "Dotacion, rotacion, engagement y burnout se leen juntos en vez de vivir en reportes separados.",
                },
                {
                  icon: MessagesSquare,
                  title: "Feedback como senal operativa",
                  description:
                    "Las tendencias de engagement y burnout se tratan como alertas tempranas, no como encuestas retrospectivas.",
                },
                {
                  icon: ShieldCheck,
                  title: "Decisiones explicables",
                  description:
                    "Los drivers de riesgo siguen siendo explicitos, para que cada metrica pueda defenderse frente a ejecutivos y lideres de equipo.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-[28px] border border-slate-200/70 bg-white/75 p-5 backdrop-blur"
                >
                  <item.icon className="size-5 text-slate-700" />
                  <h2 className="mt-4 text-lg font-semibold text-slate-950">{item.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-[34px] border border-white/40 bg-[linear-gradient(180deg,#10213c_0%,#17314f_52%,#204d70_100%)] p-7 text-slate-100 shadow-[0_28px_90px_-48px_rgba(16,33,60,0.9)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-300">
                    Tablero demo en vivo
                  </p>
                  <h2 className="mt-3 text-3xl font-semibold text-white">
                    {featuredSummary.companyName}
                  </h2>
                  <p className="mt-2 text-sm text-slate-300">
                    {featuredCompany?.industry ?? "Demo de analitica de personas"}
                    {featuredCompany?.employeeCount
                      ? ` / ${featuredCompany.employeeCount} colaboradores`
                      : ""}
                  </p>
                </div>
                {featuredSummary.latestMonth ? (
                  <div className="rounded-full border border-white/12 bg-white/8 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200">
                    Ultimo mes {featuredSummary.latestMonth}
                  </div>
                ) : null}
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {[
                  {
                    label: "Rotacion",
                    value: formatPercent(featuredTurnover),
                    detail:
                      turnoverDelta > 0
                        ? `+${formatPercent(turnoverDelta)} vs mes previo`
                        : `${formatPercent(turnoverDelta)} vs mes previo`,
                  },
                  {
                    label: "Engagement",
                    value: `${featuredEngagement.toFixed(0)}/100`,
                    detail:
                      engagementDelta > 0
                        ? `+${engagementDelta.toFixed(1)} puntos vs mes previo`
                        : `${engagementDelta.toFixed(1)} puntos vs mes previo`,
                  },
                  {
                    label: "Alto riesgo de fuga",
                    value: `${featuredHighRisk}%`,
                    detail: `${featuredBurnout.toFixed(0)}/100 riesgo promedio de burnout`,
                  },
                ].map((metric) => (
                  <div
                    key={metric.label}
                    className="rounded-[24px] border border-white/12 bg-white/8 p-4"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
                      {metric.label}
                    </p>
                    <p className="mt-3 text-3xl font-semibold text-white">{metric.value}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{metric.detail}</p>
                  </div>
                ))}
              </div>

              <div className="mt-7 rounded-[26px] border border-white/12 bg-white/6 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                      Mapa de presion
                    </p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      Equipos que requieren atencion ahora
                    </p>
                  </div>
                  <Sparkles className="size-5 text-sky-200" />
                </div>
                <div className="mt-5 space-y-4">
                  {featuredDepartments.map((department) => (
                    <div key={department.departmentId}>
                      <div className="flex items-center justify-between gap-4 text-sm">
                        <div>
                          <p className="font-medium text-white">{department.name}</p>
                          <p className="mt-1 text-slate-300">
                            {department.engagementScore.toFixed(0)}/100 engagement /{" "}
                            {department.burnoutRiskAvg.toFixed(0)}/100 burnout
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-white">
                            {department.pressure.toFixed(0)}/100
                          </p>
                          <p className="text-slate-400">puntaje de presion</p>
                        </div>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            department.pressure >= 60
                              ? "bg-rose-400"
                              : department.pressure >= 45
                                ? "bg-amber-300"
                                : "bg-emerald-300",
                          )}
                          style={{ width: `${Math.min(100, Math.max(10, department.pressure))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {[
                {
                  icon: TrendingUp,
                  eyebrow: "Lectura ejecutiva",
                  title: "Seguir movimiento, no fotos",
                  description:
                    "El demo muestra si rotacion y engagement se recuperan, se aplanan o se deterioran en el tiempo.",
                },
                {
                  icon: BriefcaseBusiness,
                  eyebrow: "Modelo operativo",
                  title: "Hecho para ejecutivos y lideres de equipo",
                  description:
                    "Dashboards ejecutivos limpios para liderazgo, con contexto por area para seguimiento practico.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-[30px] border border-slate-200/80 bg-white/88 p-6 shadow-[0_22px_60px_-42px_rgba(16,33,60,0.35)]"
                >
                  <item.icon className="size-5 text-slate-700" />
                  <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {item.eyebrow}
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-slate-950">{item.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-4 xl:grid-cols-4">
          {[
            {
              label: "Empresas demo",
              value: String(summaries.length),
              detail: "Escenarios curados para software, logistica y servicios de advisory.",
            },
            {
              label: "Colaboradores simulados",
              value: String(totalHeadcount),
              detail: "Suficiente densidad para mostrar tendencias, mapas de calor y comparaciones entre equipos.",
            },
            {
              label: "Engagement promedio",
              value: `${portfolioEngagement.toFixed(0)}/100`,
              detail: "Senal de escucha a nivel portafolio a traves del demo.",
            },
            {
              label: "Participacion de alto riesgo",
              value: `${portfolioHighRisk.toFixed(0)}%`,
              detail: `${portfolioBurnout.toFixed(0)}/100 riesgo promedio de burnout entre empresas demo.`,
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-[28px] border border-slate-200/80 bg-white/88 p-6 shadow-[0_24px_70px_-48px_rgba(16,33,60,0.32)]"
            >
              <p className="text-sm font-medium text-slate-500">{item.label}</p>
              <p className="mt-3 font-serif text-4xl font-semibold text-slate-950">
                {item.value}
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-600">{item.detail}</p>
            </div>
          ))}
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(380px,0.95fr)]">
          <div className="rounded-[34px] border border-slate-200/80 bg-white/90 p-8 shadow-[0_28px_80px_-50px_rgba(16,33,60,0.38)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                  Lente de riesgo
                </p>
                <h2 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-slate-950">
                  Un dashboard que vuelve visible el riesgo de personas.
                </h2>
              </div>
              <Badge variant={featuredTone}>
                {featuredTone === "critical"
                  ? "Intervencion requerida"
                  : featuredTone === "warning"
                    ? "Mirar de cerca"
                    : "Patron estable"}
              </Badge>
            </div>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600">
              En vez de reporteria estatica de RR.HH., DataWise muestra la forma del riesgo:
              que parte de la dotacion esta expuesta, si el engagement se mueve en la
              direccion correcta y que equipos merecen un plan de intervencion.
            </p>
            <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.1fr)]">
              <div className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-5">
                <p className="text-sm font-semibold text-slate-700">
                  Distribucion del riesgo de fuga
                </p>
                <DistributionChart data={featuredSummary.attritionDistribution} />
              </div>
              <div className="grid gap-4">
                {featuredSummary.insights.slice(0, 3).map((insight) => (
                  <div
                    key={insight}
                    className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.88))] p-5"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Insight accionable
                    </p>
                    <p className="mt-3 text-base leading-7 text-slate-700">{insight}</p>
                  </div>
                ))}
                <div className="grid gap-3 md:grid-cols-3">
                  {featuredSummary.attritionDistribution.map((bucket) => (
                    <div
                      key={bucket.label}
                      className="rounded-[22px] border border-slate-200 bg-white p-4 text-sm"
                    >
                      <Badge variant={bucket.tone}>{bucket.label}</Badge>
                      <p className="mt-4 text-3xl font-semibold text-slate-950">
                        {bucket.value}%
                      </p>
                      <p className="mt-2 leading-6 text-slate-600">
                        Participacion de la dotacion evaluada en este tramo.
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[34px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(242,246,249,0.9))] p-8 shadow-[0_28px_80px_-50px_rgba(16,33,60,0.34)]">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              Inteligencia de tendencia
            </p>
            <h2 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-slate-950">
              Sigue si la salud organizacional mejora o se deteriora.
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-600">
              Esta es la capa de escucha del producto: engagement y burnout se
              tratan como tendencias a gestionar, no como un pulso aislado.
            </p>
            <div className="mt-6 space-y-6">
              <div className="rounded-[26px] border border-slate-200 bg-white/80 p-5">
                <p className="text-sm font-semibold text-slate-700">Tendencia de rotacion</p>
                <LineTrendChart
                  data={featuredSummary.turnoverTrend}
                  xKey="month"
                  yKey="turnoverRate"
                  stroke="#cb4b4b"
                  format="percent"
                />
              </div>
              <div className="rounded-[26px] border border-slate-200 bg-white/80 p-5">
                <p className="text-sm font-semibold text-slate-700">Tendencia de engagement</p>
                <LineTrendChart
                  data={featuredSummary.engagementTrend}
                  xKey="month"
                  yKey="engagementScore"
                  stroke="#1d5f7d"
                  format="score"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                Escenarios demo
              </p>
              <h2 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-slate-950">
                Tres historias de negocio para vender desde el dia uno.
              </h2>
            </div>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700"
            >
              Abrir dashboard ejecutivo
              <ArrowUpRight className="size-4" />
            </Link>
          </div>
          <div className="mt-6 grid gap-6 xl:grid-cols-3">
            {companyStoryCards.map((item) => {
              const styles = toneStyles(item.tone);

              return (
                <div
                  key={item.summary.companyId}
                  className={cn(
                    "rounded-[32px] border p-6 shadow-[0_28px_80px_-54px_rgba(16,33,60,0.36)]",
                    styles.surface,
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        {item.company?.industry ?? "Empresa demo"}
                      </p>
                      <h3 className="mt-2 text-2xl font-semibold text-slate-950">
                        {item.summary.companyName}
                      </h3>
                    </div>
                    <Badge variant={item.tone}>
                      {item.tone === "critical"
                        ? "Alta urgencia"
                        : item.tone === "warning"
                          ? "Vigilancia"
                          : "Estable"}
                    </Badge>
                  </div>
                  <p className="mt-4 text-sm leading-7 text-slate-700">{item.topInsight}</p>
                  {item.hottestDepartment ? (
                    <div className="mt-5 rounded-[24px] border border-white/60 bg-white/70 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Equipo mas expuesto
                      </p>
                      <p className="mt-2 text-lg font-semibold text-slate-950">
                        {item.hottestDepartment.name}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {item.hottestDepartment.engagementScore.toFixed(0)}/100 engagement /{" "}
                        {item.hottestDepartment.burnoutRiskAvg.toFixed(0)}/100 riesgo de burnout
                      </p>
                    </div>
                  ) : null}
                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    {[
                      {
                        label: "Rotacion",
                        value: formatPercent(item.turnover),
                      },
                      {
                        label: "Engagement",
                        value: `${item.engagement.toFixed(0)}/100`,
                      },
                      {
                        label: "Alto riesgo",
                        value: `${item.highRisk}%`,
                      },
                    ].map((metric) => (
                      <div
                        key={metric.label}
                        className="rounded-[20px] border border-white/60 bg-white/70 p-4"
                      >
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                          {metric.label}
                        </p>
                        <p className={cn("mt-3 text-2xl font-semibold", styles.text)}>
                          {metric.value}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
          <div className="rounded-[34px] border border-slate-200/80 bg-[linear-gradient(180deg,#10213c_0%,#16304f_100%)] p-8 text-slate-100 shadow-[0_28px_90px_-50px_rgba(16,33,60,0.88)]">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
              Por que funciona
            </p>
            <h2 className="mt-4 font-serif text-3xl font-semibold">
              Lo bastante serio para una sala ejecutiva y lo bastante claro para actuar.
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-300">
              La historia de producto es simple: DataWise le da a liderazgo un marco
              para leer la salud organizacional, trata el feedback como senal operativa
              y mantiene el modelo lo bastante explicable para sostener un plan de accion real.
            </p>
            <div className="mt-6 space-y-4">
              {[
                "Marco ejecutivo al estilo Visier, pero con una presentacion mas limpia y moderna.",
                "Monitoreo tipo Peakon para engagement, burnout y seguimiento.",
                "Tono tipo Culture Amp: insights relevantes para negocio sin lenguaje frio de BI.",
              ].map((line) => (
                <div
                  key={line}
                  className="rounded-[22px] border border-white/10 bg-white/6 px-4 py-4 text-sm leading-6 text-slate-200"
                >
                  {line}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[34px] border border-slate-200/80 bg-white/90 p-8 shadow-[0_28px_80px_-48px_rgba(16,33,60,0.36)]">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              Flujo de decision
            </p>
            <h2 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-slate-950">
              De la senal al seguimiento en una sola narrativa de producto.
            </h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {[
                {
                  icon: Users,
                  title: "Unificar la foto de la dotacion",
                  description:
                "Datos operativos de RR.HH., contexto de lideres de equipo e indicadores de riesgo conviven en una sola vista para liderazgo.",
                },
                {
                  icon: MessagesSquare,
                  title: "Leer la capa de escucha",
                  description:
                    "Los cambios en engagement y burnout se siguen como movimiento en el tiempo, no como encuestas aisladas.",
                },
                {
                  icon: ArrowRight,
                  title: "Pasar a accion",
                  description:
                "Equipos, lideres y ejecutivos pueden ver donde enfocarse despues, en vez de quedarse en el dashboard.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-[26px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,248,251,0.92))] p-5"
                >
                  <item.icon className="size-5 text-slate-700" />
                  <h3 className="mt-4 text-lg font-semibold text-slate-950">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/dashboard" className={buttonVariants({ size: "lg" })}>
                Abrir espacio ejecutivo
              </Link>
              <Link
                href="/upload"
                className={buttonVariants({ variant: "secondary", size: "lg" })}
              >
                Revisar demo de carga
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
