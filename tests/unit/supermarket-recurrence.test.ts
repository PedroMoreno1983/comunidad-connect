import { describe, expect, it } from 'vitest';
import { suggestRepurchases, type PurchaseRecord } from '@/lib/supermarketRecurrence';

const NOW = new Date('2026-09-05T12:00:00Z');

function bought(term: string, ...isoDates: string[]): PurchaseRecord[] {
  return isoDates.map(createdAt => ({ term, createdAt }));
}

describe('propuesta de recompra', () => {
  it('no propone nada con una sola compra', () => {
    // Con un solo dato no hay intervalo: adivinarlo seria inventar un habito.
    expect(suggestRepurchases(bought('leche', '2026-08-20T10:00:00Z'), NOW)).toEqual([]);
  });

  it('propone cuando se cumplio el ritmo observado', () => {
    // Cada 7 dias, y hace 8 que no compra.
    const result = suggestRepurchases(
      bought('leche', '2026-08-14T10:00:00Z', '2026-08-21T10:00:00Z', '2026-08-28T10:00:00Z'),
      NOW,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ term: 'leche', typicalIntervalDays: 7, purchases: 3 });
    expect(result[0].daysSinceLast).toBe(8);
  });

  it('no molesta antes de tiempo', () => {
    // Compra mensual, y solo pasaron 4 dias.
    expect(suggestRepurchases(
      bought('detergente', '2026-07-01T10:00:00Z', '2026-08-01T10:00:00Z', '2026-09-01T10:00:00Z'),
      NOW,
    )).toEqual([]);
  });

  it('cuenta dos comparaciones del mismo dia como una compra', () => {
    // Alguien corrige su lista y vuelve a comparar. Sin esto el intervalo
    // caeria a cero dias y la mediana quedaria arruinada.
    const result = suggestRepurchases(
      bought(
        'pan',
        '2026-08-22T09:00:00Z',
        '2026-08-22T09:30:00Z',
        '2026-08-29T09:00:00Z',
        '2026-08-29T18:00:00Z',
      ),
      NOW,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ term: 'pan', typicalIntervalDays: 7, purchases: 2 });
  });

  it('ordena por urgencia relativa al propio ritmo, no por dias absolutos', () => {
    const result = suggestRepurchases([
      // Cada 3 dias, lleva 9: va por su tercer ciclo sin comprarse.
      ...bought('pan', '2026-08-27T10:00:00Z', '2026-08-30T10:00:00Z'),
      // Cada 30 dias, lleva 35: apenas pasado.
      ...bought('detergente', '2026-07-02T10:00:00Z', '2026-08-01T10:00:00Z'),
    ], NOW);

    expect(result.map(item => item.term)).toEqual(['pan', 'detergente']);
    expect(result[0].daysSinceLast).toBeLessThan(result[1].daysSinceLast);
  });

  it('ignora un intervalo tan largo que ya no es habito', () => {
    expect(suggestRepurchases(
      bought('parrilla', '2026-01-05T10:00:00Z', '2026-08-05T10:00:00Z'),
      NOW,
    )).toEqual([]);
  });

  it('agrupa el mismo termino escrito distinto', () => {
    const result = suggestRepurchases([
      { term: '  Leche  ', createdAt: '2026-08-14T10:00:00Z' },
      { term: 'LECHE', createdAt: '2026-08-21T10:00:00Z' },
      { term: 'leche', createdAt: '2026-08-28T10:00:00Z' },
    ], NOW);

    expect(result).toHaveLength(1);
    expect(result[0].term).toBe('leche');
    expect(result[0].purchases).toBe(3);
  });

  it('descarta fechas ilegibles sin caerse', () => {
    const result = suggestRepurchases([
      { term: 'arroz', createdAt: 'no-es-una-fecha' },
      ...bought('arroz', '2026-08-14T10:00:00Z', '2026-08-21T10:00:00Z'),
    ], NOW);

    expect(result[0]).toMatchObject({ term: 'arroz', purchases: 2 });
  });
});
