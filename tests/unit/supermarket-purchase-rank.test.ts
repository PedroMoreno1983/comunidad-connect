import { describe, expect, it } from 'vitest';
import { rankPurchases } from '@/lib/supermarketPurchaseRank';

const basket = (store: string, subtotal: number, complete = true) => ({
  store, subtotal, complete, coveredCount: complete ? 2 : 1,
});

describe('rankPurchases', () => {
  it('ordena Jumbo y Unimarc por el total publicado y deja fuera un pedido bajo el mínimo', () => {
    const ranking = rankPurchases(
      [basket('Unimarc', 7813), basket('Jumbo', 9000), basket('aCuenta', 9390)],
      {
        Unimarc: { supported: true, complete: true, total: 8380, minimumOrder: 15000 },
        Jumbo: { supported: true, complete: true, total: 8600 },
      },
    );
    expect(ranking.basis).toBe('mixed');
    expect(ranking.winnerStore).toBe('Jumbo');
    expect(ranking.standings.find(row => row.store === 'Unimarc')).toMatchObject({
      belowMinimum: true,
      payable: false,
      shortfall: 6620,
    });
    expect(ranking.standings.find(row => row.store === 'aCuenta')?.kind).toBe('estimate');
  });

  it('no declara ganador mientras falta el total de una tienda que sí lo publica', () => {
    const ranking = rankPurchases(
      [basket('Jumbo', 9000), basket('Lider', 8000)],
      {},
    );
    expect(ranking.basis).toBe('none');
    expect(ranking.winnerStore).toBeNull();
  });

  it('usa el catálogo cuando ninguna canasta completa publica total', () => {
    const ranking = rankPurchases(
      [basket('Lider', 9900), basket('aCuenta', 8105)],
      {
        Lider: { supported: false },
        aCuenta: { supported: false },
      },
    );
    expect(ranking.basis).toBe('estimate');
    expect(ranking.winnerStore).toBe('aCuenta');
    expect(ranking.savings).toBe(1795);
  });
});
