"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { MarketplaceService } from "@/lib/api";
import {
    CheckCircle2, ExternalLink, Plus, Tag, ShoppingBag, Sparkles, Repeat, Image as ImageIcon, Loader2, Info, ShieldCheck
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
import { Eyebrow, DisplayHeading } from "@/components/cc/Eyebrow";
import { Button as CcButton } from "@/components/cc/Button";
import { Tag as CcTag } from "@/components/cc/Tag";
import { ModuleFlow } from "@/components/ui/ModuleFlow";
import {
    Grid3X3, Smartphone, Armchair, Shirt, Package, Search, ShoppingCart, Truck, ChefHat, ArrowRight, SlidersHorizontal
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

type PublicationSummary = {
    title: string;
    modes: string[];
    imageCount: number;
    createdAt: string;
};


export default function MarketplacePage() {
    const [searchTerm, setSearchTerm] = useState('');
    const [items, setItems] = useState<MarketplaceItem[]>([]);
    const [searchResults, setSearchResults] = useState<MarketplaceItem[] | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [modeFilter, setModeFilter] = useState<'all' | 'sale' | 'swap' | 'barter'>('all');
    const [sortMode, setSortMode] = useState<'recent' | 'price_asc' | 'price_desc'>('recent');
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [selectedItem, setSelectedItem] = useState<MarketplaceItem | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [isPaymentOpen, setIsPaymentOpen] = useState(false);
    const [publicationSummary, setPublicationSummary] = useState<PublicationSummary | null>(null);
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
    const publicationSummaryRef = useRef<HTMLDivElement | null>(null);
    const { toast } = useToast();
    const { user } = useAuth();
    const searchParams = useSearchParams();

    const loadItems = useCallback(async () => {
        setLoading(true);
        try {
            const realItems = await MarketplaceService.getItemsV2();
            setItems(realItems || []);
        } catch (error: unknown) {
            console.error("Error loading items:", error);
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (searchParams.get('status') === 'success') {
            toast({
                title: "¡Compra exitosa!",
                description: "Tu pago se ha procesado. El vendedor será notificado.",
                variant: "success",
            });
        }
        loadItems();
    }, [loadItems, searchParams, toast]);

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
                    images: Array.isArray(r.images) ? r.images as string[] : r.image_url ? [r.image_url as string] : [],
                    sellerId: r.seller_id as string,
                    status: r.status as 'available' | 'reserved' | 'sold' | 'hidden',
                    allowSale: r.allow_sale as boolean | undefined,
                    allowSwap: r.allow_swap as boolean | undefined,
                    swapDetails: r.swap_details as string | undefined,
                    allowBarter: r.allow_barter as boolean | undefined,
                    barterDetails: r.barter_details as string | undefined,
                    paymentStatus: r.payment_status as 'none' | 'pending' | 'completed' | undefined,
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
            const remainingSlots = Math.max(0, 4 - imageFiles.length);
            const files = Array.from(e.target.files).slice(0, remainingSlots);

            if (files.length === 0) {
                toast({
                    title: "Límite de fotos",
                    description: "Puedes subir hasta 4 fotos por publicación.",
                    variant: "default",
                });
                return;
            }

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
    const baseItems = (searchResults !== null ? searchResults : items).filter(item => item.status !== "hidden");
    const filteredItems = baseItems.filter(item => {
        const matchesCategory = !selectedCategory || selectedCategory === 'all' || item.category === selectedCategory;
        const matchesMode =
            modeFilter === 'all'
            || (modeFilter === 'sale' && item.allowSale !== false)
            || (modeFilter === 'swap' && item.allowSwap)
            || (modeFilter === 'barter' && item.allowBarter);
        return matchesCategory && matchesMode;
    }).sort((a, b) => {
        if (sortMode === 'price_asc') return (a.price || 0) - (b.price || 0);
        if (sortMode === 'price_desc') return (b.price || 0) - (a.price || 0);
        return new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime();
    });

    const activeFiltersCount = [
        searchTerm.trim(),
        selectedCategory && selectedCategory !== 'all' ? selectedCategory : '',
        modeFilter !== 'all' ? modeFilter : '',
    ].filter(Boolean).length;

    const marketplaceStats = {
        available: items.filter(item => item.status === 'available').length,
        reserved: items.filter(item => item.status === 'reserved').length,
        exchange: items.filter(item => item.allowSwap || item.allowBarter).length,
        avgPrice: items.length ? Math.round(items.reduce((sum, item) => sum + (Number(item.price) || 0), 0) / items.length) : 0,
    };

    const clearDiscoveryFilters = () => {
        setSearchTerm('');
        setSearchResults(null);
        setSelectedCategory(null);
        setModeFilter('all');
        setSortMode('recent');
    };

    const showPublicationSummary = (summary: PublicationSummary) => {
        setPublicationSummary(summary);
        window.setTimeout(() => {
            publicationSummaryRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 80);
    };

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

            if (newItem.allowSale && Number(newItem.price) <= 0) {
                toast({
                    title: "Precio requerido",
                    description: "Ingresa un precio mayor a cero para publicar con modalidad de venta.",
                    variant: "destructive",
                });
                return;
            }

                await MarketplaceService.createItem({
                    ...newItem,
                    price: Number(newItem.price)
                } as Partial<MarketplaceItem>, imageFiles);
                showPublicationSummary({
                    title: newItem.title.trim(),
                    modes: [
                        newItem.allowSale ? "Venta" : "",
                        newItem.allowSwap ? "Permuta" : "",
                        newItem.allowBarter ? "Trueque" : "",
                    ].filter(Boolean),
                    imageCount: imageFiles.length,
                    createdAt: new Date().toISOString(),
                });

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

    const featuredItem = filteredItems.find(item => item.status === 'available');
    const remainingItems = featuredItem ? filteredItems.filter(item => item.id !== featuredItem.id) : filteredItems;

    return (
        <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
             {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-[var(--cc-line)]">
                <div>
                    <Eyebrow className="mb-2">Vecinos</Eyebrow>
                    <DisplayHeading size={40}>
                        Mercado <em className="text-[var(--cc-copper)] font-serif italic font-normal">vecinal</em>
                    </DisplayHeading>
                </div>
                
                <div className="flex flex-wrap gap-3 items-center">
                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogTrigger asChild>
                            <CcButton variant="copper" size="md">
                                <Plus className="h-4.5 w-4.5" />
                                Publicar artículo
                            </CcButton>
                        </DialogTrigger>
                        <DialogContent className="overflow-hidden rounded-lg border-subtle bg-surface p-0 shadow-sm sm:max-w-[550px]">
                            <div className="max-h-[85vh] space-y-7 overflow-y-auto p-6 md:p-8">
                                <DialogHeader className="space-y-3">
                                    <DialogTitle className="text-2xl font-semibold cc-text-primary">Publicar producto</DialogTitle>
                                    <DialogDescription className="text-sm font-medium leading-6 text-slate-500">
                                        Conecta con tus vecinos y dale una nueva vida a tus artículos.
                                    </DialogDescription>
                                </DialogHeader>

                                <form onSubmit={handleAddItem} className="space-y-7">
                                    {/* Fotos */}
                                    <div className="space-y-4">
                                        <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.2em] ml-1">Fotos del Producto</label>
                                        <div className="grid grid-cols-4 gap-4">
                                            {previewUrls.map((url, i) => (
                                                <div key={i} className="group relative aspect-square overflow-hidden rounded-lg border border-subtle bg-elevated">
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
                                                <label className="group flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-subtle transition-colors hover:border-brand-500 hover:bg-brand-50/50 dark:hover:bg-brand-500/10">
                                                    <Plus className="h-6 w-6 text-slate-400 group-hover:text-copper mb-1" />
                                                    <span className="text-[10px] font-bold text-slate-400 group-hover:text-copper">Añadir</span>
                                                    <input type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} />
                                                </label>
                                            )}
                                        </div>
                                    </div>

                                    {/* Básicos */}
                                    <div className="space-y-6">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.2em] ml-1">Título del Anuncio</label>
                                            <Input
                                                placeholder="Ej: Bicicleta de Montaña Trek"
                                                className="h-12 rounded-lg border-subtle bg-surface text-sm font-semibold focus:ring-brand-500/20"
                                                required
                                                value={newItem.title}
                                                onChange={(e) => setNewItem({ ...newItem, title: e.target.value })}
                                            />
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.2em] ml-1">Categoría</label>
                                                <select
                                                    className="h-12 w-full cursor-pointer appearance-none rounded-lg border border-subtle bg-surface px-4 text-sm font-semibold cc-text-primary focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
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
                                                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.2em] ml-1">Estado General</label>
                                                <select className="h-12 w-full cursor-pointer appearance-none rounded-lg border border-subtle bg-surface px-4 text-sm font-semibold cc-text-primary focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20">
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
                                        <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.2em] ml-1">Opciones Comerciales</h4>

                                        <div className="space-y-4">
                                            {/* Opción Venta */}
                                            <div className={`cursor-pointer rounded-lg border p-4 transition-colors ${newItem.allowSale ? 'border-brand-500 bg-brand-50/40' : 'border-subtle'}`}
                                                onClick={() => setNewItem({ ...newItem, allowSale: !newItem.allowSale })}>
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center gap-4">
                                                        <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${newItem.allowSale ? 'bg-copper text-white' : 'bg-elevated text-slate-400'}`}>
                                                            <Tag className="h-5 w-5" />
                                                        </div>
                                                        <span className="font-semibold cc-text-primary">Venta Directa</span>
                                                    </div>
                                                    <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center ${newItem.allowSale ? 'bg-copper border-copper' : 'border-subtle'}`}>
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
                                            <div className={`cursor-pointer rounded-lg border p-4 transition-colors ${newItem.allowSwap ? 'border-brand-500 bg-brand-50/40' : 'border-subtle'}`}
                                                onClick={() => setNewItem({ ...newItem, allowSwap: !newItem.allowSwap })}>
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center gap-4">
                                                        <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${newItem.allowSwap ? 'bg-brand-600 text-white' : 'bg-elevated text-slate-400'}`}>
                                                            <Repeat className="h-5 w-5" />
                                                        </div>
                                                        <span className="font-semibold cc-text-primary">Permuta</span>
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
                                            <div className={`cursor-pointer rounded-lg border p-4 transition-colors ${newItem.allowBarter ? 'border-emerald-600 bg-emerald-50/30' : 'border-subtle'}`}
                                                onClick={() => setNewItem({ ...newItem, allowBarter: !newItem.allowBarter })}>
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center gap-4">
                                                        <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${newItem.allowBarter ? 'bg-emerald-600 text-white' : 'bg-elevated text-slate-400'}`}>
                                                            <Sparkles className="h-5 w-5" />
                                                        </div>
                                                        <span className="font-semibold cc-text-primary">Trueque Abierto</span>
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
                                        <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.2em] ml-1">Descripción del Artículo</label>
                                        <textarea
                                            className="min-h-[120px] w-full rounded-lg border border-subtle bg-surface px-4 py-4 text-sm font-medium cc-text-primary transition-all focus:outline-none focus:ring-2 focus:ring-brand-500/20"
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
                                            className="h-12 w-full rounded-lg bg-brand-600 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
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

                    <Link href="/marketplace/my-listings">
                        <CcButton variant="ghost" size="md">
                            <ShoppingBag className="h-4.5 w-4.5" />
                            Mis publicaciones
                        </CcButton>
                    </Link>

                    <CcButton variant="ghost" size="md" onClick={() => setIsRulesOpen(true)}>
                        <Info className="h-4.5 w-4.5" />
                        Reglamento
                    </CcButton>

                    {user?.role === 'admin' && (
                        <Link href="/admin/marketplace">
                            <CcButton variant="ghost" size="md" style={{ borderColor: "rgba(16,185,129,0.30)", color: "var(--cc-sage)" }}>
                                <ShieldCheck className="h-4.5 w-4.5" />
                                Moderación
                            </CcButton>
                        </Link>
                    )}
                </div>
            </div>

            {/* Featured Item Section */}
            {featuredItem && (
                <div className="relative overflow-hidden rounded-xl border border-[var(--cc-line)] bg-[var(--cc-paper)] shadow-sm p-6 md:p-8 flex flex-col md:flex-row gap-8 items-stretch">
                    {/* Dark striped media placeholder */}
                    <div className="relative w-full md:w-1/2 min-h-[220px] overflow-hidden rounded-lg bg-[var(--cc-ink)] flex items-center justify-center">
                        <div className="absolute inset-0 opacity-15" style={{ backgroundImage: "repeating-linear-gradient(45deg, var(--cc-copper) 0px, var(--cc-copper) 2px, transparent 2px, transparent 10px)" }} />
                        {featuredItem.imageUrl || (featuredItem.images && featuredItem.images.length > 0) ? (
                            <Image
                                src={featuredItem.imageUrl || (featuredItem.images?.[0] ?? '')}
                                alt={featuredItem.title}
                                fill
                                className="object-cover opacity-80"
                                unoptimized
                            />
                        ) : (
                            <div className="flex flex-col items-center gap-2">
                                <Search className="h-10 w-10 text-[var(--cc-copper)] opacity-70" />
                                <span className="text-[10px] uppercase tracking-wider text-[var(--cc-copper)] opacity-60">Sin imagen</span>
                            </div>
                        )}
                        <div className="absolute top-4 left-4 z-10">
                            <CcTag tone="copper" solid>VERIFICADO</CcTag>
                        </div>
                    </div>
                    
                    <div className="w-full md:w-1/2 flex flex-col justify-between space-y-6">
                        <div className="space-y-3">
                            <div className="flex flex-wrap gap-2">
                                <CcTag tone="neutral" solid>{categories.find(c => c.id === featuredItem.category)?.label || featuredItem.category}</CcTag>
                                <CcTag tone="copper">Destacado del edificio</CcTag>
                            </div>
                            <h2 className="text-2xl font-medium text-[var(--cc-ink)]" style={{ fontFamily: "var(--cc-font-display)" }}>
                                {featuredItem.title}
                            </h2>
                            <p className="text-xs text-[var(--cc-ink-secondary)] leading-relaxed line-clamp-3">
                                {featuredItem.description}
                            </p>
                        </div>
                        
                        <div className="flex items-center justify-between pt-4 border-t border-[var(--cc-line)]">
                            <div>
                                <span className="text-[9px] font-medium text-[var(--cc-ink-tertiary)] uppercase tracking-wider block mb-1">
                                    {featuredItem.allowSale !== false ? 'Precio sugerido' : 'Modalidad'}
                                </span>
                                <span className="text-xl font-semibold text-[var(--cc-copper)]">
                                    {featuredItem.allowSale !== false ? `$${featuredItem.price.toLocaleString('es-CL')}` : 'Intercambio / Trueque'}
                                </span>
                            </div>
                            <CcButton 
                                variant="primary" 
                                size="sm"
                                onClick={() => {
                                    setSelectedItem(featuredItem);
                                    setIsDetailOpen(true);
                                }}
                            >
                                Ver detalles
                            </CcButton>
                        </div>
                    </div>
                </div>
            )}


            <ModuleFlow
                title="Publicación segura entre vecinos"
                description="El flujo debe terminar con un artículo publicado, moderado y con conversación trazable antes de reservar o vender."
                statusLabel={`${marketplaceStats.available} disponibles`}
                completedSteps={items.length > 0 ? 2 : 0}
                currentStep={items.length > 0 ? 3 : 1}
                primaryActionLabel={items.length > 0 ? "Explorar artículos" : "Publicar artículo"}
                primaryActionHref={items.length > 0 ? "#vitrina-marketplace" : "#publicar-articulo"}
                secondaryActionLabel="Mis publicaciones"
                secondaryActionHref="/marketplace/my-listings"
                steps={[
                    "Publicar con fotos y modalidad",
                    "Moderación revisa visibilidad",
                    "Vecino contacta desde la ficha",
                    "Marcar reservado, vendido u oculto",
                ]}
                outcome="Cierre esperado: el artículo queda con estado claro en la vitrina y en Mis Publicaciones, evitando contactos perdidos o anuncios desactualizados."
            />

            {publicationSummary && (
                <section ref={publicationSummaryRef} className="rounded-lg border border-success-border bg-success-bg p-5 shadow-sm">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div className="flex gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
                                <CheckCircle2 className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="font-semibold text-success-fg">Publicación lista</p>
                                <h2 className="mt-1 text-lg font-semibold cc-text-primary">{publicationSummary.title}</h2>
                                <p className="mt-1 text-sm leading-6 text-emerald-900">
                                    Visible en la vitrina comunitaria con {publicationSummary.imageCount || "sin"} foto{publicationSummary.imageCount === 1 ? "" : "s"} y modalidad {publicationSummary.modes.join(", ") || "por definir"}.
                                </p>
                                <p className="mt-1 text-xs font-semibold text-emerald-900/70">
                                    Publicada {new Date(publicationSummary.createdAt).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })}
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <a
                                href="#vitrina-marketplace"
                                className="inline-flex items-center justify-center gap-2 rounded-md border border-emerald-300 bg-white/80 px-3 py-2 text-sm font-semibold text-emerald-900 transition-colors hover:bg-white"
                            >
                                Ver en vitrina
                                <ExternalLink className="h-4 w-4" />
                            </a>
                            <Link href="/marketplace/my-listings">
                                <Button variant="outline">Gestionar publicación</Button>
                            </Link>
                        </div>
                    </div>
                </section>
            )}

            {/* Filters & Search Section */}
            <div className="space-y-4">
                <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <div className="rounded-lg border border-subtle bg-surface p-4 shadow-sm">
                        <p className="text-2xl font-semibold cc-text-primary">{marketplaceStats.available}</p>
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] cc-text-secondary">Disponibles</p>
                    </div>
                    <div className="rounded-lg border border-subtle bg-surface p-4 shadow-sm">
                        <p className="text-2xl font-semibold cc-text-primary">{marketplaceStats.reserved}</p>
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] cc-text-secondary">Reservados</p>
                    </div>
                    <div className="rounded-lg border border-subtle bg-surface p-4 shadow-sm">
                        <p className="text-2xl font-semibold cc-text-primary">{marketplaceStats.exchange}</p>
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] cc-text-secondary">Aceptan trueque</p>
                    </div>
                    <div className="rounded-lg border border-subtle bg-surface p-4 shadow-sm">
                        <p className="text-2xl font-semibold cc-text-primary">${marketplaceStats.avgPrice.toLocaleString('es-CL')}</p>
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] cc-text-secondary">Precio promedio</p>
                    </div>
                </section>
                <div id="vitrina-marketplace" />
                <ProductFilters
                    searchTerm={searchTerm}
                    setSearchTerm={setSearchTerm}
                    selectedCategory={selectedCategory}
                    setSelectedCategory={setSelectedCategory}
                    categories={categories}
                    getCategoryConfig={getCategoryConfigForId}
                />
                <div className="mt-4 flex flex-col gap-3 rounded-lg border border-subtle bg-surface p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest cc-text-secondary">
                            <SlidersHorizontal className="h-4 w-4" />
                            Modalidad
                        </span>
                        {[
                            { key: 'all', label: 'Todas' },
                            { key: 'sale', label: 'Venta' },
                            { key: 'swap', label: 'Permuta' },
                            { key: 'barter', label: 'Trueque' },
                        ].map(option => (
                            <button
                                key={option.key}
                                type="button"
                                onClick={() => setModeFilter(option.key as typeof modeFilter)}
                                className={`rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
                                    modeFilter === option.key
                                        ? 'bg-ink text-paper shadow-sm'
                                        : 'bg-paper-warm cc-text-secondary hover:text-copper'
                                }`}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <select
                            value={sortMode}
                            onChange={event => setSortMode(event.target.value as typeof sortMode)}
                            className="h-10 rounded-xl border border-subtle bg-paper-warm px-3 text-xs font-semibold cc-text-secondary outline-none focus:border-copper focus:ring-2 focus:ring-[rgba(181,102,78,0.16)]"
                        >
                            <option value="recent">Más recientes</option>
                            <option value="price_asc">Menor precio</option>
                            <option value="price_desc">Mayor precio</option>
                        </select>
                        <span className="text-xs font-bold cc-text-secondary">
                            {filteredItems.length} de {baseItems.length} publicación{baseItems.length !== 1 ? 'es' : ''}
                        </span>
                        {activeFiltersCount > 0 && (
                            <button
                                type="button"
                                onClick={clearDiscoveryFilters}
                                className="rounded-xl bg-elevated px-3 py-2 text-xs font-semibold cc-text-secondary hover:bg-slate-200 dark:hover:bg-slate-800"
                            >
                                Limpiar filtros
                            </button>
                        )}
                    </div>
                </div>
                {/* Indicadores de búsqueda */}
                {isSearching && (
                    <div className="flex items-center gap-2 mt-3 px-1 text-sm text-slate-400">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Buscando en la comunidad...</span>
                    </div>
                )}
                {!isSearching && searchResults !== null && (
                    <div className="flex items-center gap-2 mt-3 px-1">
                        <span className="rounded-full px-2 py-0.5 text-xs font-bold text-copper" style={{ background: "var(--cc-copper-tint)" }}>
                            Búsqueda híbrida
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
                    <h2 className="text-base font-semibold uppercase tracking-widest cc-text-secondary">Servicios de Entrega</h2>
                </div>
                <Link href="/resident/supermercado" className="group block">
                    <motion.div
                        whileHover={{ scale: 1.015, y: -2 }}
                        whileTap={{ scale: 0.98 }}
                        className="relative cursor-pointer overflow-hidden rounded-lg border border-subtle bg-slate-950 p-6 shadow-sm md:p-8"
                    >
                        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                            <div className="flex items-center gap-5">
                                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-white/10">
                                    <ShoppingCart className="h-8 w-8 text-white" />
                                </div>
                                <div className="space-y-1">
                                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-white/10 border border-white/20 rounded-full text-[10px] font-semibold uppercase tracking-widest text-indigo-200 mb-1">
                                        <Sparkles className="h-3 w-3" /> Smart Shopping con CoCo IA
                                    </div>
                                    <h3 className="text-2xl md:text-3xl font-semibold text-white leading-tight">Supermercado a Domicilio</h3>
                                    <p className="text-indigo-200/80 text-sm font-medium max-w-md">
                                        Crea tu lista con ayuda de IA y recíbela en casa. Integraciones con Jumbo Delivery y Líder App.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-4 shrink-0">
                                <div className="hidden md:flex flex-col items-center gap-2">
                                    <div className="flex gap-2">
                                        <div className="w-9 h-9 rounded-full border-2 border-white/20 flex items-center justify-center" style={{ background: "var(--cc-copper-tint)" }}>
                                            <ShoppingCart className="h-4 w-4 text-copper" />
                                        </div>
                                        <div className="w-9 h-9 rounded-full bg-orange-100 border-2 border-white/20 flex items-center justify-center">
                                            <ChefHat className="h-4 w-4 text-orange-700" />
                                        </div>
                                    </div>
                                    <span className="text-[10px] text-white/40 font-bold uppercase tracking-wider">Jumbo · Líder</span>
                                </div>
                                <div className="flex items-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition-colors group-hover:bg-brand-50">
                                    Ir al Supermercado
                                    <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </Link>
            </section>

            {/* Items Grid */}
            {loading && (
                <div className="flex items-center justify-center gap-3 rounded-lg border border-subtle bg-surface p-10 text-sm font-bold cc-text-secondary">
                    <Loader2 className="h-5 w-5 animate-spin text-copper" />
                    Cargando publicaciones...
                </div>
            )}
            <AnimatePresence mode="popLayout">
                <motion.div
                    layout
                    className="grid grid-cols-1 md:grid-cols-2 gap-8 px-1"
                >
                    {remainingItems.map((item, idx) => (
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
                    if (selectedItem) {
                        setItems(items.map(i => i.id === selectedItem.id ? { ...i, status: 'reserved' } : i));
                    }
                }}
            />

            {/* Empty State Premium */}
            {!loading && filteredItems.length === 0 && (
                <EmptyState
                    icon={<Search className="h-6 w-6" />}
                    title="No hay resultados"
                    description="No encontramos publicaciones que coincidan con tu búsqueda. Ajusta los filtros o revisa las categorías disponibles."
                    action={
                        <Button
                            variant="primary"
                            onClick={() => { setSearchTerm(''); setSelectedCategory(null); }}
                            className="px-8 py-3 shadow-sm"
                        >
                            Ver todo el Catálogo
                        </Button>
                    }
                />
            )}

            {/* Rules Modal */}
            <Dialog open={isRulesOpen} onOpenChange={setIsRulesOpen}>
                <DialogContent className="rounded-lg bg-surface p-8 sm:max-w-[600px]">
                    <DialogHeader>
                        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg" style={{ background: "var(--cc-copper-tint)" }}>
                            <Info className="h-6 w-6 text-copper" />
                        </div>
                        <DialogTitle className="text-2xl font-semibold">Reglamento del Marketplace</DialogTitle>
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
                        <Button onClick={() => setIsRulesOpen(false)} className="h-12 w-full rounded-lg bg-slate-900 dark:bg-white dark:text-slate-900">
                            Entendido
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
