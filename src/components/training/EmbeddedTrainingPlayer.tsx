"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Download, Loader2, RadioTower, ShieldCheck } from "lucide-react";
import type { EmbeddedTrainingPlayerProps, TrainingAttemptRecord, TrainingAttemptResponse, TrainingCompletionResult } from "@/lib/types";

export function EmbeddedTrainingPlayer({ course, onComplete }: EmbeddedTrainingPlayerProps) {
    const [attempt, setAttempt] = useState<TrainingAttemptRecord | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [validating, setValidating] = useState(false);

    useEffect(() => {
        let active = true;
        fetch("/api/training/attempts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "start", moduleId: course.id }),
        }).then(async response => {
            const data = await response.json() as TrainingAttemptResponse;
            if (!response.ok || !data.attempt) throw new Error(data.error || "No se pudo iniciar el curso externo.");
            if (active) setAttempt(data.attempt);
        }).catch(reason => active && setError(reason instanceof Error ? reason.message : "No se pudo iniciar el curso externo."));
        return () => { active = false; };
    }, [course.id]);

    const embedUrl = useMemo(() => {
        if (!course.embed_url || !attempt) return null;
        const url = new URL(course.embed_url);
        url.searchParams.set("coco_attempt_id", attempt.id);
        url.searchParams.set("coco_nonce", attempt.embed_nonce || "");
        url.searchParams.set("coco_completion_event", "convive-training-complete");
        return url.toString();
    }, [attempt, course.embed_url]);

    useEffect(() => {
        if (!attempt || attempt.status === "completed" || course.completion_mode !== "embed_post_message" || !course.embed_allowed_origin) return;
        const receiveCompletion = (event: MessageEvent<unknown>) => {
            if (event.origin !== course.embed_allowed_origin || !event.data || typeof event.data !== "object") return;
            const payload = event.data as Record<string, unknown>;
            if (payload.type !== "convive-training-complete" || payload.nonce !== attempt.embed_nonce) return;
            const eventId = typeof payload.eventId === "string" ? payload.eventId : "";
            const score = Number(payload.score);
            if (!eventId || !Number.isFinite(score)) return;
            setValidating(true);
            setError(null);
            fetch("/api/training/attempts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "embed_complete",
                    attemptId: attempt.id,
                    nonce: attempt.embed_nonce,
                    origin: event.origin,
                    eventId,
                    score,
                }),
            }).then(async response => {
                const data = await response.json() as TrainingAttemptResponse;
                if (!response.ok || !data.attempt || !data.certificate) throw new Error(data.error || "No se pudo validar la finalización.");
                setAttempt(data.attempt);
                onComplete?.({ attempt: data.attempt, certificate: data.certificate } satisfies TrainingCompletionResult);
            }).catch(reason => setError(reason instanceof Error ? reason.message : "No se pudo validar la finalización."))
                .finally(() => setValidating(false));
        };
        window.addEventListener("message", receiveCompletion);
        return () => window.removeEventListener("message", receiveCompletion);
    }, [attempt, course.completion_mode, course.embed_allowed_origin, onComplete]);

    const certificate = attempt?.certificate;
    return (
        <section className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
            <header className="flex flex-col justify-between gap-3 border-b p-5 sm:flex-row sm:items-center" style={{ borderColor: "var(--cc-line)" }}>
                <div>
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] cc-text-tertiary"><RadioTower className="h-4 w-4" />Curso externo conectado</div>
                    <h1 className="mt-1 text-2xl font-semibold cc-text-primary">{course.title}</h1>
                    <p className="mt-1 text-sm cc-text-secondary">{course.completion_mode === "embed_post_message" ? "CoCo valida automáticamente origen, sesión y puntaje." : "Este proveedor todavía usa validación manual de legado."}</p>
                </div>
                {attempt?.status === "completed" && certificate ? (
                    <a href={`/api/training/certificates/${certificate.id}`} className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-white" style={{ background: "var(--cc-copper)" }}><Download className="h-4 w-4" />Descargar constancia</a>
                ) : (
                    <span className="inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold cc-text-secondary" style={{ borderColor: "var(--cc-line)" }}>
                        {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                        {validating ? "Validando evidencia" : "Esperando finalización"}
                    </span>
                )}
            </header>
            {error && <div role="alert" className="flex items-center gap-2 border-b px-5 py-3 text-sm" style={{ borderColor: "var(--cc-rose)", background: "var(--cc-rose-tint)", color: "var(--cc-rose)" }}><AlertCircle className="h-4 w-4" />{error}</div>}
            {!attempt && !error ? <div className="flex h-[72vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin cc-text-tertiary" /></div> : embedUrl ? <iframe src={embedUrl} title={course.title} className="h-[72vh] w-full" sandbox="allow-forms allow-popups allow-presentation allow-same-origin allow-scripts" referrerPolicy="strict-origin-when-cross-origin" /> : null}
            {attempt?.status === "completed" && <div className="flex items-center gap-3 border-t px-5 py-4" style={{ borderColor: "var(--cc-line)", background: "var(--cc-sage-tint)" }}><CheckCircle2 className="h-5 w-5" style={{ color: "var(--cc-sage)" }} /><div><p className="text-sm font-semibold cc-text-primary">Curso validado y certificado</p><p className="text-xs cc-text-secondary">Resultado {Math.round(Number(attempt.score || 0))}% · evidencia guardada</p></div></div>}
        </section>
    );
}
