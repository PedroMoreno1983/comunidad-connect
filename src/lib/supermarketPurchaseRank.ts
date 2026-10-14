/**
 * Ordena canastas con el total que la tienda publica cuando existe.
 * Lider y aCuenta no tienen esa consulta: su monto es el de catálogo.
 *
 * Issue #96: un total de catálogo que ya incluye las promociones por volumen
 * (`pricingBasis: 'promo_aware'`) compite contra los totales publicados. Uno
 * estimado sobre precio unitario sigue sin declararse ganador contra ellos.
 * Una canasta bajo el pedido mínimo, publicado o conocido por catálogo, no se
 * recomienda: se muestra, pero no gana.
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
  /** `promo_aware` si el subtotal ya incluye promociones por volumen. */
  pricingBasis?: 'promo_aware' | 'unit_price';
  /** Pedido mínimo conocido por catálogo (supermarket_store_policies). */
  minimumOrder?: number;
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
  /** El monto incluye promociones por volumen (total publicado o catálogo con promos). */
  promoAware: boolean;
}

export interface PurchaseRanking {
  standings: BasketStanding[];
  winnerStore: string | null;
  runnerUpStore: string | null;
  savings: number;
  basis: 'published' | 'estimate' | 'mixed' | 'none';
  /**
   * Tiendas completas y pagables que quedaron fuera de la comparación contra
   * totales publicados porque su monto es estimado sin promociones.
   */
  excludedEstimates: string[];
}

function validMinimum(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function minimumStatus(amount: number, minimumOrder: number | undefined) {
  const belowMinimum = minimumOrder !== undefined && amount + 0.5 < minimumOrder;
  return {
    belowMinimum,
    minimumOrder,
    shortfall: belowMinimum && minimumOrder !== undefined ? minimumOrder - amount : undefined,
  };
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
    const catalogMinimum = validMinimum(basket.minimumOrder);
    const promoAware = basket.pricingBasis === 'promo_aware';
    if (!basket.complete || basket.coveredCount <= 0) {
      return { store: basket.store, amount: basket.subtotal, kind: 'estimate', payable: false, belowMinimum: false, promoAware };
    }
    if (!publishesBasketTotal(basket.store)) {
      const minimum = minimumStatus(basket.subtotal, catalogMinimum);
      return {
        store: basket.store,
        amount: basket.subtotal,
        kind: 'estimate',
        payable: !minimum.belowMinimum,
        ...minimum,
        promoAware,
      };
    }
    const quote = quotes[basket.store];
    if (!quote) {
      return { store: basket.store, amount: basket.subtotal, kind: 'pending', payable: false, belowMinimum: false, promoAware };
    }
    const published = publishedAmount(quote);
    if (!published) {
      return { store: basket.store, amount: basket.subtotal, kind: 'unverified', payable: false, belowMinimum: false, promoAware };
    }
    const minimum = minimumStatus(published.total, published.minimumOrder ?? catalogMinimum);
    return {
      store: basket.store,
      amount: published.total,
      kind: 'published',
      payable: !minimum.belowMinimum,
      ...minimum,
      promoAware: true,
    };
  });

  const byAmount = (left: BasketStanding, right: BasketStanding) => left.amount - right.amount || left.store.localeCompare(right.store);
  const pending = standings.some(row => row.kind === 'pending');
  const payable = standings.filter(row => row.payable);
  const published = payable.filter(row => row.kind === 'published').sort(byAmount);
  const estimates = payable.filter(row => row.kind === 'estimate').sort(byAmount);
  const promoAwareEstimates = estimates.filter(row => row.promoAware);

  let pool: BasketStanding[] = [];
  let basis: PurchaseRanking['basis'] = 'none';
  let excludedEstimates: string[] = [];
  if (!pending && published.length > 0 && estimates.length > 0) {
    basis = 'mixed';
    pool = [...published, ...promoAwareEstimates].sort(byAmount);
    excludedEstimates = estimates.filter(row => !row.promoAware).map(row => row.store);
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
    excludedEstimates,
  };
}
