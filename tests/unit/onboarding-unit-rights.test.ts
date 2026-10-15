import { describe, expect, it } from 'vitest';
import {
    convertRightsColumn,
    extractRightsFromTable,
    parseDelimitedTable,
    legacyPermilleTextToPercent,
    LEGACY_RIGHTS_COLUMN,
    percentToPermille,
    permilleToPercentText,
    RIGHTS_COLUMN,
    planOnboardingRights,
    previewOnboardingRights,
    rightsFromRawData,
    rightsHeaderScale,
    rightsPendingTask,
    RIGHTS_TASK_HREF,
} from '@/lib/onboarding/unitRightsImport';
import { attachRights } from '@/lib/onboarding/documentExtractor';

describe('encabezados de la columna de derechos', () => {
    it('la plantilla usa derechos_porcentaje; derechos_permil sigue aceptado', () => {
        expect(RIGHTS_COLUMN).toBe('derechos_porcentaje');
        expect(LEGACY_RIGHTS_COLUMN).toBe('derechos_permil');
        expect(rightsHeaderScale('derechos_porcentaje')).toBe('percent');
        expect(rightsHeaderScale('Derechos (%)')).toBe('percent');
    });
    it('reconoce derechos_permil y sus equivalentes', () => {
        expect(rightsHeaderScale('derechos_permil')).toBe('permille');
        expect(rightsHeaderScale('Derechos (‰)')).toBe('permille');
        expect(rightsHeaderScale('‰')).toBe('permille');
        expect(rightsHeaderScale('%')).toBe('percent');
        expect(rightsHeaderScale('Porcentaje')).toBe('percent');
        expect(rightsHeaderScale('Prorrateo')).toBe('auto');
        expect(rightsHeaderScale('Alícuota')).toBe('auto');
        expect(rightsHeaderScale('Nombre')).toBeNull();
        expect(rightsHeaderScale('Unidad')).toBeNull();
    });
});

describe('conversión de % a ‰ (lo que se guarda)', () => {
    it('multiplica por 10 cuando la columna viene en %', () => {
        expect(percentToPermille(1.25)).toBe(12.5);
        const { values, scale } = convertRightsColumn(['1,25', '98,75'], 'percent');
        expect(scale).toBe('percent');
        expect(values).toEqual([12.5, 987.5]);
    });

    it('en ‰ (derechos_permil) no convierte', () => {
        expect(convertRightsColumn(['600', '400'], 'permille').values).toEqual([600, 400]);
        expect(convertRightsColumn(['1.000'], 'permille').values).toEqual([1000]);
    });

    it('con encabezado ambiguo deduce por el símbolo o la suma (≈100 → %, ≈1000 → ‰)', () => {
        const bySum = convertRightsColumn(['40', '60'], 'auto');
        expect(bySum).toMatchObject({ scale: 'percent', scaleInferred: true, values: [400, 600] });
        const bySymbol = convertRightsColumn(['40%', '35'], 'auto');
        expect(bySymbol.values).toEqual([400, 350]);
        const permille = convertRightsColumn(['400', '600'], 'auto');
        expect(permille).toMatchObject({ scale: 'permille', values: [400, 600] });
    });

    it('vacío queda null y lo ilegible undefined', () => {
        expect(convertRightsColumn(['', 'abc'], 'permille').values).toEqual([null, undefined]);
    });

    it('el texto editable va en %, con coma decimal y sin perder decimales', () => {
        expect(permilleToPercentText(1000)).toBe('100');
        expect(permilleToPercentText(12.5)).toBe('1,25');
        expect(permilleToPercentText(5.32)).toBe('0,532');
        expect(permilleToPercentText(8.3333)).toBe('0,83333');
        expect(permilleToPercentText(null)).toBe('');
    });

    it('un texto antiguo en ‰ pasa a %', () => {
        expect(legacyPermilleTextToPercent('12,5')).toBe('1,25');
        expect(legacyPermilleTextToPercent('1.000')).toBe('100');
        expect(legacyPermilleTextToPercent('abc')).toBe('abc');
    });
});

describe('parseo de la tabla', () => {
    it('lee CSV con punto y coma, coma decimal y la columna en %', () => {
        const rows = parseDelimitedTable('\uFEFFUnidad;Nombre;Email;%\r\n101;Ana;a@x.cl;"62,5"\r\nDepto 102;Luis;;37,5\r\n');
        const table = extractRightsFromTable(rows);
        expect(table?.meta).toMatchObject({ header: '%', scale: 'percent', scaleInferred: false, unitsWithValue: 2 });
        expect(table?.byUnit.get('101')).toBe('62,5');
        expect(table?.byUnit.get('102')).toBe('37,5');
    });

    it('lee la plantilla (derechos_porcentaje) sin convertir lo que se muestra', () => {
        const table = extractRightsFromTable(parseDelimitedTable('unidad;nombre;email;telefono;derechos_porcentaje\r\n101;A;;;0,532\r\n102;B;;;99,468\r\n'));
        expect(table?.meta).toMatchObject({ header: 'derechos_porcentaje', scale: 'percent', scaleInferred: false });
        expect(table?.byUnit.get('101')).toBe('0,532');
        expect(table?.byUnit.get('102')).toBe('99,468');
    });

    it('sin columna de derechos devuelve null', () => {
        expect(extractRightsFromTable(parseDelimitedTable('unidad,nombre\n101,Ana'))).toBeNull();
    });

    it('con derechos_permil (‰) las filas quedan en %', () => {
        const table = extractRightsFromTable(parseDelimitedTable('unidad;derechos_permil\n101;600\n102;400'));
        const { rows, rights } = attachRights([
            { name: 'Ana', unit_id: '101', email: '', phone: '' },
            { name: 'Luis', unit_id: 'Depto 102', email: '', phone: '' },
            { name: 'Sin derechos', unit_id: '103', email: '', phone: '' },
        ], table);
        expect(rows.map(row => row.derechos_porcentaje)).toEqual(['60', '40', '']);
        expect(rights).toMatchObject({ header: 'derechos_permil', scale: 'permille' });
    });

    it('sin tabla usa lo que copió la IA con la misma conversión', () => {
        const { rows, rights } = attachRights([
            { name: 'Ana', unit_id: '101', email: '', phone: '', rawRights: '55%' },
            { name: 'Luis', unit_id: '102', email: '', phone: '', rawRights: '45%' },
        ], null);
        expect(rows.map(row => row.derechos_porcentaje)).toEqual(['55', '45']);
        expect(rows[0]).not.toHaveProperty('rawRights');
        expect(rights?.scale).toBe('percent');
    });

    it('lee el valor guardado en raw_data (en %; los lotes antiguos en ‰ se convierten)', () => {
        expect(rightsFromRawData({ derechos_porcentaje: '1,25' })).toBe('1,25');
        expect(rightsFromRawData({ derechos_porcentaje: '', derechos_permil: '12,5' })).toBe('');
        expect(rightsFromRawData({ derechos_permil: '12,5' })).toBe('1,25');
        expect(rightsFromRawData({ derechos_permil: '1.000' })).toBe('100');
        expect(rightsFromRawData({})).toBe('');
        expect(rightsFromRawData(null)).toBe('');
    });
});

describe('vista previa (validación con validateUnitRights)', () => {
    const row = (unit_id: string, derechos_porcentaje: string) => ({ unit_id, derechos_porcentaje });

    it('completa si todas las unidades suman 100 % ± 0,05; verificada solo con fuente', () => {
        const rows = [row('101', '33,33'), row('102', '33,33'), row('103', '33,33'), row('103', '33,33')];
        const preview = previewOnboardingRights(rows, '');
        expect(preview.status).toBe('complete');
        expect(preview.units).toBe(3);
        expect(preview.willBeVerified).toBe(false);
        expect(preview.task).toBeNull();
        expect(preview.total).toBeCloseTo(999.9, 6);
        expect(previewOnboardingRights(rows, 'Reglamento de copropiedad, art. 5').willBeVerified).toBe(true);
    });

    it('parcial si falta una unidad o no suman, con la tarea pendiente', () => {
        const missing = previewOnboardingRights([row('101', '60'), row('102', '')], '');
        expect(missing.status).toBe('partial');
        expect(missing.errors.join(' ')).toMatch(/Faltan los derechos de la unidad 102/);
        expect(missing.task?.href).toBe(RIGHTS_TASK_HREF);
        const offSum = previewOnboardingRights([row('101', '60'), row('102', '38,7')], '');
        expect(offSum.status).toBe('partial');
        expect(offSum.errors.join(' ')).toMatch(/La suma debe ser 100 % \(hoy: 98,7 %\): falta 1,3 %/);
        expect(rightsPendingTask('partial').detail).toMatch(/no sumaban 100 %/);
    });

    it('marca valores ilegibles y unidades con dos valores distintos', () => {
        const invalid = previewOnboardingRights([row('101', 'abc'), row('102', '100')], '');
        expect(invalid.errors.join(' ')).toMatch(/Valores no válidos en 101/);
        const conflict = previewOnboardingRights([row('101', '50'), row('101', '40'), row('102', '50')], '');
        expect(conflict.status).toBe('partial');
        expect(conflict.conflicts).toEqual(['101']);
    });

    it('sin derechos: estado none y la misma tarea pendiente', () => {
        const preview = previewOnboardingRights([row('101', ''), row('102', '')], '');
        expect(preview.status).toBe('none');
        expect(preview.task).toEqual(rightsPendingTask('missing'));
    });
});

describe('plan al sincronizar (contra todas las unidades de la comunidad)', () => {
    const units = [
        { id: 'u1', label: '101', sharePermille: null },
        { id: 'u2', label: '102', sharePermille: null },
    ];

    it('guarda en ‰ si viene todo en % y suma 100 %; verificado con fuente', () => {
        const plan = planOnboardingRights(units, [
            { unitId: 'u1', label: '101', raw: '60' }, { unitId: 'u2', label: '102', raw: '40' },
        ], '  Reglamento de copropiedad, art. 5 ');
        expect(plan).toEqual({ action: 'save', values: { u1: 600, u2: 400 }, sourceNote: 'Reglamento de copropiedad, art. 5', verified: true });
        const provisional = planOnboardingRights(units, [
            { unitId: 'u1', label: '101', raw: '0,532' }, { unitId: 'u2', label: '102', raw: '99,468' },
        ], '');
        expect(provisional).toMatchObject({ action: 'save', verified: false, values: { u1: 5.32, u2: 994.68 } });
    });

    it('no guarda si una unidad que ya existía queda sin derechos: tarea pendiente', () => {
        const plan = planOnboardingRights([...units, { id: 'u3', label: '103', sharePermille: null }], [
            { unitId: 'u1', label: '101', raw: '60' }, { unitId: 'u2', label: '102', raw: '40' },
        ], '');
        expect(plan.action).toBe('skip');
        if (plan.action === 'skip') {
            expect(plan.outcome.status).toBe('skipped');
            expect(plan.outcome.errors.join(' ')).toMatch(/103/);
            expect(plan.outcome.task?.title).toBe('Cargar derechos de cada unidad');
        }
    });

    it('sin derechos: tarea pendiente, salvo que la comunidad ya los tenga', () => {
        const none = planOnboardingRights(units, [{ unitId: 'u1', label: '101', raw: '' }], '');
        expect(none).toMatchObject({ action: 'skip', outcome: { status: 'none', task: { href: '/admin/asambleas#derechos' } } });
        const loaded = planOnboardingRights(units.map(unit => ({ ...unit, sharePermille: 500 })), [], '');
        expect(loaded).toMatchObject({ action: 'skip', outcome: { status: 'already_loaded', task: null } });
    });

    it('dos residentes de la misma unidad con valores distintos no se guardan', () => {
        const plan = planOnboardingRights(units, [
            { unitId: 'u1', label: '101', raw: '60' }, { unitId: 'u1', label: '101', raw: '50' }, { unitId: 'u2', label: '102', raw: '40' },
        ], '');
        expect(plan.action).toBe('skip');
    });
});
