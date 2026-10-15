/**
 * Derechos de cada unidad (‰): validación de la suma (1000‰ ± 0,5), pegado/CSV,
 * precarga provisoria desde el prorrateo, estado provisorio/verificado y el
 * bloqueo con una votación abierta. Módulo puro `unitRights.ts`.
 */
import { describe, expect, it } from 'vitest';
import {
    assertRightsEditable,
    markProvisional,
    parsePermilleText,
    parseRightsCsv,
    permilleFromAmounts,
    PROVISIONAL_RIGHTS_WARNING,
    rightsLockMessage,
    unitRightsStatus,
    validateUnitRights,
} from '@/lib/assemblies/unitRights';
import { computeRights } from '@/lib/assemblies/rules';

const units = [
    { id: 'a', label: '805', number: '805', tower: 'A', sharePermille: null },
    { id: 'b', label: '1104', number: '1104', tower: 'A', sharePermille: null },
    { id: 'c', label: 'B-1204', number: '1204', tower: 'B', sharePermille: null },
];

describe('validación de la suma', () => {
    it('acepta exactamente 1000‰', () => {
        const result = validateUnitRights(units, { a: 333.3333, b: 333.3333, c: 333.3334 });
        expect(result.ok).toBe(true);
        expect(result.total).toBe(1000);
        expect(result.difference).toBe(0);
    });
    it('acepta la tolerancia de redondeo de ± 0,5‰ (incluido el borde)', () => {
        expect(validateUnitRights(units, { a: 333.5, b: 333.5, c: 333.5 }).ok).toBe(true); // 1000,5
        expect(validateUnitRights(units, { a: 333, b: 333, c: 333.5 }).ok).toBe(true); // 999,5
    });
    it('rechaza fuera de la tolerancia y muestra la diferencia', () => {
        const over = validateUnitRights(units, { a: 334, b: 334, c: 333 }); // 1001
        expect(over.ok).toBe(false);
        expect(over.difference).toBe(1);
        expect(over.errors[0]).toMatch(/sobran 1‰/);
        const under = validateUnitRights(units, { a: 333, b: 333, c: 333.4999 }); // 999,4999
        expect(under.ok).toBe(false);
        expect(under.difference).toBeCloseTo(-0.5001, 4);
        expect(under.errors[0]).toMatch(/faltan 0,5001‰/);
    });
    it('exige todas las unidades y valores entre 0 y 1000', () => {
        const missing = validateUnitRights(units, { a: 500, b: 500 });
        expect(missing.ok).toBe(false);
        expect(missing.missing).toEqual(['B-1204']);
        const invalid = validateUnitRights(units, { a: 0, b: 1000, c: Number.NaN });
        expect(invalid.ok).toBe(false);
        expect(invalid.invalid).toEqual(['805', 'B-1204']);
    });
    it('sin unidades no hay nada que guardar', () => {
        expect(validateUnitRights([], {}).ok).toBe(false);
    });
});

describe('lectura de números y CSV', () => {
    it('coma decimal, punto de miles y ‰', () => {
        expect(parsePermilleText('125,5')).toBe(125.5);
        expect(parsePermilleText('1.000,25')).toBe(1000.25);
        expect(parsePermilleText(' 83,33333 ‰')).toBe(83.3333);
        expect(parsePermilleText('')).toBeNull();
        expect(parsePermilleText('-3')).toBeUndefined();
        expect(parsePermilleText('abc')).toBeUndefined();
    });
    it('pegado con encabezado, punto y coma, tabulador y "Depto"', () => {
        const result = parseRightsCsv('Unidad;Derechos\nDepto 805;300,5\n1104\t299,5\nB-1204;400\n9999;1', units);
        expect(result.values).toEqual({ a: 300.5, b: 299.5, c: 400 });
        expect(result.unmatched).toEqual(['9999']);
    });
    it('CSV con comas y coma decimal; informa repetidas y valores no válidos', () => {
        const result = parseRightsCsv('805,300,5\n805,301\n1104,x', units);
        expect(result.values).toEqual({ a: 301 });
        expect(result.duplicates).toEqual(['805']);
        expect(result.invalid).toEqual(['1104']);
    });
});

describe('prorrateo de gastos comunes como punto de partida', () => {
    it('normaliza los montos a ‰ que suman exactamente 1000', () => {
        const values = permilleFromAmounts({ a: 100, b: 100, c: 100 }, ['a', 'b', 'c'])!;
        expect(Object.values(values).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1000, 6);
        expect(validateUnitRights(units, values).ok).toBe(true);
        expect(permilleFromAmounts({ a: 250, b: 750 }, ['a', 'b'])).toEqual({ a: 250, b: 750 });
    });
    it('si falta una unidad en el cobro no hay punto de partida', () => {
        expect(permilleFromAmounts({ a: 100, b: 100 }, ['a', 'b', 'c'])).toBeNull();
        expect(permilleFromAmounts({ a: 100, b: 0, c: 1 }, ['a', 'b', 'c'])).toBeNull();
    });
});

describe('estado: faltan, provisorios o verificados', () => {
    const full = [{ sharePermille: 500 }, { sharePermille: 500 }];
    it('falta una unidad → missing (1 unidad = 1 voto)', () => {
        expect(unitRightsStatus([{ sharePermille: 500 }, { sharePermille: null }], { verified: true })).toBe('missing');
    });
    it('sin revisión o la última sin fuente → provisional', () => {
        expect(unitRightsStatus(full, null)).toBe('provisional');
        expect(unitRightsStatus(full, { verified: false })).toBe('provisional');
    });
    it('última revisión con fuente → verified', () => {
        expect(unitRightsStatus(full, { verified: true })).toBe('verified');
    });
    it('con todas cargadas desaparece el aviso de 1 unidad = 1 voto; si son provisorias se avisa eso', () => {
        const rights = computeRights([{ id: 'a', label: '1', sharePermille: 500 }, { id: 'b', label: '2', sharePermille: 500 }]);
        expect(rights.warnings.some(text => /1 unidad = 1 voto/.test(text))).toBe(false);
        const provisional = markProvisional(rights, 'provisional');
        expect(provisional.provisional).toBe(true);
        expect(provisional.warnings).toEqual([PROVISIONAL_RIGHTS_WARNING]);
        expect(markProvisional(provisional, 'provisional').warnings).toHaveLength(1);
        expect(markProvisional(rights, 'verified').warnings).toEqual([]);
        const equal = computeRights([{ id: 'a', label: '1', sharePermille: null }]);
        expect(markProvisional(equal, 'provisional').provisional).toBeUndefined();
    });
});

describe('bloqueo con votación abierta', () => {
    it('sin votación abierta se puede editar', () => {
        expect(rightsLockMessage(null)).toBeNull();
        expect(() => assertRightsEditable(null)).not.toThrow();
    });
    it('con una votación abierta no se edita', () => {
        expect(rightsLockMessage('Ordinaria 2026')).toMatch(/votación abierta en la asamblea "Ordinaria 2026"/);
        expect(() => assertRightsEditable('Ordinaria 2026')).toThrow(/no se cambian/);
    });
});
