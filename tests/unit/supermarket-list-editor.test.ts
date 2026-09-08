import { describe, expect, it } from 'vitest';
import { parseGroupShoppingList } from '@/lib/supermarketGroupDomain';
import {
  lineAtCaret,
  lineBoundsAtCaret,
  replaceTermInLine,
  shoppingLine,
  shoppingListText,
  termBeingTyped,
} from '@/lib/supermarketListEditor';

const NEWLINE = String.fromCharCode(10);

describe('reescritura de la lista', () => {
  it('lo que escribe se vuelve a leer igual', () => {
    // El ciclo completo: texto del vecino -> entendido -> reescrito -> entendido.
    // Si estas dos lecturas difieren, tocar un "+" le cambia la compra a alguien.
    const original = ['2 arroz', 'leche x 6', 'aceite', 'papel higiénico 2', '1 kg carne molida']
      .join(NEWLINE);
    const primera = parseGroupShoppingList(original);
    const segunda = parseGroupShoppingList(shoppingListText(primera));

    expect(segunda).toEqual(primera);
  });

  it('sobrevive a subir y bajar una cantidad', () => {
    const items = parseGroupShoppingList(['leche x 6', 'arroz'].join(NEWLINE));
    const subida = items.map(item => (
      item.term === 'leche' ? { ...item, quantity: item.quantity + 1 } : item
    ));

    expect(parseGroupShoppingList(shoppingListText(subida))).toEqual([
      { term: 'leche', quantity: 7, unit: undefined },
      { term: 'arroz', quantity: 1, unit: undefined },
    ]);
  });

  it('conserva la unidad al reescribir', () => {
    const items = parseGroupShoppingList('500 g mantequilla');
    expect(shoppingLine(items[0])).toBe('500 g mantequilla');
    expect(parseGroupShoppingList(shoppingLine(items[0]))).toEqual(items);
  });

  it('no escribe la cantidad cuando es una sola', () => {
    expect(shoppingLine({ term: 'aceite', quantity: 1 })).toBe('aceite');
  });
});

describe('la línea que se está escribiendo', () => {
  const texto = ['2 arroz', 'leche x 6', 'aceite'].join(NEWLINE);

  it('encuentra la línea del cursor', () => {
    expect(lineAtCaret(texto, 0)).toBe('2 arroz');
    expect(lineAtCaret(texto, 10)).toBe('leche x 6');
    expect(lineAtCaret(texto, texto.length)).toBe('aceite');
  });

  it('ubica sus bordes para poder reemplazarla', () => {
    const { start, end } = lineBoundsAtCaret(texto, 10);
    expect(texto.slice(start, end)).toBe('leche x 6');
  });

  it('pregunta por el producto, no por la cantidad', () => {
    expect(termBeingTyped('2 arroz')).toBe('arroz');
    expect(termBeingTyped('leche x 6')).toBe('leche');
    expect(termBeingTyped('- papel higien')).toBe('papel higien');
    expect(termBeingTyped('500 g mantequ')).toBe('mantequ');
  });

  it('al aceptar una sugerencia conserva la cantidad escrita', () => {
    expect(replaceTermInLine('lehce x 6', 'leche')).toBe('leche x 6');
    expect(replaceTermInLine('2 arros', 'arroz')).toBe('arroz x 2');
    expect(replaceTermInLine('aseite', 'aceite')).toBe('aceite');
  });
});
