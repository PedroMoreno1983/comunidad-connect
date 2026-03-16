export const executiveKpis = [
  {
    label: "Headcount",
    value: "128",
    detail: "Demo metric used on the landing page preview.",
    tone: "positive" as const
  },
  {
    label: "Turnover",
    value: "4.2%",
    detail: "Illustrative trend for the marketing surface.",
    tone: "warning" as const
  },
  {
    label: "Absenteeism",
    value: "2.1%",
    detail: "Example KPI shown before entering the live dashboard.",
    tone: "neutral" as const
  },
  {
    label: "Engagement",
    value: "73/100",
    detail: "Demo score inspired by the seeded survey model.",
    tone: "positive" as const
  },
  {
    label: "Burnout Risk",
    value: "39/100",
    detail: "Illustrative risk signal for the landing page preview.",
    tone: "critical" as const
  }
];

export const departmentPreview = [
  { name: "Sales", health: "At Risk", turnover: "8.0%", engagement: "62", burnout: "49", tone: "critical" as const },
  { name: "Operations", health: "Watch", turnover: "5.0%", engagement: "67", burnout: "41", tone: "warning" as const },
  { name: "People Operations", health: "Stable", turnover: "2.0%", engagement: "75", burnout: "27", tone: "positive" as const },
  { name: "Product", health: "Healthy", turnover: "1.0%", engagement: "83", burnout: "23", tone: "positive" as const }
];

export const attritionDistribution = [
  { label: "Low", value: 58, tone: "positive" as const },
  { label: "Medium", value: 28, tone: "warning" as const },
  { label: "High", value: 14, tone: "critical" as const }
];

export const trendCards = [
  {
    title: "Turnover trend",
    description: "Three monthly points are seeded so Recharts can plug in during Phase 4 without changing the route contract."
  },
  {
    title: "Engagement trend",
    description: "Survey pulse records are already modeled in Prisma for later aggregation."
  }
];

export const insightPreview = [
  "Turnover is materially above company average in Sales.",
  "Burnout risk is elevated in Operations and should be monitored.",
  "People Operations is the benchmark team for engagement in the seed dataset."
];

export const uploadDatasets = [
  { dataset: "Employees", format: "CSV / XLSX", status: "Creates or updates employees and departments" },
  { dataset: "Absences", format: "CSV / XLSX", status: "Loads absence events for existing employees" },
  { dataset: "Performance reviews", format: "CSV / XLSX", status: "Creates or updates review snapshots" },
  { dataset: "Promotions", format: "CSV / XLSX", status: "Preserves promotion history for analytics scoring" },
  { dataset: "Surveys", format: "CSV / XLSX", status: "Loads engagement and workload response data" }
];

export const architectureLayers = [
  { name: "Ingestion", detail: "Parse, preview, map columns, validate, persist." },
  { name: "Operational Data", detail: "Company, Department, Employee, Absence, Promotion, PerformanceReview, Survey, SurveyResponse." },
  { name: "Analytics Services", detail: "Turnover, absenteeism, engagement, attrition risk, burnout risk, department monthly metrics." },
  { name: "Analytics Storage", detail: "EmployeeRiskScore and TeamMetricsMonthly." },
  { name: "Dashboard Queries", detail: "Executive summary, department health, trends, distributions and insights." }
];
