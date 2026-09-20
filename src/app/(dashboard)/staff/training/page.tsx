"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    AlertCircle,
    ArrowLeft,
    BarChart3,
    BookOpen,
    CheckCircle2,
    Clock3,
    GraduationCap,
    FilePenLine,
    Layers3,
    Play,
    Plus,
    ShieldCheck,
    Trash2,
    Users,
} from "lucide-react";
import { MultiAgentClassroom } from "@/components/training/MultiAgentClassroom";
import { EmbeddedTrainingPlayer } from "@/components/training/EmbeddedTrainingPlayer";
import { TrainingCourseBuilder } from "@/components/training/TrainingCourseBuilder";
import { TrainingCompliancePanel } from "@/components/training/TrainingCompliancePanel";
import { Button } from "@/components/cc/Button";
import { DisplayHeading, Eyebrow } from "@/components/cc/Eyebrow";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/authContext";
import { parseTrainingSlides, trainingActivityCount } from "@/lib/training/courseContent";
import type { TrainingAssignmentRecord, TrainingCompletionResult, TrainingModule, TrainingProgressRecord, TrainingViewMode } from "@/lib/types";

const TRAINING_PAGE_TIME = Date.now();

export default function StaffTrainingPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [courses, setCourses] = useState<TrainingModule[]>([]);
    const [progress, setProgress] = useState<Record<string, TrainingProgressRecord>>({});
    const [assignments, setAssignments] = useState<Record<string, TrainingAssignmentRecord>>({});
    const [selectedCourse, setSelectedCourse] = useState<TrainingModule | null>(null);
    const [viewMode, setViewMode] = useState<TrainingViewMode>("catalog");
    const [editingCourse, setEditingCourse] = useState<TrainingModule | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const stats = useMemo(() => ({
        total: courses.length,
        completed: Object.values(progress).filter(item => item.status === "completed").length,
        activities: courses.reduce((total, course) => total + trainingActivityCount(parseTrainingSlides(course.training_lessons?.[0]?.content)), 0),
    }), [courses, progress]);

    const saveProgress = useCallback(async (moduleId: string, status: "in_progress" | "completed", lastSlideIndex: number) => {
        const response = await fetch("/api/training/progress", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ moduleId, status, lastSlideIndex }),
        });
        const data = await response.json() as TrainingProgressRecord & { error?: string };
        if (!response.ok) throw new Error(data.error || "No se pudo guardar el progreso.");
        setProgress(previous => ({ ...previous, [moduleId]: data }));
        if (status === "completed") toast({ title: "Curso completado", description: "El avance quedó registrado en tu formación.", variant: "success" });
    }, [toast]);

    const selectedCourseId = selectedCourse?.id;
    const selectedCourseStatus = selectedCourseId ? progress[selectedCourseId]?.status : undefined;
    const handleSlideChange = useCallback((index: number) => {
        if (selectedCourseId && selectedCourseStatus !== "completed") {
            void saveProgress(selectedCourseId, "in_progress", index).catch(error => console.warn("Training progress save failed:", error));
        }
    }, [saveProgress, selectedCourseId, selectedCourseStatus]);
    const handleComplete = useCallback((result: TrainingCompletionResult) => {
        if (!selectedCourseId) return;
        const now = result.attempt.completed_at || new Date().toISOString();
        setProgress(previous => ({ ...previous, [selectedCourseId]: { module_id: selectedCourseId, status: "completed", last_slide_index: 10_000, completed_at: now, updated_at: now } }));
        toast({ title: "Curso aprobado", description: `Resultado ${Math.round(Number(result.attempt.score || 0))}% · constancia disponible.`, variant: "success" });
    }, [selectedCourseId, toast]);

    useEffect(() => {
        let active = true;
        Promise.all([fetch("/api/training/modules"), fetch("/api/training/progress"), fetch("/api/training/assignments")])
            .then(async ([modulesResponse, progressResponse, assignmentsResponse]) => {
                const modulesData = await modulesResponse.json() as TrainingModule[] | { error?: string };
                const progressData = await progressResponse.json() as TrainingProgressRecord[] | { error?: string };
                const assignmentsData = await assignmentsResponse.json() as TrainingAssignmentRecord[] | { error?: string };
                if (!modulesResponse.ok || !Array.isArray(modulesData)) throw new Error("No se pudieron cargar los cursos.");
                if (!progressResponse.ok || !Array.isArray(progressData)) throw new Error("No se pudo cargar tu progreso.");
                if (!assignmentsResponse.ok || !Array.isArray(assignmentsData)) throw new Error("No se pudieron cargar tus asignaciones.");
                if (!active) return;
                setCourses(modulesData);
                setProgress(Object.fromEntries(progressData.map(item => [item.module_id, item])));
                setAssignments(assignmentsData.reduce<Record<string, TrainingAssignmentRecord>>((result, item) => {
                    if (!result[item.module_id]) result[item.module_id] = item;
                    return result;
                }, {}));
            })
            .catch(error => active && setLoadError(error instanceof Error ? error.message : "No se pudo abrir el aula."))
            .finally(() => active && setLoading(false));
        return () => { active = false; };
    }, []);

    useEffect(() => {
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
        document.querySelector("main")?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }, [selectedCourse, viewMode]);

    const openCourse = (course: TrainingModule) => {
        setSelectedCourse(course);
        if (!progress[course.id]) void saveProgress(course.id, "in_progress", 0).catch(error => console.warn("Training start save failed:", error));
    };

    const deleteCourse = async (course: TrainingModule) => {
        if (deletingId !== course.id) return setDeletingId(course.id);
        setDeletingId(null);
        try {
            const response = await fetch(`/api/training/modules?id=${course.id}`, { method: "DELETE" });
            const data = await response.json() as { error?: string };
            if (!response.ok) throw new Error(data.error || "No se pudo eliminar el curso.");
            setCourses(previous => previous.filter(item => item.id !== course.id));
            toast({ title: "Curso eliminado", variant: "success" });
        } catch (error) {
            toast({ title: "No se pudo eliminar", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
        }
    };

    if (user && !["admin", "concierge"].includes(user.role)) {
        return <RestrictedState />;
    }

    if (selectedCourse) {
        const lesson = selectedCourse.training_lessons?.[0];
        const saved = progress[selectedCourse.id];
        return (
            <ErrorBoundary name="Staff Training Course">
                <div className="mx-auto max-w-[1600px] space-y-4 px-0 py-2 sm:p-6">
                    <button type="button" onClick={() => setSelectedCourse(null)} className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold cc-text-secondary" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}><ArrowLeft className="h-4 w-4" />Volver al catálogo</button>
                    {selectedCourse.embed_url ? (
                        <EmbeddedTrainingPlayer course={selectedCourse} onComplete={handleComplete} />
                    ) : (
                        <MultiAgentClassroom
                            moduleId={selectedCourse.id}
                            moduleVersion={selectedCourse.version_number || 1}
                            courseContent={lesson?.content}
                            courseTitle={selectedCourse.title}
                            learningObjectives={selectedCourse.learning_objectives || []}
                            estimatedMinutes={selectedCourse.estimated_minutes || 20}
                            initialSlideIndex={saved?.last_slide_index || 0}
                            onSlideChange={handleSlideChange}
                            onComplete={handleComplete}
                        />
                    )}
                </div>
            </ErrorBoundary>
        );
    }

    return (
        <ErrorBoundary name="Staff Training Catalog">
            <div className="mx-auto max-w-7xl space-y-5 px-0 py-2 sm:p-6">
                {(viewMode === "create" || viewMode === "edit") && user?.role === "admin" ? (
                    <TrainingCourseBuilder
                        key={editingCourse?.id || "new-course"}
                        initialCourse={editingCourse}
                        onCancel={() => { setEditingCourse(null); setViewMode("catalog"); }}
                        onPublished={course => { setCourses(previous => { const exists = previous.some(item => item.id === course.id); return exists ? previous.map(item => item.id === course.id ? course : item) : [course, ...previous]; }); setEditingCourse(null); setViewMode("catalog"); }}
                    />
                ) : viewMode === "compliance" && user?.role === "admin" ? (
                    <TrainingCompliancePanel courses={courses} onBack={() => setViewMode("catalog")} />
                ) : (
                    <>
                        <section className="rounded-2xl border p-5 sm:p-7" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                            <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
                                <div><Eyebrow>Formación operativa</Eyebrow><DisplayHeading size={32} className="mt-2">Cursos para administrar y operar mejor</DisplayHeading><p className="mt-2 max-w-2xl text-sm leading-6 cc-text-secondary">Protocolos breves, escenarios reales y comprobaciones prácticas para Administración y Conserjería.</p></div>
                                {user?.role === "admin" && <div className="flex flex-wrap gap-2"><Button type="button" variant="ghost" onClick={() => setViewMode("compliance")}><BarChart3 className="h-4 w-4" />Cumplimiento</Button><Button type="button" variant="copper" onClick={() => { setEditingCourse(null); setViewMode("create"); }}><Plus className="h-4 w-4" />Crear curso</Button></div>}
                            </div>
                            <div className="mt-5 flex flex-wrap gap-2"><Metric icon={<BookOpen className="h-4 w-4" />} value={stats.total} label="cursos disponibles" /><Metric icon={<Layers3 className="h-4 w-4" />} value={stats.activities} label="actividades prácticas" /><Metric icon={<GraduationCap className="h-4 w-4" />} value={stats.completed} label="completados" /></div>
                        </section>

                        <section aria-labelledby="training-catalog-title">
                            <div className="mb-4 flex items-end justify-between gap-4"><div><Eyebrow>Catálogo</Eyebrow><h2 id="training-catalog-title" className="mt-1 text-2xl font-semibold cc-text-primary">Formación disponible</h2></div><span className="hidden items-center gap-1.5 text-xs font-semibold cc-text-secondary sm:inline-flex"><Users className="h-4 w-4" />Contenido según tu rol</span></div>
                            {loading ? <LoadingState /> : loadError ? <ErrorState message={loadError} /> : courses.length === 0 ? <EmptyState /> : (
                                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                    {courses.map(course => <CourseCard key={course.id} course={course} record={progress[course.id]} assignment={assignments[course.id]} role={user?.role} deleting={deletingId === course.id} onOpen={() => openCourse(course)} onEdit={() => { setEditingCourse(course); setViewMode("edit"); }} onDelete={() => void deleteCourse(course)} />)}
                                </div>
                            )}
                        </section>
                    </>
                )}
            </div>
        </ErrorBoundary>
    );
}

function Metric({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
    return <div className="inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold cc-text-secondary" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}><span style={{ color: "var(--cc-copper)" }}>{icon}</span><strong className="cc-text-primary">{value}</strong>{label}</div>;
}

function CourseCard({ course, record, assignment, role, deleting, onOpen, onEdit, onDelete }: { course: TrainingModule; record?: TrainingProgressRecord; assignment?: TrainingAssignmentRecord; role?: string; deleting: boolean; onOpen: () => void; onEdit: () => void; onDelete: () => void }) {
    const slides = parseTrainingSlides(course.training_lessons?.[0]?.content);
    const activities = trainingActivityCount(slides);
    const percent = record?.status === "completed" ? 100 : slides.length > 1 ? Math.round(((record?.last_slide_index || 0) / (slides.length - 1)) * 100) : 0;
    const audience = course.target_audience === "admin" ? "Administración" : course.target_audience === "concierge" ? "Conserjería" : "Ambos roles";
    const canDelete = role === "admin" && Boolean(course.community_id);
    const assignmentOverdue = Boolean(assignment?.due_at && new Date(assignment.due_at).getTime() < TRAINING_PAGE_TIME);
    return (
        <article className="group flex min-h-72 flex-col rounded-2xl border p-5 transition-colors hover:border-[var(--cc-copper)]" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
            <div className="flex items-start justify-between gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "var(--cc-copper-tint)", color: "var(--cc-copper)" }}><BookOpen className="h-5 w-5" /></span><div className="flex items-center gap-2">{!course.community_id && <span className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ background: "var(--cc-sage-tint)", color: "var(--cc-sage)" }}>Oficial</span>}{role === "admin" && <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold cc-text-secondary" style={{ borderColor: "var(--cc-line)" }} aria-label={course.community_id ? `Editar ${course.title}` : `Personalizar ${course.title}`}><FilePenLine className="h-3.5 w-3.5" />{course.community_id ? "Editar" : "Adaptar"}</button>}{canDelete && <button type="button" onClick={onDelete} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold" style={{ borderColor: deleting ? "var(--cc-rose)" : "var(--cc-line)", color: "var(--cc-rose)" }} aria-label={deleting ? `Confirmar archivo de ${course.title}` : `Archivar ${course.title}`}><Trash2 className="h-3.5 w-3.5" />{deleting ? "Confirmar" : ""}</button>}</div></div>
            <h3 className="mt-4 text-xl font-semibold leading-6 cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>{course.title}</h3>
            <p className="mt-2 line-clamp-3 text-sm leading-6 cc-text-secondary">{course.description}</p>
            {assignment && assignment.status !== "completed" && <div className="mt-3 rounded-lg border px-3 py-2 text-xs font-semibold" style={{ borderColor: assignmentOverdue ? "var(--cc-rose)" : "var(--cc-copper)", background: assignmentOverdue ? "var(--cc-rose-tint)" : "var(--cc-copper-tint)", color: assignmentOverdue ? "var(--cc-rose)" : "var(--cc-copper)" }}>{assignment.mandatory ? "Obligatorio" : "Recomendado"}{assignment.due_at ? ` · vence ${new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" }).format(new Date(assignment.due_at))}` : ""}</div>}
            <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold cc-text-tertiary"><span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{course.estimated_minutes || 20} min</span><span>{audience}</span>{!course.embed_url && <span>{activities} actividades</span>}<span>v{course.version_number || 1}</span><span style={{ color: Number(course.quality_score || 0) >= 80 ? "var(--cc-sage)" : undefined }}>{course.quality_score || 0}/100</span></div>
            <div className="mt-auto pt-5">{record && <div className="mb-3"><div className="mb-1.5 flex justify-between text-[11px] font-semibold cc-text-secondary"><span>{record.status === "completed" ? "Completado" : "En progreso"}</span><span>{percent}%</span></div><div className="h-1.5 overflow-hidden rounded-full" style={{ background: "var(--cc-line)" }}><div className="h-full rounded-full" style={{ width: `${percent}%`, background: record.status === "completed" ? "var(--cc-sage)" : "var(--cc-copper)" }} /></div></div>}<Button type="button" variant={record?.status === "completed" ? "ghost" : "copper"} block onClick={onOpen}>{record?.status === "completed" ? <CheckCircle2 className="h-4 w-4" /> : <Play className="h-4 w-4" />}{record?.status === "completed" ? "Revisar curso" : record ? "Continuar curso" : "Comenzar curso"}</Button></div>
        </article>
    );
}

function RestrictedState() {
    return <div className="mx-auto max-w-2xl rounded-2xl border p-8 text-center" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}><ShieldCheck className="mx-auto h-10 w-10 cc-text-tertiary" /><h1 className="mt-3 text-2xl font-semibold cc-text-primary">Aula reservada al equipo operativo</h1><p className="mt-2 text-sm cc-text-secondary">La formación está disponible exclusivamente para Administración y Conserjería.</p></div>;
}

function LoadingState() {
    return <div className="rounded-2xl border p-10 text-center text-sm cc-text-secondary" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>Cargando formación disponible…</div>;
}

function ErrorState({ message }: { message: string }) {
    return <div className="rounded-2xl border p-8 text-center" style={{ borderColor: "var(--cc-rose)", background: "var(--cc-rose-tint)" }}><AlertCircle className="mx-auto h-8 w-8" style={{ color: "var(--cc-rose)" }} /><p className="mt-3 text-sm font-semibold" style={{ color: "var(--cc-rose)" }}>{message}</p></div>;
}

function EmptyState() {
    return <div className="rounded-2xl border border-dashed p-10 text-center" style={{ borderColor: "var(--cc-line-strong)", background: "var(--cc-paper)" }}><BookOpen className="mx-auto h-9 w-9 cc-text-tertiary" /><h3 className="mt-3 text-lg font-semibold cc-text-primary">No hay cursos para tu rol</h3><p className="mt-1 text-sm cc-text-secondary">Administración puede crear el primero desde esta misma aula.</p></div>;
}
