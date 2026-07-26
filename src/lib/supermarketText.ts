/**
 * Utilidades de texto para el módulo supermercado.
 * Puras y testeables: matching tolerante a acentos/plurales, URLs de
 * respaldo por tienda y explicación del criterio de selección de marca.
 */

export function foldAccents(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .trim();
}

const MATCH_STOP_WORDS = new Set([
    'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'en', 'con', 'por', 'para', 'al',
]);

/** Palabras significativas del término: 3+ letras, sin conectores, sin acentos. */
export function significantWords(term: string): string[] {
    return foldAccents(term)
        .split(/[^a-z0-9ñ]+/i)
        .map(word => word.trim())
        .filter(word => word.length >= 3 && !MATCH_STOP_WORDS.has(word));
}

/** Raíz tolerante a plurales simples: "laminas"→"lamina", "jaleas"→"jalea". */
function stem(word: string): string {
    if (word.endsWith('es') && word.length > 4) return word.slice(0, -2);
    if (word.endsWith('s') && word.length > 3) return word.slice(0, -1);
    return word;
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
    const foldedName = foldAccents(productName);
    const words = significantWords(term);
    if (words.length === 0) return false;
    return words.every(word => {
        const wordStem = stem(word);
        if (foldedName.includes(wordStem)) return true;
        // El usuario puede escribir singular y el catálogo plural ("jalea" → "jaleas").
        return foldedName.split(/[^a-z0-9ñ]+/i).some(nameWord => stem(nameWord) === wordStem);
    });
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
