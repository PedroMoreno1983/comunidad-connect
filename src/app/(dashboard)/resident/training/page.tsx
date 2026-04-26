"use client";

import { useEffect, useState } from "react";
import { MultiAgentClassroom } from "@/components/training/MultiAgentClassroom";
import { BookOpen, AlertCircle, ArrowLeft, GraduationCap, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

interface Course {
    id: string;
    title: string;
    description: string;
    training_lessons: { content: string }[];
}

export default function ResidentTrainingPage() {
    const [courses, setCourses] = useState<Course[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCourseContent, setSelectedCourseContent] = useState<string | null>(null);
    const [selectedCourseTitle, setSelectedCourseTitle] = useState<string | null>(null);
    const { user } = useAuth();

    const handleDeleteCourse = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm("¿Estás seguro de querer eliminar permanentemente este curso oficial?")) return;
        
        try {
            const res = await fetch(`/api/training/modules?id=${id}`, { method: 'DELETE' });
            if (res.ok) {
                setCourses(prev => prev.filter(c => c.id !== id));
            } else {
                const data = await res.json();
                alert(`No se pudo eliminar el curso:\n\n${data.error || 'Permisos de base de datos insuficientes (RLS)'}`);
            }
        } catch (err) {
            console.error(err);
            alert("Error de red al eliminar el curso.");
        }
    };

    useEffect(() => {
        fetch('/api/training/modules')
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    setCourses(data);
                } else {
                    console.error("API Error fetching courses:", data);
                    setCourses([]);
                }
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    }, []);

    if (selectedCourseContent !== null) {
        return (
            <ErrorBoundary name="Resident Training Module">
                <div className="p-8 max-w-[1600px] mx-auto space-y-4 animate-in fade-in zoom-in-95 duration-500">
                    <button 
                        onClick={() => { setSelectedCourseContent(null); setSelectedCourseTitle(null); }}
                        className="mb-2 flex items-center text-sm font-medium text-slate-500 hover:text-indigo-600 transition"
                    >
                        <ArrowLeft className="h-4 w-4 mr-1" />
                        Volver al Catálogo de Cursos
                    </button>
                    <div className="flex items-center gap-2 mb-4">
                        <BookOpen className="h-6 w-6 text-indigo-500" />
                        <h2 className="text-2xl font-bold cc-text-primary border-b-2 border-indigo-100 dark:border-indigo-900 pb-1 inline-block">
                            {selectedCourseTitle}
                        </h2>
                    </div>
                    
                    <div className="w-full h-full">
                        <MultiAgentClassroom courseContent={selectedCourseContent} />
                    </div>
                </div>
            </ErrorBoundary>
        );
    }

    return (
        <ErrorBoundary name="Resident Training Module List">
            <div className="p-8 max-w-[1600px] mx-auto space-y-8 animate-in fade-in zoom-in-95 duration-500">
                <div className="flex flex-col mb-8">
                    <h1 className="text-3xl font-black tracking-tight cc-text-primary border-l-4 border-indigo-500 pl-4 py-1 flex items-center gap-3">
                        <GraduationCap className="w-8 h-8 text-indigo-500" />
                        Centro de Formación Interactivo
                    </h1>
                    <p className="cc-text-secondary mt-3 ml-5 max-w-2xl text-sm font-medium">
                        Selecciona un módulo oficial creado por la administración. La Tutora CoCo IA y tus compañeros virtuales te enseñarán de forma interactiva.
                    </p>
                </div>

                {loading ? (
                    <div className="py-12 text-center cc-text-secondary">Cargando cursos disponibles...</div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 ml-5">
                        {courses.length === 0 ? (
                            <div className="col-span-1 md:col-span-2 py-12 text-center border-2 border-dashed border-default/50 rounded-2xl">
                                <AlertCircle className="h-10 w-10 text-slate-400 mx-auto mb-3" />
                                <h3 className="text-lg font-medium cc-text-primary">Sin cursos específicos</h3>
                                <p className="cc-text-secondary">Pide a tu administración que agregue módulos oficiales.</p>
                            </div>
                        ) : (
                            courses.map(course => (
                                <div 
                                    key={course.id}
                                    onClick={() => {
                                        setSelectedCourseContent(course.training_lessons?.[0]?.content || "Sin contenido.");
                                        setSelectedCourseTitle(course.title);
                                    }}
                                    className="bg-surface rounded-2xl p-6 shadow-sm border border-subtle hover:shadow-xl hover:border-indigo-300 dark:hover:border-indigo-500 transition cursor-pointer group relative overflow-hidden"
                                >
                                    {user?.role === 'admin' && (
                                        <button 
                                            onClick={(e) => handleDeleteCourse(course.id, e)}
                                            className="absolute top-4 right-4 p-2.5 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20 text-red-500 transition-colors opacity-0 group-hover:opacity-100 z-10"
                                            title="Eliminar Curso"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                    <div className="w-12 h-12 rounded-xl bg-role-admin-bg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                        <BookOpen className="h-6 w-6 text-role-admin-fg" />
                                    </div>
                                    <h3 className="text-xl font-bold cc-text-primary mb-2 break-all line-clamp-2 pr-8">{course.title}</h3>
                                    <p className="text-sm cc-text-secondary line-clamp-3 mb-4 break-words">
                                        {course.description || "Inicia este curso interactivo con la Tutora CoCo."}
                                    </p>
                                    <div className="text-role-admin-fg text-sm font-semibold flex items-center">
                                        Iniciar Clase &rarr;
                                    </div>
                                </div>
                            ))
                        )}
                        
                        {/* Modo Inteligencia General (SIEMPRE VISIBLE) */}
                        <div 
                            onClick={() => {
                                setSelectedCourseContent(""); 
                                setSelectedCourseTitle("Modo Libre (Pregúntale a la Tutora CoCo)");
                            }}
                            className="bg-elevated/50 rounded-2xl p-6 border-2 border-dashed border-default hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-white dark:hover:bg-slate-800 transition cursor-pointer flex flex-col justify-center items-center text-center group"
                        >
                            <div className="w-12 h-12 rounded-xl bg-elevated flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                <GraduationCap className="h-6 w-6 cc-text-secondary" />
                            </div>
                            <h3 className="text-lg font-bold cc-text-secondary">Modo Abierto</h3>
                            <p className="text-xs cc-text-secondary mt-1">
                                La Tutora usará su inteligencia general sin guiarse estrictamente por un manual interno.
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </ErrorBoundary>
    );
}
