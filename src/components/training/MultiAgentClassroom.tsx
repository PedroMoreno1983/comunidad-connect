"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, User, ChevronRight, GraduationCap, Monitor, Users, Lightbulb } from "lucide-react";
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

interface MultiAgentClassroomProps {
    courseContent?: string;
}

export function MultiAgentClassroom({ courseContent }: MultiAgentClassroomProps) {
    const { user } = useAuth();
    const [messages, setMessages] = useState<ChatMessage[]>([{
        id: 'system-1',
        role: 'system',
        text: '¡Bienvenid@ al Aula Virtual Multi-Agente! Tu Tutora CoCo está preparándose...'
    }]);
    const [input, setInput] = useState("");
    const [isTyping, setIsTyping] = useState(false);
    const [blackboardContent, setBlackboardContent] = useState<string>(
        "# Bienvenido a la Capacitación\n\nAquí aparecerán las diapositivas y conceptos clave que explique el tutor."
    );
    
    const messagesEndRef = useRef<HTMLDivElement>(null);

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

            // Update Blackboard if tutor sent something new
            const tutorMsg = newResponses.find(m => m.role === 'tutor' && m.blackboard);
            if (tutorMsg?.blackboard) {
                setBlackboardContent(tutorMsg.blackboard);
            }

            // Append responses progressively for realism (fake delay)
            for (let i = 0; i < newResponses.length; i++) {
                await new Promise(r => setTimeout(r, 800)); // slight delay between agents
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

    return (
        <div className="flex flex-col lg:flex-row h-[85vh] w-full bg-slate-50 dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-2xl shadow-indigo-500/10 overflow-hidden">
            
            {/* LEFT PANEL: BLACKBOARD / SIMULATION */}
            <div className="w-full lg:w-3/5 h-[40vh] lg:h-full bg-white dark:bg-slate-950 p-6 lg:p-12 border-b lg:border-b-0 lg:border-r border-slate-100 dark:border-slate-800 flex flex-col relative">
                <div className="absolute top-0 right-0 p-8 opacity-5">
                    <Monitor className="w-64 h-64 text-slate-400" />
                </div>
                
                <div className="flex items-center gap-3 mb-8 relative z-10">
                    <div className="p-3 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl text-indigo-600 dark:text-indigo-400">
                        <Monitor className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-slate-900 dark:text-white">Pizarra Interactiva</h2>
                        <p className="text-sm font-medium text-slate-500">Contenido guiado por la Tutora</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto min-h-0 relative z-10 prose prose-slate dark:prose-invert max-w-none 
                    prose-headings:font-black prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl
                    prose-a:text-indigo-500 prose-strong:text-indigo-600 dark:prose-strong:text-indigo-400
                    prose-img:rounded-2xl prose-img:shadow-xl prose-img:border prose-img:border-slate-100 dark:prose-img:border-slate-800">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={blackboardContent.substring(0, 50)} // Anima cuando cambia el contenido principal
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -15 }}
                            transition={{ duration: 0.4 }}
                        >
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {blackboardContent}
                            </ReactMarkdown>
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>

            {/* RIGHT PANEL: CHAT / MULTI-AGENT FEED */}
            <div className="w-full lg:w-2/5 h-[45vh] lg:h-full flex flex-col bg-slate-50 dark:bg-slate-900 relative">
                <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50 backdrop-blur-md flex items-center justify-between z-10">
                    <div className="flex items-center gap-4">
                        <div className="flex -space-x-3">
                            <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-500/20 border-2 border-white dark:border-slate-900 flex items-center justify-center text-emerald-600 shadow-sm z-20">
                                <GraduationCap className="w-5 h-5" />
                            </div>
                            <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-500/20 border-2 border-white dark:border-slate-900 flex items-center justify-center text-amber-600 shadow-sm z-10">
                                <Users className="w-5 h-5" />
                            </div>
                            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-500/20 border-2 border-white dark:border-slate-900 flex items-center justify-center text-blue-600 shadow-sm z-0">
                                <User className="w-5 h-5" />
                            </div>
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-900 dark:text-white text-sm">Aula de Debate</h3>
                            <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">3 Participantes</p>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <AnimatePresence initial={false}>
                        {messages.map((msg) => (
                            <motion.div
                                key={msg.id}
                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : msg.role === 'system' ? 'items-center' : 'items-start'}`}
                            >
                                {msg.role !== 'system' && (
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 ml-2">
                                        {msg.role === 'tutor' ? 'Tutora CoCo' : msg.role === 'classmate' ? (msg.name || 'Compañero IA') : 'Tú'}
                                    </span>
                                )}
                                <div className={`
                                    max-w-[85%] rounded-2xl p-4
                                    ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-br-none shadow-lg shadow-indigo-500/20' : ''}
                                    ${msg.role === 'tutor' ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-100 dark:border-slate-700 rounded-bl-none shadow-sm' : ''}
                                    ${msg.role === 'classmate' ? 'bg-amber-50 dark:bg-amber-500/10 text-slate-800 dark:text-slate-200 border border-amber-100 dark:border-amber-500/20 rounded-bl-none ml-6' : ''}
                                    ${msg.role === 'system' ? 'bg-transparent text-slate-400 text-xs text-center border border-dashed border-slate-300 dark:border-slate-700' : ''}
                                `}>
                                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                    
                    {isTyping && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="flex items-start"
                        >
                            <div className="bg-white dark:bg-slate-800 text-slate-400 border border-slate-100 dark:border-slate-700 rounded-2xl rounded-bl-none p-4 shadow-sm flex items-center gap-1">
                                <Lightbulb className="w-4 h-4 mr-1 animate-pulse text-amber-500" />
                                <span className="animate-bounce">.</span><span className="animate-bounce" style={{ animationDelay: "0.2s" }}>.</span><span className="animate-bounce" style={{ animationDelay: "0.4s" }}>.</span>
                            </div>
                        </motion.div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* INPUT AREA */}
                <div className="p-4 bg-white dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800">
                    <form 
                        onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                        className="flex items-center gap-3 bg-slate-50 dark:bg-slate-900 rounded-full p-2 border border-slate-200 dark:border-slate-800 focus-within:ring-2 focus-within:ring-indigo-500/50 transition-all"
                    >
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Aporta a la clase o haz una pregunta a la Tutora..."
                            className="flex-1 bg-transparent px-4 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
                            disabled={isTyping}
                        />
                        <button
                            type="submit"
                            disabled={!input.trim() || isTyping}
                            className="p-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white rounded-full transition-colors flex items-center justify-center shadow-lg shadow-indigo-500/30"
                        >
                            <Send className="w-5 h-5 -ml-0.5" />
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
