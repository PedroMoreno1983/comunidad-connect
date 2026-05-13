"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
    AlertCircle,
    CheckCircle2,
    FileSpreadsheet,
    ListChecks,
    Save,
    ShieldCheck,
    Trash2,
    UploadCloud,
    UsersRound,
} from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";

interface ExtractedUser {
    id: string;
    name: string;
    unit_id: string;
    email: string;
    phone: string;
}

interface SyncResult {
    mode: "demo" | "real";
    fileName: string;
    rows: number;
    success: number;
    errors: number;
}

const demoExtractedUsers: ExtractedUser[] = [
    { id: "demo-row-1", name: "Andrea Dupre", unit_id: "1204", email: "andrea@example.com", phone: "+56 9 5555 1204" },
    { id: "demo-row-2", name: "Carlos Rivas", unit_id: "805", email: "carlos@example.com", phone: "+56 9 5555 0805" },
    { id: "demo-row-3", name: "Marta Rojas", unit_id: "1505", email: "marta@example.com", phone: "" },
    { id: "demo-row-4", name: "", unit_id: "1802", email: "pendiente@example.com", phone: "+56 9 5555 1802" },
];

const demoOnboardingStorageKey = "cc_demo_onboarding_residents";

const fieldAliases = {
    name: ["nombre", "name", "residente", "resident", "full_name", "fullname", "nombrecompleto", "propietario", "arrendatario"],
    unit_id: ["unidad", "unit", "depto", "departamento", "nrodepartamento", "numerodepartamento", "unitnumber", "unitid", "numero", "casa"],
    email: ["correo", "email", "mail", "correoelectronico", "e-mail"],
    phone: ["telefono", "phone", "celular", "movil", "whatsapp", "contacto"],
};

function normalizeHeader(value: string) {
    return value
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "");
}

function pickField(row: Record<string, unknown>, aliases: string[]) {
    const normalizedEntries = Object.entries(row).map(([key, value]) => ({
        key: normalizeHeader(key),
        value,
    }));
    const match = normalizedEntries.find(entry => aliases.includes(entry.key));
    return match?.value === undefined || match.value === null ? "" : String(match.value).trim();
}

function mapRowsFromObjectSheet(rows: Record<string, unknown>[]) {
    return rows
        .map((row, index) => ({
            id: `file-${index}`,
            name: pickField(row, fieldAliases.name),
            unit_id: pickField(row, fieldAliases.unit_id),
            email: pickField(row, fieldAliases.email),
            phone: pickField(row, fieldAliases.phone),
        }))
        .filter(row => row.name || row.unit_id || row.email || row.phone);
}

function mapRowsFromMatrix(rows: unknown[][]) {
    return rows
        .filter(row => row.some(cell => String(cell ?? "").trim()))
        .map((row, index) => ({
            id: `file-row-${index}`,
            name: String(row[0] ?? "").trim(),
            unit_id: String(row[1] ?? "").trim(),
            email: String(row[2] ?? "").trim(),
            phone: String(row[3] ?? "").trim(),
        }))
        .filter(row => row.name || row.unit_id || row.email || row.phone);
}

async function parseFileInBrowser(file: File): Promise<ExtractedUser[]> {
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !["csv", "txt"].includes(extension)) return [];

    const lines = (await file.text())
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);
    if (lines.length === 0) return [];

    const delimiter = lines[0].includes(";") ? ";" : ",";
    const cells = lines.map(line => line.split(delimiter).map(cell => cell.trim().replace(/^"|"$/g, "")));
    const [firstRow, ...restRows] = cells;
    const hasHeaders = firstRow.some(cell => Object.values(fieldAliases).flat().includes(normalizeHeader(cell)));

    if (hasHeaders) {
        const rows = restRows.map(row => Object.fromEntries(firstRow.map((header, index) => [header, row[index] || ""])));
        const mappedRows = mapRowsFromObjectSheet(rows);
        if (mappedRows.length > 0) return mappedRows;
    }

    return mapRowsFromMatrix(cells);
}

function saveDemoOnboardedResidents(rows: ExtractedUser[], fileName: string) {
    if (typeof window === "undefined") return;
    const storedRows = rows.map((row, index) => ({
        ...row,
        id: `demo-onboarding-${Date.now()}-${index}`,
        sourceFile: fileName,
        syncedAt: new Date().toISOString(),
    }));

    try {
        const existing = JSON.parse(window.localStorage.getItem(demoOnboardingStorageKey) || "[]") as ExtractedUser[];
        window.localStorage.setItem(demoOnboardingStorageKey, JSON.stringify([...storedRows, ...existing].slice(0, 100)));
    } catch {
        window.localStorage.setItem(demoOnboardingStorageKey, JSON.stringify(storedRows));
    }
}

function friendlyError(message?: string) {
    const text = (message || "").toLowerCase();
    if (text.includes("timeout") || text.includes("504") || text.includes("large") || text.includes("grande")) {
        return "El archivo tardo demasiado en procesarse. Prueba con un PDF mas liviano o divide la nomina en partes.";
    }
    if (text.includes("json") || text.includes("gemini") || text.includes("api")) {
        return "No pudimos leer el archivo con suficiente confianza. Revisa el formato o intenta con una planilla Excel/CSV/TXT.";
    }
    if (text.includes("supabase") || text.includes("database")) {
        return "No pudimos guardar la informacion en este momento. Revisa tu conexion e intenta nuevamente.";
    }
    return "No pudimos completar la operacion. Revisa el archivo e intenta nuevamente.";
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

    const isDemoUser = user?.email.toLowerCase().endsWith("@demo.com") ?? false;

    useEffect(() => {
        if (user && user.role !== "admin") router.push("/home");
    }, [router, user]);

    const quality = useMemo(() => {
        const totalRows = extractedData?.length || 0;
        const validRows = extractedData?.filter(row => row.name.trim() && row.unit_id.trim()).length || 0;
        const missingNameRows = extractedData?.filter(row => !row.name.trim()).length || 0;
        const missingUnitRows = extractedData?.filter(row => !row.unit_id.trim()).length || 0;
        const missingContactRows = extractedData?.filter(row => !row.email.trim() && !row.phone.trim()).length || 0;
        const score = totalRows > 0 ? Math.round((validRows / totalRows) * 100) : 0;

        return { totalRows, validRows, missingNameRows, missingUnitRows, missingContactRows, score };
    }, [extractedData]);

    const setDemoNomina = () => {
        setSyncSuccess(false);
        setConfirmingSync(false);
        setSyncResult(null);
        setSyncedPreview([]);
        setLastFileName("nomina-demo.csv");
        setExtractedData(demoExtractedUsers);
        toast({
            title: "Nomina demo cargada",
            description: "Puedes editar filas, eliminar dudas y simular la sincronizacion.",
            variant: "success",
        });
    };

    const extractFileWithApi = async (uploadedFile: File) => {
        const formData = new FormData();
        formData.append("file", uploadedFile);
        const res = await fetch("/api/onboarding/extract", {
            method: "POST",
            body: formData,
        });

        const textResponse = await res.text();
        let result: { data?: Partial<ExtractedUser>[]; error?: string } | null = null;
        try {
            result = JSON.parse(textResponse);
        } catch {
            throw new Error("non-json-response");
        }

        if (!res.ok || !result?.data) {
            throw new Error(result?.error || "extract-failed");
        }

        return result.data.map((row, index) => ({
            id: `temp-${index}`,
            name: row.name || "",
            unit_id: row.unit_id || "",
            email: row.email || "",
            phone: row.phone || "",
        }));
    };

    const processFile = async (uploadedFile: File) => {
        setIsExtracting(true);
        setExtractedData(null);
        setSyncSuccess(false);
        setConfirmingSync(false);
        setSyncResult(null);
        setSyncedPreview([]);
        setLastFileName(uploadedFile.name);

        try {
            if (isDemoUser) {
                await new Promise(resolve => setTimeout(resolve, 650));
                const browserRows = await parseFileInBrowser(uploadedFile);
                if (browserRows.length > 0) {
                    setExtractedData(browserRows);
                    toast({
                        title: "Archivo demo leido",
                        description: `Detectamos ${browserRows.length} fila(s) desde tu archivo. El guardado seguira siendo simulado.`,
                        variant: "success",
                    });
                    return;
                }

                try {
                    const apiRows = await extractFileWithApi(uploadedFile);
                    setExtractedData(apiRows);
                    toast({
                        title: "Archivo demo procesado",
                        description: `Detectamos ${apiRows.length} fila(s). El guardado seguira siendo simulado.`,
                        variant: "success",
                    });
                    return;
                } catch (apiError) {
                    console.warn("[AdminOnboarding] demo API extract failed:", apiError);
                }

                setExtractedData(demoExtractedUsers);
                toast({
                    title: "Archivo recibido en modo demo",
                    description: "No pudimos leerlo en esta demo, asi que cargamos filas de prueba para que puedas revisar el flujo sin guardar datos reales.",
                    variant: "success",
                });
                return;
            }

            const mappedData = await extractFileWithApi(uploadedFile);
            setExtractedData(mappedData);
            toast({
                title: "Archivo procesado",
                description: `Detectamos ${mappedData.length} registros para revision.`,
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
            if (isDemoUser) {
                await new Promise(resolve => setTimeout(resolve, 700));
                saveDemoOnboardedResidents(rowsToSync, lastFileName || "nomina-demo.csv");
                setSyncedPreview(rowsToSync);
                setSyncResult({
                    mode: "demo",
                    fileName: lastFileName || "nomina-demo.csv",
                    rows: rowsToSync.length,
                    success: rowsToSync.length,
                    errors: 0,
                });
                setSyncSuccess(true);
                setExtractedData(null);
                toast({ title: "Nomina demo aplicada", description: "Quedo visible en Directorio y Unidades dentro de esta demo.", variant: "success" });
                return;
            }

            const res = await fetch("/api/onboarding/upsert", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ residents: rowsToSync }),
            });

            if (res.ok) {
                const result = await res.json().catch(() => ({}));
                const success = typeof result.success === "number" ? result.success : rowsToSync.length;
                const errors = typeof result.errors === "number" ? result.errors : 0;
                setSyncedPreview(rowsToSync);
                setSyncResult({
                    mode: "real",
                    fileName: lastFileName || "archivo importado",
                    rows: rowsToSync.length,
                    success,
                    errors,
                });
                setSyncSuccess(true);
                setExtractedData(null);
                toast({ title: "Residentes sincronizados", description: `${success} fila(s) quedaron disponibles para operacion.`, variant: "success" });
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
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-600">Carga masiva</p>
                    <h1 className="mt-2 flex items-center gap-3 text-3xl font-semibold cc-text-primary">
                        <UsersRound className="h-8 w-8 text-brand-600" />
                        Onboarding de residentes
                    </h1>
                    <p className="mt-3 max-w-3xl text-sm leading-6 cc-text-secondary">
                        Importa nominas antiguas, revisa la extraccion y sincroniza residentes con sus unidades sin exponer datos incompletos al resto de la comunidad.
                    </p>
                </div>
                <div className="rounded-lg border border-subtle bg-surface p-4 text-sm shadow-sm">
                    <p className="font-semibold cc-text-primary">Flujo recomendado</p>
                    <div className="mt-3 grid gap-2">
                        {["Subir archivo", "Revisar filas", "Sincronizar"].map((step, index) => (
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
                    { title: "Control de calidad", description: "Detecta campos criticos antes de guardar datos en la comunidad.", icon: <ListChecks className="h-4 w-4" /> },
                    { title: "Carga segura", description: "Sincroniza solo despues de revisar y confirmar la nomina.", icon: <ShieldCheck className="h-4 w-4" /> },
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

            {!extractedData && !syncSuccess && (
                <section
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
                            {isExtracting ? "Procesando archivo" : "Sube una nomina de residentes"}
                        </h2>
                        <p className="mt-3 text-sm leading-6 cc-text-secondary">
                            {isExtracting
                                ? "Estamos extrayendo nombres, unidades, correos y telefonos. Manten esta ventana abierta."
                                : "Acepta PDF, Word, Excel .xlsx, TXT o CSV. Para mejores resultados usa columnas simples: nombre, unidad, correo y telefono."}
                        </p>

                        {!isExtracting && (
                            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                                <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-brand-500 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-600">
                                    <UploadCloud className="h-4 w-4" />
                                    Seleccionar archivo
                                    <input
                                        type="file"
                                        accept=".pdf,.docx,.doc,.xlsx,.txt,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                                        aria-label="Seleccionar nomina en PDF, Word, Excel XLSX, TXT o CSV"
                                        onChange={handleFileUpload}
                                        disabled={isExtracting}
                                        className="hidden"
                                    />
                                </label>
                                <Button type="button" variant="outline" onClick={setDemoNomina}>
                                    Cargar ejemplo
                                </Button>
                            </div>
                        )}
                    </div>
                </section>
            )}

            {syncSuccess && (
                <motion.section
                    initial={{ scale: 0.98, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className={`rounded-lg border p-8 shadow-sm ${syncResult?.mode === "demo" ? "border-warning-border bg-warning-bg" : "border-success-border bg-success-bg"}`}
                >
                    <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-lg text-white ${syncResult?.mode === "demo" ? "bg-amber-600" : "bg-emerald-600"}`}>
                        <CheckCircle2 className="h-8 w-8" />
                    </div>
                    <h2 className={`mt-5 text-2xl font-semibold ${syncResult?.mode === "demo" ? "text-warning-fg" : "text-success-fg"}`}>
                        {syncResult?.mode === "demo" ? "Carga simulada en cuenta demo" : "Nomina sincronizada"}
                    </h2>
                    <p className={`mx-auto mt-2 max-w-2xl text-sm leading-6 ${syncResult?.mode === "demo" ? "text-amber-900" : "text-emerald-800"}`}>
                        {syncResult?.mode === "demo"
                            ? "Esta cuenta protege la demostracion: no escribe en la base real. El lote quedo guardado localmente y visible en Directorio y Unidades para validar el flujo completo."
                            : "Los residentes quedaron guardados y preparados para invitacion, asignacion de unidades y operacion diaria."}
                    </p>

                    <div className="mx-auto mt-6 grid max-w-4xl gap-3 text-left md:grid-cols-4">
                        {[
                            { label: "Archivo", value: syncResult?.fileName || "Sin nombre" },
                            { label: "Filas aceptadas", value: `${syncResult?.success ?? 0}/${syncResult?.rows ?? 0}` },
                            { label: "Con errores", value: `${syncResult?.errors ?? 0}` },
                            {
                                label: "Destino",
                                value: syncResult?.mode === "demo" ? "Directorio y Unidades demo" : "Directorio y Unidades",
                            },
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
                                    Resumen de filas {syncResult?.mode === "demo" ? "simuladas" : "sincronizadas"}
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
                                    className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${confirmingSync ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"}`}
                                >
                                    {isSyncing ? (
                                        "Sincronizando..."
                                    ) : confirmingSync ? (
                                        <>
                                            <AlertCircle className="h-4 w-4" />
                                            Confirmar sincronizacion
                                        </>
                                    ) : (
                                        <>
                                            <Save className="h-4 w-4" />
                                            Sincronizar nomina
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>

                        <div className="grid gap-3 border-b border-subtle p-5 md:grid-cols-4">
                            {[
                                { label: "Calidad", value: `${quality.score}%`, tone: quality.score >= 80 ? "text-success-fg" : "text-warning-fg" },
                                { label: "Filas validas", value: `${quality.validRows}/${quality.totalRows}`, tone: "cc-text-primary" },
                                { label: "Sin nombre", value: quality.missingNameRows, tone: quality.missingNameRows ? "text-warning-fg" : "text-success-fg" },
                                { label: "Sin contacto", value: quality.missingContactRows, tone: quality.missingContactRows ? "text-warning-fg" : "text-success-fg" },
                            ].map(item => (
                                <div key={item.label} className="rounded-lg border border-subtle bg-elevated/40 p-4">
                                    <p className={`text-2xl font-semibold ${item.tone}`}>{item.value}</p>
                                    <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] cc-text-secondary">{item.label}</p>
                                </div>
                            ))}
                            {quality.missingUnitRows > 0 && (
                                <div className="rounded-lg border border-warning-border bg-warning-bg p-4 md:col-span-4">
                                    <div className="flex items-start gap-3">
                                        <AlertCircle className="mt-0.5 h-5 w-5 text-warning-fg" />
                                        <p className="text-sm font-semibold cc-text-primary">
                                            Hay {quality.missingUnitRows} fila(s) sin unidad. Corrigelas antes de sincronizar para evitar residentes sin asignacion.
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
                                        <th className="px-5 py-4">Telefono</th>
                                        <th className="px-5 py-4 text-right">Accion</th>
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
