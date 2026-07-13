"use client";

import { ShoppingCart, Share2, ExternalLink } from "lucide-react";

interface ProductItem {
    name: string;
    brand: string;
    quantity: number;
    price: number;
    store: 'Jumbo' | 'Lider' | 'Unimarc' | 'Santa Isabel';
    isOffer?: boolean;
    originalPrice?: number;
}

interface OrderPreviewBubbleProps {
    items: ProductItem[];
    total: number;
    savings: number;
}

const STORE_URLS: Record<ProductItem["store"], string> = {
    Lider: "https://www.lider.cl",
    Jumbo: "https://www.jumbo.cl",
    Unimarc: "https://www.unimarc.cl",
    "Santa Isabel": "https://www.santaisabel.cl",
};

function buildShareText(items: ProductItem[], total: number) {
    const lines = items.map(item => `• ${item.quantity}x ${item.name} (${item.store}) — $${item.price.toLocaleString("es-CL")}`);
    return [`Mi lista de compras CoCo 🛒`, ...lines, `Total estimado: $${total.toLocaleString("es-CL")}`].join("\n");
}

export function OrderPreviewBubble({ items, total, savings }: OrderPreviewBubbleProps) {
    const stores = Array.from(new Set(items.map(item => item.store)));

    const handleShare = async () => {
        const text = buildShareText(items, total);
        if (typeof navigator !== "undefined" && navigator.share) {
            try {
                await navigator.share({ text });
                return;
            } catch {
                // user cancelled or share failed, fall back to WhatsApp link below
            }
        }
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    };

    return (
        <div className="w-full max-w-sm bg-surface rounded-lg overflow-hidden shadow-sm border border-subtle">
            {/* Header */}
            <div className="bg-emerald-500 p-4 text-white flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-full">
                    <ShoppingCart className="h-5 w-5" />
                </div>
                <div>
                    <h3 className="font-bold text-sm">Carrito Inteligente</h3>
                    <p className="text-[10px] opacity-90">Mejor precio detectado</p>
                </div>
            </div>

            {/* List */}
            <div className="p-4 space-y-3">
                {items.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-start text-sm border-b border-slate-50 dark:border-slate-700 last:border-0 pb-2 last:pb-0">
                        <div className="flex gap-2">
                            <div className={`mt-0.5 h-3 w-3 rounded-full ${item.store === 'Jumbo' ? 'bg-green-600' : 'bg-blue-600'}`} title={item.store} />
                            <div>
                                <p className="font-semibold cc-text-secondary">{item.quantity}x {item.name}</p>
                                <p className="text-xs text-slate-400">{item.brand}</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="font-bold cc-text-secondary">${item.price.toLocaleString('es-CL')}</p>
                            {item.isOffer && (
                                <p className="text-[10px] text-emerald-500 font-bold line-through decoration-slate-300">
                                    ${item.originalPrice?.toLocaleString('es-CL')}
                                </p>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Footer / Total */}
            <div className="bg-canvas/50 p-4 space-y-3">
                <div className="flex justify-between items-end">
                    <div>
                        <p className="text-xs text-slate-500">Total a Pagar</p>
                        {savings > 0 && (
                            <p className="text-[10px] font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-500/10 px-1.5 py-0.5 rounded inline-block mt-1">
                                Ahorras ${savings.toLocaleString('es-CL')}
                            </p>
                        )}
                    </div>
                    <p className="text-2xl font-semibold cc-text-primary">
                        ${total.toLocaleString('es-CL')}
                    </p>
                </div>

                <button
                    onClick={handleShare}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-sm shadow-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                    Compartir lista <Share2 className="h-4 w-4" />
                </button>

                <div className="flex flex-wrap gap-2">
                    {stores.map(store => (
                        <a
                            key={store}
                            href={STORE_URLS[store]}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 min-w-[45%] py-2 px-3 text-center text-xs font-semibold rounded-lg border border-subtle cc-text-secondary hover:bg-canvas transition-all flex items-center justify-center gap-1.5"
                        >
                            Ir a {store} <ExternalLink className="h-3 w-3" />
                        </a>
                    ))}
                </div>

                <p className="text-[10px] text-slate-400 text-center">
                    CoCo compara precios, pero la compra y el pago se hacen directo en la app o sitio del supermercado.
                </p>
            </div>
        </div>
    );
}
