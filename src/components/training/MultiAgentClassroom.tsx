"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
    ArrowLeft,
    ArrowRight,
    Check,
    CheckCircle2,
    Circle,
    Clock3,
    GraduationCap,
    HelpCircle,
    ListChecks,
    Loader2,
    MessageCircleQuestion,
    RotateCcw,
    Send,
    ShieldCheck,
    Sparkles,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/cc/Button";
import { useAuth } from "@/lib/authContext";
import { parseTrainingSlides } from "@/lib/training/courseContent";
import type { TrainingChatMessage, TrainingClassroomProps, TrainingSlide } from "@/lib/types";

const themeStyles: Record<TrainingSlide["visual_theme"], { accent: string; soft: string; label: string }> = {
    copper: { accent: "var(--cc-copper)", soft: "var(--cc-copper-tint)", label: "Aplicación" },
    sage: { accent: "var(--cc-sage)", soft: "var(--cc-sage-tint)", label: "Procedimiento" },
    ink: { accent: "var(--cc-ink)", soft: "var(--cc-paper-warm)", label: "Fundamento" },
    amber: { accent: "#9a5b16", soft: "#fff4df", label: "Decisión" },
};

export function MultiAgentClassroom({
    courseContent,
    courseTitle = "Curso operativo",
    learningObjectives = [],
    estimatedMinutes = 20,
    initialSlideIndex = 0,
    onSlideChange,
    onComplete,
}: TrainingClassroomProps) {
    const { user } = useAuth();
    const slides = useMemo(() => parseTrainingSlides(courseContent), [courseContent]);
    const safeInitialIndex = slides.length ? Math.min(Math.max(initialSlideIndex, 0), slides.length - 1) : 0;
    const [currentIndex, setCurrentIndex] = useState(safeInitialIndex);
    const [maxVisited, setMaxVisited] = useState(safeInitialIndex);
    const [answers, setAnswers] = useState<Record<string, number>>({});
    const [checklists, setChecklists] = useState<Record<string, string[]>>({});
    const [completedActivities, setCompletedActivities] = useState<Record<string, boolean>>({});
    const [feedback, setFeedback] = useState<Record<string, string>>({});
    const [messages, setMessages] = useState<TrainingChatMessage[]>([]);
    const [question, setQuestion] = useState("");
    const [isTyping, setIsTyping] = useState(false);
    const [completed, setCompleted] = useState(false);
    const messagesRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const resumedActivities = Object.fromEntries(
            slides
                .slice(0, safeInitialIndex)
                .filter(slide => slide.activity)
                .map(slide => [slide.id, true]),
        );
        setCurrentIndex(safeInitialIndex);
        setMaxVisited(safeInitialIndex);
        setAnswers({});
        setChecklists({});
        setCompletedActivities(resumedActivities);
        setFeedback({});
        setCompleted(false);
        setMessages([{
            id: "welcome",
            role: "system",
            text: `CoCo acompaña este curso. Puedes preguntar por un concepto o por cómo aplicarlo en tu rol.`,
        }]);
    }, [courseContent, safeInitialIndex, slides]);

    useEffect(() => {
        if (slides.length) onSlideChange?.(currentIndex);
    }, [currentIndex, onSlideChange, slides.length]);

    useEffect(() => {
        messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: "smooth" });
    }, [messages, isTyping]);

    const current = slides[currentIndex];
    const activityIds = slides.filter(slide => slide.activity).map(slide => slide.id);
    const allActivitiesComplete = activityIds.every(id => completedActivities[id]);
    const currentActivityComplete = !current?.activity || completedActivities[current.id];
    const coursePercent = completed
        ? 100
        : slides.length > 1
            ? Math.round((currentIndex / (slides.length - 1)) * 100)
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

    const checkAnswer = () => {
        if (!current?.activity || current.activity.type === "checklist") return;
        const selected = answers[current.id];
        if (selected === undefined) {
            setFeedback(previous => ({ ...previous, [current.id]: "Selecciona una respuesta antes de comprobar." }));
            return;
        }
        const correct = selected === current.activity.correctIndex;
        setCompletedActivities(previous => ({ ...previous, [current.id]: correct }));
        setFeedback(previous => ({
            ...previous,
            [current.id]: correct
                ? current.activity?.explanation || "Respuesta correcta. Puedes continuar."
                : "Aún no. Revisa los criterios de la sección y vuelve a intentarlo.",
        }));
    };

    const toggleChecklistItem = (item: string) => {
        if (!current?.activity || current.activity.type !== "checklist") return;
        const selected = checklists[current.id] || [];
        const next = selected.includes(item) ? selected.filter(value => value !== item) : [...selected, item];
        const isComplete = current.activity.items?.every(value => next.includes(value)) ?? false;
        setChecklists(previous => ({ ...previous, [current.id]: next }));
        setCompletedActivities(previous => ({ ...previous, [current.id]: isComplete }));
        setFeedback(previous => ({
            ...previous,
            [current.id]: isComplete ? current.activity?.explanation || "Lista completada." : "Marca cada acción que ya puedes aplicar.",
        }));
    };

    const completeCourse = () => {
        if (!allActivitiesComplete || currentIndex !== slides.length - 1) return;
        setCompleted(true);
        onComplete?.(currentIndex);
    };

    const sendQuestion = async () => {
        const text = question.trim();
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
                    courseContent,
                    userId: user?.id,
                    communityId: user?.communityId,
                    userName: user?.name,
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

    return (
        <div className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
            <header className="border-b px-4 py-4 sm:px-6" style={{ borderColor: "var(--cc-line)" }}>
                <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold cc-text-secondary">
                            <span className="inline-flex items-center gap-1.5"><GraduationCap className="h-4 w-4" /> Aula virtual CoCo</span>
                            <span>·</span>
                            <span className="inline-flex items-center gap-1.5"><Clock3 className="h-4 w-4" /> {estimatedMinutes} min</span>
                        </div>
                        <h1 className="mt-1 truncate text-xl font-semibold cc-text-primary sm:text-2xl">{courseTitle}</h1>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold cc-text-secondary">{coursePercent}%</span>
                        <div className="h-2 w-36 overflow-hidden rounded-full" style={{ background: "var(--cc-line)" }}>
                            <div className="h-full rounded-full transition-all" style={{ width: `${coursePercent}%`, background: completed ? "var(--cc-sage)" : "var(--cc-copper)" }} />
                        </div>
                    </div>
                </div>
            </header>

            <div className="grid min-h-[680px] lg:grid-cols-[230px_minmax(0,1fr)_330px]">
                <nav className="border-b p-4 lg:border-b-0 lg:border-r" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }} aria-label="Secciones del curso">
                    <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] cc-text-tertiary">Contenido</p>
                    <ol className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
                        {slides.map((slide, index) => {
                            const isCurrent = index === currentIndex;
                            const isAvailable = index <= maxVisited + 1;
                            const isDone = index < currentIndex || completedActivities[slide.id];
                            return (
                                <li key={slide.id}>
                                    <button
                                        type="button"
                                        disabled={!isAvailable}
                                        onClick={() => goTo(index)}
                                        className="flex w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45"
                                        style={{ borderColor: isCurrent ? "var(--cc-copper)" : "transparent", background: isCurrent ? "var(--cc-copper-tint)" : "transparent" }}
                                    >
                                        {isDone ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--cc-sage)" }} /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 cc-text-tertiary" />}
                                        <span className="min-w-0">
                                            <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] cc-text-tertiary">{index + 1} de {slides.length}</span>
                                            <span className="mt-0.5 block text-xs font-semibold leading-4 cc-text-primary">{slide.title}</span>
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ol>
                    {learningObjectives.length > 0 && (
                        <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--cc-line)" }}>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] cc-text-tertiary">Al finalizar</p>
                            <ul className="mt-2 space-y-2">
                                {learningObjectives.slice(0, 3).map(objective => <li key={objective} className="flex gap-2 text-xs leading-4 cc-text-secondary"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "var(--cc-copper)" }} />{objective}</li>)}
                            </ul>
                        </div>
                    )}
                </nav>

                <main className="flex min-w-0 flex-col p-5 sm:p-7 lg:p-8">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ background: theme.soft, color: theme.accent }}>{current.eyebrow || theme.label}</span>
                        <span className="text-xs font-semibold cc-text-tertiary">Sección {currentIndex + 1} de {slides.length}</span>
                    </div>

                    <div className="mt-8 max-w-3xl">
                        <h2 className="text-3xl font-semibold leading-tight cc-text-primary sm:text-4xl" style={{ fontFamily: "var(--cc-font-display)" }}>{current.title}</h2>
                        <ul className="mt-7 space-y-4">
                            {current.bullets.map((bullet, index) => (
                                <li key={`${current.id}-${index}`} className="flex gap-4 text-base leading-7 cc-text-secondary">
                                    <span className="mt-2.5 h-2 w-2 shrink-0 rounded-full" style={{ background: theme.accent }} />
                                    <span>{bullet}</span>
                                </li>
                            ))}
                        </ul>
                        <div className="mt-7 rounded-xl border-l-4 p-4" style={{ borderColor: theme.accent, background: theme.soft }}>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: theme.accent }}>Clave para el trabajo</p>
                            <p className="mt-2 text-sm leading-6 cc-text-primary">{current.notes}</p>
                        </div>
                    </div>

                    {current.activity && (
                        <ActivityCard
                            slide={current}
                            selectedAnswer={answers[current.id]}
                            checkedItems={checklists[current.id] || []}
                            isComplete={Boolean(completedActivities[current.id])}
                            feedback={feedback[current.id]}
                            onSelectAnswer={index => {
                                setAnswers(previous => ({ ...previous, [current.id]: index }));
                                setCompletedActivities(previous => ({ ...previous, [current.id]: false }));
                                setFeedback(previous => ({ ...previous, [current.id]: "" }));
                            }}
                            onCheckAnswer={checkAnswer}
                            onToggleChecklist={toggleChecklistItem}
                        />
                    )}

                    <div className="mt-auto flex flex-col-reverse justify-between gap-3 border-t pt-6 sm:flex-row sm:items-center" style={{ borderColor: "var(--cc-line)" }}>
                        <Button type="button" variant="ghost" disabled={currentIndex === 0} onClick={() => goTo(currentIndex - 1)}><ArrowLeft className="h-4 w-4" />Anterior</Button>
                        {currentIndex < slides.length - 1 ? (
                            <Button type="button" variant="copper" disabled={!currentActivityComplete} onClick={() => goTo(currentIndex + 1)}>Continuar<ArrowRight className="h-4 w-4" /></Button>
                        ) : (
                            <Button type="button" variant="copper" disabled={!allActivitiesComplete || completed} onClick={completeCourse}>
                                {completed ? <CheckCircle2 className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                                {completed ? "Curso completado" : "Completar curso"}
                            </Button>
                        )}
                    </div>
                </main>

                <aside className="flex min-h-[520px] flex-col border-t lg:border-l lg:border-t-0" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}>
                    <div className="border-b p-4" style={{ borderColor: "var(--cc-line)" }}>
                        <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 items-center justify-center rounded-full text-white" style={{ background: "var(--cc-ink)" }}><Sparkles className="h-4 w-4" /></span>
                            <div><p className="text-sm font-semibold cc-text-primary">Tutora CoCo</p><p className="text-xs cc-text-secondary">Resuelve dudas del curso</p></div>
                        </div>
                    </div>
                    <div ref={messagesRef} className="flex-1 space-y-3 overflow-y-auto p-4">
                        {messages.map(message => (
                            <div key={message.id} className={`rounded-xl px-3 py-2.5 text-sm leading-6 ${message.role === "user" ? "ml-6 text-white" : "mr-3"}`} style={{ background: message.role === "user" ? "var(--cc-ink)" : "var(--cc-paper)", border: message.role === "user" ? undefined : "1px solid var(--cc-line)" }}>
                                <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ p: ({ children }) => <p>{children}</p>, ul: ({ children }) => <ul className="list-disc pl-4">{children}</ul>, ol: ({ children }) => <ol className="list-decimal pl-4">{children}</ol> }}>{message.text}</ReactMarkdown>
                            </div>
                        ))}
                        {isTyping && <div className="mr-3 flex items-center gap-2 rounded-xl border px-3 py-3 text-xs cc-text-secondary" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}><Loader2 className="h-3.5 w-3.5 animate-spin" />CoCo está revisando el curso…</div>}
                    </div>
                    <div className="border-t p-4" style={{ borderColor: "var(--cc-line)" }}>
                        <label className="text-[11px] font-semibold uppercase tracking-[0.12em] cc-text-tertiary" htmlFor="training-question">Pregunta a CoCo</label>
                        <div className="mt-2 flex gap-2">
                            <textarea id="training-question" rows={2} value={question} onChange={event => setQuestion(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendQuestion(); } }} className="input-premium min-h-20 flex-1 resize-none p-2.5 text-sm" placeholder="¿Cómo aplico esto en mi turno?" />
                            <button type="button" onClick={() => void sendQuestion()} disabled={!question.trim() || isTyping} className="flex h-10 w-10 shrink-0 items-center justify-center self-end rounded-lg text-white disabled:opacity-50" style={{ background: "var(--cc-copper)" }} aria-label="Enviar pregunta"><Send className="h-4 w-4" /></button>
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    );
}

function ActivityCard({
    slide,
    selectedAnswer,
    checkedItems,
    isComplete,
    feedback,
    onSelectAnswer,
    onCheckAnswer,
    onToggleChecklist,
}: {
    slide: TrainingSlide;
    selectedAnswer?: number;
    checkedItems: string[];
    isComplete: boolean;
    feedback?: string;
    onSelectAnswer: (index: number) => void;
    onCheckAnswer: () => void;
    onToggleChecklist: (item: string) => void;
}) {
    const activity = slide.activity;
    if (!activity) return null;
    const isChecklist = activity.type === "checklist";
    return (
        <section className="mt-8 max-w-3xl rounded-xl border p-4 sm:p-5" style={{ borderColor: isComplete ? "var(--cc-sage)" : "var(--cc-line-strong)", background: "var(--cc-paper-warm)" }}>
            <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: isComplete ? "var(--cc-sage-tint)" : "var(--cc-copper-tint)", color: isComplete ? "var(--cc-sage)" : "var(--cc-copper)" }}>{isChecklist ? <ListChecks className="h-4 w-4" /> : <MessageCircleQuestion className="h-4 w-4" />}</span>
                <div><p className="text-[11px] font-semibold uppercase tracking-[0.12em] cc-text-tertiary">{isChecklist ? "Aplicación al trabajo" : activity.type === "scenario" ? "Escenario de decisión" : "Comprueba lo aprendido"}</p><h3 className="mt-1 text-base font-semibold cc-text-primary">{activity.prompt}</h3></div>
            </div>

            {isChecklist ? (
                <div className="mt-4 space-y-2">
                    {(activity.items || []).map(item => {
                        const checked = checkedItems.includes(item);
                        return <button type="button" key={item} onClick={() => onToggleChecklist(item)} className="flex w-full items-start gap-3 rounded-lg border p-3 text-left text-sm leading-5" style={{ borderColor: checked ? "var(--cc-sage)" : "var(--cc-line)", background: checked ? "var(--cc-sage-tint)" : "var(--cc-paper)" }}>{checked ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--cc-sage)" }} /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 cc-text-tertiary" />}<span className="cc-text-primary">{item}</span></button>;
                    })}
                </div>
            ) : (
                <div className="mt-4 space-y-2">
                    {(activity.options || []).map((option, index) => {
                        const selected = selectedAnswer === index;
                        return <button type="button" key={option} onClick={() => onSelectAnswer(index)} className="flex w-full items-start gap-3 rounded-lg border p-3 text-left text-sm leading-5" style={{ borderColor: selected ? "var(--cc-copper)" : "var(--cc-line)", background: selected ? "var(--cc-copper-tint)" : "var(--cc-paper)" }}><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold" style={{ borderColor: selected ? "var(--cc-copper)" : "var(--cc-line-strong)", color: selected ? "var(--cc-copper)" : "var(--cc-ink-muted)" }}>{String.fromCharCode(65 + index)}</span><span className="cc-text-primary">{option}</span></button>;
                    })}
                    <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={onCheckAnswer}>{isComplete ? <CheckCircle2 className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}{isComplete ? "Respuesta comprobada" : "Comprobar respuesta"}</Button>
                </div>
            )}

            {feedback && <p role="status" className="mt-3 rounded-lg px-3 py-2 text-sm leading-5" style={{ background: isComplete ? "var(--cc-sage-tint)" : "var(--cc-copper-tint)", color: isComplete ? "var(--cc-sage)" : "var(--cc-copper)" }}>{feedback}</p>}
        </section>
    );
}
