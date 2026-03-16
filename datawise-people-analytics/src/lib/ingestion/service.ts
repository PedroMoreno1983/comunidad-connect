import type { Company, Prisma, PrismaClient, Survey } from "@prisma/client";
import { ZodError } from "zod";

import { getDatasetDefinition } from "@/lib/ingestion/datasets";
import type { ParsedUpload } from "@/lib/ingestion/file-parser";
import type { ImportIssue, ImportResponse, PreviewResponse } from "@/lib/ingestion/types";
import { prisma } from "@/lib/prisma";
import {
  companySelectionSchema,
  datasetSchema,
  importRequestSchema,
  ingestionRowSchemas,
  type DatasetKey,
} from "@/lib/validations/ingestion";

type TransactionClient = Prisma.TransactionClient;
type ImportSummary = Omit<ImportResponse, "dataset" | "companyId" | "companyName">;

type CompanyInput = {
  companyId?: string;
  companyName?: string;
};

const PREVIEW_ROW_LIMIT = 6;

const HEADER_SYNONYMS: Record<DatasetKey, Record<string, string[]>> = {
  employees: {
    externalCode: ["externalcode", "employeecode", "employeeid", "employee_code", "external_code", "code"],
    firstName: ["firstname", "givenname", "name", "first_name"],
    lastName: ["lastname", "surname", "familyname", "last_name"],
    hireDate: ["hiredate", "startdate", "admissiondate", "hire_date", "start_date"],
    departmentName: ["departmentname", "department", "team", "area", "department_name"],
    managerExternalCode: ["managercode", "managerid", "manager_code", "manager_id", "reportsto"],
    jobTitle: ["jobtitle", "title", "position", "role", "job_title"],
    jobLevel: ["joblevel", "level", "seniority", "job_level"],
    contractType: ["contracttype", "contract", "contract_type"],
    location: ["location", "office", "city"],
    workMode: ["workmode", "modality", "work_type", "work_type"],
    ageBand: ["ageband", "agegroup", "age_band", "age_group"],
    gender: ["gender", "sex"],
    terminationDate: ["terminationdate", "enddate", "termination", "termination_date", "end_date"],
  },
  absences: {
    employeeExternalCode: ["externalcode", "employeecode", "employeeid", "employee_code", "external_code", "code"],
    date: ["date", "absencedate", "absence_date"],
    days: ["days", "daysabsent", "days_absent"],
    type: ["type", "absencetype", "absence_type", "category"],
  },
  performance: {
    employeeExternalCode: ["externalcode", "employeecode", "employeeid", "employee_code", "external_code", "code"],
    reviewDate: ["reviewdate", "evaluationdate", "review_date", "evaluation_date"],
    score: ["score", "rating", "performancescore", "performance_score"],
    reviewer: ["reviewer", "reviewedby", "reviewed_by"],
  },
  promotions: {
    employeeExternalCode: ["externalcode", "employeecode", "employeeid", "employee_code", "external_code", "code"],
    effectiveAt: ["effectiveat", "effectivedate", "promotiondate", "effective_date", "promotion_date"],
    oldLevel: ["oldlevel", "fromlevel", "previouslevel", "old_level", "from_level", "previous_level"],
    newLevel: ["newlevel", "tolevel", "currentlevel", "new_level", "to_level", "current_level"],
  },
  surveys: {
    surveyName: ["surveyname", "pulsename", "survey", "survey_name", "pulse_name"],
    surveyCreatedAt: ["surveydate", "createdat", "pulse_date", "survey_date", "created_at"],
    employeeExternalCode: ["externalcode", "employeecode", "employeeid", "employee_code", "external_code", "code"],
    dimension: ["dimension", "topic", "questiongroup", "question_group"],
    score: ["score", "value", "responsescore", "response_score"],
  },
};

export class IngestionValidationError extends Error {
  constructor(public readonly issues: ImportIssue[]) {
    super("Import validation failed.");
  }
}

function normalizeHeaderName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function buildSuggestedMapping(dataset: DatasetKey, headers: string[]) {
  const normalizedHeaderMap = new Map(
    headers.map((header) => [normalizeHeaderName(header), header]),
  );
  const suggestions = HEADER_SYNONYMS[dataset];

  return Object.entries(suggestions).reduce<Record<string, string>>(
    (mapping, [fieldKey, synonyms]) => {
      const candidates = [fieldKey, ...synonyms];

      for (const candidate of candidates) {
        const matchedHeader = normalizedHeaderMap.get(normalizeHeaderName(candidate));

        if (matchedHeader) {
          mapping[fieldKey] = matchedHeader;
          break;
        }
      }

      return mapping;
    },
    {},
  );
}

function mapRowToCanonical(
  row: Record<string, string>,
  mapping: Record<string, string>,
) {
  return Object.entries(mapping).reduce<Record<string, string>>((record, [fieldKey, header]) => {
    record[fieldKey] = row[header] ?? "";
    return record;
  }, {});
}

function formatZodIssues(rowNumber: number, error: ZodError): ImportIssue[] {
  return error.issues.map((issue) => ({
    rowNumber,
    field: issue.path.join(".") || "row",
    message: issue.message,
  }));
}

function ensureRequiredMappings(
  dataset: DatasetKey,
  mapping: Record<string, string>,
) {
  const definition = getDatasetDefinition(dataset);
  return definition.fields
    .filter((field) => field.required && !mapping[field.key])
    .map((field) => field.key);
}

function dedupeStringArray(values: string[]) {
  return Array.from(new Set(values.filter((value) => value.length > 0)));
}

async function resolveCompany(
  tx: TransactionClient,
  dataset: DatasetKey,
  input: CompanyInput,
) {
  const companySelection = companySelectionSchema.parse(input);

  if (companySelection.companyId) {
    const company = await tx.company.findUnique({
      where: { id: companySelection.companyId },
    });

    if (!company) {
      throw new IngestionValidationError([
        {
          rowNumber: 0,
          field: "companyId",
          message: "No se encontro la empresa seleccionada.",
        },
      ]);
    }

    return company;
  }

  const companyName = companySelection.companyName!;
  const existingCompany = await tx.company.findFirst({
    where: { name: companyName },
  });

  if (existingCompany) {
    return existingCompany;
  }

  if (dataset !== "employees") {
    throw new IngestionValidationError([
      {
        rowNumber: 0,
        field: "companyName",
        message: "La empresa aun no existe. Importa primero empleados o selecciona una empresa existente.",
      },
    ]);
  }

  return tx.company.create({
    data: {
      name: companyName,
    },
  });
}

async function upsertDepartments(
  tx: TransactionClient,
  companyId: string,
  departmentNames: string[],
) {
  const existing = await tx.department.findMany({
    where: {
      companyId,
      name: { in: departmentNames },
    },
  });

  const departmentMap = new Map(existing.map((department) => [department.name, department]));

  for (const departmentName of departmentNames) {
    if (departmentMap.has(departmentName)) {
      continue;
    }

    const department = await tx.department.create({
      data: {
        companyId,
        name: departmentName,
      },
    });

    departmentMap.set(department.name, department);
  }

  return departmentMap;
}

async function importEmployees(
  tx: TransactionClient,
  company: Company,
  rows: Array<Record<string, unknown>>,
) {
  const typedRows = rows as Array<Prisma.EmployeeUncheckedCreateInput & { departmentName: string; managerExternalCode?: string }>;
  const departmentNames = dedupeStringArray(
    typedRows.map((row) => String(row.departmentName ?? "")),
  );
  const departmentMap = await upsertDepartments(tx, company.id, departmentNames);
  const employeeCodes = dedupeStringArray(
    typedRows.map((row) => String(row.externalCode ?? "")),
  );
  const managerCodes = dedupeStringArray(
    typedRows.map((row) => row.managerExternalCode ?? "").map(String),
  );
  const existingEmployees = await tx.employee.findMany({
    where: {
      companyId: company.id,
      externalCode: {
        in: dedupeStringArray([...employeeCodes, ...managerCodes]),
      },
    },
  });

  const employeeMap = new Map(
    existingEmployees
      .filter((employee) => employee.externalCode)
      .map((employee) => [employee.externalCode!, employee]),
  );
  const missingManagerCodes = managerCodes.filter(
    (managerCode) => !employeeCodes.includes(managerCode) && !employeeMap.has(managerCode),
  );

  if (missingManagerCodes.length > 0) {
    throw new IngestionValidationError(
      missingManagerCodes.map((managerCode) => ({
        rowNumber: 0,
        field: "managerExternalCode",
        message: `El manager ${managerCode} no existe en el archivo ni en la empresa seleccionada.`,
      })),
    );
  }

  let createdCount = 0;
  let updatedCount = 0;

  for (const row of typedRows) {
    const department = departmentMap.get(String(row.departmentName));

    if (!department) {
      throw new IngestionValidationError([
        {
          rowNumber: 0,
          field: "departmentName",
          message: `No se pudo resolver el area ${row.departmentName}.`,
        },
      ]);
    }

    const existingEmployee = employeeMap.get(String(row.externalCode));
    const data = {
      companyId: company.id,
      departmentId: department.id,
      externalCode: String(row.externalCode),
      firstName: row.firstName ? String(row.firstName) : null,
      lastName: row.lastName ? String(row.lastName) : null,
      hireDate: row.hireDate as Date,
      terminationDate: (row.terminationDate as Date | undefined) ?? null,
      jobTitle: row.jobTitle ? String(row.jobTitle) : null,
      jobLevel: row.jobLevel ? String(row.jobLevel) : null,
      contractType: row.contractType ? String(row.contractType) : null,
      location: row.location ? String(row.location) : null,
      workMode: row.workMode ? String(row.workMode) : null,
      ageBand: row.ageBand ? String(row.ageBand) : null,
      gender: row.gender ? String(row.gender) : null,
    } satisfies Prisma.EmployeeUncheckedCreateInput;

    if (existingEmployee) {
      const employee = await tx.employee.update({
        where: { id: existingEmployee.id },
        data,
      });
      employeeMap.set(employee.externalCode ?? "", employee);
      updatedCount += 1;
      continue;
    }

    const employee = await tx.employee.create({
      data,
    });
    employeeMap.set(employee.externalCode ?? "", employee);
    createdCount += 1;
  }

  for (const row of typedRows) {
    if (!row.managerExternalCode) {
      continue;
    }

    const employee = employeeMap.get(String(row.externalCode));
    const manager = employeeMap.get(String(row.managerExternalCode));

    if (!employee || !manager) {
      continue;
    }

    await tx.employee.update({
      where: { id: employee.id },
      data: {
        managerId: manager.id,
      },
    });
  }

  const employeeCount = await tx.employee.count({
    where: { companyId: company.id },
  });

  await tx.company.update({
    where: { id: company.id },
    data: {
      employeeCount,
    },
  });

  return {
    importedCount: typedRows.length,
    createdCount,
    updatedCount,
    message: `Se importaron ${typedRows.length} empleados en ${company.name}.`,
  } satisfies ImportSummary;
}

async function resolveEmployeesByExternalCode(
  tx: TransactionClient,
  companyId: string,
  externalCodes: string[],
) {
  const employees = await tx.employee.findMany({
    where: {
      companyId,
      externalCode: {
        in: dedupeStringArray(externalCodes),
      },
    },
  });

  const employeeMap = new Map(
    employees
      .filter((employee) => employee.externalCode)
      .map((employee) => [employee.externalCode!, employee]),
  );

  const missingCodes = dedupeStringArray(externalCodes).filter(
    (code) => !employeeMap.has(code),
  );

  if (missingCodes.length > 0) {
    throw new IngestionValidationError(
      missingCodes.map((code) => ({
        rowNumber: 0,
        field: "employeeExternalCode",
        message: `No se encontro el empleado ${code} en la empresa seleccionada.`,
      })),
    );
  }

  return employeeMap;
}

async function importAbsences(
  tx: TransactionClient,
  company: Company,
  rows: Array<Record<string, unknown>>,
) {
  const typedRows = rows as Array<{
    employeeExternalCode: string;
    date: Date;
    days: number;
    type?: string;
  }>;
  const employeeMap = await resolveEmployeesByExternalCode(
    tx,
    company.id,
    typedRows.map((row) => row.employeeExternalCode),
  );

  let createdCount = 0;

  for (const row of typedRows) {
    const employee = employeeMap.get(row.employeeExternalCode)!;
    const existingAbsence = await tx.absence.findFirst({
      where: {
        employeeId: employee.id,
        date: row.date,
        days: row.days,
        type: row.type ?? null,
      },
    });

    if (existingAbsence) {
      continue;
    }

    await tx.absence.create({
      data: {
        employeeId: employee.id,
        date: row.date,
        days: row.days,
        type: row.type ?? null,
      },
    });
    createdCount += 1;
  }

  return {
    importedCount: typedRows.length,
    createdCount,
    updatedCount: 0,
    message: `Se importaron ${createdCount} nuevos eventos de ausencia en ${company.name}.`,
  } satisfies ImportSummary;
}

async function importPerformance(
  tx: TransactionClient,
  company: Company,
  rows: Array<Record<string, unknown>>,
) {
  const typedRows = rows as Array<{
    employeeExternalCode: string;
    reviewDate: Date;
    score: number;
    reviewer?: string;
  }>;
  const employeeMap = await resolveEmployeesByExternalCode(
    tx,
    company.id,
    typedRows.map((row) => row.employeeExternalCode),
  );

  let createdCount = 0;
  let updatedCount = 0;

  for (const row of typedRows) {
    const employee = employeeMap.get(row.employeeExternalCode)!;
    const existingReview = await tx.performanceReview.findFirst({
      where: {
        employeeId: employee.id,
        reviewDate: row.reviewDate,
      },
    });

    if (existingReview) {
      await tx.performanceReview.update({
        where: { id: existingReview.id },
        data: {
          score: row.score,
          reviewer: row.reviewer ?? null,
        },
      });
      updatedCount += 1;
      continue;
    }

    await tx.performanceReview.create({
      data: {
        employeeId: employee.id,
        reviewDate: row.reviewDate,
        score: row.score,
        reviewer: row.reviewer ?? null,
      },
    });
    createdCount += 1;
  }

  return {
    importedCount: typedRows.length,
    createdCount,
    updatedCount,
    message: `Se importaron ${typedRows.length} evaluaciones de desempeno en ${company.name}.`,
  } satisfies ImportSummary;
}

async function importPromotions(
  tx: TransactionClient,
  company: Company,
  rows: Array<Record<string, unknown>>,
) {
  const typedRows = rows as Array<{
    employeeExternalCode: string;
    effectiveAt: Date;
    oldLevel?: string;
    newLevel?: string;
  }>;
  const employeeMap = await resolveEmployeesByExternalCode(
    tx,
    company.id,
    typedRows.map((row) => row.employeeExternalCode),
  );

  let createdCount = 0;
  let updatedCount = 0;

  for (const row of typedRows) {
    const employee = employeeMap.get(row.employeeExternalCode)!;
    const existingPromotion = await tx.promotion.findFirst({
      where: {
        employeeId: employee.id,
        effectiveAt: row.effectiveAt,
      },
    });

    if (existingPromotion) {
      await tx.promotion.update({
        where: { id: existingPromotion.id },
        data: {
          oldLevel: row.oldLevel ?? null,
          newLevel: row.newLevel ?? null,
        },
      });
      updatedCount += 1;
      continue;
    }

    await tx.promotion.create({
      data: {
        employeeId: employee.id,
        effectiveAt: row.effectiveAt,
        oldLevel: row.oldLevel ?? null,
        newLevel: row.newLevel ?? null,
      },
    });
    createdCount += 1;
  }

  return {
    importedCount: typedRows.length,
    createdCount,
    updatedCount,
    message: `Se importaron ${typedRows.length} registros de promocion en ${company.name}.`,
  } satisfies ImportSummary;
}

async function resolveSurvey(
  tx: TransactionClient,
  companyId: string,
  surveyName: string,
  surveyCreatedAt?: Date,
) {
  const existingSurvey = await tx.survey.findFirst({
    where: {
      companyId,
      name: surveyName,
      ...(surveyCreatedAt ? { createdAt: surveyCreatedAt } : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  if (existingSurvey) {
    return existingSurvey;
  }

  return tx.survey.create({
    data: {
      companyId,
      name: surveyName,
      createdAt: surveyCreatedAt ?? new Date(),
    },
  });
}

async function importSurveys(
  tx: TransactionClient,
  company: Company,
  rows: Array<Record<string, unknown>>,
) {
  const typedRows = rows as Array<{
    surveyName: string;
    surveyCreatedAt?: Date;
    employeeExternalCode: string;
    dimension: string;
    score: number;
  }>;
  const employeeMap = await resolveEmployeesByExternalCode(
    tx,
    company.id,
    typedRows.map((row) => row.employeeExternalCode),
  );

  const surveyCache = new Map<string, Promise<Survey>>();
  let createdCount = 0;
  let updatedCount = 0;

  for (const row of typedRows) {
    const surveyKey = `${row.surveyName}::${row.surveyCreatedAt?.toISOString() ?? "latest"}`;
    let surveyPromise = surveyCache.get(surveyKey);

    if (!surveyPromise) {
      surveyPromise = resolveSurvey(tx, company.id, row.surveyName, row.surveyCreatedAt);
      surveyCache.set(surveyKey, surveyPromise);
    }

    const survey = await surveyPromise;
    const employee = employeeMap.get(row.employeeExternalCode)!;
    const existingResponse = await tx.surveyResponse.findFirst({
      where: {
        surveyId: survey.id,
        employeeId: employee.id,
        dimension: row.dimension,
      },
    });

    if (existingResponse) {
      await tx.surveyResponse.update({
        where: { id: existingResponse.id },
        data: {
          score: row.score,
        },
      });
      updatedCount += 1;
      continue;
    }

    await tx.surveyResponse.create({
      data: {
        surveyId: survey.id,
        employeeId: employee.id,
        dimension: row.dimension,
        score: row.score,
      },
    });
    createdCount += 1;
  }

  return {
    importedCount: typedRows.length,
    createdCount,
    updatedCount,
    message: `Se importaron ${typedRows.length} respuestas de encuesta en ${company.name}.`,
  } satisfies ImportSummary;
}

export function buildPreview(
  dataset: DatasetKey,
  parsedUpload: ParsedUpload,
): PreviewResponse {
  const definition = getDatasetDefinition(dataset);
  const suggestedMapping = buildSuggestedMapping(dataset, parsedUpload.headers);
  const missingRequiredFields = ensureRequiredMappings(dataset, suggestedMapping);

  return {
    dataset,
    fileName: parsedUpload.fileName,
    headers: parsedUpload.headers,
    totalRows: parsedUpload.totalRows,
    previewRows: parsedUpload.rows.slice(0, PREVIEW_ROW_LIMIT),
    fields: definition.fields,
    suggestedMapping,
    missingRequiredFields,
  };
}

export async function importFromParsedUpload(input: {
  dataset: DatasetKey;
  parsedUpload: ParsedUpload;
  mapping: Record<string, string>;
  companyId?: string;
  companyName?: string;
  prismaClient?: PrismaClient;
}) {
  const parsedRequest = importRequestSchema.parse({
    dataset: input.dataset,
    fileType: input.parsedUpload.fileType,
    hasHeader: true,
    mapping: input.mapping,
    companyId: input.companyId,
    companyName: input.companyName,
  });
  const dataset = datasetSchema.parse(parsedRequest.dataset);
  const missingRequiredMappings = ensureRequiredMappings(dataset, parsedRequest.mapping);

  if (missingRequiredMappings.length > 0) {
    throw new IngestionValidationError(
      missingRequiredMappings.map((fieldKey) => ({
        rowNumber: 0,
        field: fieldKey,
        message: `Mapea el campo obligatorio ${fieldKey} antes de importar.`,
      })),
    );
  }

  const unknownHeaders = Object.values(parsedRequest.mapping).filter(
    (header) => !input.parsedUpload.headers.includes(header),
  );

  if (unknownHeaders.length > 0) {
    throw new IngestionValidationError(
      unknownHeaders.map((header) => ({
        rowNumber: 0,
        field: header,
        message: "El encabezado mapeado no existe en el archivo cargado.",
      })),
    );
  }

  const validationIssues: ImportIssue[] = [];
  const canonicalRows: Array<Record<string, unknown>> = [];

  for (const [index, row] of input.parsedUpload.rows.entries()) {
    const mappedRow = mapRowToCanonical(row, parsedRequest.mapping);
    const schema = ingestionRowSchemas[dataset];
    const parsedRow = schema.safeParse(mappedRow);

    if (!parsedRow.success) {
      validationIssues.push(...formatZodIssues(index + 2, parsedRow.error));
      continue;
    }

    canonicalRows.push(parsedRow.data as Record<string, unknown>);
  }

  if (validationIssues.length > 0) {
    throw new IngestionValidationError(validationIssues);
  }

  if (canonicalRows.length === 0) {
    throw new IngestionValidationError([
      {
        rowNumber: 0,
        field: "file",
        message: "El archivo cargado no contiene filas de datos para importar.",
      },
    ]);
  }

  const client = input.prismaClient ?? prisma;

  return client.$transaction(async (tx) => {
    const company = await resolveCompany(tx, dataset, {
      companyId: parsedRequest.companyId,
      companyName: parsedRequest.companyName,
    });

    switch (dataset) {
      case "employees":
        return {
          dataset,
          companyId: company.id,
          companyName: company.name,
          ...(await importEmployees(tx, company, canonicalRows)),
        };
      case "absences":
        return {
          dataset,
          companyId: company.id,
          companyName: company.name,
          ...(await importAbsences(tx, company, canonicalRows)),
        };
      case "performance":
        return {
          dataset,
          companyId: company.id,
          companyName: company.name,
          ...(await importPerformance(tx, company, canonicalRows)),
        };
      case "promotions":
        return {
          dataset,
          companyId: company.id,
          companyName: company.name,
          ...(await importPromotions(tx, company, canonicalRows)),
        };
      case "surveys":
        return {
          dataset,
          companyId: company.id,
          companyName: company.name,
          ...(await importSurveys(tx, company, canonicalRows)),
        };
    }
  });
}
