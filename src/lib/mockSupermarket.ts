export interface Product {
    id: string;
    name: string;
    brand: string;
    category: 'dairy' | 'pantry' | 'meat' | 'cleaning' | 'drinks' | 'fruit';
    prices: {
        store: 'Jumbo' | 'Lider';
        price: number;
        offerPrice?: number;
    }[];
    keywords: string[]; // Palabras clave para la búsqueda
}

export const SUPERMARKET_CATALOG: Product[] = [
    // Lácteos
    {
        id: 'milk-1',
        name: 'Leche Entera 1L',
        brand: 'Colun',
        category: 'dairy',
        keywords: ['leche', 'colun', 'entera'],
        prices: [
            { store: 'Jumbo', price: 1150 },
            { store: 'Lider', price: 1090, offerPrice: 990 }
        ]
    },
    {
        id: 'cheese-1',
        name: 'Queso Gouda Laminado 250g',
        brand: 'Soprole',
        category: 'dairy',
        keywords: ['queso', 'gouda', 'laminado'],
        prices: [
            { store: 'Jumbo', price: 2890, offerPrice: 2490 },
            { store: 'Lider', price: 2790 }
        ]
    },
    // Despensa
    {
        id: 'rice-1',
        name: 'Arroz Grado 2 1kg',
        brand: 'Tucapel',
        category: 'pantry',
        keywords: ['arroz', 'tucapel'],
        prices: [
            { store: 'Jumbo', price: 1490, offerPrice: 1290 },
            { store: 'Lider', price: 1550 }
        ]
    },
    {
        id: 'pasta-1',
        name: 'Spaghetti N5',
        brand: 'Carozzi',
        category: 'pantry',
        keywords: ['fideos', 'pasta', 'tallarines', 'spaghetti'],
        prices: [
            { store: 'Jumbo', price: 1190 },
            { store: 'Lider', price: 1150, offerPrice: 890 }
        ]
    },
    {
        id: 'bread-1',
        name: 'Pan Molde Blanco XL',
        brand: 'Ideal',
        category: 'pantry',
        keywords: ['pan', 'molde', 'blanco'],
        prices: [
            { store: 'Jumbo', price: 2890 },
            { store: 'Lider', price: 2790, offerPrice: 2390 }
        ]
    },
    // Carnes
    {
        id: 'meat-1',
        name: 'Lomo Vetado (Kg)',
        brand: 'SuperCerdo',
        category: 'meat',
        keywords: ['carne', 'lomo', 'vetado', 'asado'],
        prices: [
            { store: 'Jumbo', price: 14990, offerPrice: 12990 },
            { store: 'Lider', price: 13990 }
        ]
    },
    {
        id: 'chicken-1',
        name: 'Pechuga Pollo Deshuesada (Kg)',
        brand: 'Ariztía',
        category: 'meat',
        keywords: ['pollo', 'pechuga'],
        prices: [
            { store: 'Jumbo', price: 5990 },
            { store: 'Lider', price: 5490, offerPrice: 4990 }
        ]
    },
    // Bebidas
    {
        id: 'coke-1',
        name: 'Coca Cola 3L',
        brand: 'Coca Cola',
        category: 'drinks',
        keywords: ['bebida', 'coca', 'cola', 'gaseosa'],
        prices: [
            { store: 'Jumbo', price: 3190, offerPrice: 2890 },
            { store: 'Lider', price: 3090 }
        ]
    },
    {
        id: 'beer-1',
        name: 'Cerveza Royal Guard Pack 6',
        brand: 'Royal Guard',
        category: 'drinks',
        keywords: ['cerveza', 'chela', 'royal', 'alcohol'],
        prices: [
            { store: 'Jumbo', price: 6490 },
            { store: 'Lider', price: 6290, offerPrice: 5490 }
        ]
    },
    // Aseo
    {
        id: 'detergent-1',
        name: 'Detergente Líquido 3L',
        brand: 'Omo',
        category: 'cleaning',
        keywords: ['detergente', 'omo', 'lavado'],
        prices: [
            { store: 'Jumbo', price: 12990 },
            { store: 'Lider', price: 11990, offerPrice: 8990 }
        ]
    },
    // Frutas
    {
        id: 'apple-1',
        name: 'Manzanas Fuji (Kg)',
        brand: 'Granel',
        category: 'fruit',
        keywords: ['manzana', 'fruta'],
        prices: [
            { store: 'Jumbo', price: 1490 },
            { store: 'Lider', price: 1290 }
        ]
    }
];
