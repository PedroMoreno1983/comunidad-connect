"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, CalendarClock, CheckCircle2, Clock3, Loader2, ShieldCheck, UserRoundCheck, Users, X } from "lucide-react";
import { Button } from "@/components/cc/Button";
import { Eyebrow } from "@/components/cc/Eyebrow";
import { useToast } from "@/components/ui/Toast";
import type { TrainingAssignmentMutationResponse, TrainingComplianceDashboard, TrainingCompliancePanelProps } from "@/lib/types";

const COMPLIANCE_PAGE_TIME = Date.now();

export function TrainingCompliancePanel({ courses, onBack }: TrainingCompliancePanelProps) {
    const { toast } = useToast();
    const [dashboard, setDashboard] = useState<TrainingComplianceDashboard | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [courseId, setCourseId] = useState(courses[0]?.id || "");
    const [selectedStaff, setSelectedStaff] = useState<string[]>([]);
    const [dueDate, setDueDate] = useState("");
    const [mandatory, setMandatory] = useState(true);

    const loadDashboard = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch("/api/training/admin/dashboard");
            const data = await response.json() as TrainingComplianceDashboard & { error?: string };
            if (!response.ok) throw new Error(data.error || "No se pudo cargar el cumplimiento.");
            setDashboard(data);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "No se pudo cargar el cumplimiento.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void loadDashboard(); }, [loadDashboard]);
    const selectedCourse = courses.find(course => course.id === courseId);
    const eligibleStaff = useMemo(() => (dashboard?.staff || []).filter(member => !selectedCourse || selectedCourse.target_audience === "all" || selectedCourse.target_audience === member.role), [dashboard?.staff, selectedCourse]);

    useEffect(() => {
        const eligibleIds = new Set(eligibleStaff.map(member => member.id));
        setSelectedStaff(previous => previous.filter(id => eligibleIds.has(id)));
    }, [eligibleStaff]);

    const togglePerson = (id: string) => setSelectedStaff(previous => previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id]);
    const selectRole = (role: "admin" | "concierge") => setSelectedStaff(eligibleStaff.filter(member => member.role === role).map(member => member.id));

    const assign = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!courseId || selectedStaff.length === 0 || !dueDate) return;
        setSaving(true);
        try {
            const response = await fetch("/api/training/assignments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ moduleId: courseId, assigneeIds: selectedStaff, dueAt: new Date(`${dueDate}T23:59:59`).toISOString(), mandatory }),
            });
            const data = await response.json() as TrainingAssignmentMutationResponse;
            if (!response.ok) throw new Error(data.error || "No se pudo asignar el curso.");
            toast({ title: "Asignación guardada", description: `${data.assignments?.length || 0} personas recibieron el curso y su fecha límite.`, variant: "success" });
            setSelectedStaff([]);
            await loadDashboard();
        } catch (reason) {
            toast({ title: "No se pudo asignar", description: reason instanceof Error ? reason.message : undefined, variant: "destructive" });
        } finally {
            setSaving(false);
        }
    };

    const cancelAssignment = async (assignmentId: string) => {
        try {
            const response = await fetch("/api/training/assignments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assignmentId, status: "cancelled" }) });
            const data = await response.json() as { error?: string };
            if (!response.ok) throw new Error(data.error || "No se pudo cancelar.");
            await loadDashboard();
        } catch (reason) {
            toast({ title: "No se pudo cancelar", description: reason instanceof Error ? reason.message : undefined, variant: "destructive" });
        }
    };

    if (loading && !dashboard) return <div className="rounded-2xl border p-12 text-center" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}><Loader2 className="mx-auto h-7 w-7 animate-spin cc-text-tertiary" /><p className="mt-3 text-sm cc-text-secondary">Cargando cumplimiento…</p></div>;
    if (error && !dashboard) return <div className="rounded-2xl border p-8 text-center" style={{ borderColor: "var(--cc-rose)", background: "var(--cc-rose-tint)" }}><AlertCircle className="mx-auto h-7 w-7" style={{ color: "var(--cc-rose)" }} /><p className="mt-3 text-sm" style={{ color: "var(--cc-rose)" }}>{error}</p><Button type="button" variant="ghost" className="mt-4" onClick={() => void loadDashboard()}>Reintentar</Button></div>;
    if (!dashboard) return null;

    return (
        <div className="space-y-5">
            <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold cc-text-secondary" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}><ArrowLeft className="h-4 w-4" />Volver al catálogo</button>
            <section className="rounded-2xl border p-5 sm:p-7" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                <Eyebrow>Administración · cumplimiento</Eyebrow>
                <div className="mt-2 flex flex-col justify-between gap-3 lg:flex-row lg:items-end"><div><h1 className="text-3xl font-semibold cc-text-primary">Formación con responsables y evidencia</h1><p className="mt-2 max-w-3xl text-sm leading-6 cc-text-secondary">Asigna por persona o rol, controla plazos y revisa el resultado que respalda cada constancia.</p></div><span className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold" style={{ background: "var(--cc-sage-tint)", color: "var(--cc-sage)" }}><ShieldCheck className="h-4 w-4" />{dashboard.summary.completionRate}% al día</span></div>
                <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><SummaryCard icon={<Users />} value={dashboard.summary.assigned} label="asignaciones activas" /><SummaryCard icon={<CheckCircle2 />} value={dashboard.summary.completed} label="completadas" /><SummaryCard icon={<Clock3 />} value={dashboard.summary.inProgress} label="en progreso" /><SummaryCard icon={<CalendarClock />} value={dashboard.summary.overdue} label="vencidas" danger={dashboard.summary.overdue > 0} /></div>
            </section>

            <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
                <form onSubmit={assign} className="rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    <Eyebrow>Nueva asignación</Eyebrow><h2 className="mt-2 text-xl font-semibold cc-text-primary">Curso, personas y plazo</h2>
                    <label className="mt-5 block text-xs font-semibold cc-text-secondary"><span className="mb-1.5 block">Curso publicado</span><select required className="input-premium h-11 w-full" value={courseId} onChange={event => setCourseId(event.target.value)}>{courses.map(course => <option key={course.id} value={course.id}>{course.title} · v{course.version_number || 1}</option>)}</select></label>
                    <div className="mt-4 flex flex-wrap gap-2"><Button type="button" variant="ghost" size="sm" onClick={() => selectRole("concierge")}>Todo Conserjería</Button><Button type="button" variant="ghost" size="sm" onClick={() => selectRole("admin")}>Toda Administración</Button><Button type="button" variant="ghost" size="sm" onClick={() => setSelectedStaff(eligibleStaff.map(member => member.id))}>Toda la audiencia</Button></div>
                    <div className="mt-3 max-h-64 space-y-2 overflow-y-auto rounded-xl border p-2" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}>{eligibleStaff.map(member => { const checked = selectedStaff.includes(member.id); return <button type="button" key={member.id} onClick={() => togglePerson(member.id)} className="flex w-full items-center gap-3 rounded-lg border p-3 text-left" style={{ borderColor: checked ? "var(--cc-copper)" : "transparent", background: checked ? "var(--cc-copper-tint)" : "var(--cc-paper)" }}><span className="flex h-5 w-5 items-center justify-center rounded border" style={{ borderColor: checked ? "var(--cc-copper)" : "var(--cc-line-strong)", background: checked ? "var(--cc-copper)" : "transparent" }}>{checked && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}</span><span className="min-w-0"><span className="block truncate text-sm font-semibold cc-text-primary">{member.name}</span><span className="text-xs cc-text-secondary">{member.role === "admin" ? "Administración" : "Conserjería"}</span></span></button>; })}</div>
                    <label className="mt-4 block text-xs font-semibold cc-text-secondary"><span className="mb-1.5 block">Fecha límite</span><input required type="date" min={new Date().toISOString().slice(0, 10)} className="input-premium h-11 w-full" value={dueDate} onChange={event => setDueDate(event.target.value)} /></label>
                    <label className="mt-4 flex items-start gap-3 rounded-xl border p-3" style={{ borderColor: "var(--cc-line)" }}><input type="checkbox" className="mt-1" checked={mandatory} onChange={event => setMandatory(event.target.checked)} /><span><span className="block text-sm font-semibold cc-text-primary">Curso obligatorio</span><span className="text-xs cc-text-secondary">Se mostrará como pendiente hasta aprobarlo.</span></span></label>
                    <Button type="submit" variant="copper" block className="mt-5" disabled={saving || !courseId || !selectedStaff.length || !dueDate}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserRoundCheck className="h-4 w-4" />}Asignar y notificar</Button>
                </form>

                <section className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    <div className="border-b p-5" style={{ borderColor: "var(--cc-line)" }}><Eyebrow>Seguimiento</Eyebrow><h2 className="mt-2 text-xl font-semibold cc-text-primary">Cumplimiento por persona</h2></div>
                    {dashboard.assignments.length === 0 ? <div className="p-10 text-center"><Users className="mx-auto h-8 w-8 cc-text-tertiary" /><p className="mt-3 text-sm cc-text-secondary">Todavía no hay cursos asignados.</p></div> : <div className="max-h-[620px] divide-y overflow-y-auto" style={{ borderColor: "var(--cc-line)" }}>{dashboard.assignments.map(item => { const overdue = Boolean(item.status !== "completed" && item.due_at && new Date(item.due_at).getTime() < COMPLIANCE_PAGE_TIME); return <article key={item.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold cc-text-primary">{item.user?.name || "Persona"}</p><StatusPill status={overdue ? "overdue" : item.status} /></div><p className="mt-1 truncate text-xs cc-text-secondary">{item.module?.title} · v{item.module_version}</p><p className="mt-1 text-[11px] cc-text-tertiary">Plazo: {item.due_at ? new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" }).format(new Date(item.due_at)) : "sin fecha"}{item.latest_attempt?.score != null ? ` · Resultado ${Math.round(Number(item.latest_attempt.score))}%` : ""}</p></div><div className="flex items-center gap-2">{item.latest_attempt?.status === "completed" && item.latest_attempt.certificate ? <a href={`/api/training/certificates/${item.latest_attempt.certificate.id}`} className="inline-flex items-center justify-center rounded-lg border px-3 py-2 text-xs font-medium cc-text-primary" style={{ borderColor: "var(--cc-line-strong)" }}>Constancia</a> : null}{item.status !== "completed" && <button type="button" onClick={() => void cancelAssignment(item.id)} className="flex h-8 w-8 items-center justify-center rounded-lg border cc-text-tertiary" style={{ borderColor: "var(--cc-line)" }} aria-label="Cancelar asignación"><X className="h-4 w-4" /></button>}</div></article>; })}</div>}
                </section>
            </div>

            <section className="rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}><Eyebrow>Historial editorial</Eyebrow><h2 className="mt-2 text-xl font-semibold cc-text-primary">Versiones publicadas</h2><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{dashboard.versions.slice(0, 12).map(version => { const course = courses.find(item => item.id === version.module_id); return <article key={version.id} className="rounded-xl border p-4" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}><div className="flex items-center justify-between gap-3"><span className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ background: "var(--cc-copper-tint)", color: "var(--cc-copper)" }}>Versión {version.version_number}</span><span className="text-xs font-semibold" style={{ color: version.quality_score >= 80 ? "var(--cc-sage)" : "var(--cc-copper)" }}>{version.quality_score}/100</span></div><h3 className="mt-3 line-clamp-2 text-sm font-semibold cc-text-primary">{course?.title || "Curso archivado"}</h3><p className="mt-2 line-clamp-2 text-xs leading-5 cc-text-secondary">{version.change_summary}</p><p className="mt-3 text-[11px] cc-text-tertiary">{new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" }).format(new Date(version.created_at))}</p></article>; })}</div></section>
        </div>
    );
}

function SummaryCard({ icon, value, label, danger = false }: { icon: React.ReactNode; value: number; label: string; danger?: boolean }) {
    return <div className="rounded-xl border p-4" style={{ borderColor: danger ? "var(--cc-rose)" : "var(--cc-line)", background: danger ? "var(--cc-rose-tint)" : "var(--cc-paper-warm)" }}><span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: danger ? "var(--cc-rose-tint)" : "var(--cc-copper-tint)", color: danger ? "var(--cc-rose)" : "var(--cc-copper)" }}>{icon}</span><p className="mt-3 text-2xl font-semibold cc-text-primary">{value}</p><p className="text-xs font-semibold cc-text-secondary">{label}</p></div>;
}

function StatusPill({ status }: { status: "assigned" | "in_progress" | "completed" | "overdue" | "cancelled" }) {
    const label = status === "completed" ? "Completado" : status === "in_progress" ? "En progreso" : status === "overdue" ? "Vencido" : status === "cancelled" ? "Cancelado" : "Asignado";
    const background = status === "completed" ? "var(--cc-sage-tint)" : status === "overdue" ? "var(--cc-rose-tint)" : "var(--cc-copper-tint)";
    const color = status === "completed" ? "var(--cc-sage)" : status === "overdue" ? "var(--cc-rose)" : "var(--cc-copper)";
    return <span className="rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ background, color }}>{label}</span>;
}
