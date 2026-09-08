import 'server-only';

import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { foldAccents } from '@/lib/supermarketText';
import type { ShoppingTermReview, ShoppingTermSuggestion } from '@/lib/types';

/**
 * Autocompletado y correccion de la lista de compras.
 *
 * Las dos preguntas se contestan contra el mismo vocabulario: los terminos que
 * el catalogo realmente puede responder, con cuantos productos tiene cada uno
 * (tabla `supermarket_search_terms`, recalculada al terminar la carga nocturna).
 *
 * Que el vocabulario venga del catalogo y no de una lista escrita a mano es lo
 * que sostiene la promesa: nunca se sugiere un termino que no encuentre
 * productos. Una sugerencia vacia es peor que ninguna, y en una lista de compras
 * se paga caro: la persona la usa, compara, y descubre el hueco al final.
 */

/** El vocabulario cambia una vez por noche; no hace falta releerlo por peticion. */
const VOCABULARY_TTL_MS = 6 * 60 * 60 * 1000;
/** Tope de PostgREST por peticion. Los mil mas frecuentes cubren una compra normal. */
const VOCABULARY_SIZE = 1000;
const MIN_QUERY_LENGTH = 2;
const MAX_SUGGESTIONS = 8;
const MAX_CORRECTIONS = 3;
/** Terminos que se revisan en una consulta. Una lista larga no puede colgar la pantalla. */
const MAX_REVIEWED_TERMS = 60;

interface VocabularyEntry {
  /** Como se muestra. */
  term: string;
  /** Sin tildes y en minuscula: contra esto se compara. */
  folded: string;
  products: number;
}

let cache: { entries: VocabularyEntry[]; loadedAt: number } | null = null;
let inFlight: Promise<VocabularyEntry[]> | null = null;

/** Solo para las pruebas: el vocabulario vive en memoria del proceso. */
export function resetVocabularyCache(): void {
  cache = null;
  inFlight = null;
}

async function readVocabulary(): Promise<VocabularyEntry[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('supermarket_search_terms')
    .select('term,products')
    .order('products', { ascending: false })
    .limit(VOCABULARY_SIZE);
  if (error) throw error;
  return (data ?? [])
    .map(row => ({
      term: String(row.term ?? ''),
      folded: foldAccents(String(row.term ?? '')),
      products: Number(row.products) || 0,
    }))
    .filter(entry => entry.term.length > 0);
}

/**
 * Nunca lanza: sin vocabulario la lista se compara igual, solo se pierde la
 * ayuda. Un fallo aca no puede dejar a alguien sin poder hacer su compra.
 */
async function vocabulary(): Promise<VocabularyEntry[]> {
  if (cache && Date.now() - cache.loadedAt < VOCABULARY_TTL_MS) return cache.entries;
  // Varias peticiones simultaneas con la cache vencida comparten una sola lectura.
  if (!inFlight) {
    inFlight = readVocabulary()
      .then(entries => {
        cache = { entries, loadedAt: Date.now() };
        return entries;
      })
      .catch(() => cache?.entries ?? [])
      .finally(() => { inFlight = null; });
  }
  return inFlight;
}

/** Distancia de edicion acotada: pasado el corte no interesa cuanto mas lejos esta. */
function editDistance(left: string, right: string, limit: number): number {
  if (Math.abs(left.length - right.length) > limit) return limit + 1;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      if (current[j] < best) best = current[j];
    }
    if (best > limit) return limit + 1;
    previous = current;
  }
  return previous[right.length];
}

function normalize(value: string): string {
  return foldAccents(String(value ?? '')).replace(/\s+/g, ' ').trim();
}

/** Cuantos errores se toleran segun el largo: en una palabra corta, uno solo. */
function distanceLimitFor(term: string): number {
  if (term.length <= 4) return 1;
  if (term.length <= 8) return 2;
  return 3;
}

export async function suggestShoppingTerms(
  query: string,
  limit = MAX_SUGGESTIONS,
): Promise<ShoppingTermSuggestion[]> {
  const wanted = normalize(query);
  if (wanted.length < MIN_QUERY_LENGTH) return [];
  const entries = await vocabulary();

  return entries
    .filter(entry => entry.folded.includes(wanted))
    .sort((left, right) => (
      // Lo que empieza con lo escrito va primero: es lo que la persona esta
      // tecleando. Despues, lo que mas productos tiene.
      Number(right.folded.startsWith(wanted)) - Number(left.folded.startsWith(wanted))
      || right.products - left.products
      || left.term.length - right.term.length
    ))
    .slice(0, Math.max(1, Math.min(limit, MAX_SUGGESTIONS)))
    .map(entry => ({ term: entry.term, products: entry.products }));
}

/** Todas las palabras que aparecen en el vocabulario, para revisar una por una. */
function wordsOf(entries: VocabularyEntry[]): Set<string> {
  const words = new Set<string>();
  for (const entry of entries) {
    for (const word of entry.folded.split(' ')) if (word) words.add(word);
  }
  return words;
}

/**
 * Un termino se da por bueno cuando el vocabulario lo contiene o lo extiende
 * -"leche" esta tal cual, "leche descremada colun" empieza por uno que si esta-
 * y ademas ninguna de sus palabras es desconocida.
 *
 * Las dos condiciones hacen falta. Solo con la primera, "papel hgienico" pasaba:
 * empieza por "papel", que existe. Encontraria productos, si, pero cualquier
 * papel, no el que la persona quiso escribir. Revisar palabra por palabra es lo
 * que separa una precision legitima ("leche descremada") de un dedazo.
 *
 * No se afirma que exista el producto exacto -eso lo resuelve la comparacion-,
 * solo que la busqueda no va a volver vacia ni desviada.
 */
function isKnown(entries: VocabularyEntry[], words: Set<string>, folded: string): boolean {
  const shaped = entries.some(entry => (
    entry.folded === folded
    || folded.startsWith(`${entry.folded} `)
    || entry.folded.startsWith(`${folded} `)
  ));
  return shaped && folded.split(' ').every(word => words.has(word));
}

function corrections(entries: VocabularyEntry[], folded: string): ShoppingTermSuggestion[] {
  const limit = distanceLimitFor(folded);
  return entries
    // Se compara la frase completa. Comparar ademas la primera palabra parecia
    // util para "lehce descremada", pero premiaba a quien solo acertara el
    // comienzo: "papel hgienico" proponia "papel" con distancia cero y dejaba
    // "papel higienico" abajo. La frase entera resuelve los dos casos, porque
    // una palabra mal escrita cuesta lo mismo dentro de la frase que sola.
    .map(entry => ({ entry, distance: editDistance(folded, entry.folded, limit) }))
    .filter(candidate => candidate.distance <= limit)
    .sort((left, right) => (
      left.distance - right.distance || right.entry.products - left.entry.products
    ))
    .slice(0, MAX_CORRECTIONS)
    .map(candidate => ({ term: candidate.entry.term, products: candidate.entry.products }));
}

export async function reviewShoppingTerms(terms: string[]): Promise<ShoppingTermReview[]> {
  const wanted = terms.slice(0, MAX_REVIEWED_TERMS);
  if (wanted.length === 0) return [];
  const entries = await vocabulary();
  // Sin vocabulario no se puede afirmar que un termino no exista. Se informa
  // como no verificado en vez de marcarlo como error.
  if (entries.length === 0) {
    return wanted.map(term => ({ term, status: 'unverified' as const, suggestions: [] }));
  }

  const words = wordsOf(entries);
  return wanted.map(term => {
    const folded = normalize(term);
    if (!folded) return { term, status: 'unverified' as const, suggestions: [] };
    if (isKnown(entries, words, folded)) return { term, status: 'ok' as const, suggestions: [] };
    return { term, status: 'unknown' as const, suggestions: corrections(entries, folded) };
  });
}
