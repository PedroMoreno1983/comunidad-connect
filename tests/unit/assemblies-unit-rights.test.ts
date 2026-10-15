/**
 * Derechos de cada unidad: se muestran y aceptan en % (suman 100 % ± 0,05) y se
 * guardan en ‰ (‰ = % × 10). Validación de la suma, números es-CL (punto de
 * miles, coma decimal), pegado/CSV, precarga provisoria desde el prorrateo,
 * estado provisorio/verificado y el bloqueo con una votación abierta.
 * Módulo puro `unitRights.ts`.
 */
import { describe, expect, it } from 'vitest';
import {
    assertRightsEditable,
    convertRightsColumn,
    formatDecimalEsCl,
    formatPercent,
    formatPermille,
    formatRightsPercent,
    inferRightsScale,
    markProvisional,
    parseDecimalEsCl,
    parsePercentToPermille,
    parsePermilleText,
    percentToPermille,
    permilleToPercent,
    permilleToPercentText,
    RIGHTS_TOLERANCE_PERCENT,
    RIGHTS_TOLERANCE_PERMILLE,
    RIGHTS_TOTAL_PERCENT,
    RIGHTS_TOTAL_PERMILLE,
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

describe('validación de la suma (100 % ± 0,05; en ‰ 1000 ± 0,5)', () => {
    it('la tolerancia en % equivale a la de ‰', () => {
        expect(RIGHTS_TOTAL_PERMILLE).toBe(RIGHTS_TOTAL_PERCENT * 10);
        expect(RIGHTS_TOLERANCE_PERMILLE).toBe(RIGHTS_TOLERANCE_PERCENT * 10);
    });
    it('acepta exactamente 100 % (1000‰)', () => {
        const result = validateUnitRights(units, { a: 333.3333, b: 333.3333, c: 333.3334 });
        expect(result.ok).toBe(true);
        expect(result.total).toBe(1000);
        expect(result.difference).toBe(0);
    });
    it('acepta la tolerancia de redondeo de ± 0,05 % (incluido el borde)', () => {
        expect(validateUnitRights(units, { a: 333.5, b: 333.5, c: 333.5 }).ok).toBe(true); // 100,05 %
        expect(validateUnitRights(units, { a: 333, b: 333, c: 333.5 }).ok).toBe(true); // 99,95 %
    });
    it('rechaza fuera de la tolerancia y muestra la suma y la diferencia en %', () => {
        const over = validateUnitRights(units, { a: 334, b: 334, c: 333 }); // 100,1 %
        expect(over.ok).toBe(false);
        expect(over.difference).toBe(1);
        expect(over.errors[0]).toBe('La suma debe ser 100 % (hoy: 100,1 %): sobra 0,1 % (tolerancia ± 0,05 %).');
        const under = validateUnitRights(units, { a: 333, b: 333, c: 333.4999 }); // 99,94999 %
        expect(under.ok).toBe(false);
        expect(under.difference).toBeCloseTo(-0.5001, 4);
        expect(under.errors[0]).toMatch(/hoy: 99,94999 %\): falta 0,05001 %/);
        const example = validateUnitRights(units, { a: 300, b: 300, c: 387 }); // 98,7 %
        expect(example.errors[0]).toMatch(/^La suma debe ser 100 % \(hoy: 98,7 %\)/);
        expect(example.errors.join(' ')).not.toMatch(/‰/);
    });
    it('exige todas las unidades y valores entre 0 % y 100 %', () => {
        const missing = validateUnitRights(units, { a: 500, b: 500 });
        expect(missing.ok).toBe(false);
        expect(missing.missing).toEqual(['B-1204']);
        const invalid = validateUnitRights(units, { a: 0, b: 1000, c: Number.NaN });
        expect(invalid.ok).toBe(false);
        expect(invalid.invalid).toEqual(['805', 'B-1204']);
        expect(invalid.errors.join(' ')).toMatch(/mayores que 0 % y no superar 100 %/);
    });
    it('sin unidades no hay nada que guardar', () => {
        expect(validateUnitRights([], {}).ok).toBe(false);
    });
});

describe('números es-CL: punto de miles, coma decimal', () => {
    it('bug: "1.000" formateado y vuelto a leer es mil, no uno', () => {
        expect(formatPermille(1000)).toBe('1.000');
        expect(parsePermilleText('1.000')).toBe(1000);
        expect(parsePermilleText(formatPermille(1000))).toBe(1000);
        expect(parseDecimalEsCl('12.500')).toBe(12500);
        expect(parseDecimalEsCl('1.234.567,5')).toBe(1234567.5);
    });
    it('ida y vuelta formatear → leer conserva el valor', () => {
        for (const value of [0, 0.5, 5.32, 12.5, 83.3333, 999.9999, 1000, 1000.25, 1234.5678, 25000]) {
            expect(parseDecimalEsCl(formatDecimalEsCl(value))).toBe(value);
            expect(parsePermilleText(formatPermille(value))).toBe(value);
        }
    });
    it('formatea con punto de miles, coma decimal y hasta 4 decimales, sin ceros de relleno', () => {
        expect(formatDecimalEsCl(1000)).toBe('1.000');
        expect(formatDecimalEsCl(1000.25)).toBe('1.000,25');
        expect(formatDecimalEsCl(0.532)).toBe('0,532');
        expect(formatDecimalEsCl(83.33333)).toBe('83,3333');
        expect(formatDecimalEsCl(1234567.5)).toBe('1.234.567,5');
        expect(formatDecimalEsCl(-0.1)).toBe('-0,1');
        expect(formatDecimalEsCl(0.00001)).toBe('0');
        expect(formatPermille(null)).toBe('');
    });
    it('coma decimal, punto de miles y símbolos', () => {
        expect(parsePermilleText('125,5')).toBe(125.5);
        expect(parsePermilleText('1.000,25')).toBe(1000.25);
        expect(parsePermilleText(' 83,33333 ‰')).toBe(83.3333);
        expect(parseDecimalEsCl('0,532 %')).toBe(0.532);
        expect(parsePermilleText('')).toBeNull();
        expect(parsePermilleText('-3')).toBeUndefined();
        expect(parsePermilleText('abc')).toBeUndefined();
    });
    it('rechaza agrupaciones que no son es-CL', () => {
        expect(parseDecimalEsCl('1,234.5')).toBeUndefined();
        expect(parseDecimalEsCl('1.00,5')).toBeUndefined();
        expect(parseDecimalEsCl('1,2,3')).toBeUndefined();
    });
    it('tolera el punto decimal de archivos exportados cuando no agrupa de a tres', () => {
        expect(parseDecimalEsCl('12.5')).toBe(12.5);
        expect(parseDecimalEsCl('0.532')).toBe(0.532);
        expect(parseDecimalEsCl('1.25')).toBe(1.25);
    });
});

describe('porcentaje en pantalla, ‰ en la base (‰ = % × 10)', () => {
    it('convierte en los dos sentidos sin perder decimales', () => {
        expect(percentToPermille(0.532)).toBe(5.32);
        expect(percentToPermille(100)).toBe(1000);
        expect(permilleToPercent(5.32)).toBe(0.532);
        expect(permilleToPercent(8.3333)).toBe(0.83333);
        expect(parsePercentToPermille('0,532')).toBe(5.32);
        expect(parsePercentToPermille('0,532 %')).toBe(5.32);
        expect(parsePercentToPermille('')).toBeNull();
        expect(parsePercentToPermille('x')).toBeUndefined();
    });
    it('muestra % con hasta 4 decimales y coma decimal', () => {
        expect(formatPercent(5.32)).toBe('0,532');
        expect(formatRightsPercent(5.32)).toBe('0,532 %');
        expect(formatRightsPercent(1000)).toBe('100 %');
        expect(formatRightsPercent(8.3333)).toBe('0,8333 %');
        expect(formatRightsPercent(null)).toBe('');
    });
    it('el texto editable no pierde decimales y se vuelve a leer igual', () => {
        expect(permilleToPercentText(8.3333)).toBe('0,83333');
        expect(parsePercentToPermille(permilleToPercentText(8.3333))).toBe(8.3333);
        for (const value of [0.0001, 5.32, 12.5, 333.3334, 1000]) {
            expect(parsePercentToPermille(permilleToPercentText(value))).toBe(value);
            expect(parsePercentToPermille(formatPercent(value))).toBeCloseTo(value, 2);
        }
    });
    it('la escala por la suma: ≈100 → %, ≈1000 → ‰', () => {
        expect(inferRightsScale(100)).toBe('percent');
        expect(inferRightsScale(100.05)).toBe('percent');
        expect(inferRightsScale(1000)).toBe('permille');
        expect(inferRightsScale(999.5)).toBe('permille');
        expect(inferRightsScale(98.7)).toBe('percent');
        expect(inferRightsScale(987)).toBe('permille');
        expect(inferRightsScale(0)).toBe('percent');
        expect(convertRightsColumn(['0,532', '99,468'], 'auto')).toMatchObject({ scale: 'percent', values: [5.32, 994.68] });
        expect(convertRightsColumn(['600', '400'], 'auto')).toMatchObject({ scale: 'permille', values: [600, 400] });
    });
});

describe('pegado y CSV (en %; en ‰ si el encabezado o la suma lo indican)', () => {
    it('pegado con encabezado, punto y coma, tabulador y "Depto"; valores en %', () => {
        const result = parseRightsCsv('Unidad;Derechos\nDepto 805;30,05\n1104\t29,95\nB-1204;40\n9999;1', units);
        expect(result.values).toEqual({ a: 300.5, b: 299.5, c: 400 });
        expect(result.scale).toBe('percent');
        expect(result.unmatched).toEqual(['9999']);
    });
    it('encabezado derechos_porcentaje o % → %; derechos_permil o ‰ → ‰ sin convertir', () => {
        expect(parseRightsCsv('unidad;derechos_porcentaje\n805;0,532\n1104;99,468', units)).toMatchObject({ values: { a: 5.32, b: 994.68 }, scale: 'percent', scaleInferred: false });
        expect(parseRightsCsv('unidad;%\n805;50\n1104;50', units)).toMatchObject({ values: { a: 500, b: 500 }, scale: 'percent' });
        expect(parseRightsCsv('unidad;derechos_permil\n805;300,5\n1104;299,5\nB-1204;400', units)).toMatchObject({ values: { a: 300.5, b: 299.5, c: 400 }, scale: 'permille', scaleInferred: false });
        expect(parseRightsCsv('unidad;‰\n805;600\n1104;400', units)).toMatchObject({ values: { a: 600, b: 400 }, scale: 'permille' });
    });
    it('sin encabezado o ambiguo: suma ≈1000 → ‰, ≈100 → %; el símbolo de la celda manda', () => {
        expect(parseRightsCsv('805;300,5\n1104;299,5\nB-1204;400', units)).toMatchObject({ values: { a: 300.5, b: 299.5, c: 400 }, scale: 'permille', scaleInferred: true });
        expect(parseRightsCsv('Unidad;Prorrateo\n805;30\n1104;30\nB-1204;40', units)).toMatchObject({ values: { a: 300, b: 300, c: 400 }, scale: 'percent', scaleInferred: true });
        expect(parseRightsCsv('805;600‰\n1104;400‰', units).values).toEqual({ a: 600, b: 400 });
    });
    it('"1.000" en ‰ se lee como mil', () => {
        expect(parseRightsCsv('unidad;derechos_permil\n805;1.000', [units[0]]).values).toEqual({ a: 1000 });
    });
    it('CSV con comas y coma decimal; informa repetidas y valores no válidos', () => {
        const result = parseRightsCsv('805,30,05\n805,30,1\n1104,x', units);
        expect(result.values).toEqual({ a: 301 });
        expect(result.duplicates).toEqual(['805']);
        expect(result.invalid).toEqual(['1104']);
    });
});

describe('prorrateo de gastos comunes como punto de partida', () => {
    it('normaliza los montos a ‰ que suman exactamente 1000 (100 %)', () => {
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
