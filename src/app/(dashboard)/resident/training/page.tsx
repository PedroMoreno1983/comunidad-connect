"use client";

import { useEffect, useMemo, useState } from "react";
import { MultiAgentClassroom } from "@/components/training/MultiAgentClassroom";
import { AlertCircle, ArrowLeft, BookOpen, GraduationCap, Play, ShieldCheck, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";

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
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const { user } = useAuth();
    const { toast } = useToast();

    const stats = useMemo(() => {
        const withLessons = courses.filter(course => course.training_lessons?.[0]?.content).length;
        return {
            total: courses.length,
            withLessons,
            guided: courses.length + 1,
        };
    }, [courses]);

    const handleDeleteCourse = async (id: string, event: React.MouseEvent) => {
        event.stopPropagation();
        if (deletingId !== id) {
            setDeletingId(id);
            return;
        }

        setDeletingId(null);
        try {
            const res = await fetch(`/api/training/modules?id=${id}`, { method: "DELETE" });
            if (res.ok) {
                setCourses(prev => prev.filter(course => course.id !== id));
                toast({ title: "Curso eliminado", variant: "success" });
            } else {
                const data = await res.json();
                toast({ title: "No se pudo eliminar", description: data.error || "Permisos insuficientes", variant: "destructive" });
            }
        } catch (error) {
            console.warn("Training course delete failed:", error);
            toast({ title: "Error de red", description: "No se pudo eliminar el curso.", variant: "destructive" });
        }
    };

    useEffect(() => {
        fetch("/api/training/modules")
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    setCourses(data);
                } else {
                    console.warn("Training modules API returned a non-array response.", data);
                    setCourses([]);
                }
                setLoading(false);
            })
            .catch(error => {
                console.warn("Training modules load failed:", error);
                setLoading(false);
            });
    }, []);

    if (selectedCourseContent !== null) {
        return (
            <ErrorBoundary name="Resident Training Module">
                <div className="mx-auto max-w-[1600px] space-y-5 p-6">
                    <button
                        type="button"
                        onClick={() => {
                            setSelectedCourseContent(null);
                            setSelectedCourseTitle(null);
                        }}
                        className="inline-flex items-center gap-2 rounded-lg border border-subtle bg-surface px-4 py-2 text-sm font-semibold cc-text-secondary shadow-sm transition-colors hover:bg-elevated"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Volver al catalogo
                    </button>

                    <div className="flex flex-col justify-between gap-4 border-b border-subtle pb-5 lg:flex-row lg:items-end">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">Aula virtual IA</p>
                            <h1 className="mt-2 text-3xl font-semibold tracking-tight cc-text-primary">{selectedCourseTitle}</h1>
                            <p className="mt-2 max-w-2xl text-sm leading-6 cc-text-secondary">
                                CoCo usa la pizarra, imagenes generadas y alumnos virtuales para convertir el contenido en decisiones practicas.
                            </p>
                        </div>
                        <div className="inline-flex items-center gap-2 rounded-md bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700">
                            <ShieldCheck className="h-4 w-4" />
                            Clase guiada
                        </div>
                    </div>

                    <MultiAgentClassroom courseContent={selectedCourseContent} />
                </div>
            </ErrorBoundary>
        );
    }

    return (
        <ErrorBoundary name="Resident Training Module List">
            <div className="mx-auto max-w-7xl space-y-8 p-6">
                <section className="rounded-lg border border-subtle bg-surface p-6 shadow-sm">
                    <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">Formacion comunitaria</p>
                            <h1 className="mt-3 text-4xl font-semibold tracking-tight cc-text-primary">Aula virtual CoCo</h1>
                            <p className="mt-3 max-w-2xl text-sm leading-6 cc-text-secondary">
                                Capacitaciones oficiales para convivencia, reglamento, seguridad y operacion diaria del edificio.
                            </p>
                        </div>
                        <Button
                            onClick={() => {
                                setSelectedCourseContent("");
                                setSelectedCourseTitle("Modo libre con Tutora CoCo");
                            }}
                            trailingIcon={<Play className="h-4 w-4" />}
                        >
                            Abrir modo libre
                        </Button>
                    </div>

                    <div className="mt-6 grid gap-3 sm:grid-cols-3">
                        <Stat label="Cursos publicados" value={stats.total} icon={<BookOpen className="h-4 w-4" />} />
                        <Stat label="Con guion IA" value={stats.withLessons} icon={<GraduationCap className="h-4 w-4" />} />
                        <Stat label="Experiencias disponibles" value={stats.guided} icon={<ShieldCheck className="h-4 w-4" />} />
                    </div>
                </section>

                {loading ? (
                    <div className="rounded-lg border border-subtle bg-surface p-10 text-center text-sm cc-text-secondary shadow-sm">
                        Cargando cursos disponibles...
                    </div>
                ) : (
                    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {courses.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-subtle bg-surface p-10 text-center shadow-sm md:col-span-2 xl:col-span-3">
                                <AlertCircle className="mx-auto mb-3 h-10 w-10 text-slate-400" />
                                <h2 className="text-lg font-semibold cc-text-primary">No hay cursos publicados</h2>
                                <p className="mx-auto mt-2 max-w-md text-sm cc-text-secondary">
                                    Cuando Administracion publique un reglamento, circular o protocolo, aparecera aqui como clase guiada.
                                </p>
                            </div>
                        ) : (
                            courses.map(course => (
                                <article
                                    key={course.id}
                                    onClick={() => {
                                        setSelectedCourseContent(course.training_lessons?.[0]?.content || "Sin contenido.");
                                        setSelectedCourseTitle(course.title);
                                    }}
                                    className="group relative cursor-pointer overflow-hidden rounded-lg border border-subtle bg-surface p-5 shadow-sm transition-colors hover:border-brand-300"
                                >
                                    {user?.role === "admin" && (
                                        <button
                                            type="button"
                                            onClick={event => handleDeleteCourse(course.id, event)}
                                            className="absolute right-4 top-4 z-10 rounded-lg border border-red-100 bg-red-50 p-2 text-red-500 opacity-0 transition-opacity hover:bg-red-100 group-hover:opacity-100"
                                            title={deletingId === course.id ? "Confirmar eliminacion" : "Eliminar curso"}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    )}

                                    <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                                        <BookOpen className="h-5 w-5" />
                                    </div>
                                    <h2 className="line-clamp-2 pr-8 text-xl font-semibold cc-text-primary">{course.title}</h2>
                                    <p className="mt-3 line-clamp-3 text-sm leading-6 cc-text-secondary">
                                        {course.description || "Inicia este curso interactivo con la Tutora CoCo."}
                                    </p>
                                    <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-brand-600">
                                        Iniciar clase
                                        <Play className="h-4 w-4" />
                                    </div>
                                </article>
                            ))
                        )}

                        <article
                            onClick={() => {
                                setSelectedCourseContent("");
                                setSelectedCourseTitle("Modo libre con Tutora CoCo");
                            }}
                            className="flex cursor-pointer flex-col justify-between rounded-lg border border-dashed border-subtle bg-canvas p-5 transition-colors hover:border-brand-300 hover:bg-surface"
                        >
                            <div>
                                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg bg-slate-900 text-white">
                                    <GraduationCap className="h-5 w-5" />
                                </div>
                                <h2 className="text-xl font-semibold cc-text-primary">Modo libre</h2>
                                <p className="mt-3 text-sm leading-6 cc-text-secondary">
                                    Pregunta por convivencia, reglamento, seguridad o administracion sin depender de un manual cargado.
                                </p>
                            </div>
                            <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-brand-600">
                                Abrir tutora
                                <Play className="h-4 w-4" />
                            </div>
                        </article>
                    </section>
                )}
            </div>
        </ErrorBoundary>
    );
}

function Stat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
    return (
        <div className="rounded-lg border border-subtle bg-canvas p-4">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-surface cc-text-secondary">
                {icon}
            </div>
            <p className="text-2xl font-semibold cc-text-primary">{value}</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] cc-text-secondary">{label}</p>
        </div>
    );
}
