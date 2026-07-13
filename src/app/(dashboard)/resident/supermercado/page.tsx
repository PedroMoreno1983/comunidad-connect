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
import { DisplayHeading } from "@/components/cc/Eyebrow";

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
            <section className="relative overflow-hidden rounded-2xl border p-6 text-white md:p-8" style={{ borderColor: "var(--cc-line)", background: "var(--cc-ink)" }}>
                <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
                    <div className="space-y-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em]"
                            style={{ borderColor: "rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)" }}
                        >
                            <Sparkles className="h-3 w-3" style={{ color: "var(--cc-copper-tint)" }} />
                            Nuevo: Smart Shopping
                        </motion.div>
                        <DisplayHeading size={36} style={{ color: "#fff" }}>
                            Tus compras, <em style={{ color: "var(--cc-copper-tint)", fontStyle: "italic" }}>más inteligentes.</em>
                        </DisplayHeading>
                    </div>

                    {/* AI Input */}
                    <div className="rounded-2xl border p-5" style={{ borderColor: "rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)" }}>
                        <div className="space-y-3">
                            <label className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.5)" }}>Pregúntale a CoCo</label>
                            <div className="relative">
                                <textarea
                                    className="min-h-[80px] w-full rounded-xl border p-3 text-sm text-white transition-all focus:outline-none focus:ring-1"
                                    style={{ borderColor: "rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.1)" }}
                                    placeholder="Ej: Necesito ingredientes para una cena keto..."
                                    value={aiInput}
                                    onChange={(e) => setAiInput(e.target.value)}
                                />
                                <button
                                    onClick={processAiInput}
                                    disabled={loading}
                                    className="absolute bottom-3 right-3 p-2 rounded-full disabled:opacity-50"
                                    style={{ background: "#fff", color: "var(--cc-copper)" }}
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
                    <div className="rounded-2xl border p-6" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                        <div className="flex items-center justify-between mb-8">
                            <h2 className="flex items-center gap-3 text-xl font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>
                                <ListChecks style={{ color: "var(--cc-copper)" }} />
                                Lista de Compras
                            </h2>
                            <span className="rounded-full px-3 py-1.5 text-xs font-semibold cc-text-tertiary" style={{ background: "var(--cc-paper-warm)" }}>
                                {list.length} artículos
                            </span>
                        </div>

                        <form onSubmit={addItem} className="flex gap-3 mb-8">
                            <Input
                                placeholder="Añade un producto..."
                                className="h-12 rounded-lg text-sm transition-all"
                                style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}
                                value={newItem}
                                onChange={(e) => setNewItem(e.target.value)}
                            />
                            <Button type="submit" className="h-12 w-12 rounded-full p-0" style={{ background: "var(--cc-copper)" }}>
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
                                        className="flex items-center justify-between rounded-xl border p-4 transition-all"
                                        style={item.checked
                                            ? { background: "var(--cc-sage-tint)", borderColor: "var(--cc-success-border)", opacity: 0.6 }
                                            : { background: "var(--cc-paper)", borderColor: "var(--cc-line)" }}
                                    >
                                        <div className="flex items-center gap-4">
                                            <button
                                                type="button"
                                                onClick={() => toggleItem(item.id)}
                                                className="h-6 w-6 rounded-lg border-2 flex items-center justify-center transition-all"
                                                style={item.checked
                                                    ? { background: "var(--cc-sage)", borderColor: "var(--cc-sage)", color: "#fff" }
                                                    : { borderColor: "var(--cc-line)" }}
                                            >
                                                {item.checked && <CheckCircle2 className="h-4 w-4" />}
                                            </button>
                                            <div className="flex flex-col">
                                                <span className={`text-lg font-medium ${item.checked ? 'line-through cc-text-disabled' : 'cc-text-secondary'}`}>
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
                                                            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider cc-text-tertiary" style={{ background: "var(--cc-paper-warm)" }}>
                                                                {item.store}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <button type="button" onClick={() => removeItem(item.id)} className="p-2 text-[var(--cc-ink-faint)] hover:text-[var(--cc-rose)] transition-colors">
                                            <Trash2 className="h-5 w-5" />
                                        </button>
                                    </motion.div>
                                ))}
                            </AnimatePresence>

                            {list.length === 0 && (
                                <div className="py-20 text-center space-y-4 opacity-40">
                                    <ShoppingCart className="h-16 w-16 mx-auto" style={{ color: "var(--cc-ink-faint)" }} />
                                    <p className="cc-text-tertiary font-bold">Tu lista está vacía</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* AI Planner Sidebar */}
                <div className="space-y-6">
                    <div className="rounded-2xl p-6 text-white" style={{ background: "var(--cc-ink)" }}>
                        <div className="flex items-center gap-3 mb-6">
                            <ChefHat style={{ color: "var(--cc-copper-tint)" }} />
                            <h3 className="text-xl font-semibold" style={{ fontFamily: "var(--cc-font-display)" }}>Planes de CoCo</h3>
                        </div>
                        <div className="space-y-4">
                            {AI_SUGGESTIONS.map((plan, idx) => {
                                const PlanIcon = plan.icon;
                                return (
                                    <button
                                        key={idx}
                                        onClick={() => applyAiPlan(plan)}
                                        className="group w-full rounded-xl border p-4 text-left transition-colors hover:bg-white/10"
                                        style={{ borderColor: "rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)" }}
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <PlanIcon className="h-6 w-6" style={{ color: "var(--cc-copper-tint)" }} />
                                            <ArrowRight className="h-4 w-4 text-white/20 group-hover:text-white transition-all opacity-0 group-hover:opacity-100" />
                                        </div>
                                        <h4 className="font-bold text-lg mb-1">{plan.title}</h4>
                                        <p className="text-xs text-white/40 font-medium">{plan.items.slice(0, 3).join(", ")}...</p>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="rounded-2xl border p-6" style={{ borderColor: "var(--cc-line)", background: "var(--cc-copper-tint)" }}>
                        <div className="flex items-start gap-3">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white" style={{ background: "var(--cc-copper)" }}>
                                <PackageCheck className="h-6 w-6" />
                            </div>
                            <div className="min-w-0">
                                <h3 className="text-lg font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>Abasto comunitario</h3>
                                <p className="mt-2 text-sm leading-6 cc-text-secondary">
                                    Coordina compras al por mayor de agua, gas, alimentos o limpieza con ahorro real por escala.
                                </p>
                                <Link href="/convivencia" className="mt-4 inline-flex items-center gap-2 text-xs font-semibold" style={{ color: "var(--cc-copper)" }}>
                                    Ver compras colectivas <ArrowRight className="h-4 w-4" />
                                </Link>
                            </div>
                        </div>
                    </div>

                    {/* Coordination card for enabled supermarket channels */}
                    <div className="rounded-2xl border p-6" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "var(--cc-sage-tint)" }}>
                                <ShoppingCart className="h-6 w-6" style={{ color: "var(--cc-sage)" }} />
                            </div>
                            <Button
                                onClick={handleExportList}
                                disabled={exportDisabled || loading}
                                className="text-white rounded-full h-12 px-6 font-bold flex items-center gap-2 group"
                                style={{ background: "var(--cc-ink)" }}
                            >
                                Exportar lista {totalAmount > 0 ? `($${totalAmount.toLocaleString('es-CL')})` : ''}
                                <Download className="h-4 w-4 group-hover:translate-y-0.5 transition-transform" />
                            </Button>
                        </div>
                        <div className="space-y-4">
                            <div className="flex items-center gap-3 rounded-xl p-3" style={{ background: "var(--cc-paper-warm)" }}>
                                <div className="h-8 w-8 rounded-lg" style={{ background: "var(--cc-copper-tint)" }} />
                                <span className="text-sm font-bold cc-text-secondary">Canal supermercado comunidad</span>
                            </div>
                            <div className="flex items-center gap-3 rounded-xl border p-3 opacity-40" style={{ borderColor: "var(--cc-line)" }}>
                                <div className="h-8 w-8 rounded-lg" style={{ background: "var(--cc-amber-tint)" }} />
                                <span className="text-sm font-bold cc-text-secondary">Integracion de pago bajo contrato</span>
                            </div>
                        </div>
                        <p className="mt-6 text-center text-[10px] font-semibold uppercase tracking-widest cc-text-tertiary">
                            Lista operativa hoy; pago directo disponible al activar convenio de pagos
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
