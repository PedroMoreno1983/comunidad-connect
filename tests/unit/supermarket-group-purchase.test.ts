import { describe, expect, it } from 'vitest';
import {
  allocateGroupCosts,
  groupItemsForCart,
  groupOrderStillActive,
  scaleAllocationToTotal,
} from '@/lib/supermarketGroupDomain';
import type { SupermarketGroupComparisonItem } from '@/lib/types';

describe('compra comunitaria: del carro a la boleta', () => {
  it('reparte lo pagado en la boleta en proporción a lo que pidió cada uno, sin perder pesos', () => {
    const estimated = allocateGroupCosts(
      [
        { userId: 'ana', term: 'arroz', quantity: 2 },
        { userId: 'beto', term: 'arroz', quantity: 1 },
        { userId: 'beto', term: 'leche', quantity: 6 },
      ],
      [
        { requestedTerm: 'arroz', lineTotal: 3000 },
        { requestedTerm: 'leche', lineTotal: 6000 },
      ],
      'ana',
    );
    expect(estimated).toEqual({ ana: 2000, beto: 7000 });

    const paid = scaleAllocationToTotal(estimated, 9901);
    expect(paid.ana + paid.beto).toBe(9901);
    expect(paid.ana).toBe(2200);
    expect(paid.beto).toBe(7701);
  });

  it('el redondeo es estable y suma exactamente el total aunque sea impar', () => {
    const paid = scaleAllocationToTotal({ a: 1, b: 1, c: 1 }, 100);
    expect(Object.values(paid).reduce((sum, value) => sum + value, 0)).toBe(100);
    expect(paid).toEqual({ a: 34, b: 33, c: 33 });
  });

  it('no inventa parte para quien no pidió nada', () => {
    expect(scaleAllocationToTotal({ ana: 0, beto: 500 }, 800)).toEqual({ ana: 0, beto: 800 });
    expect(scaleAllocationToTotal({}, 800)).toEqual({});
  });

  it('pasa la canasta cerrada al formato del carro individual, con sku y offerId', () => {
    const items: SupermarketGroupComparisonItem[] = [{
      requestedTerm: 'arroz', requestedQuantity: 3, name: 'Arroz Grado 2 1 kg', store: 'Lider',
      price: 1090, quantity: 3, packUnits: 1, suppliedQuantity: 3, lineTotal: 3270,
      productUrl: 'https://super.lider.cl/ip/arroz/00780000000001',
      sku: '00780000000001', offerId: '821920', salesUnit: 'EACH',
    }];
    const [cart] = groupItemsForCart(items);
    expect(cart).toMatchObject({
      id: '00780000000001', name: 'Arroz Grado 2 1 kg', quantity: 3, sku: '00780000000001',
      offerId: '821920', salesUnit: 'EACH', store: 'Lider', lineTotal: 3270,
    });
  });

  it('una compra pagada sigue a la vista mientras alguien deba su parte', () => {
    const pending = { status: 'completed', settlements: [
      { isOrganizer: true, paidAt: null, amount: 3000 },
      { isOrganizer: false, paidAt: null, amount: 2000 },
    ] };
    expect(groupOrderStillActive(pending)).toBe(true);
    expect(groupOrderStillActive({ ...pending, settlements: [
      { isOrganizer: true, paidAt: null, amount: 3000 },
      { isOrganizer: false, paidAt: '2026-11-10T12:00:00Z', amount: 2000 },
    ] })).toBe(false);
    expect(groupOrderStillActive({ status: 'locked', settlements: [] })).toBe(true);
    expect(groupOrderStillActive({ status: 'cancelled', settlements: [] })).toBe(false);
  });
});
