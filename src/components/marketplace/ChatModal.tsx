"use client";

import { useState, useEffect } from "react";
import { MarketplaceItem, User } from "@/lib/types";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle
} from "@/components/ui/Dialog";
import { Send, User as UserIcon, ShieldCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ChatModalProps {
    item: MarketplaceItem | null;
    isOpen: boolean;
    onClose: () => void;
    currentUser: User | null;
}

export function ChatModal({ item, isOpen, onClose, currentUser }: ChatModalProps) {
    const [messages, setMessages] = useState<{ sender: string, text: string, time: string }[]>([]);
    const [inputText, setInputText] = useState("");

    useEffect(() => {
        if (isOpen && item) {
            // Initial mock message from system or seller
            setMessages([
                {
                    sender: "system",
                    text: `Has iniciado una conversación por: ${item.title}`,
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                }
            ]);
        }
    }, [isOpen, item]);

    const handleSendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputText.trim()) return;

        const newMessage = {
            sender: "me",
            text: inputText,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        setMessages([...messages, newMessage]);
        setInputText("");

        // Simulated response from seller
        setTimeout(() => {
            setMessages(prev => [...prev, {
                sender: "seller",
                text: "¡Hola! Sí, aún lo tengo disponible. ¿Te gustaría venir a verlo hoy?",
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }]);
        }, 1500);
    };

    if (!item) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-[2rem] border-none shadow-2xl">
                <div className="flex flex-col h-[600px] bg-canvas">
                    {/* Header */}
                    <div className="p-6 bg-surface border-b border-subtle flex items-center gap-4">
                        <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg">
                            V
                        </div>
                        <div className="flex-1">
                            <DialogTitle className="font-bold cc-text-primary">Valentina Rivas</DialogTitle>
                            <p className="text-xs text-emerald-500 font-bold uppercase tracking-widest">Vendedor Online</p>
                        </div>
                        <div className="p-2 bg-blue-50 dark:bg-blue-500/10 rounded-xl">
                            <ShieldCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                    </div>

                    {/* Messages Area */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-4">
                        <AnimatePresence>
                            {messages.map((msg, idx) => (
                                <motion.div
                                    key={idx}
                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    className={`flex ${msg.sender === 'me' ? 'justify-end' : 'justify-start'}`}
                                >
                                    <div className={`max-w-[80%] p-4 rounded-2xl text-sm font-medium shadow-sm ${msg.sender === 'me'
                                        ? 'bg-blue-600 text-white rounded-tr-none'
                                        : msg.sender === 'system'
                                            ? 'bg-slate-200 dark:bg-slate-800 text-slate-500 text-center text-xs w-full'
                                            : 'bg-surface cc-text-secondary rounded-tl-none'
                                        }`}>
                                        {msg.text}
                                        {msg.sender !== 'system' && (
                                            <p className={`text-[10px] mt-1 ${msg.sender === 'me' ? 'text-blue-200' : 'text-slate-400'}`}>
                                                {msg.time}
                                            </p>
                                        )}
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>

                    {/* Input Area */}
                    <form onSubmit={handleSendMessage} className="p-6 bg-surface border-t border-subtle">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder="Escribe un mensaje..."
                                className="flex-1 h-12 px-4 rounded-xl bg-elevated border-none text-sm font-medium focus:ring-2 focus:ring-blue-500/20"
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                            />
                            <button
                                type="submit"
                                className="h-12 w-12 flex items-center justify-center bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all active:scale-90"
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
