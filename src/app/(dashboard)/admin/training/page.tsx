"use client";

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/lib/authContext';
import {
    GraduationCap, Plus, Trash2,
    Users, Save, AlertCircle, UploadCloud, Play, FileText, Wand2, ChevronLeft, Lock
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useDemoRestrictions } from '@/hooks/useDemoRestrictions';
import { useToast } from '@/components/ui/Toast';

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
    const { isDemoUser, demoMessage } = useDemoRestrictions();
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
        if (isDemoUser) {
            toast({ title: "Cuenta Demo", description: demoMessage, variant: "destructive" });
            return;
        }
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
        if (isDemoUser) {
            toast({ title: "Cuenta Demo", description: demoMessage, variant: "destructive" });
            return;
        }
        if (deletingId !== id) {
            setDeletingId(id);
            return;
        }
        setDeletingId(null);
        try {
            await fetch(`/api/training/modules?id=${id}`, { method: 'DELETE' });
            setCourses(c => c.filter(course => course.id !== id));
        } catch (err) {
            console.warn("Training course delete failed:", err);
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

    if (loading) return <div className="p-8 text-center text-slate-500">Cargando módulos...</div>;

    const activeSlide = slides[activeSlideIndex];

    return (
        <div className="mx-auto max-w-7xl space-y-8 p-6 pb-12">
            {!isCreating && (
                <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
                    <div>
                        <h1 className="flex items-center gap-3 text-3xl font-semibold cc-text-primary">
                            <GraduationCap className="h-8 w-8 text-brand-600" />
                            Generador de cursos IA
                        </h1>
                        <p className="mt-2 max-w-2xl text-slate-500">
                            Convierte reglamentos, protocolos y comunicados en clases guiadas para residentes y conserjería.
                        </p>
                    </div>
                    <button
                        onClick={() => setIsCreating(true)}
                        className="mt-4 flex w-full justify-center gap-2 rounded-lg bg-brand-500 px-5 py-3 font-semibold text-white shadow-sm transition-colors hover:bg-brand-600 md:mt-0 md:w-auto"
                    >
                        <Plus className="h-5 w-5" />
                        Nuevo Curso Interactivo
                    </button>
                </div>
            )}

            {!isCreating && (
                <div className="flex flex-col items-center gap-8 overflow-hidden rounded-lg border border-slate-800 bg-slate-950 p-8 text-white shadow-sm md:flex-row">
                    

                    <div className="relative z-10 flex-1">
                        <div className="mb-3 flex items-center gap-2">
                            <span className="rounded-md bg-brand-500 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">Integracion oficial</span>
                        </div>
                        <h3 className="text-2xl font-semibold mb-3 text-white">
                            Material externo y cursos avanzados
                        </h3>
                        <p className="mb-6 text-sm leading-relaxed text-slate-300">
                            Usa este módulo para capacitaciones internas rápidas. Para paquetes SCORM, traducciones o programas corporativos, puedes complementar con plataformas especializadas.
                        </p>
                        <a
                            href="https://www.cotraining.ai/es"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white px-6 py-4 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-100 sm:w-auto md:py-3"
                        >
                            Ir a CoTraining.ai
                        </a>
                    </div>
                    <div className="hidden md:flex w-48 h-48 rounded-lg bg-white/5 border border-white/10 backdrop-blur-md relative z-10 items-center justify-center flex-col text-center p-4">
                        <UploadCloud className="h-10 w-10 text-orange-400 mb-3" />
                        <p className="text-xs font-bold text-slate-300">Espacio preparado para paquetes SCORM e integraciones externas</p>
                    </div>
                </div>
            )}

            <AnimatePresence>
                {isCreating && slides.length === 0 && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        className="bg-surface rounded-lg shadow-sm border border-subtle overflow-hidden"
                    >
                        <div className="p-6 border-b border-subtle mx-auto">
                            <h2 className="text-2xl font-bold flex items-center gap-3 justify-center cc-text-primary">
                                <Wand2 className="h-7 w-7 text-brand-500" />
                                Paso 1: Preparar contenido base
                            </h2>
                        </div>

                        <div className="p-8 max-w-4xl mx-auto space-y-8">
                            <div className="relative p-10 border-2 border-dashed border-default rounded-lg bg-canvas/50 hover:bg-elevated transition text-center overflow-hidden">
                                <input
                                    type="file" multiple accept=".pdf,.docx,.doc,.xlsx,.csv,.txt"
                                    onChange={handleFileUpload} disabled={isUploading || isGenerating}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10"
                                />
                                <div className="flex flex-col items-center justify-center gap-3 pointer-events-none relative z-0">
                                    {isUploading ? (
                                        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-brand-500"></div>
                                    ) : (
                                        <UploadCloud className="w-14 h-14 text-brand-400 mb-2" />
                                    )}
                                    <h3 className="text-lg font-bold cc-text-secondary">
                                        {isUploading ? 'Extrayendo textos...' : 'Sube PDF, Word, Excel, CSV o reglamentos'}
                                    </h3>
                                    <p className="text-sm text-slate-500 max-w-md">
                                        La IA leera el material y propondra un guion estructurado para explicar el contenido a la comunidad.
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="text-sm font-bold cc-text-secondary flex items-center gap-2">
                                    O pega el temario / contenido manualmente
                                </label>
                                <textarea
                                    rows={5}
                                    value={rawText}
                                    onChange={e => setRawText(e.target.value)}
                                    disabled={isGenerating}
                                    className="w-full resize-y rounded-lg border border-default bg-surface px-5 py-4"
                                    placeholder="Ej: Modulo 1. Como reciclar en el condominio..."
                                />
                            </div>

                            <div className="flex justify-between items-center pt-6 border-t border-subtle">
                                <button onClick={cancelCreation} disabled={isUploading || isGenerating} className="rounded-lg px-5 py-2.5 text-slate-600 hover:bg-slate-100">Cancelar</button>
                                <button
                                    onClick={generateSlidesFromText}
                                    disabled={isGenerating || isUploading || !rawText.trim()}
                                    className="flex items-center gap-2 rounded-lg bg-brand-500 px-8 py-3 font-semibold text-white shadow-sm hover:bg-brand-600 disabled:opacity-50"
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
                        className="bg-[#fcfdff] dark:bg-slate-900 rounded-lg shadow-sm border border-subtle overflow-hidden flex flex-col min-h-[85vh]"
                     >
                        {/* Editor Header Bar */}
                        <div className="h-16 px-6 border-b border-subtle flex items-center justify-between bg-surface">
                            <div className="flex items-center gap-4 w-1/3">
                                <button onClick={() => setSlides([])} className="p-2 text-slate-500 hover:bg-elevated rounded-lg">
                                    <ChevronLeft className="h-5 w-5" />
                                </button>
                                <input
                                    value={newTitle}
                                    onChange={e => setNewTitle(e.target.value)}
                                    className="font-bold text-lg bg-transparent border-none outline-none focus:ring-2 ring-brand-500 rounded px-2 w-full cc-text-primary"
                                    placeholder="Título de la presentación..."
                                />
                            </div>
                            <div className="flex gap-4">
                                <select
                                    value={newAudience} onChange={e => setNewAudience(e.target.value)}
                                    className="px-3 py-1.5 rounded-lg border border-subtle text-sm bg-canvas"
                                >
                                    <option value="all">Público: Todos</option>
                                    <option value="resident">Público: Residentes</option>
                                    <option value="concierge">Público: Conserjes</option>
                                </select>
                                <button
                                    onClick={handleCreate} disabled={isSaving}
                                    className="px-6 py-1.5 bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-lg disabled:opacity-50 flex items-center gap-2 shadow"
                                >
                                    {isSaving ? 'Guardando...' : <><Save className="h-4 w-4" /> Publicar curso</>}
                                </button>
                            </div>
                        </div>

                        {/* Editor Work Area */}
                        <div className="flex flex-1 overflow-hidden">

                            {/* Left Sidebar: Thumbnails */}
                            <div className="w-64 border-r border-subtle bg-canvas/50 overflow-y-auto p-4 space-y-3">
                                {slides.map((slide, idx) => (
                                    <div
                                        key={slide.id || idx}
                                        onClick={() => setActiveSlideIndex(idx)}
                                        className={`group relative flex aspect-video cursor-pointer flex-col justify-center overflow-hidden rounded-lg border-[3px] p-2 transition-colors ${
                                            activeSlideIndex === idx
                                                ? 'border-brand-500 shadow-md ring-4 ring-brand-500/20'
                                                : 'border-transparent bg-surface hover:border-slate-300'
                                        }`}
                                    >
                                        <div className="absolute top-2 left-2 bg-black/50 backdrop-blur text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                                            {idx + 1}
                                        </div>
                                        <h4 className="text-[11px] font-bold text-center leading-tight mt-3 truncate px-2 cc-text-secondary">
                                            {slide.title}
                                        </h4>
                                    </div>
                                ))}
                            </div>

                            {/* Center: Interactive Slide Canvas */}
                            <div className="flex-1 bg-slate-100 dark:bg-black/20 p-8 flex items-center justify-center overflow-hidden">
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
                                                        <div className="mt-2 h-2 w-2 shrink-0 rounded-sm bg-brand-400" />
                                                        <span>{b}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    </motion.div>
                                </AnimatePresence>
                            </div>

                            {/* Right Sidebar: Speaker Notes */}
                            <div className="w-80 border-l border-subtle bg-surface flex flex-col">
                                <div className="p-5 border-b border-subtle flex items-center justify-between">
                                    <h3 className="font-bold flex items-center gap-2 cc-text-primary">
                                        <FileText className="h-4 w-4 text-brand-500" />
                                        Notas de Orador (IA)
                                    </h3>
                                </div>
                                <div className="p-5 flex-1 flex flex-col gap-4">
                                    <p className="text-xs text-slate-500">
                                        Este guion será usado por CoCo en el Aula Virtual durante esta diapositiva. Ajusta tono, ejemplos y nivel de detalle antes de publicar.
                                    </p>
                                    <textarea
                                        className="w-full flex-1 resize-none rounded-lg border border-subtle bg-elevated p-4 text-sm leading-relaxed cc-text-secondary outline-none ring-brand-500/30 focus:ring-2"
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {courses.length === 0 ? (
                        <div className="col-span-full py-12 text-center border-2 border-dashed border-default rounded-lg">
                            <AlertCircle className="h-10 w-10 text-slate-400 mx-auto mb-3" />
                            <h3 className="text-lg font-medium cc-text-primary">Aún no hay cursos creados</h3>
                            <p className="mx-auto mt-2 max-w-md text-sm cc-text-secondary">Crea una primera capacitación desde un reglamento, protocolo o circular para que el Aula CoCo tenga contenido disponible.</p>
                        </div>
                    ) : (
                        courses.map(course => (
                            <div key={course.id} className="bg-surface rounded-lg p-6 shadow-sm border border-subtle hover:shadow-sm transition group">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="rounded-lg bg-role-admin-bg p-3 text-brand-600">
                                        <Play className="h-6 w-6" />
                                    </div>
                                    <button
                                        onClick={() => handleDelete(course.id)}
                                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition"
                                        title={isDemoUser ? "Bloqueado en Demo" : "Eliminar curso"}
                                    >
                                        {isDemoUser ? <Lock className="h-4 w-4 text-slate-300" /> : <Trash2 className="h-4 w-4" />}
                                    </button>
                                </div>
                                <h3 className="text-xl font-bold cc-text-primary line-clamp-2 mb-2">
                                    {course.title}
                                </h3>
                                <p className="text-sm text-slate-500 flex items-center gap-2 mb-4">
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
