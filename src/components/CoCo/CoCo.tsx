"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Loader2, ChevronDown, Sparkles, Calendar, DollarSign, Hash } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { getApiUrl } from "@/lib/config";

interface Message {
    id: string;
    role: "user" | "assistant";
    text: string;
    nav?: string;
}

const NAV_MAP: Record<string, string> = {
    "/home": "Inicio", "/social": "Muro Social", "/chat": "Comunidad",
    "/directorio": "Directorio", "/amenities": "Espacios Comunes",
    "/expenses": "Mis Gastos", "/feed": "Avisos Oficiales",
    "/profile": "Mi Perfil", "/votaciones": "Votaciones",
    "/resident/finances": "Mis Gastos", "/resident/supermercado": "Supermercado",
};

const QUICK = [
    { label: "¿Cómo reservo un espacio?", icon: Calendar },
    { label: "¿Cómo pago mis gastos?", icon: DollarSign },
    { label: "¿Cómo envío un mensaje?", icon: Hash },
    { label: "Muéstrame el tour", icon: Sparkles },
];

export default function CoCo() {
    const { user } = useAuth();
    const [mounted, setMounted] = useState(false);
    const [open, setOpen] = useState(false);
    const [msgs, setMsgs] = useState<Message[]>([{
        id: "w", role: "assistant",
        text: "Hola. Soy **CoCo**, tu asistente de ComunidadConnect. ¿En qué te puedo ayudar?",
    }]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => { setMounted(true); }, []);
    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

    if (!mounted || !user) return null;

    const send = async (text: string) => {
        if (!text.trim() || loading) return;
        setMsgs(p => [...p, { id: Date.now().toString(), role: "user", text }]);
        setInput("");
        setLoading(true);
        try {
            const res = await fetch(getApiUrl("/api/coco"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: text,
                    currentPage: pathname,
                    userName: user?.email || "Residente",
                    userRole: user?.role || "resident",
                }),
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.reply || `HTTP ${res.status}`);
            }

            const d = await res.json();
            setMsgs(p => [...p, { id: (Date.now() + 1).toString(), role: "assistant", text: d.reply || "No pude responder.", nav: d.navigate }]);
            if (d.navigate) setTimeout(() => router.push(d.navigate), 800);
        } catch (err: any) {
            console.error("CoCo error:", err);
            const errorMsg = err.message || "Tuve un problema de conexión 😅";
            setMsgs(p => [...p, { id: (Date.now() + 1).toString(), role: "assistant", text: `${errorMsg} Inténtalo de nuevo.` }]);
        } finally { setLoading(false); }
    };

    const fmt = (t: string) => t.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br/>");

    return (
        <div
            className="flex flex-col items-end gap-3"
            style={{ position: "fixed", bottom: "24px", right: "24px", zIndex: 2147483647 }}
        >
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 12 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 12 }}
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                        className="flex flex-col overflow-hidden rounded-3xl border border-pink-100 dark:border-slate-700 bg-white dark:bg-slate-900"
                        style={{ width: 360, height: 500, boxShadow: "0 20px 60px rgba(236,72,153,0.25)" }}
                    >
                        {/* Header */}
                        <div className="flex items-center gap-3 px-5 py-4 bg-gradient-to-r from-pink-500 via-rose-400 to-purple-500 flex-shrink-0">
                            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center text-xl flex-shrink-0">
                                👩‍💻
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-black text-white text-sm">CoCo</p>
                                <p className="text-white/70 text-[11px] font-medium">Asistente de ComunidadConnect ✨</p>
                            </div>
                            <button onClick={() => setOpen(false)} className="p-1.5 hover:bg-white/20 rounded-xl transition-colors flex-shrink-0">
                                <ChevronDown className="h-5 w-5 text-white" />
                            </button>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50 dark:bg-slate-950">
                            {msgs.map(msg => (
                                <div key={msg.id} className={`flex gap-2 w-full ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                                    {msg.role === "assistant" && (
                                        <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center text-sm flex-shrink-0 mt-1">👩‍💻</div>
                                    )}
                                    <div
                                        className={`max-w-[80%] min-w-0 px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed break-words whitespace-pre-wrap ${msg.role === "user"
                                            ? "bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-tr-sm"
                                            : "bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 shadow-sm border border-pink-100 dark:border-slate-700 rounded-tl-sm"
                                            }`}
                                        dangerouslySetInnerHTML={{ __html: fmt(msg.text) }}
                                    />
                                    {msg.role === "user" && (
                                        <div className="w-7 h-7 rounded-xl bg-slate-300 dark:bg-slate-600 flex items-center justify-center text-xs font-black text-white flex-shrink-0 mt-1">U</div>
                                    )}
                                </div>
                            ))}
                            {msgs[msgs.length - 1]?.nav && (
                                <button
                                    onClick={() => router.push(msgs[msgs.length - 1]!.nav!)}
                                    className="ml-9 text-xs font-bold text-pink-600 bg-pink-50 dark:bg-pink-500/10 px-3 py-1.5 rounded-xl border border-pink-100 hover:bg-pink-100 transition-colors"
                                >
                                    Ir a {NAV_MAP[msgs[msgs.length - 1]!.nav!] || msgs[msgs.length - 1]!.nav} →
                                </button>
                            )}
                            {loading && (
                                <div className="flex gap-2">
                                    <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center text-sm flex-shrink-0">👩‍💻</div>
                                    <div className="bg-white dark:bg-slate-800 rounded-2xl rounded-tl-sm px-4 py-3 border border-pink-100 dark:border-slate-700 flex gap-1.5">
                                        {[0, 150, 300].map(d => <span key={d} className="w-1.5 h-1.5 bg-pink-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
                                    </div>
                                </div>
                            )}
                            <div ref={bottomRef} />
                        </div>

                        {/* Quick actions */}
                        {msgs.length === 1 && (
                            <div className="px-3 py-2 flex flex-wrap gap-1.5 bg-slate-50 dark:bg-slate-950 border-t border-pink-100 dark:border-slate-800 flex-shrink-0">
                                {QUICK.map(({ label, icon: Icon }) => (
                                    <button key={label} onClick={() => send(label)}
                                        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white dark:bg-slate-800 rounded-xl text-[11px] font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-pink-300 hover:text-pink-600 transition-colors">
                                        <Icon className="h-3 w-3" />{label}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Input */}
                        <div className="px-3 py-3 bg-white dark:bg-slate-900 border-t border-pink-100 dark:border-slate-800 flex-shrink-0">
                            <form onSubmit={e => { e.preventDefault(); send(input); }} className="flex gap-2">
                                <input
                                    value={input} onChange={e => setInput(e.target.value)}
                                    placeholder="Pregúntale a CoCo..."
                                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-medium outline-none focus:ring-2 focus:ring-pink-400/30"
                                />
                                <button type="submit" disabled={!input.trim() || loading}
                                    className="p-2.5 bg-gradient-to-r from-pink-500 to-purple-500 rounded-xl text-white disabled:opacity-40 hover:scale-105 transition-transform shadow-md">
                                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                </button>
                            </form>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* FAB — girl emoji, pink gradient */}
            <motion.button
                onClick={() => setOpen(o => !o)}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.94 }}
                className="relative flex items-center justify-center rounded-2xl text-2xl"
                style={{
                    width: 56, height: 56,
                    background: "linear-gradient(135deg, #ec4899, #f43f5e, #a855f7)",
                    boxShadow: "0 8px 32px rgba(236,72,153,0.5)"
                }}
            >
                <AnimatePresence mode="wait">
                    {open
                        ? <motion.span key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}><X className="h-6 w-6 text-white" /></motion.span>
                        : <motion.span key="g" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} className="text-2xl">👩‍💻</motion.span>
                    }
                </AnimatePresence>

                {/* Pulse */}
                {!open && <span className="absolute inset-0 rounded-2xl animate-ping opacity-30" style={{ background: "linear-gradient(135deg,#ec4899,#a855f7)" }} />}

                {/* Label tooltip */}
                {!open && (
                    <span className="absolute right-full mr-3 px-3 py-1.5 bg-white dark:bg-slate-800 rounded-xl shadow-lg text-xs font-black text-pink-600 whitespace-nowrap border border-pink-100 pointer-events-none">
                        👋 ¡Hola! Soy CoCo
                    </span>
                )}
            </motion.button>
        </div>
    );
}
