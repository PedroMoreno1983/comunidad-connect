"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
    ArrowLeft,
    ArrowRight,
    Check,
    CheckCircle2,
    Circle,
    Clapperboard,
    Clock3,
    Download,
    GraduationCap,
    HelpCircle,
    Info,
    ListChecks,
    Loader2,
    MessageCircleQuestion,
    RotateCcw,
    Send,
    ShieldCheck,
    Sparkles,
    Star,
    ThumbsDown,
    ThumbsUp,
    UserRound,
    X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/cc/Button";
import { TrainingRetentionReview } from "@/components/training/TrainingRetentionReview";
import { parseTrainingSlides, visibleSlideBullets } from "@/lib/training/courseContent";
import { slideTopic, splitComparison, splitLabeled, topicImage, type TrainingTopic } from "@/lib/training/slideVisual";
import type { TrainingAttemptRecord, TrainingAttemptResponse, TrainingChatMessage, TrainingClassroomProps, TrainingSlide } from "@/lib/types";

const themeStyles: Record<TrainingSlide["visual_theme"], { accent: string; soft: string; label: string }> = {
    copper: { accent: "var(--cc-copper)", soft: "var(--cc-copper-tint)", label: "Aplicación" },
    sage: { accent: "var(--cc-sage)", soft: "var(--cc-sage-tint)", label: "Procedimiento" },
    ink: { accent: "var(--cc-ink)", soft: "var(--cc-paper-warm)", label: "Fundamento" },
    amber: { accent: "#9a5b16", soft: "#fff4df", label: "Decisión" },
};

export function MultiAgentClassroom({
    moduleId,
    moduleVersion,
    courseContent,
    courseTitle = "Curso operativo",
    learningObjectives = [],
    estimatedMinutes = 20,
    initialSlideIndex = 0,
    onSlideChange,
    onComplete,
}: TrainingClassroomProps) {
    const slides = useMemo(() => parseTrainingSlides(courseContent), [courseContent]);
    const safeInitialIndex = slides.length ? Math.min(Math.max(initialSlideIndex, 0), slides.length - 1) : 0;
    const [currentIndex, setCurrentIndex] = useState(safeInitialIndex);
    const [maxVisited, setMaxVisited] = useState(safeInitialIndex);
    const [answers, setAnswers] = useState<Record<string, number>>({});
    const [checklists, setChecklists] = useState<Record<string, string[]>>({});
    const [completedActivities, setCompletedActivities] = useState<Record<string, boolean>>({});
    const [feedback, setFeedback] = useState<Record<string, string>>({});
    // Sin mensajes automáticos: el panel muestra solo las preguntas y sus respuestas.
    const [messages, setMessages] = useState<TrainingChatMessage[]>([]);
    const [helpOpen, setHelpOpen] = useState(false);
    const [question, setQuestion] = useState("");
    const [isTyping, setIsTyping] = useState(false);
    const [completed, setCompleted] = useState(false);
    const [attempt, setAttempt] = useState<TrainingAttemptRecord | null>(null);
    const [attemptError, setAttemptError] = useState<string | null>(null);
    const [savingActivity, setSavingActivity] = useState(false);
    const [finishing, setFinishing] = useState(false);
    const messagesRef = useRef<HTMLDivElement>(null);
    const openedCourse = useRef<string | null>(null);
    const seenSlideId = useRef<string | null>(slides[safeInitialIndex]?.id ?? null);

    useEffect(() => {
        // Guardar el avance actualiza last_slide_index y el padre vuelve a pasar
        // initialSlideIndex. Eso no es un curso nuevo: reiniciar aquí borraba la
        // conversación y las respuestas que todavía no habían vuelto del servidor.
        const courseKey = `${moduleId}:${moduleVersion}:${String(courseContent ?? "")}`;
        if (openedCourse.current === courseKey) return;
        openedCourse.current = courseKey;
        const start = slides.length ? Math.min(Math.max(initialSlideIndex, 0), slides.length - 1) : 0;
        const resumedActivities = Object.fromEntries(
            slides
                .slice(0, start)
                .filter(slide => slide.activity)
                .map(slide => [slide.id, true]),
        );
        setCurrentIndex(start);
        setMaxVisited(start);
        setAnswers({});
        setChecklists({});
        setCompletedActivities(resumedActivities);
        setFeedback({});
        setCompleted(false);
        seenSlideId.current = slides[start]?.id ?? null;
        setMessages([]);
    }, [courseContent, initialSlideIndex, moduleId, moduleVersion, slides]);

    useEffect(() => {
        let active = true;
        setAttempt(null);
        setAttemptError(null);
        fetch("/api/training/attempts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "start", moduleId }),
        }).then(async response => {
            const data = await response.json() as TrainingAttemptResponse;
            if (!response.ok || !data.attempt) throw new Error(data.error || "No se pudo iniciar el intento.");
            if (!active) return;
            const loaded = data.attempt;
            const latestBySlide = new Map<string, NonNullable<TrainingAttemptRecord["responses"]>[number]>();
            for (const item of loaded.responses || []) {
                const previous = latestBySlide.get(item.slide_id);
                if (!previous || item.response_number > previous.response_number) latestBySlide.set(item.slide_id, item);
            }
            const loadedAnswers: Record<string, number> = {};
            const loadedChecklists: Record<string, string[]> = {};
            const loadedCompleted: Record<string, boolean> = {};
            for (const slide of slides) {
                const saved = latestBySlide.get(slide.id);
                if (typeof saved?.answer === "number") loadedAnswers[slide.id] = saved.answer;
                if (Array.isArray(saved?.answer)) loadedChecklists[slide.id] = saved.answer.filter(value => typeof value === "string");
                loadedCompleted[slide.id] = loaded.status === "completed" || Boolean(saved?.is_correct);
            }
            setAttempt(loaded);
            setAnswers(loadedAnswers);
            setChecklists(loadedChecklists);
            setCompletedActivities(loadedCompleted);
            setCompleted(loaded.status === "completed");
            if (loaded.status === "completed") {
                setCurrentIndex(slides.length - 1);
                setMaxVisited(slides.length - 1);
            }
        }).catch(error => active && setAttemptError(error instanceof Error ? error.message : "No se pudo iniciar el intento."));
        return () => { active = false; };
    }, [moduleId, moduleVersion, slides]);

    useEffect(() => {
        if (slides.length) onSlideChange?.(currentIndex);
    }, [currentIndex, onSlideChange, slides.length]);

    useEffect(() => {
        messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    }, [messages, isTyping]);

    const current = slides[currentIndex];

    useEffect(() => {
        if (current) seenSlideId.current = current.id;
        if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    }, [current]);

    const activityIds = slides.filter(slide => slide.activity).map(slide => slide.id);
    const allActivitiesComplete = activityIds.every(id => completedActivities[id]);
    const currentActivityComplete = !current?.activity || completedActivities[current.id];
    const coursePercent = completed
        ? 100
        : slides.length > 1
            ? Math.min(95, Math.round((currentIndex / (slides.length - 1)) * 100))
            : 0;

    const goTo = (nextIndex: number) => {
        if (!slides.length || nextIndex < 0 || nextIndex >= slides.length) return;
        if (nextIndex > currentIndex && !currentActivityComplete) {
            setFeedback(previous => ({ ...previous, [current.id]: "Completa la actividad para avanzar." }));
            return;
        }
        if (nextIndex > maxVisited + 1) return;
        setCurrentIndex(nextIndex);
        setMaxVisited(previous => Math.max(previous, nextIndex));
    };

    const saveActivityAnswer = async (answer: number | string[]) => {
        if (!attempt || !current?.activity || savingActivity) return;
        setSavingActivity(true);
        setAttemptError(null);
        try {
            const response = await fetch("/api/training/attempts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "answer", attemptId: attempt.id, slideId: current.id, answer }),
            });
            const data = await response.json() as TrainingAttemptResponse;
            if (!response.ok || !data.response) throw new Error(data.error || "No se pudo guardar la respuesta.");
            setCompletedActivities(previous => ({ ...previous, [current.id]: data.response?.is_correct || false }));
            setFeedback(previous => ({ ...previous, [current.id]: data.feedback || "Respuesta registrada." }));
            setAttempt(previous => previous ? { ...previous, responses: [...(previous.responses || []), data.response!] } : previous);
        } catch (error) {
            setAttemptError(error instanceof Error ? error.message : "No se pudo guardar la respuesta.");
        } finally {
            setSavingActivity(false);
        }
    };

    const checkAnswer = () => {
        if (!current?.activity || current.activity.type === "checklist") return;
        const selected = answers[current.id];
        if (selected === undefined) {
            setFeedback(previous => ({ ...previous, [current.id]: "Selecciona una respuesta antes de comprobar." }));
            return;
        }
        void saveActivityAnswer(selected);
    };

    const toggleChecklistItem = (item: string) => {
        if (!current?.activity || current.activity.type !== "checklist") return;
        const selected = checklists[current.id] || [];
        const next = selected.includes(item) ? selected.filter(value => value !== item) : [...selected, item];
        setChecklists(previous => ({ ...previous, [current.id]: next }));
        setCompletedActivities(previous => ({ ...previous, [current.id]: false }));
        setFeedback(previous => ({ ...previous, [current.id]: "Marca todas las acciones y valida la lista para continuar." }));
    };

    const completeCourse = async () => {
        if (!attempt || !allActivitiesComplete || currentIndex !== slides.length - 1 || finishing) return;
        setFinishing(true);
        setAttemptError(null);
        try {
            const response = await fetch("/api/training/attempts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "complete", attemptId: attempt.id }),
            });
            const data = await response.json() as TrainingAttemptResponse;
            if (!response.ok || !data.attempt || !data.certificate) throw new Error(data.error || "No se pudo certificar el curso.");
            setAttempt({ ...data.attempt, certificate: data.certificate });
            setCompleted(true);
            onComplete?.({ attempt: data.attempt, certificate: data.certificate });
        } catch (error) {
            setAttemptError(error instanceof Error ? error.message : "No se pudo certificar el curso.");
        } finally {
            setFinishing(false);
        }
    };

    const sendQuestion = async (suggestedQuestion?: string) => {
        const text = (suggestedQuestion || question).trim();
        if (!text || isTyping) return;
        const userMessage: TrainingChatMessage = { id: `user-${Date.now()}`, role: "user", text };
        const history = [...messages, userMessage];
        setMessages(history);
        setQuestion("");
        setIsTyping(true);
        try {
            const response = await fetch("/api/training/multi-agent", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: text,
                    history,
                    moduleId,
                    currentSlideId: current?.id,
                }),
            });
            const data = await response.json() as { responses?: TrainingChatMessage[]; error?: string };
            if (!response.ok) throw new Error(data.error || "No se pudo consultar a CoCo.");
            const responses = Array.isArray(data.responses) ? data.responses : [];
            setMessages(previous => [...previous, ...responses]);
        } catch (error) {
            setMessages(previous => [...previous, {
                id: `error-${Date.now()}`,
                role: "system",
                text: error instanceof Error ? error.message : "CoCo no pudo responder en este momento.",
            }]);
        } finally {
            setIsTyping(false);
        }
    };

    if (!current) {
        return (
            <div className="rounded-2xl border p-8 text-center" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                <HelpCircle className="mx-auto h-9 w-9 cc-text-tertiary" />
                <h2 className="mt-3 text-xl font-semibold cc-text-primary">Este curso necesita una actualización</h2>
                <p className="mx-auto mt-2 max-w-lg text-sm leading-6 cc-text-secondary">El contenido no tiene todavía el formato interactivo de CoCo. Administración debe volver a diseñarlo antes de impartirlo.</p>
            </div>
        );
    }

    const theme = themeStyles[current.visual_theme];
    const isLast = currentIndex === slides.length - 1;

    return (
        <div className="relative">
            <header className="sticky top-0 z-20 rounded-2xl border px-4 py-3 backdrop-blur sm:px-6" style={{ borderColor: "var(--cc-line)", background: "color-mix(in srgb, var(--cc-paper) 92%, transparent)" }}>
                <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] cc-text-tertiary">
                            <GraduationCap className="h-3.5 w-3.5" /> Aula virtual
                            <span aria-hidden>·</span>
                            <Clock3 className="h-3.5 w-3.5" /> {estimatedMinutes} min
                        </p>
                        <h1 className="mt-0.5 truncate text-base font-semibold cc-text-primary sm:text-lg">{courseTitle}</h1>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                        <span className="hidden text-sm font-semibold tabular-nums cc-text-secondary sm:inline">{completed ? "100%" : `${coursePercent}%`}</span>
                        <button type="button" onClick={() => setHelpOpen(true)} className="inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium cc-text-primary transition-colors hover:bg-[var(--cc-paper-warm)]" style={{ borderColor: "var(--cc-line)" }}>
                            <Sparkles className="h-4 w-4" style={{ color: "var(--cc-copper)" }} />
                            <span className="hidden sm:inline">Preguntar a CoCo</span>
                        </button>
                    </div>
                </div>
                <nav aria-label="Secciones del curso" className="mt-3 flex gap-1.5">
                    {slides.map((slide, index) => {
                        const done = completed || index < currentIndex || (index <= maxVisited && index !== currentIndex);
                        const active = index === currentIndex;
                        const locked = index > maxVisited + 1 || (index > currentIndex && !currentActivityComplete);
                        return (
                            <button
                                key={slide.id}
                                type="button"
                                onClick={() => goTo(index)}
                                disabled={locked}
                                title={`${index + 1}. ${slide.title}`}
                                aria-label={`Sección ${index + 1}: ${slide.title}`}
                                aria-current={active ? "step" : undefined}
                                className="h-1.5 flex-1 rounded-full transition-all disabled:cursor-not-allowed"
                                style={{ background: active ? "var(--cc-copper)" : done ? "var(--cc-sage)" : "var(--cc-line)", transform: active ? "scaleY(1.6)" : undefined }}
                            />
                        );
                    })}
                </nav>
            </header>

            {attemptError && <div role="alert" className="mt-3 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "var(--cc-rose)", background: "var(--cc-rose-tint)", color: "var(--cc-rose)" }}>{attemptError}</div>}

            <main className="mx-auto mt-6 max-w-4xl pb-10">
                <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: theme.accent }}>
                    Sección {currentIndex + 1} de {slides.length}
                </p>

                <SlideCanvas slide={current} accent={theme.accent} soft={theme.soft} />

                {current.activity && (
                    <ActivityCard
                        slide={current}
                        selectedAnswer={answers[current.id]}
                        checkedItems={checklists[current.id] || []}
                        isComplete={Boolean(completedActivities[current.id])}
                        feedback={feedback[current.id]}
                        busy={savingActivity || !attempt}
                        onSelectAnswer={index => {
                            setAnswers(previous => ({ ...previous, [current.id]: index }));
                            setCompletedActivities(previous => ({ ...previous, [current.id]: false }));
                            setFeedback(previous => ({ ...previous, [current.id]: "" }));
                        }}
                        onCheckAnswer={checkAnswer}
                        onToggleChecklist={toggleChecklistItem}
                        onValidateChecklist={() => void saveActivityAnswer(checklists[current.id] || [])}
                        onAskForHelp={() => {
                            setHelpOpen(true);
                            void sendQuestion(`Necesito una pista para aplicar el criterio de «${current.title}» después de mi respuesta. Ayúdame a razonar sin revelar la opción correcta.`);
                        }}
                    />
                )}

                <div className="mt-8 flex flex-col-reverse items-stretch justify-between gap-3 sm:flex-row sm:items-center">
                    <Button type="button" variant="ghost" disabled={currentIndex === 0} onClick={() => goTo(currentIndex - 1)}><ArrowLeft className="h-4 w-4" />Anterior</Button>
                    {!isLast ? (
                        <div className="flex flex-col items-stretch gap-1 sm:items-end">
                            <Button type="button" variant="copper" size="lg" disabled={!currentActivityComplete} onClick={() => goTo(currentIndex + 1)}>
                                Siguiente: {slides[currentIndex + 1].title}<ArrowRight className="h-4 w-4" />
                            </Button>
                            {!currentActivityComplete && <span className="text-xs cc-text-tertiary">Responde la actividad para seguir.</span>}
                        </div>
                    ) : completed && attempt?.certificate ? (
                        <a href={`/api/training/certificates/${attempt.certificate.id}`} className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-medium text-white" style={{ background: "var(--cc-copper)" }}><Download className="h-4 w-4" />Descargar constancia</a>
                    ) : (
                        <Button type="button" variant="copper" size="lg" disabled={!allActivitiesComplete || !attempt || finishing} onClick={() => void completeCourse()}>
                            {finishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                            {finishing ? "Certificando" : "Completar y certificar"}
                        </Button>
                    )}
                </div>

                {isLast && learningObjectives.length > 0 && (
                    <section className="mt-10 rounded-2xl border p-6" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] cc-text-tertiary">Con este curso puedes</p>
                        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                            {learningObjectives.slice(0, 4).map(objective => <li key={objective} className="flex gap-2 text-sm leading-6 cc-text-secondary"><Check className="mt-1 h-4 w-4 shrink-0" style={{ color: "var(--cc-sage)" }} />{objective}</li>)}
                        </ul>
                    </section>
                )}
                {completed && attempt && <TrainingRetentionReview attemptId={attempt.id} slides={slides} />}
            </main>

            {helpOpen && (
                <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Preguntar a CoCo">
                    <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-black/30" onClick={() => setHelpOpen(false)} />
                    <aside className="relative flex h-full w-full max-w-md flex-col shadow-xl" style={{ background: "var(--cc-paper)" }}>
                        <div className="flex items-center justify-between border-b p-4" style={{ borderColor: "var(--cc-line)" }}>
                            <div className="flex items-center gap-3">
                                <span className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--cc-paper)]" style={{ background: "var(--cc-ink)" }}><Sparkles className="h-4 w-4" /></span>
                                <div><p className="text-sm font-semibold cc-text-primary">Preguntar a CoCo</p><p className="text-xs cc-text-secondary">Sobre «{current.title}»</p></div>
                            </div>
                            <button type="button" onClick={() => setHelpOpen(false)} className="rounded-full p-2 cc-text-secondary hover:bg-[var(--cc-paper-warm)]" aria-label="Cerrar panel"><X className="h-4 w-4" /></button>
                        </div>
                        <button type="button" disabled={isTyping} onClick={() => void sendQuestion(`Practiquemos la sección «${current.title}». Plantea un caso breve de mi trabajo y ayúdame a decidir qué hacer según el curso.`)} className="mx-4 mt-3 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50" style={{ borderColor: "var(--cc-copper)", color: "var(--cc-copper)" }}>Practicar esta sección con CoCo</button>
                        <div ref={messagesRef} role="log" aria-label="Conversación con CoCo" aria-live="polite" aria-relevant="additions" className="flex-1 space-y-3 overflow-y-auto p-4">
                            {!messages.length && (
                                <div className="mt-6 text-center">
                                    <MessageCircleQuestion className="mx-auto h-8 w-8 cc-text-tertiary" />
                                    <p className="mt-3 text-sm font-medium cc-text-primary">¿Algo no te calza con tu edificio?</p>
                                    <p className="mt-1 text-xs leading-5 cc-text-secondary">Pregunta cómo aplicar esta sección en tu turno. CoCo responde con el contenido del curso.</p>
                                </div>
                            )}
                            {messages.map(message => (
                                message.role === "system" ? (
                                    <p key={message.id} className="px-1 text-center text-xs leading-5 cc-text-secondary">{message.text}</p>
                                ) : (
                                    <div key={message.id} className={`rounded-xl px-3 py-2.5 text-sm leading-6 ${message.role === "user" ? "ml-8 text-white" : "mr-4"}`} style={{ background: message.role === "user" ? "var(--cc-ink)" : "var(--cc-paper-warm)", border: message.role === "user" ? undefined : "1px solid var(--cc-line)" }}>
                                        {message.role !== "user" && <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] cc-text-tertiary">{message.role === "tutor" ? "Orientación" : "Punto de práctica"}</p>}
                                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ p: ({ children }) => <p>{children}</p>, ul: ({ children }) => <ul className="list-disc pl-4">{children}</ul>, ol: ({ children }) => <ol className="list-decimal pl-4">{children}</ol> }}>{message.text}</ReactMarkdown>
                                    </div>
                                )
                            ))}
                            {isTyping && <div className="mr-4 flex items-center gap-2 rounded-xl border px-3 py-3 text-xs cc-text-secondary" style={{ borderColor: "var(--cc-line)" }}><Loader2 className="h-3.5 w-3.5 animate-spin" />CoCo está pensando…</div>}
                        </div>
                        <div className="border-t p-4" style={{ borderColor: "var(--cc-line)" }}>
                            <div className="flex gap-2">
                                <textarea id="training-question" rows={2} value={question} onChange={event => setQuestion(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendQuestion(); } }} className="input-premium min-h-16 flex-1 resize-none p-2.5 text-sm" placeholder={`¿Cómo aplico «${current.title}»?`} autoFocus />
                                <button type="button" onClick={() => void sendQuestion()} disabled={!question.trim() || isTyping} className="flex h-10 w-10 shrink-0 items-center justify-center self-end rounded-lg text-white disabled:opacity-50" style={{ background: "var(--cc-copper)" }} aria-label="Enviar pregunta"><Send className="h-4 w-4" /></button>
                            </div>
                        </div>
                    </aside>
                </div>
            )}
        </div>
    );
}

const SCALE_COLORS = ["var(--cc-sage)", "#9a5b16", "var(--cc-rose)", "var(--cc-ink)"];

/** Ilustración de la sección: una escena del tema con el título encima. */
function SceneHero({ topic, tall = false, children }: { topic: TrainingTopic; tall?: boolean; children: ReactNode }) {
    return (
        <div className={`relative overflow-hidden rounded-3xl ${tall ? "min-h-[420px] sm:min-h-[480px]" : "min-h-[240px] sm:min-h-[280px]"}`} style={{ background: "var(--cc-carbon)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={topicImage(topic)} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: tall ? "center 40%" : "center 62%", animation: "cc-scene-in 900ms ease-out both" }} />
            <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(28,22,18,0) 25%, rgba(28,22,18,.55) 60%, rgba(28,22,18,.88) 100%)" }} />
            <div className={`relative flex h-full flex-col justify-end px-6 pb-7 sm:px-10 sm:pb-9 ${tall ? "min-h-[420px] sm:min-h-[480px]" : "min-h-[240px] sm:min-h-[280px]"}`}>{children}</div>
            <style>{"@keyframes cc-scene-in{from{transform:scale(1.06);opacity:.4}to{transform:scale(1);opacity:1}}"}</style>
        </div>
    );
}

export function SlideCanvas({ slide, accent, soft = "var(--cc-paper-warm)" }: { slide: TrainingSlide; accent: string; soft?: string }) {
    const bullets = visibleSlideBullets(slide);
    const topic = slideTopic(slide.title, slide.lead);
    const kicker = slide.eyebrow || "";
    const sourceNote = slide.source_note && (
        <details className="mt-8 text-xs leading-5 cc-text-secondary"><summary className="cursor-pointer font-semibold">Ver fragmento del material base</summary><p className="mt-2 border-l-2 pl-3 italic" style={{ borderColor: accent }}>{slide.source_note}</p></details>
    );

    if (slide.layout === "opening") {
        return (
            <section className="mt-3">
                <SceneHero topic={topic} tall>
                    {kicker && <p className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: "#f1c9ab" }}>{kicker}</p>}
                    <h2 className="mt-3 max-w-3xl text-4xl font-semibold leading-[1.05] text-white sm:text-6xl" style={{ fontFamily: "var(--cc-font-display)" }}>{slide.title}</h2>
                    {slide.lead && <p className="mt-4 max-w-2xl text-lg leading-8 text-white/85">{slide.lead}</p>}
                </SceneHero>
                {bullets.length > 0 && (
                    <div className="mt-10 grid gap-4 sm:grid-cols-3">
                        {bullets.map((bullet, index) => (
                            <article key={`${slide.id}-${index}`} className="rounded-2xl border p-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                                <span className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-white" style={{ background: accent }}>{index + 1}</span>
                                <p className="mt-4 text-[15px] leading-6 cc-text-primary">{bullet}</p>
                            </article>
                        ))}
                    </div>
                )}
                {sourceNote}
            </section>
        );
    }

    const labeled = bullets.map(splitLabeled);
    const isFramework = slide.layout === "framework" && labeled.filter(item => item.label).length >= 2;
    const comparison = slide.layout === "comparison" ? splitComparison(bullets) : null;

    return (
        <section className="mt-3">
            <SceneHero topic={topic}>
                {kicker && <p className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: "#f1c9ab" }}>{kicker}</p>}
                <h2 className="mt-2 max-w-3xl text-3xl font-semibold leading-tight text-white sm:text-4xl" style={{ fontFamily: "var(--cc-font-display)" }}>{slide.title}</h2>
            </SceneHero>
            {slide.lead && <p className="mt-6 text-lg leading-8 cc-text-secondary">{slide.lead}</p>}

            {slide.layout === "process" ? (
                <ol className="mt-8 grid gap-3">
                    {bullets.map((bullet, index) => (
                        <li key={`${slide.id}-${index}`} className="grid grid-cols-[3rem_minmax(0,1fr)] items-start gap-4 rounded-2xl border p-4 sm:p-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                            <span className="flex h-12 w-12 items-center justify-center rounded-xl text-lg font-semibold text-white" style={{ background: accent }}>{index + 1}</span>
                            <p className="pt-2.5 text-[15px] leading-6 cc-text-primary">{bullet}</p>
                        </li>
                    ))}
                </ol>
            ) : isFramework ? (
                <div className="mt-8 grid gap-4 sm:grid-cols-3">
                    {labeled.filter(item => item.label).map((item, index) => (
                        <article key={`${slide.id}-${index}`} className="rounded-2xl border-t-4 p-5" style={{ borderColor: SCALE_COLORS[index % SCALE_COLORS.length], background: "var(--cc-paper-warm)" }}>
                            <p className="text-lg font-semibold" style={{ color: SCALE_COLORS[index % SCALE_COLORS.length] }}>{item.label}</p>
                            <p className="mt-2 text-[15px] leading-6 cc-text-primary">{item.text}</p>
                        </article>
                    ))}
                    {labeled.filter(item => !item.label).map((item, index) => (
                        <p key={`${slide.id}-note-${index}`} className="flex gap-3 rounded-2xl p-4 text-[15px] leading-6 cc-text-primary sm:col-span-3" style={{ background: soft }}><Info className="mt-1 h-4 w-4 shrink-0" style={{ color: accent }} />{item.text}</p>
                    ))}
                </div>
            ) : comparison?.contrasted ? (
                <div className="mt-8 grid gap-4 sm:grid-cols-2">
                    <article className="rounded-2xl border p-5" style={{ borderColor: "var(--cc-sage)", background: "var(--cc-sage-tint)" }}>
                        <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--cc-sage)" }}><ThumbsUp className="h-4 w-4" />Así sí</p>
                        <ul className="mt-3 space-y-3">{comparison.doList.map((bullet, index) => <li key={index} className="flex gap-2 text-[15px] leading-6 cc-text-primary"><Check className="mt-1 h-4 w-4 shrink-0" style={{ color: "var(--cc-sage)" }} />{bullet}</li>)}</ul>
                    </article>
                    <article className="rounded-2xl border p-5" style={{ borderColor: "var(--cc-rose)", background: "var(--cc-rose-tint)" }}>
                        <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--cc-rose)" }}><ThumbsDown className="h-4 w-4" />Así no</p>
                        <ul className="mt-3 space-y-3">{comparison.dont.map((bullet, index) => <li key={index} className="flex gap-2 text-[15px] leading-6 cc-text-primary"><X className="mt-1 h-4 w-4 shrink-0" style={{ color: "var(--cc-rose)" }} />{bullet}</li>)}</ul>
                    </article>
                </div>
            ) : slide.layout === "scenario" ? (
                <div className="mt-8 rounded-2xl p-5 sm:p-6" style={{ background: "var(--cc-carbon)" }}>
                    <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: "#e7b89a" }}><Clapperboard className="h-4 w-4" />La situación</p>
                    <ol className="mt-4 space-y-4 border-l pl-5" style={{ borderColor: "rgba(255,255,255,.2)" }}>
                        {bullets.map((bullet, index) => <li key={`${slide.id}-${index}`} className="relative text-[15px] leading-6 text-white/90"><span className="absolute -left-[27px] top-1.5 h-3 w-3 rounded-full" style={{ background: "#e7b89a" }} />{bullet}</li>)}
                    </ol>
                </div>
            ) : slide.layout === "summary" ? (
                <div className="mt-8 grid gap-3 sm:grid-cols-2">
                    {bullets.map((bullet, index) => <article key={`${slide.id}-${index}`} className="flex gap-3 rounded-2xl p-5" style={{ background: soft }}><Star className="mt-0.5 h-5 w-5 shrink-0" style={{ color: accent }} /><p className="text-[15px] leading-6 cc-text-primary">{bullet}</p></article>)}
                </div>
            ) : (
                <ul className="mt-8 grid gap-3">
                    {labeled.map((item, index) => (
                        <li key={`${slide.id}-${index}`} className="flex gap-4 rounded-2xl border p-4 sm:p-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                            <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ background: soft, color: accent }}><Check className="h-3.5 w-3.5" /></span>
                            <p className="text-[15px] leading-6 cc-text-primary">{item.label && <strong className="font-semibold">{item.label}: </strong>}{item.text}</p>
                        </li>
                    ))}
                </ul>
            )}

            {slide.role_cards && slide.role_cards.length > 0 && (
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    {slide.role_cards.map(card => (
                        <article key={`${slide.id}-${card.role}`} className="rounded-2xl border p-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}>
                            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: accent }}><UserRound className="h-4 w-4" />{card.role}</p>
                            <p className="mt-3 text-base font-semibold leading-6 cc-text-primary">{card.responsibility}</p>
                            <p className="mt-1 text-sm leading-6 cc-text-secondary">{card.action}</p>
                        </article>
                    ))}
                </div>
            )}
            {sourceNote}
        </section>
    );
}

function ActivityCard({
    slide,
    selectedAnswer,
    checkedItems,
    isComplete,
    feedback,
    busy,
    onSelectAnswer,
    onCheckAnswer,
    onToggleChecklist,
    onValidateChecklist,
    onAskForHelp,
}: {
    slide: TrainingSlide;
    selectedAnswer?: number;
    checkedItems: string[];
    isComplete: boolean;
    feedback?: string;
    busy: boolean;
    onSelectAnswer: (index: number) => void;
    onCheckAnswer: () => void;
    onToggleChecklist: (item: string) => void;
    onValidateChecklist: () => void;
    onAskForHelp: () => void;
}) {
    const activity = slide.activity;
    if (!activity) return null;
    const isChecklist = activity.type === "checklist";
    return (
        <section className="mt-4 rounded-3xl border p-5 sm:p-7" style={{ borderColor: isComplete ? "var(--cc-sage)" : "var(--cc-line)", background: "var(--cc-paper)" }}>
            <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: isComplete ? "var(--cc-sage-tint)" : "var(--cc-copper-tint)", color: isComplete ? "var(--cc-sage)" : "var(--cc-copper)" }}>{isChecklist ? <ListChecks className="h-4 w-4" /> : <MessageCircleQuestion className="h-4 w-4" />}</span>
                <div><p className="text-[11px] font-semibold uppercase tracking-[0.12em] cc-text-tertiary">{isChecklist ? "Aplicación al trabajo" : activity.type === "scenario" ? "Escenario de decisión" : "Comprueba lo aprendido"}</p><h3 className="mt-1 text-base font-semibold cc-text-primary">{activity.prompt}</h3></div>
            </div>

            {isChecklist ? (
                <div className="mt-4 space-y-2">
                    {(activity.items || []).map(item => {
                        const checked = checkedItems.includes(item);
                        return <button type="button" key={item} disabled={busy || isComplete} onClick={() => onToggleChecklist(item)} className="flex w-full items-start gap-3 rounded-lg border p-3 text-left text-sm leading-5 disabled:opacity-70" style={{ borderColor: checked ? "var(--cc-sage)" : "var(--cc-line)", background: checked ? "var(--cc-sage-tint)" : "var(--cc-paper)" }}>{checked ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--cc-sage)" }} /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 cc-text-tertiary" />}<span className="cc-text-primary">{item}</span></button>;
                    })}
                    <Button type="button" variant="ghost" size="sm" className="mt-2" disabled={busy || isComplete || checkedItems.length !== (activity.items || []).length} onClick={onValidateChecklist}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : isComplete ? <CheckCircle2 className="h-4 w-4" /> : <ListChecks className="h-4 w-4" />}{isComplete ? "Lista validada" : "Validar lista"}</Button>
                </div>
            ) : (
                <div className="mt-4 space-y-2">
                    {(activity.options || []).map((option, index) => {
                        const selected = selectedAnswer === index;
                        return <button type="button" key={option} disabled={busy || isComplete} onClick={() => onSelectAnswer(index)} className="flex w-full items-start gap-3 rounded-lg border p-3 text-left text-sm leading-5 disabled:opacity-70" style={{ borderColor: selected ? "var(--cc-copper)" : "var(--cc-line)", background: selected ? "var(--cc-copper-tint)" : "var(--cc-paper)" }}><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold" style={{ borderColor: selected ? "var(--cc-copper)" : "var(--cc-line-strong)", color: selected ? "var(--cc-copper)" : "var(--cc-ink-muted)" }}>{String.fromCharCode(65 + index)}</span><span className="cc-text-primary">{option}</span></button>;
                    })}
                    <Button type="button" variant="ghost" size="sm" className="mt-2" disabled={busy || isComplete} onClick={onCheckAnswer}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : isComplete ? <CheckCircle2 className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}{isComplete ? "Respuesta comprobada" : "Comprobar respuesta"}</Button>
                </div>
            )}

            {feedback && <p role="status" className="mt-3 rounded-lg px-3 py-2 text-sm leading-5" style={{ background: isComplete ? "var(--cc-sage-tint)" : "var(--cc-copper-tint)", color: isComplete ? "var(--cc-sage)" : "var(--cc-copper)" }}>{feedback}</p>}
            {feedback && !isComplete && !isChecklist && <Button type="button" variant="ghost" size="sm" className="mt-3" onClick={onAskForHelp}>Pedir una pista a CoCo</Button>}
        </section>
    );
}
