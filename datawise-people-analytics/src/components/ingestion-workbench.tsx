"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, Database, LoaderCircle, UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type {
  ImportHistoryEntry,
  ImportIssue,
  ImportResponse,
  PreviewResponse,
} from "@/lib/ingestion/types";
import { ingestionDatasets } from "@/lib/ingestion/datasets";
import type { DatasetKey } from "@/lib/validations/ingestion";

type CompanyOption = {
  id: string;
  name: string;
  industry: string | null;
  employeeCount: number | null;
};

function getFileTypeFromName(fileName: string) {
  const lowerCaseName = fileName.toLowerCase();

  if (lowerCaseName.endsWith(".csv")) {
    return "csv";
  }

  if (lowerCaseName.endsWith(".xlsx")) {
    return "xlsx";
  }

  return null;
}

const inputClassName =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400";
const selectClassName = inputClassName;

function formatHistoryTimestamp(value: string) {
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getDatasetLabel(dataset: DatasetKey) {
  return ingestionDatasets.find((item) => item.key === dataset)?.label ?? dataset;
}

export function IngestionWorkbench() {
  const [dataset, setDataset] = useState<DatasetKey>("employees");
  const [file, setFile] = useState<File | null>(null);
  const [hasHeader, setHasHeader] = useState(true);
  const [companyId, setCompanyId] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [issues, setIssues] = useState<ImportIssue[]>([]);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [historyRuns, setHistoryRuns] = useState<ImportHistoryEntry[]>([]);
  const [isCompaniesLoading, startCompaniesTransition] = useTransition();
  const [isHistoryLoading, startHistoryTransition] = useTransition();
  const [isPreviewPending, startPreviewTransition] = useTransition();
  const [isImportPending, startImportTransition] = useTransition();

  const currentDataset = ingestionDatasets.find((item) => item.key === dataset)!;
  const missingRequiredFields = currentDataset.fields
    .filter((field) => field.required && !mapping[field.key])
    .map((field) => field.label);
  const companyNameHelpText =
    dataset === "employees"
      ? "La importacion de empleados puede crear la empresa si aun no existe."
      : "Para datasets distintos de empleados, usa una empresa existente o el nombre exacto de una ya creada.";

  function loadCompanies() {
    startCompaniesTransition(() => {
      void (async () => {
        try {
          const response = await fetch("/api/ingestion/companies", {
            cache: "no-store",
          });

          if (!response.ok) {
            return;
          }

          const payload = (await response.json()) as { companies?: CompanyOption[] };
          setCompanies(payload.companies ?? []);
        } catch {
          setCompanies([]);
        }
      })();
    });
  }

  function loadHistory(nextCompanyId?: string) {
    startHistoryTransition(() => {
      void (async () => {
        try {
          const searchParams = new URLSearchParams();

          if (nextCompanyId && nextCompanyId.trim().length > 0) {
            searchParams.set("companyId", nextCompanyId);
          }

          const response = await fetch(
            `/api/ingestion/history${searchParams.toString() ? `?${searchParams.toString()}` : ""}`,
            {
              cache: "no-store",
            },
          );

          if (!response.ok) {
            return;
          }

          const payload = (await response.json()) as { runs?: ImportHistoryEntry[] };
          setHistoryRuns(payload.runs ?? []);
        } catch {
          setHistoryRuns([]);
        }
      })();
    });
  }

  useEffect(() => {
    startCompaniesTransition(() => {
      void (async () => {
        try {
          const response = await fetch("/api/ingestion/companies", {
            cache: "no-store",
          });

          if (!response.ok) {
            return;
          }

          const payload = (await response.json()) as { companies?: CompanyOption[] };
          setCompanies(payload.companies ?? []);
        } catch {
          setCompanies([]);
        }
      })();
    });
  }, []);

  useEffect(() => {
    startHistoryTransition(() => {
      void (async () => {
        try {
          const searchParams = new URLSearchParams();

          if (companyId && companyId.trim().length > 0) {
            searchParams.set("companyId", companyId);
          }

          const response = await fetch(
            `/api/ingestion/history${searchParams.toString() ? `?${searchParams.toString()}` : ""}`,
            {
              cache: "no-store",
            },
          );

          if (!response.ok) {
            return;
          }

          const payload = (await response.json()) as { runs?: ImportHistoryEntry[] };
          setHistoryRuns(payload.runs ?? []);
        } catch {
          setHistoryRuns([]);
        }
      })();
    });
  }, [companyId]);

  function resetFlow(nextDataset?: DatasetKey) {
    if (nextDataset) {
      setDataset(nextDataset);
    }
    setPreview(null);
    setMapping({});
    setIssues([]);
    setResult(null);
    setErrorMessage(null);
  }

  function handleDatasetChange(nextDataset: DatasetKey) {
    resetFlow(nextDataset);
  }

  function handleFileChange(nextFile: File | null) {
    setFile(nextFile);
    resetFlow();
  }

  function handlePreviewSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      setErrorMessage("Elige un archivo CSV o XLSX antes de generar el preview.");
      return;
    }

    const fileType = getFileTypeFromName(file.name);

    if (!fileType) {
      setErrorMessage("En este MVP solo se soportan archivos CSV y XLSX.");
      return;
    }

    setErrorMessage(null);
    setIssues([]);
    setResult(null);

    startPreviewTransition(() => {
      void (async () => {
        try {
          const formData = new FormData();
          formData.set("dataset", dataset);
          formData.set("fileType", fileType);
          formData.set("hasHeader", String(hasHeader));
          formData.set("file", file);

          const response = await fetch("/api/ingestion/preview", {
            method: "POST",
            body: formData,
          });
          const payload = (await response.json()) as
            | PreviewResponse
            | { error?: string; details?: unknown };

          if (!response.ok) {
            setPreview(null);
            setMapping({});
            setErrorMessage(
              "error" in payload && payload.error
                ? payload.error
                : "No se pudo generar el preview.",
            );
            return;
          }

          const typedPreview = payload as PreviewResponse;
          setPreview(typedPreview);
          setMapping(typedPreview.suggestedMapping);
        } catch (error) {
          setPreview(null);
          setMapping({});
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "No se pudo generar el preview.",
          );
        }
      })();
    });
  }

  function handleImport() {
    if (!file || !preview) {
      setErrorMessage("Genera un preview antes de importar.");
      return;
    }

    const fileType = getFileTypeFromName(file.name);

    if (!fileType) {
      setErrorMessage("En este MVP solo se soportan archivos CSV y XLSX.");
      return;
    }

    setErrorMessage(null);
    setIssues([]);
    setResult(null);

    startImportTransition(() => {
      void (async () => {
        try {
          const formData = new FormData();
          formData.set("dataset", dataset);
          formData.set("fileType", fileType);
          formData.set("hasHeader", String(hasHeader));
          formData.set("file", file);
          formData.set("mapping", JSON.stringify(mapping));

          if (companyId.trim().length > 0) {
            formData.set("companyId", companyId);
          }

          if (companyName.trim().length > 0) {
            formData.set("companyName", companyName);
          }

          const response = await fetch("/api/ingestion/import", {
            method: "POST",
            body: formData,
          });
          const payload = (await response.json()) as
            | ImportResponse
            | { error?: string; details?: ImportIssue[] };

          if (!response.ok) {
            setIssues(
              "details" in payload && Array.isArray(payload.details)
                ? payload.details
                : [],
            );
            setErrorMessage(
              "error" in payload && payload.error
                ? payload.error
                : "No se pudieron importar los datos cargados.",
            );
            loadHistory(companyId || undefined);
            return;
          }

          const importResult = payload as ImportResponse;
          setResult(importResult);
          setCompanyId(importResult.companyId);
          loadCompanies();
          loadHistory(importResult.companyId);
        } catch (error) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "No se pudieron importar los datos cargados.",
          );
          loadHistory(companyId || undefined);
        }
      })();
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="rounded-[28px] border border-slate-200 bg-white/90 p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-slate-950 p-3 text-white">
              <UploadCloud className="size-5" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-950">
                Workbench de carga
              </h2>
              <p className="text-sm leading-6 text-slate-600">
                Previsualiza, mapea y persiste datos operativos de RR.HH. en un flujo controlado.
              </p>
            </div>
          </div>

          <form className="mt-6 space-y-5" onSubmit={handlePreviewSubmit}>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">
                Tipo de dataset
              </label>
              <select
                className={selectClassName}
                value={dataset}
                onChange={(event) =>
                  handleDatasetChange(event.target.value as DatasetKey)
                }
              >
                {ingestionDatasets.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </select>
              <p className="text-xs leading-5 text-slate-500">
                {currentDataset.description}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">
                Archivo
              </label>
              <input
                type="file"
                accept=".csv,.xlsx"
                className={inputClassName}
                onChange={(event) =>
                  handleFileChange(event.target.files?.[0] ?? null)
                }
              />
            </div>

            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={hasHeader}
                onChange={(event) => {
                  setHasHeader(event.target.checked);
                  resetFlow();
                }}
              />
              El archivo incluye una fila de encabezados
            </label>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  Empresa existente
                </label>
                <select
                  className={selectClassName}
                  value={companyId}
                  onChange={(event) => setCompanyId(event.target.value)}
                >
                  <option value="">Selecciona una empresa existente</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs leading-5 text-slate-500">
                  {isCompaniesLoading
                    ? "Cargando empresas desde Prisma."
                    : "Usa esto cuando importes sobre una empresa que ya existe."}
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  Nombre de empresa nuevo o de respaldo
                </label>
                <input
                  type="text"
                  className={inputClassName}
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  placeholder="ej. Acme Chile"
                />
                <p className="text-xs leading-5 text-slate-500">
                  {companyNameHelpText}
                </p>
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-950">
                    Comportamiento de persistencia
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    {currentDataset.persistenceNote}
                  </p>
                </div>
                <Badge variant="neutral">{currentDataset.label}</Badge>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={isPreviewPending}>
              {isPreviewPending ? (
                <>
                  <LoaderCircle className="mr-2 size-4 animate-spin" />
                  Construyendo preview
                </>
              ) : (
                "Generar preview"
              )}
            </Button>
          </form>
        </div>

        <div className="space-y-6">
          <div className="rounded-[28px] border border-slate-200 bg-white/90 p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">
                <Database className="size-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-slate-950">
                  Contrato de mapeo
                </h2>
                <p className="text-sm leading-6 text-slate-600">
                  Los campos requeridos vienen del schema del dataset y se validan otra vez en el servidor.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {currentDataset.fields.map((field) => (
                <div
                  key={field.key}
                  className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">
                        {field.label}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {field.description}
                      </p>
                    </div>
                    <Badge variant={field.required ? "critical" : "neutral"}>
                      {field.required ? "Obligatorio" : "Opcional"}
                    </Badge>
                  </div>

                  <select
                    className={`${selectClassName} mt-4`}
                    value={mapping[field.key] ?? ""}
                    onChange={(event) =>
                      setMapping((current) => ({
                        ...current,
                        [field.key]: event.target.value,
                      }))
                    }
                    disabled={!preview}
                  >
                    <option value="">
                      {preview ? "Selecciona una columna origen" : "Genera primero el preview"}
                    </option>
                    {preview?.headers.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>

                  <p className="mt-2 text-xs leading-5 text-slate-400">
                    Ejemplos: {field.sampleHeaders.join(", ")}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-6 space-y-3">
              {missingRequiredFields.length > 0 ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Faltan mapeos obligatorios: {missingRequiredFields.join(", ")}.
                </div>
              ) : preview ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  Los mapeos obligatorios estan completos. La importacion puede correr cuando confirmes la empresa.
                </div>
              ) : null}

              <Button
                type="button"
                className="w-full"
                onClick={handleImport}
                disabled={
                  !preview ||
                  isImportPending ||
                  missingRequiredFields.length > 0
                }
              >
                {isImportPending ? (
                  <>
                    <LoaderCircle className="mr-2 size-4 animate-spin" />
                    Importando datos
                  </>
                ) : (
                  "Importar a Prisma"
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <div>{errorMessage}</div>
          </div>
        </div>
      ) : null}

      {result ? (
        <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-semibold">{result.message}</p>
              <p className="mt-1">
                Filas importadas: {result.importedCount}. Creadas: {result.createdCount}. Actualizadas: {result.updatedCount}.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.94fr)_minmax(0,1.06fr)]">
        <div className="rounded-[28px] border border-slate-200 bg-white/90 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">
                Plantillas listas para carga
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Descarga un CSV base por dataset para mostrar un onboarding guiado y ordenado.
              </p>
            </div>
            <Badge variant="neutral">Templates CSV</Badge>
          </div>

          <div className="mt-6 space-y-3">
            {ingestionDatasets.map((item) => (
              <div
                key={item.key}
                className="flex flex-col gap-4 rounded-[24px] border border-slate-200 bg-slate-50/80 p-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-950">{item.label}</p>
                    {item.key === dataset ? <Badge variant="positive">Dataset activo</Badge> : null}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {item.description}
                  </p>
                </div>

                <a
                  href={`/api/ingestion/template?dataset=${item.key}`}
                  className={buttonVariants({ variant: "secondary", size: "sm" })}
                >
                  Descargar CSV
                </a>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white/90 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">
                Historial reciente de cargas
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Cada importacion queda registrada con archivo, estado, volumen y problemas detectados.
              </p>
            </div>
            <Badge variant="neutral">
              {companyId ? "Filtrado por empresa" : "Todas las empresas"}
            </Badge>
          </div>

          <div className="mt-6 space-y-3">
            {isHistoryLoading ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Cargando historial de ingestas.
              </div>
            ) : historyRuns.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Aun no hay cargas registradas para esta seleccion.
              </div>
            ) : (
              historyRuns.map((run) => (
                <div
                  key={run.id}
                  className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-950">
                          {getDatasetLabel(run.dataset)}
                        </p>
                        <Badge variant={run.status === "success" ? "positive" : "critical"}>
                          {run.status === "success" ? "Exitosa" : "Fallida"}
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {run.fileName} / {run.companyName}
                      </p>
                    </div>

                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                      {formatHistoryTimestamp(run.createdAt)}
                    </p>
                  </div>

                  <dl className="mt-4 grid gap-3 sm:grid-cols-4">
                    <div className="rounded-2xl bg-white px-3 py-3">
                      <dt className="text-xs uppercase tracking-[0.14em] text-slate-500">
                        Filas
                      </dt>
                      <dd className="mt-1 font-semibold text-slate-950">{run.totalRows}</dd>
                    </div>
                    <div className="rounded-2xl bg-white px-3 py-3">
                      <dt className="text-xs uppercase tracking-[0.14em] text-slate-500">
                        Importadas
                      </dt>
                      <dd className="mt-1 font-semibold text-slate-950">
                        {run.importedCount ?? "N/D"}
                      </dd>
                    </div>
                    <div className="rounded-2xl bg-white px-3 py-3">
                      <dt className="text-xs uppercase tracking-[0.14em] text-slate-500">
                        Creadas / actualizadas
                      </dt>
                      <dd className="mt-1 font-semibold text-slate-950">
                        {(run.createdCount ?? 0)} / {(run.updatedCount ?? 0)}
                      </dd>
                    </div>
                    <div className="rounded-2xl bg-white px-3 py-3">
                      <dt className="text-xs uppercase tracking-[0.14em] text-slate-500">
                        Issues
                      </dt>
                      <dd className="mt-1 font-semibold text-slate-950">
                        {run.issueCount}
                      </dd>
                    </div>
                  </dl>

                  {run.errorMessage ? (
                    <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      {run.errorMessage}
                    </div>
                  ) : null}

                  {run.issues.length > 0 ? (
                    <div className="mt-4 space-y-2">
                      {run.issues.map((issue, index) => (
                        <div
                          key={`${run.id}-${issue.rowNumber}-${issue.field}-${index}`}
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700"
                        >
                          Fila {issue.rowNumber} / {issue.field}: {issue.message}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {preview ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="rounded-[28px] border border-slate-200 bg-white/90 p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-950">
                  Filas del preview
                </h2>
                <p className="text-sm leading-6 text-slate-600">
                  {preview.fileName} / {preview.totalRows} filas parseadas
                </p>
              </div>
              <Badge variant="neutral">{preview.dataset}</Badge>
            </div>

            <div className="mt-6 overflow-auto rounded-[24px] border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    {preview.headers.map((header) => (
                      <th key={header} className="px-4 py-3 font-medium">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {preview.previewRows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {preview.headers.map((header) => (
                        <td key={`${rowIndex}-${header}`} className="px-4 py-3 text-slate-600">
                          {row[header] || "-"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-[28px] border border-slate-200 bg-white/90 p-6">
              <h2 className="text-xl font-semibold text-slate-950">
                Feedback del servidor
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                El preview ya expone posibles brechas de mapeo antes de persistir.
              </p>

              <div className="mt-6 space-y-3">
                {preview.missingRequiredFields.length > 0 ? (
                  preview.missingRequiredFields.map((field) => (
                    <div
                      key={field}
                      className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
                    >
                      El mapeo sugerido no pudo resolver el campo obligatorio: {field}
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    El mapeo automatico cubrio todos los campos obligatorios. Revisa los opcionales antes de importar.
                  </div>
                )}
              </div>
            </div>

            {issues.length > 0 ? (
              <div className="rounded-[28px] border border-rose-200 bg-white/90 p-6">
                <h2 className="text-xl font-semibold text-slate-950">
                  Problemas de importacion
                </h2>
                <div className="mt-4 space-y-3">
                  {issues.slice(0, 8).map((issue, index) => (
                    <div
                      key={`${issue.rowNumber}-${issue.field}-${index}`}
                      className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
                    >
                      Fila {issue.rowNumber} / {issue.field}: {issue.message}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
