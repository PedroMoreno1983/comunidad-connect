import type { CommunityDealKind, CommunityDealOpportunity, CommunityDealPriceUnit } from '@/lib/types';

/**
 * Reglas de los convenios comunitarios que comparten la app y CoCo.
 * Sin acceso a datos: reciben lo leído y devuelven cálculos.
 */

export const DEAL_KIND_LABEL: Record<CommunityDealKind, string> = {
  vendor_visit: 'Feria o proveedor en el edificio',
  bulk_service: 'Servicio para todo el edificio',
  space_income: 'Ingreso por un espacio común',
};

export const DEAL_PRICE_UNIT_LABEL: Record<CommunityDealPriceUnit, string> = {
  unit_month: 'por departamento al mes',
  unit_once: 'por departamento, una vez',
  community_month: 'total para la comunidad al mes',
  discount_percent: '% de descuento',
};

/**
 * Ahorro mensual de la comunidad. Por departamento: diferencia × interesados.
 * Total de la comunidad: la diferencia directa. Descuentos porcentuales y pagos
 * únicos no tienen un ahorro mensual que se pueda afirmar: null.
 */
export function dealMonthlySavings(input: {
  referencePrice: number | null;
  dealPrice: number | null;
  priceUnit: CommunityDealPriceUnit;
  interestedCount: number;
}): number | null {
  const { referencePrice, dealPrice, priceUnit, interestedCount } = input;
  if (referencePrice === null || dealPrice === null) return null;
  const difference = Math.max(0, referencePrice - dealPrice);
  if (priceUnit === 'unit_month') return difference * Math.max(0, interestedCount);
  if (priceUnit === 'community_month') return difference;
  return null;
}

type Source = 'cases' | 'purchases';

interface Theme {
  theme: string;
  pattern: RegExp;
  /** De dónde se lee: "agua" en un reclamo suele ser una filtración, no un bidón. */
  source: Source;
  kind: CommunityDealKind;
  title: string;
  why: string;
}

const THEMES: Theme[] = [
  {
    theme: 'internet',
    pattern: /\b(internet|wi-?fi|fibra|se[ñn]al|conexi[oó]n)\b/i,
    source: 'cases',
    kind: 'bulk_service',
    title: 'Internet para todo el edificio',
    why: 'Varios vecinos reportan problemas de internet. Un contrato para el edificio suele salir más barato y con mejor servicio que uno por departamento.',
  },
  {
    theme: 'agua',
    pattern: /\b(bid[oó]n(es)?|agua\s+(purificada|embotellada|20\s*l))\b/i,
    source: 'purchases',
    kind: 'vendor_visit',
    title: 'Reparto de agua en bidones con precio de comunidad',
    why: 'Varios vecinos compran agua en bidón. Un proveedor que reparte el mismo día a todo el edificio puede bajar el precio.',
  },
  {
    theme: 'gas',
    pattern: /\b(gas|cil[ií]ndro|bal[oó]n)\b/i,
    source: 'purchases',
    kind: 'vendor_visit',
    title: 'Gas licuado con precio de comunidad',
    why: 'Varios vecinos piden gas. Un distribuidor con día fijo en el edificio suele dar precio preferente.',
  },
  {
    theme: 'feria',
    pattern: /\b(fruta|verdura|tomate|palta|lechuga|papa|cebolla|huevo)s?\b/i,
    source: 'purchases',
    kind: 'vendor_visit',
    title: 'Feria en el edificio una vez por semana',
    why: 'Las frutas, verduras y huevos se repiten en las compras. Una feria que use un espacio común un día fijo, a cambio de precios preferentes, le sirve a todos.',
  },
  {
    theme: 'plagas',
    pattern: /\b(plaga|cucaracha|rat[oó]n|ratones|chinche|termita|fumigaci[oó]n)\w*/i,
    source: 'cases',
    kind: 'bulk_service',
    title: 'Fumigación de todo el edificio',
    why: 'Hay reportes de plagas en distintas unidades. Fumigar el edificio completo sale más barato y evita que se trasladen.',
  },
];

/** Mínimo de hogares distintos para que valga la pena proponer el convenio. */
export const MIN_HOUSEHOLDS_FOR_DEAL = 3;

export function detectDealOpportunities(input: {
  cases: Array<{ userId: string; text: string }>;
  groupItems: Array<{ userId: string; term: string }>;
  existingTitles: string[];
}): CommunityDealOpportunity[] {
  const found: CommunityDealOpportunity[] = [];
  for (const theme of THEMES) {
    if (input.existingTitles.some(title => theme.pattern.test(title))) continue;
    const rows = theme.source === 'cases'
      ? input.cases.map(row => ({ userId: row.userId, text: row.text }))
      : input.groupItems.map(row => ({ userId: row.userId, text: row.term }));
    const households = new Set(rows.filter(row => row.userId && theme.pattern.test(row.text)).map(row => row.userId));
    if (households.size < MIN_HOUSEHOLDS_FOR_DEAL) continue;
    found.push({
      theme: theme.theme,
      kind: theme.kind,
      title: theme.title,
      why: theme.why,
      households: households.size,
      source: theme.source,
    });
  }
  return found.sort((left, right) => right.households - left.households);
}
