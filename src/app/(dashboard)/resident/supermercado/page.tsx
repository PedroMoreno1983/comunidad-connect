"use client";

import { useState } from "react";
import Link from "next/link";
import { 
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
    ArrowRight,
    Download,
    PackageCheck
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

// Curated AI Suggestions
const AI_SUGGESTIONS = [
    { title: "Plan Semanal Saludable", items: ["Pechuga de pollo", "Arroz", "Paltas", "Huevos"], icon: ChefHat },
    { title: "Kit de Asado Chileno", items: ["Carne molida", "Cebolla", "Papa", "Limón", "Tomate", "Pan molde"], icon: UtensilsCrossed },
    { title: "Desayuno Energético", items: ["Avena", "Leche", "Yogurt", "Manzana"], icon: UtensilsCrossed }
];

export default function SupermarketPage() {
    const { toast } = useToast();
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
    
    const totalAmount = list.reduce((sum, item) => sum + (item.price || 0), 0);
    const exportDisabled = list.length === 0;

    const handleExportList = () => {
        if (list.length === 0) return;

        const lines = [
            "Lista de compras Convive Connect",
            `Generada: ${new Date().toLocaleString("es-CL")}`,
            "",
            ...list.map((item, index) => {
                const status = item.checked ? "[x]" : "[ ]";
                const price = item.price ? ` - $${item.price.toLocaleString("es-CL")}` : "";
                const store = item.store ? ` (${item.store})` : "";
                return `${index + 1}. ${status} ${item.name}${price}${store}`;
            }),
            "",
            `Total referencial: $${totalAmount.toLocaleString("es-CL")}`,
            "Nota: la compra se coordina con los canales habilitados por la comunidad.",
        ];

        const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `lista-compras-convive-${new Date().toISOString().slice(0, 10)}.txt`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);

        toast({
            title: "Lista exportada",
            description: "Descargue una lista editable para coordinar la compra por el canal de su comunidad.",
            variant: "success",
        });
    };

    return (
        <div className="max-w-6xl mx-auto pb-20 space-y-10 px-4 sm:px-0">
            <section className="relative overflow-hidden rounded-lg border border-subtle bg-slate-950 p-6 text-white shadow-sm md:p-8">
                
                <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
                    <div className="space-y-4">
                        <motion.div 
                            initial={{ opacity: 0 }} 
                            animate={{ opacity: 1 }}
                            className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em]"
                        >
                            <Sparkles className="h-3 w-3" />
                            Nuevo: Smart Shopping
                        </motion.div>
                        <h1 className="text-3xl font-semibold leading-tight md:text-4xl">
                            Tus compras, <br /><span className="text-indigo-200">más inteligentes.</span>
                        </h1>
                    </div>
                    
                    {/* AI Input */}
                    <div className="rounded-lg border border-white/10 bg-white/5 p-5">
                        <div className="space-y-3">
                            <label className="text-[10px] font-semibold text-white/50 uppercase tracking-widest">Pregúntale a CoCo</label>
                            <div className="relative">
                                <textarea 
                                    className="min-h-[80px] w-full rounded-lg border border-white/10 bg-white/10 p-3 text-sm text-white placeholder:text-white/30 transition-all focus:outline-none focus:ring-1 focus:ring-white/20"
                                    placeholder="Ej: Necesito ingredientes para una cena keto..."
                                    value={aiInput}
                                    onChange={(e) => setAiInput(e.target.value)}
                                />
                                <button 
                                    onClick={processAiInput}
                                    disabled={loading}
                                    className="absolute bottom-3 right-3 p-2 bg-white text-brand-600 rounded-lg shadow-sm disabled:opacity-50"
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
                    <div className="rounded-lg border border-subtle bg-surface p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-8">
                            <h2 className="flex items-center gap-3 text-xl font-semibold cc-text-primary">
                                <ListChecks className="text-brand-600" />
                                Lista de Compras
                            </h2>
                            <span className="rounded-md bg-elevated px-3 py-1.5 text-xs font-semibold text-slate-500">
                                {list.length} artículos
                            </span>
                        </div>

                        <form onSubmit={addItem} className="flex gap-3 mb-8">
                            <Input 
                                placeholder="Añade un producto..."
                                className="h-12 rounded-lg border-subtle bg-elevated/50 text-sm transition-all focus:bg-white dark:focus:bg-slate-800"
                                value={newItem}
                                onChange={(e) => setNewItem(e.target.value)}
                            />
                            <Button type="submit" className="h-12 w-12 rounded-lg bg-brand-600 p-0 hover:bg-brand-700">
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
                                        className={`flex items-center justify-between rounded-lg border p-4 transition-all ${
                                            item.checked 
                                            ? 'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-800 opacity-60' 
                                            : 'bg-surface border-subtle hover:border-indigo-200 dark:hover:border-indigo-900/40'
                                        }`}
                                    >
                                        <div className="flex items-center gap-4">
                                            <button
                                                type="button"
                                                onClick={() => toggleItem(item.id)}
                                                className={`h-6 w-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                                                    item.checked ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-subtle'
                                                }`}
                                            >
                                                {item.checked && <CheckCircle2 className="h-4 w-4" />}
                                            </button>
                                            <div className="flex flex-col">
                                                <span className={`text-lg font-medium ${item.checked ? 'line-through text-slate-400' : 'cc-text-secondary'}`}>
                                                    {item.name}
                                                </span>
                                                {(item.price || item.store) && (
                                                    <div className="flex items-center gap-2 mt-1">
                                                        {item.price && (
                                                            <span className="text-sm font-bold text-success-fg">
                                                                ${item.price.toLocaleString('es-CL')}
                                                            </span>
                                                        )}
                                                        {item.store && (
                                                            <span className="rounded-md bg-elevated px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                                                {item.store}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <button type="button" onClick={() => removeItem(item.id)} className="p-2 text-slate-300 hover:text-red-500 transition-colors">
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
                    <div className="rounded-lg bg-slate-950 p-6 text-white shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                            <ChefHat className="text-brand-400" />
                            <h3 className="text-xl font-semibold">Planes de CoCo</h3>
                        </div>
                        <div className="space-y-4">
                            {AI_SUGGESTIONS.map((plan, idx) => {
                                const PlanIcon = plan.icon;
                                return (
                                    <button 
                                        key={idx}
                                        onClick={() => applyAiPlan(plan)}
                                        className="group w-full rounded-lg border border-white/10 bg-white/5 p-4 text-left transition-colors hover:bg-white/10"
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <PlanIcon className="h-6 w-6 text-brand-400" />
                                            <ArrowRight className="h-4 w-4 text-white/20 group-hover:text-white transition-all opacity-0 group-hover:opacity-100" />
                                        </div>
                                        <h4 className="font-bold text-lg mb-1">{plan.title}</h4>
                                        <p className="text-xs text-white/40 font-medium">{plan.items.slice(0, 3).join(", ")}...</p>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="rounded-lg border border-brand-100 bg-brand-50/60 p-6 shadow-sm">
                        <div className="flex items-start gap-3">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-white">
                                <PackageCheck className="h-6 w-6" />
                            </div>
                            <div className="min-w-0">
                                <h3 className="text-lg font-semibold cc-text-primary">Abasto comunitario</h3>
                                <p className="mt-2 text-sm leading-6 cc-text-secondary">
                                    Coordina compras al por mayor de agua, gas, alimentos o limpieza con ahorro real por escala.
                                </p>
                                <Link href="/convivencia" className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-brand-700 hover:text-brand-800">
                                    Ver compras colectivas <ArrowRight className="h-4 w-4" />
                                </Link>
                            </div>
                        </div>
                    </div>

                    {/* Coordination card for enabled supermarket channels */}
                    <div className="rounded-lg border border-subtle bg-surface p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                                <ShoppingCart className="h-6 w-6 text-emerald-600" />
                            </div>
                            <Button 
                                onClick={handleExportList}
                                disabled={exportDisabled || loading}
                                className="bg-slate-900 dark:bg-white dark:text-slate-900 text-white rounded-xl h-12 px-6 font-bold flex items-center gap-2 group"
                            >
                                Exportar lista {totalAmount > 0 ? `($${totalAmount.toLocaleString('es-CL')})` : ''}
                                <Download className="h-4 w-4 group-hover:translate-y-0.5 transition-transform" />
                            </Button>
                        </div>
                        <div className="space-y-4">
                            <div className="flex items-center gap-3 rounded-lg bg-elevated/50 p-3">
                                <div className="h-8 w-8 rounded-md border border-blue-200 bg-blue-100" />
                                <span className="text-sm font-bold cc-text-secondary">Canal supermercado comunidad</span>
                            </div>
                            <div className="flex items-center gap-3 rounded-lg border border-subtle p-3 opacity-40">
                                <div className="h-8 w-8 rounded-md border border-orange-200 bg-orange-100" />
                                <span className="text-sm font-bold cc-text-secondary">Integracion de pago bajo contrato</span>
                            </div>
                        </div>
                        <p className="mt-6 text-center text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                            Lista operativa hoy; pago directo disponible al activar convenio de pagos
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
