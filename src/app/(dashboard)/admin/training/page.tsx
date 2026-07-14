"use client";

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/lib/authContext';
import {
    GraduationCap, Plus, Trash2,
    Users, Save, AlertCircle, UploadCloud, Play, FileText, Wand2, ChevronLeft
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import { Eyebrow, DisplayHeading } from '@/components/cc/Eyebrow';

export interface Slide {
    id: string;
    title: string;
    bullets: string[];
    visual_theme: string;
    notes: string;
}

interface Course {
    id: string;
    title: string;
    description: string;
    target_audience: string;
    community_id?: string | null;
    training_lessons: { content: string }[];
}

const visualThemes: Record<string, string> = {
    'purple-gradient': 'bg-slate-950',
    'blue-glass': 'bg-slate-950',
    'tech-abstract': 'bg-slate-950',
    'sunset-orange': 'bg-brand-500',
    'nature-green': 'bg-slate-900',
    'default': 'bg-slate-950'
};

function friendlyTrainingError(message?: string) {
    const text = (message || "").toLowerCase();
    if (text.includes("timeout") || text.includes("504") || text.includes("grande") || text.includes("large")) {
        return "El archivo tardó demasiado en procesarse. Prueba con menos páginas o divide el contenido.";
    }
    if (text.includes("gemini") || text.includes("api") || text.includes("json") || text.includes("model")) {
        return "El motor IA no pudo generar una presentación estable con este contenido. Revisa el texto base e intenta nuevamente.";
    }
    if (text.includes("rls") || text.includes("supabase") || text.includes("database")) {
        return "No pudimos guardar el curso por una restricción de datos. Revisa permisos del proyecto e intenta nuevamente.";
    }
    return "No pudimos completar la operación. Intenta nuevamente en unos segundos.";
}

export default function AdminTrainingPage() {
    const { user } = useAuth();
    const router = useRouter();
    const { toast } = useToast();
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [courses, setCourses] = useState<Course[]>([]);
    const [loading, setLoading] = useState(true);

    // Form State
    const [isCreating, setIsCreating] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [newAudience, setNewAudience] = useState('all');

    // Extracted raw text
    const [rawText, setRawText] = useState('');

    // AI Slide Generation State
    const [slides, setSlides] = useState<Slide[]>([]);
    const [activeSlideIndex, setActiveSlideIndex] = useState(0);
    const [isGenerating, setIsGenerating] = useState(false);

    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    useEffect(() => {
        if (!user || user.role !== 'admin') {
            router.push('/home');
            return;
        }
        fetchCourses();
    }, [user, router]);

    const fetchCourses = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/training/modules');
            const data = await res.json();
            if (res.ok && Array.isArray(data)) {
                setCourses(data);
            } else {
                setCourses([]);
            }
        } catch (error) {
            console.warn("Training modules load failed:", error);
            setCourses([]);
        } finally {
            setLoading(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        // Validate file sizes (Vercel Hobby plan limit ~4MB per request)
        const MAX_SIZE_MB = 4;
        const oversized = files.filter(f => f.size > MAX_SIZE_MB * 1024 * 1024);
        if (oversized.length > 0) {
            toast({ title: "Archivo demasiado grande", description: `${oversized.map(f => f.name).join(', ')} supera el límite de ${MAX_SIZE_MB}MB. Comprime el PDF o divídelo.`, variant: "destructive" });
            e.target.value = '';
            return;
        }

        setIsUploading(true);
        let combinedText = '';
        let lastFileName = '';

        try {
            for (const file of files) {
                const formData = new FormData();
                formData.append('file', file);

                const res = await fetch('/api/training/parse', {
                    method: 'POST',
                    body: formData,
                });
                const data = await res.json();

                if (res.ok) {
                    combinedText += (combinedText ? '\n\n' : '') + data.text;
                    lastFileName = file.name;
                } else {
                    toast({ title: `No se pudo leer ${file.name}`, description: friendlyTrainingError(data.error), variant: "destructive" });
                }
            }

            if (combinedText) {
                setRawText(prev => prev ? prev + '\n\n' + combinedText : combinedText);
                if (!newTitle) {
                    setNewTitle(files.length > 1 ? `Curso Múltiples Archivos` : `Curso sobre: ${lastFileName}`);
                }
            }
        } catch (err) {
            console.warn("Training text extraction failed:", err);
            toast({ title: "No se pudo extraer texto", description: friendlyTrainingError(err instanceof Error ? err.message : undefined), variant: "destructive" });
        } finally {
            setIsUploading(false);
            e.target.value = '';
        }
    };

    const generateSlidesFromText = async () => {
        if (!rawText.trim()) {
            toast({ title: "Falta contenido", description: "Sube un archivo o escribe un temario para que la IA diseñe el curso.", variant: "destructive" });
            return;
        }
        setIsGenerating(true);
        try {
            const res = await fetch('/api/training/generate-slides', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: rawText })
            });

            if (res.ok) {
                const data = await res.json();
                if (data.slides && data.slides.length > 0) {
                    setSlides(data.slides);
                    setActiveSlideIndex(0);
                } else {
                    toast({ title: "Sin resultado útil", description: "Agrega más contexto o divide el temario para generar diapositivas más claras.", variant: "destructive" });
                }
            } else {
                const errorData = await res.json();
                toast({ title: "No se pudo generar la presentación", description: friendlyTrainingError(errorData.error), variant: "destructive" });
            }
        } catch (error) {
            console.warn("Training slide generation failed:", error);
            toast({ title: "No se pudo generar la presentación", description: friendlyTrainingError(error instanceof Error ? error.message : undefined), variant: "destructive" });
        } finally {
            setIsGenerating(false);
        }
    };

    const handleNotesChange = (txt: string) => {
        setSlides(prev => {
            const next = [...prev];
            next[activeSlideIndex] = { ...next[activeSlideIndex], notes: txt };
            return next;
        });
    };

    const handleCreate = async () => {
        setIsSaving(true);
        try {
            // Guardamos el JSON de las diapositivas
            const finalContent = slides.length > 0 ? JSON.stringify(slides) : rawText;

            const res = await fetch('/api/training/modules', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: newTitle,
                    description: newDesc,
                    target_audience: newAudience,
                    content: finalContent
                })
            });
            if (res.ok) {
                cancelCreation();
                fetchCourses();
            } else {
                const errData = await res.json();
                toast({ title: "No se pudo guardar el curso", description: friendlyTrainingError(errData.error), variant: "destructive" });
            }
        } catch (err) {
            console.warn("Training course save failed:", err);
            toast({ title: "No se pudo guardar el curso", description: friendlyTrainingError(err instanceof Error ? err.message : undefined), variant: "destructive" });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (deletingId !== id) {
            setDeletingId(id);
            return;
        }
        setDeletingId(null);
        try {
            const response = await fetch(`/api/training/modules?id=${id}`, { method: 'DELETE' });
            const data = await response.json().catch(() => ({})) as { error?: string };
            if (!response.ok) {
                toast({ title: "No se pudo eliminar", description: data.error || "Permisos insuficientes.", variant: "destructive" });
                return;
            }
            setCourses(current => current.filter(course => course.id !== id));
            toast({ title: "Curso eliminado", variant: "success" });
        } catch (err) {
            console.warn("Training course delete failed:", err);
            toast({ title: "Error de red", description: "No se pudo eliminar el curso.", variant: "destructive" });
        }
    };

    const cancelCreation = () => {
        setIsCreating(false);
        setNewTitle('');
        setNewDesc('');
        setRawText('');
        setSlides([]);
        setActiveSlideIndex(0);
    };

    if (loading) return <div className="p-8 text-center cc-text-secondary">Cargando módulos...</div>;

    const activeSlide = slides[activeSlideIndex];

    return (
        <div className="mx-auto max-w-7xl space-y-8 p-4 pb-12 sm:p-6">
            {!isCreating && (
                <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
                    <div>
                        <Eyebrow className="mb-2">Aula CoCo</Eyebrow>
                        <DisplayHeading size={32} className="flex items-center gap-3">
                            <GraduationCap className="h-7 w-7" style={{ color: "var(--cc-copper)" }} />
                            Generador de cursos IA
                        </DisplayHeading>
                        <p className="mt-2 max-w-2xl text-sm font-medium cc-text-secondary">
                        Convierte reglamentos, protocolos y comunicados en clases guiadas para administración y conserjería.
                        </p>
                    </div>
                    <button
                        onClick={() => setIsCreating(true)}
                        className="mt-4 flex w-full justify-center gap-2 rounded-full px-5 py-3 font-semibold text-white transition-colors md:mt-0 md:w-auto"
                        style={{ background: "var(--cc-copper)" }}
                    >
                        <Plus className="h-5 w-5" />
                        Nuevo Curso Interactivo
                    </button>
                </div>
            )}

            {!isCreating && (
                <div className="flex flex-col items-center gap-8 overflow-hidden rounded-2xl border p-8 text-white md:flex-row" style={{ borderColor: "var(--cc-line)", background: "var(--cc-ink)" }}>
                    <div className="relative z-10 flex-1">
                        <div className="mb-3 flex items-center gap-2">
                            <span className="rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white" style={{ background: "var(--cc-copper)" }}>Integracion oficial</span>
                        </div>
                        <h3 className="mb-3 text-2xl font-semibold text-white" style={{ fontFamily: "var(--cc-font-display)" }}>
                            Material externo y cursos avanzados
                        </h3>
                        <p className="mb-6 text-sm leading-relaxed" style={{ color: "var(--cc-ink-muted)" }}>
                            Usa este módulo para capacitaciones internas rápidas. Para paquetes SCORM, traducciones o programas corporativos, puedes complementar con plataformas especializadas.
                        </p>
                        <a
                            href="https://www.cotraining.ai/es"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-4 text-sm font-semibold transition-colors hover:opacity-90 sm:w-auto md:py-3"
                            style={{ background: "#FFFFFF", color: "var(--cc-ink)" }}
                        >
                            Ir a CoTraining.ai
                        </a>
                    </div>
                    <div className="relative z-10 hidden h-48 w-48 flex-col items-center justify-center rounded-2xl border p-4 text-center backdrop-blur-md md:flex" style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.1)" }}>
                        <UploadCloud className="mb-3 h-10 w-10" style={{ color: "var(--cc-copper-tint)" }} />
                        <p className="text-xs font-bold" style={{ color: "var(--cc-ink-muted)" }}>Espacio preparado para paquetes SCORM e integraciones externas</p>
                    </div>
                </div>
            )}

            <AnimatePresence>
                {isCreating && slides.length === 0 && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}
                    >
                        <div className="mx-auto border-b p-6" style={{ borderColor: "var(--cc-line)" }}>
                            <h2 className="flex items-center justify-center gap-3 text-2xl font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>
                                <Wand2 className="h-7 w-7" style={{ color: "var(--cc-copper)" }} />
                                Paso 1: Preparar contenido base
                            </h2>
                        </div>

                        <div className="mx-auto max-w-4xl space-y-8 p-4 sm:p-8">
                            <div className="relative overflow-hidden rounded-2xl border-2 border-dashed p-10 text-center transition hover:bg-[var(--cc-paper-warm)]" style={{ borderColor: "var(--cc-line-strong)", background: "var(--cc-paper-warm)" }}>
                                <input
                                    type="file" multiple accept=".pdf,.docx,.doc,.xlsx,.csv,.txt"
                                    onChange={handleFileUpload} disabled={isUploading || isGenerating}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10"
                                />
                                <div className="pointer-events-none relative z-0 flex flex-col items-center justify-center gap-3">
                                    {isUploading ? (
                                        <div className="h-10 w-10 animate-spin rounded-full border-b-2" style={{ borderColor: "var(--cc-copper)" }}></div>
                                    ) : (
                                        <UploadCloud className="mb-2 h-14 w-14" style={{ color: "var(--cc-copper)" }} />
                                    )}
                                    <h3 className="text-lg font-bold cc-text-secondary">
                                        {isUploading ? 'Extrayendo textos...' : 'Sube PDF, Word, Excel, CSV o reglamentos'}
                                    </h3>
                                    <p className="max-w-md text-sm cc-text-tertiary">
                                        La IA leera el material y propondra un guion estructurado para explicar el contenido a la comunidad.
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="flex items-center gap-2 text-sm font-bold cc-text-secondary">
                                    O pega el temario / contenido manualmente
                                </label>
                                <textarea
                                    rows={5}
                                    value={rawText}
                                    onChange={e => setRawText(e.target.value)}
                                    disabled={isGenerating}
                                    className="w-full resize-y rounded-xl border px-5 py-4 outline-none focus:border-[var(--cc-copper)] focus:ring-2 focus:ring-[var(--cc-copper)]/15"
                                    style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}
                                    placeholder="Ej: Modulo 1. Como reciclar en el condominio..."
                                />
                            </div>

                            <div className="flex items-center justify-between border-t pt-6" style={{ borderColor: "var(--cc-line)" }}>
                                <button onClick={cancelCreation} disabled={isUploading || isGenerating} className="rounded-full px-5 py-2.5 cc-text-secondary hover:bg-[var(--cc-paper-warm)]">Cancelar</button>
                                <button
                                    onClick={generateSlidesFromText}
                                    disabled={isGenerating || isUploading || !rawText.trim()}
                                    className="flex items-center gap-2 rounded-full px-8 py-3 font-semibold text-white disabled:opacity-50"
                                    style={{ background: "var(--cc-copper)" }}
                                >
                                    {isGenerating ? 'Disenando presentacion...' : 'Generar presentacion'}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* SLIDE EDITOR / PREVIEW (OpenMAIC Style) */}
                {isCreating && slides.length > 0 && (
                     <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex min-h-[85vh] flex-col overflow-hidden rounded-2xl border" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}
                     >
                        {/* Editor Header Bar */}
                        <div className="flex h-16 items-center justify-between border-b px-6" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                            <div className="flex w-1/3 items-center gap-4">
                                <button onClick={() => setSlides([])} className="rounded-full p-2 cc-text-secondary hover:bg-[var(--cc-paper-warm)]">
                                    <ChevronLeft className="h-5 w-5" />
                                </button>
                                <input
                                    value={newTitle}
                                    onChange={e => setNewTitle(e.target.value)}
                                    className="w-full rounded border-none bg-transparent px-2 text-lg font-bold outline-none focus:ring-2 focus:ring-[var(--cc-copper)] cc-text-primary"
                                    placeholder="Título de la presentación..."
                                />
                            </div>
                            <div className="flex gap-4">
                                <select
                                    value={newAudience} onChange={e => setNewAudience(e.target.value)}
                                    className="rounded-full border px-3 py-1.5 text-sm"
                                    style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}
                                >
                                            <option value="all">Público: Administración y conserjería</option>
                                            <option value="concierge">Público: Conserjes</option>
                                            <option value="admin">Público: Administración</option>
                                </select>
                                <button
                                    onClick={handleCreate} disabled={isSaving}
                                    className="flex items-center gap-2 rounded-full px-6 py-1.5 font-medium text-white disabled:opacity-50"
                                    style={{ background: "var(--cc-copper)" }}
                                >
                                    {isSaving ? 'Guardando...' : <><Save className="h-4 w-4" /> Publicar curso</>}
                                </button>
                            </div>
                        </div>

                        {/* Editor Work Area */}
                        <div className="flex flex-1 overflow-hidden">

                            {/* Left Sidebar: Thumbnails */}
                            <div className="w-64 space-y-3 overflow-y-auto border-r p-4" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}>
                                {slides.map((slide, idx) => (
                                    <div
                                        key={slide.id || idx}
                                        onClick={() => setActiveSlideIndex(idx)}
                                        className="group relative flex aspect-video cursor-pointer flex-col justify-center overflow-hidden rounded-xl border-[3px] p-2 transition-colors"
                                        style={activeSlideIndex === idx
                                            ? { borderColor: "var(--cc-copper)", background: "var(--cc-paper)", boxShadow: "0 0 0 4px color-mix(in srgb, var(--cc-copper) 20%, transparent)" }
                                            : { borderColor: "transparent", background: "var(--cc-paper)" }}
                                    >
                                        <div className="absolute top-2 left-2 rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur">
                                            {idx + 1}
                                        </div>
                                        <h4 className="mt-3 truncate px-2 text-center text-[11px] font-bold leading-tight cc-text-secondary">
                                            {slide.title}
                                        </h4>
                                    </div>
                                ))}
                            </div>

                            {/* Center: Interactive Slide Canvas */}
                            <div className="flex flex-1 items-center justify-center overflow-hidden p-8" style={{ background: "var(--cc-paper-warm)" }}>
                                <AnimatePresence mode="wait">
                                    <motion.div
                                        key={activeSlide.id || activeSlideIndex}
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        transition={{ duration: 0.3 }}
                                        className={`w-full max-w-4xl aspect-[16/9] rounded-lg shadow-sm overflow-hidden relative ${
                                            visualThemes[activeSlide.visual_theme] || visualThemes['default']
                                        } flex items-center p-12`}
                                    >
                                        <div className="w-full bg-white/10 dark:bg-black/20 backdrop-blur-2xl border border-white/20 p-10 rounded-lg shadow-sm">
                                            <h1 className="text-4xl md:text-5xl font-semibold text-white tracking-tight mb-8">
                                                {activeSlide.title}
                                            </h1>

                                            <ul className="space-y-5 text-lg md:text-xl font-medium text-white/90">
                                                {activeSlide.bullets.map((b, i) => (
                                                    <li key={i} className="flex items-start gap-3">
                                                        <div className="mt-2 h-2 w-2 shrink-0 rounded-sm" style={{ background: "var(--cc-copper-tint)" }} />
                                                        <span>{b}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    </motion.div>
                                </AnimatePresence>
                            </div>

                            {/* Right Sidebar: Speaker Notes */}
                            <div className="flex w-80 flex-col border-l" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                                <div className="flex items-center justify-between border-b p-5" style={{ borderColor: "var(--cc-line)" }}>
                                    <h3 className="flex items-center gap-2 font-bold cc-text-primary">
                                        <FileText className="h-4 w-4" style={{ color: "var(--cc-copper)" }} />
                                        Notas de Orador (IA)
                                    </h3>
                                </div>
                                <div className="flex flex-1 flex-col gap-4 p-5">
                                    <p className="text-xs cc-text-tertiary">
                                        Este guion será usado por CoCo en el Aula Virtual durante esta diapositiva. Ajusta tono, ejemplos y nivel de detalle antes de publicar.
                                    </p>
                                    <textarea
                                        className="w-full flex-1 resize-none rounded-xl border p-4 text-sm leading-relaxed cc-text-secondary outline-none focus:ring-2 focus:ring-[var(--cc-copper)]/20"
                                        style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}
                                        value={activeSlide.notes}
                                        onChange={(e) => handleNotesChange(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>
                     </motion.div>
                )}
            </AnimatePresence>

            {!isCreating && (
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {courses.length === 0 ? (
                        <div className="col-span-full rounded-2xl border-2 border-dashed py-12 text-center" style={{ borderColor: "var(--cc-line-strong)" }}>
                            <AlertCircle className="mx-auto mb-3 h-10 w-10" style={{ color: "var(--cc-ink-faint)" }} />
                            <h3 className="text-lg font-medium cc-text-primary">Aún no hay cursos creados</h3>
                            <p className="mx-auto mt-2 max-w-md text-sm cc-text-secondary">Crea una primera capacitación desde un reglamento, protocolo o circular para que el Aula CoCo tenga contenido disponible.</p>
                        </div>
                    ) : (
                        courses.map(course => (
                            <div key={course.id} className="group rounded-2xl border p-6 transition" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                                <div className="mb-4 flex items-start justify-between">
                                    <div className="rounded-full p-3" style={{ background: "var(--cc-copper-tint)", color: "var(--cc-copper)" }}>
                                        <Play className="h-6 w-6" />
                                    </div>
                                    {course.community_id ? (
                                        <button
                                            onClick={() => handleDelete(course.id)}
                                            className="rounded-full p-2 text-[var(--cc-ink-faint)] opacity-0 transition hover:bg-[var(--cc-rose-tint)] hover:text-[var(--cc-rose)] group-hover:opacity-100"
                                            title={deletingId === course.id ? "Confirmar eliminacion" : "Eliminar curso"}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    ) : (
                                        <span className="rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ background: "var(--cc-copper-tint)", color: "var(--cc-copper)" }}>Oficial</span>
                                    )}
                                </div>
                                <h3 className="mb-2 line-clamp-2 text-xl font-bold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>
                                    {course.title}
                                </h3>
                                <p className="mb-4 flex items-center gap-2 text-sm cc-text-tertiary">
                                    <Users className="h-4 w-4" /> {course.target_audience}
                                </p>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
