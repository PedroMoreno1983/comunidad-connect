"use client";

import { ChefHat, ShoppingCart, Users, ArrowRight, ExternalLink } from "lucide-react";
import { RecipeSuggestion } from "@/lib/agentBrain";

interface RecipeBubbleProps {
    suggestion: RecipeSuggestion;
    onAddMissingToCart: (items: (import('@/lib/agentBrain').CartItem | undefined)[]) => void;
}

export function RecipeBubble({ suggestion, onAddMissingToCart }: RecipeBubbleProps) {
    const { recipe, missingIngredients } = suggestion;
    const supermarketMissing = missingIngredients.filter(i => i.supermarketProduct);
    const marketplaceMissing = missingIngredients.filter(i => i.marketOffer);

    const totalSupermarketCost = supermarketMissing.reduce((acc, item) => acc + (item.supermarketProduct?.price || 0), 0);

    return (
        <div className="w-full max-w-sm bg-surface rounded-lg overflow-hidden shadow-sm border border-subtle">
            {/* Header */}
            <div className="bg-orange-500 p-4 text-white flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-full">
                    <ChefHat className="h-5 w-5" />
                </div>
                <div>
                    <h3 className="font-bold text-sm">Sugerencia del Chef</h3>
                    <p className="text-[10px] opacity-90">{recipe.difficulty} • {recipe.prepTime}</p>
                </div>
            </div>

            {/* Recipe Info */}
            <div className="p-4 border-b border-subtle space-y-2">
                <h4 className="font-black cc-text-primary text-lg">{recipe.name}</h4>
                <p className="text-xs cc-text-secondary">{recipe.description}</p>
            </div>

            {/* Missing Ingredients */}
            <div className="p-4 space-y-4">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Te falta para cocinar:</p>

                {missingIngredients.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm">
                        <span className="font-medium cc-text-secondary capitalize">• {item.name}</span>

                        {item.marketOffer ? (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-500/10 px-2 py-1 rounded-full">
                                <Users className="h-3 w-3" /> Vecino
                            </span>
                        ) : (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-success-bg px-2 py-1 rounded-full">
                                <ShoppingCart className="h-3 w-3" /> Súper
                            </span>
                        )}
                    </div>
                ))}
            </div>

            {/* Actions */}
            <div className="bg-canvas/50 p-4 space-y-3">
                {/* Supermarket Action */}
                {supermarketMissing.length > 0 && (
                    <button
                        onClick={() => onAddMissingToCart(supermarketMissing.map(i => i.supermarketProduct))}
                        className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 text-xs"
                    >
                        <ShoppingCart className="h-4 w-4" />
                        Comprar Faltantes (${totalSupermarketCost.toLocaleString('es-CL')})
                    </button>
                )}

                {/* Marketplace Action */}
                {marketplaceMissing.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-surface p-3 rounded-xl border border-blue-100 dark:border-blue-900">
                        <div className="text-xs">
                            <p className="font-bold cc-text-primary">{item.marketOffer?.itemTitle}</p>
                            <p className="text-slate-500">{item.marketOffer?.sellerName}</p>
                        </div>
                        <button className="text-blue-600 hover:text-blue-700 p-2 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors">
                            <ArrowRight className="h-4 w-4" />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
