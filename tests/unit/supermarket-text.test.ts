import { describe, expect, it } from 'vitest';
import {
    buildSelectionReason,
    foldAccents,
    matchAnchor,
    productMatchScore,
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

describe('supermarketText matchAnchor', () => {
    it('applies the plural stem so ILIKE finds singular product names', () => {
        // "Jalea Soprole Guinda" NO contiene el substring "jaleas": el ancla
        // debe ser "jalea" o el término queda vacío aunque el catálogo lo tenga.
        expect(matchAnchor('jaleas')).toBe('jalea');
        expect(matchAnchor('queso en laminas')).toBe('queso');
        expect(matchAnchor('lentejas')).toBe('lenteja');
    });

    it('strips accents and keeps non-plural words intact', () => {
        expect(matchAnchor('Atún')).toBe('atun');
        expect(matchAnchor('arroz')).toBe('arroz');
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

    it('uses complete words instead of matching a term inside a brand', () => {
        expect(termMatchesProductName('leche', 'Yogurt Loncoleche Frutilla 140 g')).toBe(false);
        expect(termMatchesProductName('leche', 'Leche entera Colun 1 L')).toBe(true);
    });

    it('rejects processed products for generic fresh produce requests', () => {
        expect(productMatchScore('tomates', 'Salsa de tomate natural 200 g')).toBe(-1);
        expect(productMatchScore('tomates', 'Tomate larga vida 1 kg')).toBeGreaterThan(0);
        expect(productMatchScore('papas', 'Papas fritas corte americano 400 g')).toBe(-1);
        expect(productMatchScore('papas', 'Papas Artesanales Sal de Mar 185 g')).toBe(-1);
        expect(productMatchScore('papas', 'Papa malla 2 kg')).toBeGreaterThan(0);
    });

    it('does not treat products labelled sin azucar as sugar', () => {
        expect(termMatchesProductName('az\u00facar', 'Yogurt Colun sin az\u00facar vainilla')).toBe(false);
        expect(termMatchesProductName('az\u00facar', 'Az\u00facar blanca granulada 1 kg')).toBe(true);
    });
});

describe('supermarketText storeSearchUrl', () => {
    it('builds a search URL per store with the exact product name', () => {
        expect(storeSearchUrl('Jumbo', 'Queso Gauda Colun')).toBe('https://www.jumbo.cl/busqueda?ft=Queso%20Gauda%20Colun');
        expect(storeSearchUrl('Lider', 'Arroz')).toBe('https://www.lider.cl/supermercado/search?query=Arroz');
        expect(storeSearchUrl('Santa Isabel', 'Yogurt')).toBe('https://www.santaisabel.cl/busqueda?ft=Yogurt');
        expect(storeSearchUrl('Unimarc', 'Pate')).toBe('https://www.unimarc.cl/search?q=Pate&suggestions=true');
        expect(storeSearchUrl('Tottus', 'Huevos 12')).toBe('https://www.tottus.cl/tottus-cl/buscar?Ntt=Huevos%2012');
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
