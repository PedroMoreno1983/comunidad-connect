"use client";

import { useState, useEffect } from 'react';
import { MarketplaceService } from "@/lib/api";
import {
    Plus, Tag, ShoppingBag, Sparkles, Repeat, Image as ImageIcon, Loader2
} from "lucide-react";
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
    Grid3X3, Smartphone, Armchair, Shirt, Package, Search
} from "lucide-react";

// Category config repeated here for components or exported from types
const categoryConfig: Record<string, {
    icon: React.ComponentType<{ className?: string }>;
    gradient: string;
    bg: string;
}> = {
    all: { icon: Grid3X3, gradient: 'from-slate-500 to-slate-700', bg: 'bg-slate-100 dark:bg-slate-700' },
    electronics: { icon: Smartphone, gradient: 'from-blue-500 to-indigo-600', bg: 'bg-blue-100 dark:bg-blue-500/20' },
    furniture: { icon: Armchair, gradient: 'from-amber-500 to-orange-600', bg: 'bg-amber-100 dark:bg-amber-500/20' },
    clothing: { icon: Shirt, gradient: 'from-pink-500 to-rose-600', bg: 'bg-pink-100 dark:bg-pink-500/20' },
    other: { icon: Package, gradient: 'from-emerald-500 to-teal-600', bg: 'bg-emerald-100 dark:bg-emerald-500/20' },
};

export default function MarketplacePage() {
    const [searchTerm, setSearchTerm] = useState('');
    const [items, setItems] = useState<any[]>([]);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [selectedItem, setSelectedItem] = useState<any | null>(null);
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
            console.log("MARKETPLACE_DEBUG: Cargando items desde el componente...");
            const realItems = await MarketplaceService.getItemsV2();
            setItems(realItems || []);
        } catch (error: any) {
            console.error("Error loading items:", error);
            toast({
                title: "Error al cargar productos",
                description: error.message || "No se pudieron obtener los anuncios reales.",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

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

    const filteredItems = items.filter(item => {
        const matchesSearch = item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.description.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory = !selectedCategory || selectedCategory === 'all' || item.category === selectedCategory;
        return matchesSearch && matchesCategory;
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

            await MarketplaceService.createItem(newItem, imageFiles);

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
        } catch (error: any) {
            console.error("Error al publicar item:", error);
            toast({
                title: "Error al publicar",
                description: error.message || "No se pudo subir tu artículo. Revisa tu conexión.",
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
                                    <button className="flex items-center gap-2 px-8 py-4 bg-white text-slate-950 font-black rounded-2xl hover:bg-blue-50 transition-all shadow-xl shadow-white/5 active:scale-95">
                                        <Plus className="h-5 w-5" />
                                        Publicar algo ahora
                                    </button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-[550px] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-white/20 dark:border-slate-800 rounded-[2.5rem] p-0 overflow-hidden shadow-2xl">
                                    <div className="max-h-[85vh] overflow-y-auto p-8 md:p-10 space-y-8">
                                        <DialogHeader className="space-y-3">
                                            <DialogTitle className="text-3xl font-black text-slate-900 dark:text-white">Publicar Producto</DialogTitle>
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
                                                        <div key={i} className="aspect-square rounded-2xl bg-slate-100 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 overflow-hidden relative group">
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
                                                        <label className="aspect-square rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-500/10 transition-all flex flex-col items-center justify-center cursor-pointer group">
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
                                                        className="h-14 rounded-2xl bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 focus:ring-blue-500/20 text-lg font-bold"
                                                        required
                                                        value={newItem.title}
                                                        onChange={(e) => setNewItem({ ...newItem, title: e.target.value })}
                                                    />
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Categoría</label>
                                                        <select
                                                            className="w-full h-14 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 text-slate-900 dark:text-white px-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 appearance-none cursor-pointer"
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
                                                        <select className="w-full h-14 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 text-slate-900 dark:text-white px-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 appearance-none cursor-pointer">
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
                                                    <div className={`p-5 rounded-3xl border-2 transition-all cursor-pointer ${newItem.allowSale ? 'border-blue-600 bg-blue-50/30' : 'border-slate-100 dark:border-slate-800'}`}
                                                        onClick={() => setNewItem({ ...newItem, allowSale: !newItem.allowSale })}>
                                                        <div className="flex items-center justify-between mb-2">
                                                            <div className="flex items-center gap-4">
                                                                <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${newItem.allowSale ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                                                                    <Tag className="h-5 w-5" />
                                                                </div>
                                                                <span className="font-black text-slate-900 dark:text-white">Venta Directa</span>
                                                            </div>
                                                            <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center ${newItem.allowSale ? 'bg-blue-600 border-blue-600' : 'border-slate-200 dark:border-slate-700'}`}>
                                                                {newItem.allowSale && <div className="h-2 w-2 rounded-full bg-white" />}
                                                            </div>
                                                        </div>
                                                        {newItem.allowSale && (
                                                            <div className="pt-4 animate-in fade-in slide-in-from-top-2 duration-300" onClick={(e) => e.stopPropagation()}>
                                                                <Input
                                                                    type="number"
                                                                    placeholder="Precio sugerido (Ej: 150000)"
                                                                    className="h-12 rounded-xl bg-white dark:bg-slate-900/50"
                                                                    required={newItem.allowSale}
                                                                    value={newItem.price}
                                                                    onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
                                                                />
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Opción Permuta */}
                                                    <div className={`p-5 rounded-3xl border-2 transition-all cursor-pointer ${newItem.allowSwap ? 'border-purple-600 bg-purple-50/30' : 'border-slate-100 dark:border-slate-800'}`}
                                                        onClick={() => setNewItem({ ...newItem, allowSwap: !newItem.allowSwap })}>
                                                        <div className="flex items-center justify-between mb-2">
                                                            <div className="flex items-center gap-4">
                                                                <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${newItem.allowSwap ? 'bg-purple-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                                                                    <Repeat className="h-5 w-5" />
                                                                </div>
                                                                <span className="font-black text-slate-900 dark:text-white">Permuta</span>
                                                            </div>
                                                            <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center ${newItem.allowSwap ? 'bg-purple-600 border-purple-600' : 'border-slate-200 dark:border-slate-700'}`}>
                                                                {newItem.allowSwap && <div className="h-2 w-2 rounded-full bg-white" />}
                                                            </div>
                                                        </div>
                                                        {newItem.allowSwap && (
                                                            <div className="pt-4 animate-in fade-in slide-in-from-top-2 duration-300" onClick={(e) => e.stopPropagation()}>
                                                                <textarea
                                                                    className="w-full min-h-[80px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 text-slate-900 dark:text-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                                                                    placeholder="¿Qué buscas a cambio? (Ej: Una tablet o una TV más pequeña)"
                                                                    required={newItem.allowSwap}
                                                                    value={newItem.swapDetails}
                                                                    onChange={(e) => setNewItem({ ...newItem, swapDetails: e.target.value })}
                                                                />
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Opción Trueque */}
                                                    <div className={`p-5 rounded-3xl border-2 transition-all cursor-pointer ${newItem.allowBarter ? 'border-emerald-600 bg-emerald-50/30' : 'border-slate-100 dark:border-slate-800'}`}
                                                        onClick={() => setNewItem({ ...newItem, allowBarter: !newItem.allowBarter })}>
                                                        <div className="flex items-center justify-between mb-2">
                                                            <div className="flex items-center gap-4">
                                                                <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${newItem.allowBarter ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                                                                    <Sparkles className="h-5 w-5" />
                                                                </div>
                                                                <span className="font-black text-slate-900 dark:text-white">Trueque Abierto</span>
                                                            </div>
                                                            <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center ${newItem.allowBarter ? 'bg-emerald-600 border-emerald-600' : 'border-slate-200 dark:border-slate-700'}`}>
                                                                {newItem.allowBarter && <div className="h-2 w-2 rounded-full bg-white" />}
                                                            </div>
                                                        </div>
                                                        {newItem.allowBarter && (
                                                            <div className="pt-4 animate-in fade-in slide-in-from-top-2 duration-300" onClick={(e) => e.stopPropagation()}>
                                                                <textarea
                                                                    className="w-full min-h-[80px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 text-slate-900 dark:text-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
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
                                                    className="w-full min-h-[120px] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 text-slate-900 dark:text-white px-4 py-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
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
                            <button className="flex items-center gap-2 px-8 py-4 bg-slate-800 text-white font-bold rounded-2xl hover:bg-slate-700 transition-all active:scale-95">
                                <ShoppingBag className="h-5 w-5" />
                                Mis compras
                            </button>
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
            </div>

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
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center py-24 bg-white/50 dark:bg-slate-800/50 backdrop-blur-md rounded-[3rem] border border-dashed border-slate-200 dark:border-slate-700"
                >
                    <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-800 rounded-3xl flex items-center justify-center shadow-inner">
                        <Search className="h-10 w-10 text-slate-400" />
                    </div>
                    <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2 underline decoration-blue-500 decoration-4">No hay resultados</h3>
                    <p className="text-slate-500 dark:text-slate-400 mb-8 max-w-sm mx-auto font-medium">
                        No pudimos encontrar tesoros que coincidan con tu búsqueda. Intenta con otros términos o explora nuevas categorías.
                    </p>
                    <button
                        onClick={() => { setSearchTerm(''); setSelectedCategory(null); }}
                        className="px-8 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-500/20 hover:shadow-xl hover:-translate-y-0.5 transition-all"
                    >
                        Ver todo el Catálogo
                    </button>
                </motion.div>
            )}
        </div>
    );
}
