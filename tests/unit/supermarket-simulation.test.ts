import { afterEach, describe, expect, it, vi } from 'vitest';
import { simulateBasketTotal, supportsSimulation } from '@/lib/supermarketSimulation';

afterEach(() => {
  vi.unstubAllGlobals();
});

function simulation(totals: Array<{ id: string; value: number }>, items = 1) {
  return new Response(JSON.stringify({
    totals,
    items: Array.from({ length: items }, (_, index) => ({ id: `sku-${index}` })),
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('simulacion del total real', () => {
  it('solo aplica a las cadenas VTEX', () => {
    expect(supportsSimulation('Jumbo')).toBe(true);
    expect(supportsSimulation('Santa Isabel')).toBe(true);
    expect(supportsSimulation('Unimarc')).toBe(true);
    expect(supportsSimulation('Lider')).toBe(false);
    expect(supportsSimulation('aCuenta')).toBe(false);
  });

  it('convierte los centavos de VTEX a pesos', async () => {
    // 860000 centavos son $8.600: cuatro unidades de $2.150, sin promocion.
    vi.stubGlobal('fetch', vi.fn(async () => simulation([{ id: 'Items', value: 860_000 }])));

    const result = await simulateBasketTotal('Jumbo', [{ sku: '111151', quantity: 4 }]);

    expect(result).toMatchObject({ supported: true, total: 8_600, discount: 0 });
  });

  it('descuenta la promocion por volumen del total', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => simulation([
      { id: 'Items', value: 860_000 },
      { id: 'Discounts', value: -120_000 },
    ])));

    const result = await simulateBasketTotal('Jumbo', [{ sku: '111151', quantity: 4 }]);

    // Es justo lo que el estimado no puede ver: $8.600 menos $1.200 de promocion.
    expect(result).toMatchObject({ supported: true, total: 7_400, discount: 1_200 });
  });

  it('manda los sku y cantidades que recibio', async () => {
    const fetchMock = vi.fn(async () => simulation([{ id: 'Items', value: 100_000 }]));
    vi.stubGlobal('fetch', fetchMock);

    await simulateBasketTotal('Unimarc', [
      { sku: '111', quantity: 2 },
      { sku: '222', quantity: 1, seller: '5' },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.country).toBe('CHL');
    expect(body.items).toEqual([
      { id: '111', quantity: 2, seller: '1' },
      { id: '222', quantity: 1, seller: '5' },
    ]);
  });

  it('avisa cuando la tienda reconocio menos lineas de las pedidas', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => simulation([{ id: 'Items', value: 100_000 }], 1)));

    const result = await simulateBasketTotal('Jumbo', [
      { sku: '111', quantity: 1 },
      { sku: '222', quantity: 1 },
    ]);

    expect(result.resolvedItems).toBe(1);
  });

  it('no rompe la comparacion cuando la tienda falla', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('sin red'); }));

    expect(await simulateBasketTotal('Jumbo', [{ sku: '111', quantity: 1 }]))
      .toEqual({ supported: false });
  });

  it('no consulta a una cadena sin simulacion', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(await simulateBasketTotal('Lider', [{ sku: '111', quantity: 1 }]))
      .toEqual({ supported: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
