"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Inbox, Loader2, MessageCircle, Package, Send, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { MarketplaceMessagingService } from "@/lib/api";
import {
    MarketplaceChatModalProps,
    MarketplaceConversation,
    MarketplaceMessage,
} from "@/lib/types";

function formatMessageTime(value: string) {
    return new Date(value).toLocaleTimeString("es-CL", {
        hour: "2-digit",
        minute: "2-digit",
    });
}

function formatConversationTime(value: string) {
    const date = new Date(value);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return formatMessageTime(value);
    return date.toLocaleDateString("es-CL", { day: "2-digit", month: "short" });
}

export function MarketplaceChatModal({
    initialItem,
    isOpen,
    onClose,
    currentUser,
}: MarketplaceChatModalProps) {
    const [conversations, setConversations] = useState<MarketplaceConversation[]>([]);
    const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
    const [messages, setMessages] = useState<MarketplaceMessage[]>([]);
    const [draft, setDraft] = useState("");
    const [loadingInbox, setLoadingInbox] = useState(false);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement | null>(null);

    const currentUserId = currentUser?.id;
    const initialItemId = initialItem?.id;
    const initialSellerId = initialItem?.sellerId;

    const selectedConversation = useMemo(
        () => conversations.find(conversation => conversation.id === selectedConversationId) || null,
        [conversations, selectedConversationId],
    );

    const refreshInbox = useCallback(async () => {
        const inbox = await MarketplaceMessagingService.listConversations();
        setConversations(inbox);
        return inbox;
    }, []);

    useEffect(() => {
        if (!isOpen || !currentUserId) return;

        let cancelled = false;
        setLoadingInbox(true);
        setError(null);

        const openInbox = async () => {
            try {
                let requestedConversationId: string | null = null;
                if (initialItemId && initialSellerId && initialSellerId !== currentUserId) {
                    requestedConversationId = await MarketplaceMessagingService.startConversation(initialItemId);
                }

                const inbox = await MarketplaceMessagingService.listConversations();
                if (cancelled) return;
                setConversations(inbox);
                setSelectedConversationId(previous => {
                    if (requestedConversationId) return requestedConversationId;
                    if (previous && inbox.some(conversation => conversation.id === previous)) return previous;
                    return inbox[0]?.id || null;
                });
            } catch (openError: unknown) {
                if (!cancelled) {
                    setError(openError instanceof Error ? openError.message : "No se pudo abrir la mensajería.");
                }
            } finally {
                if (!cancelled) setLoadingInbox(false);
            }
        };

        void openInbox();
        return () => {
            cancelled = true;
        };
    }, [currentUserId, initialItemId, initialSellerId, isOpen]);

    useEffect(() => {
        if (!isOpen || !selectedConversationId || !currentUserId) {
            setMessages([]);
            return;
        }

        let active = true;
        setLoadingMessages(true);
        setError(null);

        const loadMessages = async () => {
            try {
                const rows = await MarketplaceMessagingService.getMessages(selectedConversationId);
                if (!active) return;
                setMessages(rows);
                await MarketplaceMessagingService.markRead(selectedConversationId);
            } catch (messageError: unknown) {
                if (active) {
                    setError(messageError instanceof Error ? messageError.message : "No se pudieron cargar los mensajes.");
                }
            } finally {
                if (active) setLoadingMessages(false);
            }
        };

        void loadMessages();
        const unsubscribe = MarketplaceMessagingService.subscribeToConversation(
            selectedConversationId,
            message => {
                if (!active) return;
                setMessages(current => current.some(row => row.id === message.id) ? current : [...current, message]);
                if (message.senderId !== currentUserId) {
                    void MarketplaceMessagingService.markRead(selectedConversationId);
                }
                void refreshInbox();
            },
        );
        const pollingId = window.setInterval(() => {
            void loadMessages();
            void refreshInbox();
        }, 12000);

        return () => {
            active = false;
            window.clearInterval(pollingId);
            unsubscribe();
        };
    }, [currentUserId, isOpen, refreshInbox, selectedConversationId]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleSend = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!selectedConversationId || !draft.trim() || sending) return;

        setSending(true);
        setError(null);
        try {
            const message = await MarketplaceMessagingService.sendMessage(selectedConversationId, draft);
            setMessages(current => current.some(row => row.id === message.id) ? current : [...current, message]);
            setDraft("");
            await refreshInbox();
        } catch (sendError: unknown) {
            setError(sendError instanceof Error ? sendError.message : "No se pudo enviar el mensaje.");
        } finally {
            setSending(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={open => { if (!open) onClose(); }}>
            <DialogContent className="overflow-hidden rounded-xl border border-[var(--cc-line)] bg-[var(--cc-paper)] p-0 shadow-xl sm:max-w-5xl">
                <div className="flex h-[min(760px,85vh)] min-h-[560px] flex-col md:flex-row">
                    <aside className="flex max-h-56 flex-col border-b border-[var(--cc-line)] bg-[var(--cc-paper-warm)] md:max-h-none md:w-80 md:border-b-0 md:border-r">
                        <div className="border-b border-[var(--cc-line)] p-5">
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--cc-copper)] text-white">
                                    <Inbox className="h-5 w-5" />
                                </div>
                                <div>
                                    <DialogTitle className="text-lg font-semibold text-[var(--cc-ink)]">Mensajes</DialogTitle>
                                    <p className="text-xs text-[var(--cc-ink-secondary)]">Conversaciones del Marketplace</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-2">
                            {loadingInbox && conversations.length === 0 ? (
                                <div className="flex items-center justify-center gap-2 p-8 text-sm text-[var(--cc-ink-secondary)]">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Cargando conversaciones
                                </div>
                            ) : conversations.length === 0 ? (
                                <div className="p-6 text-center">
                                    <MessageCircle className="mx-auto h-8 w-8 text-[var(--cc-ink-faint)]" />
                                    <p className="mt-3 text-sm font-semibold text-[var(--cc-ink)]">Aún no hay conversaciones</p>
                                    <p className="mt-1 text-xs leading-5 text-[var(--cc-ink-secondary)]">
                                        Abre una publicación y escribe al vendedor para iniciar un contacto real.
                                    </p>
                                </div>
                            ) : conversations.map(conversation => (
                                <button
                                    key={conversation.id}
                                    type="button"
                                    onClick={() => setSelectedConversationId(conversation.id)}
                                    className={`mb-1 w-full rounded-lg border p-3 text-left transition-colors ${
                                        selectedConversationId === conversation.id
                                            ? "border-[var(--cc-copper)] bg-white"
                                            : "border-transparent hover:border-[var(--cc-line)] hover:bg-white/70"
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-semibold text-[var(--cc-ink)]">{conversation.peerName}</p>
                                            <p className="truncate text-xs font-medium text-[var(--cc-copper)]">{conversation.itemTitle}</p>
                                        </div>
                                        <span className="shrink-0 text-[10px] text-[var(--cc-ink-tertiary)]">
                                            {formatConversationTime(conversation.lastMessageAt)}
                                        </span>
                                    </div>
                                    <div className="mt-2 flex items-center justify-between gap-2">
                                        <p className="truncate text-xs text-[var(--cc-ink-secondary)]">
                                            {conversation.lastMessage || "Conversación iniciada"}
                                        </p>
                                        {conversation.unreadCount > 0 && (
                                            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--cc-copper)] px-1 text-[10px] font-bold text-white">
                                                {conversation.unreadCount}
                                            </span>
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </aside>

                    <section className="flex min-h-0 flex-1 flex-col bg-[var(--cc-paper)]">
                        {selectedConversation ? (
                            <>
                                <header className="flex items-center gap-3 border-b border-[var(--cc-line)] px-5 py-4">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--cc-sage-tint)] text-[var(--cc-sage)]">
                                        <Package className="h-5 w-5" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate font-semibold text-[var(--cc-ink)]">{selectedConversation.itemTitle}</p>
                                        <p className="truncate text-xs text-[var(--cc-ink-secondary)]">
                                            Conversación con {selectedConversation.peerName}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--cc-sage)]">
                                        <ShieldCheck className="h-4 w-4" />
                                        Privado
                                    </div>
                                </header>

                                <div className="flex-1 space-y-3 overflow-y-auto p-5">
                                    <div className="mx-auto max-w-md rounded-lg bg-[var(--cc-paper-warm)] px-4 py-3 text-center text-xs leading-5 text-[var(--cc-ink-secondary)]">
                                        Esta conversación está vinculada a la publicación y solo es visible para comprador y vendedor dentro de la comunidad.
                                    </div>
                                    {loadingMessages && messages.length === 0 ? (
                                        <div className="flex items-center justify-center gap-2 py-12 text-sm text-[var(--cc-ink-secondary)]">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Cargando mensajes
                                        </div>
                                    ) : messages.length === 0 ? (
                                        <div className="py-12 text-center">
                                            <MessageCircle className="mx-auto h-10 w-10 text-[var(--cc-ink-faint)]" />
                                            <p className="mt-3 font-semibold text-[var(--cc-ink)]">Inicia la conversación</p>
                                            <p className="mt-1 text-sm text-[var(--cc-ink-secondary)]">Pregunta por disponibilidad, entrega o una propuesta de intercambio.</p>
                                        </div>
                                    ) : (
                                        <AnimatePresence initial={false}>
                                            {messages.map(message => {
                                                const own = message.senderId === currentUserId;
                                                return (
                                                    <motion.div
                                                        key={message.id}
                                                        initial={{ opacity: 0, y: 8 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        className={`flex ${own ? "justify-end" : "justify-start"}`}
                                                    >
                                                        <div className={`max-w-[82%] rounded-xl px-4 py-3 text-sm leading-6 shadow-sm ${
                                                            own
                                                                ? "rounded-br-sm bg-[var(--cc-copper)] text-white"
                                                                : "rounded-bl-sm border border-[var(--cc-line)] bg-white text-[var(--cc-ink)]"
                                                        }`}
                                                        >
                                                            <p className="whitespace-pre-wrap break-words">{message.content}</p>
                                                            <p className={`mt-1 text-right text-[10px] ${own ? "text-white/70" : "text-[var(--cc-ink-tertiary)]"}`}>
                                                                {formatMessageTime(message.createdAt)}
                                                            </p>
                                                        </div>
                                                    </motion.div>
                                                );
                                            })}
                                        </AnimatePresence>
                                    )}
                                    <div ref={messagesEndRef} />
                                </div>

                                <form onSubmit={handleSend} className="border-t border-[var(--cc-line)] bg-white p-4">
                                    {error && <p role="alert" className="mb-2 text-sm font-medium text-[var(--cc-rose)]">{error}</p>}
                                    <div className="flex items-end gap-2">
                                        <textarea
                                            value={draft}
                                            onChange={event => setDraft(event.target.value)}
                                            onKeyDown={event => {
                                                if (event.key === "Enter" && !event.shiftKey) {
                                                    event.preventDefault();
                                                    event.currentTarget.form?.requestSubmit();
                                                }
                                            }}
                                            maxLength={2000}
                                            rows={2}
                                            placeholder="Escribe un mensaje al vecino..."
                                            className="min-h-12 flex-1 resize-none rounded-xl border border-[var(--cc-line)] bg-[var(--cc-paper)] px-4 py-3 text-sm text-[var(--cc-ink)] outline-none transition focus:border-[var(--cc-copper)]"
                                        />
                                        <button
                                            type="submit"
                                            disabled={sending || !draft.trim()}
                                            aria-label="Enviar mensaje"
                                            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--cc-copper)] text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                                        </button>
                                    </div>
                                    <p className="mt-2 text-[10px] text-[var(--cc-ink-tertiary)]">No compartas claves, datos bancarios ni códigos de verificación.</p>
                                </form>
                            </>
                        ) : (
                            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
                                <MessageCircle className="h-12 w-12 text-[var(--cc-ink-faint)]" />
                                <p className="mt-4 text-lg font-semibold text-[var(--cc-ink)]">Selecciona una conversación</p>
                                <p className="mt-1 max-w-sm text-sm leading-6 text-[var(--cc-ink-secondary)]">Tus mensajes quedarán guardados y disponibles para continuar la coordinación.</p>
                                {error && <p role="alert" className="mt-4 text-sm font-medium text-[var(--cc-rose)]">{error}</p>}
                            </div>
                        )}
                    </section>
                </div>
            </DialogContent>
        </Dialog>
    );
}
