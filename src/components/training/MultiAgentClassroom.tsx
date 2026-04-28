"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, User, ChevronRight, ChevronLeft, GraduationCap, Monitor, Users, Lightbulb } from "lucide-react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAuth } from "@/lib/authContext";

interface ChatMessage {
    id: string;
    role: 'tutor' | 'classmate' | 'user' | 'system';
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
    'purple-gradient': 'bg-gradient-to-br from-[#6D28D9] to-[#3730A3]',
    'blue-glass': 'bg-gradient-to-tr from-blue-500 to-cyan-500',
    'tech-abstract': 'bg-gradient-to-br from-slate-800 to-indigo-900',
    'sunset-orange': 'bg-gradient-to-tr from-[#F59E0B] to-[#E11D48]',
    'nature-green': 'bg-gradient-to-br from-[#10B981] to-[#0F766E]',
    'default': 'bg-gradient-to-br from-[#334155] to-[#0F172A]'
};

interface MultiAgentClassroomProps {
    courseContent?: string;
}

export function MultiAgentClassroom({ courseContent }: MultiAgentClassroomProps) {
    const { user } = useAuth();

    // Attempt to parse new Presentation format
    const [parsedSlides, setParsedSlides] = useState<Slide[] | null>(null);
    const [currentSlideIndex, setCurrentSlideIndex] = useState(0);

    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [isTyping, setIsTyping] = useState(false);
    const [blackboardContent, setBlackboardContent] = useState<string>(
        "# Generando pizarra interactiva...\n\nPor favor espera."
    );

    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Initialization
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
            // Legacy content
        }

        if (isPresentation && pSlides) {
            setMessages([{
                id: 'system-1',
                role: 'system',
                text: '¡Clase Magistral Iniciada! CoCo presentará las diapositivas.'
            }]);
            // El useEffect de currentSlideIndex se disparará y agregará la lectura inicial
        } else {
            setMessages([{
                id: 'system-1',
                role: 'system',
                text: '¡Bienvenid@ al Aula Virtual Multi-Agente! Tu Tutora CoCo está preparándose...'
            }]);
            setBlackboardContent(courseContent || "# Bienvenido a la Capacitación\n\nAquí aparecerán los conceptos clave.");
        }
    }, [courseContent]);

    // Handle Presentación Narration
    useEffect(() => {
        if (parsedSlides && parsedSlides.length > 0) {
            const slide = parsedSlides[currentSlideIndex];
            setMessages(prev => [
                ...prev,
                {
                    id: `slide-notes-${currentSlideIndex}-${Date.now()}`,
                    role: 'tutor',
                    text: slide.notes
                }
            ]);
        }
    }, [currentSlideIndex, parsedSlides]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isTyping]);

    const handleSend = async () => {
        if (!input.trim()) return;

        const newUserMsg: ChatMessage = {
            id: `user-${Date.now()}`,
            role: 'user',
            text: input.trim()
        };

        const updatedMessages = [...messages, newUserMsg];
        setMessages(updatedMessages);
        setInput("");
        setIsTyping(true);

        try {
            // Pasamos el JSON crudo (o texto crudo) más la pregunta actual
            const res = await fetch('/api/training/multi-agent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: newUserMsg.text,
                    history: updatedMessages,
                    courseContent
                })
            });

            if (!res.ok) throw new Error('Error de red');

            const data = await res.json();
            const newResponses: ChatMessage[] = data.responses || [];

            // Update Blackboard ONLY if it's Legacy Mode
            if (!parsedSlides) {
                const tutorMsg = newResponses.find(m => m.role === 'tutor' && m.blackboard);
                if (tutorMsg?.blackboard) {
                    setBlackboardContent(tutorMsg.blackboard);
                }
            }

            // Append responses progressively
            for (let i = 0; i < newResponses.length; i++) {
                await new Promise(r => setTimeout(r, 600));
                setMessages(prev => [...prev, newResponses[i]]);
            }
        } catch (error) {
            console.error(error);
            setMessages(prev => [...prev, {
                id: `sys-err-${Date.now()}`,
                role: 'system',
                text: 'Hubo un error de conexión con la sala.'
            }]);
        } finally {
            setIsTyping(false);
        }
    };

    // Suppress unused warning — user is available for future personalization
    void user;

    return (
        <div className="flex flex-col lg:flex-row h-[85vh] w-full bg-canvas rounded-[2.5rem] border border-subtle shadow-2xl shadow-indigo-500/10 overflow-hidden">

            {/* LEFT PANEL: BLACKBOARD / PRESENTATION CANVAS */}
            <div className="w-full lg:w-[65%] h-[40vh] lg:h-full bg-surface flex flex-col relative overflow-hidden border-b lg:border-b-0 lg:border-r border-subtle">
                {parsedSlides ? (
                    // ✨ NEW PRESENTATION PLAYER ✨
                    <div className="flex flex-col h-full bg-slate-100 dark:bg-black p-4 lg:p-10 relative group">
                        <div className="flex items-center justify-between mb-4 z-20">
                            <span className="bg-white/50 dark:bg-slate-800/50 backdrop-blur px-3 py-1 rounded-full text-xs font-bold cc-text-secondary">
                                Presentación Interactiva
                            </span>
                            <span className="bg-black/80 px-3 py-1 text-white text-xs font-bold rounded-full">
                                {currentSlideIndex + 1} / {parsedSlides.length}
                            </span>
                        </div>

                        <div className="flex-1 flex items-center justify-center relative p-6 sm:p-12 overflow-hidden">
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={currentSlideIndex}
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    transition={{ duration: 0.3 }}
                                    className={`w-full max-w-4xl aspect-[16/9] rounded-[2rem] shadow-2xl flex flex-col justify-center p-8 lg:p-14 relative ${
                                        visualThemes[parsedSlides[currentSlideIndex].visual_theme] || visualThemes['default']
                                    }`}
                                >
                                    <div className="bg-white/10 dark:bg-black/20 backdrop-blur-2xl border border-white/20 p-6 sm:p-10 rounded-3xl shadow-xl w-full">
                                        <h1 className="text-2xl sm:text-3xl md:text-5xl font-black text-white tracking-tight mb-6 leading-tight">
                                            {parsedSlides[currentSlideIndex].title}
                                        </h1>

                                        <ul className="space-y-3 sm:space-y-4 text-white/90 font-medium text-base sm:text-lg md:text-xl">
                                            {parsedSlides[currentSlideIndex].bullets.map((b, i) => (
                                                <li key={i} className="flex items-start gap-4">
                                                    <div className="mt-2 w-3 h-3 bg-white/80 rounded-full shrink-0 shadow-[0_0_10px_rgba(255,255,255,0.5)]" />
                                                    <span>{b}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </motion.div>
                            </AnimatePresence>
                        </div>

                        {/* Player Controls */}
                        <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 flex justify-between px-2 sm:px-4 pointer-events-none z-30">
                            <button
                                onClick={() => setCurrentSlideIndex(Math.max(0, currentSlideIndex - 1))}
                                disabled={currentSlideIndex === 0}
                                className="pointer-events-auto p-3 rounded-full bg-white/30 hover:bg-white/50 backdrop-blur disabled:opacity-0 transition-all text-white shadow-xl"
                            >
                                <ChevronLeft className="w-6 h-6 sm:w-8 sm:h-8" />
                            </button>
                            <button
                                onClick={() => setCurrentSlideIndex(Math.min(parsedSlides.length - 1, currentSlideIndex + 1))}
                                disabled={currentSlideIndex === parsedSlides.length - 1}
                                className="pointer-events-auto p-3 rounded-full bg-white/30 hover:bg-white/50 backdrop-blur disabled:opacity-0 transition-all text-white shadow-xl"
                            >
                                <ChevronRight className="w-6 h-6 sm:w-8 sm:h-8" />
                            </button>
                        </div>

                        {/* Progress Bar */}
                        <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/20 z-30">
                            <motion.div
                                className="h-full bg-brand-500 shadow-[0_0_10px_rgba(99,102,241,1)]"
                                initial={{ width: 0 }}
                                animate={{ width: `${((currentSlideIndex + 1) / parsedSlides.length) * 100}%` }}
                                transition={{ duration: 0.3 }}
                            />
                        </div>
                    </div>
                ) : (
                    // LEGACY BLACKBOARD PLAYER
                    <div className="p-6 lg:p-12 flex flex-col h-full bg-surface">
                        <div className="flex items-center gap-3 mb-8 relative z-10">
                            <div className="p-3 bg-role-admin-bg rounded-2xl text-role-admin-fg">
                                <Monitor className="w-6 h-6" />
                            </div>
                            <div>
                                <h2 className="text-xl font-black cc-text-primary">Pizarra Interactiva</h2>
                                <p className="text-sm font-medium text-slate-500">Contenido guiado por la Tutora</p>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto px-2 relative z-10 prose prose-slate dark:prose-invert max-w-none
                            prose-headings:font-black prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl
                            prose-a:text-brand-500 prose-strong:text-brand-600 dark:prose-strong:text-brand-400">
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={blackboardContent.substring(0, 50)}
                                    initial={{ opacity: 0, y: 15 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -15 }}
                                >
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {blackboardContent}
                                    </ReactMarkdown>
                                </motion.div>
                            </AnimatePresence>
                        </div>
                    </div>
                )}
            </div>

            {/* RIGHT PANEL: CHAT / MULTI-AGENT FEED */}
            <div className="w-full lg:w-[35%] h-[45vh] lg:h-full flex flex-col bg-canvas border-l border-white/50 dark:border-slate-800">
                <div className="p-5 border-b border-subtle bg-white/90 dark:bg-slate-950/90 backdrop-blur-md flex items-center justify-between z-10">
                    <div className="flex items-center gap-3">
                        <div className="flex -space-x-3">
                            <div className="w-8 h-8 rounded-full bg-success-bg shadow flex items-center justify-center text-emerald-600 z-20">
                                <GraduationCap className="w-4 h-4" />
                            </div>
                            <div className="w-8 h-8 rounded-full bg-warning-bg shadow flex items-center justify-center text-amber-600 z-10">
                                <Users className="w-4 h-4" />
                            </div>
                            <div className="w-8 h-8 rounded-full bg-role-admin-bg shadow flex items-center justify-center text-brand-600 z-0">
                                <User className="w-4 h-4" />
                            </div>
                        </div>
                        <div>
                            <h3 className="font-bold cc-text-primary text-sm">Aula Guiada CoCo</h3>
                            <p className="text-[10px] uppercase tracking-wider font-bold text-emerald-500">Tutora Activa en vivo</p>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                    <AnimatePresence initial={false}>
                        {messages.map((msg) => (
                            <motion.div
                                key={msg.id}
                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : msg.role === 'system' ? 'items-center' : 'items-start'}`}
                            >
                                {msg.role !== 'system' && (
                                    <span className={`text-[10px] font-bold uppercase tracking-widest mb-1 mx-2 ${msg.role === 'user' ? 'text-indigo-500' : 'text-success-fg'}`}>
                                        {msg.role === 'tutor' ? 'Profesora CoCo' : msg.role === 'classmate' ? (msg.name || 'Compañero IA') : 'Tú'}
                                    </span>
                                )}
                                <div className={`
                                    max-w-[85%] rounded-2xl p-4
                                    ${msg.role === 'user' ? 'bg-brand-600 text-white rounded-br-none shadow-md shadow-indigo-500/20' : ''}
                                    ${msg.role === 'tutor' ? 'bg-surface cc-text-primary border border-subtle/50 rounded-bl-none shadow' : ''}
                                    ${msg.role === 'classmate' ? 'bg-warning-bg cc-text-primary border border-amber-100 dark:border-amber-500/20 rounded-bl-none ml-6' : ''}
                                    ${msg.role === 'system' ? 'bg-transparent text-slate-400 text-xs text-center border-b border-subtle' : ''}
                                `}>
                                    <p className="text-[13px] sm:text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>

                    {isTyping && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-start">
                            <div className="bg-surface text-slate-400 border border-subtle rounded-2xl rounded-bl-none p-4 shadow-sm flex items-center gap-1">
                                <Lightbulb className="w-4 h-4 mr-1 animate-pulse text-emerald-500" />
                                <span className="animate-bounce">.</span><span className="animate-bounce" style={{ animationDelay: "0.2s" }}>.</span><span className="animate-bounce" style={{ animationDelay: "0.4s" }}>.</span>
                            </div>
                        </motion.div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* INPUT AREA */}
                <div className="p-4 bg-surface border-t border-subtle">
                    <form
                        onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                        className="flex items-center gap-3 bg-canvas rounded-full p-1.5 border border-subtle focus-within:ring-2 focus-within:ring-brand-500/30 transition-shadow"
                    >
                        <input
                            type="text" value={input} onChange={(e) => setInput(e.target.value)}
                            placeholder="Pregunta o comenta sobre esta diapositiva..."
                            className="flex-1 bg-transparent px-4 text-sm cc-text-primary placeholder:text-slate-400 focus:outline-none"
                            disabled={isTyping}
                        />
                        <button
                            type="submit" disabled={!input.trim() || isTyping}
                            className="p-3 shadow bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-full transition-colors flex items-center justify-center"
                        >
                            <Send className="w-4 h-4 -ml-0.5" />
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
