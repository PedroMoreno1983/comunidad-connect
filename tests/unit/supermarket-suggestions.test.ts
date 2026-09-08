import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rows: [] as Array<{ term: string; products: number }>,
  error: null as { message: string } | null,
  reads: 0,
}));

vi.mock('@/lib/supabase/supabaseAdmin', () => ({
  getSupabaseAdmin: () => ({
    from: () => {
      const chain = {
        select: () => chain,
        order: () => chain,
        limit: async () => {
          mocks.reads += 1;
          return { data: mocks.rows, error: mocks.error };
        },
      };
      return chain;
    },
  }),
}));

import {
  resetVocabularyCache,
  reviewShoppingTerms,
  suggestShoppingTerms,
} from '@/lib/supermarketSuggestions';

const CATALOGO = [
  { term: 'leche', products: 1487 },
  { term: 'leche polvo', products: 190 },
  { term: 'leche descremada', products: 120 },
  { term: 'leche colun', products: 26 },
  { term: 'papel', products: 182 },
  { term: 'papel higienico', products: 152 },
  { term: 'papel aluminio', products: 12 },
  { term: 'detergente', products: 298 },
  { term: 'detergente liquido', products: 176 },
  { term: 'arroz', products: 88 },
  { term: 'aceite', products: 70 },
];

describe('sugerencias de la lista de compras', () => {
  beforeEach(() => {
    resetVocabularyCache();
    mocks.rows = CATALOGO;
    mocks.error = null;
    mocks.reads = 0;
  });

  it('propone primero lo que empieza con lo escrito y luego lo mas surtido', async () => {
    const suggestions = await suggestShoppingTerms('lech');
    expect(suggestions.map(item => item.term)).toEqual([
      'leche', 'leche polvo', 'leche descremada', 'leche colun',
    ]);
  });

  it('tambien encuentra el termino en medio del nombre', async () => {
    expect((await suggestShoppingTerms('higien')).map(item => item.term)).toEqual(['papel higienico']);
  });

  it('no propone nada con una sola letra', async () => {
    expect(await suggestShoppingTerms('l')).toEqual([]);
  });

  it('lee el vocabulario una sola vez y lo reutiliza', async () => {
    await suggestShoppingTerms('lech');
    await suggestShoppingTerms('papel');
    await reviewShoppingTerms(['arroz']);
    expect(mocks.reads).toBe(1);
  });
});

describe('revision de la lista de compras', () => {
  beforeEach(() => {
    resetVocabularyCache();
    mocks.rows = CATALOGO;
    mocks.error = null;
    mocks.reads = 0;
  });

  it('da por bueno un termino del catalogo', async () => {
    const [review] = await reviewShoppingTerms(['leche']);
    expect(review.status).toBe('ok');
    expect(review.suggestions).toEqual([]);
  });

  it('da por bueno un termino mas preciso que el del catalogo', async () => {
    // "leche descremada" existe; agregarle la marca lo afina, no lo rompe.
    expect((await reviewShoppingTerms(['leche descremada colun']))[0].status).toBe('ok');
  });

  it('corrige una transposicion, que es donde fallan los trigramas', async () => {
    const [review] = await reviewShoppingTerms(['lehce']);
    expect(review.status).toBe('unknown');
    expect(review.suggestions[0].term).toBe('leche');
  });

  it('corrige una letra faltante', async () => {
    expect((await reviewShoppingTerms(['detergnte']))[0].suggestions[0].term).toBe('detergente');
  });

  it('corrige una palabra mal escrita aunque la primera este bien', async () => {
    // Sin revisar palabra por palabra esto pasaba como bueno: empieza por
    // "papel", que existe, y habria buscado cualquier papel.
    const [review] = await reviewShoppingTerms(['papel hgienico']);
    expect(review.status).toBe('unknown');
    expect(review.suggestions[0].term).toBe('papel higienico');
  });

  it('no inventa una correccion cuando no se parece a nada', async () => {
    const [review] = await reviewShoppingTerms(['xyzabc']);
    expect(review.status).toBe('unknown');
    expect(review.suggestions).toEqual([]);
  });

  it('exige mas parecido en las palabras cortas', async () => {
    // Con el mismo margen que una palabra larga, "pan" se corregiria a "papel".
    const [review] = await reviewShoppingTerms(['pon']);
    expect(review.suggestions.map(item => item.term)).not.toContain('papel');
  });

  it('marca no verificado, no erroneo, cuando el vocabulario no responde', async () => {
    mocks.rows = [];
    mocks.error = { message: 'sin conexion' };
    resetVocabularyCache();

    const [review] = await reviewShoppingTerms(['leche']);
    // Que la consulta falle es problema nuestro; no se le achaca a la persona.
    expect(review.status).toBe('unverified');
    expect(review.suggestions).toEqual([]);
  });
});
