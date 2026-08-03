import { describe, expect, it } from 'vitest';
import {
    buildDirectCartUrl, storeSupportsDirectCart, countUnsupportedItems, directCartConfidence,
    storeLoadability, loadabilityRank, MAX_ITEMS_PER_URL,
} from '@/lib/supermarket/cartUrl';

describe('buildDirectCartUrl', () => {
    it('arma el enlace de Jumbo en su dominio público con SKU y cantidades', () => {
        const url = buildDirectCartUrl('Jumbo', [
            { sku: '95710', quantity: 1 },
            { sku: '93386', quantity: 2 },
        ]);

        // Dominio público, no el host de cuenta: ahí es donde la persona tiene
        // sesión y donde queda la cookie del carro.
        expect(url).toContain('https://www.jumbo.cl/checkout/cart/add?');
        expect(url).not.toContain('vtexcommercestable');
        const params = new URLSearchParams(url!.split('?')[1]);
        expect(params.getAll('sku')).toEqual(['95710', '93386']);
        expect(params.getAll('qty')).toEqual(['1', '2']);
        expect(params.getAll('seller')).toEqual(['1', '1']);
        expect(params.get('sc')).toBe('1');
        expect(params.get('redirect')).toBe('true');
    });

    it('usa los hosts de checkout que crean el carro en la sesión del navegador', () => {
        expect(buildDirectCartUrl('Santa Isabel', [{ sku: '7917', quantity: 1 }]))
            .toContain('https://santaisabel.vtexcommercestable.com.br/checkout/cart/add?');
        const unimarc = buildDirectCartUrl('Unimarc', [{ sku: '75563', quantity: 1 }]);
        expect(unimarc).toContain('https://unimarc.vtexcommercestable.com.br/checkout/cart/add?');
        expect(new URL(unimarc!).searchParams.get('redirect')).toBe('false');
    });

    it('nunca vuelve a entregar un orderForm creado en otra sesión', () => {
        for (const store of ['Jumbo', 'Santa Isabel', 'Unimarc']) {
            const url = buildDirectCartUrl(store, [{ sku: '1', quantity: 1 }]);
            expect(url).not.toContain('orderFormId');
            expect(url).toContain('/checkout/cart/add?');
        }
    });

    it('emite un seller por producto: VTEX lee los parámetros en paralelo', () => {
        const url = buildDirectCartUrl('Santa Isabel', [
            { sku: 'A', quantity: 1 },
            { sku: 'B', quantity: 1 },
            { sku: 'C', quantity: 1 },
        ]);
        const params = new URLSearchParams(url!.split('?')[1]);
        expect(params.getAll('sku')).toHaveLength(3);
        expect(params.getAll('qty')).toHaveLength(3);
        expect(params.getAll('seller')).toHaveLength(3);
    });

    it('devuelve null para una cadena sin enlace, en vez de prometer un carro vacío', () => {
        expect(buildDirectCartUrl('Tottus', [{ sku: '1', quantity: 1 }])).toBeNull();
        expect(buildDirectCartUrl('aCuenta', [{ sku: '1', quantity: 1 }])).toBeNull();
        expect(buildDirectCartUrl('Irurzun', [{ sku: '1', quantity: 1 }])).toBeNull();
    });

    it('arma el enlace para Lider, que queda sujeto a revisión por su WAF', () => {
        expect(buildDirectCartUrl('Lider', [{ sku: '1', quantity: 1 }]))
            .toContain('https://www.lider.cl/checkout/cart/add?');
    });

    it('devuelve null si ningún producto trae SKU', () => {
        expect(buildDirectCartUrl('Jumbo', [{ sku: '', quantity: 1 }])).toBeNull();
        expect(buildDirectCartUrl('Jumbo', [])).toBeNull();
    });

    it('ignora los productos sin SKU pero conserva el resto', () => {
        const url = buildDirectCartUrl('Unimarc', [
            { sku: '111', quantity: 1 },
            { sku: '', quantity: 1 },
            { sku: '222', quantity: 1 },
        ]);
        const params = new URLSearchParams(url!.split('?')[1]);
        expect(params.getAll('sku')).toEqual(['111', '222']);
    });

    it('acota la cantidad a un rango razonable', () => {
        const url = buildDirectCartUrl('Jumbo', [
            { sku: 'A', quantity: 0 },
            { sku: 'B', quantity: 999 },
            { sku: 'C', quantity: 2.6 },
        ]);
        const params = new URLSearchParams(url!.split('?')[1]);
        expect(params.getAll('qty')).toEqual(['1', '99', '3']);
    });

    it('corta en 50 productos para no generar una URL impracticable', () => {
        const items = Array.from({ length: 70 }, (_, i) => ({ sku: `s${i}`, quantity: 1 }));
        const url = buildDirectCartUrl('Jumbo', items);
        const params = new URLSearchParams(url!.split('?')[1]);
        expect(params.getAll('sku')).toHaveLength(MAX_ITEMS_PER_URL);
    });
});

describe('storeSupportsDirectCart', () => {
    it('reconoce solo las cadenas con enlace de sesión', () => {
        expect(storeSupportsDirectCart('Jumbo')).toBe(true);
        expect(storeSupportsDirectCart('Santa Isabel')).toBe(true);
        expect(storeSupportsDirectCart('Unimarc')).toBe(true);
        expect(storeSupportsDirectCart('Lider')).toBe(true);
        expect(storeSupportsDirectCart('aCuenta')).toBe(false);
        expect(storeSupportsDirectCart('Tottus')).toBe(false);
    });
});

describe('directCartConfidence', () => {
    it('distingue verificado, fuera de sitio, intento con WAF y no soportado', () => {
        expect(directCartConfidence('Jumbo')).toBe('verified');
        // El alta ocurre, pero en el host de cuenta VTEX: el carro no queda en
        // el dominio donde la persona tiene sesión. Ver la nota en cartUrl.ts.
        expect(directCartConfidence('Santa Isabel')).toBe('offsite');
        expect(directCartConfidence('Unimarc')).toBe('offsite');
        expect(directCartConfidence('Lider')).toBe('attempt');
        expect(directCartConfidence('Tottus')).toBeNull();
    });
});

describe('storeLoadability / loadabilityRank', () => {
    it('clasifica la cargabilidad por tienda', () => {
        // Solo Jumbo deja el carro en el dominio donde la persona compra.
        expect(storeLoadability('Jumbo')).toBe('direct');
        // Santa Isabel y Unimarc cargan, pero en el host de cuenta VTEX: el
        // carro no aparece en su sitio. No es 'direct' ni 'manual'.
        expect(storeLoadability('Santa Isabel')).toBe('offsite');
        expect(storeLoadability('Unimarc')).toBe('offsite');
        expect(storeLoadability('Lider')).toBe('attempt');
        expect(storeLoadability('Tottus')).toBe('manual');
        expect(storeLoadability('aCuenta')).toBe('manual');
    });

    it('deja a Jumbo por delante de todas: es la única que carga donde se paga', () => {
        for (const store of ['Santa Isabel', 'Unimarc', 'Lider', 'Tottus', 'aCuenta']) {
            expect(loadabilityRank('Jumbo')).toBeLessThan(loadabilityRank(store));
        }
    });

    it('ordena los niveles intermedios de mejor a peor', () => {
        expect(loadabilityRank('Santa Isabel')).toBeLessThan(loadabilityRank('Lider'));
        expect(loadabilityRank('Lider')).toBeLessThan(loadabilityRank('Tottus'));
    });
});

describe('countUnsupportedItems', () => {
    it('cuenta los que quedarían fuera del enlace', () => {
        expect(countUnsupportedItems([
            { sku: 'A', quantity: 1 },
            { sku: '', quantity: 1 },
            { sku: '  ', quantity: 1 },
        ])).toBe(2);
    });

    it('suma también los que exceden el tope de 50', () => {
        const items = Array.from({ length: 60 }, (_, i) => ({ sku: `s${i}`, quantity: 1 }));
        expect(countUnsupportedItems(items)).toBe(60 - MAX_ITEMS_PER_URL);
    });
});
