"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, FileSpreadsheet, Save, Trash2, UploadCloud, UsersRound } from "lucide-react";
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

function friendlyError(message?: string) {
    const text = (message || "").toLowerCase();
    if (text.includes("timeout") || text.includes("504") || text.includes("large") || text.includes("grande")) {
        return "El archivo tardó demasiado en procesarse. Prueba con un PDF más liviano o divide la nómina en partes.";
    }
    if (text.includes("json") || text.includes("gemini") || text.includes("api")) {
        return "No pudimos leer el archivo con suficiente confianza. Revisa el formato o intenta con una planilla CSV/TXT.";
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

    useEffect(() => {
        if (user && user.role !== "admin") router.push("/home");
    }, [router, user]);

    const processFile = async (uploadedFile: File) => {
        setIsExtracting(true);
        setExtractedData(null);
        setSyncSuccess(false);
        setConfirmingSync(false);

        const formData = new FormData();
        formData.append("file", uploadedFile);

        try {
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

            if (res.ok && result?.data) {
                const mappedData = result.data.map((row, index) => ({
                    id: `temp-${index}`,
                    name: row.name || "",
                    unit_id: row.unit_id || "",
                    email: row.email || "",
                    phone: row.phone || "",
                }));
                setExtractedData(mappedData);
                toast({
                    title: "Archivo procesado",
                    description: `Detectamos ${mappedData.length} registros para revisión.`,
                    variant: "success",
                });
                return;
            }

            throw new Error(result?.error || "extract-failed");
        } catch (err: unknown) {
            console.error("[AdminOnboarding] extract failed:", err);
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

        setConfirmingSync(false);
        setIsSyncing(true);
        try {
            const res = await fetch("/api/onboarding/upsert", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ residents: extractedData }),
            });

            if (res.ok) {
                setSyncSuccess(true);
                setExtractedData(null);
                toast({ title: "Residentes sincronizados", description: "La nómina quedó disponible para operación.", variant: "success" });
                return;
            }

            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || "upsert-failed");
        } catch (error: unknown) {
            console.error("[AdminOnboarding] sync failed:", error);
            toast({
                title: "No se pudo sincronizar",
                description: friendlyError(error instanceof Error ? error.message : undefined),
                variant: "destructive",
            });
        } finally {
            setIsSyncing(false);
        }
    };

    if (user && user.role !== "admin") return null;

    const validRows = extractedData?.filter(row => row.name.trim() && row.unit_id.trim()).length || 0;

    return (
        <div className="mx-auto max-w-7xl space-y-8 pb-12">
            <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">Carga masiva</p>
                    <h1 className="mt-2 flex items-center gap-3 text-3xl font-semibold cc-text-primary">
                        <UsersRound className="h-8 w-8 text-brand-600" />
                        Onboarding de residentes
                    </h1>
                    <p className="mt-3 max-w-3xl text-sm leading-6 cc-text-secondary">
                        Importa nóminas antiguas, revisa la extracción y sincroniza residentes con sus unidades sin exponer datos incompletos al resto de la comunidad.
                    </p>
                </div>
                <div className="rounded-lg border border-subtle bg-surface px-4 py-3 text-sm shadow-sm">
                    <p className="font-semibold cc-text-primary">Flujo recomendado</p>
                    <p className="mt-1 cc-text-secondary">Subir archivo → revisar filas → sincronizar</p>
                </div>
            </header>

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
                            {isExtracting ? "Procesando archivo" : "Sube una nómina de residentes"}
                        </h2>
                        <p className="mt-3 text-sm leading-6 cc-text-secondary">
                            {isExtracting
                                ? "Estamos extrayendo nombres, unidades, correos y teléfonos. Mantén esta ventana abierta."
                                : "Acepta PDF, Word, TXT o CSV. Para mejores resultados usa columnas simples: nombre, unidad, correo y teléfono."}
                        </p>

                        {!isExtracting && (
                            <label className="mt-8 inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-brand-500 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-600">
                                <UploadCloud className="h-4 w-4" />
                                Seleccionar archivo
                                <input
                                    type="file"
                                    accept=".pdf,.docx,.doc,.txt,.csv"
                                    onChange={handleFileUpload}
                                    disabled={isExtracting}
                                    className="hidden"
                                />
                            </label>
                        )}
                    </div>
                </section>
            )}

            {syncSuccess && (
                <motion.section
                    initial={{ scale: 0.98, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="rounded-lg border border-success-border bg-success-bg p-8 text-center shadow-sm"
                >
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-lg bg-emerald-600 text-white">
                        <CheckCircle2 className="h-8 w-8" />
                    </div>
                    <h2 className="mt-5 text-2xl font-semibold text-success-fg">Nómina sincronizada</h2>
                    <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-emerald-800">
                        Los residentes quedaron preparados para invitación, asignación de unidades y operación diaria.
                    </p>
                    <Button type="button" className="mt-6" onClick={() => setSyncSuccess(false)}>
                        Cargar otro archivo
                    </Button>
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
                                    Revisión antes de sincronizar
                                </h2>
                                <p className="mt-1 text-sm text-slate-300">
                                    {validRows} de {extractedData.length} filas tienen nombre y unidad. Corrige o elimina registros dudosos antes de guardar.
                                </p>
                            </div>
                            <div className="flex flex-col gap-2 sm:flex-row">
                                <Button type="button" variant="secondary" onClick={() => setExtractedData(null)}>
                                    Cancelar
                                </Button>
                                <button
                                    onClick={handleSyncToDatabase}
                                    disabled={isSyncing || validRows === 0}
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
