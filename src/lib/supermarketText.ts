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

/** Palabras significativas del término: 3+ letras, sin conectores, sin acentos. */
export function significantWords(term: string): string[] {
    return foldAccents(term)
        .split(/[^a-z0-9]+/i)
        .map(word => word.trim())
        .filter(word => word.length >= 3 && !MATCH_STOP_WORDS.has(word));
}

/** Raíz tolerante a plurales simples: "laminas"→"lamina", "jaleas"→"jalea". */
function stem(word: string): string {
    if (word.endsWith('s') && word.length > 3) return word.slice(0, -1);
    return word;
}

const PACKAGE_PREFIXES = new Set([
    'bandeja', 'bolsa', 'caja', 'malla', 'pack', 'paquete',
]);

const FRESH_PRODUCE = new Set([
    'ajo', 'apio', 'cebolla', 'lechuga', 'limon', 'manzana', 'naranja',
    'palta', 'papa', 'pepino', 'pera', 'platano', 'tomate', 'zanahoria',
]);

const PROCESSED_PRODUCE_MARKERS = new Set([
    'bebida', 'chips', 'conserva', 'crema', 'deshidratado', 'frita',
    'galleta', 'jugo', 'pure', 'salsa', 'snack', 'sopa',
]);

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
        const packagePrefixed = firstPosition === 1 && PACKAGE_PREFIXES.has(nameWords[0]);
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

    return directBonus + phraseBonus + termWords.length * 5 - compactnessPenalty;
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

/**
 * Verdadero cuando TODAS las palabras significativas del término aparecen en el
 * nombre del producto (sin importar orden ni acentos). Así "queso en laminas"
 * calza con "Queso en Láminas Colun 200g".
 */
export function termMatchesProductName(term: string, productName: string): boolean {
    return productMatchScore(term, productName) >= 0;
}

const STORE_SEARCH_URLS: Record<string, (query: string) => string> = {
    Jumbo: query => `https://www.jumbo.cl/busqueda?ft=${encodeURIComponent(query)}`,
    'Santa Isabel': query => `https://www.santaisabel.cl/busqueda?ft=${encodeURIComponent(query)}`,
    Lider: query => `https://www.lider.cl/supermercado/search?query=${encodeURIComponent(query)}`,
    Unimarc: query => `https://www.unimarc.cl/search?q=${encodeURIComponent(query)}&suggestions=true`,
    Tottus: query => `https://www.tottus.cl/tottus-cl/buscar?Ntt=${encodeURIComponent(query)}`,
    aCuenta: query => `https://www.acuenta.cl/busqueda?ft=${encodeURIComponent(query)}`,
    Irurzun: query => `https://irurzun.cl/buscar?q=${encodeURIComponent(query)}`,
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
        ? `${brandLabel} elegida por mejor precio entre ${optionCount} opciones${storeLabel}`
        : optionCount === 1
            ? `${brandLabel}: única opción disponible${storeLabel}`
            : `${brandLabel} elegida por mejor precio entre las opciones encontradas${storeLabel}`;
    return isOffer ? `${base}; además está en oferta.` : `${base}.`;
}
