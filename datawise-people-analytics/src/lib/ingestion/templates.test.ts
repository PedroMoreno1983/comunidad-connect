import assert from "node:assert/strict";
import test from "node:test";

import { buildCsvTemplate } from "@/lib/ingestion/templates";

test("buildCsvTemplate genera filename y encabezados esperados", () => {
  const template = buildCsvTemplate("employees");
  const [headers, firstRow] = template.content.split("\n");

  assert.equal(template.fileName, "datawise-employees-template.csv");
  assert.equal(
    headers,
    "employee_id,first_name,last_name,hire_date,department,manager_id,job_title,job_level,contract_type,location,work_mode,age_band,gender,termination_date",
  );
  assert.match(firstRow ?? "", /^EMP-001,Ana,Lopez,2024-01-15,/);
});

test("buildCsvTemplate incluye filas de ejemplo por dataset", () => {
  const template = buildCsvTemplate("surveys");
  const rows = template.content.split("\n");

  assert.equal(rows.length, 3);
  assert.match(rows[1] ?? "", /^survey_name,survey_date,employee_id,dimension,score$|^Pulso/);
  assert.match(rows[2] ?? "", /^Pulso Marzo 2025,2025-03-15,EMP-001,workload,3.0$/);
});
