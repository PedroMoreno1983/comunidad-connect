import { z } from "zod";

const blankToUndefined = (value: unknown) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};

const requiredString = z.preprocess(blankToUndefined, z.string().min(1));
const optionalString = z.preprocess(blankToUndefined, z.string().min(1).optional());
const optionalUuid = z.preprocess(blankToUndefined, z.string().uuid().optional());
const dateInput = z.preprocess((value) => {
  const normalized = blankToUndefined(value);

  if (normalized === undefined) {
    return undefined;
  }

  if (normalized instanceof Date) {
    return normalized;
  }

  if (typeof normalized === "number") {
    return new Date(normalized);
  }

  if (typeof normalized === "string") {
    return new Date(normalized);
  }

  return normalized;
}, z.date());
const optionalDateInput = z.preprocess((value) => {
  const normalized = blankToUndefined(value);
  if (normalized === undefined) {
    return undefined;
  }
  if (normalized instanceof Date) {
    return normalized;
  }
  if (typeof normalized === "number") {
    return new Date(normalized);
  }
  if (typeof normalized === "string") {
    return new Date(normalized);
  }
  return normalized;
}, z.date().optional());
const numberInput = z.preprocess((value) => {
  const normalized = blankToUndefined(value);

  if (typeof normalized === "number") {
    return normalized;
  }

  if (typeof normalized === "string") {
    return Number(normalized);
  }

  return normalized;
}, z.number().finite());

export const datasetSchema = z.enum([
  "employees",
  "absences",
  "performance",
  "promotions",
  "surveys",
]);

export const fileTypeSchema = z.enum(["csv", "xlsx"]);

export const uploadPreviewRequestSchema = z.object({
  dataset: datasetSchema,
  fileType: fileTypeSchema,
  hasHeader: z.boolean().default(true),
});

export const companySelectionSchema = z
  .object({
    companyId: optionalUuid,
    companyName: optionalString,
  })
  .superRefine((value, context) => {
    if (!value.companyId && !value.companyName) {
      context.addIssue({
        code: "custom",
        message: "A company selection is required for import.",
        path: ["companyId"],
      });
    }
  });

export const importRequestSchema = uploadPreviewRequestSchema
  .extend({
    mapping: z.record(z.string(), z.string().min(1)),
    companyId: optionalUuid,
    companyName: optionalString,
  })
  .superRefine((value, context) => {
    if (!value.companyId && !value.companyName) {
      context.addIssue({
        code: "custom",
        message: "Provide companyId or companyName before importing.",
        path: ["companyId"],
      });
    }
  });

export const employeeImportRowSchema = z.object({
  externalCode: requiredString,
  firstName: requiredString,
  lastName: requiredString,
  hireDate: dateInput,
  departmentName: requiredString,
  managerExternalCode: optionalString,
  jobTitle: optionalString,
  jobLevel: optionalString,
  contractType: optionalString,
  location: optionalString,
  workMode: optionalString,
  ageBand: optionalString,
  gender: optionalString,
  terminationDate: optionalDateInput,
});

export const absenceImportRowSchema = z.object({
  employeeExternalCode: requiredString,
  date: dateInput,
  days: numberInput.pipe(z.number().int().positive()),
  type: optionalString,
});

export const performanceImportRowSchema = z.object({
  employeeExternalCode: requiredString,
  reviewDate: dateInput,
  score: numberInput,
  reviewer: optionalString,
});

export const promotionImportRowSchema = z.object({
  employeeExternalCode: requiredString,
  effectiveAt: dateInput,
  oldLevel: optionalString,
  newLevel: optionalString,
});

export const surveyImportRowSchema = z.object({
  surveyName: requiredString,
  surveyCreatedAt: optionalDateInput,
  employeeExternalCode: requiredString,
  dimension: requiredString,
  score: numberInput,
});

export const ingestionRowSchemas = {
  employees: employeeImportRowSchema,
  absences: absenceImportRowSchema,
  performance: performanceImportRowSchema,
  promotions: promotionImportRowSchema,
  surveys: surveyImportRowSchema,
} as const;

export type DatasetKey = z.infer<typeof datasetSchema>;
export type FileType = z.infer<typeof fileTypeSchema>;
export type UploadPreviewRequest = z.infer<typeof uploadPreviewRequestSchema>;
export type ImportRequest = z.infer<typeof importRequestSchema>;
export type EmployeeImportRow = z.infer<typeof employeeImportRowSchema>;
export type AbsenceImportRow = z.infer<typeof absenceImportRowSchema>;
export type PerformanceImportRow = z.infer<typeof performanceImportRowSchema>;
export type PromotionImportRow = z.infer<typeof promotionImportRowSchema>;
export type SurveyImportRow = z.infer<typeof surveyImportRowSchema>;
