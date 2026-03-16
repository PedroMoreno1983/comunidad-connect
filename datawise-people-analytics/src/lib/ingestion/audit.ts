import type { PrismaClient } from "@prisma/client";

import type {
  ImportHistoryEntry,
  ImportIssue,
  ImportResponse,
} from "@/lib/ingestion/types";
import { prisma } from "@/lib/prisma";
import type { DatasetKey, FileType } from "@/lib/validations/ingestion";

type AuditClient = PrismaClient;

type AuditBaseInput = {
  dataset: DatasetKey;
  fileName: string;
  fileType: FileType;
  hasHeader: boolean;
  totalRows: number;
  companyId?: string;
  companyName?: string;
  prismaClient?: AuditClient;
};

async function resolveCompanySnapshot(
  client: AuditClient,
  input: Pick<AuditBaseInput, "companyId" | "companyName">,
) {
  if (input.companyId) {
    const company = await client.company.findUnique({
      where: { id: input.companyId },
      select: { id: true, name: true },
    });

    if (company) {
      return {
        companyId: company.id,
        companyNameSnapshot: company.name,
      };
    }
  }

  if (input.companyName) {
    const company = await client.company.findFirst({
      where: { name: input.companyName },
      select: { id: true, name: true },
    });

    if (company) {
      return {
        companyId: company.id,
        companyNameSnapshot: company.name,
      };
    }

    return {
      companyId: undefined,
      companyNameSnapshot: input.companyName,
    };
  }

  return {
    companyId: undefined,
    companyNameSnapshot: undefined,
  };
}

export async function recordSuccessfulImportRun(
  input: AuditBaseInput & { result: ImportResponse },
) {
  const client = input.prismaClient ?? prisma;

  return client.importRun.create({
    data: {
      companyId: input.result.companyId,
      companyNameSnapshot: input.result.companyName,
      dataset: input.dataset,
      fileName: input.fileName,
      fileType: input.fileType,
      status: "success",
      hasHeader: input.hasHeader,
      totalRows: input.totalRows,
      importedCount: input.result.importedCount,
      createdCount: input.result.createdCount,
      updatedCount: input.result.updatedCount,
      issueCount: 0,
    },
  });
}

export async function recordFailedImportRun(
  input: AuditBaseInput & {
    issues?: ImportIssue[];
    errorMessage: string;
  },
) {
  const client = input.prismaClient ?? prisma;
  const companySnapshot = await resolveCompanySnapshot(client, input);
  const issues = input.issues ?? [];

  return client.importRun.create({
    data: {
      companyId: companySnapshot.companyId,
      companyNameSnapshot: companySnapshot.companyNameSnapshot,
      dataset: input.dataset,
      fileName: input.fileName,
      fileType: input.fileType,
      status: "failed",
      hasHeader: input.hasHeader,
      totalRows: input.totalRows,
      issueCount: issues.length,
      errorMessage: input.errorMessage,
      issues: issues.length
        ? {
            create: issues.slice(0, 20).map((issue) => ({
              rowNumber: issue.rowNumber,
              field: issue.field,
              message: issue.message,
            })),
          }
        : undefined,
    },
  });
}

export async function listImportRuns(companyId?: string) {
  const runs = await prisma.importRun.findMany({
    where: companyId ? { companyId } : undefined,
    include: {
      company: {
        select: {
          name: true,
        },
      },
      issues: {
        orderBy: [{ rowNumber: "asc" }, { field: "asc" }],
        take: 3,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 8,
  });

  return runs.map(
    (run) =>
      ({
        id: run.id,
        dataset: run.dataset as DatasetKey,
        fileName: run.fileName,
        fileType: run.fileType,
        status: run.status as "success" | "failed",
        companyId: run.companyId,
        companyName:
          run.company?.name ??
          run.companyNameSnapshot ??
          "Empresa no resuelta",
        totalRows: run.totalRows,
        importedCount: run.importedCount,
        createdCount: run.createdCount,
        updatedCount: run.updatedCount,
        issueCount: run.issueCount,
        errorMessage: run.errorMessage,
        createdAt: run.createdAt.toISOString(),
        issues: run.issues.map((issue) => ({
          rowNumber: issue.rowNumber,
          field: issue.field,
          message: issue.message,
        })),
      }) satisfies ImportHistoryEntry,
  );
}
