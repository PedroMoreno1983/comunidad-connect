import type { Prisma, PrismaClient } from "@prisma/client";

import {
  addDays,
  endOfMonth,
  formatMonthKey,
  isWithinMonth,
  monthsBetween,
  startOfMonth,
} from "@/lib/analytics/date";
import {
  computeAbsenteeismRisk,
  computeAttritionRisk,
  computeBurnoutRisk,
  computeLowEngagementRisk,
  computePerformanceDropRisk,
  computePromotionGapRisk,
  computeStressFeedbackRisk,
  computeTenureRisk,
  computeWorkloadRisk,
  normalizeFivePointToPositivePercentage,
} from "@/lib/analytics/scoring";
import type { AnalyticsRunResult } from "@/lib/analytics/types";
import { prisma } from "@/lib/prisma";

type CompanyWithAnalyticsInputs = Prisma.CompanyGetPayload<{
  include: {
    departments: true;
    employees: {
      include: {
        absences: true;
        performance: true;
        promotions: true;
        surveyResponses: {
          include: {
            survey: true;
          };
        };
      };
    };
  };
}>;

const WORKING_DAYS_PER_MONTH = 22;
const MAX_MONTHS_TO_PROCESS = 12;

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundTo(value: number, decimals = 2) {
  return Number(value.toFixed(decimals));
}

function getRelevantMonths(company: CompanyWithAnalyticsInputs) {
  const observedDates = company.employees.flatMap((employee) => [
    ...(employee.absences.map((absence) => absence.date)),
    ...(employee.performance.map((review) => review.reviewDate)),
    ...(employee.promotions.map((promotion) => promotion.effectiveAt)),
    ...(employee.surveyResponses.map((response) => response.survey.createdAt)),
    ...(employee.terminationDate ? [employee.terminationDate] : []),
  ]);

  const fallbackDate = new Date();
  const earliestObservedDate = observedDates.length > 0
    ? observedDates.reduce((min, current) => (current < min ? current : min))
    : fallbackDate;
  const latestObservedDate = observedDates.length > 0
    ? observedDates.reduce((max, current) => (current > max ? current : max))
    : fallbackDate;

  const months = monthsBetween(earliestObservedDate, latestObservedDate);
  return months.slice(-MAX_MONTHS_TO_PROCESS);
}

function getLatestSurveyScore(
  employee: CompanyWithAnalyticsInputs["employees"][number],
  dimension: string,
  monthEnd: Date,
) {
  const latestResponse = employee.surveyResponses
    .filter(
      (response) =>
        response.dimension === dimension && response.survey.createdAt <= monthEnd,
    )
    .sort(
      (left, right) =>
        right.survey.createdAt.getTime() - left.survey.createdAt.getTime(),
    )[0];

  return latestResponse?.score;
}

function getLatestPerformanceScores(
  employee: CompanyWithAnalyticsInputs["employees"][number],
  monthEnd: Date,
) {
  const reviews = employee.performance
    .filter((review) => review.reviewDate <= monthEnd)
    .sort((left, right) => right.reviewDate.getTime() - left.reviewDate.getTime());

  return {
    latest: reviews[0]?.score,
    previous: reviews[1]?.score,
  };
}

function getLatestPromotionDate(
  employee: CompanyWithAnalyticsInputs["employees"][number],
  monthEnd: Date,
) {
  return employee.promotions
    .filter((promotion) => promotion.effectiveAt <= monthEnd)
    .sort((left, right) => right.effectiveAt.getTime() - left.effectiveAt.getTime())[0]
    ?.effectiveAt;
}

function getRollingAbsenceDays(
  employee: CompanyWithAnalyticsInputs["employees"][number],
  monthEnd: Date,
) {
  const windowStart = addDays(monthEnd, -89);

  return employee.absences
    .filter((absence) => absence.date >= windowStart && absence.date <= monthEnd)
    .reduce((sum, absence) => sum + absence.days, 0);
}

function employeeIsActiveAtMonthEnd(
  employee: CompanyWithAnalyticsInputs["employees"][number],
  monthEnd: Date,
) {
  return employee.hireDate <= monthEnd && (!employee.terminationDate || employee.terminationDate > monthEnd);
}

function employeeIsActiveAtMonthStart(
  employee: CompanyWithAnalyticsInputs["employees"][number],
  monthStart: Date,
) {
  return employee.hireDate < monthStart && (!employee.terminationDate || employee.terminationDate >= monthStart);
}

function employeeExistsDuringMonth(
  employee: CompanyWithAnalyticsInputs["employees"][number],
  monthStart: Date,
  monthEnd: Date,
) {
  return employee.hireDate <= monthEnd && (!employee.terminationDate || employee.terminationDate >= monthStart);
}

export async function runAnalyticsPipeline(options?: {
  companyId?: string;
  prismaClient?: PrismaClient;
}) {
  const client = options?.prismaClient ?? prisma;
  const companies = await client.company.findMany({
    where: options?.companyId ? { id: options.companyId } : undefined,
    include: {
      departments: true,
      employees: {
        include: {
          absences: true,
          performance: true,
          promotions: true,
          surveyResponses: {
            include: {
              survey: true,
            },
          },
        },
      },
    },
  });

  const results: AnalyticsRunResult[] = [];

  for (const company of companies) {
    const months = getRelevantMonths(company);
    let employeeScoresUpserted = 0;
    let teamMetricsUpserted = 0;

    for (const month of months) {
      const monthStart = startOfMonth(month);
      const monthEnd = endOfMonth(month);
      const employeeScoresByDepartment = new Map<string, Array<{ attritionRisk: number; burnoutRisk: number; engagementScore: number }>>();

      for (const employee of company.employees) {
        if (!employee.departmentId || !employeeIsActiveAtMonthEnd(employee, monthEnd)) {
          continue;
        }

        const absenceDaysLast90 = getRollingAbsenceDays(employee, monthEnd);
        const engagementScore = getLatestSurveyScore(employee, "engagement", monthEnd);
        const workloadScore = getLatestSurveyScore(employee, "workload", monthEnd);
        const managerSupportScore = getLatestSurveyScore(employee, "manager_support", monthEnd);
        const performanceScores = getLatestPerformanceScores(employee, monthEnd);
        const latestPromotionDate = getLatestPromotionDate(employee, monthEnd);

        const attrition = computeAttritionRisk({
          absenteeism: computeAbsenteeismRisk(absenceDaysLast90),
          lowEngagement: computeLowEngagementRisk(engagementScore),
          tenureRisk: computeTenureRisk(employee.hireDate, monthStart),
          performanceDrop: computePerformanceDropRisk(
            performanceScores.latest,
            performanceScores.previous,
          ),
          promotionGap: computePromotionGapRisk(
            employee.hireDate,
            monthStart,
            latestPromotionDate,
          ),
        });
        const burnout = computeBurnoutRisk({
          workload: computeWorkloadRisk(workloadScore),
          absenteeism: computeAbsenteeismRisk(absenceDaysLast90),
          lowEngagement: computeLowEngagementRisk(engagementScore),
          stressFeedback: computeStressFeedbackRisk(managerSupportScore),
        });

        await client.employeeRiskScore.upsert({
          where: {
            employeeId_scoringDate: {
              employeeId: employee.id,
              scoringDate: monthStart,
            },
          },
          update: {
            attritionRisk: roundTo(attrition.score),
            burnoutRisk: roundTo(burnout.score),
            driver1: attrition.drivers[0] ?? burnout.drivers[0] ?? null,
            driver2: attrition.drivers[1] ?? burnout.drivers[1] ?? null,
            driver3: attrition.drivers[2] ?? burnout.drivers[2] ?? null,
          },
          create: {
            employeeId: employee.id,
            scoringDate: monthStart,
            attritionRisk: roundTo(attrition.score),
            burnoutRisk: roundTo(burnout.score),
            driver1: attrition.drivers[0] ?? burnout.drivers[0] ?? null,
            driver2: attrition.drivers[1] ?? burnout.drivers[1] ?? null,
            driver3: attrition.drivers[2] ?? burnout.drivers[2] ?? null,
          },
        });
        employeeScoresUpserted += 1;

        const departmentScores = employeeScoresByDepartment.get(employee.departmentId) ?? [];
        departmentScores.push({
          attritionRisk: roundTo(attrition.score),
          burnoutRisk: roundTo(burnout.score),
          engagementScore: normalizeFivePointToPositivePercentage(engagementScore),
        });
        employeeScoresByDepartment.set(employee.departmentId, departmentScores);
      }

      for (const department of company.departments) {
        const departmentEmployees = company.employees.filter(
          (employee) => employee.departmentId === department.id,
        );
        const headcount = departmentEmployees.filter((employee) =>
          employeeIsActiveAtMonthEnd(employee, monthEnd),
        ).length;
        const activeAtMonthStart = departmentEmployees.filter((employee) =>
          employeeIsActiveAtMonthStart(employee, monthStart),
        ).length;
        const terminationsDuringMonth = departmentEmployees.filter(
          (employee) => employee.terminationDate && isWithinMonth(employee.terminationDate, monthStart),
        ).length;
        const absenceDaysDuringMonth = departmentEmployees
          .filter((employee) => employeeExistsDuringMonth(employee, monthStart, monthEnd))
          .flatMap((employee) => employee.absences)
          .filter((absence) => isWithinMonth(absence.date, monthStart))
          .reduce((sum, absence) => sum + absence.days, 0);
        const departmentScores = employeeScoresByDepartment.get(department.id) ?? [];
        const turnoverRate =
          activeAtMonthStart > 0 ? terminationsDuringMonth / activeAtMonthStart : 0;
        const absenteeismRate =
          headcount > 0 ? absenceDaysDuringMonth / (headcount * WORKING_DAYS_PER_MONTH) : 0;
        const engagementValues = departmentEmployees
          .filter((employee) => employeeIsActiveAtMonthEnd(employee, monthEnd))
          .map((employee) =>
            normalizeFivePointToPositivePercentage(
              getLatestSurveyScore(employee, "engagement", monthEnd),
            ),
          );

        await client.teamMetricsMonthly.upsert({
          where: {
            departmentId_month: {
              departmentId: department.id,
              month: monthStart,
            },
          },
          update: {
            headcount,
            turnoverRate: roundTo(turnoverRate, 4),
            absenteeismRate: roundTo(absenteeismRate, 4),
            engagementScore: roundTo(average(engagementValues)),
            burnoutRiskAvg: roundTo(
              average(departmentScores.map((score) => score.burnoutRisk)),
            ),
            attritionRiskAvg: roundTo(
              average(departmentScores.map((score) => score.attritionRisk)),
            ),
          },
          create: {
            departmentId: department.id,
            month: monthStart,
            headcount,
            turnoverRate: roundTo(turnoverRate, 4),
            absenteeismRate: roundTo(absenteeismRate, 4),
            engagementScore: roundTo(average(engagementValues)),
            burnoutRiskAvg: roundTo(
              average(departmentScores.map((score) => score.burnoutRisk)),
            ),
            attritionRiskAvg: roundTo(
              average(departmentScores.map((score) => score.attritionRisk)),
            ),
          },
        });
        teamMetricsUpserted += 1;
      }
    }

    results.push({
      companyId: company.id,
      companyName: company.name,
      monthsProcessed: months.map((month) => formatMonthKey(month)),
      employeeScoresUpserted,
      teamMetricsUpserted,
    });
  }

  return results;
}
