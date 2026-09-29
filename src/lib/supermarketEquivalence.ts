import { foldAccents, matchAnchor, significantWords } from '@/lib/supermarketText';
import { parseGroupShoppingList } from '@/lib/supermarketGroupDomain';
import type { SupermarketCatalogProduct, SupermarketSearchCandidate } from '@/lib/types';

const OWN_BRANDS = new Set(['lider', 'jumbo', 'santa isabel', 'unimarc', 'acuenta']);
const FORMAT_WORDS = new Set(['caja', 'botella', 'bolsa', 'paquete', 'pack', 'unidad', 'unidades', 'natural']);
const IMPORTANT_GROUPS = [
  ['entera', 'entero', 'semidescremada', 'semidescremado', 'descremada', 'descremado'],
  ['sin lactosa', 'deslactosada', 'deslactosado'],
  ['sin azucar', 'light', 'diet', 'zero'],
  ['chocolate', 'frutilla', 'vainilla', 'platano'],
  ['integral', 'blanco'],
  ['con sal', 'sin sal'],
];

function normalized(value: string) {
  return foldAccents(value).replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function measurement(name: string): string | null {
  const match = normalized(name).match(/\b(\d+(?:[.,]\d+)?)\s*(kg|gr|g|lt|l|ml|cc|un|unidades?)\b/);
  if (!match) return null;
  const amount = Number(match[1].replace(',', '.'));
  const unit = match[2];
  if (['kg', 'g', 'gr'].includes(unit)) return `mass:${amount * (unit === 'kg' ? 1000 : 1)}`;
  if (['l', 'lt', 'ml', 'cc'].includes(unit)) return `volume:${amount * (unit === 'l' || unit === 'lt' ? 1000 : 1)}`;
  return `count:${amount}`;
}

function descriptor(product: { name: string; brand?: string }) {
  const name = normalized(product.name);
  const brand = normalized(product.brand || '');
  const withoutBrand = brand ? name.replace(new RegExp(`\\b${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), ' ') : name;
  return significantWords(withoutBrand).filter(word => !FORMAT_WORDS.has(word) && !/^\d+$/.test(word));
}

export function comparisonTerm(product: { name: string; brand?: string }): string {
  const brand = normalized(product.brand || '');
  const name = normalized(product.name);
  const unbranded = brand && name.includes(brand) ? name.replace(brand, ' ').replace(/\s+/g, ' ').trim() : name;
  return parseGroupShoppingList(unbranded)[0]?.term ?? unbranded;
}

/** A cross-store result is a possible substitute only when its declared attributes agree. */
export function comparableProduct(
  source: SupermarketCatalogProduct,
  candidate: SupermarketSearchCandidate,
): 'same_brand' | 'equivalent' | null {
  if (matchAnchor(comparisonTerm(source)) !== matchAnchor(comparisonTerm(candidate))) return null;
  const sourceMeasure = measurement(source.name);
  const candidateMeasure = measurement(candidate.name);
  if (sourceMeasure !== candidateMeasure) return null;
  if (!sourceMeasure && (!source.salesUnit || source.salesUnit !== candidate.salesUnit)) return null;
  const sourceName = normalized(source.name);
  const candidateName = normalized(candidate.name);
  for (const group of IMPORTANT_GROUPS) {
    const sourceValues = group.filter(word => sourceName.includes(word));
    const candidateValues = group.filter(word => candidateName.includes(word));
    if (sourceValues.join('|') !== candidateValues.join('|')) return null;
  }
  const sourceWords = descriptor(source);
  const candidateWords = new Set(descriptor(candidate));
  if (sourceWords.length === 0 || !sourceWords.every(word => candidateWords.has(word))) return null;
  const sourceBrand = normalized(source.brand);
  const candidateBrand = normalized(candidate.brand || '');
  if (sourceBrand && sourceBrand === candidateBrand && !OWN_BRANDS.has(sourceBrand)) return 'same_brand';
  return 'equivalent';
}
