"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/cc/Button";
import type { TrainingRetentionResponse, TrainingRetentionReviewProps } from "@/lib/types";

export function TrainingRetentionReview({ attemptId, slides }: TrainingRetentionReviewProps) {
    const [review, setReview] = useState<TrainingRetentionResponse | null>(null);
    const [selection, setSelection] = useState<Record<string, number>>({});
    const [saving, setSaving] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const questions = useMemo(() => slides.filter(slide => slide.activity && slide.activity.type !== "checklist"), [slides]);

    useEffect(() => {
        let active = true;
        fetch(`/api/training/retention?attemptId=${encodeURIComponent(attemptId)}`)
            .then(async response => {
                const data = await response.json() as TrainingRetentionResponse;
                if (!response.ok) throw new Error(data.error || "No se pudo cargar el repaso.");
                if (active) setReview(data);
            })
            .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "No se pudo cargar el repaso."); });
        return () => { active = false; };
    }, [attemptId]);

    if (!questions.length) return null;

    const save = async (slideId: string) => {
        const answer = selection[slideId];
        if (answer === undefined || saving) return;
        setSaving(slideId);
        setError(null);
        try {
            const response = await fetch("/api/training/retention", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ attemptId, slideId, answer }),
            });
            const data = await response.json() as TrainingRetentionResponse;
            if (!response.ok || !data.check) throw new Error(data.error || "No se pudo guardar el repaso.");
            setReview(previous => previous ? { ...previous, checks: [...previous.checks, data.check!] } : previous);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "No se pudo guardar el repaso.");
        } finally {
            setSaving(null);
        }
    };

    const finished = Boolean(review && questions.every(slide => review.checks.some(check => check.slide_id === slide.id)));
    const correct = review?.checks.filter(check => check.is_correct).length || 0;
    return (
        <section className="mt-5 rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }} aria-labelledby="training-review-title">
            <div className="flex items-start gap-3"><CalendarClock className="mt-1 h-5 w-5" style={{ color: "var(--cc-copper)" }} /><div><h2 id="training-review-title" className="text-lg font-semibold cc-text-primary">Repaso diferido</h2><p className="mt-1 text-sm cc-text-secondary">Comprueba qué criterios recuerdas una semana después. Este repaso no cambia tu constancia.</p></div></div>
            {error && <p role="alert" className="mt-3 text-sm" style={{ color: "var(--cc-rose)" }}>{error}</p>}
            {!review && !error && <p className="mt-4 text-sm cc-text-secondary">Cargando repaso…</p>}
            {review && !review.eligible && <p className="mt-4 rounded-lg p-3 text-sm cc-text-secondary" style={{ background: "var(--cc-paper-warm)" }}>Disponible desde el {new Intl.DateTimeFormat("es-CL", { dateStyle: "long" }).format(new Date(review.eligible_at))}.</p>}
            {review?.eligible && finished && <p role="status" className="mt-4 rounded-lg p-3 text-sm font-semibold" style={{ background: "var(--cc-sage-tint)", color: "var(--cc-sage)" }}>Repaso registrado: {correct} de {questions.length} respuestas correctas.</p>}
            {review?.eligible && !finished && questions.filter(slide => !review.checks.some(check => check.slide_id === slide.id)).slice(0, 1).map(slide => (
                <div key={slide.id} className="mt-5 border-t pt-5" style={{ borderColor: "var(--cc-line)" }}>
                    <p className="text-xs font-semibold cc-text-tertiary">{slide.title}</p>
                    <fieldset className="mt-2"><legend className="text-base font-semibold cc-text-primary">{slide.activity?.prompt}</legend><div className="mt-3 space-y-2">{(slide.activity?.options || []).map((option, index) => <label key={option} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm cc-text-primary" style={{ borderColor: selection[slide.id] === index ? "var(--cc-copper)" : "var(--cc-line)" }}><input type="radio" className="mt-1" name={`review-${slide.id}`} checked={selection[slide.id] === index} onChange={() => setSelection(previous => ({ ...previous, [slide.id]: index }))} />{option}</label>)}</div></fieldset>
                    <Button type="button" variant="copper" className="mt-4" disabled={selection[slide.id] === undefined || Boolean(saving)} onClick={() => void save(slide.id)}>{saving === slide.id ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <CheckCircle2 className="h-4 w-4" />}Registrar respuesta</Button>
                </div>
            ))}
        </section>
    );
}
