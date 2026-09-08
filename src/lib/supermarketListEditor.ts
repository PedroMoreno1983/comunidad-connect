import type { GroupItemInput } from '@/lib/supermarketGroupDomain';

/**
 * Escritura de la lista de compras desde lo que se entendio.
 *
 * Vive aparte de la pantalla porque tiene una obligacion que se puede romper en
 * silencio: lo que sale de `shoppingLine` tiene que volver a leerse igual. Al
 * subir o bajar una cantidad, la lista entera se reescribe desde lo entendido;
 * si el texto generado se interpretara distinto, tocar un "+" le cambiaria la
 * compra a alguien sin que nada avise. `supermarket-list-editor.test.ts` cierra
 * ese ciclo contra el parser real.
 */

const NEWLINE = String.fromCharCode(10);

export function shoppingLine(item: GroupItemInput): string {
  if (item.unit) return `${item.quantity} ${item.unit} ${item.term}`;
  return item.quantity > 1 ? `${item.term} x ${item.quantity}` : item.term;
}

export function shoppingListText(items: GroupItemInput[]): string {
  return items.map(shoppingLine).join(NEWLINE);
}

/** La linea donde esta el cursor: es la que la persona esta escribiendo. */
export function lineAtCaret(text: string, caret: number): string {
  const start = text.lastIndexOf(NEWLINE, Math.max(0, caret - 1)) + 1;
  const end = text.indexOf(NEWLINE, caret);
  return text.slice(start, end === -1 ? text.length : end);
}

export function lineBoundsAtCaret(text: string, caret: number): { start: number; end: number } {
  const start = text.lastIndexOf(NEWLINE, Math.max(0, caret - 1)) + 1;
  const end = text.indexOf(NEWLINE, caret);
  return { start, end: end === -1 ? text.length : end };
}

/**
 * Quita la cantidad para preguntarle al catalogo por el producto y no por
 * "2 arroz", que no es como se llama nada.
 */
export function termBeingTyped(line: string): string {
  return line
    .replace(/^[-*•\s]+/, '')
    .replace(/^\d+\s*(?:x|un|kg|g|gr|l|lt|ml|cc)?\s*/i, '')
    .replace(/\s*x\s*\d+\s*$/i, '')
    .trim();
}

/** Reemplaza el producto de una linea conservando la cantidad que ya tenia. */
export function replaceTermInLine(line: string, term: string): string {
  const quantity = line.match(/\s*x\s*(\d+)\s*$/i)?.[1] ?? line.match(/^(\d+)\s/)?.[1];
  return quantity ? `${term} x ${quantity}` : term;
}
