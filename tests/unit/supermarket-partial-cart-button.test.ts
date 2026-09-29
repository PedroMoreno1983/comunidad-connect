import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RemoteCartButton } from '@/components/resident/supermarket/RemoteCartButton';
import type { SupermarketSearchCandidate } from '@/lib/types';

const item: SupermarketSearchCandidate = {
  id: 'milk', name: 'Leche entera 1 L', requestedTerm: 'leche entera',
  requestedQuantity: 1, quantity: 1, packUnits: 1, suppliedQuantity: 1,
  price: 1000, lineTotal: 1000, store: 'Lider', sku: 'sku', offerId: 'offer',
};

describe('partial supermarket cart', () => {
  it('lets the buyer open available products in Lider', () => {
    const html = renderToStaticMarkup(createElement(RemoteCartButton, {
      store: 'Lider', items: [item], complete: false,
    }));
    expect(html).toContain('Abrir 1 producto disponible en Lider');
    expect(html).not.toMatch(/\sdisabled(?:=|>)/);
  });

  it('does not offer an empty cart handoff', () => {
    const html = renderToStaticMarkup(createElement(RemoteCartButton, {
      store: 'Lider', items: [], complete: false,
    }));
    expect(html).toMatch(/\sdisabled(?:=|>)/);
  });
});
