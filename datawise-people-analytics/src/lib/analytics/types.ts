export type AnalyticsRunResult = {
  companyId: string;
  companyName: string;
  monthsProcessed: string[];
  employeeScoresUpserted: number;
  teamMetricsUpserted: number;
};

export type RiskDistributionBucket = {
  label: "Bajo" | "Medio" | "Alto";
  value: number;
  tone: "positive" | "warning" | "critical";
};

export type ExecutiveSummary = {
  companyId: string;
  companyName: string;
  latestMonth: string | null;
  kpis: Array<{
    label: string;
    value: string;
    tone: "positive" | "warning" | "critical" | "neutral";
    detail: string;
  }>;
  departmentHealth: Array<{
    departmentId: string;
    name: string;
    health: string;
    tone: "positive" | "warning" | "critical";
    turnoverRate: number;
    absenteeismRate: number;
    engagementScore: number;
    burnoutRiskAvg: number;
    attritionRiskAvg: number;
    headcount: number;
  }>;
  attritionDistribution: RiskDistributionBucket[];
  turnoverTrend: Array<{
    month: string;
    turnoverRate: number;
  }>;
  engagementTrend: Array<{
    month: string;
    engagementScore: number;
  }>;
  insights: string[];
};

export type DepartmentDashboardEntry = {
  departmentId: string;
  name: string;
  latestMonth: string | null;
  health: string;
  tone: "positive" | "warning" | "critical";
  headcount: number;
  turnoverRate: number;
  absenteeismRate: number;
  engagementScore: number;
  burnoutRiskAvg: number;
  attritionRiskAvg: number;
  topDrivers: string[];
  trends: Array<{
    month: string;
    turnoverRate: number;
    engagementScore: number;
    burnoutRiskAvg: number;
    attritionRiskAvg: number;
    headcount: number;
  }>;
  insights: string[];
};

export type DepartmentDashboard = {
  companyId: string;
  companyName: string;
  departments: DepartmentDashboardEntry[];
};

export type PeopleDashboard = {
  companyId: string;
  companyName: string;
  latestMonth: string | null;
  kpis: Array<{
    label: string;
    value: string;
    tone: "positive" | "warning" | "critical" | "neutral";
    detail: string;
  }>;
  attritionDistribution: RiskDistributionBucket[];
  burnoutDistribution: RiskDistributionBucket[];
  alerts: Array<{
    employeeId: string;
    name: string;
    externalCode: string | null;
    jobTitle: string | null;
    departmentName: string;
    managerName: string;
    location: string | null;
    workMode: string | null;
    tenureLabel: string;
    status: string;
    tone: "warning" | "critical";
    attritionRisk: number;
    burnoutRisk: number;
    topDrivers: string[];
    latestEngagementScore: number | null;
    latestManagerSupportScore: number | null;
    latestWorkloadScore: number | null;
    absenceDaysLast90: number;
    latestPerformanceScore: number | null;
    performanceDelta: number | null;
    lastPromotionDate: string | null;
    nextAction: string;
  }>;
  managerHotspots: Array<{
    managerId: string;
    managerName: string;
    role: string | null;
    departmentName: string;
    teamSize: number;
    alertsCount: number;
    criticalCount: number;
    attritionRiskAvg: number;
    burnoutRiskAvg: number;
    topDrivers: string[];
    recommendation: string;
  }>;
  topDrivers: Array<{
    label: string;
    value: number;
    share: number;
    tone: "critical" | "warning" | "neutral";
    action: string;
  }>;
  insights: string[];
};
