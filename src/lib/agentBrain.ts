import { MarketplaceService } from "./api";

export interface Product {
    id: string;
    name: string;
    brand: string;
    category: string;
    keywords: string[];
    prices: {
        store: 'Lider' | 'Jumbo' | 'Unimarc' | 'Santa Isabel';
        price: number;
        offerPrice?: number;
    }[];
}

export interface Recipe {
    id: string;
    name: string;
    prepTime: string;
    time?: string;
    description?: string;
    difficulty: 'Fácil' | 'Media' | 'Difícil';
    ingredients: { name: string; amount: string; category?: string }[];
    instructions: string[];
}

const SUPERMARKET_CATALOG: Product[] = [
    {
        id: "prod-001",
        name: "Harina de Trigo Selecta sin Polvos",
        brand: "Selecta",
        category: "Abarrotes",
        keywords: ["harina", "harina sin", "harina de trigo", "harina selecta", "harina blanca"],
        prices: [
            { store: 'Lider', price: 1200, offerPrice: 990 },
            { store: 'Jumbo', price: 1350 }
        ]
    },
    {
        id: "prod-002",
        name: "Huevos Blancos Bandeja 12 un",
        brand: "Champion",
        category: "Lácteos y Huevos",
        keywords: ["huevo", "huevos", "docena de huevos", "huevos blancos"],
        prices: [
            { store: 'Lider', price: 2800 },
            { store: 'Jumbo', price: 2990, offerPrice: 2490 }
        ]
    }
];

const RECIPE_CATALOG: Recipe[] = [
    {
        id: "rec-001",
        name: "Panqueques Caseros",
        prepTime: "15 min",
        difficulty: "Fácil",
        ingredients: [
            { name: "Harina", amount: "1 taza", category: "Abarrotes" },
            { name: "Leche", amount: "1.5 tazas", category: "Lácteos" },
            { name: "Huevos", amount: "2 unidades", category: "Lácteos" }
        ],
        instructions: [
            "Batir huevos con la leche.",
            "Incorporar harina poco a poco.",
            "Calentar sartén y formar los panqueques dorando por ambos lados."
        ]
    }
];

export interface CartItem {
    name: string;
    brand: string;
    quantity: number;
    price: number;
    store: 'Jumbo' | 'Lider' | 'Unimarc' | 'Santa Isabel';
    isOffer?: boolean;
    originalPrice?: number;
}

export interface MarketplaceOffer {
    itemTitle: string;
    sellerName: string;
    price: number;
    type: 'sale' | 'barter' | 'gift';
}

export interface RecipeSuggestion {
    recipe: Recipe;
    missingIngredients: {
        name: string;
        marketOffer?: MarketplaceOffer;
        supermarketProduct?: CartItem;
    }[];
}

export interface AgentResponse {
    message: string;
    cart?: {
        items: CartItem[];
        total: number;
        savings: number;
    };
    recipeSuggestion?: RecipeSuggestion;
}

export class SupermarketAgent {
    private context: CartItem[] = [];

    // Simple NLP Mock - Now Async for Supabase
    public async processMessage(text: string): Promise<AgentResponse> {
        const normalizedText = text.toLowerCase();

        // 0. Reset
        if (normalizedText.includes("borrar") || normalizedText.includes("nuevo")) {
            this.context = [];
            return { message: "He vaciado tu carrito. ¿Qué necesitas comprar o cocinar hoy?" };
        }

        // 1. INTENCIÓN: COCINAR / TENGO INGREDIENTES
        if (normalizedText.includes("tengo") || normalizedText.includes("cocinar") || normalizedText.includes("receta")) {
            return await this.processCookingIntent(normalizedText);
        }

        // 2. INTENCIÓN: COMPRA DIRECTA (Supermercado)
        return this.processShoppingIntent(normalizedText);
    }

    private async processCookingIntent(text: string): Promise<AgentResponse> {
        // Detectar ingredientes que el usuario dice tener
        const userIngredients = text.split(/,| y | con /).map(s => s.trim());

        // Buscar receta que coincida mejor (Mock simple: primera que encuentre coincidencia parcial)
        const matchedRecipe = RECIPE_CATALOG.find((recipe: Recipe) =>
            recipe.ingredients.some((ing: any) => userIngredients.some(ui => ui.includes(ing.name.toLowerCase()) || ing.name.toLowerCase().includes(ui)))
        );

        if (!matchedRecipe) {
            return { message: "No se me ocurre ninguna receta con esos ingredientes por ahora. 🧑‍🍳 ¿Quieres agregar algo más?" };
        }

        // Calcular faltantes
        const missingIngredients = matchedRecipe.ingredients.filter((ing: any) =>
            !userIngredients.some(ui => ui.includes(ing.name.toLowerCase()) || ing.name.toLowerCase().includes(ui))
        );

        // Fetch real marketplace items
        let marketItems: any[] = [];
        try {
            marketItems = await MarketplaceService.getItemsV2();
        } catch (e) {
            console.error("No se pudo cargar el marketplace", e);
        }

        // Buscar soluciones para los faltantes (Marketplace o Supermercado)
        const missingSolutions = missingIngredients.map((ing: any) => {
            // A. Buscar en Marketplace
            let marketOffer: MarketplaceOffer | undefined;

            // Mock inteligente: Si es "Huevos" o "Limon" o "Orégano", inventamos un vecino
            if (['huevos', 'orégano', 'limón', 'palta'].some(i => ing.name.toLowerCase().includes(i))) {
                marketOffer = {
                    itemTitle: ing.name + " de campo",
                    sellerName: "Sra. María (Depto 402)",
                    price: 2000,
                    type: 'sale'
                };
            } else {
                // Intentar buscar en Supabase Marketplace real
                const realMarketItem = marketItems?.find(m => m.title.toLowerCase().includes(ing.name.toLowerCase()));
                if (realMarketItem) {
                    marketOffer = {
                        itemTitle: realMarketItem.title,
                        sellerName: "Vecino (Ver Marketplace)",
                        price: realMarketItem.price,
                        type: realMarketItem.allow_barter ? 'barter' : 'sale'
                    };
                }
            }

            // B. Buscar en Supermercado (Fallback)
            // Mapear ingrediente de receta a producto de super
            const superProduct = SUPERMARKET_CATALOG.find((p: Product) => p.keywords.some((k: string) => ing.name.toLowerCase().includes(k)));
            let supermarketProduct: CartItem | undefined;
            if (superProduct) {
                supermarketProduct = this.findBestDeal(superProduct);
            }

            return {
                name: ing.name,
                marketOffer,
                supermarketProduct
            };
        });

        return {
            message: `¡Qué rico! Con eso puedes preparar **${matchedRecipe.name}**. 🍲\nTe faltan algunos ingredientes:`,
            recipeSuggestion: {
                recipe: matchedRecipe,
                missingIngredients: missingSolutions
            }
        };
    }

    private processShoppingIntent(normalizedText: string): AgentResponse {
        const detectedProducts: CartItem[] = [];

        SUPERMARKET_CATALOG.forEach((product: Product) => {
            const match = product.keywords.some((keyword: string) => {
                const regex = new RegExp(`\\b${keyword}\\b`, 'i');
                return regex.test(normalizedText);
            });

            if (match) {
                const bestDeal = this.findBestDeal(product);
                detectedProducts.push(bestDeal);
            }
        });

        if (detectedProducts.length > 0) {
            this.context = [...this.context, ...detectedProducts];
            const productNames = detectedProducts.map(p => p.name).join(", ");
            const totalSavings = this.context.reduce((acc, item) => acc + (item.isOffer ? (item.originalPrice! - item.price) : 0), 0);
            const total = this.context.reduce((acc, item) => acc + item.price, 0);

            return {
                message: `Entendido. He agregado: ${productNames}. Busqué los precios más bajos en Lider y Jumbo. 🛒`,
                cart: {
                    items: this.context,
                    total: total,
                    savings: totalSavings
                }
            };
        }

        return {
            message: "No logré identificar productos ni ingredientes. Intenta decir: 'Tengo harina y tomate' o 'Necesito comprar leche'. 🤔"
        };
    }

    private findBestDeal(product: Product): CartItem {
        const sortedPrices = [...product.prices].sort((a, b) => {
            const priceA = a.offerPrice || a.price;
            const priceB = b.offerPrice || b.price;
            return priceA - priceB;
        });

        const bestOption = sortedPrices[0];
        const hasOffer = !!bestOption.offerPrice;

        return {
            name: product.name,
            brand: product.brand,
            quantity: 1,
            price: hasOffer ? bestOption.offerPrice! : bestOption.price,
            store: bestOption.store,
            isOffer: hasOffer,
            originalPrice: hasOffer ? bestOption.price : undefined
        };
    }
}

export const agent = new SupermarketAgent();
