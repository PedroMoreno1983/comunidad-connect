"use client";

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/lib/authContext';
import { 
    GraduationCap, Plus, Trash2, Edit3, 
    BookOpen, Users, Save, X, Eye, AlertCircle 
} from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Course {
    id: string;
    title: string;
    description: string;
    target_audience: string;
    training_lessons: { content: string }[];
}

export default function AdminTrainingPage() {
    const { user } = useAuth();
    const router = useRouter();
    const [courses, setCourses] = useState<Course[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Form State
    const [isCreating, setIsCreating] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [newAudience, setNewAudience] = useState('all');
    const [newContent, setNewContent] = useState('');
    const [isSaving, setIsSaving] = useState(false);

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
            if (res.ok) {
                const data = await res.json();
                setCourses(data || []);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            const res = await fetch('/api/training/modules', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: newTitle,
                    description: newDesc,
                    target_audience: newAudience,
                    content: newContent
                })
            });
            if (res.ok) {
                setIsCreating(false);
                setNewTitle('');
                setNewDesc('');
                setNewContent('');
                fetchCourses();
            }
        } catch (err) {
            console.error(err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('¿Estás seguro de eliminar este curso? Se borrará todo su contenido y progreso.')) return;
        
        try {
            await fetch(`/api/training/modules?id=${id}`, { method: 'DELETE' });
            setCourses(c => c.filter(course => course.id !== id));
        } catch (err) {
            console.error(err);
        }
    };

    if (loading) {
        return <div className="p-8 text-center text-slate-500">Cargando módulos...</div>;
    }

    return (
        <div className="max-w-6xl mx-auto space-y-8 pb-12">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                        <GraduationCap className="h-8 w-8 text-indigo-600" />
                        Creador de Cursos IA
                    </h1>
                    <p className="mt-2 text-slate-500 max-w-2xl">
                        Añade contenido en texto (ej. PDFs, protocolos, leyes) y el CoCo Tutor enseñará estas lecciones 
                        automáticamente de forma interactiva a tu comunidad.
                    </p>
                </div>
                {!isCreating && (
                    <button 
                        onClick={() => setIsCreating(true)}
                        className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-medium shadow-lg hover:bg-indigo-700 flex items-center gap-2 transition"
                    >
                        <Plus className="h-5 w-5" />
                        Nuevo Curso
                    </button>
                )}
            </div>

            <AnimatePresence>
                {isCreating && (
                    <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden"
                    >
                        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
                            <h2 className="text-xl font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                                <BookOpen className="h-6 w-6 text-indigo-500" />
                                Redactar Nuevo Curso
                            </h2>
                            <button onClick={() => setIsCreating(false)} className="text-slate-400 hover:text-slate-600">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        
                        <form onSubmit={handleCreate} className="p-6 space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Título del Curso *</label>
                                    <input 
                                        required 
                                        value={newTitle}
                                        onChange={e => setNewTitle(e.target.value)}
                                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-transparent"
                                        placeholder="Ej: Protocolo de Terremotos"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Público Objetivo</label>
                                    <select 
                                        value={newAudience}
                                        onChange={e => setNewAudience(e.target.value)}
                                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-transparent"
                                    >
                                        <option value="all">Todos (Comunidad Completa)</option>
                                        <option value="resident">Solo Residentes</option>
                                        <option value="concierge">Solo Conserjería</option>
                                        <option value="admin">Solo Administradores</option>
                                    </select>
                                </div>
                            </div>
                            
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Descripción Breve</label>
                                <input 
                                    value={newDesc}
                                    onChange={e => setNewDesc(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-transparent"
                                    placeholder="De qué trata este curso..."
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                    Contenido (Conocimiento del Tutor) *
                                </label>
                                <p className="text-xs text-slate-500 mb-2">Pega aquí manuales, normativas o copias de un PDF. El IA leerá esto y se basará estrictamente en esta información para dar la clase.</p>
                                <textarea 
                                    required 
                                    rows={8}
                                    value={newContent}
                                    onChange={e => setNewContent(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/50 resize-y"
                                    placeholder="El Condominio Los Pinos establece que ante un fuerte sismo, las vías de evacuación son..."
                                />
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-700">
                                <button 
                                    type="button" 
                                    onClick={() => setIsCreating(false)}
                                    className="px-5 py-2.5 text-slate-600 font-medium hover:bg-slate-100 rounded-xl"
                                >
                                    Cancelar
                                </button>
                                <button 
                                    type="submit" 
                                    disabled={isSaving}
                                    className="px-6 py-2.5 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
                                >
                                    {isSaving ? 'Guardando...' : <><Save className="h-4 w-4" /> Publicar Curso</>}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {courses.length === 0 && !isCreating ? (
                    <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl">
                        <AlertCircle className="h-10 w-10 text-slate-400 mx-auto mb-3" />
                        <h3 className="text-lg font-medium text-slate-900 dark:text-white">Aún no hay cursos creados</h3>
                        <p className="text-slate-500 mt-1">Sube contenido interno para empezar a entrenar a tu comunidad.</p>
                    </div>
                ) : (
                    courses.map(course => (
                        <div key={course.id} className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-lg transition group">
                            <div className="flex justify-between items-start mb-4">
                                <div className="p-3 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 rounded-xl">
                                    <BookOpen className="h-6 w-6" />
                                </div>
                                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition">
                                    <button 
                                        onClick={() => handleDelete(course.id)}
                                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                                        title="Eliminar curso"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                            
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white line-clamp-2 mb-2">
                                {course.title}
                            </h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-3 mb-4">
                                {course.description || "Sin descripción"}
                            </p>
                            
                            <div className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                                <Users className="h-4 w-4" />
                                {course.target_audience === 'all' ? 'Toda la Comunidad' : 
                                 course.target_audience === 'resident' ? 'Solo Residentes' : 
                                 course.target_audience === 'concierge' ? 'Equipo Conserjería' : 'Solo Admin'}
                            </div>

                            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 flex justify-between items-center text-xs text-slate-400">
                                <span>{course.training_lessons?.[0]?.content?.length || 0} caracteres de conocimiento</span>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
