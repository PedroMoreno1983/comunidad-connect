import { describe, expect, it } from 'vitest';
import { parseGroupShoppingList } from '@/lib/supermarketGroupDomain';
import { isProductSuitableForRequest, matchesRequestedPackageSize } from '@/lib/supermarketBasket';

describe('catalog list package sizes', () => {
  it('keeps the item count separate from the requested package size', () => {
    expect(parseGroupShoppingList('2 leche entera 1 L\n1 arroz 1 kg', true)).toEqual([
      { term: 'leche entera 1 l', quantity: 2, unit: undefined },
      { term: 'arroz 1 kg', quantity: 1, unit: undefined },
    ]);
  });

  it('rejects a smaller pack and accepts an equivalent measurement', () => {
    expect(matchesRequestedPackageSize('Leche Entera Natural 200 ml Soprole', 'leche entera 1 l')).toBe(false);
    expect(matchesRequestedPackageSize('Leche Natural Entera caja 1000 ml Lider', 'leche entera 1 l')).toBe(true);
    expect(matchesRequestedPackageSize('Arroz Preparado Campesino 210 g', 'arroz 1 kg')).toBe(false);
    expect(matchesRequestedPackageSize('Arroz Grado 1 Bolsa 1 kg', 'arroz 1 kg')).toBe(true);
  });

  it('keeps a leading size, and understands kilo, litro and decimals', () => {
    expect(parseGroupShoppingList('500 g mantequilla\n1 L de leche\n2 arroz 1 kilo\nleche 1,5 L\n1 kilo plátanos', true)).toEqual([
      { term: 'mantequilla 500 g', quantity: 1, unit: undefined },
      { term: 'leche 1 l', quantity: 1, unit: undefined },
      { term: 'arroz 1 kg', quantity: 2, unit: undefined },
      { term: 'leche 1500 ml', quantity: 1, unit: undefined },
      { term: 'platanos 1 kg', quantity: 1, unit: undefined },
    ]);
    expect(parseGroupShoppingList('3 kilos de papas\n2 kg tomates', false)).toEqual([
      { term: 'papas', quantity: 3, unit: 'kg' },
      { term: 'tomates', quantity: 2, unit: 'kg' },
    ]);
  });

  it('preserves fractional weights and Chilean names from published lists', () => {
    expect(parseGroupShoppingList('1,6 kg carne para parrilla\ncarne 1,5 kg\naguacate')).toEqual([
      { term: 'carne para parrilla', quantity: 1600, unit: 'g' },
      { term: 'carne', quantity: 1500, unit: 'g' },
      { term: 'aguacate', quantity: 1, unit: undefined },
    ]);
    expect(canonicalCatalogTerm('aguacate')).toBe('palta');
  });

  it('matches spelled sizes and decimals to the catalog name', () => {
    expect(matchesRequestedPackageSize('Arroz Grado 1 1 kilo', 'arroz 1 kg')).toBe(true);
    expect(matchesRequestedPackageSize('Leche Entera 1 litro', 'leche 1 l')).toBe(true);
    expect(matchesRequestedPackageSize('Leche Entera 1,5 L', 'leche 1500 ml')).toBe(true);
    expect(matchesRequestedPackageSize('Mantequilla 250 g', 'mantequilla 500 g')).toBe(false);
    expect(matchesRequestedPackageSize('Mantequilla Con Sal 500 g', 'mantequilla 500 g')).toBe(true);
  });
});
import { extractSupermarketTerms } from '@/lib/supermarketLive';
import {
  canonicalCatalogTerm,
  matchAnchor,
  matchAnchors,
  productMatchScore,
  termMatchesProductName,
} from '@/lib/supermarketText';

/**
 * Lista real de Pedro (2026-08-28): faltaban yogurth, leces, ayuyitas, pampita,
 * Salmas, Cif, Confort y varios empaques. Estos nombres de SKU son el patrón
 * de catálogo chileno; no se inventan precios ni se da por existente un SKU.
 */
const PEDRO_WEEKLY_LIST = [
  '12 yogurth colun',
  '8 yogurt protein',
  '5 leces sin lactosa surlat',
  '2 sachet de jamón de pavo',
  'queso laminado 30 láminas colun',
  'pan ayuyitas',
  'pan marraqueta 2 kilos',
  '1 pampita ideal',
  '1 galletas salma',
  '1 mantequilla colun de 250 con sal',
  '1 paquete de arroz miraflores',
  '1 quinoa',
  '1 carne molida 500 gr',
  '800 gramos super pollo filetitos sin marinar',
  '30 huevos santa marta café',
  '1 bolsa de café molida haiti moka 3',
  '2 lechugas',
  '2 mallas limón',
  'apio',
  'repollo morado',
  'brócoli',
  'zanahoria bolsa',
  '1 kilo plátanos',
  '1 kilo peras',
  '2 kilos naranja',
  '1 bolsa mandarinas',
  '1 cif',
  'paquete de 8 confort',
].join('\n');

const CATALOG_HITS: Array<{ term: string; product: string }> = [
  { term: 'yogurth colun', product: 'Yoghurt Batido Natural Colun 1 kg' },
  { term: 'yogurt protein', product: 'Yogurt Protein Vainilla Soprole 155 g' },
  { term: 'leces sin lactosa surlat', product: 'Leche Sin Lactosa Descremada Surlat 1 L' },
  { term: 'jamon de pavo', product: 'Jamón de Pavo Laminado 200 g PF' },
  { term: 'queso laminado 30 laminas colun', product: 'Queso Gauda en Láminas Colun 30 un' },
  { term: 'pan ayuyitas', product: 'Hallulla 1 kg' },
  { term: 'pan marraqueta', product: 'Marraqueta 1 kg' },
  { term: 'pampita ideal', product: 'Pan Pita Ideal 6 un 300 g' },
  { term: 'galletas salma', product: 'Salmas Original Costa 9 un' },
  { term: 'mantequilla colun de 250 con sal', product: 'Mantequilla Con Sal Colun 250 g' },
  { term: 'arroz miraflores', product: 'Arroz Grado 1 Miraflores 1 kg' },
  { term: 'quinoa', product: 'Quinoa Grano 400 g' },
  { term: 'carne molida', product: 'Carne Molida Vacuno 4% 500 g' },
  { term: 'super pollo filetitos sin marinar', product: 'Filetitos de Pechuga Super Pollo 800 g' },
  { term: 'huevos santa marta cafe', product: 'Huevos Color Café Santa Marta 30 un' },
  { term: 'cafe molida haiti moka 3', product: 'Café Molido Haití Moka 250 g' },
  { term: 'lechugas', product: 'Lechuga escarola un' },
  { term: 'limon', product: 'Limón malla 1 kg' },
  { term: 'apio', product: 'Apio un' },
  { term: 'repollo morado', product: 'Repollo morado un' },
  { term: 'brocoli', product: 'Brócoli un' },
  { term: 'zanahoria bolsa', product: 'Zanahoria bolsa 1 kg' },
  { term: 'platanos', product: 'Plátano granel 1 kg' },
  { term: 'peras', product: 'Pera packham granel 1 kg' },
  { term: 'naranja', product: 'Naranja malla 2 kg' },
  { term: 'mandarinas', product: 'Mandarina malla 1 kg' },
  { term: 'cif', product: 'Limpiador Crema Cif Original 750 g' },
  { term: 'confort', product: 'Papel Higiénico Confort Extra Doble Hoja 8 un' },
];

describe('lista semanal desordenada (Pedro)', () => {
  it('deduplica la lista pegada dos veces y conserva cantidades', () => {
    const once = parseGroupShoppingList(PEDRO_WEEKLY_LIST);
    const twice = parseGroupShoppingList(`${PEDRO_WEEKLY_LIST}\n${PEDRO_WEEKLY_LIST}`);
    expect(once).toHaveLength(28);
    expect(twice).toEqual(once);
    expect(once).toContainEqual({ term: 'yogurth colun', quantity: 12 });
    expect(once).toContainEqual({ term: 'yogurt protein', quantity: 8 });
    expect(once).toContainEqual({ term: 'leces sin lactosa surlat', quantity: 5 });
    expect(once).toContainEqual({ term: 'jamon de pavo', quantity: 2 });
    expect(once).toContainEqual({ term: 'pan marraqueta', quantity: 2, unit: 'kg' });
    expect(once).toContainEqual({ term: 'carne molida', quantity: 500, unit: 'g' });
    expect(once).toContainEqual({
      term: 'super pollo filetitos sin marinar',
      quantity: 800,
      unit: 'g',
    });
    expect(once).toContainEqual({ term: 'huevos santa marta cafe', quantity: 30 });
    expect(once).toContainEqual({ term: 'confort', quantity: 8 });
    expect(once).toContainEqual({ term: 'arroz miraflores', quantity: 1 });
    expect(once).toContainEqual({ term: 'limon', quantity: 2 });
    expect(once).toContainEqual({ term: 'naranja', quantity: 2, unit: 'kg' });
    expect(once).toContainEqual({ term: 'mandarinas', quantity: 1 });
    expect(once.map(item => item.term)).toEqual([
      'yogurth colun',
      'yogurt protein',
      'leces sin lactosa surlat',
      'jamon de pavo',
      'queso laminado 30 laminas colun',
      'pan ayuyitas',
      'pan marraqueta',
      'pampita ideal',
      'galletas salma',
      'mantequilla colun de 250 con sal',
      'arroz miraflores',
      'quinoa',
      'carne molida',
      'super pollo filetitos sin marinar',
      'huevos santa marta cafe',
      'cafe molida haiti moka 3',
      'lechugas',
      'limon',
      'apio',
      'repollo morado',
      'brocoli',
      'zanahoria bolsa',
      'platanos',
      'peras',
      'naranja',
      'mandarinas',
      'cif',
      'confort',
    ]);
  });

  it('el extractor en vivo conserva 12 yogures y no mete el 12 en el término', () => {
    const terms = extractSupermarketTerms('12 yogurth colun');
    expect(terms).toEqual([
      expect.objectContaining({ quantity: 12, explicitBrand: 'colun' }),
    ]);
    expect(terms[0]?.term).toMatch(/yogur/);
    expect(terms[0]?.term).not.toMatch(/12/);
  });

  it('sube el recall: cada línea calza un SKU realista y no un producto ajeno', () => {
    const hits = CATALOG_HITS.filter(entry => termMatchesProductName(entry.term, entry.product));
    expect(hits, 'faltan líneas que el catálogo sí cubre').toHaveLength(CATALOG_HITS.length);

    expect(productMatchScore('yogurth colun', 'Leche Entera Colun 1 L')).toBe(-1);
    expect(productMatchScore('leces sin lactosa surlat', 'Yoghurt Colun 1 kg')).toBe(-1);
    expect(productMatchScore('cif', 'Detergente líquido Ariel 3 L')).toBe(-1);
    expect(productMatchScore('confort', 'Servilletas Elite 100 un')).toBe(-1);
    expect(productMatchScore('pan marraqueta', 'Pan de Molde Ideal 700 g')).toBe(-1);
    expect(termMatchesProductName('leces sin lactosa surlat', 'Leche Deslactosada Surlat 1 L')).toBe(true);
    expect(termMatchesProductName(
      'super pollo filetitos sin marinar',
      'Filetitos Superpollo 800 g',
    )).toBe(true);
    expect(termMatchesProductName('huevos santa marta cafe', 'Huevos SantaMarta 30 un')).toBe(true);
  });

  it('no toma mantequilla de maní como mantequilla', () => {
    expect(isProductSuitableForRequest(
      'Mantequilla De Maní Clásica 500 g Great Value',
      'mantequilla 500 g',
      undefined,
    )).toBe(false);
    expect(isProductSuitableForRequest(
      'Mantequilla Con Sal Colun 500 g',
      'mantequilla 500 g',
      undefined,
    )).toBe(true);
    expect(isProductSuitableForRequest(
      'Mantequilla De Maní Clásica 500 g',
      'mantequilla de maní',
      undefined,
    )).toBe(true);
  });

  it('no deja carne molida de vacuno como pollo', () => {
    expect(isProductSuitableForRequest(
      'Carne Molida Vacuno 4% 500 g',
      'carne molida',
      'g',
    )).toBe(true);
    expect(isProductSuitableForRequest(
      'Carne Molida Pollo 400 g Ariztia',
      'carne molida',
      'g',
    )).toBe(false);
    expect(isProductSuitableForRequest(
      'Carne Molida de Pollo 500 g',
      'carne molida de pollo',
      'g',
    )).toBe(true);
  });

  it('no completa una lista real con papas procesadas o aceitunas con ají', () => {
    expect(isProductSuitableForRequest('Papas Souflé Malla 2 kg', 'papas', undefined)).toBe(false);
    expect(isProductSuitableForRequest('Aceitunas Verdes Rellenas de Ají Jalapeño 85 g', 'ají verde', undefined)).toBe(false);
    expect(isProductSuitableForRequest('Ají Verde 200 g', 'ají verde', undefined)).toBe(true);
    expect(productMatchScore('papas', 'Papas Souflé Malla 2 kg')).toBe(-1);
    expect(productMatchScore('ají verde', 'Aceitunas Verdes Rellenas de Ají Jalapeño 85 g')).toBe(-1);
  });

  it('el ancla de búsqueda deja de ser el typo y arrastra palabras distintivas', () => {
    expect(canonicalCatalogTerm('yogurth colun')).toBe('yogur colun');
    expect(canonicalCatalogTerm('leces sin lactosa surlat')).toBe('leche sin lactosa surlat');
    expect(canonicalCatalogTerm('pan ayuyitas')).toBe('hallulla');
    expect(canonicalCatalogTerm('pampita ideal')).toBe('pita ideal');
    expect(matchAnchor('yogurth colun')).toBe('yogur');
    expect(matchAnchor('leces sin lactosa surlat')).toBe('leche');
    expect(matchAnchor('pan ayuyitas')).toBe('hallulla');
    expect(matchAnchor('pan marraqueta')).toBe('marraqueta');
    expect(matchAnchor('pampita ideal')).toBe('pita');
    expect(matchAnchor('galletas salma')).toBe('salma');
    expect(matchAnchor('cif')).toBe('cif');
    expect(matchAnchor('confort')).toBe('confort');
    expect(matchAnchors('yogurt protein')).toEqual(expect.arrayContaining(['yogur', 'yogurt', 'protein', 'proteina']));
    expect(matchAnchors('cafe molida haiti moka 3')).toEqual(expect.arrayContaining(['cafe', 'haiti', 'moka']));
    expect(matchAnchors('huevos santa marta cafe')).toEqual(expect.arrayContaining(['huevo', 'marta']));
    expect(matchAnchors('huevos santa marta cafe')).not.toContain('cafe');
  });

  it('huevos Santa Marta calzan aunque el SKU omita el color café', () => {
    expect(termMatchesProductName('huevos santa marta cafe', 'Huevos Santa Marta 30 un')).toBe(true);
    expect(termMatchesProductName('huevos santa marta cafe', 'Huevos Color Café Santa Marta 30 un')).toBe(true);
  });
});
