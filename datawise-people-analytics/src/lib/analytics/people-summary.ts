import { addDays, formatMonthKey, monthsDiff } from "@/lib/analytics/date";
import { getDriverAction, translateDriverLabel } from "@/lib/analytics/drivers";
import {
  normalizeFivePointToPositivePercentage,
  riskBand,
} from "@/lib/analytics/scoring";
import type { PeopleDashboard, RiskDistributionBucket } from "@/lib/analytics/types";
import { prisma } from "@/lib/prisma";

type AlertCandidate = PeopleDashboard["alerts"][number] & {
  managerId: string | null;
  managerRole: string | null;
  managerDepartmentName: string;
  sortScore: number;
};

type DriverDictionaryKey =
  | "Absenteeism"
  | "Low engagement"
  | "Tenure risk"
  | "Performance drop"
  | "Promotion gap"
  | "Workload"
  | "Stress feedback";

const DRIVER_LOOKUP: Record<string, DriverDictionaryKey> = {
  Ausentismo: "Absenteeism",
  "Bajo engagement": "Low engagement",
  "Riesgo de tenure": "Tenure risk",
  "Caida de desempeno": "Performance drop",
  "Brecha de crecimiento": "Promotion gap",
  Sobrecarga: "Workload",
  "Senales de estres": "Stress feedback",
};

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentage(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatPersonName(firstName: string | null, lastName: string | null) {
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  return fullName || "Colaborador sin nombre";
}

function formatTenureLabel(hireDate: Date, scoringDate: Date) {
  const months = Math.max(monthsDiff(hireDate, scoringDate), 0);

  if (months < 12) {
    return `${months} meses`;
  }

  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;

  if (remainingMonths === 0) {
    return years === 1 ? "1 ano" : `${years} anos`;
  }

  return `${years}a ${remainingMonths}m`;
}

function buildDistribution(scores: number[]): RiskDistributionBucket[] {
  const counts = scores.reduce(
    (accumulator, score) => {
      const band = riskBand(score);
      accumulator[band] += 1;
      return accumulator;
    },
    { low: 0, medium: 0, high: 0 },
  );
  const total = Math.max(scores.length, 1);

  return [
    {
      label: "Bajo",
      value: Math.round((counts.low / total) * 100),
      tone: "positive",
    },
    {
      label: "Medio",
      value: Math.round((counts.medium / total) * 100),
      tone: "warning",
    },
    {
      label: "Alto",
      value: Math.round((counts.high / total) * 100),
      tone: "critical",
    },
  ];
}

function getAlertStatus(attritionRisk: number, burnoutRisk: number) {
  if (
    burnoutRisk >= 60 ||
    attritionRisk >= 58 ||
    (burnoutRisk >= 55 && attritionRisk >= 52)
  ) {
    return { status: "Intervencion inmediata", tone: "critical" as const };
  }

  return { status: "Seguimiento activo", tone: "warning" as const };
}

function buildManagerRecommendation(
  topDrivers: string[],
  criticalCount: number,
  alertsCount: number,
) {
  const primaryDriver = topDrivers[0];
  const baseAction = getDriverAction(DRIVER_LOOKUP[primaryDriver ?? ""]);

  if (criticalCount >= 2) {
    return `Escalar una revision conjunta con liderazgo y People. ${baseAction}`;
  }

  if (alertsCount >= 3) {
    return `Concentrar coaching del manager y rebalanceo del equipo. ${baseAction}`;
  }

  return baseAction;
}

function hasPrioritySignal(candidate: AlertCandidate) {
  return (
    candidate.attritionRisk >= 42 ||
    candidate.burnoutRisk >= 48 ||
    (candidate.latestEngagementScore ?? 100) < 68 ||
    candidate.absenceDaysLast90 >= 3 ||
    (candidate.performanceDelta ?? 0) <= -0.35
  );
}

export async function getPeopleDashboard(companyId?: string) {
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

  const latestScore = await prisma.employeeRiskScore.findFirst({
    where: {
      employee: {
        companyId: company.id,
      },
    },
    orderBy: {
      scoringDate: "desc",
    },
    select: {
      scoringDate: true,
    },
  });

  if (!latestScore) {
    return null;
  }

  const latestScores = await prisma.employeeRiskScore.findMany({
    where: {
      employee: {
        companyId: company.id,
      },
      scoringDate: latestScore.scoringDate,
    },
    include: {
      employee: {
        include: {
          department: true,
          manager: {
            include: {
              department: true,
            },
          },
        },
      },
    },
  });

  if (latestScores.length === 0) {
    return null;
  }

  const employeeIds = latestScores.map((score) => score.employeeId);
  const signalsWindowStart = addDays(latestScore.scoringDate, -90);

  const [surveyResponses, performanceReviews, absences, promotions] = await Promise.all([
    prisma.surveyResponse.findMany({
      where: {
        employeeId: {
          in: employeeIds,
        },
        survey: {
          companyId: company.id,
          createdAt: {
            lte: latestScore.scoringDate,
          },
        },
      },
      include: {
        survey: {
          select: {
            createdAt: true,
          },
        },
      },
    }),
    prisma.performanceReview.findMany({
      where: {
        employeeId: {
          in: employeeIds,
        },
        reviewDate: {
          lte: latestScore.scoringDate,
        },
      },
    }),
    prisma.absence.findMany({
      where: {
        employeeId: {
          in: employeeIds,
        },
        date: {
          gte: signalsWindowStart,
          lte: latestScore.scoringDate,
        },
      },
    }),
    prisma.promotion.findMany({
      where: {
        employeeId: {
          in: employeeIds,
        },
        effectiveAt: {
          lte: latestScore.scoringDate,
        },
      },
    }),
  ]);

  const latestSurveySignals = new Map<
    string,
    Partial<Record<"engagement" | "manager_support" | "workload", { score: number; date: Date }>>
  >();
  for (const response of surveyResponses) {
    if (
      response.dimension !== "engagement" &&
      response.dimension !== "manager_support" &&
      response.dimension !== "workload"
    ) {
      continue;
    }

    const existingSignals = latestSurveySignals.get(response.employeeId) ?? {};
    const existing = existingSignals[response.dimension];

    if (!existing || response.survey.createdAt > existing.date) {
      existingSignals[response.dimension] = {
        score: response.score,
        date: response.survey.createdAt,
      };
      latestSurveySignals.set(response.employeeId, existingSignals);
    }
  }

  const performanceByEmployee = new Map<string, typeof performanceReviews>();
  for (const review of performanceReviews) {
    const current = performanceByEmployee.get(review.employeeId) ?? [];
    current.push(review);
    performanceByEmployee.set(review.employeeId, current);
  }

  const absenceDaysByEmployee = absences.reduce((map, absence) => {
    map.set(absence.employeeId, (map.get(absence.employeeId) ?? 0) + absence.days);
    return map;
  }, new Map<string, number>());

  const latestPromotionByEmployee = new Map<string, Date>();
  for (const promotion of promotions) {
    const current = latestPromotionByEmployee.get(promotion.employeeId);
    if (!current || promotion.effectiveAt > current) {
      latestPromotionByEmployee.set(promotion.employeeId, promotion.effectiveAt);
    }
  }

  const allCandidates = latestScores
    .map((score) => {
      const employeeSignals = latestSurveySignals.get(score.employeeId);
      const employeeReviews = [...(performanceByEmployee.get(score.employeeId) ?? [])].sort(
        (left, right) => right.reviewDate.getTime() - left.reviewDate.getTime(),
      );
      const latestPerformance = employeeReviews[0] ?? null;
      const previousPerformance = employeeReviews[1] ?? null;
      const topDriversRaw = [score.driver1, score.driver2, score.driver3].filter(
        (driver): driver is string => Boolean(driver),
      );
      const translatedDrivers = topDriversRaw.map((driver) => translateDriverLabel(driver));
      const latestEngagementScore = employeeSignals?.engagement
        ? normalizeFivePointToPositivePercentage(employeeSignals.engagement.score)
        : null;
      const latestManagerSupportScore = employeeSignals?.manager_support
        ? normalizeFivePointToPositivePercentage(employeeSignals.manager_support.score)
        : null;
      const latestWorkloadScore = employeeSignals?.workload
        ? normalizeFivePointToPositivePercentage(employeeSignals.workload.score)
        : null;
      const performanceDelta =
        latestPerformance && previousPerformance
          ? Number((latestPerformance.score - previousPerformance.score).toFixed(2))
          : null;
      const absenceDaysLast90 = absenceDaysByEmployee.get(score.employeeId) ?? 0;
      const { status, tone } = getAlertStatus(score.attritionRisk, score.burnoutRisk);
      const sortScore =
        Math.max(score.attritionRisk, score.burnoutRisk) +
        average([score.attritionRisk, score.burnoutRisk]) * 0.35 +
        (tone === "critical" ? 8 : 0) +
        (absenceDaysLast90 >= 3 ? 4 : 0);

      return {
        employeeId: score.employeeId,
        name: formatPersonName(score.employee.firstName, score.employee.lastName),
        externalCode: score.employee.externalCode,
        jobTitle: score.employee.jobTitle,
        departmentName: score.employee.department?.name ?? "Sin area",
        managerId: score.employee.managerId,
        managerName: score.employee.manager
          ? formatPersonName(score.employee.manager.firstName, score.employee.manager.lastName)
          : "Sin manager asignado",
        managerRole: score.employee.manager?.jobTitle ?? null,
        managerDepartmentName:
          score.employee.manager?.department?.name ??
          score.employee.department?.name ??
          "Sin area",
        location: score.employee.location,
        workMode: score.employee.workMode,
        tenureLabel: formatTenureLabel(score.employee.hireDate, latestScore.scoringDate),
        status,
        tone,
        attritionRisk: Number(score.attritionRisk.toFixed(2)),
        burnoutRisk: Number(score.burnoutRisk.toFixed(2)),
        topDrivers: translatedDrivers,
        latestEngagementScore:
          latestEngagementScore == null ? null : Number(latestEngagementScore.toFixed(0)),
        latestManagerSupportScore:
          latestManagerSupportScore == null
            ? null
            : Number(latestManagerSupportScore.toFixed(0)),
        latestWorkloadScore:
          latestWorkloadScore == null ? null : Number(latestWorkloadScore.toFixed(0)),
        absenceDaysLast90,
        latestPerformanceScore:
          latestPerformance == null ? null : Number(latestPerformance.score.toFixed(1)),
        performanceDelta,
        lastPromotionDate: latestPromotionByEmployee.has(score.employeeId)
          ? formatMonthKey(latestPromotionByEmployee.get(score.employeeId)!)
          : null,
        nextAction: getDriverAction(topDriversRaw[0]),
        sortScore,
      } satisfies AlertCandidate;
    })
    .sort((left, right) => right.sortScore - left.sortScore);

  const fallbackAlertCount = Math.min(8, allCandidates.length);
  const prioritizedCandidates = allCandidates.filter((candidate) => hasPrioritySignal(candidate));
  const alertCohort =
    prioritizedCandidates.length >= fallbackAlertCount
      ? prioritizedCandidates
      : allCandidates.slice(0, fallbackAlertCount);

  const alerts = alertCohort.slice(0, 10).map((candidate) => ({
    employeeId: candidate.employeeId,
    name: candidate.name,
    externalCode: candidate.externalCode,
    jobTitle: candidate.jobTitle,
    departmentName: candidate.departmentName,
    managerName: candidate.managerName,
    location: candidate.location,
    workMode: candidate.workMode,
    tenureLabel: candidate.tenureLabel,
    status: candidate.status,
    tone: candidate.tone,
    attritionRisk: candidate.attritionRisk,
    burnoutRisk: candidate.burnoutRisk,
    topDrivers: candidate.topDrivers,
    latestEngagementScore: candidate.latestEngagementScore,
    latestManagerSupportScore: candidate.latestManagerSupportScore,
    latestWorkloadScore: candidate.latestWorkloadScore,
    absenceDaysLast90: candidate.absenceDaysLast90,
    latestPerformanceScore: candidate.latestPerformanceScore,
    performanceDelta: candidate.performanceDelta,
    lastPromotionDate: candidate.lastPromotionDate,
    nextAction: candidate.nextAction,
  }));

  const teamSizeByManager = allCandidates.reduce((map, candidate) => {
    if (!candidate.managerId) {
      return map;
    }

    map.set(candidate.managerId, (map.get(candidate.managerId) ?? 0) + 1);
    return map;
  }, new Map<string, number>());

  const managerHotspots = Array.from(
    alertCohort.reduce(
      (map, candidate) => {
        if (!candidate.managerId) {
          return map;
        }

        const current = map.get(candidate.managerId) ?? {
          managerId: candidate.managerId,
          managerName: candidate.managerName,
          role: candidate.managerRole,
          departmentName: candidate.managerDepartmentName,
          teamSize: teamSizeByManager.get(candidate.managerId) ?? 0,
          alertsCount: 0,
          criticalCount: 0,
          attritionRiskValues: [] as number[],
          burnoutRiskValues: [] as number[],
          topDrivers: [] as string[],
        };

        current.alertsCount += 1;
        current.criticalCount += candidate.tone === "critical" ? 1 : 0;
        current.attritionRiskValues.push(candidate.attritionRisk);
        current.burnoutRiskValues.push(candidate.burnoutRisk);
        current.topDrivers.push(...candidate.topDrivers);
        map.set(candidate.managerId, current);
        return map;
      },
      new Map<
        string,
        {
          managerId: string;
          managerName: string;
          role: string | null;
          departmentName: string;
          teamSize: number;
          alertsCount: number;
          criticalCount: number;
          attritionRiskValues: number[];
          burnoutRiskValues: number[];
          topDrivers: string[];
        }
      >(),
    ),
  )
    .map(([, manager]) => {
      const driverCounts = manager.topDrivers.reduce((map, driver) => {
        map.set(driver, (map.get(driver) ?? 0) + 1);
        return map;
      }, new Map<string, number>());
      const topDrivers = Array.from(driverCounts.entries())
        .sort((left, right) => right[1] - left[1])
        .slice(0, 3)
        .map(([driver]) => driver);

      return {
        managerId: manager.managerId,
        managerName: manager.managerName,
        role: manager.role,
        departmentName: manager.departmentName,
        teamSize: manager.teamSize,
        alertsCount: manager.alertsCount,
        criticalCount: manager.criticalCount,
        attritionRiskAvg: Number(average(manager.attritionRiskValues).toFixed(1)),
        burnoutRiskAvg: Number(average(manager.burnoutRiskValues).toFixed(1)),
        topDrivers,
        recommendation: buildManagerRecommendation(
          topDrivers,
          manager.criticalCount,
          manager.alertsCount,
        ),
      };
    })
    .sort((left, right) => {
      if (left.criticalCount !== right.criticalCount) {
        return right.criticalCount - left.criticalCount;
      }

      if (left.alertsCount !== right.alertsCount) {
        return right.alertsCount - left.alertsCount;
      }

      return right.burnoutRiskAvg - left.burnoutRiskAvg;
    })
    .slice(0, 4);

  const driverCounts = alertCohort.reduce((map, candidate) => {
    for (const driver of candidate.topDrivers) {
      map.set(driver, (map.get(driver) ?? 0) + 1);
    }

    return map;
  }, new Map<string, number>());

  const topDrivers = Array.from(driverCounts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([driver, value], index) => ({
      label: driver,
      value,
      share: alertCohort.length === 0 ? 0 : Math.round((value / alertCohort.length) * 100),
      tone:
        index === 0
          ? ("critical" as const)
          : index === 1
            ? ("warning" as const)
            : ("neutral" as const),
      action: getDriverAction(DRIVER_LOOKUP[driver]),
    }));

  const departmentCounts = alertCohort.reduce((map, candidate) => {
    map.set(candidate.departmentName, (map.get(candidate.departmentName) ?? 0) + 1);
    return map;
  }, new Map<string, number>());
  const highestDepartmentConcentration = Array.from(departmentCounts.entries()).sort(
    (left, right) => right[1] - left[1],
  )[0];
  const criticalCount = alertCohort.filter((candidate) => candidate.tone === "critical").length;
  const burnoutHighCount = alertCohort.filter(
    (candidate) => riskBand(candidate.burnoutRisk) === "high",
  ).length;

  const insights: string[] = [];
  if (
    highestDepartmentConcentration &&
    alertCohort.length > 0 &&
    highestDepartmentConcentration[1] / alertCohort.length >= 0.35
  ) {
    insights.push(
      `${highestDepartmentConcentration[0]} concentra ${Math.round(
        (highestDepartmentConcentration[1] / alertCohort.length) * 100,
      )}% de la cola priorizada.`,
    );
  }

  if (managerHotspots[0] && managerHotspots[0].alertsCount >= 3) {
    insights.push(
      `${managerHotspots[0].managerName} concentra ${managerHotspots[0].alertsCount} casos y requiere soporte de liderazgo en esta iteracion.`,
    );
  }

  if (burnoutHighCount > criticalCount) {
    insights.push(
      "El burnout esta apareciendo antes que la fuga abierta, asi que hay espacio real para intervenir antes de perder talento.",
    );
  }

  if (topDrivers[0] && topDrivers[0].share >= 45) {
    insights.push(
      `${topDrivers[0].label} es la senal dominante en la cola priorizada y deberia ser la primera palanca de accion.`,
    );
  }

  if (insights.length === 0) {
    insights.push(
      "La cola priorizada no muestra concentracion extrema, lo que favorece acciones puntuales por manager y colaborador.",
    );
  }

  return {
    companyId: company.id,
    companyName: company.name,
    latestMonth: formatMonthKey(latestScore.scoringDate),
    kpis: [
      {
        label: "Personas priorizadas",
        value: String(alertCohort.length),
        tone:
          alertCohort.length >= 10
            ? "critical"
            : alertCohort.length >= 6
              ? "warning"
              : "positive",
        detail: "Colaboradores que hoy requieren seguimiento individual o intervencion directa.",
      },
      {
        label: "Intervencion inmediata",
        value: String(criticalCount),
        tone: criticalCount >= 4 ? "critical" : criticalCount > 0 ? "warning" : "positive",
        detail: "Casos donde burnout y/o fuga ya estan por sobre el umbral de accion.",
      },
      {
        label: "Burnout alto",
        value: String(burnoutHighCount),
        tone:
          burnoutHighCount >= 4 ? "critical" : burnoutHighCount > 0 ? "warning" : "positive",
        detail: "Colaboradores con riesgo alto de desgaste en el ultimo scoring.",
      },
      {
        label: "Managers bajo presion",
        value: String(managerHotspots.length),
        tone: managerHotspots.length >= 3 ? "warning" : "neutral",
        detail: "Lideres que concentran mas alertas y necesitan apoyo operativo.",
      },
      {
        label: "Cobertura analitica",
        value: percentage(
          latestScores.length /
            Math.max(company.employeeCount ?? latestScores.length, 1),
        ),
        tone: "positive",
        detail: "Porcentaje de dotacion activa con scoring utilizable en este corte.",
      },
    ],
    attritionDistribution: buildDistribution(
      latestScores.map((score) => score.attritionRisk),
    ),
    burnoutDistribution: buildDistribution(
      latestScores.map((score) => score.burnoutRisk),
    ),
    alerts,
    managerHotspots,
    topDrivers,
    insights,
  } satisfies PeopleDashboard;
}
