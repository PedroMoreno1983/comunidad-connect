import assert from "node:assert/strict";
import test from "node:test";

import { buildPreview } from "@/lib/ingestion/service";
import type { ParsedUpload } from "@/lib/ingestion/file-parser";

test("buildPreview sugiere mappings usando sinonimos de headers", () => {
  const parsedUpload: ParsedUpload = {
    fileName: "employees.csv",
    fileType: "csv",
    headers: [
      "employee_id",
      "first_name",
      "last_name",
      "department",
      "start_date",
      "manager_id",
    ],
    totalRows: 2,
    rows: [
      {
        employee_id: "EMP-001",
        first_name: "Ana",
        last_name: "Lopez",
        department: "People",
        start_date: "2024-01-15",
        manager_id: "EMP-010",
      },
    ],
  };

  const preview = buildPreview("employees", parsedUpload);

  assert.deepEqual(preview.suggestedMapping, {
    externalCode: "employee_id",
    firstName: "first_name",
    lastName: "last_name",
    hireDate: "start_date",
    departmentName: "department",
    managerExternalCode: "manager_id",
  });
  assert.deepEqual(preview.missingRequiredFields, []);
});

test("buildPreview reporta campos obligatorios faltantes cuando no los puede resolver", () => {
  const parsedUpload: ParsedUpload = {
    fileName: "promotions.csv",
    fileType: "csv",
    headers: ["employee_code", "old_level"],
    totalRows: 1,
    rows: [
      {
        employee_code: "EMP-001",
        old_level: "IC",
      },
    ],
  };

  const preview = buildPreview("promotions", parsedUpload);

  assert.deepEqual(preview.missingRequiredFields, ["effectiveAt"]);
});
