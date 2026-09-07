import { afterEach, describe, expect, it, vi } from 'vitest';
import { simulateBasketTotal, supportsSimulation } from '@/lib/supermarketSimulation';

afterEach(() => {
  vi.unstubAllGlobals();
});

function simulation(totals: Array<{ id: string; value: number }>, items = [{ id: '111151', quantity: 4, seller: '1', availability: 'available' }]) {
  return new Response(JSON.stringify({
    totals,
    items,
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
    vi.stubGlobal('fetch', vi.fn(async () => simulation([{ id: 'Items', value: 100_000 }], [{ id: '111', quantity: 1, seller: '1', availability: 'available' }])));

    const result = await simulateBasketTotal('Jumbo', [
      { sku: '111', quantity: 1 },
      { sku: '222', quantity: 1 },
    ]);

    expect(result.resolvedItems).toBe(1);
    expect(result.complete).toBe(false);
    expect(result.total).toBeUndefined();
  });

  it('convierte a pesos el minimo que la tienda declara', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      totals: [{ id: 'Items', value: 130_000 }],
      items: [{ id: '111151', quantity: 4, seller: '1', availability: 'available' }],
      minimumOrderValue: 50_000,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    const result = await simulateBasketTotal('Unimarc', [{ sku: '111151', quantity: 4 }]);

    expect(result.minimumOrder).toBe(500);
    expect(result.minimumOrderWithoutAddress).toBe(true);
  });

  it('trata un minimo en cero como desconocido, no como ausencia de minimo', async () => {
    // La consulta va sin direccion de despacho. Un 0 aca no prueba que la tienda
    // no exija un minimo: puede aparecer al elegir comuna o retiro, como pasa en
    // aCuenta, que pide sobre $25.000 y ninguna API disponible lo anticipa.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      totals: [{ id: 'Items', value: 130_000 }],
      items: [{ id: '111151', quantity: 4, seller: '1', availability: 'available' }],
      minimumOrderValue: 0,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    const result = await simulateBasketTotal('Jumbo', [{ sku: '111151', quantity: 4 }]);

    expect(result.minimumOrder).toBeUndefined();
  });

  it('deja el minimo desconocido cuando la tienda no informa el campo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      totals: [{ id: 'Items', value: 130_000 }],
      items: [{ id: '111151', quantity: 4, seller: '1', availability: 'available' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    const result = await simulateBasketTotal('Jumbo', [{ sku: '111151', quantity: 4 }]);

    expect(result.minimumOrder).toBeUndefined();
  });

  it('no rompe la comparacion cuando la tienda falla', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('sin red'); }));

    expect(await simulateBasketTotal('Jumbo', [{ sku: '111', quantity: 1 }]))
      .toMatchObject({ supported: true, complete: false });
  });

  it('no consulta a una cadena sin simulacion', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(await simulateBasketTotal('Lider', [{ sku: '111', quantity: 1 }]))
      .toEqual({ supported: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
