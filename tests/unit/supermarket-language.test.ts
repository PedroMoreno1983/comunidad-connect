import { describe, expect, it } from 'vitest';
import {
  matchAnchor,
  matchAnchors,
  productIntent,
  termMatchesProductName,
} from '@/lib/supermarketText';

describe('supermarket catalog language variants', () => {
  it('normalizes Chilean plural and accent variants for indexed search', () => {
    expect(matchAnchor('limones')).toBe('limon');
    expect(matchAnchors('pañales')).toEqual(['panal', 'pañal']);
    expect(matchAnchors('azúcar')).toEqual(['azucar', 'azúcar']);
    expect(matchAnchors('té')).toEqual(['te', 'té']);
  });

  it('treats food for pets as alimento in catalog names', () => {
    expect(termMatchesProductName(
      'comida perro',
      'Alimento para perros adulto 10 kg',
    )).toBe(true);
    expect(termMatchesProductName(
      'comida gato',
      'Alimento húmedo para gatos 85 g',
    )).toBe(true);
  });

  it('uses merluza as the explicit default equivalent for generic pescado', () => {
    expect(matchAnchor('pescado')).toBe('merluza');
    expect(termMatchesProductName('pescado', 'Filete de merluza 500 g')).toBe(true);
  });

  it('does not classify an explicitly processed potato request as fresh produce', () => {
    expect(productIntent('papas')).toBe('fresh_produce');
    expect(productIntent('papas fritas')).toBe('general');
    expect(termMatchesProductName('papas fritas', 'Papas fritas sal de mar 150 g')).toBe(true);
  });

  it('resolves common Chilean drinks, retailer naming and a frequent typo', () => {
    expect(matchAnchor('champaña brut')).toBe('espumante');
    expect(matchAnchors('champaña brut')).toEqual(expect.arrayContaining(['espumante', 'champana', 'champaña']));
    expect(matchAnchors('champaña brut')[0]).toBe('espumante');
    expect(termMatchesProductName('champaña brut', 'Espumante Brut 750 ml')).toBe(true);
    expect(termMatchesProductName('Aperol', 'Cóctel Aperitivo Botella 1 L Aperol')).toBe(true);
    expect(termMatchesProductName('Aperol', 'Licor Aperol 11° 1 L')).toBe(true);
    expect(termMatchesProductName('coca', 'Bebida Original Botella 2 L Coca-Cola')).toBe(true);
    expect(termMatchesProductName('tónica', 'Agua Tónica Botella 1,5 L Schweppes')).toBe(true);
    expect(termMatchesProductName('Canadá dray', 'Bebida Ginger Ale 1,5 L Canada Dry')).toBe(true);
  });
});
