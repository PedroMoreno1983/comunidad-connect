/**
 * Utilidades de texto para el módulo supermercado.
 * Puras y testeables: matching tolerante a acentos/plurales, URLs de
 * respaldo por tienda y explicación del criterio de selección de marca.
 */

export function foldAccents(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

const MATCH_STOP_WORDS = new Set([
    'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'en', 'con', 'por', 'para', 'al',
]);
const SHORT_PRODUCT_WORDS = new Set(['te']);

function canonicalCatalogTerm(value: string): string {
    const normalized = foldAccents(value);
    if (/^cocas?$/.test(normalized)) return 'coca cola';
    return normalized
        .replace(/^champanas?\b/, 'espumante')
        .replace(/\bdray\b/g, 'dry');
}

/** Palabras significativas del término: 3+ letras, sin conectores, sin acentos. */
export function significantWords(term: string): string[] {
    return canonicalCatalogTerm(term)
        .split(/[^a-z0-9]+/i)
        .map(word => word.trim())
        .filter(word => (
            (word.length >= 3 || SHORT_PRODUCT_WORDS.has(word))
            && !MATCH_STOP_WORDS.has(word)
        ));
}

// Palabras reales que TERMINAN en -illa/-illo pero NO son diminutivos de otra
// cosa. Sin este resguardo, "tortilla"→"torta" o "vainilla"→"vaina" romperían
// el match. La reducción de diminutivos se salta estas.
const NON_DIMINUTIVE_ILL = new Set([
    'tortilla', 'vainilla', 'mantequilla', 'semilla', 'costilla', 'pastilla',
    'morcilla', 'natilla', 'quesillo', 'tomillo', 'membrillo', 'cuchillo',
    'cepillo', 'ladrillo', 'palillo', 'martillo', 'tornillo', 'bolsillo',
    'pasillo', 'amarillo', 'cigarrillo', 'polvillo', 'colmillo', 'gargantilla',
]);

/**
 * Raíz tolerante a plurales simples ("laminas"→"lamina") y a diminutivos chilenos
 * ("longanizillas"→"longaniza", "salchichilla"→"salchicha"). Sin lo segundo, el
 * diminutivo no calzaba con NINGÚN producto del catálogo y el ítem se reportaba
 * como faltante en todas las cadenas a la vez.
 */
function stem(word: string): string {
    const aliases: Record<string, string> = {
        champinones: 'champinon',
        comida: 'alimento',
        limones: 'limon',
        panales: 'panal',
        pescado: 'merluza',
        yoghurt: 'yogur',
        yogurt: 'yogur',
    };
    const alias = aliases[word];
    if (alias) return alias;

    let base = word;
    if (base.endsWith('s') && base.length > 3) base = base.slice(0, -1); // plural simple

    // Diminutivo -illa/-illo -> base ("longaniz"+"a", "salchich"+"a"), salvo las
    // palabras que legítimamente terminan así.
    if (!NON_DIMINUTIVE_ILL.has(base)) {
        const diminutive = base.match(/^(.{4,})ill([oa])$/);
        if (diminutive) return `${diminutive[1]}${diminutive[2]}`;
    }

    return base;
}

const PACKAGE_PREFIXES = new Set([
    'agua', 'aperitivo', 'bandeja', 'bolsa', 'botella', 'caja', 'coctel',
    'filete', 'lata', 'licor', 'malla', 'pack', 'paquete',
]);

const FRESH_PRODUCE = new Set([
    'ajo', 'apio', 'cebolla', 'lechuga', 'limon', 'manzana', 'naranja',
    'palta', 'papa', 'pepino', 'pera', 'platano', 'tomate', 'zanahoria',
]);

const PROCESSED_PRODUCE_MARKERS = new Set([
    'apanada', 'artesanal', 'bebida', 'caldo', 'chips', 'cocida', 'congelada',
    'congelado', 'conserva', 'crema', 'crispy', 'deshidratada', 'deshidratado',
    'duquesa', 'frita', 'gajo', 'galleta', 'jugo', 'mermelada', 'polvo',
    'prefrita', 'pure', 'rellena', 'rodaja', 'sal', 'salsa', 'sabor',
    'sazonador', 'snack', 'sopa', 'souffle',
]);

/**
 * Palabras que convierten un producto base en OTRO producto.
 *
 * Distinto de PROCESSED_PRODUCE_MARKERS, que solo aplica a frutas y verduras y
 * contiene palabras inseguras fuera de ese contexto ("sal" descartaria la
 * mantequilla con sal, que es mantequilla normal). Estas son seguras en
 * cualquier categoria: quien pide "leche" no quiere leche condensada.
 *
 * Se PENALIZA, no se descarta: si la tienda solo tiene la variante, mostrarla
 * con su nombre completo es mejor que declarar el producto inexistente. La
 * penalizacion basta para que una coincidencia simple siempre gane.
 *
 * Motivo: pidiendo "leche", cuatro candidatos empataban en 135 puntos -entera,
 * descremada, condensada y en polvo- y el desempate terminaba eligiendo la
 * condensada (observado el 2026-08-24).
 */
const VARIANT_SHIFT_MARKERS = new Set([
    'condensada', 'condensado', 'evaporada', 'evaporado', 'polvo',
    'helado', 'galleta', 'bebida', 'jugo', 'mermelada', 'sopa', 'caldo',
    'salsa', 'snack', 'postre', 'budin', 'flan', 'alfajor', 'cereal',
]);

/** Cuanto se castiga cada marcador: suficiente para perder contra un match simple. */
const VARIANT_SHIFT_PENALTY = 60;

export type SupermarketProductIntent = 'fresh_produce' | 'general';

export function productIntent(term: string): SupermarketProductIntent {
    const words = stemmedWords(term);
    const firstWord = words[0];
    return words.length === 1 && firstWord && FRESH_PRODUCE.has(firstWord)
        ? 'fresh_produce'
        : 'general';
}

/**
 * Generic grocery words need a wider candidate window than a precise product
 * name. The final filter still rejects unsuitable formats; this only prevents
 * the database price ordering from hiding normal packages behind sachets and
 * individual servings.
 */
export function needsBroadCatalogCandidates(term: string): boolean {
    const words = stemmedWords(term);
    return words.length === 1 && ['bebida', 'carne', 'leche', 'longaniza'].includes(words[0] || '');
}

function stemmedWords(value: string): string[] {
    return significantWords(value).map(stem);
}

/**
 * Lexical relevance for catalog results. Matching is done with complete words.
 * Generic fresh-produce requests reject derivatives such as tomato sauce or
 * potato chips; reporting a missing item is safer than charging another type.
 */
export function productMatchScore(term: string, productName: string): number {
    const termWords = stemmedWords(term);
    const nameWords = stemmedWords(productName);
    if (termWords.length === 0 || nameWords.length === 0) return -1;
    if (!termWords.every(word => nameWords.includes(word))) return -1;

    const firstTerm = termWords[0];
    const firstPosition = nameWords.indexOf(firstTerm);
    if (firstPosition < 0) return -1;

    if (termWords.length === 1) {
        const packagePrefixed = firstPosition > 0
            && nameWords.slice(0, firstPosition).every(word => PACKAGE_PREFIXES.has(word));
        if (firstPosition !== 0 && !packagePrefixed) return -1;
        if (
            FRESH_PRODUCE.has(firstTerm)
            && nameWords.some(word => PROCESSED_PRODUCE_MARKERS.has(word))
        ) {
            return -1;
        }
    }

    const phrasePosition = nameWords.findIndex((_, index) => (
        termWords.every((word, offset) => nameWords[index + offset] === word)
    ));
    const directBonus = firstPosition === 0 ? 100 : 70;
    const phraseBonus = phrasePosition >= 0 ? 30 : 0;
    const compactnessPenalty = termWords.reduce((sum, word) => (
        sum + Math.max(0, nameWords.indexOf(word) - firstPosition)
    ), 0);

    /*
     * Una variante que cambia el producto pierde contra la coincidencia simple.
     * Solo aplica cuando la persona NO la pidio: si escribe "leche condensada",
     * el marcador esta en su termino y no se castiga.
     */
    const variantPenalty = termWords.length === 1
        ? nameWords.filter(word => (
            VARIANT_SHIFT_MARKERS.has(word) && !termWords.includes(word)
        )).length * VARIANT_SHIFT_PENALTY
        : 0;

    return directBonus + phraseBonus + termWords.length * 5 - compactnessPenalty - variantPenalty;
}

/**
 * Palabra ancla para el ILIKE de Postgres: primera palabra significativa con
 * stem aplicado. Sin stem, "jaleas" jamás calza con el producto "Jalea Soprole"
 * y el término queda vacío aunque el catálogo tenga el producto.
 */
export function matchAnchor(term: string): string {
    const first = significantWords(term)[0] || foldAccents(term).split(/\s+/)[0] || foldAccents(term);
    return stem(first);
}

/** Catalogs use yogur, yogurt and yoghurt for the same product family. */
export function matchAnchors(term: string): string[] {
    const anchor = matchAnchor(term);
    const variants: Record<string, string[]> = {
        azucar: ['azucar', 'azúcar'],
        champinon: ['champinon', 'champiñon'],
        espumante: ['espumante', 'champana', 'champaña'],
        limon: ['limon', 'limón'],
        panal: ['panal', 'pañal'],
        platano: ['platano', 'plátano'],
        salmon: ['salmon', 'salmón'],
        te: ['te', 'té'],
        yogur: ['yogur', 'yogurt', 'yoghurt'],
    };
    return variants[anchor] ?? [anchor];
}

/**
 * Verdadero cuando TODAS las palabras significativas del término aparecen en el
 * nombre del producto (sin importar orden ni acentos). Así "queso en laminas"
 * calza con "Queso en Láminas Colun 200g".
 */
export function termMatchesProductName(term: string, productName: string): boolean {
    return productMatchScore(term, productName) >= 0;
}

/**
 * URLs de búsqueda vigentes. Una ruta muerta aquí tumba el catálogo en vivo y
 * el respaldo de fichas de ESA tienda; Lider e Irurzun ya cambiaron de host.
 *
 * Verificado 2026-08-27: `www.lider.cl/supermercado/search` entra a Queue-it y
 * nunca muestra resultados; `super.lider.cl/search` responde 200. Irurzun
 * sirve el catálogo en `/search`, no en `/buscar`.
 */
const STORE_SEARCH_URLS: Record<string, (query: string) => string> = {
    Jumbo: query => `https://www.jumbo.cl/busqueda?ft=${encodeURIComponent(query)}`,
    'Santa Isabel': query => `https://www.santaisabel.cl/busqueda?ft=${encodeURIComponent(query)}`,
    Lider: query => `https://super.lider.cl/search?query=${encodeURIComponent(query)}`,
    Unimarc: query => `https://www.unimarc.cl/search?q=${encodeURIComponent(query)}&suggestions=true`,
    Tottus: query => `https://www.tottus.cl/tottus-cl/buscar?Ntt=${encodeURIComponent(query)}`,
    aCuenta: query => `https://www.acuenta.cl/busqueda?ft=${encodeURIComponent(query)}`,
    Irurzun: query => `https://irurzun.cl/search?q=${encodeURIComponent(query)}`,
};

/**
 * URL de respaldo cuando la tienda no expone la ficha exacta del producto:
 * lleva a la búsqueda del nombre exacto dentro del sitio del supermercado.
 */
export function storeSearchUrl(store: string | undefined, productName: string): string | undefined {
    if (!store || !productName.trim()) return undefined;
    const builder = STORE_SEARCH_URLS[store];
    return builder ? builder(productName.trim()) : undefined;
}

/**
 * Explica por qué CoCo eligió esta marca/presentación cuando el usuario no la
 * especificó — el criterio debe ser visible, no silencioso.
 */
export function buildSelectionReason(options: {
    brand?: string;
    explicitBrand?: string | null;
    optionCount: number;
    store?: string;
    isOffer?: boolean;
}): string {
    const { brand, explicitBrand, optionCount, store, isOffer } = options;
    const storeLabel = store ? ` en ${store}` : '';
    if (explicitBrand) {
        return `Marca ${explicitBrand} pedida por ti${storeLabel}.`;
    }
    const brandLabel = brand ? `Marca ${brand}` : 'Esta opción';
    const base = optionCount > 1
        ? `${brandLabel} elegida por coincidencia, presentacion y precio entre ${optionCount} opciones${storeLabel}`
        : optionCount === 1
            ? `${brandLabel}: única opción disponible${storeLabel}`
            : `${brandLabel} elegida por mejor precio entre las opciones encontradas${storeLabel}`;
    return isOffer ? `${base}; además está en oferta.` : `${base}.`;
}
