/**
 * Ordena canastas con el total que la tienda publica cuando existe.
 * Lider y aCuenta no tienen esa consulta: su monto sigue siendo el de catálogo
 * y no se declara ganador contra un total publicado.
 */

export const PUBLISHED_TOTAL_STORES = ['Jumbo', 'Santa Isabel', 'Unimarc'] as const;

export function publishesBasketTotal(store: string): boolean {
  return (PUBLISHED_TOTAL_STORES as readonly string[]).includes(store);
}

export interface BasketRankInput {
  store: string;
  subtotal: number;
  complete: boolean;
  coveredCount: number;
}

export interface PublishedBasketTotal {
  supported: boolean;
  complete?: boolean;
  total?: number;
  minimumOrder?: number;
}

export interface BasketStanding {
  store: string;
  amount: number;
  kind: 'published' | 'estimate' | 'pending' | 'unverified';
  payable: boolean;
  belowMinimum: boolean;
  minimumOrder?: number;
  shortfall?: number;
}

export interface PurchaseRanking {
  standings: BasketStanding[];
  winnerStore: string | null;
  runnerUpStore: string | null;
  savings: number;
  basis: 'published' | 'estimate' | 'mixed' | 'none';
}

function publishedAmount(quote: PublishedBasketTotal | undefined): { total: number; minimumOrder?: number } | null {
  if (!quote?.supported || quote.complete !== true || typeof quote.total !== 'number' || !Number.isFinite(quote.total) || quote.total < 0) {
    return null;
  }
  const minimumOrder = typeof quote.minimumOrder === 'number' && Number.isFinite(quote.minimumOrder) && quote.minimumOrder > 0
    ? quote.minimumOrder
    : undefined;
  return { total: quote.total, minimumOrder };
}

export function rankPurchases(
  baskets: BasketRankInput[],
  quotes: Record<string, PublishedBasketTotal | undefined>,
): PurchaseRanking {
  const standings: BasketStanding[] = baskets.map(basket => {
    if (!basket.complete || basket.coveredCount <= 0) {
      return { store: basket.store, amount: basket.subtotal, kind: 'estimate', payable: false, belowMinimum: false };
    }
    if (!publishesBasketTotal(basket.store)) {
      return { store: basket.store, amount: basket.subtotal, kind: 'estimate', payable: true, belowMinimum: false };
    }
    const quote = quotes[basket.store];
    if (!quote) {
      return { store: basket.store, amount: basket.subtotal, kind: 'pending', payable: false, belowMinimum: false };
    }
    const published = publishedAmount(quote);
    if (!published) {
      return { store: basket.store, amount: basket.subtotal, kind: 'unverified', payable: false, belowMinimum: false };
    }
    const belowMinimum = published.minimumOrder !== undefined && published.total + 0.5 < published.minimumOrder;
    return {
      store: basket.store,
      amount: published.total,
      kind: 'published',
      payable: !belowMinimum,
      belowMinimum,
      minimumOrder: published.minimumOrder,
      shortfall: belowMinimum && published.minimumOrder !== undefined
        ? published.minimumOrder - published.total
        : undefined,
    };
  });

  const pending = standings.some(row => row.kind === 'pending');
  const payable = standings.filter(row => row.payable);
  const published = payable.filter(row => row.kind === 'published').sort((left, right) => left.amount - right.amount || left.store.localeCompare(right.store));
  const estimates = payable.filter(row => row.kind === 'estimate').sort((left, right) => left.amount - right.amount || left.store.localeCompare(right.store));

  let pool: BasketStanding[] = [];
  let basis: PurchaseRanking['basis'] = 'none';
  if (!pending && published.length > 0 && estimates.length > 0) {
    basis = 'mixed';
    pool = published;
  } else if (!pending && published.length > 0) {
    basis = 'published';
    pool = published;
  } else if (!pending && estimates.length > 0) {
    basis = 'estimate';
    pool = estimates;
  }

  const winner = pool[0];
  const runnerUp = pool[1];
  const ordered = [...standings].sort((left, right) => {
    const group = (row: BasketStanding) => (row.payable ? 0 : row.belowMinimum ? 1 : 2);
    return group(left) - group(right) || left.amount - right.amount || left.store.localeCompare(right.store);
  });

  return {
    standings: ordered,
    winnerStore: winner?.store ?? null,
    runnerUpStore: runnerUp?.store ?? null,
    savings: winner && runnerUp ? Math.max(0, runnerUp.amount - winner.amount) : 0,
    basis,
  };
}
