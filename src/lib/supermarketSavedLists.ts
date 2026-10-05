import { MAX_SHOPPING_LIST_CHARS, parseGroupShoppingList } from '@/lib/supermarketGroupDomain';
import { foldAccents } from '@/lib/supermarketText';

/** Misma lista aunque cambien mayusculas, acentos o espacios de mas. */
export function savedListKey(body: string): string {
  return foldAccents(body).replace(/\s+/g, ' ').trim().slice(0, MAX_SHOPPING_LIST_CHARS);
}

/** Titulo corto a partir de lo que la lista pide, no de un nombre inventado. */
export function savedListTitle(body: string): string {
  const items = parseGroupShoppingList(body, true);
  if (items.length === 0) return 'Lista de compras';
  const names = items.slice(0, 3).map(item => item.term);
  const extra = items.length > 3 ? ` y ${items.length - 3} más` : '';
  return `${names.join(', ')}${extra}`.slice(0, 80);
}
