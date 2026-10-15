"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
    AlertCircle,
    Bot,
    CheckCircle2,
    Download,
    FileSpreadsheet,
    ListChecks,
    Scale,
    Save,
    ShieldCheck,
    Trash2,
    UploadCloud,
} from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { ModuleFlow } from "@/components/ui/ModuleFlow";
import { Eyebrow, DisplayHeading } from "@/components/cc/Eyebrow";
import { interpretRosterExtractResponse } from "@/lib/onboarding/extractResult";
import {
    previewOnboardingRights,
    RIGHTS_SOURCE_PLACEHOLDER,
    RIGHTS_TEMPLATE_HREF,
    RIGHTS_WHY,
    rightsPendingTask,
} from "@/lib/onboarding/unitRightsImport";
import { UnitRightsService } from "@/lib/services/unitRightsService";
import { formatRightsPercent } from "@/lib/assemblies/unitRights";
import type { UnitRightsStatus } from "@/lib/assemblies/types";
import type {
    OnboardingAssessment,
    OnboardingBatchDetailResponse,
    OnboardingSyncResult,
} from "@/lib/types";
import type {
    OnboardingPendingTask,
    OnboardingRightsExtractResponse,
    OnboardingRightsMeta,
    OnboardingRightsOutcome,
    OnboardingRightsRetryResponse,
    OnboardingRightsRow,
    OnboardingRightsStoredRow,
    OnboardingRightsUpsertResponse,
} from "@/lib/onboarding/types";




function friendlyError(message?: string) {
    const text = (message || "").toLowerCase();
    if (text.includes("timeout") || text.includes("504") || text.includes("large") || text.includes("grande")) {
        return "El archivo tardó demasiado en procesarse. Prueba con un PDF más liviano o divide la nómina en partes.";
    }
    if (text.includes("formato no soportado") || text.includes("unsupported")) {
        return "Ese tipo de archivo no es una nómina. Usa PDF, Word, Excel, TXT o CSV.";
    }
    if (text.includes("json") || text.includes("gemini") || text.includes("api")) {
        return "No pudimos leer el archivo con suficiente confianza. Revisa el formato o intenta con una planilla Excel/CSV/TXT.";
    }
    if (text.includes("columnas") || text.includes("nómina") || text.includes("nomina") || text.includes("vacio") || text.includes("vacío")) {
        return message || "No se encontraron columnas de nómina. Revisa el archivo e inténtalo de nuevo.";
    }
    if (text.includes("supabase") || text.includes("database")) {
        return "No pudimos guardar la información en este momento. Revisa tu conexión e intenta nuevamente.";
    }
    return message || "No pudimos completar la operación. Revisa el archivo e intenta nuevamente.";
}

export default function AdminOnboardingPage() {
    const { user } = useAuth();
    const router = useRouter();
    const { toast } = useToast();

    const [isExtracting, setIsExtracting] = useState(false);
    const [extractedData, setExtractedData] = useState<OnboardingRightsRow[] | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncSuccess, setSyncSuccess] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [confirmingSync, setConfirmingSync] = useState(false);
    const [lastFileName, setLastFileName] = useState("");
    const [batchId, setBatchId] = useState("");
    const [failedDocumentCount, setFailedDocumentCount] = useState(0);
    const [syncResult, setSyncResult] = useState<OnboardingSyncResult | null>(null);
    const [syncedPreview, setSyncedPreview] = useState<OnboardingRightsRow[]>([]);
    const [agentAssessment, setAgentAssessment] = useState<OnboardingAssessment | null>(null);
    const [extractError, setExtractError] = useState<string | null>(null);
    const [rightsSourceNote, setRightsSourceNote] = useState("");
    const [rightsMeta, setRightsMeta] = useState<OnboardingRightsMeta | null>(null);
    const [rightsOutcome, setRightsOutcome] = useState<OnboardingRightsOutcome | null>(null);
    const [communityRightsStatus, setCommunityRightsStatus] = useState<UnitRightsStatus | null>(null);
    const activeSectionRef = useRef<HTMLElement | null>(null);
    const batchLoadedRef = useRef(false);


    useEffect(() => {
        if (user && user.role !== "admin") router.push("/home");
    }, [router, user]);

    // Checklist del onboarding: los derechos de cada unidad quedan pendientes mientras falten.
    const refreshRightsStatus = useCallback(() => {
        UnitRightsService.get()
            .then(view => setCommunityRightsStatus(view.status))
            .catch(() => setCommunityRightsStatus(null));
    }, []);

    useEffect(() => {
        if (user?.role === "admin") refreshRightsStatus();
    }, [refreshRightsStatus, user?.role]);

    useEffect(() => {
        if (extractedData || syncSuccess) {
            window.setTimeout(() => {
                activeSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            }, 80);
        }
    }, [extractedData, syncSuccess]);

    useEffect(() => {
        if (!user || user.role !== "admin" || batchLoadedRef.current) return;
        const requestedBatch = new URLSearchParams(window.location.search).get("batch");
        if (!requestedBatch) return;
        batchLoadedRef.current = true;
        setIsExtracting(true);
        fetch(`/api/onboarding/batches/${encodeURIComponent(requestedBatch)}`)
            .then(async response => {
                const payload = await response.json() as Omit<OnboardingBatchDetailResponse, "data"> & { data?: OnboardingRightsStoredRow[] };
                if (!response.ok) throw new Error(payload.error || "batch-load-failed");
                setBatchId(requestedBatch);
                setExtractedData((payload.data || []).map(row => ({ ...row, derechos_porcentaje: row.derechos_porcentaje ?? "" })));
                setLastFileName((payload.documents || []).map(item => item.file_name).filter(Boolean).join(", "));
                setFailedDocumentCount((payload.documents || []).filter(item => item.status === "failed").length);
                const batch = payload.batch || {};
                setAgentAssessment({
                    totalRows: Number(batch.row_count || 0), validRows: Number(batch.valid_row_count || 0),
                    missingNameRows: 0, missingUnitRows: 0, missingContactRows: 0,
                    duplicateUnits: [], confidenceScore: batch.row_count ? Math.round((Number(batch.valid_row_count || 0) / Number(batch.row_count)) * 100) : 0,
                    warnings: Array.isArray(batch.warnings) ? batch.warnings : [],
                });
            })
            .catch(error => toast({ title: "No se pudo abrir el lote", description: friendlyError(error instanceof Error ? error.message : undefined), variant: "destructive" }))
            .finally(() => setIsExtracting(false));
    }, [toast, user]);

    const quality = useMemo(() => {
        const totalRows = extractedData?.length || 0;
        const validRows = extractedData?.filter(row => row.name.trim() && row.unit_id.trim()).length || 0;
        const missingNameRows = extractedData?.filter(row => !row.name.trim()).length || 0;
        const missingUnitRows = extractedData?.filter(row => !row.unit_id.trim()).length || 0;
        const missingContactRows = extractedData?.filter(row => !row.email.trim() && !row.phone.trim()).length || 0;
        const score = totalRows > 0 ? Math.round((validRows / totalRows) * 100) : 0;

        return { totalRows, validRows, missingNameRows, missingUnitRows, missingContactRows, score };
    }, [extractedData]);

    const rightsPreview = useMemo(
        () => extractedData ? previewOnboardingRights(extractedData.filter(row => row.name.trim() && row.unit_id.trim()), rightsSourceNote) : null,
        [extractedData, rightsSourceNote],
    );


    const processFiles = async (uploadedFiles: File[]) => {
        if (!uploadedFiles.length) return;
        setIsExtracting(true);
        setSyncSuccess(false);
        setConfirmingSync(false);
        setSyncResult(null);
        setSyncedPreview([]);
        setExtractError(null);
        setRightsOutcome(null);
        const pendingName = uploadedFiles.map(file => file.name).join(", ");

        try {
            const formData = new FormData();
            uploadedFiles.forEach(file => formData.append("files", file));
            formData.append("source", "admin_onboarding");
            const response = await fetch("/api/onboarding/batches", { method: "POST", body: formData });
            const extraction = await response.json() as OnboardingRightsExtractResponse;
            const interpreted = interpretRosterExtractResponse(extraction, response.ok);
            if (!interpreted.ok) {
                const message = friendlyError(interpreted.message);
                setExtractError(message);
                if (!extractedData) {
                    if (extraction.batchId) setBatchId(extraction.batchId);
                    setFailedDocumentCount((extraction.documents || []).filter(item => item.status === "failed").length);
                    setLastFileName(pendingName);
                }
                toast({
                    title: "No se pudo procesar el archivo",
                    description: message,
                    variant: "destructive",
                });
                return;
            }
            setBatchId(extraction.batchId || "");
            setFailedDocumentCount((extraction.documents || []).filter(item => item.status === "failed").length);
            setLastFileName(pendingName);
            setExtractedData(interpreted.rows);
            setAgentAssessment(extraction.assessment || null);
            setRightsMeta(extraction.rights || null);
            setExtractError(null);
            toast({
                title: "Lote procesado",
                description: `${uploadedFiles.length} documento(s) y ${interpreted.rows.length} registros para revisión.`,
                variant: "success",
            });
        } catch (err: unknown) {
            console.warn("[AdminOnboarding] extract failed:", err);
            const message = friendlyError(err instanceof Error ? err.message : undefined);
            setExtractError(message);
            toast({
                title: "No se pudo procesar el archivo",
                description: message,
                variant: "destructive",
            });
        } finally {
            setIsExtracting(false);
        }
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const uploadedFiles = Array.from(event.target.files || []);
        if (uploadedFiles.length) await processFiles(uploadedFiles);
        event.target.value = "";
    };

    const handleDrop = async (event: React.DragEvent) => {
        event.preventDefault();
        setIsDragging(false);
        if (isExtracting) return;

        const droppedFiles = Array.from(event.dataTransfer.files || []);
        if (droppedFiles.length) await processFiles(droppedFiles);
    };

    const handleFieldChange = (id: string, field: keyof OnboardingRightsRow, value: string) => {
        setExtractedData(prev =>
            prev ? prev.map(row => row.id === id ? { ...row, [field]: value } : row) : null
        );
    };

    const retryFailedDocuments = async () => {
        if (!batchId || isExtracting) return;
        setIsExtracting(true);
        try {
            const response = await fetch(`/api/onboarding/batches/${encodeURIComponent(batchId)}`, {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "retry_failed" }),
            });
            const payload = await response.json() as OnboardingRightsRetryResponse;
            const interpreted = interpretRosterExtractResponse(payload, response.ok);
            setFailedDocumentCount(Number(payload.remaining || 0));
            if (!interpreted.ok) {
                const message = friendlyError(interpreted.message);
                setExtractError(message);
                toast({ title: "No se pudo reintentar", description: message, variant: "destructive" });
                return;
            }
            setExtractedData(interpreted.rows);
            setAgentAssessment(payload.assessment || null);
            setExtractError(null);
            toast({ title: "Reintento completado", description: `${payload.recovered || 0} documento(s) recuperados.`, variant: "success" });
        } catch (error) {
            toast({ title: "No se pudo reintentar", description: friendlyError(error instanceof Error ? error.message : undefined), variant: "destructive" });
        } finally {
            setIsExtracting(false);
        }
    };

    const handleDeleteRow = (id: string) => {
        setExtractedData(prev => prev ? prev.filter(row => row.id !== id) : null);
    };

    const handleSyncToDatabase = async () => {
        if (!extractedData?.length) return;

        if (!confirmingSync) {
            setConfirmingSync(true);
            return;
        }

        const rowsToSync = extractedData.filter(row => row.name.trim() && row.unit_id.trim());
        if (!rowsToSync.length) return;

        setConfirmingSync(false);
        setIsSyncing(true);
        try {
            const res = await fetch("/api/onboarding/upsert", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ residents: rowsToSync, batchId: batchId || undefined, rightsSourceNote }),
            });

            if (res.ok) {
                const result = await res.json().catch(() => ({})) as OnboardingRightsUpsertResponse;
                const success = typeof result.success === "number" ? result.success : rowsToSync.length;
                const errors = typeof result.errors === "number" ? result.errors : 0;
                const unitOnly = typeof result.unitOnly === "number" ? result.unitOnly : 0;
                setSyncedPreview(rowsToSync);
                setSyncResult({
                    fileName: lastFileName || "archivo importado",
                    rows: rowsToSync.length,
                    success,
                    errors,
                    unitOnly,
                });
                setRightsOutcome(result.rights || null);
                refreshRightsStatus();
                setSyncSuccess(true);
                setExtractedData(null);
                toast({ title: "Residentes sincronizados", description: `${success} fila(s) quedaron disponibles para operación.`, variant: "success" });
                return;
            }

            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || "upsert-failed");
        } catch (error: unknown) {
            console.warn("[AdminOnboarding] sync failed:", error);
            toast({
                title: "No se pudo sincronizar",
                description: friendlyError(error instanceof Error ? error.message : undefined),
                variant: "destructive",
            });
        } finally {
            setIsSyncing(false);
        }
    };

    const resetImport = () => {
        setSyncSuccess(false);
        setExtractedData(null);
        setConfirmingSync(false);
        setSyncResult(null);
        setSyncedPreview([]);
        setAgentAssessment(null);
        setLastFileName("");
        setBatchId("");
        setFailedDocumentCount(0);
        setExtractError(null);
        setRightsMeta(null);
        setRightsOutcome(null);
        setRightsSourceNote("");
    };

    const restoreSyncedRows = () => {
        if (!syncedPreview.length) return;
        setExtractedData(syncedPreview);
        setSyncSuccess(false);
        setConfirmingSync(false);
    };

    if (user && user.role !== "admin") return null;

    return (
        <div className="mx-auto max-w-7xl space-y-7 px-4 py-6 sm:px-6 sm:py-8">
            <header className="flex flex-col gap-5 border-b pb-6 lg:flex-row lg:items-end lg:justify-between" style={{ borderColor: "var(--cc-line)" }}>
                <div>
                    <Eyebrow>Activación inteligente</Eyebrow>
                    <DisplayHeading size={32} className="mt-2 flex items-center gap-3">
                        <Bot className="h-7 w-7" style={{ color: "var(--cc-copper)" }} />
                        CoCo prepara tu edificio
                    </DisplayHeading>
                    <p className="mt-3 max-w-3xl text-sm leading-6 font-medium cc-text-secondary">
                        Sube nominas antiguas, revisa la extraccion y sincroniza residentes con sus unidades solo cuando el lote este claro. Este es el primer paso para dejar pagos, comunicaciones y CoCo listos.
                    </p>
                </div>
                <div className="rounded-2xl border p-4 text-sm" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    <p className="font-semibold cc-text-primary">Flujo de activacion</p>
                    <div className="mt-3 grid gap-2">
                        {["Subir archivo", "CoCo revisa", "Aprobar y sincronizar"].map((step, index) => (
                            <div key={step} className="flex items-center gap-2 cc-text-secondary">
                                <span className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold" style={{ background: "var(--cc-copper-tint)", color: "var(--cc-copper)" }}>{index + 1}</span>
                                {step}
                            </div>
                        ))}
                    </div>
                </div>
            </header>

            <section className="grid gap-4 md:grid-cols-3">
                {[
                    { title: "Extraccion asistida", description: "Lee nominas antiguas y las convierte en filas editables.", icon: <FileSpreadsheet className="h-4 w-4" /> },
                    { title: "Control de brechas", description: "Detecta contactos faltantes, unidades repetidas y filas criticas.", icon: <ListChecks className="h-4 w-4" /> },
                    { title: "Carga con aprobacion", description: "Sincroniza solo despues de revisar y confirmar la nomina.", icon: <ShieldCheck className="h-4 w-4" /> },
                ].map(item => (
                    <article key={item.title} className="rounded-2xl border p-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                        <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-full" style={{ background: "var(--cc-paper-warm)", color: "var(--cc-copper)" }}>
                            {item.icon}
                        </div>
                        <h2 className="font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>{item.title}</h2>
                        <p className="mt-2 text-sm leading-6 cc-text-secondary">{item.description}</p>
                    </article>
                ))}
            </section>

            <ModuleFlow
                title="De archivo sucio a comunidad operativa"
                description="La administracion sube un archivo, CoCo propone la estructura, marca brechas y deja al admin aprobar antes de guardar datos reales."
                steps={[
                    "Subir archivo",
                    "CoCo interpreta",
                    "Confirmar calidad",
                    "Sincronizar residentes",
                ]}
                outcome="Cierre esperado: unidades y residentes listos para invitaciones, gastos comunes y acciones de CoCo."
                currentStep={extractedData ? 2 : syncSuccess ? 4 : 1}
                completedSteps={syncSuccess ? 4 : extractedData ? 1 : 0}
                statusLabel={syncSuccess ? "Sincronizado" : extractedData ? "En revisión" : "Listo para carga"}
                primaryActionLabel={extractedData ? "Revisar filas" : "Subir nómina"}
                primaryActionHref={extractedData ? "#revision-nomina" : "#subir-nomina"}
                secondaryActionLabel="Ver unidades"
                secondaryActionHref="/admin/units"
            />

            {communityRightsStatus === "missing" && !extractedData && !syncSuccess && (
                <section aria-label="Pendientes del onboarding" className="rounded-2xl border p-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    <p className="text-xs font-bold uppercase tracking-[0.12em] cc-text-secondary">Pendientes del onboarding</p>
                    <PendingTaskCard task={rightsPendingTask("missing")} />
                </section>
            )}

            {extractError && (
                <div
                    role="alert"
                    className="flex items-start gap-3 rounded-2xl border p-4"
                    style={{ borderColor: "var(--cc-rose)", background: "var(--cc-rose-tint, #fdecec)" }}
                >
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "var(--cc-rose)" }} />
                    <div className="min-w-0">
                        <p className="text-sm font-semibold cc-text-primary">No se pudo extraer la nómina</p>
                        <p className="mt-1 text-sm cc-text-secondary">{extractError}</p>
                        {lastFileName && (
                            <p className="mt-1 text-xs cc-text-tertiary">Archivo: {lastFileName}</p>
                        )}
                    </div>
                </div>
            )}

            {!extractedData && !syncSuccess && (
                <section
                    id="subir-nomina"
                    onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
                    onDragLeave={(event) => { event.preventDefault(); setIsDragging(false); }}
                    onDrop={handleDrop}
                    className="rounded-2xl border p-8 text-center transition-colors lg:p-12"
                    style={isDragging
                        ? { borderColor: "var(--cc-copper)", background: "var(--cc-copper-tint)" }
                        : { borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}
                >
                    <div className="mx-auto flex max-w-2xl flex-col items-center">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full border" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)", color: "var(--cc-copper)" }}>
                            {isExtracting ? <FileSpreadsheet className="h-8 w-8 animate-pulse" /> : <UploadCloud className="h-8 w-8" />}
                        </div>
                        <h2 className="mt-6 text-2xl font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>
                            {isExtracting ? "Procesando documentos" : "Sube nóminas de residentes"}
                        </h2>
                        <p className="mt-3 text-sm leading-6 font-medium cc-text-secondary">
                            {isExtracting
                                ? "Estamos guardando y extrayendo nombres, unidades, correos y teléfonos. Mantén esta ventana abierta."
                                : "Carga hasta 20 PDF, Word, Excel, TXT o CSV por lote. Los originales quedan privados y las filas se deduplican antes de revisar."}
                        </p>

                        {!isExtracting && (
                            <p className="mt-4 max-w-xl text-xs leading-5 cc-text-secondary">
                                <Scale className="mr-1 inline h-3.5 w-3.5" style={{ color: "var(--cc-copper)" }} />
                                Opcional: agrega la columna <span className="font-mono">derechos_porcentaje</span> con los derechos de cada unidad en % (por ejemplo, 0,532; deben sumar 100 %). Si los tienes en ‰, usa <span className="font-mono">derechos_permil</span> y los pasamos a %. {RIGHTS_WHY}
                            </p>
                        )}

                        {!isExtracting && (
                            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                                <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-white transition-colors" style={{ background: "var(--cc-copper)" }}>
                                    <UploadCloud className="h-4 w-4" />
                                    Seleccionar documentos
                                    <input
                                        type="file"
                                        multiple
                                        accept=".pdf,.docx,.doc,.xls,.xlsx,.txt,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                                        aria-label="Seleccionar nómina en PDF, Word, Excel XLS/XLSX, TXT o CSV"
                                        onChange={handleFileUpload}
                                        disabled={isExtracting}
                                        className="hidden"
                                    />
                                </label>
                                <a
                                    href={RIGHTS_TEMPLATE_HREF}
                                    download
                                    className="inline-flex items-center justify-center gap-2 rounded-full border px-5 py-3 text-sm font-semibold cc-text-primary transition-colors hover:bg-[var(--cc-paper-warm)]"
                                    style={{ borderColor: "var(--cc-line)" }}
                                >
                                    <Download className="h-4 w-4" />
                                    Descargar plantilla CSV
                                </a>
                            </div>
                        )}
                    </div>
                </section>
            )}

            {syncSuccess && (
                <motion.section
                    ref={activeSectionRef}
                    initial={{ scale: 0.98, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="rounded-2xl border border-success-border bg-success-bg p-8 text-center"
                >
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full text-white" style={{ background: "var(--cc-sage)" }}>
                        <CheckCircle2 className="h-8 w-8" />
                    </div>
                    <h2 className="mt-5 text-2xl font-semibold text-success-fg" style={{ fontFamily: "var(--cc-font-display)" }}>
                        Nómina sincronizada
                    </h2>
                    <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 font-medium text-success-fg">
                        Los residentes quedaron guardados y preparados para invitación, asignación de unidades y operación diaria.
                    </p>

                    <div className="mx-auto mt-6 grid max-w-4xl gap-3 text-left sm:grid-cols-2 md:grid-cols-4">
                        {[
                            { label: "Archivo", value: syncResult?.fileName || "Sin nombre" },
                            { label: "Perfiles activos", value: `${syncResult?.success ?? 0}/${syncResult?.rows ?? 0}` },
                            { label: "Pendientes invitacion", value: `${syncResult?.unitOnly ?? 0}` },
                            { label: "Con errores", value: `${syncResult?.errors ?? 0}` },
                        ].map(item => (
                            <div key={item.label} className="rounded-xl border p-4" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                                <p className="text-[11px] font-bold uppercase tracking-[0.12em] cc-text-secondary">{item.label}</p>
                                <p className="mt-2 break-words text-sm font-semibold cc-text-primary">{item.value}</p>
                            </div>
                        ))}
                    </div>

                    {syncedPreview.length > 0 && (
                        <div className="mx-auto mt-5 max-w-4xl overflow-hidden rounded-2xl border text-left" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                            <div className="border-b px-4 py-3" style={{ borderColor: "var(--cc-line)" }}>
                                <p className="text-sm font-semibold cc-text-primary">
                                    Resumen de filas sincronizadas
                                </p>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[620px] text-sm">
                                    <thead className="text-xs font-bold uppercase tracking-[0.08em] cc-text-secondary" style={{ background: "var(--cc-paper-warm)" }}>
                                        <tr>
                                            <th className="px-4 py-3 text-left">Nombre</th>
                                            <th className="px-4 py-3 text-left">Unidad</th>
                                            <th className="px-4 py-3 text-left">Contacto</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--cc-line)]">
                                        {syncedPreview.slice(0, 5).map(row => (
                                            <tr key={row.id}>
                                                <td className="px-4 py-3 font-semibold cc-text-primary">{row.name}</td>
                                                <td className="px-4 py-3 font-mono cc-text-secondary">{row.unit_id}</td>
                                                <td className="px-4 py-3 cc-text-secondary">{row.email || row.phone || "Sin contacto"}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {syncedPreview.length > 5 && (
                                <p className="border-t px-4 py-3 text-xs cc-text-secondary" style={{ borderColor: "var(--cc-line)" }}>
                                    +{syncedPreview.length - 5} fila(s) adicionales en el lote.
                                </p>
                            )}
                        </div>
                    )}

                    {rightsOutcome && <RightsOutcomeNotice outcome={rightsOutcome} />}

                    <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                        <Button type="button" variant="outline" onClick={restoreSyncedRows} disabled={!syncedPreview.length}>
                            Volver a revisar filas
                        </Button>
                        <Button type="button" variant="outline" onClick={() => router.push("/directorio")}>
                            Ver Directorio
                        </Button>
                        <Button type="button" variant="outline" onClick={() => router.push("/admin/units")}>
                            Ver Unidades
                        </Button>
                        <Button type="button" onClick={resetImport}>
                            Cargar otro archivo
                        </Button>
                    </div>
                </motion.section>
            )}

            <AnimatePresence>
                {extractedData && (
                    <motion.section
                        ref={activeSectionRef}
                        id="revision-nomina"
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}
                    >
                        <div className="flex flex-col gap-4 border-b p-5 text-white lg:flex-row lg:items-center lg:justify-between" style={{ borderColor: "var(--cc-line)", background: "var(--cc-ink)" }}>
                            <div>
                                <h2 className="flex items-center gap-2 text-lg font-semibold" style={{ fontFamily: "var(--cc-font-display)" }}>
                                    <FileSpreadsheet className="h-5 w-5" style={{ color: "var(--cc-copper-tint)" }} />
                                    Revision antes de sincronizar
                                </h2>
                                <p className="mt-1 text-sm" style={{ color: "var(--cc-ink-muted)" }}>
                                    {quality.validRows} de {quality.totalRows} filas tienen nombre y unidad. Corrige o elimina registros dudosos antes de guardar.
                                </p>
                                {lastFileName && (
                                    <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--cc-ink-tertiary)" }}>
                                        Archivo: {lastFileName}
                                    </p>
                                )}
                            </div>
                            <div className="flex flex-col gap-2 sm:flex-row">
                                {failedDocumentCount > 0 && (
                                    <Button type="button" variant="secondary" onClick={retryFailedDocuments} disabled={isExtracting}>
                                        Reintentar {failedDocumentCount} documento(s)
                                    </Button>
                                )}
                                <Button type="button" variant="secondary" onClick={() => setExtractedData(null)}>
                                    Cancelar
                                </Button>
                                <button
                                    onClick={handleSyncToDatabase}
                                    disabled={isSyncing || quality.validRows === 0}
                                    aria-label={confirmingSync ? "Confirmar sincronizacion" : "Sincronizar nomina"}
                                    className="inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                                    style={{ background: confirmingSync ? "var(--cc-rose)" : "var(--cc-sage)" }}
                                >
                                    {isSyncing ? (
                                        "Sincronizando..."
                                    ) : confirmingSync ? (
                                        <>
                                            <AlertCircle className="h-4 w-4" />
                                            Confirmar sincronización
                                        </>
                                    ) : (
                                        <>
                                            <Save className="h-4 w-4" />
                                            Sincronizar nómina
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>

                        <div className="grid gap-3 border-b p-5 sm:grid-cols-2 md:grid-cols-4" style={{ borderColor: "var(--cc-line)" }}>
                            {[
                                { label: "Calidad", value: `${quality.score}%`, tone: quality.score >= 80 ? "text-success-fg" : "text-warning-fg" },
                                { label: "Filas válidas", value: `${quality.validRows}/${quality.totalRows}`, tone: "cc-text-primary" },
                                { label: "Sin nombre", value: quality.missingNameRows, tone: quality.missingNameRows ? "text-warning-fg" : "text-success-fg" },
                                { label: "Sin contacto", value: quality.missingContactRows, tone: quality.missingContactRows ? "text-warning-fg" : "text-success-fg" },
                            ].map(item => (
                                <div key={item.label} className="rounded-xl border p-4" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}>
                                    <p className={`text-2xl font-semibold ${item.tone}`} style={{ fontFamily: "var(--cc-font-display)" }}>{item.value}</p>
                                    <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] cc-text-secondary">{item.label}</p>
                                </div>
                            ))}
                            {agentAssessment && (
                                <div className="rounded-xl border p-4 sm:col-span-2 md:col-span-4" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                        <div>
                                            <p className="text-sm font-semibold cc-text-primary">
                                                Revision del agente: {agentAssessment.confidenceScore}% de confianza
                                            </p>
                                            <p className="mt-1 text-xs cc-text-secondary">
                                                El puntaje combina filas validas, cobertura de contacto y unidades repetidas.
                                            </p>
                                        </div>
                                        {agentAssessment.duplicateUnits.length > 0 && (
                                            <p className="rounded-full bg-warning-bg px-3 py-2 text-xs font-semibold text-warning-fg">
                                                Duplicadas: {agentAssessment.duplicateUnits.slice(0, 6).join(", ")}
                                            </p>
                                        )}
                                    </div>
                                    {agentAssessment.warnings.length > 0 && (
                                        <ul className="mt-3 grid gap-2 text-sm cc-text-secondary md:grid-cols-2">
                                            {agentAssessment.warnings.map(warning => (
                                                <li key={warning} className="flex items-start gap-2">
                                                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning-fg" />
                                                    <span>{warning}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}
                            {rightsPreview && (
                                <RightsPreviewPanel
                                    preview={rightsPreview}
                                    meta={rightsMeta}
                                    sourceNote={rightsSourceNote}
                                    onSourceNoteChange={setRightsSourceNote}
                                />
                            )}
                            {quality.missingUnitRows > 0 && (
                                <div className="rounded-xl border border-warning-border bg-warning-bg p-4 sm:col-span-2 md:col-span-4">
                                    <div className="flex items-start gap-3">
                                        <AlertCircle className="mt-0.5 h-5 w-5 text-warning-fg" />
                                        <p className="text-sm font-semibold cc-text-primary">
                                            Hay {quality.missingUnitRows} fila(s) sin unidad. Corrígelas antes de sincronizar para evitar residentes sin asignación.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[1000px] text-left text-sm">
                                <thead className="border-b text-xs font-semibold uppercase tracking-[0.08em] cc-text-secondary" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}>
                                    <tr>
                                        <th className="px-5 py-4">Nombre</th>
                                        <th className="px-5 py-4">Unidad</th>
                                        <th className="px-5 py-4">Correo</th>
                                        <th className="px-5 py-4">Teléfono</th>
                                        <th className="px-5 py-4" title="Derechos de la unidad según el reglamento, en % (deben sumar 100 %). Opcional.">Derechos (%)</th>
                                        <th className="px-5 py-4 text-right">Acción</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--cc-line)]">
                                    {extractedData.map((row) => (
                                        <tr key={row.id} className="transition-colors hover:bg-[var(--cc-paper-warm)]">
                                            <td className="px-4 py-3">
                                                <EditableCell value={row.name} onChange={value => handleFieldChange(row.id, "name", value)} placeholder="Nombre residente" required />
                                            </td>
                                            <td className="px-4 py-3">
                                                <EditableCell value={row.unit_id} onChange={value => handleFieldChange(row.id, "unit_id", value)} placeholder="1204" required mono />
                                            </td>
                                            <td className="px-4 py-3">
                                                <EditableCell value={row.email} onChange={value => handleFieldChange(row.id, "email", value)} placeholder="correo@dominio.cl" />
                                            </td>
                                            <td className="px-4 py-3">
                                                <EditableCell value={row.phone} onChange={value => handleFieldChange(row.id, "phone", value)} placeholder="+56 9..." />
                                            </td>
                                            <td className="px-4 py-3">
                                                <EditableCell value={row.derechos_porcentaje} onChange={value => handleFieldChange(row.id, "derechos_porcentaje", value)} placeholder="0,532" mono />
                                            </td>
                                            <td className="px-5 py-3 text-right">
                                                <button
                                                    onClick={() => handleDeleteRow(row.id)}
                                                    className="inline-flex rounded-full p-2 text-[var(--cc-ink-faint)] transition-colors hover:bg-[var(--cc-rose-tint)] hover:text-[var(--cc-rose)]"
                                                    title="Ignorar esta fila"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </motion.section>
                )}
            </AnimatePresence>
        </div>
    );
}

function EditableCell({
    value,
    onChange,
    placeholder,
    required = false,
    mono = false,
}: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    required?: boolean;
    mono?: boolean;
}) {
    return (
        <input
            value={value}
            onChange={event => onChange(event.target.value)}
            placeholder={placeholder}
            className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--cc-copper)] focus:ring-2 focus:ring-[var(--cc-copper)]/15 ${mono ? "font-mono" : "font-sans"}`}
            style={{
                background: "var(--cc-paper-warm)",
                borderColor: required && !value.trim() ? "var(--cc-amber)" : "var(--cc-line)",
                color: "var(--cc-ink)",
            }}
        />
    );
}

function PendingTaskCard({ task }: { task: OnboardingPendingTask }) {
    return (
        <div className="mt-3 flex flex-col gap-3 rounded-xl border border-warning-border bg-warning-bg p-4 text-left sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
                <ListChecks className="mt-0.5 h-5 w-5 shrink-0 text-warning-fg" />
                <div>
                    <p className="text-sm font-semibold cc-text-primary">{task.title}</p>
                    <p className="mt-1 text-xs leading-5 cc-text-secondary">{task.detail}</p>
                </div>
            </div>
            <Link
                href={task.href}
                className="inline-flex shrink-0 items-center justify-center rounded-full px-4 py-2 text-sm font-semibold text-white"
                style={{ background: "var(--cc-copper)" }}
            >
                Cargar derechos
            </Link>
        </div>
    );
}


function RightsPreviewPanel({
    preview,
    meta,
    sourceNote,
    onSourceNoteChange,
}: {
    preview: ReturnType<typeof previewOnboardingRights>;
    meta: OnboardingRightsMeta | null;
    sourceNote: string;
    onSourceNoteChange: (value: string) => void;
}) {
    return (
        <div className="rounded-xl border p-4 sm:col-span-2 md:col-span-4" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
            <div className="flex items-start gap-3">
                <Scale className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "var(--cc-copper)" }} />
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold cc-text-primary">Derechos de cada unidad (%)</p>
                    <p className="mt-1 text-xs cc-text-secondary">{RIGHTS_WHY}</p>
                    {meta && preview.status !== "none" && (
                        <p className="mt-2 text-xs cc-text-secondary">
                            Columna leída: <span className="font-mono">{meta.header}</span>
                            {meta.scale === "percent" ? " · en %" : " · venía en ‰, la pasamos a % (÷ 10)"}
                            {meta.scaleInferred ? " (deducido de los valores: revísalo)" : ""}.
                        </p>
                    )}
                    {preview.status === "complete" && (
                        <p className="mt-2 text-sm font-semibold text-success-fg">
                            Las {preview.units} unidades tienen derechos y suman {formatRightsPercent(preview.total)}. Se guardarán {preview.willBeVerified ? "como verificados (con fuente)" : "como provisorios hasta que registres la fuente"}.
                        </p>
                    )}
                    {preview.status === "partial" && (
                        <div className="mt-2 rounded-lg border border-warning-border bg-warning-bg p-3">
                            <p className="text-sm font-semibold cc-text-primary">
                                Los derechos vienen en {preview.unitsWithValue} de {preview.units} unidades o no cuadran: no se guardarán. Puedes sincronizar igual; las unidades se crean sin derechos y queda la tarea pendiente.
                            </p>
                            <ul className="mt-2 space-y-1 text-xs cc-text-secondary">
                                {preview.errors.map(error => <li key={error}>• {error}</li>)}
                            </ul>
                        </div>
                    )}
                    {preview.status === "none" && (
                        <p className="mt-2 text-xs cc-text-secondary">
                            El archivo no trae derechos. Puedes escribirlos en %, en la columna &quot;Derechos (%)&quot;, o cargarlos después: quedará la tarea pendiente &quot;Cargar derechos de cada unidad&quot;.
                        </p>
                    )}
                    {preview.status !== "none" && (
                        <label className="mt-3 block text-xs font-semibold cc-text-secondary">
                            Fuente de los derechos (opcional)
                            <input
                                value={sourceNote}
                                onChange={event => onSourceNoteChange(event.target.value)}
                                placeholder={RIGHTS_SOURCE_PLACEHOLDER}
                                maxLength={500}
                                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal outline-none focus:border-[var(--cc-copper)]"
                                style={{ background: "var(--cc-paper-warm)", borderColor: "var(--cc-line)", color: "var(--cc-ink)" }}
                            />
                            <span className="mt-1 block font-normal cc-text-tertiary">Con fuente quedan verificados; sin fuente, provisorios.</span>
                        </label>
                    )}
                    {preview.task && <PendingTaskCard task={preview.task} />}
                </div>
            </div>
        </div>
    );
}

function RightsOutcomeNotice({ outcome }: { outcome: OnboardingRightsOutcome }) {
    if (outcome.status === "already_loaded") return null;
    return (
        <div className="mx-auto mt-5 max-w-4xl text-left">
            {outcome.status === "saved" && (
                <div className="rounded-xl border p-4" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    <p className="text-sm font-semibold cc-text-primary">
                        Derechos de cada unidad guardados {outcome.verified ? "y verificados con su fuente" : "como provisorios: registra la fuente en Asambleas › Derechos de cada unidad"}.
                    </p>
                </div>
            )}
            {outcome.status === "skipped" && outcome.errors.length > 0 && (
                <p className="text-xs cc-text-secondary">Derechos no guardados: {outcome.errors.join(" ")}</p>
            )}
            {outcome.task && <PendingTaskCard task={outcome.task} />}
        </div>
    );
}
