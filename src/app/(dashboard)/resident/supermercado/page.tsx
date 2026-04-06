"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { 
    ShoppingBag, 
    Sparkles, 
    ListChecks, 
    ShoppingCart, 
    Plus, 
    Trash2, 
    CheckCircle2, 
    ChevronRight, 
    Loader2, 
    ChefHat,
    UtensilsCrossed,
    CalendarDays,
    ArrowRight
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";

interface CartItem {
    id: string;
    name: string;
    price?: number;
    store?: string;
    originalPrice?: number;
    isOffer?: boolean;
    checked: boolean;
}

// Mock AI Suggestions
const AI_SUGGESTIONS = [
    { title: "Plan Semanal Saludable", items: ["Pechuga de pollo", "Arroz", "Paltas", "Huevos"], icon: ChefHat },
    { title: "Kit de Asado Chileno", items: ["Carne molida", "Cebolla", "Papa", "Limón", "Tomate", "Pan molde"], icon: UtensilsCrossed },
    { title: "Desayuno Energético", items: ["Avena", "Leche", "Yogurt", "Manzana"], icon: UtensilsCrossed }
];

export default function SupermarketPage() {
    const { toast } = useToast();
    const router = useRouter(); // Required for redirecting to mock-payment
    const [list, setList] = useState<CartItem[]>([]);
    const [newItem, setNewItem] = useState("");
    const [loading, setLoading] = useState(false);
    const [aiInput, setAiInput] = useState("");

    const addItem = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!newItem.trim()) return;
        setList([...list, { id: Math.random().toString(), name: newItem.trim(), checked: false }]);
        setNewItem("");
    };

    const applyAiPlan = (plan: typeof AI_SUGGESTIONS[0]) => {
        setAiInput(`Necesito comprar: ${plan.items.join(", ")}`);
        // Scroll to the AI input to encourage processing
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const processAiInput = async () => {
        if (!aiInput.trim()) return;
        setLoading(true);
        
        try {
            const response = await fetch("/api/supermarket", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: aiInput, previousItems: list })
            });
            
            const data = await response.json();
            
            if (data.items && data.items.length > 0) {
                // Remove duplicates and append new
                const existingNames = list.map(i => i.name.toLowerCase());
                const filteredNewItems = data.items.filter((i: CartItem) => !existingNames.includes(i.name.toLowerCase()));
                
                setList([...list, ...filteredNewItems]);
                setAiInput("");
                toast({
                    title: "Lista Inteligente Generada",
                    description: "Encontré los mejores precios para ti.",
                    variant: "success"
                });
            } else {
                toast({
                    title: "Aviso",
                    description: data.message || "No encontré esos productos locales.",
                });
            }
        } catch (error) {
            console.error(error);
            toast({ title: "Error", description: "Hubo un fallo contactando a CoCo.", variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    const removeItem = (id: string) => setList(list.filter(i => i.id !== id));
    const toggleItem = (id: string) => setList(list.map(i => i.id === id ? { ...i, checked: !i.checked } : i));
    
    // Calculate total
    const totalAmount = list.reduce((sum, item) => sum + (item.price || 0), 0);
    const checkoutDisabled = list.length === 0;

    const handleCheckout = () => {
        const refId = `SMU-${Date.now()}`;
        router.push(`/mock-payment?amount=${totalAmount}&ref=${refId}&callback=/resident/supermercado`);
    };

    return (
        <div className="max-w-6xl mx-auto pb-20 space-y-10 px-4 sm:px-0">
            {/* Hero Section Premium - Optimized */}
            <section className="relative overflow-hidden rounded-[2.5rem] bg-indigo-600 p-8 md:p-12 text-white shadow-xl">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 blur-[60px] rounded-full -translate-y-1/2 translate-x-1/2" />
                
                <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
                    <div className="space-y-4">
                        <motion.div 
                            initial={{ opacity: 0 }} 
                            animate={{ opacity: 1 }}
                            className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full text-[10px] font-black uppercase tracking-widest"
                        >
                            <Sparkles className="h-3 w-3" />
                            Nuevo: Smart Shopping
                        </motion.div>
                        <h1 className="text-3xl md:text-5xl font-black leading-tight">
                            Tus compras, <br /><span className="text-indigo-200">más inteligentes.</span>
                        </h1>
                    </div>
                    
                    {/* AI Input */}
                    <div className="bg-white/5 backdrop-blur-md rounded-3xl p-6 border border-white/10">
                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-white/50 uppercase tracking-widest">Pregúntale a CoCo</label>
                            <div className="relative">
                                <textarea 
                                    className="w-full bg-white/10 border border-white/10 rounded-xl p-3 text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-white/20 transition-all min-h-[80px] text-base"
                                    placeholder="Ej: Necesito ingredientes para una cena keto..."
                                    value={aiInput}
                                    onChange={(e) => setAiInput(e.target.value)}
                                />
                                <button 
                                    onClick={processAiInput}
                                    disabled={loading}
                                    className="absolute bottom-3 right-3 p-2 bg-white text-indigo-600 rounded-lg shadow-lg disabled:opacity-50"
                                >
                                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* List Management */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 shadow-xl shadow-slate-200/50 dark:shadow-black/20 border border-slate-100 dark:border-slate-800">
                        <div className="flex items-center justify-between mb-8">
                            <h2 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-3">
                                <ListChecks className="text-indigo-600" />
                                Lista de Compras
                            </h2>
                            <span className="px-4 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-full text-xs font-bold text-slate-500">
                                {list.length} artículos
                            </span>
                        </div>

                        <form onSubmit={addItem} className="flex gap-3 mb-8">
                            <Input 
                                placeholder="Añade un producto..."
                                className="h-14 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border-transparent focus:bg-white dark:focus:bg-slate-800 transition-all text-lg"
                                value={newItem}
                                onChange={(e) => setNewItem(e.target.value)}
                            />
                            <Button type="submit" className="h-14 w-14 rounded-2xl bg-indigo-600 hover:bg-indigo-700 p-0 shadow-lg shadow-indigo-600/20">
                                <Plus className="h-6 w-6 text-white" />
                            </Button>
                        </form>

                        <div className="space-y-3">
                            <AnimatePresence>
                                {list.map((item) => (
                                    <motion.div 
                                        key={item.id}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 10 }}
                                        className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${
                                            item.checked 
                                            ? 'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-800 opacity-60' 
                                            : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-900/40'
                                        }`}
                                    >
                                        <div className="flex items-center gap-4">
                                            <button 
                                                onClick={() => toggleItem(item.id)}
                                                className={`h-6 w-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                                                    item.checked ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-200 dark:border-slate-700'
                                                }`}
                                            >
                                                {item.checked && <CheckCircle2 className="h-4 w-4" />}
                                            </button>
                                            <div className="flex flex-col">
                                                <span className={`text-lg font-medium ${item.checked ? 'line-through text-slate-400' : 'text-slate-700 dark:text-slate-200'}`}>
                                                    {item.name}
                                                </span>
                                                {(item.price || item.store) && (
                                                    <div className="flex items-center gap-2 mt-1">
                                                        {item.price && (
                                                            <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                                                                ${item.price.toLocaleString('es-CL')}
                                                            </span>
                                                        )}
                                                        {item.store && (
                                                            <span className="text-[10px] px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-full font-bold uppercase tracking-wider">
                                                                {item.store}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <button onClick={() => removeItem(item.id)} className="p-2 text-slate-300 hover:text-red-500 transition-colors">
                                            <Trash2 className="h-5 w-5" />
                                        </button>
                                    </motion.div>
                                ))}
                            </AnimatePresence>

                            {list.length === 0 && (
                                <div className="py-20 text-center space-y-4 opacity-40">
                                    <ShoppingCart className="h-16 w-16 mx-auto text-slate-300" />
                                    <p className="text-slate-500 font-bold">Tu lista está vacía</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* AI Planner Sidebar */}
                <div className="space-y-6">
                    <div className="bg-gradient-to-br from-slate-900 to-indigo-950 rounded-[2.5rem] p-8 text-white shadow-2xl">
                        <div className="flex items-center gap-3 mb-6">
                            <ChefHat className="text-indigo-400" />
                            <h3 className="text-xl font-black">Planes de CoCo</h3>
                        </div>
                        <div className="space-y-4">
                            {AI_SUGGESTIONS.map((plan, idx) => {
                                const PlanIcon = plan.icon;
                                return (
                                    <button 
                                        key={idx}
                                        onClick={() => applyAiPlan(plan)}
                                        className="w-full p-5 bg-white/5 border border-white/10 rounded-3xl hover:bg-white/10 transition-all text-left group"
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <PlanIcon className="h-6 w-6 text-indigo-400" />
                                            <ArrowRight className="h-4 w-4 text-white/20 group-hover:text-white transition-all opacity-0 group-hover:opacity-100" />
                                        </div>
                                        <h4 className="font-bold text-lg mb-1">{plan.title}</h4>
                                        <p className="text-xs text-white/40 font-medium">{plan.items.slice(0, 3).join(", ")}...</p>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Checkout Card - Target: Lider/Jumbo Chile */}
                    <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 border border-slate-100 dark:border-slate-800 shadow-xl">
                        <div className="flex items-center justify-between mb-8">
                            <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-2xl flex items-center justify-center">
                                <ShoppingCart className="h-6 w-6 text-emerald-600" />
                            </div>
                            <Button 
                                onClick={handleCheckout}
                                disabled={checkoutDisabled || loading}
                                className="bg-slate-900 dark:bg-white dark:text-slate-900 text-white rounded-xl h-12 px-6 font-bold flex items-center gap-2 group"
                            >
                                Checkout {totalAmount > 0 ? `($${totalAmount.toLocaleString('es-CL')})` : ''}
                                <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                            </Button>
                        </div>
                        <div className="space-y-4">
                            <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
                                <div className="w-8 h-8 rounded-full bg-blue-100 border border-blue-200" />
                                <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Jumbo Delivery</span>
                            </div>
                            <div className="flex items-center gap-3 p-3 rounded-2xl border border-slate-100 dark:border-slate-800 opacity-40">
                                <div className="w-8 h-8 rounded-full bg-orange-100 border border-orange-200" />
                                <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Líder App</span>
                            </div>
                        </div>
                        <p className="mt-6 text-[10px] uppercase font-black tracking-widest text-slate-400 text-center">Próximamente Integración API Directa</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
