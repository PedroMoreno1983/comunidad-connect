/**
 * 21-11-2026: la prueba de punta a punta del comparador elegía "leche sin
 * lactosa" para "leche entera" y un paquete de 4 rollos para "12 rollos".
 */
import { describe, expect, it } from 'vitest';
import { isProductSuitableForRequest } from '@/lib/supermarketBasket';

const ok = (name: string, term: string, unit?: 'l' | 'kg') => isProductSuitableForRequest(name, term, unit);

describe('variantes que la lista no pidió', () => {
    it('leche entera no acepta sin lactosa, descremada ni vegetal', () => {
        expect(ok('Leche Entera Colun 1 L', 'leche entera', 'l')).toBe(true);
        expect(ok('Leche Entera Sin Lactosa Surlat 1 lt', 'leche entera', 'l')).toBe(false);
        expect(ok('Leche Descremada Soprole 1 L', 'leche entera', 'l')).toBe(false);
        expect(ok('Leche Descremada Soprole 1 L', 'leche', 'l')).toBe(true); // "leche" a secas: cualquiera de vaca
        expect(ok('Leche Condensada Nestlé 397 g', 'leche')).toBe(false);
        expect(ok('Bebida de Almendras 1 L', 'leche', 'l')).toBe(false);
    });

    it('si la lista pide la variante, la acepta', () => {
        expect(ok('Leche Entera Sin Lactosa Surlat 1 lt', 'leche sin lactosa', 'l')).toBe(true);
        expect(ok('Leche Semidescremada Colun 1 L', 'leche semidescremada', 'l')).toBe(true);
    });

    it('un conteo explícito tiene que calzar', () => {
        expect(ok('Papel Higiénico Precio Uno Doble Hoja 22 mts 4 Un', 'papel higienico 12 rollos')).toBe(false);
        expect(ok('Papel Higiénico Elite Doble Hoja 12 Rollos', 'papel higienico 12 rollos')).toBe(true);
        expect(ok('Papel Higiénico Noble x12', 'papel higienico 12 rollos')).toBe(true);
    });
});
