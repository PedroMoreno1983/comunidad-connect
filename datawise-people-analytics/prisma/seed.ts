import "dotenv/config";

import { PrismaClient } from "@prisma/client";

import { runAnalyticsPipeline } from "../src/lib/analytics/pipeline";

process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@localhost:5432/datawise_people_analytics?schema=public";

const prisma = new PrismaClient();

type DepartmentKey = "executive" | "peopleOps" | "sales" | "product" | "operations";

type EmployeeTemplate = {
  key: string;
  departmentKey: DepartmentKey;
  managerKey?: string;
  hireDate: string;
  jobTitle: string;
  jobLevel: string;
  contractType: string;
  location: string;
  workMode: string;
  ageBand: string;
  gender: string;
};

type SurveyProfile = {
  engagement: number;
  workload: number;
  managerSupport: number;
};

type DemoScenario = {
  code: string;
  name: string;
  industry: string;
  departmentNames: Record<DepartmentKey, string>;
  pulseProfiles: Record<DepartmentKey, [SurveyProfile, SurveyProfile, SurveyProfile]>;
  absenceProfiles: Record<DepartmentKey, { monthlyChance: number; maxDays: number; extraChance: number }>;
  performanceProfiles: Record<DepartmentKey, { firstReview: number; secondReview: number }>;
  terminations: Array<[employeeKey: string, date: string]>;
  promotions: Array<
    [employeeKey: string, effectiveAt: string, oldLevel: string, newLevel: string]
  >;
};

type SeriesConfig = {
  prefix: string;
  count: number;
  departmentKey: DepartmentKey;
  managerKey?: string | ((index: number) => string);
  jobTitle: string | ((index: number) => string);
  jobLevel: string | ((index: number) => string);
  location: string | ((index: number) => string);
  workMode: string | ((index: number) => string);
  ageBand: string | ((index: number) => string);
  gender: string | ((index: number) => string);
  hireYear: number;
  hireMonth: number;
};

type CreatedEmployee = {
  id: string;
  firstName: string;
  lastName: string;
  hireDate: Date;
  terminationDate: Date | null;
  departmentKey: DepartmentKey;
  managerKey?: string;
};

const SURVEY_SNAPSHOTS = [
  ["January Pulse", "2025-01-15"],
  ["February Pulse", "2025-02-15"],
  ["March Pulse", "2025-03-15"],
] as const;

const REVIEW_DATES = ["2024-09-15", "2024-12-15"] as const;
const LATEST_DEMO_MONTH_END = createUtcDate("2025-03-31");

const FIRST_NAMES = [
  "Alicia", "Benjamin", "Camila", "Diego", "Elena", "Felipe", "Gabriela", "Hector",
  "Ines", "Javier", "Karina", "Lucas", "Manuela", "Nicolas", "Olivia", "Pablo",
  "Renata", "Sebastian", "Tamara", "Valentina", "Antonia", "Bruno", "Catalina",
  "Daniel", "Emilia", "Francisco", "Isidora", "Joaquin", "Martina", "Vicente",
  "Constanza", "Ignacio", "Lorena", "Matias", "Paula", "Rocio",
];

const LAST_NAMES = [
  "Rojas", "Soto", "Vega", "Mella", "Herrera", "Fuentes", "Araya", "Munoz",
  "Pino", "Silva", "Caceres", "Leon", "Cruz", "Mora", "Navarro", "Ibarra",
  "Paredes", "Tapia", "Gallardo", "Castro", "Ruiz", "Salazar", "Torres",
  "Figueroa", "Acuna", "Vidal", "Bravo", "Sepulveda", "Ortega", "Aguirre",
  "Reyes", "Maldonado", "Miranda", "Contreras", "Navarrete", "Campos",
];

const DEPARTMENT_HEAD_KEYS: Record<DepartmentKey, string> = {
  executive: "ceo",
  peopleOps: "hr_director",
  sales: "sales_head",
  product: "product_head",
  operations: "ops_head",
};

function createUtcDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: string) {
  return hashString(seed) / 4294967295;
}

function roundTo(value: number, decimals = 2) {
  return Number(value.toFixed(decimals));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function resolve<T>(value: T | ((index: number) => T), index: number) {
  return typeof value === "function" ? (value as (currentIndex: number) => T)(index) : value;
}

function pick(values: string[], index: number) {
  return values[(index - 1) % values.length]!;
}

function buildSequentialDate(year: number, month: number, index: number) {
  const date = new Date(Date.UTC(year, month - 1, 1));
  date.setUTCMonth(date.getUTCMonth() + index - 1);
  date.setUTCDate(((index * 3) % 28) + 1);
  return toIsoDate(date);
}

function varyScore(base: number, seed: string, spread = 0.35) {
  return roundTo(clamp(base + (seededRandom(seed) - 0.5) * spread, 1.8, 4.9));
}

function isActiveOn(date: Date, hireDate: Date, terminationDate: Date | null) {
  return hireDate <= date && (!terminationDate || terminationDate >= date);
}

function buildIdentity(index: number, scenarioCode: string) {
  const offset = hashString(scenarioCode) % FIRST_NAMES.length;
  return {
    firstName: FIRST_NAMES[(offset + index) % FIRST_NAMES.length]!,
    lastName: LAST_NAMES[
      (offset * 5 + index * 3 + Math.floor(index / FIRST_NAMES.length)) %
      LAST_NAMES.length
    ]!,
  };
}

function addSeries(templates: EmployeeTemplate[], config: SeriesConfig) {
  for (let index = 1; index <= config.count; index += 1) {
    templates.push({
      key: `${config.prefix}_${String(index).padStart(2, "0")}`,
      departmentKey: config.departmentKey,
      managerKey: resolve(config.managerKey, index),
      hireDate: buildSequentialDate(config.hireYear, config.hireMonth, index),
      jobTitle: resolve(config.jobTitle, index),
      jobLevel: resolve(config.jobLevel, index),
      contractType: "Full-time",
      location: resolve(config.location, index),
      workMode: resolve(config.workMode, index),
      ageBand: resolve(config.ageBand, index),
      gender: resolve(config.gender, index),
    });
  }
}

const SCENARIOS: DemoScenario[] = [
  {
    code: "northstar",
    name: "Northstar Software",
    industry: "B2B SaaS",
    departmentNames: {
      executive: "Executive",
      peopleOps: "People",
      sales: "Revenue",
      product: "Product & Engineering",
      operations: "Customer Operations",
    },
    pulseProfiles: {
      executive: [{ engagement: 4.7, workload: 4.4, managerSupport: 4.6 }, { engagement: 4.7, workload: 4.4, managerSupport: 4.6 }, { engagement: 4.8, workload: 4.5, managerSupport: 4.7 }],
      peopleOps: [{ engagement: 4.2, workload: 3.9, managerSupport: 4.1 }, { engagement: 4.1, workload: 3.8, managerSupport: 4.0 }, { engagement: 4.1, workload: 3.9, managerSupport: 4.1 }],
      sales: [{ engagement: 3.8, workload: 3.2, managerSupport: 3.6 }, { engagement: 3.4, workload: 2.9, managerSupport: 3.2 }, { engagement: 3.1, workload: 2.7, managerSupport: 2.9 }],
      product: [{ engagement: 4.4, workload: 3.8, managerSupport: 4.3 }, { engagement: 4.4, workload: 3.8, managerSupport: 4.2 }, { engagement: 4.5, workload: 3.7, managerSupport: 4.3 }],
      operations: [{ engagement: 4.0, workload: 3.4, managerSupport: 3.8 }, { engagement: 3.8, workload: 3.1, managerSupport: 3.5 }, { engagement: 3.6, workload: 2.9, managerSupport: 3.3 }],
    },
    absenceProfiles: {
      executive: { monthlyChance: 0.04, maxDays: 1, extraChance: 0.01 },
      peopleOps: { monthlyChance: 0.08, maxDays: 2, extraChance: 0.03 },
      sales: { monthlyChance: 0.22, maxDays: 3, extraChance: 0.1 },
      product: { monthlyChance: 0.07, maxDays: 2, extraChance: 0.03 },
      operations: { monthlyChance: 0.16, maxDays: 3, extraChance: 0.08 },
    },
    performanceProfiles: {
      executive: { firstReview: 4.6, secondReview: 4.6 },
      peopleOps: { firstReview: 4.2, secondReview: 4.1 },
      sales: { firstReview: 4.1, secondReview: 3.7 },
      product: { firstReview: 4.3, secondReview: 4.4 },
      operations: { firstReview: 4.0, secondReview: 3.8 },
    },
    terminations: [["account_exec_02", "2025-01-20"], ["sdr_03", "2025-02-14"], ["account_exec_07", "2025-02-28"], ["csm_02", "2025-03-11"], ["sdr_08", "2025-03-24"], ["coordinator_04", "2025-03-19"]],
    promotions: [["hrbp", "2024-11-01", "Senior IC", "Manager"], ["people_analyst", "2025-01-01", "IC", "Senior IC"], ["pm_02", "2024-10-01", "Senior IC", "Manager"], ["engineer_03", "2024-12-01", "IC", "Senior IC"], ["regional_mgr_01", "2024-08-01", "Manager", "Director"]],
  },
  {
    code: "andes",
    name: "Andes Logistics",
    industry: "Logistics",
    departmentNames: {
      executive: "Executive",
      peopleOps: "People & Safety",
      sales: "Commercial",
      product: "Product Systems",
      operations: "Fulfillment Operations",
    },
    pulseProfiles: {
      executive: [{ engagement: 4.5, workload: 4.2, managerSupport: 4.5 }, { engagement: 4.5, workload: 4.1, managerSupport: 4.4 }, { engagement: 4.6, workload: 4.2, managerSupport: 4.5 }],
      peopleOps: [{ engagement: 4.0, workload: 3.7, managerSupport: 4.0 }, { engagement: 3.8, workload: 3.4, managerSupport: 3.8 }, { engagement: 3.7, workload: 3.3, managerSupport: 3.7 }],
      sales: [{ engagement: 4.0, workload: 3.7, managerSupport: 4.0 }, { engagement: 4.0, workload: 3.7, managerSupport: 3.9 }, { engagement: 3.9, workload: 3.6, managerSupport: 3.9 }],
      product: [{ engagement: 4.1, workload: 3.7, managerSupport: 4.0 }, { engagement: 4.1, workload: 3.7, managerSupport: 4.0 }, { engagement: 4.0, workload: 3.6, managerSupport: 3.9 }],
      operations: [{ engagement: 3.9, workload: 3.2, managerSupport: 3.6 }, { engagement: 3.4, workload: 2.8, managerSupport: 3.2 }, { engagement: 3.1, workload: 2.5, managerSupport: 3.0 }],
    },
    absenceProfiles: {
      executive: { monthlyChance: 0.05, maxDays: 1, extraChance: 0.01 },
      peopleOps: { monthlyChance: 0.12, maxDays: 2, extraChance: 0.04 },
      sales: { monthlyChance: 0.1, maxDays: 2, extraChance: 0.03 },
      product: { monthlyChance: 0.08, maxDays: 2, extraChance: 0.02 },
      operations: { monthlyChance: 0.28, maxDays: 3, extraChance: 0.12 },
    },
    performanceProfiles: {
      executive: { firstReview: 4.4, secondReview: 4.4 },
      peopleOps: { firstReview: 4.0, secondReview: 3.9 },
      sales: { firstReview: 4.0, secondReview: 4.0 },
      product: { firstReview: 4.1, secondReview: 4.1 },
      operations: { firstReview: 4.0, secondReview: 3.5 },
    },
    terminations: [["coordinator_02", "2025-01-16"], ["ops_analyst_03", "2025-01-31"], ["coordinator_08", "2025-02-12"], ["field_lead_02", "2025-02-26"], ["recruiter_02", "2025-03-14"], ["ops_analyst_08", "2025-03-07"], ["workforce_planner_03", "2025-03-21"]],
    promotions: [["sales_ops_manager", "2024-09-01", "Manager", "Senior Manager"], ["eng_manager_01", "2024-07-01", "Manager", "Director"], ["operations_manager_02", "2024-08-01", "Manager", "Senior Manager"], ["talent_ops", "2025-01-01", "IC", "Senior IC"]],
  },
  {
    code: "vertex",
    name: "Vertex Advisory",
    industry: "Professional Services",
    departmentNames: {
      executive: "Executive",
      peopleOps: "Talent",
      sales: "Growth",
      product: "Delivery Excellence",
      operations: "Client Operations",
    },
    pulseProfiles: {
      executive: [{ engagement: 4.6, workload: 4.3, managerSupport: 4.6 }, { engagement: 4.6, workload: 4.3, managerSupport: 4.6 }, { engagement: 4.7, workload: 4.4, managerSupport: 4.7 }],
      peopleOps: [{ engagement: 4.3, workload: 4.0, managerSupport: 4.2 }, { engagement: 4.3, workload: 4.0, managerSupport: 4.2 }, { engagement: 4.4, workload: 4.1, managerSupport: 4.3 }],
      sales: [{ engagement: 4.1, workload: 3.8, managerSupport: 4.0 }, { engagement: 4.1, workload: 3.8, managerSupport: 4.0 }, { engagement: 4.2, workload: 3.9, managerSupport: 4.1 }],
      product: [{ engagement: 4.4, workload: 4.0, managerSupport: 4.3 }, { engagement: 4.4, workload: 4.0, managerSupport: 4.3 }, { engagement: 4.5, workload: 4.1, managerSupport: 4.4 }],
      operations: [{ engagement: 4.2, workload: 3.9, managerSupport: 4.1 }, { engagement: 4.2, workload: 3.9, managerSupport: 4.1 }, { engagement: 4.3, workload: 4.0, managerSupport: 4.2 }],
    },
    absenceProfiles: {
      executive: { monthlyChance: 0.03, maxDays: 1, extraChance: 0.01 },
      peopleOps: { monthlyChance: 0.06, maxDays: 2, extraChance: 0.02 },
      sales: { monthlyChance: 0.08, maxDays: 2, extraChance: 0.03 },
      product: { monthlyChance: 0.05, maxDays: 1, extraChance: 0.02 },
      operations: { monthlyChance: 0.09, maxDays: 2, extraChance: 0.03 },
    },
    performanceProfiles: {
      executive: { firstReview: 4.5, secondReview: 4.6 },
      peopleOps: { firstReview: 4.2, secondReview: 4.3 },
      sales: { firstReview: 4.1, secondReview: 4.2 },
      product: { firstReview: 4.3, secondReview: 4.4 },
      operations: { firstReview: 4.1, secondReview: 4.2 },
    },
    terminations: [["sdr_01", "2025-02-21"], ["coordinator_10", "2025-03-28"]],
    promotions: [["hrbp", "2024-09-01", "Senior IC", "Manager"], ["recruiter_01", "2025-01-01", "IC", "Senior IC"], ["pm_01", "2024-10-01", "Senior IC", "Manager"], ["engineer_06", "2024-12-01", "IC", "Senior IC"], ["csm_05", "2024-11-01", "IC", "Senior IC"], ["operations_manager_01", "2024-08-01", "Manager", "Senior Manager"], ["field_lead_01", "2025-01-01", "IC", "Senior IC"]],
  },
];

function buildEmployeeTemplates() {
  const leaders = [
    ["ceo", "executive", undefined, "2018-04-02", "Chief Executive Officer", "Executive", "Santiago", "Hybrid", "45-54", "Female"],
    ["cfo", "executive", "ceo", "2019-07-08", "Chief Financial Officer", "Executive", "Santiago", "Hybrid", "45-54", "Male"],
    ["chief_of_staff", "executive", "ceo", "2021-03-15", "Chief of Staff", "Director", "Santiago", "Hybrid", "35-44", "Female"],
    ["hr_director", "peopleOps", "ceo", "2020-01-13", "People Director", "Director", "Santiago", "Hybrid", "35-44", "Male"],
    ["hrbp", "peopleOps", "hr_director", "2021-02-20", "HR Business Partner", "Senior IC", "Santiago", "Hybrid", "35-44", "Female"],
    ["recruiter_01", "peopleOps", "hr_director", "2023-04-10", "Talent Partner", "Senior IC", "Santiago", "Hybrid", "25-34", "Female"],
    ["recruiter_02", "peopleOps", "hr_director", "2024-01-15", "Talent Partner", "IC", "Bogota", "Remote", "25-34", "Male"],
    ["people_analyst", "peopleOps", "hrbp", "2023-08-14", "People Analytics Analyst", "IC", "Santiago", "Hybrid", "25-34", "Female"],
    ["learning_partner", "peopleOps", "hr_director", "2022-11-28", "Learning Partner", "Senior IC", "Lima", "Remote", "25-34", "Male"],
    ["comp_analyst", "peopleOps", "hr_director", "2022-09-06", "Compensation Analyst", "Senior IC", "Santiago", "Hybrid", "25-34", "Female"],
    ["hr_coordinator", "peopleOps", "hrbp", "2024-03-04", "HR Coordinator", "IC", "Santiago", "Hybrid", "25-34", "Male"],
    ["talent_ops", "peopleOps", "hr_director", "2024-05-13", "Talent Operations Specialist", "IC", "Bogota", "Remote", "25-34", "Female"],
    ["sales_head", "sales", "ceo", "2019-10-01", "VP Revenue", "Director", "Santiago", "Hybrid", "35-44", "Female"],
    ["regional_mgr_01", "sales", "sales_head", "2020-06-15", "Regional Sales Manager", "Manager", "Santiago", "Hybrid", "35-44", "Male"],
    ["regional_mgr_02", "sales", "sales_head", "2021-01-18", "Regional Sales Manager", "Manager", "Lima", "Remote", "35-44", "Female"],
    ["regional_mgr_03", "sales", "sales_head", "2021-05-24", "Regional Sales Manager", "Manager", "Bogota", "Remote", "35-44", "Male"],
    ["sales_ops_manager", "sales", "sales_head", "2022-02-07", "Sales Operations Manager", "Manager", "Santiago", "Hybrid", "35-44", "Female"],
    ["product_head", "product", "ceo", "2020-03-09", "VP Product", "Director", "Bogota", "Remote", "35-44", "Male"],
    ["eng_manager_01", "product", "product_head", "2021-04-12", "Engineering Manager", "Manager", "Bogota", "Remote", "35-44", "Female"],
    ["eng_manager_02", "product", "product_head", "2021-08-16", "Engineering Manager", "Manager", "Santiago", "Remote", "35-44", "Male"],
    ["design_manager", "product", "product_head", "2022-01-10", "Design Manager", "Manager", "Lima", "Remote", "35-44", "Female"],
    ["ops_head", "operations", "ceo", "2019-12-02", "VP Operations", "Director", "Santiago", "On-site", "35-44", "Female"],
    ["operations_manager_01", "operations", "ops_head", "2021-02-08", "Operations Manager", "Manager", "Santiago", "On-site", "35-44", "Male"],
    ["operations_manager_02", "operations", "ops_head", "2021-09-13", "Operations Manager", "Manager", "Bogota", "Hybrid", "35-44", "Female"],
    ["operations_manager_03", "operations", "ops_head", "2022-04-18", "Operations Manager", "Manager", "Lima", "On-site", "35-44", "Male"],
  ] as const;

  const templates = leaders.map(([key, departmentKey, managerKey, hireDate, jobTitle, jobLevel, location, workMode, ageBand, gender]) => ({
    key,
    departmentKey: departmentKey as DepartmentKey,
    managerKey: managerKey ?? undefined,
    hireDate,
    jobTitle,
    jobLevel,
    contractType: "Full-time",
    location,
    workMode,
    ageBand,
    gender,
  }));

  addSeries(templates, { prefix: "account_exec", count: 12, departmentKey: "sales", managerKey: (index) => (index <= 4 ? "regional_mgr_01" : index <= 8 ? "regional_mgr_02" : "regional_mgr_03"), jobTitle: "Account Executive", jobLevel: (index) => (index <= 4 ? "Senior IC" : "IC"), location: (index) => pick(["Santiago", "Lima", "Bogota"], index), workMode: (index) => (index % 2 === 0 ? "Remote" : "Hybrid"), ageBand: "25-34", gender: (index) => (index % 2 === 0 ? "Female" : "Male"), hireYear: 2022, hireMonth: 3 });
  addSeries(templates, { prefix: "sdr", count: 10, departmentKey: "sales", managerKey: (index) => (index <= 5 ? "regional_mgr_01" : "regional_mgr_02"), jobTitle: "Sales Development Representative", jobLevel: "IC", location: (index) => pick(["Santiago", "Lima"], index), workMode: "Remote", ageBand: "25-34", gender: (index) => (index % 2 === 0 ? "Male" : "Female"), hireYear: 2024, hireMonth: 1 });
  addSeries(templates, { prefix: "csm", count: 8, departmentKey: "sales", managerKey: (index) => (index <= 4 ? "regional_mgr_02" : "regional_mgr_03"), jobTitle: "Customer Success Manager", jobLevel: (index) => (index <= 3 ? "Senior IC" : "IC"), location: (index) => pick(["Santiago", "Bogota", "Lima"], index), workMode: (index) => (index % 3 === 0 ? "Hybrid" : "Remote"), ageBand: "25-34", gender: (index) => (index % 2 === 0 ? "Female" : "Male"), hireYear: 2023, hireMonth: 2 });
  addSeries(templates, { prefix: "sales_ops", count: 4, departmentKey: "sales", managerKey: "sales_ops_manager", jobTitle: "Sales Operations Analyst", jobLevel: (index) => (index === 1 ? "Senior IC" : "IC"), location: "Santiago", workMode: "Hybrid", ageBand: "25-34", gender: (index) => (index % 2 === 0 ? "Female" : "Male"), hireYear: 2023, hireMonth: 6 });
  addSeries(templates, { prefix: "pm", count: 4, departmentKey: "product", managerKey: "product_head", jobTitle: "Product Manager", jobLevel: (index) => (index <= 2 ? "Senior IC" : "IC"), location: (index) => pick(["Bogota", "Santiago"], index), workMode: "Remote", ageBand: "25-34", gender: (index) => (index % 2 === 0 ? "Female" : "Male"), hireYear: 2022, hireMonth: 5 });
  addSeries(templates, { prefix: "designer", count: 3, departmentKey: "product", managerKey: "design_manager", jobTitle: "Product Designer", jobLevel: (index) => (index === 1 ? "Senior IC" : "IC"), location: (index) => pick(["Bogota", "Lima"], index), workMode: "Remote", ageBand: "25-34", gender: (index) => (index % 2 === 0 ? "Male" : "Female"), hireYear: 2023, hireMonth: 3 });
  addSeries(templates, { prefix: "engineer", count: 12, departmentKey: "product", managerKey: (index) => (index <= 6 ? "eng_manager_01" : "eng_manager_02"), jobTitle: (index) => (index <= 4 ? "Software Engineer II" : "Software Engineer"), jobLevel: (index) => (index <= 4 ? "Senior IC" : "IC"), location: (index) => pick(["Bogota", "Santiago", "Lima"], index), workMode: "Remote", ageBand: "25-34", gender: (index) => (index % 2 === 0 ? "Male" : "Female"), hireYear: 2022, hireMonth: 4 });
  addSeries(templates, { prefix: "data_analyst", count: 2, departmentKey: "product", managerKey: "product_head", jobTitle: "Analytics Engineer", jobLevel: "Senior IC", location: "Santiago", workMode: "Hybrid", ageBand: "25-34", gender: (index) => (index % 2 === 0 ? "Female" : "Male"), hireYear: 2023, hireMonth: 7 });
  addSeries(templates, { prefix: "workforce_planner", count: 3, departmentKey: "operations", managerKey: (index) => (index <= 2 ? "operations_manager_01" : "operations_manager_02"), jobTitle: "Workforce Planner", jobLevel: (index) => (index === 1 ? "Senior IC" : "IC"), location: "Santiago", workMode: "Hybrid", ageBand: "25-34", gender: (index) => (index % 2 === 0 ? "Male" : "Female"), hireYear: 2022, hireMonth: 7 });
  addSeries(templates, { prefix: "ops_analyst", count: 10, departmentKey: "operations", managerKey: (index) => (index <= 4 ? "operations_manager_01" : index <= 7 ? "operations_manager_02" : "operations_manager_03"), jobTitle: "Operations Analyst", jobLevel: (index) => (index <= 3 ? "Senior IC" : "IC"), location: (index) => pick(["Santiago", "Bogota"], index), workMode: (index) => (index % 3 === 0 ? "Hybrid" : "On-site"), ageBand: "25-34", gender: (index) => (index % 2 === 0 ? "Female" : "Male"), hireYear: 2022, hireMonth: 10 });
  addSeries(templates, { prefix: "coordinator", count: 10, departmentKey: "operations", managerKey: (index) => (index <= 4 ? "operations_manager_01" : index <= 7 ? "operations_manager_02" : "operations_manager_03"), jobTitle: "Operations Coordinator", jobLevel: "IC", location: (index) => pick(["Santiago", "Lima"], index), workMode: "On-site", ageBand: "25-34", gender: (index) => (index % 2 === 0 ? "Male" : "Female"), hireYear: 2024, hireMonth: 1 });
  addSeries(templates, { prefix: "field_lead", count: 4, departmentKey: "operations", managerKey: "operations_manager_03", jobTitle: "Field Lead", jobLevel: (index) => (index <= 2 ? "Senior IC" : "IC"), location: (index) => pick(["Santiago", "Bogota"], index), workMode: "On-site", ageBand: "25-34", gender: (index) => (index % 2 === 0 ? "Female" : "Male"), hireYear: 2023, hireMonth: 5 });
  return templates;
}

async function seedScenario(scenario: DemoScenario, templates: EmployeeTemplate[]) {
  const terminationMap = new Map(
    scenario.terminations.map(([employeeKey, date]) => [employeeKey, createUtcDate(date)]),
  );
  const company = await prisma.company.create({
    data: { name: scenario.name, industry: scenario.industry, employeeCount: 0 },
  });
  const departments = {} as Record<DepartmentKey, { id: string; name: string }>;
  for (const key of Object.keys(scenario.departmentNames) as DepartmentKey[]) {
    const department = await prisma.department.create({
      data: { companyId: company.id, name: scenario.departmentNames[key] },
    });
    departments[key] = {
      id: department.id,
      name: department.name,
    };
  }

  const createdEmployees = new Map<string, CreatedEmployee>();

  for (const [index, template] of templates.entries()) {
    const identity = buildIdentity(index, scenario.code);
    const employee = await prisma.employee.create({
      data: {
        companyId: company.id,
        departmentId: departments[template.departmentKey].id,
        externalCode: `${scenario.code.toUpperCase()}-EMP-${String(index + 1).padStart(3, "0")}`,
        firstName: identity.firstName,
        lastName: identity.lastName,
        hireDate: createUtcDate(template.hireDate),
        terminationDate: terminationMap.get(template.key) ?? null,
        jobTitle: template.jobTitle,
        jobLevel: template.jobLevel,
        contractType: template.contractType,
        location: template.location,
        workMode: template.workMode,
        ageBand: template.ageBand,
        gender: template.gender,
      },
    });

    createdEmployees.set(template.key, {
      id: employee.id,
      firstName: identity.firstName,
      lastName: identity.lastName,
      hireDate: createUtcDate(template.hireDate),
      terminationDate: terminationMap.get(template.key) ?? null,
      departmentKey: template.departmentKey,
      managerKey: template.managerKey,
    });
  }

  for (const template of templates) {
    if (!template.managerKey) continue;
    const employee = createdEmployees.get(template.key);
    const manager = createdEmployees.get(template.managerKey);
    if (!employee || !manager) continue;
    await prisma.employee.update({
      where: { id: employee.id },
      data: { managerId: manager.id },
    });
  }

  const activeEmployeeCount = Array.from(createdEmployees.values()).filter(
    (employee) =>
      employee.hireDate <= LATEST_DEMO_MONTH_END &&
      (!employee.terminationDate || employee.terminationDate > LATEST_DEMO_MONTH_END),
  ).length;

  await prisma.company.update({
    where: { id: company.id },
    data: { employeeCount: activeEmployeeCount },
  });

  const absences = [];
  for (const [snapshotIndex, [, createdAt]] of SURVEY_SNAPSHOTS.entries()) {
    const snapshotDate = createUtcDate(createdAt);
    for (const template of templates) {
      const employee = createdEmployees.get(template.key)!;
      if (!isActiveOn(snapshotDate, employee.hireDate, employee.terminationDate)) continue;
      const profile = scenario.absenceProfiles[template.departmentKey];
      const managerDiscount = ["Manager", "Director", "Executive"].includes(template.jobLevel)
        ? -0.04
        : 0;
      const terminationBoost = employee.terminationDate ? 0.1 : 0;
      const chance = clamp(profile.monthlyChance + managerDiscount + terminationBoost, 0, 0.95);
      const baseSeed = `${scenario.code}-${template.key}-absence-${snapshotIndex}`;

      if (seededRandom(baseSeed) < chance) {
        const date = new Date(
          Date.UTC(
            snapshotDate.getUTCFullYear(),
            snapshotDate.getUTCMonth(),
            5 + Math.floor(seededRandom(`${baseSeed}-day`) * 18),
          ),
        );
        if (isActiveOn(date, employee.hireDate, employee.terminationDate)) {
          absences.push({
            employeeId: employee.id,
            date,
            days: 1 + Math.floor(seededRandom(`${baseSeed}-length`) * profile.maxDays),
            type: pick(["Medical", "Personal", "Caregiving", "Stress leave"], snapshotIndex + 1),
          });
        }
      }

      if (seededRandom(`${baseSeed}-extra`) < profile.extraChance) {
        const date = new Date(
          Date.UTC(
            snapshotDate.getUTCFullYear(),
            snapshotDate.getUTCMonth(),
            12 + Math.floor(seededRandom(`${baseSeed}-extra-day`) * 12),
          ),
        );
        if (isActiveOn(date, employee.hireDate, employee.terminationDate)) {
          absences.push({
            employeeId: employee.id,
            date,
            days: Math.min(
              profile.maxDays,
              1 + Math.floor(seededRandom(`${baseSeed}-extra-length`) * profile.maxDays),
            ),
            type: "Medical",
          });
        }
      }
    }
  }
  if (absences.length > 0) await prisma.absence.createMany({ data: absences });

  const performanceRows = [];
  for (const [reviewIndex, reviewDate] of REVIEW_DATES.entries()) {
    const currentReviewDate = createUtcDate(reviewDate);
    for (const template of templates) {
      const employee = createdEmployees.get(template.key)!;
      if (!isActiveOn(currentReviewDate, employee.hireDate, employee.terminationDate)) continue;
      const profile = scenario.performanceProfiles[template.departmentKey];
      const base = reviewIndex === 0 ? profile.firstReview : profile.secondReview;
      const terminationPenalty =
        employee.terminationDate && employee.terminationDate > currentReviewDate ? 0.15 : 0;
      const reviewerKey = employee.managerKey ?? DEPARTMENT_HEAD_KEYS[template.departmentKey];
      const reviewer = reviewerKey ? createdEmployees.get(reviewerKey) : undefined;
      performanceRows.push({
        employeeId: employee.id,
        reviewDate: currentReviewDate,
        score: varyScore(
          base - terminationPenalty,
          `${scenario.code}-${template.key}-review-${reviewIndex}`,
          0.45,
        ),
        reviewer: reviewer ? `${reviewer.firstName} ${reviewer.lastName}` : null,
      });
    }
  }
  if (performanceRows.length > 0) {
    await prisma.performanceReview.createMany({ data: performanceRows });
  }

  const promotions = scenario.promotions.flatMap(
    ([employeeKey, effectiveAt, oldLevel, newLevel]) => {
      const employee = createdEmployees.get(employeeKey);
      return employee
        ? [{ employeeId: employee.id, effectiveAt: createUtcDate(effectiveAt), oldLevel, newLevel }]
        : [];
    },
  );
  if (promotions.length > 0) await prisma.promotion.createMany({ data: promotions });

  for (const [snapshotIndex, [name, createdAt]] of SURVEY_SNAPSHOTS.entries()) {
    const surveyDate = createUtcDate(createdAt);
    const survey = await prisma.survey.create({
      data: { companyId: company.id, name, createdAt: surveyDate },
    });
    const responses = templates.flatMap((template) => {
      const employee = createdEmployees.get(template.key)!;
      if (!isActiveOn(surveyDate, employee.hireDate, employee.terminationDate)) return [];
      const profile = scenario.pulseProfiles[template.departmentKey][snapshotIndex];
      const terminationPenalty = employee.terminationDate ? 0.2 : 0;
      const managerBoost = ["Manager", "Director", "Executive"].includes(template.jobLevel)
        ? 0.08
        : 0;
      return [
        {
          surveyId: survey.id,
          employeeId: employee.id,
          dimension: "engagement",
          score: varyScore(
            profile.engagement - terminationPenalty + managerBoost,
            `${scenario.code}-${template.key}-engagement-${snapshotIndex}`,
          ),
        },
        {
          surveyId: survey.id,
          employeeId: employee.id,
          dimension: "workload",
          score: varyScore(
            profile.workload - terminationPenalty,
            `${scenario.code}-${template.key}-workload-${snapshotIndex}`,
          ),
        },
        {
          surveyId: survey.id,
          employeeId: employee.id,
          dimension: "manager_support",
          score: varyScore(
            profile.managerSupport - terminationPenalty + managerBoost,
            `${scenario.code}-${template.key}-support-${snapshotIndex}`,
          ),
        },
      ];
    });
    if (responses.length > 0) await prisma.surveyResponse.createMany({ data: responses });
  }
}

async function seedImportHistory() {
  const companies = await prisma.company.findMany({
    select: {
      id: true,
      name: true,
    },
  });
  const companyMap = new Map(companies.map((company) => [company.name, company]));

  const demoRuns = [
    {
      companyName: "Northstar Software",
      dataset: "employees",
      fileName: "northstar_headcount_q1.xlsx",
      fileType: "xlsx",
      status: "success",
      hasHeader: true,
      totalRows: 107,
      importedCount: 107,
      createdCount: 107,
      updatedCount: 0,
      createdAt: createUtcDate("2025-03-01"),
      issues: [],
      errorMessage: null,
    },
    {
      companyName: "Andes Logistics",
      dataset: "surveys",
      fileName: "andes_pulse_march.csv",
      fileType: "csv",
      status: "success",
      hasHeader: true,
      totalRows: 300,
      importedCount: 300,
      createdCount: 300,
      updatedCount: 0,
      createdAt: createUtcDate("2025-03-15"),
      issues: [],
      errorMessage: null,
    },
    {
      companyName: "Vertex Advisory",
      dataset: "promotions",
      fileName: "vertex_movements.xlsx",
      fileType: "xlsx",
      status: "success",
      hasHeader: true,
      totalRows: 7,
      importedCount: 7,
      createdCount: 7,
      updatedCount: 0,
      createdAt: createUtcDate("2025-03-18"),
      issues: [],
      errorMessage: null,
    },
    {
      companyName: "Andes Logistics",
      dataset: "absences",
      fileName: "andes_absence_corrections.csv",
      fileType: "csv",
      status: "failed",
      hasHeader: true,
      totalRows: 14,
      importedCount: null,
      createdCount: null,
      updatedCount: null,
      createdAt: createUtcDate("2025-03-20"),
      issues: [
        {
          rowNumber: 5,
          field: "employeeExternalCode",
          message: "No se encontro el empleado AND-999 en la empresa seleccionada.",
        },
        {
          rowNumber: 9,
          field: "date",
          message: "Invalid input: expected date, received Date",
        },
      ],
      errorMessage: "La validacion de la importacion fallo.",
    },
  ];

  for (const run of demoRuns) {
    const company = companyMap.get(run.companyName);

    if (!company) {
      continue;
    }

    await prisma.importRun.create({
      data: {
        companyId: company.id,
        companyNameSnapshot: run.companyName,
        dataset: run.dataset,
        fileName: run.fileName,
        fileType: run.fileType,
        status: run.status,
        hasHeader: run.hasHeader,
        totalRows: run.totalRows,
        importedCount: run.importedCount,
        createdCount: run.createdCount,
        updatedCount: run.updatedCount,
        issueCount: run.issues.length,
        errorMessage: run.errorMessage,
        createdAt: run.createdAt,
        issues: run.issues.length
          ? {
              create: run.issues,
            }
          : undefined,
      },
    });
  }
}

async function main() {
  await prisma.importRunIssue.deleteMany();
  await prisma.importRun.deleteMany();
  await prisma.employeeRiskScore.deleteMany();
  await prisma.surveyResponse.deleteMany();
  await prisma.performanceReview.deleteMany();
  await prisma.absence.deleteMany();
  await prisma.promotion.deleteMany();
  await prisma.teamMetricsMonthly.deleteMany();
  await prisma.survey.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.department.deleteMany();
  await prisma.company.deleteMany();

  const templates = buildEmployeeTemplates();
  for (const scenario of SCENARIOS) {
    await seedScenario(scenario, templates);
  }

  await runAnalyticsPipeline({ prismaClient: prisma });
  await seedImportHistory();
  console.log(
    `Seed completed with ${SCENARIOS.length} demo companies and ${templates.length} employees per scenario.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
