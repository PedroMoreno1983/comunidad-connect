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
});
