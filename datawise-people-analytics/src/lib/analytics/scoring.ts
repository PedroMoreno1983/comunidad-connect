import { monthsDiff } from "@/lib/analytics/date";

export type AttritionInputs = {
  absenteeism: number;
  lowEngagement: number;
  tenureRisk: number;
  performanceDrop: number;
  promotionGap: number;
};

export type BurnoutInputs = {
  workload: number;
  absenteeism: number;
  lowEngagement: number;
  stressFeedback: number;
};

type WeightedContribution = {
  label: string;
  value: number;
};

export function clampScore(value: number, min = 0, max = 100) {
  return Math.min(Math.max(value, min), max);
}

function normalizeInverseFivePointScale(score: number | null | undefined) {
  if (score == null) {
    return 50;
  }

  return clampScore(((5 - score) / 4) * 100);
}

export function normalizeFivePointToPositivePercentage(score: number | null | undefined) {
  if (score == null) {
    return 50;
  }

  return clampScore((score / 5) * 100);
}

export function computeAbsenteeismRisk(absenceDaysLast90: number) {
  return clampScore((absenceDaysLast90 / 6) * 100);
}

export function computeTenureRisk(hireDate: Date, scoringMonth: Date) {
  const tenureMonths = monthsDiff(hireDate, scoringMonth);

  if (tenureMonths < 6) {
    return 100;
  }

  if (tenureMonths < 12) {
    return 80;
  }

  if (tenureMonths < 24) {
    return 55;
  }

  if (tenureMonths < 36) {
    return 30;
  }

  return 15;
}

export function computePerformanceDropRisk(
  latestScore?: number | null,
  previousScore?: number | null,
) {
  if (latestScore == null) {
    return 50;
  }

  if (previousScore == null) {
    return clampScore(((4 - latestScore) / 2) * 100);
  }

  const delta = previousScore - latestScore;
  return clampScore(Math.max(0, delta) * 50);
}

export function computePromotionGapRisk(
  hireDate: Date,
  scoringMonth: Date,
  latestPromotionDate?: Date | null,
) {
  const referenceDate = latestPromotionDate ?? hireDate;
  const monthsSinceReference = monthsDiff(referenceDate, scoringMonth);

  if (monthsSinceReference < 12) {
    return 20;
  }

  if (monthsSinceReference < 24) {
    return 45;
  }

  if (monthsSinceReference < 36) {
    return 70;
  }

  return 90;
}

export function computeLowEngagementRisk(score: number | null | undefined) {
  return normalizeInverseFivePointScale(score);
}

export function computeWorkloadRisk(score: number | null | undefined) {
  return normalizeInverseFivePointScale(score);
}

export function computeStressFeedbackRisk(score: number | null | undefined) {
  return normalizeInverseFivePointScale(score);
}

function sortDrivers(contributions: WeightedContribution[]) {
  return [...contributions]
    .sort((left, right) => right.value - left.value)
    .slice(0, 3)
    .map((driver) => driver.label);
}

export function computeAttritionRisk(inputs: AttritionInputs) {
  const contributions: WeightedContribution[] = [
    { label: "Absenteeism", value: inputs.absenteeism * 0.25 },
    { label: "Low engagement", value: inputs.lowEngagement * 0.25 },
    { label: "Tenure risk", value: inputs.tenureRisk * 0.2 },
    { label: "Performance drop", value: inputs.performanceDrop * 0.15 },
    { label: "Promotion gap", value: inputs.promotionGap * 0.15 },
  ];

  return {
    score: clampScore(contributions.reduce((sum, item) => sum + item.value, 0)),
    drivers: sortDrivers(contributions),
  };
}

export function computeBurnoutRisk(inputs: BurnoutInputs) {
  const contributions: WeightedContribution[] = [
    { label: "Workload", value: inputs.workload * 0.35 },
    { label: "Absenteeism", value: inputs.absenteeism * 0.25 },
    { label: "Low engagement", value: inputs.lowEngagement * 0.25 },
    { label: "Stress feedback", value: inputs.stressFeedback * 0.15 },
  ];

  return {
    score: clampScore(contributions.reduce((sum, item) => sum + item.value, 0)),
    drivers: sortDrivers(contributions),
  };
}

export function riskBand(score: number) {
  if (score <= 30) {
    return "low";
  }

  if (score <= 60) {
    return "medium";
  }

  return "high";
}
