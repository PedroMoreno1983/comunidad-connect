import { describe, expect, it } from 'vitest';
import {
    buildDirectCartUrl, storeSupportsDirectCart, countUnsupportedItems, directCartConfidence,
} from '@/lib/supermarket/cartUrl';

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

    it('arma el enlace también para las cadenas "intentar" (Lider, Unimarc)', () => {
        expect(buildDirectCartUrl('Unimarc', [{ sku: '1', quantity: 1 }]))
            .toContain('https://www.unimarc.cl/checkout/cart/add?');
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
    it('reconoce las cadenas con enlace (verificadas o "intentar")', () => {
        expect(storeSupportsDirectCart('Jumbo')).toBe(true);
        expect(storeSupportsDirectCart('Lider')).toBe(true);
        expect(storeSupportsDirectCart('Unimarc')).toBe(true);
        expect(storeSupportsDirectCart('Santa Isabel')).toBe(false);
        expect(storeSupportsDirectCart('aCuenta')).toBe(false);
    });
});

describe('directCartConfidence', () => {
    it('distingue verificado, intentar y no soportado', () => {
        expect(directCartConfidence('Jumbo')).toBe('verified');
        expect(directCartConfidence('Lider')).toBe('attempt');
        expect(directCartConfidence('Unimarc')).toBe('attempt');
        expect(directCartConfidence('Santa Isabel')).toBeNull();
        expect(directCartConfidence('Tottus')).toBeNull();
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
