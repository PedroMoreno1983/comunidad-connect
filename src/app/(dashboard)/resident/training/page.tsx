"use client";

import { useEffect, useMemo, useState } from "react";
import { MultiAgentClassroom } from "@/components/training/MultiAgentClassroom";
import { AlertCircle, ArrowLeft, BookOpen, GraduationCap, Play, ShieldCheck, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { ModuleFlow } from "@/components/ui/ModuleFlow";
import { Eyebrow, DisplayHeading } from "@/components/cc/Eyebrow";

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

    useEffect(() => {
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
        document.querySelector("main")?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }, [selectedCourseContent]);

    if (selectedCourseContent !== null) {
        return (
            <ErrorBoundary name="Resident Training Module">
                <div className="mx-auto max-w-[1600px] space-y-4 px-0 py-2 sm:space-y-5 sm:p-6">
                    <button
                        type="button"
                        onClick={() => {
                            setSelectedCourseContent(null);
                            setSelectedCourseTitle(null);
                        }}
                        className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold cc-text-secondary transition-colors hover:bg-[var(--cc-paper-warm)]"
                        style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Volver al catálogo
                    </button>

                    <div className="flex flex-col justify-between gap-3 border-b pb-4 sm:gap-4 sm:pb-5 lg:flex-row lg:items-end" style={{ borderColor: "var(--cc-line)" }}>
                        <div>
                            <Eyebrow>Aula virtual IA</Eyebrow>
                            <DisplayHeading size={28} className="mt-2">{selectedCourseTitle}</DisplayHeading>
                            <p className="mt-2 max-w-2xl text-sm leading-6 font-medium cc-text-secondary">
                                CoCo usa la pizarra, imágenes generadas y alumnos virtuales para convertir el contenido en decisiones prácticas.
                            </p>
                        </div>
                        <div className="inline-flex w-fit items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold" style={{ background: "var(--cc-copper-tint)", color: "var(--cc-copper)" }}>
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
            <div className="mx-auto max-w-7xl space-y-5 px-0 py-2 sm:space-y-8 sm:p-6">
                <section className="rounded-2xl border p-4 sm:p-6" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
                        <div>
                            <Eyebrow>Formación comunitaria</Eyebrow>
                            <DisplayHeading size={32} className="mt-3">Aula virtual CoCo</DisplayHeading>
                            <p className="mt-3 max-w-2xl text-sm leading-6 font-medium cc-text-secondary">
                                Capacitaciones oficiales para convivencia, reglamento, seguridad y operación diaria del edificio.
                            </p>
                        </div>
                        <Button
                            onClick={() => {
                                setSelectedCourseContent("");
                                setSelectedCourseTitle("Modo libre con Tutora CoCo");
                            }}
                            className="w-full sm:w-auto"
                            trailingIcon={<Play className="h-4 w-4" />}
                        >
                            Abrir modo libre
                        </Button>
                    </div>

                    <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-3">
                        <Stat label="Cursos publicados" value={stats.total} icon={<BookOpen className="h-4 w-4" />} />
                        <Stat label="Con guion IA" value={stats.withLessons} icon={<GraduationCap className="h-4 w-4" />} />
                        <Stat label="Experiencias disponibles" value={stats.guided} icon={<ShieldCheck className="h-4 w-4" />} />
                    </div>
                </section>

                <ModuleFlow
                    title="De curso a aprendizaje guiado"
                    description="El residente elige un curso, entra a una clase con Tutora CoCo, conversa con alumnos virtuales y sale con criterios prácticos para convivir mejor."
                    steps={[
                        "Elegir tema",
                        "Abrir clase guiada",
                        "Resolver dudas con CoCo",
                        "Aplicar acuerdos en comunidad",
                    ]}
                    outcome="Cierre esperado: residente entiende el protocolo o reglamento y sabe qué acción corresponde tomar dentro de la plataforma."
                    currentStep={courses.length ? 2 : 1}
                    completedSteps={courses.length ? 1 : 0}
                    statusLabel={courses.length ? "Cursos activos" : "Modo libre"}
                    primaryActionLabel="Ver cursos"
                    primaryActionHref="#catalogo-cursos"
                    secondaryActionLabel="Abrir modo libre"
                    secondaryActionHref="#modo-libre"
                />

                {loading ? (
                    <div className="rounded-2xl border p-6 text-center text-sm cc-text-secondary sm:p-10" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                        Cargando cursos disponibles...
                    </div>
                ) : (
                    <section id="catalogo-cursos" className="grid scroll-mt-24 gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {courses.length === 0 ? (
                            <div className="rounded-2xl border border-dashed p-6 text-center sm:p-10 md:col-span-2 xl:col-span-3" style={{ borderColor: "var(--cc-line-strong)", background: "var(--cc-paper)" }}>
                                <AlertCircle className="mx-auto mb-3 h-10 w-10" style={{ color: "var(--cc-ink-faint)" }} />
                                <h2 className="text-lg font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>No hay cursos publicados</h2>
                                <p className="mx-auto mt-2 max-w-md text-sm cc-text-secondary">
                                    Cuando Administración publique un reglamento, circular o protocolo, aparecerá aquí como clase guiada.
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
                                    className="group relative cursor-pointer overflow-hidden rounded-2xl border p-5 transition-colors hover:border-[var(--cc-copper)]"
                                    style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}
                                >
                                    {user?.role === "admin" && (
                                        <button
                                            type="button"
                                            onClick={event => handleDeleteCourse(course.id, event)}
                                            className="absolute right-4 top-4 z-10 rounded-full border p-2 opacity-0 transition-opacity group-hover:opacity-100"
                                            style={{ borderColor: "var(--cc-rose-tint)", background: "var(--cc-rose-tint)", color: "var(--cc-rose)" }}
                                            title={deletingId === course.id ? "Confirmar eliminación" : "Eliminar curso"}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    )}

                                    <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-full" style={{ background: "var(--cc-copper-tint)", color: "var(--cc-copper)" }}>
                                        <BookOpen className="h-5 w-5" />
                                    </div>
                                    <h2 className="line-clamp-2 pr-8 text-lg font-semibold cc-text-primary sm:text-xl" style={{ fontFamily: "var(--cc-font-display)" }}>{course.title}</h2>
                                    <p className="mt-3 line-clamp-3 text-sm leading-6 cc-text-secondary">
                                        {course.description || "Inicia este curso interactivo con la Tutora CoCo."}
                                    </p>
                                    <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--cc-copper)" }}>
                                        Iniciar clase
                                        <Play className="h-4 w-4" />
                                    </div>
                                </article>
                            ))
                        )}

                        <article
                            id="modo-libre"
                            onClick={() => {
                                setSelectedCourseContent("");
                                setSelectedCourseTitle("Modo libre con Tutora CoCo");
                            }}
                            className="flex cursor-pointer flex-col justify-between rounded-2xl border border-dashed p-5 transition-colors hover:border-[var(--cc-copper)]"
                            style={{ borderColor: "var(--cc-line-strong)", background: "var(--cc-paper-warm)" }}
                        >
                            <div>
                                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-full text-white" style={{ background: "var(--cc-ink)" }}>
                                    <GraduationCap className="h-5 w-5" />
                                </div>
                                <h2 className="text-xl font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>Modo libre</h2>
                                <p className="mt-3 text-sm leading-6 cc-text-secondary">
                                    Pregunta por convivencia, reglamento, seguridad o administración sin depender de un manual cargado.
                                </p>
                            </div>
                            <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--cc-copper)" }}>
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
        <div className="rounded-xl border p-3 sm:p-4" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}>
            <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full cc-text-secondary sm:mb-3 sm:h-9 sm:w-9" style={{ background: "var(--cc-paper)" }}>
                {icon}
            </div>
            <p className="text-xl font-semibold cc-text-primary sm:text-2xl" style={{ fontFamily: "var(--cc-font-display)" }}>{value}</p>
            <p className="mt-1 text-[10px] font-semibold uppercase leading-tight tracking-[0.08em] cc-text-secondary sm:text-xs sm:tracking-[0.12em]">{label}</p>
        </div>
    );
}
