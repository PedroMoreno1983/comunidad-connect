"use client";

import { useState, useRef, useEffect } from "react";
import { Bot, Send, Sparkles, Calendar, DollarSign, Loader2, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { getApiUrl } from "@/lib/config";
import { useToast } from "@/components/ui/Toast";
import confetti from "canvas-confetti";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DisplayHeading } from "@/components/cc/Eyebrow";

interface Message {
    id: string;
    role: "user" | "assistant";
    text: string;
    nav?: string;
    action?: string;
}

function CoCoMarkdown({ text }: { text: string }) {
    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
                p: ({ children }) => <p className="text-sm leading-relaxed mb-2 last:mb-0">{children}</p>,
                strong: ({ children }) => <strong className="font-extrabold text-white">{children}</strong>,
                ul: ({ children }) => <ul className="list-disc space-y-1 pl-4 text-sm leading-relaxed mb-2">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal space-y-1 pl-4 text-sm leading-relaxed mb-2">{children}</ol>,
                a: ({ children, href }) => (
                    <a href={href} target="_blank" rel="noreferrer" className="font-bold underline text-brand-400 hover:text-brand-300 transition-colors">
                        {children}
                    </a>
                ),
            }}
        >
            {text}
        </ReactMarkdown>
    );
}

const CHIPS = [
    { label: "¿Cómo reservo un espacio?", icon: Calendar },
    { label: "¿Cómo pago mis gastos?", icon: DollarSign },
    { label: "Muéstrame el tour", icon: Sparkles },
];

export default function CoCoChatPage() {
    const { user, logout } = useAuth();
    const { toast } = useToast();
    const [msgs, setMsgs] = useState<Message[]>([
        {
            id: "welcome",
            role: "assistant",
            text: "Hola. Soy **CoCo**, tu asistente virtual e inteligencia operacional del edificio. ¿En qué te puedo ayudar hoy?",
        }
    ]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [msgs]);

    const send = async (text: string) => {
        if (!text.trim() || loading) return;

        setMsgs(p => [...p, { id: Date.now().toString(), role: "user", text }]);
        setInput("");
        setLoading(true);

        try {
            const history = msgs.slice(-10).map(m => ({
                role: m.role === "assistant" ? "model" : "user",
                text: m.text
            }));

            const res = await fetch(getApiUrl("/api/coco"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: text,
                    history,
                    currentPage: "/chat",
                    userName: user?.name || "Residente",
                    userRole: user?.role || "resident",
                    userId: user?.id,
                    unitId: (user as any).unitId,
                    unitName: (user as any).unitName,
                    communityId: (user as any).communityId,
                }),
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.reply || `HTTP ${res.status}`);
            }

            const d = await res.json();
            setMsgs(p => [...p, {
                id: (Date.now() + 1).toString(),
                role: "assistant",
                text: d.reply || "No pude responder.",
                nav: d.navigate,
                action: d.action,
            }]);

            // Handle UI actions
            if (d.action) {
                setTimeout(() => {
                    switch (d.action) {
                        case 'CONFETTI':
                            confetti({ zIndex: 99999, particleCount: 150, spread: 80 });
                            break;
                    }
                }, 500);
            }
        } catch (err: unknown) {
            console.error("CoCo error:", err);
            setMsgs(p => [...p, {
                id: (Date.now() + 1).toString(),
                role: "assistant",
                text: "Lo siento, tuve un problema de conexión al procesar tu solicitud. Inténtalo de nuevo."
            }]);
        } finally {
            setLoading(false);
        }
    };

    const firstName = user?.name ? user.name.split(" ")[0] : "Martina";

    return (
        <div 
            className="w-full min-h-[calc(100vh-4rem)] flex flex-col justify-between"
            style={{ backgroundColor: "#0E0B08", color: "#f3efe8" }}
        >
            {/* Main Chat Flow Container */}
            <div className="flex-1 max-w-4xl w-full mx-auto px-4 py-8 sm:px-6 flex flex-col justify-between">
                
                {/* Hero Greeting when chat is empty or just welcome message */}
                {msgs.length <= 1 ? (
                    <div className="py-12 text-center space-y-4 my-auto">
                        <div className="inline-flex p-3 bg-white/5 rounded-2xl border border-white/10 text-brand-400 mb-2">
                            <Bot className="h-10 w-10" />
                        </div>
                        <DisplayHeading size={42} style={{ color: "#f3efe8" }}>
                            ¿En qué te <em className="text-italic-serif text-brand-500">ayudo</em> hoy, {firstName}?
                        </DisplayHeading>
                        <p className="text-sm text-slate-400 max-w-md mx-auto">
                            Puedes pedirme reportar una filtración, agendar un quincho, revisar tu cobro de gastos comunes o consultar reglamentos.
                        </p>
                    </div>
                ) : (
                    /* Messages Flow */
                    <div className="space-y-6 py-4 flex-1 overflow-y-auto max-h-[calc(100vh-18rem)] pr-2">
                        {msgs.map((msg) => {
                            const isAssistant = msg.role === "assistant";
                            return (
                                <div key={msg.id} className={`flex gap-4 ${isAssistant ? "justify-start" : "justify-end animate-fade-in"}`}>
                                    {isAssistant && (
                                        <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 mt-1">
                                            <Bot className="h-5 w-5 text-brand-400" />
                                        </div>
                                    )}
                                    <div className="flex flex-col gap-2 max-w-[80%] min-w-0">
                                        <div 
                                            className={`px-4 py-3.5 rounded-2xl text-sm leading-relaxed break-words whitespace-pre-wrap ${
                                                isAssistant 
                                                    ? "bg-white/5 border border-white/10 text-slate-200" 
                                                    : "bg-brand-500 text-white shadow-lg"
                                            }`}
                                        >
                                            <CoCoMarkdown text={msg.text} />
                                        </div>
                                        {msg.nav && (
                                            <div className="mt-1 flex justify-start">
                                                <a 
                                                    href={msg.nav}
                                                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-400 hover:text-brand-300 transition-colors"
                                                >
                                                    Ir a la sección <ArrowRight className="h-3 w-3" />
                                                </a>
                                            </div>
                                        )}
                                    </div>
                                    {!isAssistant && (
                                        <div className="w-9 h-9 rounded-xl bg-brand-500/20 text-brand-400 border border-brand-500/30 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-1">
                                            {user?.name?.charAt(0).toUpperCase() || "U"}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {loading && (
                            <div className="flex gap-4 justify-start">
                                <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
                                    <Bot className="h-5 w-5 text-brand-400" />
                                </div>
                                <div className="bg-white/5 border border-white/10 rounded-2xl px-5 py-4 flex gap-1.5 items-center">
                                    {[0, 150, 300].map(d => (
                                        <span key={d} className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                                    ))}
                                </div>
                            </div>
                        )}
                        <div ref={bottomRef} />
                    </div>
                )}

                {/* Suggestion Chips & Input bar */}
                <div className="space-y-4 border-t border-white/5 pt-6 bg-[#0E0B08]">
                    {/* Suggestion Chips */}
                    {msgs.length <= 2 && (
                        <div className="flex flex-wrap gap-2 justify-center">
                            {CHIPS.map(chip => {
                                const Icon = chip.icon;
                                return (
                                    <button
                                        key={chip.label}
                                        onClick={() => send(chip.label)}
                                        className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/5 border border-white/10 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
                                    >
                                        <Icon className="h-3.5 w-3.5 text-brand-400" />
                                        {chip.label}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Input Bar: rounded pill with send button in copper */}
                    <form 
                        onSubmit={(e) => { e.preventDefault(); send(input); }}
                        className="relative flex items-center max-w-3xl w-full mx-auto"
                    >
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Pregúntale a CoCo..."
                            disabled={loading}
                            className="w-full h-14 pl-6 pr-16 rounded-full bg-white/5 border border-white/10 text-slate-200 placeholder:text-slate-500 text-sm font-medium outline-none transition-all focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                        />
                        <button
                            type="submit"
                            disabled={loading || !input.trim()}
                            className="absolute right-2 h-10 w-10 rounded-full bg-brand-500 text-white flex items-center justify-center hover:bg-brand-600 transition-colors disabled:opacity-40 shadow-md"
                        >
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </button>
                    </form>
                </div>

            </div>
        </div>
    );
}
