"use client";

import { useMemo, useRef, useState } from "react";
import {
    ArrowLeft,
    BookOpenCheck,
    CheckCircle2,
    FileText,
    FileUp,
    Loader2,
    ShieldCheck,
    Sparkles,
} from "lucide-react";
import { Button } from "@/components/cc/Button";
import { Eyebrow } from "@/components/cc/Eyebrow";
import { useToast } from "@/components/ui/Toast";
import {
    isPublishableTrainingCourse,
    normalizeTrainingSlides,
    parseTrainingSlides,
    trainingActivityCount,
    trainingQualityReport,
} from "@/lib/training/courseContent";
import type {
    TrainingCourseBuilderProps,
    TrainingCourseDraft,
    TrainingActivityType,
    TrainingGenerateResponse,
    TrainingModuleMutationResponse,
    TrainingSlide,
} from "@/lib/types";

const initialDraft: TrainingCourseDraft = {
    title: "",
    description: "",
    targetAudience: "concierge",
    content: "",
    embedUrl: "",
    completionMode: "interactive",
    learningObjectives: [],
    estimatedMinutes: 25,
    changeSummary: "",
};

const audienceLabel = {
    concierge: "Conserjería",
    admin: "Administración",
    all: "Ambos roles",
};

function sourceFromCourse(course: NonNullable<TrainingCourseBuilderProps["initialCourse"]>) {
    const slides = parseTrainingSlides(course.training_lessons?.[0]?.content);
    return slides.map(slide => [slide.title, ...slide.bullets].join("\n")).join("\n\n");
}

export function TrainingCourseBuilder({ onPublished, onCancel, initialCourse }: TrainingCourseBuilderProps) {
    const { toast } = useToast();
    const fileRef = useRef<HTMLInputElement>(null);
    const editingOwnCourse = Boolean(initialCourse?.community_id);
    const personalizingOfficial = Boolean(initialCourse && !initialCourse.community_id);
    const initialSlides = useMemo(() => parseTrainingSlides(initialCourse?.training_lessons?.[0]?.content), [initialCourse]);
    const [draft, setDraft] = useState<TrainingCourseDraft>(() => initialCourse ? {
        title: personalizingOfficial ? `${initialCourse.title} · Adaptación local` : initialCourse.title,
        description: initialCourse.description || "",
        targetAudience: initialCourse.target_audience === "admin" || initialCourse.target_audience === "concierge" ? initialCourse.target_audience : "all",
        content: sourceFromCourse(initialCourse),
        embedUrl: initialCourse.embed_url || "",
        completionMode: initialCourse.completion_mode || (initialCourse.embed_url ? "embed_post_message" : "interactive"),
        learningObjectives: initialCourse.learning_objectives || [],
        estimatedMinutes: initialCourse.estimated_minutes || 25,
        changeSummary: editingOwnCourse ? "Actualización de contenidos, actividades y criterios operativos" : "",
    } : initialDraft);
    const [objectivesText, setObjectivesText] = useState(() => (initialCourse?.learning_objectives || []).join("\n"));
    const [slides, setSlides] = useState<TrainingSlide[]>(initialSlides);
    const [fileName, setFileName] = useState<string | null>(null);
    const [busy, setBusy] = useState<"file" | "generate" | "publish" | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const activities = useMemo(() => trainingActivityCount(slides), [slides]);
    const quality = useMemo(() => trainingQualityReport(slides), [slides]);
    const isStructured = quality.publishable;
    const objectives = useMemo(
        () => objectivesText.split("\n").map(item => item.trim()).filter(Boolean).slice(0, 8),
        [objectivesText],
    );
    const canPublish = Boolean(
        draft.title.trim()
        && draft.description.trim()
        && objectives.length
        && (isStructured || draft.embedUrl.trim()),
    );

    const setField = <K extends keyof TrainingCourseDraft>(key: K, value: TrainingCourseDraft[K]) => {
        setDraft(previous => ({ ...previous, [key]: value }));
        setErrorMessage(null);
    };

    const updateSource = (content: string) => {
        setField("content", content);
        setSlides([]);
    };

    const loadFile = async (file: File) => {
        setBusy("file");
        setErrorMessage(null);
        try {
            const form = new FormData();
            form.append("file", file);
            const response = await fetch("/api/training/parse", { method: "POST", body: form });
            const data = await response.json() as { text?: string; error?: string };
            if (!response.ok || !data.text) throw new Error(data.error || "No se pudo leer el archivo.");
            updateSource(data.text);
            setFileName(file.name);
            if (!draft.title) setField("title", file.name.replace(/\.[^.]+$/, ""));
            toast({ title: "Fuente cargada", description: "Ahora CoCo puede convertirla en una experiencia interactiva.", variant: "success" });
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo leer el archivo.";
            setErrorMessage(message);
            toast({ title: "No se pudo cargar", description: message, variant: "destructive" });
        } finally {
            setBusy(null);
            if (fileRef.current) fileRef.current.value = "";
        }
    };

    const generate = async () => {
        if (draft.content.trim().length < 80) {
            setErrorMessage("Agrega al menos 80 caracteres de contenido fuente.");
            return;
        }
        setBusy("generate");
        setErrorMessage(null);
        try {
            const response = await fetch("/api/training/generate-slides", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ text: draft.content, targetAudience: draft.targetAudience }),
            });
            const data = await response.json() as TrainingGenerateResponse;
            const normalized = normalizeTrainingSlides(data.slides);
            if (!response.ok || !isPublishableTrainingCourse(normalized)) {
                throw new Error(data.error || "No se pudo construir un curso interactivo válido.");
            }
            setSlides(normalized);
            if (!objectivesText.trim()) {
                setObjectivesText([
                    "Reconocer los criterios esenciales del protocolo.",
                    "Aplicar el procedimiento correcto en situaciones reales.",
                    "Registrar, escalar y cerrar cada gestión con evidencia.",
                ].join("\n"));
            }
            toast({
                title: "Curso diseñado",
                description: `${normalized.length} secciones y ${trainingActivityCount(normalized)} actividades listas para revisar.`,
                variant: "success",
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo diseñar el curso.";
            setErrorMessage(message);
            toast({ title: "No se pudo diseñar", description: message, variant: "destructive" });
        } finally {
            setBusy(null);
        }
    };

    const publish = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!canPublish) {
            setErrorMessage("Completa la ficha y genera un curso interactivo antes de publicar.");
            return;
        }
        setBusy("publish");
        setErrorMessage(null);
        try {
            const response = await fetch("/api/training/modules", {
                method: editingOwnCourse ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id: editingOwnCourse ? initialCourse?.id : undefined,
                    title: draft.title,
                    description: draft.description,
                    targetAudience: draft.targetAudience,
                    content: slides.length ? JSON.stringify(slides) : "",
                    embedUrl: draft.embedUrl,
                    completionMode: draft.embedUrl ? draft.completionMode : "interactive",
                    learningObjectives: objectives,
                    estimatedMinutes: draft.estimatedMinutes,
                    changeSummary: draft.changeSummary,
                }),
            });
            const data = await response.json() as TrainingModuleMutationResponse;
            if (!response.ok || !data.module) throw new Error(data.error || "No se pudo publicar el curso.");
            onPublished(data.module);
            setDraft(initialDraft);
            setObjectivesText("");
            setSlides([]);
            setFileName(null);
            toast({
                title: editingOwnCourse ? "Nueva versión publicada" : personalizingOfficial ? "Adaptación publicada" : "Curso publicado",
                description: `Ya está disponible para ${audienceLabel[draft.targetAudience].toLowerCase()}.`,
                variant: "success",
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo publicar el curso.";
            setErrorMessage(message);
            toast({ title: "No se pudo publicar", description: message, variant: "destructive" });
        } finally {
            setBusy(null);
        }
    };

    return (
        <section className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
            <header className="border-b px-5 py-5 sm:px-7" style={{ borderColor: "var(--cc-line)" }}>
                <button type="button" onClick={onCancel} className="mb-4 inline-flex items-center gap-2 text-sm font-semibold cc-text-secondary hover:cc-text-primary">
                    <ArrowLeft className="h-4 w-4" /> Volver al catálogo
                </button>
                <Eyebrow>Administración · autoría</Eyebrow>
                <h2 className="mt-2 text-2xl font-semibold cc-text-primary">{editingOwnCourse ? `Editar y publicar versión ${Number(initialCourse?.version_number || 1) + 1}` : personalizingOfficial ? "Personalizar curso oficial" : "Crear una capacitación profesional"}</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 cc-text-secondary">
                    {editingOwnCourse ? "Revisa el contenido vigente, mejora la fuente o los metadatos y publica una versión trazable sin borrar la anterior." : "Parte de un protocolo, reglamento o manual. CoCo lo transforma en secciones breves, decisiones prácticas y comprobaciones antes de publicarlo."}
                </p>
                <div className="mt-5 grid gap-2 sm:grid-cols-3">
                    <Stage number="1" label="Fuente y audiencia" active />
                    <Stage number="2" label="Diseño interactivo" active={slides.length > 0} />
                    <Stage number="3" label="Revisión y publicación" active={canPublish} />
                </div>
            </header>

            <form onSubmit={publish} className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
                <div className="space-y-5 p-5 sm:p-7">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Título del curso">
                            <input required className="input-premium h-11 w-full" value={draft.title} onChange={event => setField("title", event.target.value)} placeholder="Ej. Gestión de emergencias en conserjería" />
                        </Field>
                        <Field label="Dirigido a">
                            <select className="input-premium h-11 w-full" value={draft.targetAudience} onChange={event => setField("targetAudience", event.target.value as TrainingCourseDraft["targetAudience"])}>
                                <option value="concierge">Conserjería</option>
                                <option value="admin">Administración</option>
                                <option value="all">Administración y conserjería</option>
                            </select>
                        </Field>
                    </div>

                    <Field label="Descripción breve">
                        <textarea required className="input-premium min-h-24 w-full p-3" value={draft.description} onChange={event => setField("description", event.target.value)} placeholder="Qué problema resuelve y cuándo debe aplicarse." />
                    </Field>

                    <div className="rounded-xl border p-4" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}>
                        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                            <div>
                                <p className="text-sm font-semibold cc-text-primary">Documento o contenido fuente</p>
                                <p className="mt-1 text-xs cc-text-secondary">PDF, Word, Excel, CSV o TXT. También puedes pegar el texto abajo.</p>
                            </div>
                            <Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={() => fileRef.current?.click()}>
                                {busy === "file" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                                Cargar archivo
                            </Button>
                        </div>
                        {fileName && <div className="mt-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold cc-text-secondary" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}><FileText className="h-4 w-4" />{fileName}</div>}
                        <textarea className="input-premium mt-3 min-h-48 w-full p-3 text-sm leading-6" value={draft.content} onChange={event => updateSource(event.target.value)} placeholder="Pega aquí el protocolo, reglamento, circular o procedimiento..." />
                        <input ref={fileRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.xlsx,.csv,.txt" onChange={event => { const file = event.target.files?.[0]; if (file) void loadFile(file); }} />
                        <Button type="button" variant="copper" className="mt-3" disabled={busy !== null || draft.content.trim().length < 80} onClick={() => void generate()}>
                            {busy === "generate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                            Diseñar curso con CoCo
                        </Button>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Objetivos de aprendizaje, uno por línea">
                            <textarea required className="input-premium min-h-32 w-full p-3" value={objectivesText} onChange={event => { setObjectivesText(event.target.value); setErrorMessage(null); }} placeholder="Reconocer...&#10;Aplicar...&#10;Registrar..." />
                        </Field>
                        <div className="space-y-4">
                            <Field label="Duración estimada (minutos)">
                                <input type="number" min="5" max="480" className="input-premium h-11 w-full" value={draft.estimatedMinutes} onChange={event => setField("estimatedMinutes", Number(event.target.value))} />
                            </Field>
                            <Field label="Curso externo HTTPS, opcional">
                                <input
                                    type="url"
                                    className="input-premium h-11 w-full"
                                    value={draft.embedUrl}
                                    onChange={event => {
                                        const embedUrl = event.target.value;
                                        setDraft(previous => ({
                                            ...previous,
                                            embedUrl,
                                            completionMode: embedUrl && previous.completionMode === "interactive" ? "embed_post_message" : previous.completionMode,
                                        }));
                                        setErrorMessage(null);
                                    }}
                                    placeholder="https://..."
                                />
                            </Field>
                            {draft.embedUrl && <Field label="Validación de finalización">
                                <select className="input-premium h-11 w-full" value={draft.completionMode} onChange={event => setField("completionMode", event.target.value as TrainingCourseDraft["completionMode"])}>
                                    <option value="embed_post_message">Automática mediante puente CoCo</option>
                                    <option value="embed_manual">Manual para proveedor legado</option>
                                </select>
                            </Field>}
                        </div>
                    </div>
                    {draft.embedUrl && draft.completionMode === "embed_post_message" && <div className="rounded-xl border p-4 text-xs leading-5 cc-text-secondary" style={{ borderColor: "var(--cc-sage)", background: "var(--cc-sage-tint)" }}><strong className="cc-text-primary">Puente automático:</strong> el curso embebido debe enviar <code>convive-training-complete</code> con el nonce recibido en la URL. CoCo valida origen, sesión y puntaje antes de emitir la constancia.</div>}
                    {editingOwnCourse && <Field label="Resumen de cambios de esta versión">
                        <textarea required className="input-premium min-h-24 w-full p-3" value={draft.changeSummary} onChange={event => setField("changeSummary", event.target.value)} placeholder="Qué cambió y por qué se vuelve a publicar." />
                    </Field>}
                </div>

                <aside className="border-t p-5 sm:p-7 xl:border-l xl:border-t-0" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}>
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <Eyebrow>Vista previa</Eyebrow>
                            <h3 className="mt-2 text-lg font-semibold cc-text-primary">Estructura del curso</h3>
                        </div>
                        {isStructured && <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold" style={{ background: "var(--cc-sage-tint)", color: "var(--cc-sage)" }}><ShieldCheck className="h-3.5 w-3.5" />Calidad {quality.score}/100</span>}
                    </div>

                    {slides.length === 0 ? (
                        <div className="mt-5 rounded-xl border border-dashed p-6 text-center" style={{ borderColor: "var(--cc-line-strong)", background: "var(--cc-paper)" }}>
                            <BookOpenCheck className="mx-auto h-8 w-8 cc-text-tertiary" />
                            <p className="mt-3 text-sm font-semibold cc-text-primary">Aún no hay una estructura</p>
                            <p className="mt-1 text-xs leading-5 cc-text-secondary">Carga una fuente y usa “Diseñar curso con CoCo”. No se publicará texto crudo.</p>
                        </div>
                    ) : (
                        <>
                            <div className="mt-5 grid grid-cols-2 gap-2">
                                <PreviewMetric value={slides.length} label="secciones" />
                                <PreviewMetric value={activities} label="actividades" />
                            </div>
                            <div className="mt-3 rounded-lg border p-3" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                                <div className="flex items-center justify-between text-xs font-semibold"><span className="cc-text-primary">Control editorial</span><span style={{ color: quality.publishable ? "var(--cc-sage)" : "var(--cc-copper)" }}>{quality.score}/100</span></div>
                                <div className="mt-2 grid gap-1.5">{quality.checks.map(check => <div key={check.id} className="flex items-center gap-2 text-[11px] cc-text-secondary">{check.passed ? <CheckCircle2 className="h-3.5 w-3.5" style={{ color: "var(--cc-sage)" }} /> : <span className="h-3.5 w-3.5 rounded-full border" style={{ borderColor: "var(--cc-line-strong)" }} />}{check.label}</div>)}</div>
                            </div>
                            <ol className="mt-4 max-h-[430px] space-y-2 overflow-y-auto pr-1">
                                {slides.map((slide, index) => (
                                    <li key={slide.id} className="flex gap-3 rounded-lg border p-3" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white" style={{ background: "var(--cc-ink)" }}>{index + 1}</span>
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-semibold cc-text-primary">{slide.title}</p>
                                            <p className="mt-1 text-xs cc-text-secondary">{slide.activity ? activityLabel(slide.activity.type) : `${slide.bullets.length} ideas clave`}</p>
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        </>
                    )}

                    {errorMessage && <div role="alert" className="mt-4 rounded-lg border px-3 py-3 text-sm" style={{ borderColor: "var(--cc-rose)", background: "var(--cc-rose-tint)", color: "var(--cc-rose)" }}>{errorMessage}</div>}

                    <div className="mt-5 border-t pt-5" style={{ borderColor: "var(--cc-line)" }}>
                        <Button type="submit" variant="copper" block disabled={busy !== null || !canPublish}>
                            {busy === "publish" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                            {editingOwnCourse ? "Publicar nueva versión" : personalizingOfficial ? "Publicar adaptación local" : "Revisado: publicar curso"}
                        </Button>
                        <p className="mt-2 text-center text-[11px] leading-4 cc-text-tertiary">Se avisará únicamente al rol seleccionado.</p>
                    </div>
                </aside>
            </form>
        </section>
    );
}

function Stage({ number, label, active }: { number: string; label: string; active: boolean }) {
    return <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold" style={{ borderColor: active ? "var(--cc-copper)" : "var(--cc-line)", background: active ? "var(--cc-copper-tint)" : "var(--cc-paper-warm)", color: active ? "var(--cc-copper)" : "var(--cc-ink-muted)" }}><span>{number}</span><span>{label}</span></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return <label className="block text-xs font-semibold cc-text-secondary"><span className="mb-1.5 block">{label}</span>{children}</label>;
}

function PreviewMetric({ value, label }: { value: number; label: string }) {
    return <div className="rounded-lg border p-3" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}><p className="text-xl font-semibold cc-text-primary">{value}</p><p className="text-[11px] font-semibold uppercase tracking-[0.12em] cc-text-secondary">{label}</p></div>;
}

function activityLabel(type: TrainingActivityType) {
    if (type === "checklist") return "Lista de verificación";
    if (type === "scenario") return "Escenario de decisión";
    return "Comprobación de conocimiento";
}
