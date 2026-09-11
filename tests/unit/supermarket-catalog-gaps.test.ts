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

  it('refreshes Lider rows that cannot build the official app link', () => {
    const rowsByTerm = {
      leche: [
        row('Lider', 'Leche sin offerId'),
        row('Jumbo', 'Leche entera 1 L'),
      ],
    };

    expect(liveGapSearchPairs(rowsByTerm, ['leche'], ['Lider'], 12)).toEqual([
      { store: 'Lider', term: 'leche' },
    ]);

    const merged = mergeMissingStoreRows(rowsByTerm, {
      leche: [{
        ...row('Lider', 'Leche entera 1 L'),
        sku: '00780292000009',
        offer_id: '5105',
      }],
    });
    expect(merged.leche).toHaveLength(3);
  });
});
