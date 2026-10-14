import { describe, expect, it } from 'vitest';
import {
  applyCombinedVolumePromos,
  buildBasketComparison,
  readVolumePromo,
  volumePromoLineTotal,
} from '@/lib/supermarketBasket';
import { rankPurchases } from '@/lib/supermarketPurchaseRank';
import { toSupermarketShoppingItem } from '@/lib/supermarketResultItem';

const SEEN_AT = '2026-10-13T07:00:00.000Z';
const CHECKED_AT = '2026-10-13T07:00:00.000Z';

type PromoInput = { min: number; total: number; label: string; group?: string };

function row(
  store: string,
  name: string,
  price: number,
  promo?: PromoInput | null,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: `${store}-${name}`,
    store,
    name,
    brand: 'Marca',
    price,
    list_price: null,
    in_stock: true,
    last_seen_at: SEEN_AT,
    channel_type: store === 'aCuenta' ? 'wholesale' : 'retail',
    pack_units: 1,
    minimum_packs: 1,
    sku: `${store}-${name}`.replace(/\W+/g, '-'),
    offer_id: store === 'Lider' ? 'offer-1' : null,
    match_relevance: 3,
  };
  // promo === undefined: el scraper nunca revisó el badge (columnas vacías).
  if (promo === undefined) return base;
  return {
    ...base,
    promo_min_qty: promo?.min ?? null,
    promo_total_price: promo?.total ?? null,
    promo_label: promo?.label ?? null,
    promo_group: promo?.group ?? null,
    promo_checked_at: CHECKED_AT,
  };
}

const NAMES = {
  atun: 'Atun Lomitos en Agua 160 g',
  yoghurt: 'Yoghurt Batido Frutilla 120 g',
  arroz: 'Arroz Grado 1 1 kg',
  fideos: 'Fideos Spaghetti 400 g',
  galletas: 'Galletas de Agua 210 g',
  cerveza: 'Cerveza Lager Lata 470 ml',
} as const;
const TERMS = Object.keys(NAMES) as (keyof typeof NAMES)[];
const QUANTITIES = { atun: 4, yoghurt: 4 };

/**
 * Canasta del issue #96: 6 productos, mismos montos que la comparación y el
 * carro real. aCuenta tiene "4 X $990" en el atún y un combo de yoghurt; Lider
 * tiene dos "Combina"; Unimarc no tiene promociones capturadas (estimado).
 */
function issueRows(withPromos: boolean) {
  const promo = (value: PromoInput | null) => (withPromos ? value : undefined);
  const acuenta = {
    atun: row('aCuenta', NAMES.atun, 1290, promo({ min: 4, total: 3960, label: '4 X $990' })),
    yoghurt: row('aCuenta', NAMES.yoghurt, 290, promo({ min: 4, total: 1075, label: '4 x $1.075' })),
    arroz: row('aCuenta', NAMES.arroz, 1000, promo(null)),
    fideos: row('aCuenta', NAMES.fideos, 790, promo(null)),
    galletas: row('aCuenta', NAMES.galletas, 590, promo(null)),
    cerveza: row('aCuenta', NAMES.cerveza, 690, promo(null)),
  };
  const unimarc = {
    atun: row('Unimarc', NAMES.atun, 1100),
    yoghurt: row('Unimarc', NAMES.yoghurt, 300),
    arroz: row('Unimarc', NAMES.arroz, 990),
    fideos: row('Unimarc', NAMES.fideos, 600),
    galletas: row('Unimarc', NAMES.galletas, 290),
    cerveza: row('Unimarc', NAMES.cerveza, 333),
  };
  const lider = {
    atun: row('Lider', NAMES.atun, 1500, promo({ min: 4, total: 5645, label: 'Combina 4 x $5.645', group: 'lider:atun' })),
    yoghurt: row('Lider', NAMES.yoghurt, 690, promo({ min: 4, total: 2390, label: 'Combina 4 x $2.390', group: 'lider:yog' })),
    arroz: row('Lider', NAMES.arroz, 400, promo(null)),
    fideos: row('Lider', NAMES.fideos, 300, promo(null)),
    galletas: row('Lider', NAMES.galletas, 240, promo(null)),
    cerveza: row('Lider', NAMES.cerveza, 200, promo(null)),
  };
  return Object.fromEntries(TERMS.map(term => [term, [acuenta[term], unimarc[term], lider[term]]]));
}

const UNIMARC_REAL_CART = { Unimarc: { supported: true, complete: true, total: 8380 } };

describe('volumePromoLineTotal', () => {
  const promo = { minQuantity: 4, totalPrice: 3960 };

  it('combina bloques de promoción con el resto a precio normal', () => {
    expect(volumePromoLineTotal(1290, 4, promo)).toBe(3960);
    expect(volumePromoLineTotal(1290, 5, promo)).toBe(3960 + 1290);
    expect(volumePromoLineTotal(1290, 9, promo)).toBe(2 * 3960 + 1290);
  });

  it('no aplica la promoción si la cantidad no alcanza', () => {
    expect(volumePromoLineTotal(1290, 3, promo)).toBe(3870);
    expect(volumePromoLineTotal(1290, 3)).toBe(3870);
  });

  it('nunca cobra más que el precio unitario por la cantidad', () => {
    expect(volumePromoLineTotal(900, 4, promo)).toBe(3600);
  });
});

describe('readVolumePromo', () => {
  it('lee la promoción revisada en la misma pasada que el precio', () => {
    expect(readVolumePromo(row('Lider', 'X', 690, { min: 4, total: 2390, label: 'Combina 4 x $2.390', group: 'g' }), 690))
      .toEqual({ checked: true, promo: { minQuantity: 4, totalPrice: 2390, label: 'Combina 4 x $2.390', group: 'g' } });
  });

  it('sin revisión del badge el total queda como estimado', () => {
    expect(readVolumePromo(row('Lider', 'X', 690), 690)).toEqual({ checked: false });
  });

  it('una revisión vieja frente al precio vigente no cuenta', () => {
    const stale = { ...row('Lider', 'X', 690, { min: 4, total: 2390, label: 'x' }), promo_checked_at: '2026-10-10T07:00:00.000Z' };
    expect(readVolumePromo(stale, 690)).toEqual({ checked: false });
  });

  it('descarta una promoción que ya no abarata', () => {
    expect(readVolumePromo(row('Lider', 'X', 500, { min: 4, total: 2390, label: 'x' }), 500)).toEqual({ checked: true });
  });
});

describe('applyCombinedVolumePromos', () => {
  it('suma productos distintos del mismo "Combina" para completar el bloque', () => {
    const promo = { minQuantity: 4, totalPrice: 5990, group: 'lider:cerveza' };
    const items = applyCombinedVolumePromos([
      { price: 1890, quantity: 2, lineTotal: 3780, volumePromo: promo },
      { price: 1690, quantity: 3, lineTotal: 5070, volumePromo: promo },
    ]);
    // 5 unidades: un bloque de 4 a $5.990 y la unidad más cara a precio normal.
    expect(items[0].lineTotal + items[1].lineTotal).toBe(5990 + 1890);
    expect(items.every(item => (item.promoSavings ?? 0) >= 0)).toBe(true);
  });

  it('no toca líneas sin grupo ni grupos que no completan un bloque', () => {
    const promo = { minQuantity: 4, totalPrice: 5990, group: 'g' };
    const input = [
      { price: 1890, quantity: 1, lineTotal: 1890, volumePromo: promo },
      { price: 1890, quantity: 2, lineTotal: 3780, volumePromo: promo },
      { price: 500, quantity: 4, lineTotal: 2000 },
    ];
    expect(applyCombinedVolumePromos(input)).toEqual(input);
  });
});

describe('issue #96: aCuenta, Unimarc y Lider', () => {
  it('sin promociones reproduce el orden invertido de la comparación', () => {
    const comparison = buildBasketComparison(TERMS, issueRows(false), QUANTITIES);
    const subtotal = (store: string) => comparison.comparisons.find(basket => basket.store === store)?.subtotal;
    expect(subtotal('aCuenta')).toBe(9390);
    expect(subtotal('Unimarc')).toBe(7813);
    expect(subtotal('Lider')).toBe(9900);
    expect(comparison.comparisons.find(basket => basket.store === 'aCuenta')?.pricingBasis).toBe('unit_price');

    const ranking = rankPurchases(comparison.comparisons, UNIMARC_REAL_CART);
    // Estimados sin promociones no compiten contra un total publicado.
    expect(ranking.winnerStore).toBe('Unimarc');
    expect(ranking.excludedEstimates.sort()).toEqual(['Lider', 'aCuenta']);
  });

  it('con promociones por volumen aCuenta queda primera, como en el carro real', () => {
    const comparison = buildBasketComparison(TERMS, issueRows(true), QUANTITIES);
    const basket = (store: string) => comparison.comparisons.find(entry => entry.store === store);
    expect(basket('aCuenta')).toMatchObject({ subtotal: 8105, pricingBasis: 'promo_aware', promoSavings: 1285 });
    expect(basket('Lider')).toMatchObject({ subtotal: 9175, pricingBasis: 'promo_aware', promoSavings: 725 });
    expect(basket('Unimarc')).toMatchObject({ subtotal: 7813, pricingBasis: 'unit_price', promoSavings: 0 });

    const ranking = rankPurchases(comparison.comparisons, UNIMARC_REAL_CART);
    expect(ranking.basis).toBe('mixed');
    expect(ranking.winnerStore).toBe('aCuenta');
    expect(ranking.runnerUpStore).toBe('Unimarc');
    expect(ranking.savings).toBe(275);
    expect(ranking.excludedEstimates).toEqual([]);
    expect(ranking.standings.slice(0, 3).map(row => row.store)).toEqual(['aCuenta', 'Unimarc', 'Lider']);
  });

  it('bajo el pedido mínimo aCuenta se marca y deja de ganar', () => {
    const comparison = buildBasketComparison(
      TERMS,
      issueRows(true),
      QUANTITIES,
      {},
      [{ store: 'aCuenta', minimumOrder: 25000 }],
    );
    const acuenta = comparison.comparisons.find(entry => entry.store === 'aCuenta');
    expect(acuenta).toMatchObject({ belowMinimum: true, minimumOrder: 25000, shortfall: 16895 });
    // Entre canastas completas, la que no se puede cursar queda detrás.
    expect(comparison.recommended?.store).not.toBe('aCuenta');

    const ranking = rankPurchases(comparison.comparisons, UNIMARC_REAL_CART);
    expect(ranking.winnerStore).toBe('Unimarc');
    expect(ranking.runnerUpStore).toBe('Lider');
    expect(ranking.standings.find(row => row.store === 'aCuenta')).toMatchObject({
      kind: 'estimate',
      payable: false,
      belowMinimum: true,
      shortfall: 16895,
    });
    const order = ranking.standings.map(row => row.store);
    expect(order.indexOf('aCuenta')).toBeGreaterThan(order.indexOf('Lider'));
  });
});

describe('toSupermarketShoppingItem', () => {
  it('conserva el total con promoción calculado por la canasta', () => {
    const item = toSupermarketShoppingItem(
      {
        name: NAMES.atun,
        price: 1290,
        quantity: 4,
        lineTotal: 3960,
        volumePromo: { minQuantity: 4, totalPrice: 3960, label: '4 X $990' },
        promoChecked: true,
      },
      { term: 'atun', quantity: 4 },
      'catalog',
    );
    expect(item.lineTotal).toBe(3960);
    expect(item.promoSavings).toBe(1200);
    expect(item.volumePromo?.label).toBe('4 X $990');
  });

  it('sin promoción mantiene precio por cantidad', () => {
    const item = toSupermarketShoppingItem(
      { name: NAMES.arroz, price: 1000, quantity: 2, lineTotal: 500 },
      { term: 'arroz', quantity: 2 },
      'catalog',
    );
    expect(item.lineTotal).toBe(2000);
    expect(item.promoSavings).toBeUndefined();
  });
});
