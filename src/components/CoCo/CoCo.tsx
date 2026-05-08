"use client";
/* eslint-disable @next/next/no-img-element -- CoCo can render generated/base64 case images and uploaded attachments. */

import { useState, useRef, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Loader2, ChevronDown, Sparkles, Calendar, DollarSign, Hash, Paperclip, Bot } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { getApiUrl } from "@/lib/config";
import { useToast } from "@/components/ui/Toast";
import confetti from "canvas-confetti";

interface Message {
    id: string;
    role: "user" | "assistant";
    text: string;
    nav?: string;
    action?: string;
    imageBase64?: string;
    case?: {
        created: boolean;
        id?: string;
        title?: string;
        type?: string;
        category?: string;
        urgency?: "baja" | "media" | "alta" | "emergencia";
        status?: string;
    };
}

const NAV_MAP: Record<string, string> = {
    "/home": "Inicio", "/social": "Muro Social", "/chat": "Comunidad",
    "/directorio": "Directorio", "/amenities": "Espacios Comunes",
    "/expenses": "Mis Gastos", "/feed": "Avisos Oficiales",
    "/profile": "Mi Perfil", "/votaciones": "Votaciones",
    "/resident/finances": "Mis Gastos", "/resident/supermercado": "Supermercado",
    "/resident/cases": "Mis Casos CoCo",
};

const QUICK = [
    { label: "¿Cómo reservo un espacio?", icon: Calendar },
    { label: "¿Cómo pago mis gastos?", icon: DollarSign },
    { label: "¿Cómo envío un mensaje?", icon: Hash },
    { label: "Muéstrame el tour", icon: Sparkles },
];

export default function CoCo() {
    const { user, logout } = useAuth();
    const { toast } = useToast();
    const [mounted, setMounted] = useState(false);
    const [open, setOpen] = useState(false);
    const [msgs, setMsgs] = useState<Message[]>([{
        id: "w", role: "assistant",
        text: "Hola. Soy **CoCo**, tu asistente operativo de ComunidadConnect. ¿En qué te puedo ayudar?",
    }]);
    const [input, setInput] = useState("");
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    
    const bottomRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => { setMounted(true); }, []);
    useEffect(() => {
        const handleCompose = (event: Event) => {
            const detail = (event as CustomEvent<{ message?: string }>).detail;
            setOpen(true);
            if (detail?.message) setInput(detail.message);
        };

        window.addEventListener("coco:compose", handleCompose);
        return () => window.removeEventListener("coco:compose", handleCompose);
    }, []);
    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

    if (!mounted || !user) return null;

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        // Limit to 5MB roughly
        if (file.size > 5 * 1024 * 1024) {
            toast({ title: "Imagen demasiado grande", description: "El máximo es 5MB.", variant: "destructive" });
            return;
        }

        const reader = new FileReader();
        reader.onload = (evt) => setSelectedImage(evt.target?.result as string);
        reader.readAsDataURL(file);
    };

    const removeImage = () => {
        setSelectedImage(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const send = async (text: string, imageStr: string | null = selectedImage) => {
        if ((!text.trim() && !imageStr) || loading) return;

        setMsgs(p => [...p, { 
            id: Date.now().toString(), 
            role: "user", 
            text, 
            imageBase64: imageStr || undefined 
        }]);
        
        setInput("");
        removeImage();
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
                    message: text || "Mira esta imagen",
                    imageBase64: imageStr,
                    history: history,
                    currentPage: pathname,
                    userName: user?.email || "Residente",
                    userRole: user?.role || "resident",
                    userId: user?.id,
                    unitId: user?.unitId,
                    unitName: user?.unitName,
                    communityId: user?.communityId,
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
                case: d.case?.created ? d.case : undefined,
            }]);
            
            if (d.navigate) setTimeout(() => router.push(d.navigate), 800);
            
            // Handle UI actions
            if (d.action) {
                setTimeout(() => {
                    switch (d.action) {
                        case 'THEME_DARK':
                            document.documentElement.classList.add('dark');
                            localStorage.setItem('theme', 'dark');
                            break;
                        case 'THEME_LIGHT':
                            document.documentElement.classList.remove('dark');
                            localStorage.setItem('theme', 'light');
                            break;
                        case 'LOGOUT':
                            logout();
                            router.push('/');
                            break;
                        case 'CONFETTI':
                            confetti({ zIndex: 99999, particleCount: 150, spread: 80 });
                            break;
                        case 'SCROLL_TOP':
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                            break;
                        case 'TEXT_ENLARGE':
                            document.documentElement.style.fontSize = '125%';
                            break;
                        case 'TEXT_NORMAL':
                            document.documentElement.style.fontSize = '';
                            break;
                        case 'READ_ALOUD':
                            if ('speechSynthesis' in window) {
                                window.speechSynthesis.cancel(); // Stop any previous
                                const utterance = new SpeechSynthesisUtterance(d.reply.replace(/\*\*/g, '').replace(/\[.*\]\(.*\)/g, ''));
                                utterance.lang = 'es-CL';
                                utterance.rate = 1.05;
                                window.speechSynthesis.speak(utterance);
                            }
                            break;
                    }
                }, 500); // 500ms delay to feel natural after message
            }
        } catch (err: unknown) {
            const error = err as Error;
            console.error("CoCo connection failed details:", error);
            const errorMsg = error.message || "Tuve un problema de conexión 😅";
            setMsgs(p => [...p, { id: (Date.now() + 1).toString(), role: "assistant", text: `${errorMsg} Inténtalo de nuevo.` }]);
        } finally { setLoading(false); }
    };

    const fmt = (t: string) => t.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br/>");

    return (
        <div
            className="fixed right-4 top-16 z-[2147483647] flex flex-col items-end gap-3 sm:bottom-6 sm:right-6 sm:top-auto"
        >
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 12 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 12 }}
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                        className="flex flex-col overflow-hidden rounded-lg border border-subtle bg-surface"
                        style={{ width: "min(360px, calc(100vw - 32px))", height: "min(500px, calc(100vh - 96px))", boxShadow: "0 18px 48px rgba(17,24,39,0.16)" }}
                    >
                        {/* Header */}
                        <div className="flex items-center gap-3 px-5 py-4 bg-slate-950 flex-shrink-0">
                            <div className="w-10 h-10 rounded-lg bg-white/10 backdrop-blur flex items-center justify-center flex-shrink-0">
                                <Bot className="h-5 w-5 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-white">CoCo</p>
                                <p className="text-white/70 text-[11px] font-medium">Asistente operativo</p>
                            </div>
                            <button onClick={() => setOpen(false)} className="p-1.5 hover:bg-white/20 rounded-xl transition-colors flex-shrink-0">
                                <ChevronDown className="h-5 w-5 text-white" />
                            </button>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-canvas">
                            {msgs.map(msg => (
                                <div key={msg.id} className={`flex gap-2 w-full ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                                    {msg.role === "assistant" && (
                                        <div className="w-7 h-7 rounded-lg bg-slate-900 flex items-center justify-center flex-shrink-0 mt-1"><Bot className="h-4 w-4 text-white" /></div>
                                    )}
                                    <div className="flex flex-col gap-2 max-w-[80%] min-w-0">
                                        {msg.imageBase64 && (
                                            <div className="rounded-lg overflow-hidden border border-subtle shadow-sm">
                                                <img src={msg.imageBase64} alt="Upload" className="w-full h-auto object-cover max-h-48" />
                                            </div>
                                        )}
                                        {msg.text && (
                                            <div
                                                className={`px-3.5 py-2.5 rounded-lg text-sm leading-relaxed break-words whitespace-pre-wrap ${msg.role === "user"
                                                    ? "bg-brand-500 text-white"
                                                    : "bg-surface cc-text-primary shadow-sm border border-subtle"
                                                    }`}
                                                dangerouslySetInnerHTML={{ __html: fmt(msg.text) }}
                                            />
                                        )}
                                        {msg.role === "assistant" && msg.case?.created && (
                                            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-[11px] font-bold text-emerald-700 shadow-sm dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                                                Caso registrado: {msg.case.title || msg.case.id}
                                                {msg.case.urgency && (
                                                    <span className="ml-2 rounded-full bg-white/70 px-2 py-0.5 uppercase tracking-wide dark:bg-black/20">
                                                        {msg.case.urgency}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    {msg.role === "user" && (
                                        <div className="w-7 h-7 rounded-lg bg-elevated flex items-center justify-center text-xs font-black cc-text-secondary flex-shrink-0 mt-1">U</div>
                                    )}
                                </div>
                            ))}
                            {msgs[msgs.length - 1]?.nav && (
                                <button
                                    onClick={() => router.push(msgs[msgs.length - 1]!.nav!)}
                                    className="ml-9 text-xs font-bold text-brand-600 bg-brand-50 px-3 py-1.5 rounded-lg border border-brand-200 hover:bg-brand-100 transition-colors"
                                >
                                    Ir a {NAV_MAP[msgs[msgs.length - 1]!.nav!] || msgs[msgs.length - 1]!.nav} →
                                </button>
                            )}
                            {loading && (
                                <div className="flex gap-2">
                                    <div className="w-7 h-7 rounded-lg bg-slate-900 flex items-center justify-center flex-shrink-0"><Bot className="h-4 w-4 text-white" /></div>
                                    <div className="bg-surface rounded-lg px-4 py-3 border border-subtle flex gap-1.5">
                                        {[0, 150, 300].map(d => <span key={d} className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
                                    </div>
                                </div>
                            )}
                            <div ref={bottomRef} />
                        </div>

                        {/* Quick actions */}
                        {msgs.length === 1 && (
                            <div className="px-3 py-2 flex flex-wrap gap-1.5 bg-canvas border-t border-subtle flex-shrink-0">
                                {QUICK.map(({ label, icon: Icon }) => (
                                    <button key={label} onClick={() => send(label, null)}
                                        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-surface rounded-lg text-[11px] font-semibold cc-text-secondary border border-subtle hover:border-brand-300 hover:text-brand-600 transition-colors">
                                        <Icon className="h-3 w-3" />{label}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Input Area */}
                        <div className="bg-surface border-t border-subtle flex-shrink-0">
                            {/* Image Preview Area */}
                            {selectedImage && (
                                <div className="px-3 pt-3 pb-1 flex relative">
                                    <div className="relative inline-block border-2 border-brand-200 rounded-lg overflow-hidden shadow-sm">
                                        <img src={selectedImage} alt="Preview" className="h-16 w-16 object-cover" />
                                        <button 
                                            onClick={removeImage}
                                            className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 hover:bg-black transition-colors"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </div>
                                </div>
                            )}

                            <form onSubmit={e => { e.preventDefault(); send(input, selectedImage); }} className="flex gap-2 p-3">
                                {/* Hidden file input */}
                                <input 
                                    type="file" 
                                    accept="image/*" 
                                    className="hidden" 
                                    ref={fileInputRef}
                                    onChange={handleFileSelect}
                                />
                                
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={loading}
                                    className="p-2.5 text-slate-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-40"
                                >
                                    <Paperclip className="h-5 w-5" />
                                </button>

                                <input
                                    value={input} onChange={e => setInput(e.target.value)}
                                    placeholder={selectedImage ? "Añade un comentario..." : "Pregúntale a CoCo..."}
                                    className="flex-1 px-3.5 py-2.5 rounded-lg bg-elevated text-sm font-medium outline-none focus:ring-2 focus:ring-brand-400/30"
                                />
                                
                                <button type="submit" disabled={(!input.trim() && !selectedImage) || loading}
                                    className="p-2.5 bg-brand-500 rounded-lg text-white disabled:opacity-40 hover:bg-brand-600 transition-colors shadow-md flex-shrink-0">
                                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                </button>
                            </form>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* FAB */}
            <motion.button
                onClick={() => setOpen(o => !o)}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.94 }}
                className="relative flex items-center justify-center rounded-lg text-2xl"
                style={{
                    width: 56, height: 56,
                    background: "var(--cc-brand-500)",
                    boxShadow: "0 10px 30px rgba(244,91,61,0.32)"
                }}
            >
                <AnimatePresence mode="wait">
                    {open
                        ? <motion.span key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}><X className="h-6 w-6 text-white" /></motion.span>
                        : <motion.span key="g" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }}><Bot className="h-6 w-6 text-white" /></motion.span>
                    }
                </AnimatePresence>

            </motion.button>
        </div>
    );
}
