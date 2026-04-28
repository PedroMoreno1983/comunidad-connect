"use client";

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/lib/authContext';
import { 
    GraduationCap, Plus, Trash2, Edit3, 
    BookOpen, Users, Save, X, AlertCircle, UploadCloud, Play, FileText, Wand2, ChevronLeft, ChevronRight, Lock
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
    'purple-gradient': 'bg-gradient-to-br from-violet-600 to-indigo-800',
    'blue-glass': 'bg-gradient-to-tr from-blue-500 to-cyan-500',
    'tech-abstract': 'bg-gradient-to-br from-slate-800 to-indigo-900',
    'sunset-orange': 'bg-gradient-to-tr from-amber-500 to-rose-600',
    'nature-green': 'bg-gradient-to-br from-emerald-500 to-teal-700',
    'default': 'bg-gradient-to-br from-[#334155] to-[#0F172A]'
};

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
            console.error("Fetch try/catch error:", error);
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
                    toast({ title: `Error: ${file.name}`, description: data.error || 'Error desconocido al procesar el archivo.', variant: "destructive" });
                }
            }

            if (combinedText) {
                setRawText(prev => prev ? prev + '\n\n' + combinedText : combinedText);
                if (!newTitle) {
                    setNewTitle(files.length > 1 ? `Curso Múltiples Archivos` : `Curso sobre: ${lastFileName}`);
                }
            }
        } catch (err) {
            console.error(err);
            const msg = err instanceof Error ? err.message : 'Error desconocido';
            toast({ title: "Error extrayendo texto", description: msg, variant: "destructive" });
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
                    toast({ title: "Sin resultado", description: "La IA generó un formato vacío. Agrega más texto e intenta de nuevo.", variant: "destructive" });
                }
            } else {
                const errorData = await res.json();
                toast({ title: "Error generando diapositivas", description: errorData.error, variant: "destructive" });
            }
        } catch (error) {
            console.error(error);
            toast({ title: "Error de conexión", description: "No se pudo contactar al servidor de IA.", variant: "destructive" });
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
                toast({ title: "Error al guardar", description: errData.error || 'Error desconocido', variant: "destructive" });
            }
        } catch (err) {
            console.error(err);
            toast({ title: "Error de conexión", description: "No se pudo guardar el curso.", variant: "destructive" });
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
            console.error(err);
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
        <div className="max-w-7xl mx-auto space-y-8 pb-12">
            {!isCreating && (
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                    <div>
                        <h1 className="text-3xl font-bold cc-text-primary flex items-center gap-3">
                            <GraduationCap className="h-8 w-8 text-brand-600" />
                            Generador de Cursos Educativos IA
                        </h1>
                        <p className="mt-2 text-slate-500 max-w-2xl">
                            Transforma simples archivos PDF o de Word en increíbles presentaciones inmersivas estilo "Clase Magistral". CoCo narrará cada diapositiva.
                        </p>
                    </div>
                    <button 
                        onClick={() => setIsCreating(true)}
                        className="w-full md:w-auto justify-center px-5 py-3 bg-brand-600 text-white rounded-xl font-medium shadow-lg hover:bg-brand-700 flex items-center gap-2 transition mt-4 md:mt-0"
                    >
                        <Plus className="h-5 w-5" />
                        Nuevo Curso Interactivo
                    </button>
                </div>
            )}

            {!isCreating && (
                <div className="bg-slate-900 rounded-[2rem] p-8 text-white relative overflow-hidden flex flex-col md:flex-row items-center gap-8 shadow-2xl">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/20 rounded-full blur-[80px]" />
                    <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-[80px]" />
                    
                    <div className="flex-1 relative z-10">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="text-[10px] px-2 py-0.5 bg-orange-500 text-white rounded-full uppercase tracking-wider font-extrabold">Integración Oficial</span>
                        </div>
                        <h3 className="text-2xl font-black mb-3 text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-indigo-400">
                            Extiende tus posibilidades con CoTraining.ai
                        </h3>
                        <p className="text-slate-300 text-sm leading-relaxed mb-6">
                            Nuestra IA integrada es genial para cursos rápidos, pero si necesitas exportaciones SCORM completas, personalización avanzada o 140 idiomas, conecta tu cuenta de la plataforma líder en IA E-Learning.
                        </p>
                        <a 
                            href="https://www.cotraining.ai/es" 
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center gap-2 bg-white text-slate-900 px-6 py-4 md:py-3 rounded-full font-bold text-sm hover:shadow-xl hover:scale-105 transition-all w-full sm:w-auto"
                        >
                            Ir a CoTraining.ai
                        </a>
                    </div>
                    <div className="hidden md:flex w-48 h-48 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-md relative z-10 items-center justify-center flex-col text-center p-4">
                        <UploadCloud className="h-10 w-10 text-orange-400 mb-3" />
                        <p className="text-xs font-bold text-slate-300">Vincula aquí tus paquetes SCORM de CoTraining en el futuro</p>
                    </div>
                </div>
            )}

            <AnimatePresence>
                {isCreating && slides.length === 0 && (
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        className="bg-surface rounded-3xl shadow-xl border border-subtle overflow-hidden"
                    >
                        <div className="p-6 border-b border-subtle mx-auto">
                            <h2 className="text-2xl font-bold flex items-center gap-3 justify-center cc-text-primary">
                                <Wand2 className="h-7 w-7 text-brand-500" />
                                Paso 1: Alimentar a la IA
                            </h2>
                        </div>
                        
                        <div className="p-8 max-w-4xl mx-auto space-y-8">
                            <div className="relative p-10 border-2 border-dashed border-default rounded-2xl bg-canvas/50 hover:bg-elevated transition text-center overflow-hidden">
                                <input 
                                    type="file" multiple accept=".pdf,.docx,.doc,.txt" 
                                    onChange={handleFileUpload} disabled={isUploading || isGenerating}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10" 
                                />
                                <div className="flex flex-col items-center justify-center gap-3 pointer-events-none relative z-0">
                                    {isUploading ? (
                                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
                                    ) : (
                                        <UploadCloud className="w-14 h-14 text-brand-400 mb-2" />
                                    )}
                                    <h3 className="text-lg font-bold cc-text-secondary">
                                        {isUploading ? 'Extrayendo textos...' : 'Sube tus PDFs, Documentos o Reglamentos'}
                                    </h3>
                                    <p className="text-sm text-slate-500 max-w-md">
                                        La IA leerá automáticamente todo el material legal o formativo y construirá un guion estructurado para la comunidad.
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
                                    className="w-full px-5 py-4 rounded-xl border border-default bg-surface resize-y"
                                    placeholder="Ej: Módulo 1. Cómo reciclar en el condominio..."
                                />
                            </div>

                            <div className="flex justify-between items-center pt-6 border-t border-subtle">
                                <button onClick={cancelCreation} disabled={isUploading || isGenerating} className="px-5 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl">Cancelar</button>
                                <button 
                                    onClick={generateSlidesFromText} 
                                    disabled={isGenerating || isUploading || !rawText.trim()}
                                    className="px-8 py-3 bg-brand-600 text-white font-bold rounded-xl hover:bg-brand-700 disabled:opacity-50 shadow-lg shadow-indigo-200 dark:shadow-none flex items-center gap-2"
                                >
                                    {isGenerating ? '🌟 Diseñando Presentación IA...' : 'Crear Película Diapositivas'}
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
                        className="bg-[#fcfdff] dark:bg-slate-900 rounded-3xl shadow-2xl border border-subtle overflow-hidden flex flex-col min-h-[85vh]"
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
                                    placeholder="Título de la Presentación..."
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
                                    {isSaving ? 'Guardando...' : <><Save className="h-4 w-4" /> Publicar Oficialmente</>}
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
                                        className={`group relative rounded-xl aspect-video border-[3px] p-2 cursor-pointer transition-all overflow-hidden flex flex-col justify-center ${
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
                                        className={`w-full max-w-4xl aspect-[16/9] rounded-[2rem] shadow-2xl overflow-hidden relative ${
                                            visualThemes[activeSlide.visual_theme] || visualThemes['default']
                                        } flex items-center p-12`}
                                    >
                                        <div className="w-full bg-white/10 dark:bg-black/20 backdrop-blur-2xl border border-white/20 p-10 rounded-3xl shadow-xl">
                                            <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-8">
                                                {activeSlide.title}
                                            </h1>
                                            
                                            <ul className="space-y-5 text-lg md:text-xl font-medium text-white/90">
                                                {activeSlide.bullets.map((b, i) => (
                                                    <li key={i} className="flex items-start gap-3">
                                                        <div className="mt-1.5 w-2.5 h-2.5 bg-white rounded-full shrink-0" />
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
                                        <FileText className="h-4 w-4 text-emerald-500" />
                                        Notas de Orador (IA)
                                    </h3>
                                </div>
                                <div className="p-5 flex-1 flex flex-col gap-4">
                                    <p className="text-xs text-slate-500">
                                        Este es el guion que la profesora CoCo explicará de forma verbal y escrita en el Aula Virtual durante esta diapositiva específica. Siéntete libre de ajustarlo.
                                    </p>
                                    <textarea 
                                        className="w-full flex-1 resize-none p-4 rounded-xl border-none bg-amber-50/50 dark:bg-amber-900/10 focus:ring-2 ring-emerald-500/50 outline-none text-sm cc-text-secondary leading-relaxed shadow-inner"
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
                        <div className="col-span-full py-12 text-center border-2 border-dashed border-default rounded-2xl">
                            <AlertCircle className="h-10 w-10 text-slate-400 mx-auto mb-3" />
                            <h3 className="text-lg font-medium cc-text-primary">Aún no hay cursos creados</h3>
                        </div>
                    ) : (
                        courses.map(course => (
                            <div key={course.id} className="bg-surface rounded-2xl p-6 shadow-sm border border-subtle hover:shadow-lg transition group">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="p-3 bg-role-admin-bg text-brand-600 rounded-xl">
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
