import { describe, expect, it } from 'vitest';
import { liveGapSearchPairs, mergeMissingStoreRows } from '@/lib/supermarketCatalogGaps';

function row(store: string, name: string) {
  return { store, name, price: 1000 };
}

describe('catalog store gaps', () => {
  it('keeps fresh hits and only fills stores that still have none', () => {
    const merged = mergeMissingStoreRows({
      'yogurt protein': [row('Santa Isabel', 'Yogurt Protein Soprole 155 g')],
    }, {
      'yogurt protein': [
        row('Santa Isabel', 'Yogurt Protein viejo'),
        row('Jumbo', 'Yoghurt Protein Soprole 155 g'),
      ],
    });

    expect(merged['yogurt protein'].map(item => item.store)).toEqual(['Santa Isabel', 'Jumbo']);
    expect(merged['yogurt protein'][0].name).toBe('Yogurt Protein Soprole 155 g');
  });

  it('asks Jumbo live only for terms other stores already resolved', () => {
    const rowsByTerm = {
      'yogurth colun': [row('Santa Isabel', 'Yoghurt Colun 1 kg')],
      'pan ayuyitas': [row('Santa Isabel', 'Hallulla 1 kg')],
      'haiti moka': [],
    };
    const pairs = liveGapSearchPairs(
      rowsByTerm,
      ['yogurth colun', 'pan ayuyitas', 'haiti moka'],
      ['Jumbo', 'Santa Isabel'],
      12,
    );

    expect(pairs).toEqual([
      { store: 'Jumbo', term: 'yogurth colun' },
      { store: 'Jumbo', term: 'pan ayuyitas' },
    ]);
  });
});
