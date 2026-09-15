"use client";

import { useRef, useState } from "react";
import { BookPlus, FileUp, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/cc/Button";
import { Eyebrow } from "@/components/cc/Eyebrow";
import { useToast } from "@/components/ui/Toast";
import type { TrainingCourseDraft, TrainingModule } from "@/lib/types";

const initialDraft: TrainingCourseDraft = {
    title: "", description: "", targetAudience: "concierge", content: "", embedUrl: "",
    learningObjectives: [], estimatedMinutes: 25,
};

export function TrainingCourseBuilder({ onPublished }: { onPublished: (course: TrainingModule) => void }) {
    const { toast } = useToast();
    const [draft, setDraft] = useState<TrainingCourseDraft>(initialDraft);
    const [objectivesText, setObjectivesText] = useState("");
    const [busy, setBusy] = useState<"file" | "generate" | "publish" | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const setField = <K extends keyof TrainingCourseDraft>(key: K, value: TrainingCourseDraft[K]) =>
        setDraft(previous => ({ ...previous, [key]: value }));

    const loadFile = async (file: File) => {
        setBusy("file");
        try {
            const form = new FormData(); form.append("file", file);
            const response = await fetch("/api/training/parse", { method: "POST", body: form });
            const data = await response.json() as { text?: string; error?: string };
            if (!response.ok || !data.text) throw new Error(data.error || "No se pudo leer el archivo.");
            setField("content", data.text);
            if (!draft.title) setField("title", file.name.replace(/\.[^.]+$/, ""));
            toast({ title: "Documento cargado", description: "Puedes mejorarlo con CoCo antes de publicarlo.", variant: "success" });
        } catch (error) {
            toast({ title: "No se pudo cargar", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
        } finally { setBusy(null); }
    };

    const generate = async () => {
        if (!draft.content.trim()) return toast({ title: "Agrega contenido o carga un archivo", variant: "destructive" });
        setBusy("generate");
        try {
            const response = await fetch("/api/training/generate-slides", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: draft.content, targetAudience: draft.targetAudience }) });
            const data = await response.json() as { slides?: unknown[]; error?: string };
            if (!response.ok || !Array.isArray(data.slides)) throw new Error(data.error || "No se pudo diseñar el curso.");
            setField("content", JSON.stringify(data.slides));
            toast({ title: "Curso mejorado por CoCo", description: `${data.slides.length} secciones prácticas listas para revisar.`, variant: "success" });
        } catch (error) {
            toast({ title: "No se pudo mejorar", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
        } finally { setBusy(null); }
    };

    const publish = async (event: React.FormEvent) => {
        event.preventDefault(); setBusy("publish");
        try {
            const response = await fetch("/api/training/modules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, learningObjectives: objectivesText.split("\n").map(item => item.trim()).filter(Boolean) }) });
            const data = await response.json() as { module?: TrainingModule; error?: string };
            if (!response.ok || !data.module) throw new Error(data.error || "No se pudo publicar.");
            onPublished({ ...data.module, training_lessons: [{ id: "new", title: "Leccion principal", content: draft.content || "Curso alojado en el recurso embebido.", order_index: 0 }] });
            setDraft(initialDraft); setObjectivesText("");
            toast({ title: "Curso publicado", description: "Ya está disponible para el rol seleccionado.", variant: "success" });
        } catch (error) {
            toast({ title: "No se pudo publicar", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
        } finally { setBusy(null); }
    };

    return <section className="rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
        <Eyebrow>Administración · autoría</Eyebrow><h2 className="mt-2 text-2xl font-semibold cc-text-primary">Crear o cargar un curso focalizado</h2>
        <p className="mt-1 text-sm cc-text-secondary">Carga un PDF, Word, Excel, CSV o TXT; o pega contenido. CoCo lo convierte en decisiones, casos y listas de verificación para el rol elegido.</p>
        <form onSubmit={publish} className="mt-5 grid gap-4 lg:grid-cols-2">
            <label className="text-xs font-semibold cc-text-secondary">Título<input required className="input-premium mt-1 h-11 w-full" value={draft.title} onChange={event => setField("title", event.target.value)} /></label>
            <label className="text-xs font-semibold cc-text-secondary">Dirigido a<select className="input-premium mt-1 h-11 w-full" value={draft.targetAudience} onChange={event => setField("targetAudience", event.target.value as TrainingCourseDraft["targetAudience"])}><option value="concierge">Conserjería</option><option value="admin">Administración</option><option value="all">Ambos roles</option></select></label>
            <label className="text-xs font-semibold cc-text-secondary lg:col-span-2">Descripción<input className="input-premium mt-1 h-11 w-full" value={draft.description} onChange={event => setField("description", event.target.value)} /></label>
            <label className="text-xs font-semibold cc-text-secondary">Objetivos de aprendizaje, uno por línea<textarea className="input-premium mt-1 min-h-28 w-full p-3" value={objectivesText} onChange={event => setObjectivesText(event.target.value)} /></label>
            <div className="space-y-3"><label className="text-xs font-semibold cc-text-secondary">Duración estimada<input type="number" min="5" max="480" className="input-premium mt-1 h-11 w-full" value={draft.estimatedMinutes} onChange={event => setField("estimatedMinutes", Number(event.target.value))} /></label><label className="text-xs font-semibold cc-text-secondary">Enlace HTTPS para embeber, opcional<input type="url" className="input-premium mt-1 h-11 w-full" value={draft.embedUrl} onChange={event => setField("embedUrl", event.target.value)} placeholder="https://..." /></label></div>
            <label className="text-xs font-semibold cc-text-secondary lg:col-span-2">Contenido fuente o curso generado<textarea className="input-premium mt-1 min-h-52 w-full p-3 font-mono text-xs" value={draft.content} onChange={event => setField("content", event.target.value)} /></label>
            <input ref={fileRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.xlsx,.csv,.txt" onChange={event => { const file = event.target.files?.[0]; if (file) void loadFile(file); }} />
            <div className="flex flex-wrap gap-2 lg:col-span-2"><Button type="button" variant="ghost" disabled={busy !== null} onClick={() => fileRef.current?.click()}>{busy === "file" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />} Cargar archivo</Button><Button type="button" variant="ghost" disabled={busy !== null || !draft.content.trim()} onClick={() => void generate()}>{busy === "generate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Mejorar con CoCo</Button><Button type="submit" variant="copper" disabled={busy !== null || !draft.title.trim() || (!draft.content.trim() && !draft.embedUrl.trim())}>{busy === "publish" ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookPlus className="h-4 w-4" />} Publicar curso</Button></div>
        </form>
    </section>;
}
