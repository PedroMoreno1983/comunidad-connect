"use client";
/* eslint-disable @next/next/no-img-element -- The classroom renders generated training images returned by the AI service. */

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, ChevronRight, ChevronLeft, GraduationCap, Monitor, Users, Lightbulb, Image as ImageIcon, PanelRightOpen } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAuth } from "@/lib/authContext";

interface ChatMessage {
    id: string;
    role: "tutor" | "classmate" | "user" | "system";
    text: string;
    blackboard?: string;
    name?: string;
}

export interface Slide {
    id: string;
    title: string;
    bullets: string[];
    visual_theme: string;
    notes: string;
}

const visualThemes: Record<string, string> = {
    "purple-gradient": "bg-slate-950 text-white border-slate-800",
    "blue-glass": "bg-slate-950 text-white border-blue-900/40",
    "tech-abstract": "bg-slate-950 text-white border-slate-700",
    "sunset-orange": "bg-brand-500 text-white border-brand-600",
    "nature-green": "bg-slate-900 text-white border-emerald-900/40",
    default: "bg-slate-950 text-white border-slate-800",
};

interface MultiAgentClassroomProps {
    courseContent?: string;
}

function ChatMarkdown({ text }: { text: string }) {
    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
                p: ({ children }) => <p className="whitespace-pre-wrap text-sm leading-6">{children}</p>,
                strong: ({ children }) => <strong className="font-semibold text-current">{children}</strong>,
                em: ({ children }) => <em className="font-semibold italic text-current">{children}</em>,
                ul: ({ children }) => <ul className="list-disc space-y-1 pl-4 text-sm leading-6">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal space-y-1 pl-4 text-sm leading-6">{children}</ol>,
                a: ({ children, href }) => (
                    <a href={href} target="_blank" rel="noreferrer" className="font-semibold text-brand-600 underline underline-offset-4">
                        {children}
                    </a>
                ),
            }}
        >
            {text}
        </ReactMarkdown>
    );
}

function BlackboardMarkdown({ content }: { content: string }) {
    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
                h1: ({ children }) => <h1 className="mb-4 text-2xl font-semibold tracking-tight cc-text-primary sm:mb-5 sm:text-3xl">{children}</h1>,
                h2: ({ children }) => <h2 className="mb-3 mt-6 text-lg font-semibold cc-text-primary sm:mt-8 sm:text-xl">{children}</h2>,
                h3: ({ children }) => <h3 className="mb-2 mt-5 text-base font-semibold cc-text-primary sm:mt-6">{children}</h3>,
                p: ({ children }) => <p className="mb-4 text-sm leading-7 cc-text-secondary sm:text-base sm:leading-8">{children}</p>,
                strong: ({ children }) => <strong className="font-semibold text-brand-600">{children}</strong>,
                ul: ({ children }) => <ul className="mb-5 space-y-2 pl-0">{children}</ul>,
                ol: ({ children }) => <ol className="mb-5 list-decimal space-y-2 pl-5 cc-text-secondary">{children}</ol>,
                li: ({ children }) => (
                    <li className="flex gap-3 text-sm leading-6 cc-text-secondary">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-sm bg-brand-500" />
                        <span>{children}</span>
                    </li>
                ),
                img: ({ src, alt }) => (
                    <figure className="my-5 overflow-hidden rounded-lg border border-subtle bg-surface shadow-sm sm:my-6">
                        <div className="relative aspect-[16/9] w-full bg-slate-100">
                            <img src={src || ""} alt={alt || "Imagen generada para la clase"} className="h-full w-full object-cover" />
                            <div className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-md bg-white/90 px-2.5 py-1.5 text-[11px] font-semibold text-slate-900 shadow-sm sm:left-4 sm:top-4 sm:px-3 sm:text-xs">
                                <ImageIcon className="h-3.5 w-3.5 text-brand-500" />
                                Imagen generada
                            </div>
                        </div>
                    </figure>
                ),
                table: ({ children }) => (
                    <div className="my-5 overflow-hidden rounded-lg border border-subtle">
                        <table className="w-full border-collapse text-sm">{children}</table>
                    </div>
                ),
                th: ({ children }) => <th className="bg-elevated px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] cc-text-secondary">{children}</th>,
                td: ({ children }) => <td className="border-t border-subtle px-4 py-3 cc-text-secondary">{children}</td>,
                a: ({ children, href }) => (
                    <a href={href} target="_blank" rel="noreferrer" className="font-semibold text-brand-600 underline underline-offset-4">
                        {children}
                    </a>
                ),
            }}
        >
            {content}
        </ReactMarkdown>
    );
}

export function MultiAgentClassroom({ courseContent }: MultiAgentClassroomProps) {
    const { user } = useAuth();
    const [parsedSlides, setParsedSlides] = useState<Slide[] | null>(null);
    const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [isTyping, setIsTyping] = useState(false);
    const [blackboardContent, setBlackboardContent] = useState<string>(
        "# Preparando la pizarra\n\nCoCo está armando una vista visual para esta clase."
    );

    const messagesContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let isPresentation = false;
        let pSlides: Slide[] | null = null;
        try {
            if (courseContent) {
                const json = JSON.parse(courseContent);
                if (Array.isArray(json) && json[0]?.visual_theme) {
                    pSlides = json;
                    setParsedSlides(json);
                    isPresentation = true;
                }
            }
        } catch {
            // Legacy content.
        }

        if (isPresentation && pSlides) {
            setMessages([{
                id: "system-1",
                role: "system",
                text: "Clase iniciada. CoCo irá guiando cada lámina con ejemplos prácticos.",
            }]);
        } else {
            setMessages([{
                id: "system-1",
                role: "system",
                text: "Aula CoCo lista. Haz una pregunta o comenta el caso para actualizar la pizarra.",
            }]);
            setBlackboardContent(courseContent || "# Bienvenido a la capacitación\n\nAquí aparecerán conceptos clave, imágenes generadas y decisiones prácticas para la comunidad.");
        }
    }, [courseContent]);

    useEffect(() => {
        if (parsedSlides && parsedSlides.length > 0) {
            const slide = parsedSlides[currentSlideIndex];
            setMessages(prev => [
                ...prev,
                {
                    id: `slide-notes-${currentSlideIndex}-${Date.now()}`,
                    role: "tutor",
                    text: slide.notes,
                },
            ]);
        }
    }, [currentSlideIndex, parsedSlides]);

    useEffect(() => {
        const container = messagesContainerRef.current;
        if (container) {
            container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
        }
    }, [messages, isTyping]);

    const handleSend = async () => {
        if (!input.trim()) return;

        const newUserMsg: ChatMessage = {
            id: `user-${Date.now()}`,
            role: "user",
            text: input.trim(),
        };

        const updatedMessages = [...messages, newUserMsg];
        setMessages(updatedMessages);
        setInput("");
        setIsTyping(true);

        try {
            const res = await fetch("/api/training/multi-agent", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: newUserMsg.text,
                    history: updatedMessages,
                    courseContent,
                    userId: user?.id,
                    communityId: user?.communityId,
                }),
            });

            if (!res.ok) throw new Error("Error de red");

            const data = await res.json();
            const newResponses: ChatMessage[] = data.responses || [];

            if (!parsedSlides) {
                const tutorMsg = newResponses.find(m => m.role === "tutor" && m.blackboard);
                if (tutorMsg?.blackboard) {
                    setBlackboardContent(tutorMsg.blackboard);
                }
            }

            for (let i = 0; i < newResponses.length; i++) {
                await new Promise(resolve => setTimeout(resolve, 450));
                setMessages(prev => [...prev, newResponses[i]]);
            }
        } catch (error) {
            console.warn("Training classroom turn failed:", error);
            setMessages(prev => [...prev, {
                id: `sys-err-${Date.now()}`,
                role: "system",
                text: "Hubo una intermitencia con la sala. La clase sigue disponible; intenta de nuevo en unos segundos.",
            }]);
        } finally {
            setIsTyping(false);
        }
    };

    const currentSlide = parsedSlides?.[currentSlideIndex];

    return (
        <div className="flex w-full flex-col gap-4 lg:h-[82vh] lg:flex-row lg:gap-0 lg:overflow-hidden lg:rounded-lg lg:border lg:border-subtle lg:bg-surface lg:shadow-sm">
            <div className="relative flex w-full flex-col overflow-hidden rounded-lg border border-subtle bg-surface shadow-sm lg:h-full lg:w-[64%] lg:rounded-none lg:border-0 lg:border-r lg:shadow-none">
                {parsedSlides && currentSlide ? (
                    <div className="flex min-h-[340px] flex-col bg-canvas p-3 sm:min-h-[420px] sm:p-4 lg:h-full lg:min-h-0 lg:p-8">
                        <div className="z-20 mb-4 flex items-center justify-between">
                            <span className="inline-flex items-center gap-2 rounded-md border border-subtle bg-surface px-3 py-1.5 text-xs font-semibold cc-text-secondary">
                                <PanelRightOpen className="h-3.5 w-3.5 text-brand-500" />
                                Presentación interactiva
                            </span>
                            <span className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">
                                {currentSlideIndex + 1} / {parsedSlides.length}
                            </span>
                        </div>

                        <div className="flex flex-1 items-center justify-center overflow-hidden">
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={currentSlideIndex}
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    transition={{ duration: 0.25 }}
                                    className={`flex aspect-[4/5] w-full max-w-4xl flex-col justify-center rounded-lg border p-5 shadow-sm sm:aspect-[16/9] sm:p-8 lg:p-12 ${visualThemes[currentSlide.visual_theme] || visualThemes.default}`}
                                >
                                    <p className="mb-5 text-xs font-semibold uppercase tracking-[0.18em] text-white/60">Aula CoCo</p>
                                    <h1 className="mb-5 text-2xl font-semibold leading-tight tracking-tight text-white sm:mb-7 md:text-5xl">
                                        {currentSlide.title}
                                    </h1>
                                    <ul className="space-y-3 text-sm font-medium leading-6 text-white/88 sm:space-y-4 sm:text-base sm:leading-7 md:text-lg">
                                        {currentSlide.bullets.map((bullet, index) => (
                                            <li key={index} className="flex items-start gap-3">
                                                <span className="mt-2.5 h-2 w-2 shrink-0 rounded-sm bg-brand-400" />
                                                <span>{bullet}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </motion.div>
                            </AnimatePresence>
                        </div>

                        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-30 flex -translate-y-1/2 justify-between px-3">
                            <button
                                type="button"
                                onClick={() => setCurrentSlideIndex(Math.max(0, currentSlideIndex - 1))}
                                disabled={currentSlideIndex === 0}
                                className="pointer-events-auto rounded-lg border border-subtle bg-surface p-3 shadow-sm transition-colors hover:bg-elevated disabled:opacity-0"
                                aria-label="Diapositiva anterior"
                            >
                                <ChevronLeft className="h-5 w-5 cc-text-secondary" />
                            </button>
                            <button
                                type="button"
                                onClick={() => setCurrentSlideIndex(Math.min(parsedSlides.length - 1, currentSlideIndex + 1))}
                                disabled={currentSlideIndex === parsedSlides.length - 1}
                                className="pointer-events-auto rounded-lg border border-subtle bg-surface p-3 shadow-sm transition-colors hover:bg-elevated disabled:opacity-0"
                                aria-label="Siguiente diapositiva"
                            >
                                <ChevronRight className="h-5 w-5 cc-text-secondary" />
                            </button>
                        </div>

                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-elevated">
                            <motion.div
                                className="h-full bg-brand-500"
                                initial={{ width: 0 }}
                                animate={{ width: `${((currentSlideIndex + 1) / parsedSlides.length) * 100}%` }}
                                transition={{ duration: 0.25 }}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="flex max-h-none min-h-[330px] flex-col bg-surface p-4 sm:min-h-[420px] sm:p-5 lg:h-full lg:min-h-0 lg:p-8">
                        <div className="mb-5 flex items-center justify-between gap-3 sm:mb-6 sm:gap-4">
                            <div className="flex items-center gap-3">
                                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                                    <Monitor className="h-5 w-5" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-semibold cc-text-primary sm:text-xl">Pizarra interactiva</h2>
                                    <p className="text-sm cc-text-secondary">Síntesis visual guiada por CoCo</p>
                                </div>
                            </div>
                            <span className="hidden rounded-md border border-subtle bg-canvas px-3 py-1.5 text-xs font-semibold cc-text-secondary sm:inline-flex">
                                Markdown + imagen IA
                            </span>
                        </div>

                        <div className="relative z-10 flex-1 overflow-y-auto pr-1 sm:pr-2">
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={blackboardContent.substring(0, 50)}
                                    initial={{ opacity: 0, y: 12 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -12 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    <BlackboardMarkdown content={blackboardContent} />
                                </motion.div>
                            </AnimatePresence>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex max-h-[70vh] min-h-[380px] w-full flex-col overflow-hidden rounded-lg border border-subtle bg-canvas shadow-sm sm:min-h-[440px] lg:h-full lg:max-h-none lg:min-h-0 lg:w-[36%] lg:rounded-none lg:border-0 lg:shadow-none">
                <div className="z-10 flex items-center justify-between border-b border-subtle bg-surface p-4 sm:p-5">
                    <div className="flex items-center gap-3">
                        <div className="grid h-10 w-10 place-items-center rounded-lg bg-slate-900 text-white">
                            <GraduationCap className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold cc-text-primary">Aula guiada CoCo</h3>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-600">Tutora activa</p>
                        </div>
                    </div>
                    <div className="hidden items-center gap-1.5 text-xs font-semibold cc-text-tertiary sm:flex">
                        <Users className="h-4 w-4" />
                        Multiagente
                    </div>
                </div>

                <div ref={messagesContainerRef} className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
                    <AnimatePresence initial={false}>
                        {messages.map(msg => (
                            <motion.div
                                key={msg.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={`flex flex-col ${msg.role === "user" ? "items-end" : msg.role === "system" ? "items-center" : "items-start"}`}
                            >
                                {msg.role !== "system" && (
                                    <span className={`mb-1 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${msg.role === "user" ? "text-brand-600" : "cc-text-tertiary"}`}>
                                        {msg.role === "tutor" ? "Profesora CoCo" : msg.role === "classmate" ? (msg.name || "Compañero IA") : "Tú"}
                                    </span>
                                )}
                                <div
                                    className={`
                                        max-w-[92%] rounded-lg p-3 shadow-sm sm:max-w-[88%] sm:p-4
                                        ${msg.role === "user" ? "bg-brand-500 text-white" : ""}
                                        ${msg.role === "tutor" ? "border border-subtle bg-surface cc-text-primary" : ""}
                                        ${msg.role === "classmate" ? "ml-5 border border-subtle bg-warning-bg cc-text-primary" : ""}
                                        ${msg.role === "system" ? "border border-subtle bg-surface px-3 py-2 text-center text-xs cc-text-secondary" : ""}
                                    `}
                                >
                                    <ChatMarkdown text={msg.text} />
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>

                    {isTyping && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-start">
                            <div className="flex items-center gap-2 rounded-lg border border-subtle bg-surface p-4 text-sm cc-text-secondary shadow-sm">
                                <Lightbulb className="h-4 w-4 animate-pulse text-brand-500" />
                                CoCo está preparando una respuesta
                            </div>
                        </motion.div>
                    )}
                </div>

                <div className="border-t border-subtle bg-surface p-3 sm:p-4">
                    <form
                        onSubmit={event => {
                            event.preventDefault();
                            handleSend();
                        }}
                        className="flex items-center gap-2 rounded-lg border border-subtle bg-canvas p-1.5 transition-shadow focus-within:ring-2 focus-within:ring-brand-500/30"
                    >
                        <input
                            type="text"
                            value={input}
                            onChange={event => setInput(event.target.value)}
                            placeholder="Pregunta o comenta sobre la clase"
                            className="min-w-0 flex-1 bg-transparent px-3 text-sm cc-text-primary placeholder:text-slate-400 focus:outline-none"
                            disabled={isTyping}
                        />
                        <button
                            type="submit"
                            disabled={!input.trim() || isTyping}
                            className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-500 text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
                            aria-label="Enviar mensaje"
                        >
                            <Send className="h-4 w-4" />
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
