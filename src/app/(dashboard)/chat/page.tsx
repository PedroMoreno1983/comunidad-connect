"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/authContext";
import { ChatService } from "@/lib/services/supabaseServices";
import { ChatMessage, Conversation } from "@/lib/types";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/components/ui/Toast";
import { Send, Hash, MessageCircle, Users, Loader2, ArrowLeft, Search } from "lucide-react";
import clsx from "clsx";
import { supabase } from "@/lib/supabase";

type ChatMode = 'global' | 'direct';

// interface Conversation moved to @/lib/types.ts

export default function ChatPage() {
    const { user } = useAuth();
    const { toast } = useToast();

    const [mode, setMode] = useState<ChatMode>('global');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [isSending, setIsSending] = useState(false);

    // Direct Messages
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [activePeer, setActivePeer] = useState<Conversation | null>(null);
    const [neighbors, setNeighbors] = useState<{ id: string; name: string; avatar_url?: string }[]>([]);
    const [searchTerm, setSearchTerm] = useState("");

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Load on mode change
    useEffect(() => {
        if (mode === 'global') {
            loadGlobalMessages();
        } else {
            loadConversations();
            loadNeighbors();
        }
        return () => { subscriptionRef.current?.unsubscribe(); };
    }, [mode]);

    // Load DMs when activePeer changes
    useEffect(() => {
        if (!activePeer || !user) return;
        loadDirectMessages(activePeer.peerId);
    }, [activePeer]);

    const loadGlobalMessages = async () => {
        setIsLoading(true);
        setMessages([]);
        subscriptionRef.current?.unsubscribe();
        try {
            const data = await ChatService.getGlobalMessages();
            setMessages(data as unknown as ChatMessage[]);
            subscriptionRef.current = ChatService.subscribeToGlobalChat((newMsg: ChatMessage) => {
                setMessages(prev => [...prev, newMsg]);
            });
        } catch (error) {
            console.error("Error loading global messages:", error);
            setMessages([]);
        } finally {
            setIsLoading(false);
        }
    };

    const loadConversations = async () => {
        if (!user) return;
        try {
            const data = await ChatService.getConversations(user.id);
            setConversations(data);
        } catch (error) {
            console.error("Error loading conversations:", error);
        }
    };

    const loadNeighbors = async () => {
        if (!user) return;
        const { data } = await supabase
            .from('profiles')
            .select('id, name, avatar_url')
            .neq('id', user.id)
            .order('name');
        if (data) setNeighbors(data);
    };

    const loadDirectMessages = async (peerId: string) => {
        if (!user) return;
        setIsLoading(true);
        setMessages([]);
        subscriptionRef.current?.unsubscribe();
        try {
            const data = await ChatService.getDirectMessages(user.id, peerId);
            setMessages(data as unknown as ChatMessage[]);
            subscriptionRef.current = ChatService.subscribeToDirectChat(user.id, peerId, (newMsg: ChatMessage) => {
                setMessages(prev => [...prev, newMsg]);
            });
        } catch (error) {
            console.error("Error loading direct messages:", error);
            setMessages([]);
        } finally {
            setIsLoading(false);
        }
    };

    const openDirectChat = (neighbor: { id: string; name: string; avatar_url?: string }) => {
        const conv: Conversation = {
            peerId: neighbor.id,
            peerProfile: { name: neighbor.name, avatar_url: neighbor.avatar_url },
            lastMessage: '',
            lastAt: ''
        };
        setActivePeer(conv);
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !newMessage.trim()) return;
        setIsSending(true);
        try {
            if (mode === 'global') {
                await ChatService.sendMessage({ sender_id: user.id, content: newMessage.trim() });
            } else if (activePeer) {
                await ChatService.sendMessage({
                    sender_id: user.id,
                    receiver_id: activePeer.peerId,
                    content: newMessage.trim()
                });
            }
            setNewMessage("");
        } catch (error) {
            toast({ title: "Error", description: "No se pudo enviar el mensaje", variant: "destructive" });
        } finally {
            setIsSending(false);
        }
    };

    const filteredNeighbors = neighbors.filter(n =>
        (n.name || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const chatTitle = mode === 'global' ? 'Chat Global' : (activePeer?.peerProfile.name || 'Mensajes Directos');
    const chatSubtitle = mode === 'global' ? 'Toda la comunidad' : (activePeer ? '1‑a‑1 privado' : 'Selecciona un vecino');

    return (
        <div className="h-[calc(100vh-8rem)] flex shadow-xl shadow-slate-200/50 dark:shadow-none border border-subtle rounded-[2.5rem] bg-surface overflow-hidden">

            {/* ===== LEFT SIDEBAR ===== */}
            <div className="hidden lg:flex flex-col w-80 border-r border-subtle bg-slate-50/50 dark:bg-slate-900/50">
                <div className="p-6 pb-3">
                    <h2 className="text-xl font-black cc-text-primary flex items-center gap-2">
                        <MessageCircle className="h-6 w-6 text-brand-500" />
                        Mensajes
                    </h2>
                </div>

                {/* Tab Switcher */}
                <div className="px-4 pb-3">
                    <div className="grid grid-cols-2 bg-elevated rounded-2xl p-1 gap-1">
                        <button
                            onClick={() => { setMode('global'); setActivePeer(null); }}
                            className={clsx("py-2 px-3 rounded-xl text-sm font-bold transition-all", mode === 'global' ? "bg-white dark:bg-slate-700 cc-text-primary shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300")}
                        >
                            🌐 Global
                        </button>
                        <button
                            onClick={() => setMode('direct')}
                            className={clsx("py-2 px-3 rounded-xl text-sm font-bold transition-all", mode === 'direct' ? "bg-white dark:bg-slate-700 cc-text-primary shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300")}
                        >
                            💬 Directos
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {mode === 'global' ? (
                        <button className="w-full flex items-center gap-3 p-3 rounded-2xl bg-role-admin-bg text-role-admin-fg">
                            <div className="p-2 bg-role-admin-bg rounded-xl">
                                <Hash className="h-4 w-4" />
                            </div>
                            <div className="text-left">
                                <p className="font-bold text-sm">Canal General</p>
                                <p className="text-[11px] font-medium text-brand-400">Todos los vecinos</p>
                            </div>
                        </button>
                    ) : (
                        <>
                            {/* Search Neighbors */}
                            <div className="relative mb-3">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Buscar vecino..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-surface border border-subtle text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                                />
                            </div>

                            {/* Recent Conversations */}
                            {conversations.length > 0 && (
                                <div className="mb-1">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 ml-2">Recientes</p>
                                    {conversations.map(conv => (
                                        <button
                                            key={conv.peerId}
                                            onClick={() => setActivePeer(conv)}
                                            className={clsx(
                                                "w-full flex items-center gap-3 p-3 rounded-2xl transition-all mb-1",
                                                activePeer?.peerId === conv.peerId
                                                    ? "bg-role-admin-bg text-brand-600"
                                                    : "hover:bg-elevated cc-text-secondary"
                                            )}
                                        >
                                            <div className="w-9 h-9 rounded-full overflow-hidden bg-slate-300 flex-shrink-0">
                                                {conv.peerProfile?.avatar_url ? (
                                                    <img src={conv.peerProfile.avatar_url} alt="av" className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-[11px] font-black text-slate-500">
                                                        {conv.peerProfile?.name?.charAt(0) || '?'}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="text-left min-w-0">
                                                <p className="font-bold text-sm truncate">{conv.peerProfile?.name}</p>
                                                <p className="text-[11px] text-slate-400 truncate">{conv.lastMessage}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* All Neighbors (filtered) */}
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 ml-2">Vecinos</p>
                            {filteredNeighbors.length === 0 ? (
                                <p className="text-xs text-center text-slate-400 py-4">Sin resultados</p>
                            ) : (
                                filteredNeighbors.map(neighbor => (
                                    <button
                                        key={neighbor.id}
                                        onClick={() => openDirectChat(neighbor)}
                                        className={clsx(
                                            "w-full flex items-center gap-3 p-3 rounded-2xl transition-all mb-1",
                                            activePeer?.peerId === neighbor.id
                                                ? "bg-role-admin-bg"
                                                : "hover:bg-elevated"
                                        )}
                                    >
                                        <div className="w-9 h-9 rounded-full overflow-hidden bg-gradient-to-br from-indigo-400 to-purple-500 flex-shrink-0">
                                            {neighbor.avatar_url ? (
                                                <img src={neighbor.avatar_url} alt="av" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-[11px] font-black text-white">
                                                    {neighbor.name?.charAt(0) || '?'}
                                                </div>
                                            )}
                                        </div>
                                        <p className="font-bold text-sm cc-text-secondary truncate">{neighbor.name}</p>
                                    </button>
                                ))
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* ===== CHAT AREA ===== */}
            <div className="flex-1 flex flex-col bg-surface relative">

                {/* Chat Header */}
                <div className="h-20 flex items-center justify-between px-6 sm:px-8 border-b border-subtle bg-white/50 dark:bg-slate-900/50 backdrop-blur-md z-10">
                    <div className="flex items-center gap-4">
                        {mode === 'direct' && activePeer && (
                            <button onClick={() => setActivePeer(null)} className="p-2 rounded-xl hover:bg-elevated">
                                <ArrowLeft className="h-5 w-5 text-slate-400" />
                            </button>
                        )}
                        <div className={clsx("p-2.5 rounded-xl shadow-lg", mode === 'global' ? "bg-gradient-to-br from-[#7C3AED] to-[#5B21B6] shadow-indigo-500/30" : "bg-gradient-to-br from-[#10B981] to-[#0D9488] shadow-emerald-500/30")}>
                            {mode === 'global' ? <Hash className="h-5 w-5 text-white" /> : <MessageCircle className="h-5 w-5 text-white" />}
                        </div>
                        <div>
                            <h3 className="font-black text-lg cc-text-primary">{chatTitle}</h3>
                            <p className="text-xs font-medium text-slate-500 flex items-center gap-1">
                                <Users className="h-3 w-3" /> {chatSubtitle}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Empty state for DM mode without a selected peer */}
                {mode === 'direct' && !activePeer ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-4">
                        <div className="p-6 bg-role-admin-bg rounded-3xl mb-2">
                            <MessageCircle className="h-14 w-14 text-brand-400" />
                        </div>
                        <h3 className="text-xl font-black cc-text-primary">Mensajes Directos</h3>
                        <p className="text-sm font-medium text-slate-400 max-w-xs">
                            Selecciona un vecino del panel izquierdo para iniciar una conversación privada.
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Messages Stream */}
                        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6">
                            {isLoading ? (
                                <div className="flex items-center justify-center h-full">
                                    <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
                                </div>
                            ) : (
                                <AnimatePresence initial={false}>
                                    {messages.length === 0 && (
                                        <div className="flex flex-col items-center justify-center h-full py-16 text-center gap-3">
                                            <MessageCircle className="h-12 w-12 text-slate-200 dark:text-slate-700" />
                                            <p className="text-sm font-bold text-slate-400">Sin mensajes aún. ¡Saluda primero!</p>
                                        </div>
                                    )}
                                    {messages.map((msg, idx) => {
                                        const isMe = msg.sender_id === user?.id;
                                        const prev = messages[idx - 1];
                                        const showAvatar = !isMe && (!prev || prev.sender_id !== msg.sender_id);
                                        const showTimestamp = idx === messages.length - 1 ||
                                            new Date(messages[idx + 1].created_at).getTime() - new Date(msg.created_at).getTime() > 5 * 60 * 1000;

                                        return (
                                            <motion.div
                                                key={msg.id}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className={clsx("flex flex-col", isMe ? "items-end" : "items-start")}
                                            >
                                                <div className={clsx("flex items-end gap-2 max-w-[85%] lg:max-w-[70%]", isMe && "flex-row-reverse")}>
                                                    {!isMe && (
                                                        <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-elevated mb-1">
                                                            {showAvatar ? (
                                                                msg.profiles?.avatar_url
                                                                    ? <img src={msg.profiles.avatar_url} alt="av" className="w-full h-full object-cover" />
                                                                    : <div className="w-full h-full flex items-center justify-center text-[10px] font-black text-slate-500">{msg.profiles?.name?.charAt(0) || '?'}</div>
                                                            ) : null}
                                                        </div>
                                                    )}
                                                    <div className="flex flex-col">
                                                        {!isMe && showAvatar && (
                                                            <span className="text-[11px] font-black text-slate-400 ml-1 mb-1">{msg.profiles?.name}</span>
                                                        )}
                                                        <div className={clsx(
                                                            "px-5 py-3 text-[15px] font-medium leading-relaxed drop-shadow-sm",
                                                            isMe
                                                                ? "bg-gradient-to-br from-[#7C3AED] to-[#5B21B6] text-white rounded-2xl rounded-tr-sm"
                                                                : "bg-elevated cc-text-primary rounded-2xl rounded-tl-sm border border-slate-200/50 dark:border-slate-700/50"
                                                        )}>
                                                            {msg.content}
                                                        </div>
                                                    </div>
                                                </div>
                                                {showTimestamp && (
                                                    <span className="text-[10px] font-bold text-slate-400 mt-1.5 mx-10">
                                                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                )}
                                            </motion.div>
                                        );
                                    })}
                                </AnimatePresence>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Chat Input */}
                        <div className="p-4 sm:p-6 bg-surface border-t border-subtle">
                            <form onSubmit={handleSendMessage} className="relative flex items-center max-w-4xl mx-auto">
                                <input
                                    type="text"
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    placeholder={mode === 'global' ? "Escribe un mensaje a la comunidad..." : `Escribe a ${activePeer?.peerProfile.name}...`}
                                    className="w-full pl-6 pr-14 py-4 bg-elevated border-none rounded-full text-sm font-medium focus:ring-2 focus:ring-brand-500/50 transition-all shadow-inner"
                                />
                                <button
                                    type="submit"
                                    disabled={!newMessage.trim() || isSending}
                                    className="absolute right-2 p-2.5 bg-gradient-to-r from-[#7C3AED] to-[#5B21B6] text-white rounded-full disabled:opacity-50 disabled:grayscale transition-all hover:scale-105 shadow-md"
                                >
                                    {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                </button>
                            </form>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
