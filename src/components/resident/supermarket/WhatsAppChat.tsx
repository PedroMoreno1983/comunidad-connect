"use client";

import { useState, useRef, useEffect } from "react";
import {
    Mic, Send, MoreVertical, Phone, Video,
    Smile, Plus, CheckCheck, ChevronLeft, ShoppingCart
} from "lucide-react";
import { AudioMessage } from "./AudioMessage";
import { OrderPreviewBubble } from "./OrderPreviewBubble";
import { RecipeBubble } from "./RecipeBubble";
import { motion } from "framer-motion";
import { agent } from "@/lib/agentBrain";

interface ApiCartItem {
    id?: string;
    name: string;
    brand?: string;
    quantity: number;
    userQuantity?: number;
    totalPrice?: number;
    price: number;
    store: 'Jumbo' | 'Lider' | 'Unimarc' | 'Santa Isabel';
    originalPrice?: number;
    isOffer?: boolean;
    productUrl?: string;
    requestedTerm?: string;
    checked?: boolean;
}

interface BasketComparisonItem {
    store: string;
    subtotal: number;
    coveredCount: number;
    requestedCount: number;
    coveragePercent: number;
    missingTerms: string[];
    complete: boolean;
}

interface ApiSupermarketResponse {
    message: string;
    error?: string;
    items?: ApiCartItem[];
    fetchedAt?: string;
    mode?: string;
    recommendedStore?: string | null;
    basketReady?: boolean;
    basketSubtotal?: number;
    missingTerms?: string[];
    basketComparison?: BasketComparisonItem[];
    degradedStores?: string[];
    checkout?: {
        status: string;
        store: string;
        storeUrl: string;
        productUrls: string[];
        requiresRetailerSession: boolean;
        cartPreloaded: boolean;
        detail: string;
    };
    sources?: { store: string; status: string }[];
}

interface Message {
    id: string;
    type: 'text' | 'audio' | 'order' | 'recipe' | 'system' | 'basket_choice';
    content?: string;
    audioDuration?: string;
    orderData?: { items: ApiCartItem[]; total: number; savings: number };
    basketChoices?: BasketComparisonItem[];
    recipeData?: import('@/lib/agentBrain').RecipeSuggestion;
    isSender: boolean;
    timestamp: string;
    status: 'sent' | 'delivered' | 'read';
}

function isRecipeIntent(text: string): boolean {
    const lower = text.toLowerCase();
    return lower.includes("tengo") || lower.includes("receta") || lower.includes("cocinar") || lower.includes("ingredientes");
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
            content: '¡Hola! Soy CoCo Supermercado. Cuéntame qué tienes en casa (ej: tengo arroz y cebolla) y te sugiero una receta, o dime qué necesitas comprar y armo tu lista completa en una sola tienda al mejor precio. Comparo Jumbo, Lider, Santa Isabel y Unimarc por canasta, no por producto suelto.',
            isSender: false,
            timestamp: '10:00',
            status: 'read'
        }
    ]);
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
        addMessage({
            type: 'system',
            content: 'El canal de voz se activa con permisos de audio de la comunidad. Mientras tanto, escribe tu solicitud y CoCo la procesa al instante.',
            isSender: false,
        });
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
            // Si es una intención de receta, usar el agente local
            if (isRecipeIntent(userText)) {
                const response = await agent.processMessage(userText);
                setIsProcessing(false);

                addMessage({
                    type: 'text',
                    content: response.message,
                    isSender: false,
                    status: 'read'
                });

                if (response.recipeSuggestion) {
                    setTimeout(() => {
                        addMessage({
                            type: 'recipe',
                            isSender: false,
                            recipeData: response.recipeSuggestion,
                            status: 'read'
                        });
                    }, 600);
                }
                return;
            }

            // Para compras o cualquier otro mensaje, usar la API real de supermercado
            const apiResponse = await fetch("/api/supermarket", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: userText }),
            });

            const data: ApiSupermarketResponse = await apiResponse.json();
            setIsProcessing(false);

            if (!apiResponse.ok || data.error) {
                addMessage({
                    type: 'text',
                    content: data.message || "Lo siento, no pude consultar los precios en este momento. 😥",
                    isSender: false,
                    status: 'read'
                });
                return;
            }

            // Mensaje descriptivo de la API
            addMessage({
                type: 'text',
                content: data.message,
                isSender: false,
                status: 'read'
            });

            // Si hay items, mostrar burbuja de orden
            if (data.items && data.items.length > 0) {
                const total = data.items.reduce((sum, item) => sum + (item.totalPrice ?? item.price), 0);
                const savings = data.items.reduce((sum, item) => sum + ((item.originalPrice && item.originalPrice > item.price) ? (item.originalPrice - item.price) * (item.userQuantity ?? 1) : 0), 0);

                setTimeout(() => {
                    addMessage({
                        type: 'order',
                        isSender: false,
                        orderData: {
                            items: data.items!.map(item => ({
                                id: item.id || Math.random().toString(),
                                name: item.name,
                                brand: item.brand || '',
                                quantity: item.quantity || 1,
                                userQuantity: item.userQuantity,
                                totalPrice: item.totalPrice,
                                price: item.price,
                                store: item.store as 'Jumbo' | 'Lider' | 'Unimarc' | 'Santa Isabel',
                                isOffer: item.isOffer ?? false,
                                originalPrice: item.originalPrice,
                            })),
                            total,
                            savings,
                        },
                        status: 'read'
                    });
                }, 600);

                // Si hay canastas alternativas, mostrar opciones
                const alternatives = data.basketComparison?.filter(b => b.store !== data.recommendedStore && b.coveredCount > 0);
                if (alternatives && alternatives.length > 0 && data.items) {
                    setTimeout(() => {
                        addMessage({
                            type: 'basket_choice',
                            isSender: false,
                            basketChoices: alternatives,
                            status: 'read'
                        });
                    }, 1200);
                }

                // Si hay productos faltantes, mostrar alerta
                if (data.missingTerms && data.missingTerms.length > 0) {
                    setTimeout(() => {
                        addMessage({
                            type: 'text',
                            content: `⚠️ En ${data.recommendedStore || 'esta tienda'} no encontré: ${data.missingTerms!.join(', ')}. Puedes agregarlos manualmente o probar en otra tienda.`,
                            isSender: false,
                            status: 'read'
                        });
                    }, 1400);
                }
            }

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
            status: 'sent',
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
        <div className="flex flex-col h-[700px] w-full max-w-md mx-auto bg-[#efeae2] dark:bg-[#0b141a] rounded-lg overflow-hidden shadow-sm relative border-4 border-slate-900">
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
                        <h3 className="font-semibold text-sm">CoCo Supermercado</h3>
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
                                    <p className="text-sm cc-text-primary pr-8">{msg.content}</p>
                                )}

                                {msg.type === 'audio' && (
                                    <AudioMessage duration={msg.audioDuration!} isSender={msg.isSender} />
                                )}

                                {msg.type === 'order' && msg.orderData && (
                                    <OrderPreviewBubble
                                        items={msg.orderData.items}
                                        total={msg.orderData.total}
                                        savings={msg.orderData.savings}
                                    />
                                )}

                                {msg.type === 'basket_choice' && msg.basketChoices && (
                                    <div className="space-y-2">
                                        <p className="text-xs font-semibold cc-text-secondary mb-2">📊 Otras canastas disponibles:</p>
                                        {msg.basketChoices.map(basket => (
                                            <button
                                                key={basket.store}
                                                onClick={() => {
                                                    // Reconstruir items de la canasta seleccionada
                                                    // Necesitamos los items originales; como no los tenemos en este mensaje,
                                                    // mostramos un mensaje indicando que debe volver a consultar
                                                    addMessage({
                                                        type: 'text',
                                                        content: `Para comprar en ${basket.store}, escríbeme de nuevo tu lista y especifica "en ${basket.store}".`,
                                                        isSender: false,
                                                    });
                                                }}
                                                className="w-full text-left p-2 rounded-lg border border-subtle hover:bg-canvas transition-all"
                                            >
                                                <div className="flex justify-between items-center">
                                                    <span className="text-sm font-semibold">{basket.store}</span>
                                                    <span className="text-sm font-bold">${basket.subtotal.toLocaleString('es-CL')}</span>
                                                </div>
                                                <div className="flex justify-between text-[10px] text-slate-400">
                                                    <span>{basket.coveredCount}/{basket.requestedCount} productos</span>
                                                    {basket.complete ? <span className="text-emerald-500">✓ Completa</span> : <span className="text-amber-500">Incompleta</span>}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
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
                                    <span className="text-[10px] cc-text-secondary min-w-[30px] text-right">{msg.timestamp}</span>
                                    {msg.isSender && (
                                        <CheckCheck className={`h-3 w-3 ${msg.status === 'read' ? 'text-blue-500' : 'text-slate-400'}`} />
                                    )}
                                </div>
                            </div>
                        )}
                    </motion.div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="bg-[#f0f2f5] dark:bg-[#202c33] p-2 flex items-center gap-2">
                <button type="button" disabled title="Reacciones disponibles al activar mensajeria avanzada" className="cursor-not-allowed rounded-full p-2 text-slate-400 opacity-55">
                    <Smile className="h-6 w-6" />
                </button>
                <button type="button" disabled title="Adjuntos disponibles al activar mensajeria avanzada" className="cursor-not-allowed rounded-full p-2 text-slate-400 opacity-55">
                    <Plus className="h-6 w-6" />
                </button>

                <div className="flex-1 bg-white dark:bg-[#2a3942] rounded-lg px-4 py-2 flex items-center">
                    <input
                        type="text"
                        className="w-full bg-transparent border-none outline-none cc-text-primary placeholder-slate-400"
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
                        type="button"
                        onClick={handleSendText}
                        className="p-3 bg-[#008069] text-white rounded-full shadow-md"
                    >
                        <Send className="h-5 w-5" />
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={handleSendAudio}
                        className="p-3 rounded-full bg-[#008069] text-white shadow-md transition-all hover:bg-[#006e5a]"
                    >
                        <Mic className="h-5 w-5" />
                    </button>
                )}
            </div>
        </div>
    );
}
