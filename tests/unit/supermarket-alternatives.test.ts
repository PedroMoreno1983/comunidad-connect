import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rows: [] as Array<{ sku: string; name: string; price: number }>,
  seals: {} as Record<string, string[]>,
  sealCalls: [] as string[][],
}));

vi.mock('@/lib/supabase/supabaseAdmin', () => ({
  getSupabaseAdmin: () => ({
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        gte: () => chain,
        ilike: () => chain,
        not: () => chain,
        order: () => chain,
        limit: async () => ({ data: mocks.rows, error: null }),
      };
      return chain;
    },
  }),
}));

vi.mock('@/lib/supermarketSeals', () => ({
  supportsSeals: (store: string) => store === 'Jumbo',
  fetchSealsBySku: async (_store: string, skus: string[]) => {
    mocks.sealCalls.push(skus);
    return Object.fromEntries(
      skus.filter(sku => Object.prototype.hasOwnProperty.call(mocks.seals, sku))
        .map(sku => [sku, mocks.seals[sku]]),
    );
  },
}));

import { findLowerSealAlternatives } from '@/lib/supermarketAlternatives';

const current = { requestedTerm: 'leche', sku: 'A', name: 'Leche Entera Colun 1 L', price: 1200 };

describe('alternativas con menos sellos', () => {
  beforeEach(() => {
    mocks.rows = [];
    mocks.seals = {};
    mocks.sealCalls = [];
  });

  it('no ofrece nada en cadenas que no publican sellos', async () => {
    expect(await findLowerSealAlternatives('Lider', [current])).toEqual([]);
  });

  it('ofrece el equivalente con menos sellos y su diferencia de precio', async () => {
    mocks.rows = [{ sku: 'B', name: 'Leche Semidescremada Soprole 1 L', price: 1450 }];
    mocks.seals = { A: ['Alto en azúcares', 'Alto en calorías'], B: ['Alto en calorías'] };

    const [entry] = await findLowerSealAlternatives('Jumbo', [current]);
    expect(entry.unknownCurrent).toBe(false);
    expect(entry.options).toHaveLength(1);
    expect(entry.options[0]).toMatchObject({ sku: 'B', priceDelta: 250 });
  });

  it('marca el producto actual como desconocido y no propone nada', async () => {
    mocks.rows = [{ sku: 'B', name: 'Leche Semidescremada Soprole 1 L', price: 1450 }];
    mocks.seals = { B: [] };

    const [entry] = await findLowerSealAlternatives('Jumbo', [current]);
    expect(entry.unknownCurrent).toBe(true);
    expect(entry.current.seals).toBeNull();
    expect(entry.options).toEqual([]);
  });

  it('descarta candidatos sin sellos conocidos en vez de suponer que no tienen', async () => {
    mocks.rows = [{ sku: 'B', name: 'Leche Semidescremada Soprole 1 L', price: 1450 }];
    mocks.seals = { A: ['Alto en azúcares'] };

    const [entry] = await findLowerSealAlternatives('Jumbo', [current]);
    expect(entry.unknownCurrent).toBe(false);
    expect(entry.options).toEqual([]);
  });

  it('descarta formatos distintos aunque tengan menos sellos', async () => {
    mocks.rows = [{ sku: 'B', name: 'Leche Semidescremada Soprole 200 ml', price: 400 }];
    mocks.seals = { A: ['Alto en azúcares', 'Alto en calorías'], B: [] };

    const [entry] = await findLowerSealAlternatives('Jumbo', [current]);
    expect(entry.options).toEqual([]);
  });

  it('descarta un candidato con la misma cantidad de sellos', async () => {
    mocks.rows = [{ sku: 'B', name: 'Leche Semidescremada Soprole 1 L', price: 900 }];
    mocks.seals = { A: ['Alto en azúcares'], B: ['Alto en calorías'] };

    const [entry] = await findLowerSealAlternatives('Jumbo', [current]);
    expect(entry.options).toEqual([]);
  });

  it('ordena primero por menos sellos y luego por menor diferencia de precio', async () => {
    mocks.rows = [
      { sku: 'B', name: 'Leche Descremada Soprole 1 L', price: 1300 },
      { sku: 'C', name: 'Leche Sin Lactosa Colun 1 L', price: 1250 },
      { sku: 'D', name: 'Leche Entera Surlat 1 L', price: 1210 },
    ];
    mocks.seals = {
      A: ['Alto en azúcares', 'Alto en calorías', 'Alto en grasas saturadas'],
      B: [],
      C: ['Alto en calorías'],
      D: ['Alto en calorías'],
    };

    const [entry] = await findLowerSealAlternatives('Jumbo', [current]);
    expect(entry.options.map(option => option.sku)).toEqual(['B', 'D', 'C']);
  });

  it('pide los sellos en tandas de 60 cuando hay más SKU que eso', async () => {
    // El `.limit()` real acota a CANDIDATES_PER_TERM; aquí se devuelven más para
    // ejercitar el troceo, que es lo que evita que la tienda corte en 60 y deje
    // al resto como "desconocido" sin avisar.
    mocks.rows = Array.from({ length: 70 }, (_, index) => ({
      sku: `S${index}`, name: `Leche Marca ${index} 1 L`, price: 1000 + index,
    }));

    await findLowerSealAlternatives('Jumbo', [current]);
    expect(mocks.sealCalls.map(chunk => chunk.length)).toEqual([60, 11]);
  });
});
