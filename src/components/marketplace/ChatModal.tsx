"use client";

import { useMemo, useState } from "react";
import { MarketplaceItem, User } from "@/lib/types";
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from "@/components/ui/Dialog";
import { Home, Send, ShieldCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ChatModalProps {
    item: MarketplaceItem | null;
    isOpen: boolean;
    onClose: () => void;
    currentUser: User | null;
}

interface LocalMessage {
    sender: "system" | "me" | "seller";
    text: string;
    time: string;
}

function getDeptNumber(item: MarketplaceItem) {
    return Array.from(item.sellerId || item.id)
        .reduce((acc, char) => acc + char.charCodeAt(0), 0) % 900 + 100;
}

export function ChatModal({ item, isOpen, onClose, currentUser }: ChatModalProps) {
    const [conversation, setConversation] = useState<{ itemId: string | null; messages: LocalMessage[] }>({
        itemId: null,
        messages: [],
    });
    const [inputText, setInputText] = useState("");

    const deptNumber = useMemo(() => item ? getDeptNumber(item) : null, [item]);
    const displayMessages = useMemo<LocalMessage[]>(() => {
        if (!item) return [];
        if (conversation.itemId === item.id && conversation.messages.length > 0) return conversation.messages;

        return [{
            sender: "system",
            text: `Conversación iniciada por: ${item.title}. Los datos del vendedor se muestran solo dentro de la comunidad.`,
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        }];
    }, [conversation, item]);

    const handleSendMessage = (event: React.FormEvent) => {
        event.preventDefault();
        if (!item || !inputText.trim()) return;

        const currentItem = item;

        const newMessage: LocalMessage = {
            sender: "me",
            text: inputText.trim(),
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };

        const baseMessages = conversation.itemId === currentItem.id ? conversation.messages : displayMessages;
        setConversation({ itemId: currentItem.id, messages: [...baseMessages, newMessage] });
        setInputText("");

        setTimeout(() => {
            setConversation(previous => ({
                itemId: currentItem.id,
                messages: [...(previous.itemId === currentItem.id ? previous.messages : [...baseMessages, newMessage]), {
                sender: "seller",
                text: "Gracias por escribir. Te responderé por este chat para coordinar revisión, entrega o propuesta.",
                time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                }],
            }));
        }, 900);
    };

    if (!item) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="overflow-hidden rounded-lg border-none p-0 shadow-sm sm:max-w-md">
                <div className="flex h-[600px] flex-col bg-canvas">
                    <div className="flex items-center gap-4 border-b border-subtle bg-surface p-6">
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-[#3B82F6] to-[#6D28D9] text-white">
                            <Home className="h-6 w-6" />
                        </div>
                        <div className="flex-1">
                            <DialogTitle className="font-bold cc-text-primary">Depto {deptNumber}</DialogTitle>
                            <p className="text-xs font-bold uppercase tracking-widest text-emerald-500">
                                Vendedor residente
                            </p>
                        </div>
                        <div className="rounded-xl bg-blue-50 p-2 dark:bg-blue-500/10">
                            <ShieldCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                    </div>

                    <div className="flex-1 space-y-4 overflow-y-auto p-6">
                        <AnimatePresence>
                            {displayMessages.map((message, index) => (
                                <motion.div
                                    key={`${message.sender}-${index}`}
                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    className={`flex ${message.sender === "me" ? "justify-end" : "justify-start"}`}
                                >
                                    <div className={`max-w-[80%] rounded-lg p-4 text-sm font-medium shadow-sm ${
                                        message.sender === "me"
                                            ? "rounded-tr-none bg-blue-600 text-white"
                                            : message.sender === "system"
                                                ? "w-full bg-elevated text-center text-xs text-slate-500"
                                                : "rounded-tl-none bg-surface cc-text-secondary"
                                    }`}>
                                        {message.text}
                                        {message.sender !== "system" && (
                                            <p className={`mt-1 text-[10px] ${message.sender === "me" ? "text-blue-200" : "text-slate-400"}`}>
                                                {message.time}
                                            </p>
                                        )}
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>

                    <form onSubmit={handleSendMessage} className="border-t border-subtle bg-surface p-6">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder={currentUser ? "Escribe un mensaje..." : "Inicia sesión para escribir..."}
                                className="h-12 flex-1 rounded-xl border-none bg-elevated px-4 text-sm font-medium focus:ring-2 focus:ring-blue-500/20"
                                value={inputText}
                                onChange={event => setInputText(event.target.value)}
                                disabled={!currentUser}
                            />
                            <button
                                type="submit"
                                disabled={!currentUser || !inputText.trim()}
                                className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white transition-all hover:bg-blue-700 active:scale-90 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <Send className="h-5 w-5" />
                            </button>
                        </div>
                    </form>
                </div>
            </DialogContent>
        </Dialog>
    );
}
