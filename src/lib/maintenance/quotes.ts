/**
 * quotes.ts — Cotizaciones de mantención (cálculo puro).
 *
 * Reglas:
 *   - Se piden cotizaciones a 2 o 3 proveedores verificados de la comunidad,
 *     elegidos por afinidad con el tipo de trabajo y luego por evaluación.
 *   - Para elegir hacen falta al menos 2 cotizaciones recibidas. Con una sola,
 *     o si no se elige la más barata, hay que dejar una justificación escrita.
 *   - Elegir no contrata ni paga: queda registrado para la administración.
 */
import { assetCategoryKey } from './assetRisk';

export const MIN_QUOTES = 2;
export const MAX_QUOTES = 3;
export const MIN_JUSTIFICATION = 10;

/** Palabras que ligan un tipo de activo con la categoría o especialidad del proveedor. */
export const PROVIDER_KEYWORDS: Record<string, string[]> = {
    elevator: ['ascensor', 'elevador', 'elevator'],
    pump: ['bomba', 'plumbing', 'gasfiter', 'plomer', 'sanitari', 'agua'],
    generator: ['generador', 'electrical', 'electric'],
    electrical: ['electrical', 'electric', 'tablero'],
    fire: ['incendio', 'red humeda', 'red seca', 'fire'],
    extinguisher: ['extintor', 'incendio', 'fire'],
    gate: ['porton', 'automatiz', 'locksmith', 'cerraj', 'acceso'],
    boiler: ['caldera', 'calefon', 'calefaccion', 'gas', 'plumbing', 'agua caliente'],
    hvac: ['clima', 'aire acondicionado', 'hvac', 'ventilacion'],
    other: [],
};

export interface QuoteProvider {
    id: string;
    name: string;
    category: string | null;
    specialties?: string[] | null;
    verified: boolean | null;
    rating?: number | string | null;
    completed_jobs?: number | null;
}

export interface QuoteRow {
    id: string;
    provider_id: string;
    status: 'requested' | 'received' | 'selected' | 'rejected';
    amount: number | string | null;
}

function normalize(value: string) {
    return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Infiere el tipo de trabajo desde la categoría del activo o, si no hay, desde el texto del ticket. */
export function jobCategory(input: { assetCategory?: string | null; description?: string | null }) {
    if (input.assetCategory) {
        const key = assetCategoryKey(input.assetCategory);
        if (key !== 'other') return key;
    }
    const description = normalize(`${input.assetCategory || ''} ${input.description || ''}`.trim());
    if (!description) return 'other';
    let best = 'other';
    let bestHits = 0;
    for (const [key, words] of Object.entries(PROVIDER_KEYWORDS)) {
        const hits = words.filter(word => description.includes(word)).length;
        if (hits > bestHits) { best = key; bestHits = hits; }
    }
    return best;
}

export function providerAffinity(provider: QuoteProvider, category: string) {
    const words = PROVIDER_KEYWORDS[category] || [];
    if (!words.length) return 0;
    const haystack = normalize([provider.category || '', provider.name, ...(provider.specialties || [])].join(' '));
    return words.filter(word => haystack.includes(word)).length;
}

export function pickQuoteProviders(input: { category: string; providers: QuoteProvider[]; exclude?: string[]; max?: number }) {
    const exclude = new Set(input.exclude || []);
    const max = Math.min(MAX_QUOTES, input.max ?? MAX_QUOTES);
    const verified = input.providers.filter(provider => provider.verified && !exclude.has(provider.id));
    const scored = verified.map(provider => ({ provider, affinity: providerAffinity(provider, input.category) }));
    const pool = input.category === 'other' ? scored : scored.filter(entry => entry.affinity > 0);
    return pool
        .sort((a, b) => b.affinity - a.affinity
            || (Number(b.provider.rating) || 0) - (Number(a.provider.rating) || 0)
            || (b.provider.completed_jobs || 0) - (a.provider.completed_jobs || 0)
            || a.provider.name.localeCompare(b.provider.name))
        .slice(0, max)
        .map(entry => entry.provider);
}

export function compareQuotes(quotes: QuoteRow[]) {
    const received = quotes
        .filter(quote => (quote.status === 'received' || quote.status === 'selected') && quote.amount !== null)
        .map(quote => ({ ...quote, amount: Number(quote.amount) }))
        .sort((a, b) => a.amount - b.amount);
    const cheapest = received[0] || null;
    const highest = received[received.length - 1] || null;
    return {
        requested: quotes.length,
        received: received.length,
        pending: quotes.filter(quote => quote.status === 'requested').length,
        cheapest,
        highest,
        spreadPct: cheapest && highest && cheapest.amount > 0 ? Math.round(((highest.amount - cheapest.amount) / cheapest.amount) * 100) : 0,
        ranking: received,
    };
}

/** Devuelve el motivo por el que no se puede elegir la cotización, o null si se puede. */
export function quoteSelectionError(quotes: QuoteRow[], quoteId: string, justification?: string | null) {
    const quote = quotes.find(row => row.id === quoteId);
    if (!quote) return 'La cotización no pertenece a este trabajo.';
    if (quotes.some(row => row.status === 'selected')) return 'Este trabajo ya tiene una cotización elegida.';
    if (quote.status !== 'received' || quote.amount === null) return 'Solo se puede elegir una cotización recibida con monto.';
    const justified = (justification || '').trim().length >= MIN_JUSTIFICATION;
    const comparison = compareQuotes(quotes);
    if (comparison.received < MIN_QUOTES && !justified) {
        return `Hacen falta al menos ${MIN_QUOTES} cotizaciones recibidas, o una justificación escrita para elegir con menos.`;
    }
    if (comparison.cheapest && Number(quote.amount) > comparison.cheapest.amount && !justified) {
        return 'No es la cotización más baja: deja una justificación escrita (plazo, garantía, experiencia).';
    }
    return null;
}
