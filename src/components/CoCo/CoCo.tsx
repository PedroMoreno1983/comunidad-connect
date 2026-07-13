"use client";
/* eslint-disable @next/next/no-img-element -- CoCo can render generated/base64 case images and uploaded attachments. */

import { useState, useRef, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { X, Send, Loader2, ChevronDown, Sparkles, Calendar, DollarSign, Hash, Paperclip, Bot, ShieldCheck, Check, XCircle } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { getApiUrl } from "@/lib/config";
import { useToast } from "@/components/ui/Toast";
import confetti from "canvas-confetti";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface PendingAction {
    toolUseId: string;
    name: string;
    input: Record<string, unknown>;
    title: string;
    summary: string;
}

interface Message {
    id: string;
    role: "user" | "assistant";
    text: string;
    nav?: string;
    action?: string;
    imageBase64?: string;
    pendingActions?: PendingAction[];
    resolvedActions?: Record<string, "approved" | "rejected">;
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

const HIDDEN_NAV_ROUTES = new Set(["/resident/supermercado", "/showcase", "/marketing/reels"]);

function getSafeNavigation(target?: string): string | undefined {
    return target && target in NAV_MAP && !HIDDEN_NAV_ROUTES.has(target) ? target : undefined;
}

const QUICK = [
    { label: "¿Cómo reservo un espacio?", icon: Calendar },
    { label: "¿Cómo pago mis gastos?", icon: DollarSign },
    { label: "¿Cómo envío un mensaje?", icon: Hash },
    { label: "Muéstrame el tour", icon: Sparkles },
];

function CoCoMarkdown({ text }: { text: string }) {
    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
                p: ({ children }) => <p className="text-sm leading-relaxed">{children}</p>,
                strong: ({ children }) => <strong className="font-black text-current">{children}</strong>,
                ul: ({ children }) => <ul className="list-disc space-y-1 pl-4 text-sm leading-relaxed">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal space-y-1 pl-4 text-sm leading-relaxed">{children}</ol>,
                a: ({ children, href }) => (
                    <a href={href} target="_blank" rel="noreferrer" className="font-bold underline decoration-current/30 underline-offset-4">
                        {children}
                    </a>
                ),
            }}
        >
            {text}
        </ReactMarkdown>
    );
}

export default function CoCo() {
    const { user, logout } = useAuth();
    const { toast } = useToast();
    const [mounted, setMounted] = useState(false);
    const [open, setOpen] = useState(false);
    const [msgs, setMsgs] = useState<Message[]>([{
        id: "w", role: "assistant",
        text: "Hola. Soy **CoCo**, tu asistente operativo de Convive Connect. ¿En qué te puedo ayudar?",
    }]);
    const hasUnresolvedPending = msgs.some(message =>
        message.pendingActions?.some(action => !message.resolvedActions?.[action.toolUseId]),
    );
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

    const postToCoCo = async (body: Record<string, unknown>) => {
        const res = await fetch(getApiUrl("/api/coco"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ currentPage: pathname, ...body }),
        });

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData.reply || `HTTP ${res.status}`);
        }

        return res.json();
    };

    const appendAssistantReply = (d: {
        reply?: string;
        navigate?: string;
        action?: string;
        pendingActions?: PendingAction[];
        case?: Message["case"];
    }) => {
        const safeNavigate = getSafeNavigation(d.navigate);
        setMsgs(p => [...p, {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            text: d.reply || (d.pendingActions?.length ? "" : "No pude responder."),
            nav: safeNavigate,
            action: d.action,
            pendingActions: d.pendingActions,
            case: d.case?.created ? d.case : undefined,
        }]);

        if (safeNavigate) {
            setTimeout(() => router.push(safeNavigate), 800);
        }

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
                        if ('speechSynthesis' in window && d.reply) {
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
    };

    const send = async (text: string, imageStr: string | null = selectedImage) => {
        if ((!text.trim() && !imageStr) || loading || hasUnresolvedPending) return;

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
            const d = await postToCoCo({ message: text || "Mira esta imagen", imageBase64: imageStr });
            appendAssistantReply(d);
        } catch (err: unknown) {
            const error = err as Error;
            console.error("CoCo connection failed details:", error);
            const errorMsg = error.message || "Tuve un problema de conexión 😅";
            setMsgs(p => [...p, { id: (Date.now() + 1).toString(), role: "assistant", text: `${errorMsg} Inténtalo de nuevo.` }]);
        } finally { setLoading(false); }
    };

    const resolveAction = async (
        messageId: string,
        pendingActions: PendingAction[],
        toolUseId: string,
        decision: "approved" | "rejected",
    ) => {
        if (loading) return;

        const resolutions: Record<string, "approved" | "rejected"> = Object.fromEntries(
            pendingActions.map(action => [
                action.toolUseId,
                action.toolUseId === toolUseId ? decision : "rejected",
            ]),
        );

        setMsgs(p => p.map(m => m.id === messageId
            ? { ...m, resolvedActions: resolutions }
            : m));
        setLoading(true);

        try {
            const d = await postToCoCo({ resolutions });
            appendAssistantReply(d);
        } catch (err: unknown) {
            setMsgs(p => p.map(m => m.id === messageId ? { ...m, resolvedActions: undefined } : m));
            const error = err as Error;
            console.error("CoCo connection failed details:", error);
            const errorMsg = error.message || "Tuve un problema de conexión 😅";
            setMsgs(p => [...p, { id: (Date.now() + 1).toString(), role: "assistant", text: `${errorMsg} Inténtalo de nuevo.` }]);
        } finally { setLoading(false); }
    };

    return (
        <div
            className="fixed bottom-4 right-4 z-[2147483647] flex flex-col items-end gap-3 sm:bottom-6 sm:right-6"
        >
            {open && (
                    <div
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
                                            >
                                                <CoCoMarkdown text={msg.text} />
                                            </div>
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
                                        {msg.role === "assistant" && msg.pendingActions?.map(pending => {
                                            const decision = msg.resolvedActions?.[pending.toolUseId];
                                            return (
                                                <div key={pending.toolUseId} className="rounded-lg border border-amber-200 bg-amber-50 p-3 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10">
                                                    <div className="flex items-start gap-2">
                                                        <ShieldCheck className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-700 dark:text-amber-300" />
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-xs font-black text-amber-800 dark:text-amber-200">{pending.title}</p>
                                                            <p className="mt-0.5 text-xs leading-snug text-amber-700/90 dark:text-amber-200/80">{pending.summary}</p>
                                                        </div>
                                                    </div>
                                                    {!decision ? (
                                                        <div className="mt-2.5 flex gap-2">
                                                            <button
                                                                onClick={() => resolveAction(msg.id, msg.pendingActions || [], pending.toolUseId, "approved")}
                                                                disabled={loading}
                                                                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-950 px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
                                                            >
                                                                <Check className="h-3.5 w-3.5" /> {(msg.pendingActions?.length || 0) > 1 ? "Aprobar solo esta" : "Aprobar"}
                                                            </button>
                                                            <button
                                                                onClick={() => resolveAction(msg.id, msg.pendingActions || [], pending.toolUseId, "rejected")}
                                                                disabled={loading}
                                                                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-amber-300 bg-white/70 px-3 py-1.5 text-[11px] font-bold text-amber-800 transition-colors hover:bg-white disabled:opacity-50 dark:bg-black/20 dark:text-amber-200"
                                                            >
                                                                <XCircle className="h-3.5 w-3.5" /> Rechazar
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <p className="mt-2 text-[11px] font-bold text-amber-700 dark:text-amber-300">
                                                            {decision === "approved" ? "✓ Aprobado" : "✕ Rechazado"}
                                                        </p>
                                                    )}
                                                </div>
                                            );
                                        })}
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
                                    disabled={loading || hasUnresolvedPending}
                                    className="p-2.5 text-slate-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-40"
                                >
                                    <Paperclip className="h-5 w-5" />
                                </button>

                                <input
                                    value={input} onChange={e => setInput(e.target.value)}
                                    placeholder={hasUnresolvedPending ? "Aprueba o rechaza la acción pendiente" : selectedImage ? "Añade un comentario..." : "Pregúntale a CoCo..."}
                                    className="flex-1 px-3.5 py-2.5 rounded-lg bg-elevated text-sm font-medium outline-none focus:ring-2 focus:ring-brand-400/30"
                                />
                                
                                <button type="submit" disabled={(!input.trim() && !selectedImage) || loading || hasUnresolvedPending}
                                    className="p-2.5 bg-brand-500 rounded-lg text-white disabled:opacity-40 hover:bg-brand-600 transition-colors shadow-md flex-shrink-0">
                                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                </button>
                            </form>
                        </div>
                    </div>
                )}

            {/* FAB */}
            <button
                onClick={() => setOpen(o => !o)}
                className="relative flex items-center justify-center rounded-lg text-2xl transition-transform hover:scale-105 active:scale-95"
                style={{
                    width: 56, height: 56,
                    background: "var(--cc-brand-500)",
                    boxShadow: "0 10px 30px rgba(244,91,61,0.32)"
                }}
            >
                {open ? <X className="h-6 w-6 text-white" /> : <Bot className="h-6 w-6 text-white" />}

            </button>
        </div>
    );
}
