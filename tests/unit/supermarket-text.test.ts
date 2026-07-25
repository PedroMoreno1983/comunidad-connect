import { describe, expect, it } from 'vitest';
import {
    buildSelectionReason,
    foldAccents,
    significantWords,
    storeSearchUrl,
    termMatchesProductName,
} from '../../src/lib/supermarketText';

describe('supermarketText foldAccents / significantWords', () => {
    it('strips accents and lowercases', () => {
        expect(foldAccents('Queso en Láminas')).toBe('queso en laminas');
        expect(foldAccents('JalEA')).toBe('jalea');
    });

    it('keeps only meaningful words of 3+ letters', () => {
        expect(significantWords('queso en laminas')).toEqual(['queso', 'laminas']);
        expect(significantWords('arroz de grado 1')).toEqual(['arroz', 'grado']);
    });
});

describe('supermarketText termMatchesProductName', () => {
    it('matches across accents and word order', () => {
        expect(termMatchesProductName('queso en laminas', 'Queso en Láminas Colun 200g')).toBe(true);
        expect(termMatchesProductName('laminas queso', 'Queso en Láminas Colun 200g')).toBe(true);
    });

    it('tolerates singular/plural differences both ways', () => {
        expect(termMatchesProductName('jaleas', 'Jalea de Frambuesa 250g')).toBe(true);
        expect(termMatchesProductName('jalea', 'Pack Jaleas Surtidas 4 un')).toBe(true);
    });

    it('rejects products missing a significant word', () => {
        expect(termMatchesProductName('queso en laminas', 'Queso Crema Colun 200g')).toBe(false);
        expect(termMatchesProductName('arroz integral', 'Arroz Grado 1 Tucapel 1kg')).toBe(false);
    });

    it('rejects empty or stop-word-only terms', () => {
        expect(termMatchesProductName('de la en', 'Cualquier producto')).toBe(false);
    });
});

describe('supermarketText storeSearchUrl', () => {
    it('builds a search URL per store with the exact product name', () => {
        expect(storeSearchUrl('Jumbo', 'Queso Gauda Colun')).toBe('https://www.jumbo.cl/busqueda?ft=Queso%20Gauda%20Colun');
        expect(storeSearchUrl('Lider', 'Arroz')).toBe('https://www.lider.cl/supermercado/search?query=Arroz');
        expect(storeSearchUrl('Santa Isabel', 'Yogurt')).toBe('https://www.santaisabel.cl/busqueda?ft=Yogurt');
        expect(storeSearchUrl('Unimarc', 'Pate')).toBe('https://www.unimarc.cl/busqueda?ft=Pate');
    });

    it('returns undefined without store or name', () => {
        expect(storeSearchUrl(undefined, 'Arroz')).toBeUndefined();
        expect(storeSearchUrl('Jumbo', '  ')).toBeUndefined();
        expect(storeSearchUrl('Tienda X', 'Arroz')).toBeUndefined();
    });
});

describe('supermarketText buildSelectionReason', () => {
    it('states the explicit brand when the user asked for one', () => {
        expect(buildSelectionReason({ brand: 'Colun', explicitBrand: 'Colun', optionCount: 4, store: 'Jumbo' }))
            .toBe('Marca Colun pedida por ti en Jumbo.');
    });

    it('explains the price criterion and option count when the user gave no brand', () => {
        expect(buildSelectionReason({ brand: 'Soprole', explicitBrand: null, optionCount: 3, store: 'Lider' }))
            .toBe('Marca Soprole elegida por mejor precio entre 3 opciones en Lider.');
    });

    it('flags single-option picks honestly', () => {
        expect(buildSelectionReason({ brand: 'Calvo', explicitBrand: null, optionCount: 1, store: 'Jumbo' }))
            .toBe('Marca Calvo: única opción disponible en Jumbo.');
    });

    it('mentions offers when present', () => {
        expect(buildSelectionReason({ brand: 'Ariel', explicitBrand: null, optionCount: 2, store: 'Unimarc', isOffer: true }))
            .toContain('además está en oferta');
    });
});
