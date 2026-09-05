import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanSeals, fetchSealsBySku, supportsSeals } from '@/lib/supermarketSeals';

afterEach(() => {
  vi.unstubAllGlobals();
});

function vtexProduct(sku: string, field: string, seals: unknown) {
  return {
    productName: `Producto ${sku}`,
    items: [{ itemId: sku }],
    [field]: seals,
  };
}

describe('sellos nutricionales', () => {
  it('reconoce solo las cadenas que publican la especificacion', () => {
    expect(supportsSeals('Jumbo')).toBe(true);
    expect(supportsSeals('Santa Isabel')).toBe(true);
    expect(supportsSeals('Unimarc')).toBe(true);
    // Sus fuentes actuales no exponen sellos; ver docs y el issue 95.
    expect(supportsSeals('Lider')).toBe(false);
    expect(supportsSeals('aCuenta')).toBe(false);
  });

  it('descarta el conteo que Unimarc antepone y deja solo las advertencias', () => {
    expect(cleanSeals(['Tres sellos', 'Alto en Grasas Saturadas', 'Alto en Calorías', 'Alto en Azúcares']))
      .toEqual(['Alto en Grasas Saturadas', 'Alto en Calorías', 'Alto en Azúcares']);
  });

  it('tolera un producto sin sellos y uno con la especificacion ausente', () => {
    expect(cleanSeals([])).toEqual([]);
    expect(cleanSeals(undefined)).toEqual([]);
    expect(cleanSeals('Alto en Azúcares')).toEqual([]);
  });

  it('no repite un sello que la tienda mande dos veces', () => {
    expect(cleanSeals(['Alto en Sodio', 'Alto en Sodio'])).toEqual(['Alto en Sodio']);
  });

  it('pide todos los sku en una sola consulta y los devuelve por sku', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([
      vtexProduct('1868', 'Flag Nutricional', ['Alto en Azúcares', 'Alto en Calorías']),
      vtexProduct('112556', 'Flag Nutricional', []),
    ]), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchSealsBySku('Jumbo', ['1868', '112556']);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('fq=skuId:1868');
    expect(url).toContain('fq=skuId:112556');
    expect(result).toEqual({
      1868: ['Alto en Azúcares', 'Alto en Calorías'],
      112556: [],
    });
  });

  it('lee el campo propio de Unimarc', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([
      vtexProduct('999', 'Sellos', ['Un sello', 'Alto en Sodio']),
    ]), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    expect(await fetchSealsBySku('Unimarc', ['999'])).toEqual({ 999: ['Alto en Sodio'] });
  });

  it('devuelve vacio sin consultar cuando la cadena no publica sellos', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(await fetchSealsBySku('Lider', ['123'])).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('no rompe la comparacion cuando la tienda falla', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('sin red'); }));

    expect(await fetchSealsBySku('Jumbo', ['1868'])).toEqual({});
  });
});
