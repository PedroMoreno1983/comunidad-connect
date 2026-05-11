"use client";
/* eslint-disable @next/next/no-img-element -- Chat renders user avatars stored in Supabase. */

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Hash, Loader2, MessageCircle, Search, Send, Users } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { supabase } from "@/lib/supabase";
import { ChatService } from "@/lib/services/supabaseServices";
import { ChatMessage, Conversation } from "@/lib/types";
import { useToast } from "@/components/ui/Toast";
import { EmptyState } from "@/components/ui/EmptyState";
import {
    createDemoChatMessage,
    demoChatNeighbors,
    getDemoConversations,
    getDemoDirectMessages,
    getDemoGlobalMessages,
    saveDemoChatMessage,
} from "@/lib/services/demoChatStorage";

type ChatMode = "global" | "direct";
type Neighbor = { id: string; name: string; avatar_url?: string };

function initials(name?: string) {
    return (name || "?").trim().charAt(0).toUpperCase();
}

function timeLabel(value: string) {
    return new Date(value).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
}

export default function ChatPage() {
    const { user } = useAuth();
    const { toast } = useToast();

    const [mode, setMode] = useState<ChatMode>("global");
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [isSending, setIsSending] = useState(false);
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [activePeer, setActivePeer] = useState<Conversation | null>(null);
    const [neighbors, setNeighbors] = useState<Neighbor[]>([]);
    const [searchTerm, setSearchTerm] = useState("");

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);
    const isDemoUser = user?.email.toLowerCase().endsWith("@demo.com") ?? false;

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    useEffect(() => {
        if (mode === "global") {
            loadGlobalMessages();
        } else {
            loadConversations();
            loadNeighbors();
            setIsLoading(false);
        }

        return () => {
            subscriptionRef.current?.unsubscribe();
        };
        // Subscriptions are intentionally rebound only when the mode changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode]);

    useEffect(() => {
        if (!activePeer || !user) return;
        loadDirectMessages(activePeer.peerId);
        // Direct messages are intentionally loaded when the selected peer changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activePeer]);

    const loadGlobalMessages = async () => {
        setIsLoading(true);
        setMessages([]);
        subscriptionRef.current?.unsubscribe();

        if (isDemoUser) {
            setMessages(getDemoGlobalMessages(user?.name));
            setIsLoading(false);
            return;
        }

        try {
            const data = await ChatService.getGlobalMessages();
            setMessages(data as unknown as ChatMessage[]);
            subscriptionRef.current = ChatService.subscribeToGlobalChat((newMsg: ChatMessage) => {
                setMessages(prev => [...prev, newMsg]);
            });
        } catch (error) {
            console.error("[Chat] global load failed:", error);
            setMessages([]);
            toast({ title: "No se pudo cargar el chat", description: "Revisa la conexión e intenta nuevamente.", variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    };

    const loadConversations = async () => {
        if (!user) return;
        if (isDemoUser) {
            setConversations(getDemoConversations());
            return;
        }

        try {
            const data = await ChatService.getConversations(user.id);
            setConversations(data);
        } catch (error) {
            console.error("[Chat] conversations load failed:", error);
            setConversations([]);
        }
    };

    const loadNeighbors = async () => {
        if (!user) return;
        if (isDemoUser) {
            setNeighbors(demoChatNeighbors);
            return;
        }

        const { data, error } = await supabase
            .from("profiles")
            .select("id, name, avatar_url")
            .neq("id", user.id)
            .order("name");

        if (error) {
            console.error("[Chat] neighbors load failed:", error);
            setNeighbors([]);
            return;
        }
        setNeighbors(data || []);
    };

    const loadDirectMessages = async (peerId: string) => {
        if (!user) return;
        setIsLoading(true);
        setMessages([]);
        subscriptionRef.current?.unsubscribe();

        if (isDemoUser) {
            setMessages(getDemoDirectMessages(user, peerId));
            setIsLoading(false);
            return;
        }

        try {
            const data = await ChatService.getDirectMessages(user.id, peerId);
            setMessages(data as unknown as ChatMessage[]);
            subscriptionRef.current = ChatService.subscribeToDirectChat(user.id, peerId, (newMsg: ChatMessage) => {
                setMessages(prev => [...prev, newMsg]);
            });
        } catch (error) {
            console.error("[Chat] direct load failed:", error);
            setMessages([]);
            toast({ title: "No se pudo cargar la conversación", description: "Intenta nuevamente en unos segundos.", variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    };

    const openDirectChat = (neighbor: Neighbor) => {
        setActivePeer({
            peerId: neighbor.id,
            peerProfile: { name: neighbor.name, avatar_url: neighbor.avatar_url },
            lastMessage: "",
            lastAt: "",
        });
    };

    const handleSendMessage = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!user || !newMessage.trim()) return;

        setIsSending(true);
        const content = newMessage.trim();

        try {
            if (isDemoUser) {
                const optimisticMessage = createDemoChatMessage(user, content, mode === "direct" ? activePeer?.peerId : undefined);
                saveDemoChatMessage(optimisticMessage);
                setMessages(prev => [...prev, optimisticMessage]);
                if (mode === "direct") setConversations(getDemoConversations());
                setNewMessage("");
                return;
            }

            if (mode === "global") {
                await ChatService.sendMessage({ sender_id: user.id, content });
            } else if (activePeer) {
                await ChatService.sendMessage({ sender_id: user.id, receiver_id: activePeer.peerId, content });
            }
            setNewMessage("");
        } catch (error) {
            console.error("[Chat] send failed:", error);
            toast({ title: "No se pudo enviar", description: "El mensaje no salió. Intenta nuevamente.", variant: "destructive" });
        } finally {
            setIsSending(false);
        }
    };

    const filteredNeighbors = useMemo(
        () => neighbors.filter(neighbor => (neighbor.name || "").toLowerCase().includes(searchTerm.toLowerCase())),
        [neighbors, searchTerm]
    );

    const title = mode === "global" ? "Canal general" : activePeer?.peerProfile.name || "Mensajes directos";
    const subtitle = mode === "global" ? "Conversación visible para toda la comunidad" : activePeer ? "Conversación privada" : "Selecciona un vecino para comenzar";
    const canWrite = mode === "global" || Boolean(activePeer);

    return (
        <div className="flex h-[calc(100vh-8rem)] min-h-[620px] flex-col overflow-hidden rounded-lg border border-subtle bg-surface shadow-sm">
            <header className="border-b border-subtle bg-surface px-4 py-4 sm:px-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">Comunidad</p>
                        <h1 className="mt-1 text-2xl font-semibold cc-text-primary">Mensajería</h1>
                    </div>
                    <div className="grid w-full grid-cols-2 gap-1 rounded-lg border border-subtle bg-canvas p-1 lg:w-auto">
                        <ModeButton active={mode === "global"} onClick={() => { setMode("global"); setActivePeer(null); }} icon={<Hash className="h-4 w-4" />} label="General" />
                        <ModeButton active={mode === "direct"} onClick={() => setMode("direct")} icon={<MessageCircle className="h-4 w-4" />} label="Directos" />
                    </div>
                </div>
            </header>

            <div className="grid min-h-0 flex-1 lg:grid-cols-[320px_1fr]">
                <aside className={clsx(
                    "min-h-0 border-b border-subtle bg-canvas/60 lg:border-b-0 lg:border-r",
                    mode === "global" ? "hidden lg:block" : "block"
                )}>
                    <div className="flex h-full flex-col">
                        {mode === "global" ? (
                            <div className="p-4">
                                <div className="rounded-lg border border-brand-200 bg-brand-50 p-4">
                                    <Hash className="h-5 w-5 text-brand-600" />
                                    <p className="mt-3 text-sm font-semibold cc-text-primary">Canal general</p>
                                    <p className="mt-1 text-xs leading-5 cc-text-secondary">Usa este canal para coordinación comunitaria y mensajes visibles para todos.</p>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="border-b border-subtle p-4">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                        <input
                                            type="text"
                                            placeholder="Buscar vecino"
                                            value={searchTerm}
                                            onChange={event => setSearchTerm(event.target.value)}
                                            className="w-full rounded-md border border-subtle bg-surface py-2.5 pl-9 pr-3 text-sm outline-none transition-colors focus:border-brand-500"
                                        />
                                    </div>
                                </div>

                                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                                    {conversations.length > 0 && (
                                        <ContactSection title="Recientes">
                                            {conversations.map(conversation => (
                                                <ContactButton
                                                    key={conversation.peerId}
                                                    active={activePeer?.peerId === conversation.peerId}
                                                    name={conversation.peerProfile?.name}
                                                    avatarUrl={conversation.peerProfile?.avatar_url}
                                                    subtitle={conversation.lastMessage || "Sin mensajes recientes"}
                                                    onClick={() => setActivePeer(conversation)}
                                                />
                                            ))}
                                        </ContactSection>
                                    )}

                                    <ContactSection title="Vecinos">
                                        {filteredNeighbors.length === 0 ? (
                                            <div className="rounded-lg border border-subtle bg-surface p-4 text-center text-sm cc-text-secondary">
                                                No encontramos vecinos con ese nombre.
                                            </div>
                                        ) : (
                                            filteredNeighbors.map(neighbor => (
                                                <ContactButton
                                                    key={neighbor.id}
                                                    active={activePeer?.peerId === neighbor.id}
                                                    name={neighbor.name}
                                                    avatarUrl={neighbor.avatar_url}
                                                    onClick={() => openDirectChat(neighbor)}
                                                />
                                            ))
                                        )}
                                    </ContactSection>
                                </div>
                            </>
                        )}
                    </div>
                </aside>

                <section className="flex min-h-0 flex-col">
                    <div className="flex h-20 items-center justify-between border-b border-subtle bg-surface px-4 py-4 sm:px-6">
                        <div className="flex min-w-0 items-center gap-3">
                            {mode === "direct" && activePeer && (
                                <button onClick={() => setActivePeer(null)} className="rounded-md p-2 cc-text-secondary transition-colors hover:bg-elevated lg:hidden" aria-label="Volver a vecinos">
                                    <ArrowLeft className="h-5 w-5" />
                                </button>
                            )}
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-white">
                                {mode === "global" ? <Hash className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
                            </div>
                            <div className="min-w-0">
                                <h2 className="truncate text-base font-semibold cc-text-primary">{title}</h2>
                                <p className="truncate text-xs cc-text-secondary">{subtitle}</p>
                            </div>
                        </div>
                    </div>

                    {mode === "direct" && !activePeer ? (
                        <div className="flex flex-1 items-center justify-center p-6">
                            <EmptyState
                                icon={<MessageCircle className="h-6 w-6" />}
                                title="Elige una conversación"
                                description="Busca un vecino o selecciona una conversación reciente para enviar un mensaje privado."
                                tone="brand"
                                dashed={false}
                            />
                        </div>
                    ) : (
                        <>
                            <div className="min-h-0 flex-1 overflow-y-auto bg-canvas/30 p-4 sm:p-6">
                                {isLoading ? (
                                    <div className="flex h-full items-center justify-center">
                                        <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
                                    </div>
                                ) : (
                                    <AnimatePresence initial={false}>
                                        {messages.length === 0 ? (
                                            <div className="flex h-full items-center justify-center">
                                                <EmptyState
                                                    icon={<Users className="h-6 w-6" />}
                                                    title={mode === "global" ? "Aún no hay conversación" : "Sin mensajes todavía"}
                                                    description={mode === "global" ? "Escribe el primer mensaje para abrir la conversación comunitaria." : "Envía un saludo o coordina algo concreto con este vecino."}
                                                    tone="neutral"
                                                    dashed={false}
                                                />
                                            </div>
                                        ) : (
                                            <div className="space-y-5">
                                                {messages.map((message, index) => (
                                                    <MessageBubble
                                                        key={message.id}
                                                        message={message}
                                                        previous={messages[index - 1]}
                                                        next={messages[index + 1]}
                                                        isMe={message.sender_id === user?.id}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </AnimatePresence>
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            <form onSubmit={handleSendMessage} className="border-t border-subtle bg-surface p-4">
                                <div className="mx-auto flex max-w-4xl items-center gap-3">
                                    <input
                                        type="text"
                                        value={newMessage}
                                        onChange={event => setNewMessage(event.target.value)}
                                        placeholder={mode === "global" ? "Escribe al canal general..." : `Escribe a ${activePeer?.peerProfile.name}...`}
                                        disabled={!canWrite}
                                        className="min-w-0 flex-1 rounded-md border border-subtle bg-canvas px-4 py-3 text-sm font-medium outline-none transition-colors focus:border-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
                                    />
                                    <button
                                        type="submit"
                                        disabled={!newMessage.trim() || isSending || !canWrite}
                                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-brand-500 text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
                                        aria-label="Enviar mensaje"
                                    >
                                        {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                    </button>
                                </div>
                            </form>
                        </>
                    )}
                </section>
            </div>
        </div>
    );
}

function ModeButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={clsx(
                "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition-colors",
                active ? "bg-slate-950 text-white" : "cc-text-secondary hover:bg-surface hover:text-slate-900"
            )}
        >
            {icon}
            {label}
        </button>
    );
}

function ContactSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="mb-5">
            <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.12em] cc-text-tertiary">{title}</p>
            <div className="space-y-1">{children}</div>
        </div>
    );
}

function ContactButton({
    active,
    name,
    avatarUrl,
    subtitle,
    onClick,
}: {
    active: boolean;
    name?: string;
    avatarUrl?: string;
    subtitle?: string;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={clsx(
                "flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors",
                active ? "border-brand-300 bg-brand-50" : "border-transparent hover:border-subtle hover:bg-surface"
            )}
        >
            <Avatar name={name} avatarUrl={avatarUrl} />
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold cc-text-primary">{name || "Vecino"}</span>
                {subtitle && <span className="block truncate text-xs cc-text-secondary">{subtitle}</span>}
            </span>
        </button>
    );
}

function Avatar({ name, avatarUrl }: { name?: string; avatarUrl?: string }) {
    return (
        <span className="flex h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-elevated">
            {avatarUrl ? (
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
                <span className="flex h-full w-full items-center justify-center text-xs font-semibold cc-text-secondary">{initials(name)}</span>
            )}
        </span>
    );
}

function MessageBubble({
    message,
    previous,
    next,
    isMe,
}: {
    message: ChatMessage;
    previous?: ChatMessage;
    next?: ChatMessage;
    isMe: boolean;
}) {
    const showAvatar = !isMe && previous?.sender_id !== message.sender_id;
    const showTimestamp =
        !next ||
        new Date(next.created_at).getTime() - new Date(message.created_at).getTime() > 5 * 60 * 1000;

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={clsx("flex flex-col", isMe ? "items-end" : "items-start")}
        >
            <div className={clsx("flex max-w-[88%] items-end gap-2 lg:max-w-[70%]", isMe && "flex-row-reverse")}>
                {!isMe && (
                    <span className="mb-1 h-9 w-9 shrink-0">
                        {showAvatar ? <Avatar name={message.profiles?.name} avatarUrl={message.profiles?.avatar_url} /> : null}
                    </span>
                )}
                <div className="min-w-0">
                    {!isMe && showAvatar && (
                        <p className="mb-1 ml-1 text-[11px] font-semibold cc-text-tertiary">{message.profiles?.name || "Vecino"}</p>
                    )}
                    <div
                        className={clsx(
                            "break-words rounded-lg px-4 py-3 text-sm font-medium leading-relaxed shadow-sm",
                            isMe ? "bg-slate-950 text-white" : "border border-subtle bg-surface cc-text-primary"
                        )}
                    >
                        {message.content}
                    </div>
                </div>
            </div>
            {showTimestamp && (
                <span className="mx-10 mt-1.5 text-[10px] font-semibold cc-text-tertiary">{timeLabel(message.created_at)}</span>
            )}
        </motion.div>
    );
}
