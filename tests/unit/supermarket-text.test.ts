import { describe, expect, it } from 'vitest';
import {
    buildSelectionReason,
    foldAccents,
    catalogBrowseScore,
    catalogSearchScore,
    catalogProductSearchText,
    catalogNameOrFilter,
    foldedAccentVariants,
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
    it('keeps short product names such as tea', () => {
        expect(significantWords('Té')).toEqual(['te']);
        expect(termMatchesProductName('té', 'Té negro Ceylán 20 bolsitas')).toBe(true);
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

    it('busca también la grafía acentuada que guarda el catálogo', () => {
        expect(foldedAccentVariants('brocoli')).toEqual(expect.arrayContaining(['brocoli', 'brócoli']));
        expect(foldedAccentVariants('Brócoli')).toContain('brócoli');
        expect(catalogNameOrFilter('brocoli')).toContain('name.ilike."%brócoli%"');
        expect(termMatchesProductName('brócoli', 'Brócoli 1 Un')).toBe(true);
        expect(termMatchesProductName('brocoli', 'Brócoli Congelado 350 g')).toBe(false);
    });

    it('en el buscador muestra las fichas de brócoli que Lider lista juntas', () => {
        const fresh = catalogBrowseScore('brócoli', 'Brócoli, 1 Un');
        const frozen = catalogBrowseScore('brócoli', 'Brócoli Congelado, 350 g');
        const sprouts = catalogBrowseScore('brócoli', 'Brotes de Brócoli Pote, 70 g');
        expect(fresh).toBeGreaterThan(frozen);
        expect(frozen).toBeGreaterThan(0);
        expect(sprouts).toBeGreaterThan(0);
        expect(catalogBrowseScore('brócoli', 'Repollo Crespo, 1 Un')).toBeLessThan(0);
        expect(catalogBrowseScore('leche', 'Chocolate con leche 100 g')).toBeLessThan(0);
    });

    it('encuentra champiñones en bandeja, barquillo, plátano y rúcula como los nombra Lider', () => {
        expect(matchAnchor('barquillo')).toBe('barquillo');
        expect(matchAnchor('frutillas')).toBe('frutilla');
        expect(catalogNameOrFilter(matchAnchor('champinones bandeja'))).toContain('name.ilike."%champiñon%"');
        expect(catalogNameOrFilter(matchAnchor('plátanos'))).toContain('name.ilike."%plátano%"');
        expect(catalogNameOrFilter(matchAnchor('rucula'))).toContain('name.ilike."%rúcula%"');
        expect(termMatchesProductName('champinones bandeja', 'Champiñones Blanco Bandeja 200 g')).toBe(true);
        expect(termMatchesProductName('barquillo', 'Barquillo Para Helado Caja 189 g Lider')).toBe(true);
        expect(termMatchesProductName('plátanos', 'Plátano Granel 500 g (3 a 4 un aprox)')).toBe(true);
        expect(termMatchesProductName('plátanos', 'Queque Plátano 1 Un 300 g')).toBe(false);
        expect(termMatchesProductName('rucula', 'Rúcula Bolsa 200 g')).toBe(true);
        expect(termMatchesProductName('rucula', 'Pesto Rúcula Albahaca Frasco 190 g')).toBe(false);
    });

    it('si una cadena omite el formato, igual encuentra el alimento y deja la bandeja primero', () => {
        const tray = catalogSearchScore('champinones bandeja', 'Champiñones Blanco Bandeja 200 g');
        const can = catalogSearchScore('champinones bandeja', 'Champiñones Laminados Lata Drenado 114 g');
        expect(tray).toBeGreaterThan(can);
        expect(can).toBeGreaterThan(0);
        expect(catalogSearchScore('champinones bandeja', 'Salsa Champiñones Sobre 30 g')).toBeLessThan(0);
        expect(catalogSearchScore('papa', 'Papa granel 1 kg')).toBeGreaterThan(catalogSearchScore('papa', 'Papas Fritas Corte Liso 200 g'));
        expect(catalogSearchScore('coliflor', 'Coliflor Films 1 un.')).toBeGreaterThan(0);
    });

    it('el té se busca como palabra, no como letras dentro de tomate o aceite', () => {
        const clauses = catalogNameOrFilter('te').split(',');
        expect(clauses).toContain('name.ilike."té %"');
        expect(clauses).toContain('name.ilike."% té %"');
        expect(clauses).not.toContain('name.ilike."%te%"');
        expect(clauses).not.toContain('name.ilike."%té%"');
        expect(termMatchesProductName('té', 'Té Ceylán Mildred Tea Caja 20 un.')).toBe(true);
        expect(termMatchesProductName('té', 'Aceite Vegetal 1 L')).toBe(false);
        expect(termMatchesProductName('té', 'Tomates en trocitos 380 g')).toBe(false);
    });

    it('encuentra marcas almacenadas fuera del nombre del producto', () => {
        const name = 'Leche Entera Natural Caja 1 l, 1 L';
        expect(catalogSearchScore('leche entera colun', name)).toBeLessThan(0);
        expect(catalogSearchScore('leche entera colun', catalogProductSearchText(name, 'Colun'))).toBeGreaterThan(0);
        expect(catalogNameOrFilter('colun')).toContain('brand.ilike."%colun%"');
    });

    it('tomate cherry también es el tomate cóctel de las otras cadenas', () => {
        expect(catalogSearchScore('tomate cherry', 'Tomate Cherry Clamshell 500 g')).toBeGreaterThan(0);
        expect(catalogSearchScore('tomate cherry', 'Tomate Cóctel Pote 250 g')).toBeGreaterThan(0);
        expect(catalogSearchScore('tomate cherry', 'Tomate Cocktail Pote 250 gr')).toBeGreaterThan(0);
        expect(catalogSearchScore('tomate cherry', 'Servilletas Cóctel 50 un')).toBeLessThan(0);
        expect(catalogSearchScore('tomate cherry', 'Salsa de Tomate 200 g')).toBeLessThan(0);
    });

    it('el pimentón fresco queda delante del páprika', () => {
        const fresh = catalogSearchScore('pimentón', 'Pimentón rojo 1 un');
        const paprika = catalogSearchScore('pimentón', 'Pimentón Paprika 100 g');
        const branded = catalogSearchScore('pimentón', 'Pimentón Rojo Specia 70 g');
        const jar = catalogSearchScore('pimentón', 'Pimentón Carmencita Picante 75 g');
        expect(fresh).toBeGreaterThan(paprika);
        expect(fresh).toBeGreaterThan(branded);
        expect(fresh).toBeGreaterThan(jar);
        expect(paprika).toBeGreaterThan(0);
        expect(branded).toBeGreaterThan(0);
        expect(jar).toBeGreaterThan(0);
    });

    it('reduce diminutivos chilenos a su base, para que el ILIKE encuentre el producto', () => {
        // Sin esto, "longanizillas" no calzaba con ningún producto del catálogo.
        expect(matchAnchor('longanizillas')).toBe('longaniza');
        expect(matchAnchor('salchichillas')).toBe('salchicha');
        expect(matchAnchor('longanizilla')).toBe('longaniza');
    });

    it('NO corrompe palabras reales que terminan en -illa/-illo', () => {
        expect(matchAnchor('tortilla')).toBe('tortilla');
        expect(matchAnchor('vainilla')).toBe('vainilla');
        expect(matchAnchor('mantequilla')).toBe('mantequilla');
        expect(matchAnchor('quesillo')).toBe('quesillo');
    });
});

describe('supermarketText diminutivos en el match completo', () => {
    it('el diminutivo calza con el producto base del catálogo', () => {
        expect(termMatchesProductName('longanizillas', 'Longaniza Parrillera 2 Un 250 gr Alejandro')).toBe(true);
        expect(termMatchesProductName('salchichillas', 'Salchicha Vienesa Pf 1 kg')).toBe(true);
    });
    it('tortilla sigue calzando con tortilla, no con torta', () => {
        expect(termMatchesProductName('tortilla', 'Tortilla Mexicana Trigo 10 un')).toBe(true);
        expect(termMatchesProductName('tortilla', 'Torta de Chocolate 8 porciones')).toBe(false);
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

    it('normalizes Chilean grocery typos without inventing another product', () => {
        expect(termMatchesProductName('yogurth colun', 'Yoghurt Batido Natural Colun 1 kg')).toBe(true);
        expect(termMatchesProductName('leces sin lactosa surlat', 'Leche Sin Lactosa Descremada Surlat 1 L')).toBe(true);
        expect(matchAnchor('deslactosada')).toBe('lactosa');
        expect(termMatchesProductName('leces sin lactosa surlat', 'Leche Deslactosada Surlat 1 L')).toBe(true);
        expect(termMatchesProductName('pan ayuyitas', 'Hallulla 1 kg')).toBe(true);
        expect(termMatchesProductName('pampita ideal', 'Pan Pita Ideal 6 un 300 g')).toBe(true);
        expect(termMatchesProductName('paquete de 8 confort', 'Papel Higiénico Confort Extra Doble Hoja 8 un')).toBe(true);
        expect(termMatchesProductName('super pollo filetitos', 'Filetitos Superpollo 800 g')).toBe(true);
        expect(termMatchesProductName('yogurth colun', 'Leche Entera Colun 1 L')).toBe(false);
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
        expect(productMatchScore('cebollas', 'Cebolla en polvo 15 g')).toBe(-1);
        expect(productMatchScore('cebollas', 'Cebolla granel 500 g')).toBeGreaterThan(0);
    });

    it('does not treat products labelled sin azucar as sugar', () => {
        expect(termMatchesProductName('az\u00facar', 'Yogurt Colun sin az\u00facar vainilla')).toBe(false);
        expect(termMatchesProductName('az\u00facar', 'Az\u00facar blanca granulada 1 kg')).toBe(true);
    });
});

describe('supermarketText storeSearchUrl', () => {
    it('builds a search URL per store with the exact product name', () => {
        expect(storeSearchUrl('Jumbo', 'Queso Gauda Colun')).toBe('https://www.jumbo.cl/busqueda?ft=Queso%20Gauda%20Colun');
        expect(storeSearchUrl('Lider', 'Arroz')).toBe('https://super.lider.cl/search?query=Arroz');
        expect(storeSearchUrl('Santa Isabel', 'Yogurt')).toBe('https://www.santaisabel.cl/busqueda?ft=Yogurt');
        expect(storeSearchUrl('Unimarc', 'Pate')).toBe('https://www.unimarc.cl/search?q=Pate&suggestions=true');
        expect(storeSearchUrl('Tottus', 'Huevos 12')).toBe('https://www.tottus.cl/tottus-cl/buscar?Ntt=Huevos%2012');
        expect(storeSearchUrl('Irurzun', 'Arroz')).toBe('https://irurzun.cl/search?q=Arroz');
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
            .toBe('Marca Soprole elegida por coincidencia, presentacion y precio entre 3 opciones en Lider.');
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

describe('variantes que cambian el producto', () => {
    // Observado el 2026-08-24: pidiendo "leche", cuatro candidatos empataban en
    // 135 puntos -entera, descremada, condensada y en polvo- porque todos
    // empiezan con "leche". El desempate terminaba eligiendo la condensada.
    it('una leche normal le gana a la condensada y a la en polvo', () => {
        const entera = productMatchScore('leche', 'Leche Entera Soprole 1 L');
        const descremada = productMatchScore('leche', 'Leche Descremada Colun 1 L');
        const condensada = productMatchScore('leche', 'Leche Condensada Azucarada Lata Nestle 397 gr');
        const polvo = productMatchScore('leche', 'Leche en Polvo Nido 3+ 700 g');

        expect(entera).toBeGreaterThan(condensada);
        expect(descremada).toBeGreaterThan(condensada);
        expect(entera).toBeGreaterThan(polvo);
    });

    it('no castiga la variante cuando la persona la pidio', () => {
        // Quien escribe "leche condensada" quiere exactamente eso.
        expect(productMatchScore('leche condensada', 'Leche Condensada Azucarada Lata Nestle 397 gr'))
            .toBeGreaterThan(productMatchScore('leche', 'Leche Condensada Azucarada Lata Nestle 397 gr'));
    });

    it('la variante sigue siendo valida: se penaliza, no se descarta', () => {
        // Si la tienda solo tiene esa, mostrarla con su nombre completo es mejor
        // que declarar el producto inexistente.
        expect(productMatchScore('leche', 'Leche Condensada Azucarada Lata Nestle 397 gr')).toBeGreaterThanOrEqual(0);
    });

    it('no toca calificativos que NO cambian el producto', () => {
        // "con sal" es mantequilla normal; "sabor vainilla" es yogur normal.
        expect(productMatchScore('mantequilla', 'Mantequilla Con Sal Soprole 250 g')).toBe(135);
        expect(productMatchScore('yogur', 'Yoghurt Batido Sabor Vainilla Soprole 120 GR')).toBe(135);
        expect(productMatchScore('pan', 'Pan de Molde Integral Castaño 400 GR')).toBe(135);
    });
});
