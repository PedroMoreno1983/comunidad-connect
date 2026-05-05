"use client";

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { MarketplaceService } from "@/lib/api";
import {
    Plus, Tag, ShoppingBag, Sparkles, Repeat, Image as ImageIcon, Loader2, Info, ShieldCheck, AlertCircle
} from "lucide-react";
import { MarketplaceItem } from "@/lib/types";
import { useSearchParams } from 'next/navigation';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/authContext";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { MarketplaceCard } from "@/components/marketplace/MarketplaceCard";
import { ProductFilters } from "@/components/marketplace/ProductFilters";
import { ProductDetailModal } from "@/components/marketplace/ProductDetailModal";
import { ChatModal } from "@/components/marketplace/ChatModal";
import { PaymentModal } from "@/components/marketplace/PaymentModal";
import {
    Grid3X3, Smartphone, Armchair, Shirt, Package, Search, ShoppingCart, Truck, ChefHat, ArrowRight
} from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

// Category config repeated here for components or exported from types
const categoryConfig: Record<string, {
    icon: React.ComponentType<{ className?: string }>;
    gradient: string;
    bg: string;
}> = {
    all: { icon: Grid3X3, gradient: 'from-slate-500 to-slate-700', bg: 'bg-elevated' },
    electronics: { icon: Smartphone, gradient: 'from-[#3B82F6] to-[#6D28D9]', bg: 'bg-blue-100 dark:bg-blue-500/20' },
    furniture: { icon: Armchair, gradient: 'from-[#F59E0B] to-[#EA580C]', bg: 'bg-warning-bg' },
    clothing: { icon: Shirt, gradient: 'from-[#EC4899] to-[#E11D48]', bg: 'bg-pink-100 dark:bg-pink-500/20' },
    other: { icon: Package, gradient: 'from-[#10B981] to-[#0D9488]', bg: 'bg-success-bg' },
};

export default function MarketplacePage() {
    const [searchTerm, setSearchTerm] = useState('');
    const [items, setItems] = useState<MarketplaceItem[]>([]);
    const [searchResults, setSearchResults] = useState<MarketplaceItem[] | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [selectedItem, setSelectedItem] = useState<MarketplaceItem | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [isPaymentOpen, setIsPaymentOpen] = useState(false);
    const [newItem, setNewItem] = useState({
        title: '',
        price: '',
        description: '',
        category: 'other',
        allowSale: true,
        allowSwap: false,
        swapDetails: '',
        allowBarter: false,
        barterDetails: ''
    });

    const [isRulesOpen, setIsRulesOpen] = useState(false);

    const [loading, setLoading] = useState(true);
    const [publishing, setPublishing] = useState(false);
    const [imageFiles, setImageFiles] = useState<File[]>([]);
    const [previewUrls, setPreviewUrls] = useState<string[]>([]);
    const { toast } = useToast();
    const { user } = useAuth();
    const searchParams = useSearchParams();

    useEffect(() => {
        if (searchParams.get('status') === 'success') {
            toast({
                title: "¡Compra Exitosa!",
                description: "Tu pago se ha procesado. El vendedor será notificado.",
                variant: "success",
            });
        }
        loadItems();
    }, [searchParams]);

    const loadItems = async () => {
        setLoading(true);
        try {
            const realItems = await MarketplaceService.getItemsV2();
            setItems(realItems || []);
        } catch (error: unknown) {
            console.error("Error loading items:", error);
            toast({
                title: "Error al cargar productos",
                description: error instanceof Error ? error.message : "No se pudieron obtener los anuncios reales.",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    // ── Búsqueda híbrida con debounce 400ms ─────────────────────────────────
    const runSearch = useCallback(async (query: string) => {
        if (query.length < 2) {
            setSearchResults(null);
            return;
        }
        setIsSearching(true);
        try {
            const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&scope=marketplace`);
            if (!res.ok) throw new Error('Search failed');
            const data = await res.json();
            // Map API results back to MarketplaceItem shape
            setSearchResults(
                (data.results ?? []).map((r: Record<string, unknown>) => ({
                    id: r.id as string,
                    title: r.title as string,
                    description: r.description as string,
                    price: r.price as number,
                    category: r.category as string,
                    imageUrl: r.image_url as string | undefined,
                    images: r.image_url ? [r.image_url as string] : [],
                    sellerId: r.seller_id as string,
                    status: r.status as 'available' | 'sold',
                    createdAt: r.created_at as string,
                }))
            );
        } catch (err) {
            console.error('[Search] API error:', err);
            // Fallback: filtrado JS local
            setSearchResults(
                items.filter(item =>
                    item.title.toLowerCase().includes(query.toLowerCase()) ||
                    item.description.toLowerCase().includes(query.toLowerCase())
                )
            );
        } finally {
            setIsSearching(false);
        }
    }, [items]);

    useEffect(() => {
        if (!searchTerm.trim()) {
            setSearchResults(null);
            return;
        }
        const timer = setTimeout(() => runSearch(searchTerm), 400);
        return () => clearTimeout(timer);
    }, [searchTerm, runSearch]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const files = Array.from(e.target.files);
            setImageFiles(prev => [...prev, ...files]);

            const urls = files.map(file => URL.createObjectURL(file));
            setPreviewUrls(prev => [...prev, ...urls]);
        }
    };

    const categories = [
        { id: 'all', label: 'Todos' },
        { id: 'electronics', label: 'Electrónica' },
        { id: 'furniture', label: 'Muebles' },
        { id: 'clothing', label: 'Ropa' },
        { id: 'other', label: 'Otros' },
    ];

    // Usa resultados de búsqueda híbrida si hay query; si no, la lista completa
    const baseItems = searchResults !== null ? searchResults : items;
    const filteredItems = baseItems.filter(item => {
        const matchesCategory = !selectedCategory || selectedCategory === 'all' || item.category === selectedCategory;
        return matchesCategory;
    });

    const handleAddItem = async (e: React.FormEvent) => {
        e.preventDefault();
        setPublishing(true);

        try {
            if (!newItem.allowSale && !newItem.allowSwap && !newItem.allowBarter) {
                toast({
                    title: "Error",
                    description: "Debes seleccionar al menos una modalidad de publicación.",
                    variant: "destructive",
                });
                return;
            }

            await MarketplaceService.createItem({
                ...newItem,
                price: Number(newItem.price)
            } as Partial<MarketplaceItem>, imageFiles);

            toast({
                title: "¡Artículo publicado!",
                description: "Tu artículo ya está visible para la comunidad.",
                variant: "success",
            });

            setIsDialogOpen(false);
            setNewItem({
                title: '',
                price: '',
                description: '',
                category: 'other',
                allowSale: true,
                allowSwap: false,
                swapDetails: '',
                allowBarter: false,
                barterDetails: ''
            });
            setImageFiles([]);
            setPreviewUrls([]);
            loadItems();
        } catch (error: unknown) {
            console.error("Error al publicar item:", error);
            toast({
                title: "Error al publicar",
                description: error instanceof Error ? error.message : "No se pudo subir tu artículo. Revisa tu conexión.",
                variant: "destructive",
            });
        } finally {
            setPublishing(false);
        }
    };

    const getCategoryConfigForId = (category: string) => {
        return categoryConfig[category] || categoryConfig.other;
    };

    return (
        <div className="max-w-7xl mx-auto pb-12 space-y-12">
            {/* Hero Section Premium */}
            <section className="relative overflow-hidden rounded-[2.5rem] bg-slate-900 dark:bg-slate-950 p-8 md:p-12 shadow-2xl">
                <div className="absolute top-0 right-0 -translate-y-12 translate-x-12 w-64 h-64 bg-blue-500/20 blur-[100px] rounded-full" />
                <div className="absolute bottom-0 left-0 translate-y-12 -translate-x-12 w-64 h-64 bg-purple-500/20 blur-[100px] rounded-full" />

                <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
                    <div className="max-w-2xl text-center md:text-left space-y-4">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full text-blue-400 text-xs font-bold uppercase tracking-widest mb-2"
                        >
                            <Sparkles className="h-3 w-3" />
                            Comercio Comunitario Seguro
                        </motion.div>
                        <motion.h1
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-4xl md:text-5xl font-black text-white leading-tight"
                        >
                            Encuentra tesoros en tu <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">propia comunidad</span>
                        </motion.h1>
                        <motion.p
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                            className="text-slate-400 text-lg md:text-xl font-medium max-w-lg"
                        >
                            Vende lo que ya no usas y compra artículos de confianza a tus vecinos de ComunidadConnect.
                        </motion.p>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                            className="pt-4 flex flex-wrap justify-center md:justify-start gap-4"
                        >
                            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button variant="primary" size="lg" className="rounded-2xl shadow-xl font-black px-8 py-4">
                                        <Plus className="h-5 w-5 mr-2" />
                                        Publicar algo ahora
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-[550px] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-white/20 dark:border-slate-800 rounded-[2.5rem] p-0 overflow-hidden shadow-2xl">
                                    <div className="max-h-[85vh] overflow-y-auto p-8 md:p-10 space-y-8">
                                        <DialogHeader className="space-y-3">
                                            <DialogTitle className="text-3xl font-black cc-text-primary">Publicar Producto</DialogTitle>
                                            <DialogDescription className="text-slate-500 font-medium text-lg leading-snug">
                                                Conecta con tus vecinos y dale una nueva vida a tus artículos.
                                            </DialogDescription>
                                        </DialogHeader>

                                        <form onSubmit={handleAddItem} className="space-y-10">
                                            {/* Fotos */}
                                            <div className="space-y-4">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Fotos del Producto</label>
                                                <div className="grid grid-cols-4 gap-4">
                                                    {previewUrls.map((url, i) => (
                                                        <div key={i} className="aspect-square rounded-2xl bg-elevated border-2 border-subtle overflow-hidden relative group">
                                                            <Image src={url} alt="Preview" fill className="object-cover" unoptimized />
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setPreviewUrls(prev => prev.filter((_, idx) => idx !== i));
                                                                    setImageFiles(prev => prev.filter((_, idx) => idx !== i));
                                                                }}
                                                                className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                                            >
                                                                <ImageIcon className="h-3 w-3" />
                                                            </button>
                                                        </div>
                                                    ))}
                                                    {previewUrls.length < 4 && (
                                                        <label className="aspect-square rounded-2xl border-2 border-dashed border-subtle hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-500/10 transition-all flex flex-col items-center justify-center cursor-pointer group">
                                                            <Plus className="h-6 w-6 text-slate-400 group-hover:text-blue-500 mb-1" />
                                                            <span className="text-[10px] font-bold text-slate-400 group-hover:text-blue-500">Añadir</span>
                                                            <input type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} />
                                                        </label>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Básicos */}
                                            <div className="space-y-6">
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Título del Anuncio</label>
                                                    <Input
                                                        placeholder="Ej: Bicicleta de Montaña Trek"
                                                        className="h-14 rounded-2xl bg-surface/50 border-subtle focus:ring-blue-500/20 text-lg font-bold"
                                                        required
                                                        value={newItem.title}
                                                        onChange={(e) => setNewItem({ ...newItem, title: e.target.value })}
                                                    />
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Categoría</label>
                                                        <select
                                                            className="w-full h-14 rounded-2xl border border-subtle bg-surface/50 cc-text-primary px-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 appearance-none cursor-pointer"
                                                            value={newItem.category}
                                                            onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                                                        >
                                                            <option value="electronics">Electrónica</option>
                                                            <option value="furniture">Muebles</option>
                                                            <option value="clothing">Ropa</option>
                                                            <option value="other">Otros</option>
                                                        </select>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Estado General</label>
                                                        <select className="w-full h-14 rounded-2xl border border-subtle bg-surface/50 cc-text-primary px-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 appearance-none cursor-pointer">
                                                            <option>Nuevo</option>
                                                            <option>Como Nuevo</option>
                                                            <option>Usado Excelente</option>
                                                            <option>Usado Bueno</option>
                                                        </select>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Modalidades */}
                                            <div className="space-y-6">
                                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Opciones Comerciales</h4>

                                                <div className="space-y-4">
                                                    {/* Opción Venta */}
                                                    <div className={`p-5 rounded-3xl border-2 transition-all cursor-pointer ${newItem.allowSale ? 'border-blue-600 bg-blue-50/30' : 'border-subtle'}`}
                                                        onClick={() => setNewItem({ ...newItem, allowSale: !newItem.allowSale })}>
                                                        <div className="flex items-center justify-between mb-2">
                                                            <div className="flex items-center gap-4">
                                                                <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${newItem.allowSale ? 'bg-blue-600 text-white' : 'bg-elevated text-slate-400'}`}>
                                                                    <Tag className="h-5 w-5" />
                                                                </div>
                                                                <span className="font-black cc-text-primary">Venta Directa</span>
                                                            </div>
                                                            <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center ${newItem.allowSale ? 'bg-blue-600 border-blue-600' : 'border-subtle'}`}>
                                                                {newItem.allowSale && <div className="h-2 w-2 rounded-full bg-white" />}
                                                            </div>
                                                        </div>
                                                        {newItem.allowSale && (
                                                            <div className="pt-4 animate-in fade-in slide-in-from-top-2 duration-300" onClick={(e) => e.stopPropagation()}>
                                                                <Input
                                                                    type="number"
                                                                    placeholder="Precio sugerido (Ej: 150000)"
                                                                    className="h-12 rounded-xl bg-surface/50"
                                                                    required={newItem.allowSale}
                                                                    value={newItem.price}
                                                                    onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
                                                                />
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Opción Permuta */}
                                                    <div className={`p-5 rounded-3xl border-2 transition-all cursor-pointer ${newItem.allowSwap ? 'border-purple-600 bg-purple-50/30' : 'border-subtle'}`}
                                                        onClick={() => setNewItem({ ...newItem, allowSwap: !newItem.allowSwap })}>
                                                        <div className="flex items-center justify-between mb-2">
                                                            <div className="flex items-center gap-4">
                                                                <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${newItem.allowSwap ? 'bg-brand-600 text-white' : 'bg-elevated text-slate-400'}`}>
                                                                    <Repeat className="h-5 w-5" />
                                                                </div>
                                                                <span className="font-black cc-text-primary">Permuta</span>
                                                            </div>
                                                            <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center ${newItem.allowSwap ? 'bg-brand-600 border-purple-600' : 'border-subtle'}`}>
                                                                {newItem.allowSwap && <div className="h-2 w-2 rounded-full bg-white" />}
                                                            </div>
                                                        </div>
                                                        {newItem.allowSwap && (
                                                            <div className="pt-4 animate-in fade-in slide-in-from-top-2 duration-300" onClick={(e) => e.stopPropagation()}>
                                                                <textarea
                                                                    className="w-full min-h-[80px] rounded-xl border border-subtle bg-surface/50 cc-text-primary px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                                                                    placeholder="¿Qué buscas a cambio? (Ej: Una tablet o una TV más pequeña)"
                                                                    required={newItem.allowSwap}
                                                                    value={newItem.swapDetails}
                                                                    onChange={(e) => setNewItem({ ...newItem, swapDetails: e.target.value })}
                                                                />
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Opción Trueque */}
                                                    <div className={`p-5 rounded-3xl border-2 transition-all cursor-pointer ${newItem.allowBarter ? 'border-emerald-600 bg-emerald-50/30' : 'border-subtle'}`}
                                                        onClick={() => setNewItem({ ...newItem, allowBarter: !newItem.allowBarter })}>
                                                        <div className="flex items-center justify-between mb-2">
                                                            <div className="flex items-center gap-4">
                                                                <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${newItem.allowBarter ? 'bg-emerald-600 text-white' : 'bg-elevated text-slate-400'}`}>
                                                                    <Sparkles className="h-5 w-5" />
                                                                </div>
                                                                <span className="font-black cc-text-primary">Trueque Abierto</span>
                                                            </div>
                                                            <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center ${newItem.allowBarter ? 'bg-emerald-600 border-emerald-600' : 'border-subtle'}`}>
                                                                {newItem.allowBarter && <div className="h-2 w-2 rounded-full bg-white" />}
                                                            </div>
                                                        </div>
                                                        {newItem.allowBarter && (
                                                            <div className="pt-4 animate-in fade-in slide-in-from-top-2 duration-300" onClick={(e) => e.stopPropagation()}>
                                                                <textarea
                                                                    className="w-full min-h-[80px] rounded-xl border border-subtle bg-surface/50 cc-text-primary px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                                                    placeholder="Cualquier artículo interesante que sea de utilidad..."
                                                                    value={newItem.barterDetails}
                                                                    onChange={(e) => setNewItem({ ...newItem, barterDetails: e.target.value })}
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="space-y-4">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Descripción del Artículo</label>
                                                <textarea
                                                    className="w-full min-h-[120px] rounded-2xl border border-subtle bg-surface/50 cc-text-primary px-4 py-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                                                    placeholder="Cuenta más detalles sobre el artículo..."
                                                    required
                                                    value={newItem.description}
                                                    onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                                                />
                                            </div>

                                            <DialogFooter className="pt-4 pb-2">
                                                <Button
                                                    type="submit"
                                                    disabled={publishing}
                                                    className="w-full h-18 rounded-[1.5rem] bg-blue-600 hover:bg-blue-700 text-white font-black text-xl shadow-2xl shadow-blue-600/30 transition-all hover:scale-[1.02] active:scale-95"
                                                >
                                                    {publishing ? (
                                                        <span className="flex items-center gap-2">
                                                            <Loader2 className="h-5 w-5 animate-spin" />
                                                            Publicando...
                                                        </span>
                                                    ) : "Publicar Anuncio"}
                                                </Button>
                                            </DialogFooter>
                                        </form>
                                    </div>
                                </DialogContent>
                            </Dialog>
                            <Button variant="secondary" className="rounded-2xl px-8 py-4 font-bold shadow-sm">
                                <ShoppingBag className="h-5 w-5 mr-2" />
                                Mis compras
                            </Button>
                            <button 
                                onClick={() => setIsRulesOpen(true)}
                                className="flex items-center gap-2 px-6 py-4 bg-elevated cc-text-secondary font-bold rounded-2xl hover:bg-elevated transition-all active:scale-95 border border-subtle"
                            >
                                <Info className="h-5 w-5" />
                                Reglamento
                            </button>

                            {user?.role === 'admin' && (
                                <button 
                                    className="flex items-center gap-2 px-6 py-4 bg-emerald-100 dark:bg-emerald-900/30 text-success-fg font-bold rounded-2xl hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-all active:scale-95 border border-emerald-200 dark:border-emerald-800"
                                >
                                    <ShieldCheck className="h-5 w-5" />
                                    Moderación
                                </button>
                            )}
                        </motion.div>
                    </div>

                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="hidden lg:block w-72 h-72 bg-gradient-to-br from-blue-500/20 to-purple-500/30 rounded-3xl border border-white/10 backdrop-blur-2xl p-6"
                    >
                        <div className="h-full flex flex-col justify-between">
                            <Tag className="h-12 w-12 text-blue-400 opacity-50" />
                            <div className="space-y-2">
                                <p className="text-white font-bold">Artículos Activos</p>
                                <p className="text-3xl font-black text-white">124</p>
                                <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                                    <div className="w-2/3 h-full bg-blue-500" />
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Filters & Search Section */}
            <div className="relative z-20 -mt-20 px-4 md:px-0">
                <ProductFilters
                    searchTerm={searchTerm}
                    setSearchTerm={setSearchTerm}
                    selectedCategory={selectedCategory}
                    setSelectedCategory={setSelectedCategory}
                    categories={categories}
                    getCategoryConfig={getCategoryConfigForId}
                />
                {/* Indicadores de búsqueda */}
                {isSearching && (
                    <div className="flex items-center gap-2 mt-3 px-1 text-sm text-slate-400">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Buscando en la comunidad...</span>
                    </div>
                )}
                {!isSearching && searchResults !== null && (
                    <div className="flex items-center gap-2 mt-3 px-1">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                            🔍 Búsqueda híbrida
                        </span>
                        <span className="text-xs text-slate-400">
                            {filteredItems.length} resultado{filteredItems.length !== 1 ? 's' : ''} para &quot;{searchTerm}&quot;
                        </span>
                    </div>
                )}
            </div>

            {/* Servicios de Entrega */}
            <section className="px-1">
                <div className="flex items-center gap-3 mb-5">
                    <div className="h-8 w-8 rounded-xl bg-role-admin-bg flex items-center justify-center">
                        <Truck className="h-4 w-4 text-role-admin-fg" />
                    </div>
                    <h2 className="text-base font-black uppercase tracking-widest cc-text-secondary">Servicios de Entrega</h2>
                </div>
                <Link href="/resident/supermercado" className="group block">
                    <motion.div
                        whileHover={{ scale: 1.015, y: -2 }}
                        whileTap={{ scale: 0.98 }}
                        className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 p-6 md:p-8 shadow-2xl shadow-indigo-500/20 cursor-pointer"
                    >
                        {/* bg glows */}
                        <div className="absolute top-0 right-0 w-72 h-72 bg-white/5 blur-[80px] rounded-full translate-x-1/3 -translate-y-1/3" />
                        <div className="absolute bottom-0 left-1/2 w-48 h-48 bg-purple-400/10 blur-[60px] rounded-full" />

                        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                            <div className="flex items-center gap-5">
                                <div className="h-16 w-16 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center shrink-0 shadow-xl">
                                    <ShoppingCart className="h-8 w-8 text-white" />
                                </div>
                                <div className="space-y-1">
                                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-white/10 border border-white/20 rounded-full text-[10px] font-black uppercase tracking-widest text-indigo-200 mb-1">
                                        <Sparkles className="h-3 w-3" /> Smart Shopping con CoCo IA
                                    </div>
                                    <h3 className="text-2xl md:text-3xl font-black text-white leading-tight">Supermercado a Domicilio</h3>
                                    <p className="text-indigo-200/80 text-sm font-medium max-w-md">
                                        Crea tu lista con ayuda de IA y recíbela en casa. Integraciones con Jumbo Delivery y Líder App.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-4 shrink-0">
                                <div className="hidden md:flex flex-col items-center gap-2">
                                    <div className="flex gap-2">
                                        <div className="w-9 h-9 rounded-full bg-blue-100 border-2 border-white/20 flex items-center justify-center">
                                            <ShoppingCart className="h-4 w-4 text-blue-700" />
                                        </div>
                                        <div className="w-9 h-9 rounded-full bg-orange-100 border-2 border-white/20 flex items-center justify-center">
                                            <ChefHat className="h-4 w-4 text-orange-700" />
                                        </div>
                                    </div>
                                    <span className="text-[10px] text-white/40 font-bold uppercase tracking-wider">Jumbo · Líder</span>
                                </div>
                                <div className="flex items-center gap-2 px-5 py-3 bg-white text-brand-700 font-black rounded-2xl shadow-lg group-hover:shadow-xl group-hover:bg-brand-50 transition-all text-sm">
                                    Ir al Supermercado
                                    <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </Link>
            </section>

            {/* Items Grid */}
            <AnimatePresence mode="popLayout">
                <motion.div
                    layout
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 px-1"
                >
                    {filteredItems.map((item, idx) => (
                        <MarketplaceCard
                            key={item.id}
                            item={item}
                            idx={idx}
                            onClick={(item) => {
                                setSelectedItem(item);
                                setIsDetailOpen(true);
                            }}
                            categoryLabel={categories.find(c => c.id === item.category)?.label || item.category}
                            categoryConfig={getCategoryConfigForId(item.category)}
                        />
                    ))}
                </motion.div>
            </AnimatePresence>

            {/* Product Detail Modal */}
            <ProductDetailModal
                item={selectedItem}
                isOpen={isDetailOpen}
                onClose={() => setIsDetailOpen(false)}
                categoryLabel={categories.find(c => c.id === selectedItem?.category)?.label || ''}
                onChat={(item) => {
                    setSelectedItem(item);
                    setIsChatOpen(true);
                }}
                onBuy={(item) => {
                    setSelectedItem(item);
                    setIsPaymentOpen(true);
                }}
            />

            {/* Chat Modal */}
            <ChatModal
                item={selectedItem}
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                currentUser={user}
            />

            {/* Payment Modal */}
            <PaymentModal
                item={selectedItem}
                isOpen={isPaymentOpen}
                onClose={() => setIsPaymentOpen(false)}
                onSuccess={() => {
                    toast({
                        title: "¡Compra exitosa!",
                        description: "Te hemos enviado los detalles a tu correo.",
                    });
                    // Mark as reserved in local state
                    if (selectedItem) {
                        setItems(items.map(i => i.id === selectedItem.id ? { ...i, status: 'reserved' } : i));
                    }
                }}
            />

            {/* Empty State Premium */}
            {filteredItems.length === 0 && (
                <EmptyState
                    icon={<Search className="h-6 w-6" />}
                    title="No hay resultados"
                    description="No pudimos encontrar tesoros que coincidan con tu búsqueda. Intenta con otros términos o explora nuevas categorías."
                    action={
                        <Button
                            variant="primary"
                            onClick={() => { setSearchTerm(''); setSelectedCategory(null); }}
                            className="shadow-lg shadow-blue-500/20 px-8 py-3"
                        >
                            Ver todo el Catálogo
                        </Button>
                    }
                />
            )}

            {/* Rules Modal */}
            <Dialog open={isRulesOpen} onOpenChange={setIsRulesOpen}>
                <DialogContent className="sm:max-w-[600px] bg-surface rounded-3xl p-8">
                    <DialogHeader>
                        <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center mb-4">
                            <Info className="h-6 w-6 text-blue-600" />
                        </div>
                        <DialogTitle className="text-2xl font-black">Reglamento del Marketplace</DialogTitle>
                        <DialogDescription className="text-slate-500 font-medium">
                            Para mantener un ambiente seguro y confiable entre vecinos, sigue estas normas:
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-6 my-6 cc-text-secondary">
                        <div className="flex gap-4">
                            <div className="h-6 w-6 rounded-full bg-elevated flex items-center justify-center flex-shrink-0 font-bold text-xs">1</div>
                            <p><span className="font-bold">Solo Residentes:</span> Solo usuarios verificados de la comunidad pueden publicar.</p>
                        </div>
                        <div className="flex gap-4">
                            <div className="h-6 w-6 rounded-full bg-elevated flex items-center justify-center flex-shrink-0 font-bold text-xs">2</div>
                            <p><span className="font-bold">Fotos Reales:</span> Asegúrate de subir fotos propias del producto, no de internet.</p>
                        </div>
                        <div className="flex gap-4">
                            <div className="h-6 w-6 rounded-full bg-elevated flex items-center justify-center flex-shrink-0 font-bold text-xs">3</div>
                            <p><span className="font-bold">Sin Ilegalidades:</span> Prohibida la venta de alcohol, tabaco, armas o medicamentos.</p>
                        </div>
                        <div className="flex gap-4">
                            <div className="h-6 w-6 rounded-full bg-elevated flex items-center justify-center flex-shrink-0 font-bold text-xs">4</div>
                            <p><span className="font-bold">Respeto:</span> La administración se reserva el derecho de eliminar posts ofensivos o fraudulentos.</p>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button onClick={() => setIsRulesOpen(false)} className="w-full h-12 rounded-2xl bg-slate-900 dark:bg-white dark:text-slate-900">
                            Entendido
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
