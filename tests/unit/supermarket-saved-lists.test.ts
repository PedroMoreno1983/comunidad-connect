import { describe, expect, it } from 'vitest';
import { savedListKey, savedListTitle } from '../../src/lib/supermarketSavedLists';

describe('saved shopping lists', () => {
  it('treats spacing and accents as the same list', () => {
    expect(savedListKey('2 Leche\n1 azúcar')).toBe(savedListKey('2  leche\n1 azucar'));
  });

  it('names a list from the first products', () => {
    expect(savedListTitle('2 leche\n1 arroz\n3 yogur\n1 pan')).toBe('leche, arroz, yogur y 1 más');
  });

  it('keeps a short list without a leftover count', () => {
    expect(savedListTitle('pan molde')).toBe('pan molde');
  });
});
