import { getDatasetDefinition } from "@/lib/ingestion/datasets";
import type { DatasetKey } from "@/lib/validations/ingestion";

const TEMPLATE_ROWS: Record<DatasetKey, string[][]> = {
  employees: [
    [
      "EMP-001",
      "Ana",
      "Lopez",
      "2024-01-15",
      "People",
      "EMP-010",
      "People Analyst",
      "IC",
      "Full-time",
      "Santiago",
      "Hybrid",
      "25-34",
      "Female",
      "",
    ],
    [
      "EMP-010",
      "Carlos",
      "Rojas",
      "2021-08-02",
      "People",
      "",
      "People Director",
      "Director",
      "Full-time",
      "Santiago",
      "Hybrid",
      "35-44",
      "Male",
      "",
    ],
  ],
  absences: [
    ["EMP-001", "2025-03-06", "2", "Medical"],
    ["EMP-001", "2025-03-18", "1", "Personal"],
  ],
  performance: [
    ["EMP-001", "2025-03-31", "4.2", "Carlos Rojas"],
    ["EMP-010", "2025-03-31", "4.6", "CEO Demo"],
  ],
  promotions: [
    ["EMP-001", "2025-01-01", "IC", "Senior IC"],
    ["EMP-010", "2024-08-01", "Manager", "Director"],
  ],
  surveys: [
    ["Pulso Marzo 2025", "2025-03-15", "EMP-001", "engagement", "4.1"],
    ["Pulso Marzo 2025", "2025-03-15", "EMP-001", "workload", "3.0"],
  ],
};

function escapeCsvValue(value: string) {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replaceAll('"', '""')}"`;
  }

  return value;
}

export function buildCsvTemplate(dataset: DatasetKey) {
  const definition = getDatasetDefinition(dataset);
  const headers = definition.fields.map((field) => field.sampleHeaders[0] ?? field.key);
  const rows = TEMPLATE_ROWS[dataset] ?? [];
  const csvLines = [headers, ...rows].map((row) =>
    row.map((value) => escapeCsvValue(value)).join(","),
  );

  return {
    fileName: `datawise-${dataset}-template.csv`,
    content: csvLines.join("\n"),
  };
}
