import { formatMonthKey, startOfMonth } from "@/lib/analytics/date";
import { translateDriverLabel } from "@/lib/analytics/drivers";
import { riskBand } from "@/lib/analytics/scoring";
import type { DepartmentDashboard } from "@/lib/analytics/types";
import { prisma } from "@/lib/prisma";

function getDepartmentHealth(entry: {
  attritionRiskAvg: number;
  burnoutRiskAvg: number;
  engagementScore: number;
}) {
  if (
    entry.attritionRiskAvg >= 60 ||
    entry.burnoutRiskAvg >= 60 ||
    entry.engagementScore < 60
  ) {
    return { health: "En Riesgo", tone: "critical" as const };
  }

  if (
    entry.attritionRiskAvg >= 40 ||
    entry.burnoutRiskAvg >= 40 ||
    entry.engagementScore < 72
  ) {
    return { health: "Atencion", tone: "warning" as const };
  }

  return { health: "Saludable", tone: "positive" as const };
}

export async function getDepartmentDashboard(companyId?: string) {
  const company = companyId
    ? await prisma.company.findUnique({
        where: { id: companyId },
      })
    : await prisma.company.findFirst({
        orderBy: { createdAt: "asc" },
      });

  if (!company) {
    return null;
  }

  const departmentMetrics = await prisma.teamMetricsMonthly.findMany({
    where: {
      department: {
        companyId: company.id,
      },
    },
    include: {
      department: true,
    },
    orderBy: [{ department: { name: "asc" } }, { month: "asc" }],
  });

  const departmentIds = Array.from(
    new Set(departmentMetrics.map((metric) => metric.departmentId)),
  );

  const latestMonthByDepartment = new Map<string, Date>();
  for (const metric of departmentMetrics) {
    const currentLatest = latestMonthByDepartment.get(metric.departmentId);

    if (!currentLatest || metric.month > currentLatest) {
      latestMonthByDepartment.set(metric.departmentId, startOfMonth(metric.month));
    }
  }

  const employeeScores = await prisma.employeeRiskScore.findMany({
    where: {
      employee: {
        companyId: company.id,
        departmentId: {
          in: departmentIds,
        },
      },
    },
    include: {
      employee: {
        include: {
          department: true,
        },
      },
    },
    orderBy: [{ scoringDate: "desc" }],
  });

  const dashboard = {
    companyId: company.id,
    companyName: company.name,
    departments: departmentIds
      .map((departmentId) => {
        const metrics = departmentMetrics.filter(
          (metric) => metric.departmentId === departmentId,
        );
        const latestMonth = latestMonthByDepartment.get(departmentId) ?? null;
        const latestMetric = latestMonth
          ? metrics.find(
              (metric) => metric.month.getTime() === latestMonth.getTime(),
            ) ?? null
          : null;

        if (!latestMetric) {
          return null;
        }

        const latestScores = employeeScores.filter(
          (score) =>
            score.employee.departmentId === departmentId &&
            score.scoringDate.getTime() === latestMetric.month.getTime(),
        );
        const driverCounts = latestScores.reduce((map, score) => {
          [score.driver1, score.driver2, score.driver3]
            .filter((driver): driver is string => Boolean(driver))
            .forEach((driver) => {
              map.set(driver, (map.get(driver) ?? 0) + 1);
            });
          return map;
        }, new Map<string, number>());
        const topDrivers = Array.from(driverCounts.entries())
          .sort((left, right) => right[1] - left[1])
          .slice(0, 3)
          .map(([driver]) => translateDriverLabel(driver));
        const highRiskCount = latestScores.filter(
          (score) => riskBand(score.attritionRisk) === "high",
        ).length;
        const health = getDepartmentHealth(latestMetric);
        const insights = [
          latestMetric.turnoverRate > 0.06
            ? `La rotacion esta materialmente elevada en ${latestMetric.department.name}.`
            : null,
          latestMetric.engagementScore < 70
            ? `El engagement de ${latestMetric.department.name} esta bajo el umbral de confort ejecutivo.`
            : null,
          highRiskCount > 0
            ? `${highRiskCount} colaboradores estan en alto riesgo de fuga en el ultimo mes de scoring.`
            : null,
        ].filter((value): value is string => Boolean(value));

        if (insights.length === 0) {
          insights.push(
            `${latestMetric.department.name} no muestra alertas agudas en el ultimo mes de scoring.`,
          );
        }

        return {
          departmentId,
          name: latestMetric.department.name,
          latestMonth: formatMonthKey(latestMetric.month),
          ...health,
          headcount: latestMetric.headcount,
          turnoverRate: latestMetric.turnoverRate,
          absenteeismRate: latestMetric.absenteeismRate,
          engagementScore: latestMetric.engagementScore,
          burnoutRiskAvg: latestMetric.burnoutRiskAvg,
          attritionRiskAvg: latestMetric.attritionRiskAvg,
          topDrivers,
          trends: metrics.slice(-6).map((metric) => ({
            month: formatMonthKey(metric.month),
            turnoverRate: Number(metric.turnoverRate.toFixed(4)),
            engagementScore: Number(metric.engagementScore.toFixed(2)),
            burnoutRiskAvg: Number(metric.burnoutRiskAvg.toFixed(2)),
            attritionRiskAvg: Number(metric.attritionRiskAvg.toFixed(2)),
            headcount: metric.headcount,
          })),
          insights,
        };
      })
      .filter((department): department is NonNullable<typeof department> => Boolean(department))
      .sort((left, right) => {
        const leftSeverity = left.tone === "critical" ? 2 : left.tone === "warning" ? 1 : 0;
        const rightSeverity = right.tone === "critical" ? 2 : right.tone === "warning" ? 1 : 0;

        if (leftSeverity !== rightSeverity) {
          return rightSeverity - leftSeverity;
        }

        return right.attritionRiskAvg - left.attritionRiskAvg;
      }),
  } satisfies DepartmentDashboard;

  return dashboard;
}
