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
    description: string;
    difficulty: 'Fácil' | 'Media' | 'Difícil';
    ingredients: { name: string; amount: string; category?: string }[];
    instructions: string[];
}

interface MarketplaceItem {
    title: string;
    price: number;
    allow_barter?: boolean;
}

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

// ─── Catálogo ampliado ────────────────────────────────────────────────────────

const SUPERMARKET_CATALOG: Product[] = [
    // ABARROTES
    { id: "prod-001", name: "Harina de Trigo Selecta sin Polvos 1kg", brand: "Selecta", category: "Abarrotes",
      keywords: ["harina", "harina sin", "harina de trigo", "harina selecta", "harina blanca"],
      prices: [{ store: 'Lider', price: 1200, offerPrice: 990 }, { store: 'Jumbo', price: 1350 }, { store: 'Unimarc', price: 1180 }] },
    { id: "prod-003", name: "Arroz Grado 1 Tucapel 1kg", brand: "Tucapel", category: "Abarrotes",
      keywords: ["arroz", "arroz tucapel", "arroz blanco", "arroz grado"],
      prices: [{ store: 'Lider', price: 1490 }, { store: 'Jumbo', price: 1590, offerPrice: 1390 }, { store: 'Santa Isabel', price: 1450 }] },
    { id: "prod-004", name: "Fideos Spaghetti Carozzi 500g", brand: "Carozzi", category: "Abarrotes",
      keywords: ["fideos", "spaghetti", "pasta", "tallarines", "carozzi"],
      prices: [{ store: 'Lider', price: 890 }, { store: 'Jumbo', price: 990 }, { store: 'Unimarc', price: 850, offerPrice: 750 }] },
    { id: "prod-005", name: "Aceite Maravilla Ideal 900ml", brand: "Ideal", category: "Abarrotes",
      keywords: ["aceite", "aceite maravilla", "aceite vegetal"],
      prices: [{ store: 'Lider', price: 1990 }, { store: 'Jumbo', price: 2190, offerPrice: 1890 }, { store: 'Santa Isabel', price: 1950 }] },
    { id: "prod-006", name: "Azúcar Blanca Iansa 1kg", brand: "Iansa", category: "Abarrotes",
      keywords: ["azúcar", "azucar", "azúcar blanca", "azúcar iansa"],
      prices: [{ store: 'Lider', price: 1190 }, { store: 'Jumbo', price: 1290 }, { store: 'Unimarc', price: 1150 }] },
    { id: "prod-007", name: "Sal Lobos 1kg", brand: "Lobos", category: "Abarrotes",
      keywords: ["sal", "sal de cocina", "sal lobos"],
      prices: [{ store: 'Lider', price: 590 }, { store: 'Jumbo', price: 650 }, { store: 'Santa Isabel', price: 570 }] },
    { id: "prod-008", name: "Tomate Triturado Machefert 500g", brand: "Machefert", category: "Abarrotes",
      keywords: ["tomate triturado", "tomate lata", "salsa de tomate", "puré de tomate"],
      prices: [{ store: 'Lider', price: 990 }, { store: 'Jumbo', price: 1090, offerPrice: 890 }] },
    { id: "prod-009", name: "Lentejas Grano de Oro 1kg", brand: "Grano de Oro", category: "Abarrotes",
      keywords: ["lentejas", "lenteja", "grano de oro"],
      prices: [{ store: 'Lider', price: 1890 }, { store: 'Jumbo', price: 1990 }, { store: 'Unimarc', price: 1790 }] },
    // LÁCTEOS Y HUEVOS
    { id: "prod-002", name: "Huevos Blancos Bandeja 12 un", brand: "Champion", category: "Lácteos y Huevos",
      keywords: ["huevo", "huevos", "docena de huevos", "huevos blancos", "huevos champion"],
      prices: [{ store: 'Lider', price: 2800 }, { store: 'Jumbo', price: 2990, offerPrice: 2490 }, { store: 'Santa Isabel', price: 2750 }] },
    { id: "prod-010", name: "Leche Entera Soprole 1L", brand: "Soprole", category: "Lácteos y Huevos",
      keywords: ["leche", "leche entera", "leche soprole", "leche larga vida"],
      prices: [{ store: 'Lider', price: 990 }, { store: 'Jumbo', price: 1090, offerPrice: 950 }, { store: 'Unimarc', price: 980 }] },
    { id: "prod-011", name: "Mantequilla Colun 200g", brand: "Colun", category: "Lácteos y Huevos",
      keywords: ["mantequilla", "mantequilla colun", "mantequilla sin sal"],
      prices: [{ store: 'Lider', price: 2390 }, { store: 'Jumbo', price: 2590 }, { store: 'Santa Isabel', price: 2290 }] },
    { id: "prod-012", name: "Queso Gauda Colun 150g", brand: "Colun", category: "Lácteos y Huevos",
      keywords: ["queso", "queso gauda", "queso laminado", "queso en lonchas", "queso colun"],
      prices: [{ store: 'Lider', price: 2190 }, { store: 'Jumbo', price: 2390, offerPrice: 1990 }] },
    { id: "prod-013", name: "Yogurt Natural Soprole 1kg", brand: "Soprole", category: "Lácteos y Huevos",
      keywords: ["yogurt", "yogur", "yogurt natural", "yogurt batido"],
      prices: [{ store: 'Lider', price: 1990 }, { store: 'Jumbo', price: 2190 }, { store: 'Unimarc', price: 1890 }] },
    // CARNES
    { id: "prod-014", name: "Pechuga de Pollo kg", brand: "Super Pollo", category: "Carnes",
      keywords: ["pollo", "pechuga", "pechuga de pollo", "pollo entero"],
      prices: [{ store: 'Lider', price: 4990 }, { store: 'Jumbo', price: 5490, offerPrice: 4790 }, { store: 'Santa Isabel', price: 4890 }] },
    { id: "prod-015", name: "Carne Molida Vacuno kg", brand: "El Corral", category: "Carnes",
      keywords: ["carne molida", "carne picada", "vacuno", "carne de vacuno"],
      prices: [{ store: 'Lider', price: 6990 }, { store: 'Jumbo', price: 7490 }, { store: 'Unimarc', price: 6790 }] },
    { id: "prod-016", name: "Atún en Agua Calvo 170g", brand: "Calvo", category: "Carnes",
      keywords: ["atún", "atun", "atún en lata", "atún calvo"],
      prices: [{ store: 'Lider', price: 1490 }, { store: 'Jumbo', price: 1590 }, { store: 'Santa Isabel', price: 1390, offerPrice: 1190 }] },
    // VERDURAS Y FRUTAS
    { id: "prod-017", name: "Tomate Liso kg", brand: "Fresco", category: "Verduras",
      keywords: ["tomate fresco", "tomate kilo", "tomates", "tomate para ensalada"],
      prices: [{ store: 'Lider', price: 1290 }, { store: 'Jumbo', price: 1490 }, { store: 'Unimarc', price: 1190 }] },
    { id: "prod-018", name: "Cebolla Blanca kg", brand: "Fresco", category: "Verduras",
      keywords: ["cebolla", "cebolla blanca", "cebollas"],
      prices: [{ store: 'Lider', price: 890 }, { store: 'Jumbo', price: 990 }, { store: 'Santa Isabel', price: 850 }] },
    { id: "prod-019", name: "Papa Blanca kg", brand: "Fresco", category: "Verduras",
      keywords: ["papa", "papas", "papas blancas", "papa de guarda"],
      prices: [{ store: 'Lider', price: 1090 }, { store: 'Jumbo', price: 1190 }, { store: 'Unimarc', price: 990 }] },
    { id: "prod-020", name: "Limón kg", brand: "Fresco", category: "Frutas",
      keywords: ["limón", "limon", "limones"],
      prices: [{ store: 'Lider', price: 1490 }, { store: 'Jumbo', price: 1690 }, { store: 'Santa Isabel', price: 1390 }] },
    { id: "prod-021", name: "Palta Hass kg", brand: "Fresco", category: "Frutas",
      keywords: ["palta", "paltas", "aguacate", "palta hass"],
      prices: [{ store: 'Lider', price: 2990 }, { store: 'Jumbo', price: 3490, offerPrice: 2790 }, { store: 'Unimarc', price: 2890 }] },
    { id: "prod-022", name: "Manzana Royal Gala kg", brand: "Fresco", category: "Frutas",
      keywords: ["manzana", "manzanas", "manzana gala", "manzana roja"],
      prices: [{ store: 'Lider', price: 1290 }, { store: 'Jumbo', price: 1390 }, { store: 'Santa Isabel', price: 1190 }] },
    // PANADERÍA
    { id: "prod-023", name: "Pan Molde Ideal 550g", brand: "Ideal", category: "Panadería",
      keywords: ["pan de molde", "pan molde", "pan ideal"],
      prices: [{ store: 'Lider', price: 1590 }, { store: 'Jumbo', price: 1690 }, { store: 'Unimarc', price: 1490 }] },
    // BEBIDAS
    { id: "prod-024", name: "Agua Mineral Cachantun 1.5L", brand: "Cachantun", category: "Bebidas",
      keywords: ["agua mineral", "cachantun", "agua sin gas", "agua"],
      prices: [{ store: 'Lider', price: 890 }, { store: 'Jumbo', price: 990 }, { store: 'Santa Isabel', price: 850 }] },
    { id: "prod-025", name: "Jugo Watt's Naranja 1L", brand: "Watt's", category: "Bebidas",
      keywords: ["jugo", "jugo de naranja", "jugo watts", "bebida watts"],
      prices: [{ store: 'Lider', price: 1190 }, { store: 'Jumbo', price: 1290, offerPrice: 990 }] },
    // HIGIENE Y LIMPIEZA
    { id: "prod-026", name: "Papel Higiénico Elite 4 rollos", brand: "Elite", category: "Higiene",
      keywords: ["papel higiénico", "papel higienico", "papel confort", "rollos"],
      prices: [{ store: 'Lider', price: 1990 }, { store: 'Jumbo', price: 2190 }, { store: 'Unimarc', price: 1890 }] },
    { id: "prod-027", name: "Detergente Ariel 1kg", brand: "Ariel", category: "Limpieza",
      keywords: ["detergente", "detergente ariel", "ariel", "jabón ropa"],
      prices: [{ store: 'Lider', price: 3990 }, { store: 'Jumbo', price: 4490, offerPrice: 3690 }, { store: 'Santa Isabel', price: 3890 }] },
    { id: "prod-028", name: "Shampoo Head & Shoulders 375ml", brand: "Head & Shoulders", category: "Higiene",
      keywords: ["shampoo", "champú", "head and shoulders", "shampoo anticaspa"],
      prices: [{ store: 'Lider', price: 4990 }, { store: 'Jumbo', price: 5490, offerPrice: 4490 }] },
    { id: "prod-029", name: "Pasta Dental Colgate Triple Acción 90g", brand: "Colgate", category: "Higiene",
      keywords: ["pasta dental", "pasta de dientes", "colgate", "dentífrico"],
      prices: [{ store: 'Lider', price: 1490 }, { store: 'Jumbo', price: 1690 }, { store: 'Unimarc', price: 1390 }] },
    { id: "prod-030", name: "Lavandina Clorox 1L", brand: "Clorox", category: "Limpieza",
      keywords: ["lavandina", "cloro", "clorox", "blanqueador", "lejía"],
      prices: [{ store: 'Lider', price: 1290 }, { store: 'Jumbo', price: 1390 }, { store: 'Santa Isabel', price: 1190 }] },
];

const RECIPE_CATALOG: Recipe[] = [
    {
        id: "rec-001", name: "Panqueques Caseros", prepTime: "15 min", difficulty: "Fácil",
        description: "Clásicos panqueques suaves y esponjosos para rellenar con lo que quieras.",
        ingredients: [
            { name: "Harina", amount: "1 taza", category: "Abarrotes" },
            { name: "Leche", amount: "1.5 tazas", category: "Lácteos" },
            { name: "Huevos", amount: "2 unidades", category: "Lácteos" }
        ],
        instructions: ["Batir huevos con la leche.", "Incorporar harina poco a poco.", "Calentar sartén y dorar por ambos lados."]
    },
    {
        id: "rec-002", name: "Arroz con Leche", prepTime: "30 min", difficulty: "Fácil",
        description: "Postre tradicional cremoso e ideal para compartir en familia.",
        ingredients: [
            { name: "Arroz", amount: "1 taza", category: "Abarrotes" },
            { name: "Leche", amount: "4 tazas", category: "Lácteos" },
            { name: "Azúcar", amount: "4 cdas", category: "Abarrotes" }
        ],
        instructions: ["Cocinar el arroz a fuego lento en la leche.", "Agregar azúcar y revolver.", "Servir frío con canela."]
    },
    {
        id: "rec-003", name: "Spaghetti a la Bolognesa", prepTime: "35 min", difficulty: "Media",
        description: "Pasta deliciosa con salsa de carne casera.",
        ingredients: [
            { name: "Fideos", amount: "500g", category: "Abarrotes" },
            { name: "Carne molida", amount: "300g", category: "Carnes" },
            { name: "Tomate triturado", amount: "1 tarro", category: "Abarrotes" },
            { name: "Cebolla", amount: "1 unidad", category: "Verduras" }
        ],
        instructions: ["Sofreír cebolla.", "Agregar carne y dorar.", "Añadir tomate y cocinar 15 min.", "Servir sobre fideos."]
    },
    {
        id: "rec-004", name: "Guiso de Lentejas", prepTime: "40 min", difficulty: "Fácil",
        description: "Plato reconfortante y nutritivo para los días fríos.",
        ingredients: [
            { name: "Lentejas", amount: "2 tazas", category: "Abarrotes" },
            { name: "Papa", amount: "2 unidades", category: "Verduras" },
            { name: "Cebolla", amount: "1 unidad", category: "Verduras" },
            { name: "Tomate", amount: "2 unidades", category: "Verduras" }
        ],
        instructions: ["Sofreír cebolla y tomate.", "Agregar lentejas and papas en cubos.", "Cocinar 35 min a fuego medio."]
    },
    {
        id: "rec-005", name: "Pollo al Jugo con Arroz", prepTime: "45 min", difficulty: "Media",
        description: "Pollo tierno marinado con limón, acompañado de arroz graneado.",
        ingredients: [
            { name: "Pollo", amount: "4 presas", category: "Carnes" },
            { name: "Arroz", amount: "2 tazas", category: "Abarrotes" },
            { name: "Limón", amount: "1 unidad", category: "Frutas" },
            { name: "Cebolla", amount: "1 unidad", category: "Verduras" }
        ],
        instructions: ["Marinar el pollo con limón y especias.", "Dorar en sartén.", "Cocinar tapado 25 min.", "Servir con arroz."]
    },
    {
        id: "rec-006", name: "Ensalada Chilena", prepTime: "10 min", difficulty: "Fácil",
        description: "Ensalada fresca de tomate y cebolla, el acompañamiento perfecto.",
        ingredients: [
            { name: "Tomate", amount: "3 unidades", category: "Verduras" },
            { name: "Cebolla", amount: "1 unidad", category: "Verduras" },
            { name: "Limón", amount: "1 unidad", category: "Frutas" },
            { name: "Aceite", amount: "2 cdas", category: "Abarrotes" },
            { name: "Sal", amount: "al gusto", category: "Abarrotes" }
        ],
        instructions: ["Cortar tomates en gajos y cebolla en pluma.", "Mezclar con limón, aceite y sal.", "Reposar 10 min."]
    }
];

// ─── Agente ───────────────────────────────────────────────────────────────────

export class SupermarketAgent {
    private context: CartItem[] = [];

    public async processMessage(text: string): Promise<AgentResponse> {
        const normalizedText = text.toLowerCase();

        if (normalizedText.includes("borrar") || normalizedText.includes("nuevo")) {
            this.context = [];
            return { message: "He vaciado tu carrito. ¿Qué necesitas comprar o cocinar hoy?" };
        }

        if (normalizedText.includes("tengo") || normalizedText.includes("cocinar") || normalizedText.includes("receta")) {
            return await this.processCookingIntent(normalizedText);
        }

        return this.processShoppingIntent(normalizedText);
    }

    private async processCookingIntent(text: string): Promise<AgentResponse> {
        const userIngredients = text.split(/,| y | con /).map(s => s.trim());

        const matchedRecipe = RECIPE_CATALOG.find((recipe: Recipe) =>
            recipe.ingredients.some((ing: Recipe["ingredients"][number]) =>
                userIngredients.some(ui => ui.includes(ing.name.toLowerCase()) || ing.name.toLowerCase().includes(ui))
            )
        );

        if (!matchedRecipe) {
            return { message: "No se me ocurre ninguna receta con esos ingredientes por ahora. 🧑‍🍳 ¿Quieres agregar algo más?" };
        }

        const missingIngredients = matchedRecipe.ingredients.filter((ing: Recipe["ingredients"][number]) =>
            !userIngredients.some(ui => ui.includes(ing.name.toLowerCase()) || ing.name.toLowerCase().includes(ui))
        );

        let marketItems: MarketplaceItem[] = [];
        try {
            marketItems = (await MarketplaceService.getItemsV2()) as MarketplaceItem[];
        } catch (e) {
            console.error("No se pudo cargar el marketplace", e);
        }

        const missingSolutions = missingIngredients.map((ing: Recipe["ingredients"][number]) => {
            let marketOffer: MarketplaceOffer | undefined;

            if (['huevos', 'orégano', 'limón', 'palta'].some(i => ing.name.toLowerCase().includes(i))) {
                marketOffer = { itemTitle: ing.name + " de campo", sellerName: "Sra. María (Depto 402)", price: 2000, type: 'sale' };
            } else {
                const realMarketItem = marketItems?.find(m => m.title.toLowerCase().includes(ing.name.toLowerCase()));
                if (realMarketItem) {
                    marketOffer = { itemTitle: realMarketItem.title, sellerName: "Vecino (Ver Marketplace)", price: realMarketItem.price, type: realMarketItem.allow_barter ? 'barter' : 'sale' };
                }
            }

            const superProduct = SUPERMARKET_CATALOG.find((p: Product) => p.keywords.some((k: string) => ing.name.toLowerCase().includes(k)));
            let supermarketProduct: CartItem | undefined;
            if (superProduct) {
                supermarketProduct = this.findBestDeal(superProduct);
            }

            return { name: ing.name, marketOffer, supermarketProduct };
        });

        return {
            message: `¡Qué rico! Con eso puedes preparar **${matchedRecipe.name}**. 🍲\nTe faltan algunos ingredientes:`,
            recipeSuggestion: { recipe: matchedRecipe, missingIngredients: missingSolutions }
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
                detectedProducts.push(this.findBestDeal(product));
            }
        });

        if (detectedProducts.length > 0) {
            this.context = [...this.context, ...detectedProducts];
            const productNames = detectedProducts.map(p => p.name).join(", ");
            const totalSavings = this.context.reduce((acc, item) => acc + (item.isOffer ? (item.originalPrice! - item.price) : 0), 0);
            const total = this.context.reduce((acc, item) => acc + item.price, 0);

            return {
                message: `Entendido. He agregado: ${productNames}. Busqué los precios más bajos. 🛒`,
                cart: { items: this.context, total, savings: totalSavings }
            };
        }

        return { message: "No logré identificar productos ni ingredientes. Intenta decir: 'Tengo arroz y cebolla' o 'Necesito comprar leche y huevos'. 🤔" };
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
