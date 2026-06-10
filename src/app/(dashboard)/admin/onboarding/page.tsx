"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
    AlertCircle,
    Bot,
    CheckCircle2,
    FileSpreadsheet,
    ListChecks,
    Save,
    ShieldCheck,
    Trash2,
    UploadCloud,
} from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { ModuleFlow } from "@/components/ui/ModuleFlow";

interface ExtractedUser {
    id: string;
    name: string;
    unit_id: string;
    email: string;
    phone: string;
}

interface SyncResult {
    fileName: string;
    rows: number;
    success: number;
    errors: number;
    unitOnly: number;
}

interface OnboardingAssessment {
    totalRows: number;
    validRows: number;
    missingNameRows: number;
    missingUnitRows: number;
    missingContactRows: number;
    duplicateUnits: string[];
    confidenceScore: number;
    warnings: string[];
}




function friendlyError(message?: string) {
    const text = (message || "").toLowerCase();
    if (text.includes("timeout") || text.includes("504") || text.includes("large") || text.includes("grande")) {
        return "El archivo tardó demasiado en procesarse. Prueba con un PDF más liviano o divide la nómina en partes.";
    }
    if (text.includes("json") || text.includes("gemini") || text.includes("api")) {
        return "No pudimos leer el archivo con suficiente confianza. Revisa el formato o intenta con una planilla Excel/CSV/TXT.";
    }
    if (text.includes("supabase") || text.includes("database")) {
        return "No pudimos guardar la información en este momento. Revisa tu conexión e intenta nuevamente.";
    }
    return "No pudimos completar la operación. Revisa el archivo e intenta nuevamente.";
}

export default function AdminOnboardingPage() {
    const { user } = useAuth();
    const router = useRouter();
    const { toast } = useToast();

    const [isExtracting, setIsExtracting] = useState(false);
    const [extractedData, setExtractedData] = useState<ExtractedUser[] | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncSuccess, setSyncSuccess] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [confirmingSync, setConfirmingSync] = useState(false);
    const [lastFileName, setLastFileName] = useState("");
    const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
    const [syncedPreview, setSyncedPreview] = useState<ExtractedUser[]>([]);
    const [agentAssessment, setAgentAssessment] = useState<OnboardingAssessment | null>(null);
    const activeSectionRef = useRef<HTMLElement | null>(null);


    useEffect(() => {
        if (user && user.role !== "admin") router.push("/home");
    }, [router, user]);

    useEffect(() => {
        if (extractedData || syncSuccess) {
            window.setTimeout(() => {
                activeSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            }, 80);
        }
    }, [extractedData, syncSuccess]);

    const quality = useMemo(() => {
        const totalRows = extractedData?.length || 0;
        const validRows = extractedData?.filter(row => row.name.trim() && row.unit_id.trim()).length || 0;
        const missingNameRows = extractedData?.filter(row => !row.name.trim()).length || 0;
        const missingUnitRows = extractedData?.filter(row => !row.unit_id.trim()).length || 0;
        const missingContactRows = extractedData?.filter(row => !row.email.trim() && !row.phone.trim()).length || 0;
        const score = totalRows > 0 ? Math.round((validRows / totalRows) * 100) : 0;

        return { totalRows, validRows, missingNameRows, missingUnitRows, missingContactRows, score };
    }, [extractedData]);


    const extractFileWithApi = async (uploadedFile: File) => {
        const formData = new FormData();
        formData.append("file", uploadedFile);
        const res = await fetch("/api/onboarding/extract", {
            method: "POST",
            body: formData,
        });

        const textResponse = await res.text();
        let result: { data?: Partial<ExtractedUser>[]; assessment?: OnboardingAssessment; error?: string } | null = null;
        try {
            result = JSON.parse(textResponse);
        } catch {
            throw new Error("non-json-response");
        }

        if (!res.ok || !result?.data) {
            throw new Error(result?.error || "extract-failed");
        }

        return {
            rows: result.data.map((row, index) => ({
                id: `temp-${index}`,
                name: row.name || "",
                unit_id: row.unit_id || "",
                email: row.email || "",
                phone: row.phone || "",
            })),
            assessment: result.assessment || null,
        };
    };

    const processFile = async (uploadedFile: File) => {
        setIsExtracting(true);
        setExtractedData(null);
        setSyncSuccess(false);
        setConfirmingSync(false);
        setSyncResult(null);
        setSyncedPreview([]);
        setAgentAssessment(null);
        setLastFileName(uploadedFile.name);

        try {
            const extraction = await extractFileWithApi(uploadedFile);
            setExtractedData(extraction.rows);
            setAgentAssessment(extraction.assessment);
            toast({
                title: "Archivo procesado",
                description: `Detectamos ${extraction.rows.length} registros para revision.`,
                variant: "success",
            });
        } catch (err: unknown) {
            console.warn("[AdminOnboarding] extract failed:", err);
            toast({
                title: "No se pudo procesar el archivo",
                description: friendlyError(err instanceof Error ? err.message : undefined),
                variant: "destructive",
            });
        } finally {
            setIsExtracting(false);
        }
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const uploadedFile = event.target.files?.[0];
        if (uploadedFile) await processFile(uploadedFile);
        event.target.value = "";
    };

    const handleDrop = async (event: React.DragEvent) => {
        event.preventDefault();
        setIsDragging(false);
        if (isExtracting) return;

        const droppedFile = event.dataTransfer.files?.[0];
        if (droppedFile) await processFile(droppedFile);
    };

    const handleFieldChange = (id: string, field: keyof ExtractedUser, value: string) => {
        setExtractedData(prev =>
            prev ? prev.map(row => row.id === id ? { ...row, [field]: value } : row) : null
        );
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
                body: JSON.stringify({ residents: rowsToSync }),
            });

            if (res.ok) {
                const result = await res.json().catch(() => ({}));
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
    };

    const restoreSyncedRows = () => {
        if (!syncedPreview.length) return;
        setExtractedData(syncedPreview);
        setSyncSuccess(false);
        setConfirmingSync(false);
    };

    if (user && user.role !== "admin") return null;

    return (
        <div className="mx-auto max-w-7xl space-y-7 px-4 py-8 sm:px-6">
            <header className="flex flex-col gap-5 border-b border-subtle pb-6 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-600">Activacion Inteligente</p>
                    <h1 className="mt-2 flex items-center gap-3 text-3xl font-semibold cc-text-primary">
                        <Bot className="h-8 w-8 text-brand-600" />
                        CoCo prepara tu edificio
                    </h1>
                    <p className="mt-3 max-w-3xl text-sm leading-6 cc-text-secondary">
                        Sube nominas antiguas, revisa la extraccion y sincroniza residentes con sus unidades solo cuando el lote este claro. Este es el primer paso para dejar pagos, comunicaciones y CoCo listos.
                    </p>
                </div>
                <div className="rounded-lg border border-subtle bg-surface p-4 text-sm shadow-sm">
                    <p className="font-semibold cc-text-primary">Flujo de activacion</p>
                    <div className="mt-3 grid gap-2">
                        {["Subir archivo", "CoCo revisa", "Aprobar y sincronizar"].map((step, index) => (
                            <div key={step} className="flex items-center gap-2 cc-text-secondary">
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-elevated text-[11px] font-bold">{index + 1}</span>
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
                    <article key={item.title} className="rounded-lg border border-subtle bg-surface p-5 shadow-sm">
                        <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-elevated cc-text-secondary">
                            {item.icon}
                        </div>
                        <h2 className="font-semibold cc-text-primary">{item.title}</h2>
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

            {!extractedData && !syncSuccess && (
                <section
                    id="subir-nomina"
                    onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
                    onDragLeave={(event) => { event.preventDefault(); setIsDragging(false); }}
                    onDrop={handleDrop}
                    className={`rounded-lg border bg-surface p-8 text-center shadow-sm transition-colors lg:p-12 ${isDragging ? "border-brand-500 bg-brand-50" : "border-subtle"}`}
                >
                    <div className="mx-auto flex max-w-2xl flex-col items-center">
                        <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-subtle bg-canvas text-brand-600">
                            {isExtracting ? <FileSpreadsheet className="h-8 w-8 animate-pulse" /> : <UploadCloud className="h-8 w-8" />}
                        </div>
                        <h2 className="mt-6 text-2xl font-semibold cc-text-primary">
                            {isExtracting ? "Procesando archivo" : "Sube una nómina de residentes"}
                        </h2>
                        <p className="mt-3 text-sm leading-6 cc-text-secondary">
                            {isExtracting
                                ? "Estamos extrayendo nombres, unidades, correos y teléfonos. Mantén esta ventana abierta."
                                : "Acepta PDF, Word, Excel .xls/.xlsx, TXT o CSV. Para mejores resultados usa columnas simples: nombre, unidad, correo y teléfono."}
                        </p>

                        {!isExtracting && (
                            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                                <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-brand-500 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-600">
                                    <UploadCloud className="h-4 w-4" />
                                    Seleccionar archivo
                                    <input
                                        type="file"
                                        accept=".pdf,.docx,.doc,.xls,.xlsx,.txt,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                                        aria-label="Seleccionar nómina en PDF, Word, Excel XLS/XLSX, TXT o CSV"
                                        onChange={handleFileUpload}
                                        disabled={isExtracting}
                                        className="hidden"
                                    />
                                </label>
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
                    className="rounded-lg border border-success-border bg-success-bg p-8 shadow-sm"
                >
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-lg bg-emerald-600 text-white">
                        <CheckCircle2 className="h-8 w-8" />
                    </div>
                    <h2 className="mt-5 text-2xl font-semibold text-success-fg">
                        Nómina sincronizada
                    </h2>
                    <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-emerald-800">
                        Los residentes quedaron guardados y preparados para invitación, asignación de unidades y operación diaria.
                    </p>

                    <div className="mx-auto mt-6 grid max-w-4xl gap-3 text-left md:grid-cols-4">
                        {[
                            { label: "Archivo", value: syncResult?.fileName || "Sin nombre" },
                            { label: "Perfiles activos", value: `${syncResult?.success ?? 0}/${syncResult?.rows ?? 0}` },
                            { label: "Pendientes invitacion", value: `${syncResult?.unitOnly ?? 0}` },
                            { label: "Con errores", value: `${syncResult?.errors ?? 0}` },
                        ].map(item => (
                            <div key={item.label} className="rounded-lg border border-white/60 bg-white/75 p-4 shadow-sm">
                                <p className="text-[11px] font-bold uppercase tracking-[0.12em] cc-text-secondary">{item.label}</p>
                                <p className="mt-2 break-words text-sm font-semibold cc-text-primary">{item.value}</p>
                            </div>
                        ))}
                    </div>

                    {syncedPreview.length > 0 && (
                        <div className="mx-auto mt-5 max-w-4xl overflow-hidden rounded-lg border border-white/70 bg-white/80 text-left shadow-sm">
                            <div className="border-b border-subtle px-4 py-3">
                                <p className="text-sm font-semibold cc-text-primary">
                                    Resumen de filas sincronizadas
                                </p>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[620px] text-sm">
                                    <thead className="bg-canvas text-xs font-bold uppercase tracking-[0.08em] cc-text-secondary">
                                        <tr>
                                            <th className="px-4 py-3 text-left">Nombre</th>
                                            <th className="px-4 py-3 text-left">Unidad</th>
                                            <th className="px-4 py-3 text-left">Contacto</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-subtle">
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
                                <p className="border-t border-subtle px-4 py-3 text-xs cc-text-secondary">
                                    +{syncedPreview.length - 5} fila(s) adicionales en el lote.
                                </p>
                            )}
                        </div>
                    )}

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
                        className="overflow-hidden rounded-lg border border-subtle bg-surface shadow-sm"
                    >
                        <div className="flex flex-col gap-4 border-b border-subtle bg-slate-950 p-5 text-white lg:flex-row lg:items-center lg:justify-between">
                            <div>
                                <h2 className="flex items-center gap-2 text-lg font-semibold">
                                    <FileSpreadsheet className="h-5 w-5 text-brand-300" />
                                    Revision antes de sincronizar
                                </h2>
                                <p className="mt-1 text-sm text-slate-300">
                                    {quality.validRows} de {quality.totalRows} filas tienen nombre y unidad. Corrige o elimina registros dudosos antes de guardar.
                                </p>
                                {lastFileName && (
                                    <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                                        Archivo: {lastFileName}
                                    </p>
                                )}
                            </div>
                            <div className="flex flex-col gap-2 sm:flex-row">
                                <Button type="button" variant="secondary" onClick={() => setExtractedData(null)}>
                                    Cancelar
                                </Button>
                                <button
                                    onClick={handleSyncToDatabase}
                                    disabled={isSyncing || quality.validRows === 0}
                                    aria-label={confirmingSync ? "Confirmar sincronizacion" : "Sincronizar nomina"}
                                    className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${confirmingSync ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"}`}
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

                        <div className="grid gap-3 border-b border-subtle p-5 md:grid-cols-4">
                            {[
                                { label: "Calidad", value: `${quality.score}%`, tone: quality.score >= 80 ? "text-success-fg" : "text-warning-fg" },
                                { label: "Filas válidas", value: `${quality.validRows}/${quality.totalRows}`, tone: "cc-text-primary" },
                                { label: "Sin nombre", value: quality.missingNameRows, tone: quality.missingNameRows ? "text-warning-fg" : "text-success-fg" },
                                { label: "Sin contacto", value: quality.missingContactRows, tone: quality.missingContactRows ? "text-warning-fg" : "text-success-fg" },
                            ].map(item => (
                                <div key={item.label} className="rounded-lg border border-subtle bg-elevated/40 p-4">
                                    <p className={`text-2xl font-semibold ${item.tone}`}>{item.value}</p>
                                    <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] cc-text-secondary">{item.label}</p>
                                </div>
                            ))}
                            {agentAssessment && (
                                <div className="rounded-lg border border-subtle bg-canvas p-4 md:col-span-4">
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
                                            <p className="rounded-md bg-warning-bg px-3 py-2 text-xs font-semibold text-warning-fg">
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
                            {quality.missingUnitRows > 0 && (
                                <div className="rounded-lg border border-warning-border bg-warning-bg p-4 md:col-span-4">
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
                            <table className="w-full min-w-[880px] text-left text-sm">
                                <thead className="border-b border-subtle bg-canvas text-xs font-semibold uppercase tracking-[0.08em] cc-text-secondary">
                                    <tr>
                                        <th className="px-5 py-4">Nombre</th>
                                        <th className="px-5 py-4">Unidad</th>
                                        <th className="px-5 py-4">Correo</th>
                                        <th className="px-5 py-4">Teléfono</th>
                                        <th className="px-5 py-4 text-right">Acción</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-subtle">
                                    {extractedData.map((row) => (
                                        <tr key={row.id} className="transition-colors hover:bg-elevated/60">
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
                                            <td className="px-5 py-3 text-right">
                                                <button
                                                    onClick={() => handleDeleteRow(row.id)}
                                                    className="inline-flex rounded-md p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
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
            className={`w-full rounded-md border bg-canvas px-3 py-2 text-sm outline-none transition-colors focus:border-brand-500 ${required && !value.trim() ? "border-amber-300" : "border-subtle"} ${mono ? "font-mono" : "font-sans"}`}
        />
    );
}
