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

/** Empaques que la persona nombra pero el SKU suele omitir. */
const REQUEST_PACKAGING = 'sachets?|bolsas?|paquetes?|mallas?|packs?';
const BREAD_TYPES = 'marraqueta|hallulla|pita';
const BRAND_ANYWHERE = new Set([
    'cif', 'confort', 'salma', 'ajax', 'poett',
]);
/** Palabras demasiado genéricas para usarlas como ancla FTS extra. */
const ANCHOR_NOISE = new Set([
    'super', 'grande', 'chico', 'color', 'natural', 'original', 'extra', 'premium',
    'fresco', 'especial', 'light', 'diet', 'nuevo', 'familiar', 'clasico', 'tradicional',
]);

/**
 * Normaliza typos y jerga de lista chilena al vocabulario del catálogo.
 * "yogurth" y "leces" no existen en FTS; "ayuyitas"/"pampita" tampoco.
 */
export function canonicalCatalogTerm(value: string): string {
    let normalized = foldAccents(value);
    if (/^cocas?$/.test(normalized)) return 'coca cola';
    normalized = normalized
        .replace(/^champanas?\b/, 'espumante')
        .replace(/\bdray\b/g, 'dry')
        .replace(/\byoghurts?\b/g, 'yogur')
        .replace(/\byogurths?\b/g, 'yogur')
        .replace(/\byogurts?\b/g, 'yogur')
        .replace(/\b(\d+)\s+(?:rollos?|unidades?|uds?)\b/g, '$1 un')
        .replace(/\bleces\b/g, 'leche')
        .replace(/\bayuyitas?\b/g, 'hallulla')
        .replace(/\bpampitas?\b/g, 'pita')
        .replace(/\baguacates?\b/g, 'palta')
        .replace(/\bgalletas?\s+salmas?\b/g, 'salmas')
        .replace(/\bsin\s+marinar\b/g, '')
        .replace(/\bsuperpollo\b/g, 'super pollo')
        .replace(/\bsantamarta\b/g, 'santa marta')
        .replace(new RegExp(`\\b(?:${REQUEST_PACKAGING})\\s+(?:de\\s+)?`, 'g'), '')
        .replace(new RegExp(`\\s+(?:${REQUEST_PACKAGING})$`), '')
        .replace(new RegExp(`\\bpan\\s+(?=${BREAD_TYPES}\\b)`, 'g'), '')
        .replace(/\s+/g, ' ')
        .trim();
    return normalized;
}

/** Browsing prompts for broad list terms; these never auto-select a product. */
export function reviewSearchSuggestions(value: string): string[] {
    const term = canonicalCatalogTerm(value);
    if (term === 'pasta larga') return ['espagueti', 'tallarines'];
    if (term === 'pasta corta') return ['espirales', 'corbatitas'];
    if (term === 'carne para parrilla') return ['asado carnicero', 'asado de tira'];
    if (term === 'papas') return ['papas granel', 'papas malla'];
    return [];
}

/** Palabras significativas del término: 3+ letras, sin conectores, sin acentos. */
export function significantWords(term: string): string[] {
    return canonicalCatalogTerm(term)
        .split(/[^a-z0-9]+/i)
        .map(word => word.trim())
        .filter(word => (
            (word.length >= 3 || SHORT_PRODUCT_WORDS.has(word))
            && !MATCH_STOP_WORDS.has(word)
            && !/^\d+$/.test(word)
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
    'barquillo', 'frutilla',
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
        deslactosada: 'lactosa',
        deslactosado: 'lactosa',
        filetito: 'filete',
        laminado: 'lamina',
        lece: 'leche',
        leces: 'leche',
        limones: 'limon',
        molida: 'molido',
        panales: 'panal',
        pescado: 'merluza',
        protein: 'proteina',
        quinoa: 'quinoa',
        quinua: 'quinoa',
        yogurth: 'yogur',
        yoghurt: 'yogur',
        yogurt: 'yogur',
    };
    const alias = aliases[word];
    if (alias) return alias;

    let base = word;
    if (base.endsWith('s') && base.length > 3) base = base.slice(0, -1); // plural simple
    if (aliases[base]) return aliases[base];

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
    'aji', 'ajo', 'apio', 'brocoli', 'cebolla', 'lechuga', 'limon', 'mandarina',
    'manzana', 'naranja', 'palta', 'papa', 'pepino', 'pera', 'pimenton', 'platano',
    'repollo', 'tomate', 'zanahoria',
]);

const PROCESSED_PRODUCE_MARKERS = new Set([
    'apanada', 'artesanal', 'bebida', 'caldo', 'chips', 'cocida', 'congelada',
    'congelado', 'conserva', 'crema', 'crispy', 'deshidratada', 'deshidratado',
    'duquesa', 'especia', 'frita', 'gajo', 'galleta', 'jugo', 'mermelada', 'paprika',
    'polvo', 'prefrita', 'pure', 'rellena', 'rodaja', 'sal', 'salsa', 'sabor',
    'sazonador', 'snack', 'sopa', 'souffle', 'soufle', 'specia',
]);

/** El páprika se vende como pimentón dulce, picante o ahumado, no como la verdura. */
const PIMENTON_SPICE_MARKERS = new Set([
    'ahumado', 'ahumada', 'carmencita', 'dulce', 'picante',
]);

function produceIsProcessed(firstTerm: string, nameWords: string[]): boolean {
    if (nameWords.some(word => PROCESSED_PRODUCE_MARKERS.has(word))) return true;
    return firstTerm === 'pimenton' && nameWords.some(word => PIMENTON_SPICE_MARKERS.has(word));
}

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
    if (words.length >= 2) return true;
    return words.length === 1 && [
        'bebida', 'carne', 'huevo', 'leche', 'longaniza', 'pan', 'queso', 'yogur',
    ].includes(words[0] || '');
}

/** Color de huevo, "molido" en café de marca, etc.: no deben tumbar un SKU real. */
function optionalModifierStems(termWords: string[]): Set<string> {
    const optional = new Set<string>();
    if (termWords.includes('huevo')) {
        optional.add('cafe');
        optional.add('blanco');
        optional.add('color');
    }
    if (termWords.includes('haiti') || termWords.includes('moka')) {
        optional.add('molido');
    }
    if (termWords.includes('lactosa')) {
        optional.add('sin');
    }
    return optional;
}

function requiredStemmedWords(term: string): string[] {
    const words = stemmedWords(term);
    const optional = optionalModifierStems(words);
    return words.filter(word => !optional.has(word));
}

function stemmedWords(value: string): string[] {
    return significantWords(value).map(stem);
}

/** En Chile el tomate cherry se vende como tomate cóctel o cocktail. */
const CHERRY_TOMATO_STEMS = new Set(['coctel', 'cocktail']);

function stemEquals(termWords: string[], wanted: string, candidate: string): boolean {
    if (wanted === candidate) return true;
    return wanted === 'cherry' && termWords.includes('tomate') && CHERRY_TOMATO_STEMS.has(candidate);
}

function termCovered(termWords: string[], nameWords: string[]): boolean {
    return termWords.every(word => nameWords.some(nameWord => stemEquals(termWords, word, nameWord)));
}

function termWordIndex(termWords: string[], nameWords: string[], word: string): number {
    return nameWords.findIndex(nameWord => stemEquals(termWords, word, nameWord));
}

/**
 * Lexical relevance for catalog results. Matching is done with complete words.
 * Generic fresh-produce requests reject derivatives such as tomato sauce or
 * potato chips; reporting a missing item is safer than charging another type.
 */
export function productMatchScore(term: string, productName: string): number {
    const allTermWords = stemmedWords(term);
    const termWords = requiredStemmedWords(term);
    const nameWords = stemmedWords(productName);
    if (termWords.length === 0 || nameWords.length === 0) return -1;
    if (!termCovered(termWords, nameWords)) return -1;

    const firstTerm = termWords[0];
    const firstPosition = termWordIndex(termWords, nameWords, firstTerm);
    if (firstPosition < 0) return -1;

    if (FRESH_PRODUCE.has(firstTerm)
        && !produceIsProcessed(firstTerm, allTermWords)
        && produceIsProcessed(firstTerm, nameWords)) return -1;
    if (firstTerm === 'aji' && nameWords.some(word => ['aceituna', 'jalapeno', 'rellena'].includes(word))) return -1;
    if (termWords.length === 1) {
        const packagePrefixed = firstPosition > 0
            && nameWords.slice(0, firstPosition).every(word => PACKAGE_PREFIXES.has(word));
        const brandAnywhere = BRAND_ANYWHERE.has(firstTerm);
        if (firstPosition !== 0 && !packagePrefixed && !brandAnywhere) return -1;
    }

    const phrasePosition = nameWords.findIndex((_, index) => (
        termWords.every((word, offset) => stemEquals(termWords, word, nameWords[index + offset] ?? ''))
    ));
    const directBonus = firstPosition === 0 ? 100 : 70;
    const phraseBonus = phrasePosition >= 0 ? 30 : 0;
    const compactnessPenalty = termWords.reduce((sum, word) => (
        sum + Math.max(0, termWordIndex(termWords, nameWords, word) - firstPosition)
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

    const optionalHits = [...optionalModifierStems(allTermWords)]
        .filter(word => allTermWords.includes(word) && nameWords.includes(word))
        .length;

    return directBonus + phraseBonus + termWords.length * 5 + optionalHits * 8
        - compactnessPenalty - variantPenalty;
}

/**
 * Puntaje del buscador del catálogo. La lista automática sigue usando
 * productMatchScore y descarta el brócoli congelado cuando alguien pide
 * "brócoli" a secas. En el buscador la persona quiere ver las fichas que
 * Lider muestra para esa palabra: unidad, pote, brotes, congelado y mix.
 * Leche y el resto de términos generales conservan el filtro estricto.
 */
export function catalogBrowseScore(term: string, productName: string): number {
    const strict = productMatchScore(term, productName);
    if (strict >= 0) return strict;
    if (productIntent(term) !== 'fresh_produce') return -1;
    const termWords = requiredStemmedWords(term);
    const nameWords = stemmedWords(productName);
    if (termWords.length === 0 || !termCovered(termWords, nameWords)) return -1;
    const firstPosition = termWordIndex(termWords, nameWords, termWords[0]);
    const leadBonus = firstPosition === 0 ? 30 : 8;
    const processedPenalty = produceIsProcessed(termWords[0] ?? '', nameWords) ? 12 : 0;
    return Math.max(1, leadBonus + termWords.length * 5 - processedPenalty);
}

/** Formatos que la persona agrega y que otra cadena a veces no escribe en el nombre. */
const REQUEST_FORMAT_WORDS = new Set([
    'bandeja', 'bolsa', 'bolsas', 'malla', 'mallas', 'pack', 'packs',
    'paquete', 'paquetes', 'sachet', 'sachets', 'pote', 'potes', 'lata', 'latas',
]);

/**
 * Puntaje de la búsqueda y de la lista, igual en todas las cadenas.
 * Si el nombre trae el pedido completo, gana. Si la cadena omite el formato
 * ("champiñones bandeja" y el SKU dice solo "Champiñones"), igual se muestra,
 * debajo de la coincidencia completa.
 */
export function catalogSearchScore(term: string, productName: string): number {
    const direct = catalogBrowseScore(term, productName);
    if (direct >= 0) return direct;
    const words = significantWords(term);
    const relaxed = words.filter(word => !REQUEST_FORMAT_WORDS.has(word));
    if (relaxed.length === 0 || relaxed.length === words.length) return -1;
    const fallback = catalogBrowseScore(relaxed.join(' '), productName);
    return fallback >= 0 ? 1 : -1;
}

export function catalogProductSearchText(name: string, brand: string): string {
    return brand ? `${name} ${brand}` : name;
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

const VOWEL_ACCENTS: Record<string, string> = {
    a: 'á',
    e: 'é',
    i: 'í',
    o: 'ó',
    u: 'ú',
};

/**
 * Grafías que ILIKE tiene que probar. Postgres distingue acentos, y el
 * catálogo guarda "Brócoli" mientras el ancla llega plegada como "brocoli".
 * Una palabra española lleva como mucho un acento y una eñe, así que basta
 * con marcar una vocal, una ene, o ambas a la vez.
 */
export function foldedAccentVariants(value: string): string[] {
    const base = foldAccents(value).replace(/[%_"]/g, '');
    if (!base) return [];
    const chars = [...base];
    const vowelIndexes = chars.flatMap((char, index) => (VOWEL_ACCENTS[char] ? [index] : []));
    const nIndexes = chars.flatMap((char, index) => (char === 'n' ? [index] : []));
    const forms = [chars];
    for (const index of nIndexes) {
        const copy = chars.slice();
        copy[index] = 'ñ';
        forms.push(copy);
    }
    const variants = new Set<string>();
    for (const form of forms) {
        variants.add(form.join(''));
        for (const index of vowelIndexes) {
            const accent = VOWEL_ACCENTS[form[index] ?? ''];
            if (!accent) continue;
            const copy = form.slice();
            copy[index] = accent;
            variants.add(copy.join(''));
        }
    }
    return [...variants].slice(0, 24);
}

/**
 * Filtro PostgREST: el nombre contiene el ancla en cualquiera de sus grafías.
 * Una ancla de dos letras no puede ir entre porcentajes: "%te%" calza dentro
 * de tomate, aceite y detergente, y el buscador se llena antes de llegar al té.
 */
export function catalogNameOrFilter(anchor: string): string {
    const needles = foldedAccentVariants(anchor);
    const usable = needles.length > 0 ? needles : [anchor.replace(/[%_"]/g, '')];
    const clauses = usable.flatMap(needle => (
        needle.length <= 2
            ? [
                `name.ilike."${needle}"`,
                `name.ilike."${needle} %"`,
                `name.ilike."% ${needle}"`,
                `name.ilike."% ${needle} %"`,
            ]
            : [`name.ilike."%${needle}%"`, `brand.ilike."%${needle}%"`]
    ));
    return [...new Set(clauses)].join(',');
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
        yogur: ['yogur', 'yogurt', 'yoghurt', 'yogurth'],
        hallulla: ['hallulla', 'hallullas', 'ayuyita', 'ayuyitas'],
        pita: ['pita', 'pampita'],
        quinoa: ['quinoa', 'quinua'],
        filete: ['filete', 'filetito', 'filetitos'],
        lamina: ['lamina', 'laminas', 'laminado'],
        proteina: ['proteina', 'protein'],
        lactosa: ['lactosa', 'deslactosada', 'deslactosado'],
        salma: ['salma', 'salmas'],
        haiti: ['haiti', 'haití'],
        moka: ['moka', 'mocha'],
        cif: ['cif'],
        confort: ['confort'],
    };
    const seen = new Set<string>();
    const anchors: string[] = [];
    const push = (value: string) => {
        const trimmed = value.trim();
        if (!trimmed || seen.has(trimmed)) return;
        seen.add(trimmed);
        anchors.push(trimmed);
    };
    for (const value of (variants[anchor] ?? [anchor])) push(value);

    for (const word of requiredStemmedWords(term)) {
        if (word === anchor || ANCHOR_NOISE.has(word)) continue;
        for (const value of (variants[word] ?? [word])) push(value);
    }
    return anchors;
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
