import { describe, expect, it } from 'vitest';
import {
    buildDirectCartUrl, storeSupportsDirectCart, countUnsupportedItems, directCartConfidence,
    storeLoadability, loadabilityRank,
} from '@/lib/supermarket/cartUrl';
import { sharedCartStores, storeSupportsSharedCart } from '@/lib/supermarket/vtexSharedCart';

describe('buildDirectCartUrl', () => {
    it('arma el enlace de Jumbo con los SKU y cantidades', () => {
        const url = buildDirectCartUrl('Jumbo', [
            { sku: '95710', quantity: 1 },
            { sku: '93386', quantity: 2 },
        ]);

        expect(url).toContain('https://www.jumbo.cl/checkout/cart/add?');
        const params = new URLSearchParams(url!.split('?')[1]);
        expect(params.getAll('sku')).toEqual(['95710', '93386']);
        expect(params.getAll('qty')).toEqual(['1', '2']);
        expect(params.getAll('seller')).toEqual(['1', '1']);
        expect(params.get('sc')).toBe('1');
    });

    it('emite un seller por producto: VTEX lee los parámetros en paralelo', () => {
        const url = buildDirectCartUrl('Lider', [
            { sku: 'A', quantity: 1 },
            { sku: 'B', quantity: 1 },
            { sku: 'C', quantity: 1 },
        ]);
        const params = new URLSearchParams(url!.split('?')[1]);
        expect(params.getAll('sku')).toHaveLength(3);
        expect(params.getAll('qty')).toHaveLength(3);
        expect(params.getAll('seller')).toHaveLength(3);
    });

    it('devuelve null para una cadena sin soporte, en vez de un enlace roto', () => {
        // Prometer un carro cargado y que llegue vacío es peor que ofrecer
        // el camino alternativo desde el principio.
        expect(buildDirectCartUrl('Santa Isabel', [{ sku: '1', quantity: 1 }])).toBeNull();
        expect(buildDirectCartUrl('Tottus', [{ sku: '1', quantity: 1 }])).toBeNull();
        expect(buildDirectCartUrl('aCuenta', [{ sku: '1', quantity: 1 }])).toBeNull();
    });

    it('arma el enlace para Lider, que solo tiene esta vía', () => {
        expect(buildDirectCartUrl('Lider', [{ sku: '1', quantity: 1 }]))
            .toContain('https://www.lider.cl/checkout/cart/add?');
    });

    it('ya no usa enlace directo en Unimarc: pasó a carro compartido', () => {
        // Unimarc arma el carro por la Checkout API y la tienda confirma qué
        // quedó adentro, que es más fuerte que confiar en un enlace.
        expect(buildDirectCartUrl('Unimarc', [{ sku: '1', quantity: 1 }])).toBeNull();
    });

    it('devuelve null si ningún producto trae SKU', () => {
        expect(buildDirectCartUrl('Jumbo', [{ sku: '', quantity: 1 }])).toBeNull();
        expect(buildDirectCartUrl('Jumbo', [])).toBeNull();
    });

    it('ignora los productos sin SKU pero conserva el resto', () => {
        const url = buildDirectCartUrl('Jumbo', [
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
        expect(params.getAll('sku')).toHaveLength(50);
    });
});

describe('storeSupportsDirectCart', () => {
    it('reconoce las cadenas con enlace directo', () => {
        expect(storeSupportsDirectCart('Jumbo')).toBe(true);
        expect(storeSupportsDirectCart('Lider')).toBe(true);
        // Unimarc y Santa Isabel usan carro compartido, no enlace.
        expect(storeSupportsDirectCart('Unimarc')).toBe(false);
        expect(storeSupportsDirectCart('Santa Isabel')).toBe(false);
        expect(storeSupportsDirectCart('aCuenta')).toBe(false);
    });
});

describe('directCartConfidence', () => {
    it('distingue verificado, pendiente de revisar y no soportado', () => {
        expect(directCartConfidence('Jumbo')).toBe('verified');
        // Lider: no podemos leer su carro desde nuestro dominio, así que el
        // resultado se declara pendiente de que la persona lo revise.
        expect(directCartConfidence('Lider')).toBe('attempt');
        expect(directCartConfidence('Unimarc')).toBeNull();
        expect(directCartConfidence('Santa Isabel')).toBeNull();
        expect(directCartConfidence('Tottus')).toBeNull();
    });
});

describe('storeLoadability / loadabilityRank', () => {
    it('clasifica la cargabilidad por tienda', () => {
        expect(storeLoadability('Jumbo')).toBe('direct');
        expect(storeLoadability('Lider')).toBe('attempt');
        expect(storeLoadability('Tottus')).toBe('manual');
        expect(storeLoadability('aCuenta')).toBe('manual');
    });

    it('toda tienda con carro compartido es "direct", no "manual"', () => {
        // Regresión: storeLoadability solo miraba el enlace directo, así que
        // Santa Isabel y Unimarc caían en 'manual' (el peor nivel) pese a cargar
        // solas y confirmadas. La UI las rotulaba "requiere un paso extra" y el
        // desempate les cargaba una penalización de precio, con lo que podía
        // recomendar una tienda más cara que las que sí funcionan.
        for (const store of sharedCartStores()) {
            expect(storeSupportsSharedCart(store)).toBe(true);
            expect(storeLoadability(store)).toBe('direct');
            expect(loadabilityRank(store)).toBe(0);
        }
    });

    it('ordena mejor a la más fácil de cargar', () => {
        expect(loadabilityRank('Jumbo')).toBeLessThan(loadabilityRank('Lider'));
        expect(loadabilityRank('Lider')).toBeLessThan(loadabilityRank('Tottus'));
        expect(loadabilityRank('Santa Isabel')).toBeLessThan(loadabilityRank('Lider'));
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
        expect(countUnsupportedItems(items)).toBe(10);
    });
});
