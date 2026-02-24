export interface Ingredient {
    name: string;
    quantity: string;
    isEssential: boolean; // Si falta, no se puede hacer la receta
}

export interface Recipe {
    id: string;
    name: string;
    description: string;
    difficulty: 'Fácil' | 'Media' | 'Difícil';
    time: string;
    ingredients: Ingredient[];
    steps: string[];
}

export const RECIPE_CATALOG: Recipe[] = [
    {
        id: 'pizza-1',
        name: 'Pizza Casera',
        description: 'Clásica pizza con masa casera, ideal para compartir.',
        difficulty: 'Media',
        time: '45 min',
        ingredients: [
            { name: 'Harina', quantity: '500g', isEssential: true },
            { name: 'Levadura', quantity: '10g', isEssential: true },
            { name: 'Salsa de Tomate', quantity: '200ml', isEssential: true },
            { name: 'Queso Gouda', quantity: '250g', isEssential: true },
            { name: 'Orégano', quantity: 'al gusto', isEssential: false },
            { name: 'Aceite de Oliva', quantity: 'un chorrito', isEssential: false }
        ],
        steps: ['Mezclar harina y levadura', 'Amasar', 'Hornear']
    },
    {
        id: 'arroz-chaufa-1',
        name: 'Arroz Chaufa',
        description: 'Delicioso plato fusión peruano-chino.',
        difficulty: 'Fácil',
        time: '20 min',
        ingredients: [
            { name: 'Arroz', quantity: '2 tazas', isEssential: true },
            { name: 'Huevos', quantity: '2 unidades', isEssential: true },
            { name: 'Pollo', quantity: '300g', isEssential: false },
            { name: 'Salsa de Soya', quantity: 'al gusto', isEssential: true },
            { name: 'Cebollín', quantity: '1 atado', isEssential: false }
        ],
        steps: ['Hacer tortilla de huevo', 'Saltear pollo', 'Mezclar con arroz y soya']
    },
    {
        id: 'panqueques-1',
        name: 'Panqueques con Manjar',
        description: 'Postre rápido y muy fácil.',
        difficulty: 'Fácil',
        time: '15 min',
        ingredients: [
            { name: 'Harina', quantity: '1 taza', isEssential: true },
            { name: 'Leche', quantity: '1 taza', isEssential: true },
            { name: 'Huevos', quantity: '2 unidades', isEssential: true },
            { name: 'Manjar', quantity: 'al gusto', isEssential: false },
            { name: 'Aceite', quantity: 'para freír', isEssential: true }
        ],
        steps: ['Mezclar todo en la juguera', 'Freír en sartén caliente']
    },
    {
        id: 'tallarines-salsa-1',
        name: 'Tallarines con Salsa Bolognesa',
        description: 'El salvador de los almuerzos rápidos.',
        difficulty: 'Fácil',
        time: '25 min',
        ingredients: [
            { name: 'Fideos', quantity: '400g', isEssential: true },
            { name: 'Salsa de Tomate', quantity: '1 sachet', isEssential: true },
            { name: 'Carne Molida', quantity: '250g', isEssential: false }, // Opcional para versión simple
            { name: 'Laurel', quantity: '1 hoja', isEssential: false }
        ],
        steps: ['Cocer fideos', 'Preparar salsa con carne', 'Mezclar']
    }
];
