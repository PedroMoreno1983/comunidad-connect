"use client";

import { useState, useRef, useEffect } from "react";
import {
    Mic, Send, Paperclip, MoreVertical, Phone, Video,
    Smile, Plus, Check, CheckCheck, ChevronLeft, ShoppingCart
} from "lucide-react";
import { AudioMessage } from "./AudioMessage";
import { OrderPreviewBubble } from "./OrderPreviewBubble";
import { RecipeBubble } from "./RecipeBubble";
import { motion, AnimatePresence } from "framer-motion";
import { agent } from "@/lib/agentBrain"; // Importar el cerebro del agente

interface Message {
    id: string;
    type: 'text' | 'audio' | 'order' | 'recipe' | 'system';
    content?: string;
    audioDuration?: string;
    orderData?: any;
    recipeData?: any;
    isSender: boolean;
    timestamp: string;
    status: 'sent' | 'delivered' | 'read';
}

export function WhatsAppChat() {
    const [messages, setMessages] = useState<Message[]>([
        {
            id: '1',
            type: 'system',
            content: 'Las llamadas y mensajes de este chat ahora están cifrados de extremo a extremo.',
            isSender: false,
            timestamp: '10:00',
            status: 'read'
        },
        {
            id: '2',
            type: 'text',
            content: '¡Hola! 👋 Soy tu Asistente de Supermercado y Chef. Dime qué ingredientes tienes (ej: "tengo arroz y huevos") o envíame tu lista de compras.',
            isSender: false,
            timestamp: '10:00',
            status: 'read'
        }
    ]);
    const [isRecording, setIsRecording] = useState(false);
    const [inputValue, setInputValue] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);

    // Auto-scroll
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };
    useEffect(() => {
        scrollToBottom();
    }, [messages, isProcessing]);

    const handleSendAudio = () => {
        setIsRecording(true);
        // Simular grabación de audio
        setTimeout(() => {
            setIsRecording(false);
            addMessage({
                type: 'audio',
                audioDuration: '0:12',
                isSender: true
            });
            // DEMO: Simular flujo de cocina por voz
            processAgentResponse("tengo harina, levadura y salsa de tomate, qué puedo cocinar?");
        }, 2000);
    };

    const handleSendText = () => {
        if (!inputValue.trim()) return;
        addMessage({ type: 'text', content: inputValue });
        const textToProcess = inputValue;
        setInputValue("");
        processAgentResponse(textToProcess);
    };

    const processAgentResponse = async (userText: string) => {
        setIsProcessing(true);

        try {
            // Llamar al cerebro del agente
            const response = await agent.processMessage(userText);

            // Simular delay de "pensando" (adicional al tiempo de red)
            setTimeout(() => {
                setIsProcessing(false);

                // 1. Respuesta de Texto del Agente
                addMessage({
                    type: 'text',
                    content: response.message,
                    isSender: false,
                    status: 'read'
                });

                // 2. Si hay carrito, mostrar burbuja de pedido
                if (response.cart) {
                    setTimeout(() => {
                        addMessage({
                            type: 'order',
                            isSender: false,
                            orderData: response.cart,
                            status: 'read'
                        });
                    }, 800);
                }

                // 3. Si hay sugerencia de receta, mostrar burbuja de receta
                if (response.recipeSuggestion) {
                    setTimeout(() => {
                        addMessage({
                            type: 'recipe',
                            isSender: false,
                            recipeData: response.recipeSuggestion,
                            status: 'read'
                        });
                    }, 800);
                }

            }, 500);
        } catch (error) {
            setIsProcessing(false);
            console.error("Agent error:", error);
            addMessage({
                type: 'text',
                content: "Lo siento, tuve un problema procesando tu mensaje. 😥",
                isSender: false,
                status: 'read'
            });
        }
    };

    const addMessage = (msg: Partial<Message>) => {
        setMessages(prev => [...prev, {
            id: Date.now().toString(),
            timestamp: getCurrentTime(),
            status: 'sent', // Start as sent
            type: 'text',
            content: '',
            isSender: true,
            ...msg
        } as Message]);
    };

    const getCurrentTime = () => {
        return new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="flex flex-col h-[700px] w-full max-w-md mx-auto bg-[#efeae2] dark:bg-[#0b141a] rounded-[2rem] overflow-hidden shadow-2xl relative border-4 border-slate-900">
            {/* Header */}
            <div className="bg-[#008069] dark:bg-[#202c33] p-3 flex items-center justify-between text-white z-10">
                <div className="flex items-center gap-3">
                    <div className="flex items-center">
                        <ChevronLeft className="h-6 w-6 md:hidden" />
                        <div className="h-9 w-9 bg-white rounded-full flex items-center justify-center relative">
                            <ShoppingCart className="h-5 w-5 text-[#008069]" />
                            <div className="absolute bottom-0 right-0 h-2.5 w-2.5 bg-green-500 border-2 border-[#008069] rounded-full"></div>
                        </div>
                    </div>
                    <div>
                        <h3 className="font-semibold text-sm">ComunidadMarket Bot</h3>
                        <p className="text-[10px] text-white/80">{isProcessing ? 'escribiendo...' : 'en línea'}</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <Video className="h-5 w-5" />
                    <Phone className="h-5 w-5" />
                    <MoreVertical className="h-5 w-5" />
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat dark:opacity-10">
                {messages.map((msg) => (
                    <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex ${msg.isSender ? 'justify-end' : 'justify-start'}`}
                    >
                        {msg.type === 'system' ? (
                            <div className="bg-[#fcebb6] dark:bg-[#1c2328] text-center text-[10px] text-slate-800 dark:text-yellow-500 px-3 py-1.5 rounded-lg shadow-sm mx-auto my-2 max-w-[80%]">
                                {msg.content}
                            </div>
                        ) : (
                            <div className={`
                                max-w-[85%] rounded-lg p-3 shadow-sm relative
                                ${msg.isSender
                                    ? 'bg-[#d9fdd3] dark:bg-[#005c4b] rounded-tr-none'
                                    : 'bg-white dark:bg-[#202c33] rounded-tl-none'
                                }
                            `}>
                                {/* Tail mock */}
                                <div className={`absolute top-0 w-0 h-0 border-[10px] border-transparent 
                                    ${msg.isSender
                                        ? '-right-[10px] border-t-[#d9fdd3] dark:border-t-[#005c4b]'
                                        : '-left-[10px] border-t-white dark:border-t-[#202c33]'
                                    }`}
                                />

                                {msg.type === 'text' && (
                                    <p className="text-sm text-slate-900 dark:text-slate-100 pr-8">{msg.content}</p>
                                )}

                                {msg.type === 'audio' && (
                                    <AudioMessage duration={msg.audioDuration!} isSender={msg.isSender} />
                                )}

                                {msg.type === 'order' && msg.orderData && (
                                    <OrderPreviewBubble
                                        items={msg.orderData.items}
                                        total={msg.orderData.total}
                                        savings={msg.orderData.savings}
                                        onPay={async () => {
                                            const response = await fetch('/api/payments/create-haulmer-link', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({
                                                    amount: msg.orderData.total,
                                                    description: `Compra Supermercado IA (${msg.orderData.items.length} items)`,
                                                    reference: `MARKET_CART_${msg.id}`,
                                                    client: {
                                                        name: 'Residente',
                                                        email: 'resident@comunidadconnect.com'
                                                    },
                                                    returnUrl: window.location.origin + '/resident/supermarket'
                                                })
                                            });

                                            if (response.ok) {
                                                const { url } = await response.json();
                                                window.location.href = url;
                                            } else {
                                                addMessage({
                                                    type: 'text',
                                                    content: 'No pudimos generar el link de pago con Haulmer.',
                                                    isSender: false
                                                });
                                            }
                                        }}
                                    />
                                )}

                                {msg.type === 'recipe' && msg.recipeData && (
                                    <RecipeBubble
                                        suggestion={msg.recipeData}
                                        onAddMissingToCart={(items) => {
                                            addMessage({
                                                type: 'text',
                                                content: 'Agrega los faltantes al carrito, por favor.',
                                                isSender: true
                                            });

                                            // Simular respuesta afirmativa del bot
                                            setTimeout(() => {
                                                addMessage({
                                                    type: 'text',
                                                    content: `¡Listo! Agregué ${items.length} productos a tu pedido. 🛒`,
                                                    isSender: false
                                                });
                                            }, 1000);
                                        }}
                                    />
                                )}

                                <div className="flex justify-end items-center gap-1 mt-1 -mb-1">
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 min-w-[30px] text-right">{msg.timestamp}</span>
                                    {msg.isSender && (
                                        <CheckCheck className={`h-3 w-3 ${msg.status === 'read' ? 'text-blue-500' : 'text-slate-400'}`} />
                                    )}
                                </div>
                            </div>
                        )}
                    </motion.div>
                ))}
                {isRecording && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex justify-center"
                    >
                        <div className="bg-red-500 text-white px-4 py-2 rounded-full flex items-center gap-2 animate-pulse">
                            <div className="h-2 w-2 bg-white rounded-full"></div>
                            <span className="text-xs font-bold">Escuchando...</span>
                        </div>
                    </motion.div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="bg-[#f0f2f5] dark:bg-[#202c33] p-2 flex items-center gap-2">
                <button className="p-2 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700/50 rounded-full">
                    <Smile className="h-6 w-6" />
                </button>
                <button className="p-2 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700/50 rounded-full">
                    <Plus className="h-6 w-6" />
                </button>

                <div className="flex-1 bg-white dark:bg-[#2a3942] rounded-lg px-4 py-2 flex items-center">
                    <input
                        type="text"
                        className="w-full bg-transparent border-none outline-none text-slate-900 dark:text-white placeholder-slate-400"
                        placeholder="Escribe un mensaje"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSendText();
                        }}
                    />
                </div>

                {inputValue.trim() ? (
                    <button
                        onClick={handleSendText}
                        className="p-3 bg-[#008069] text-white rounded-full shadow-md"
                    >
                        <Send className="h-5 w-5" />
                    </button>
                ) : (
                    <button
                        onClick={handleSendAudio}
                        disabled={isRecording}
                        className={`p-3 rounded-full shadow-md transition-all ${isRecording ? 'bg-red-500 scale-110' : 'bg-[#008069] hover:bg-[#006e5a]'
                            } text-white`}
                    >
                        <Mic className="h-5 w-5" />
                    </button>
                )}
            </div>
        </div>
    );
}
