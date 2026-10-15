import { describe, expect, it } from 'vitest';
import {
    convertRightsColumn,
    extractRightsFromTable,
    parseDelimitedTable,
    percentToPermille,
    permilleToText,
    planOnboardingRights,
    previewOnboardingRights,
    rightsFromRawData,
    rightsHeaderScale,
    rightsPendingTask,
    RIGHTS_TASK_HREF,
} from '@/lib/onboarding/unitRightsImport';
import { attachRights } from '@/lib/onboarding/documentExtractor';

describe('encabezados de la columna de derechos', () => {
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

describe('conversión de % a ‰', () => {
    it('multiplica por 10 cuando la columna viene en %', () => {
        expect(percentToPermille(1.25)).toBe(12.5);
        const { values, scale } = convertRightsColumn(['1,25', '98,75'], 'percent');
        expect(scale).toBe('percent');
        expect(values).toEqual([12.5, 987.5]);
    });

    it('con encabezado ambiguo deduce % por la suma o por el símbolo', () => {
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

    it('el texto en ‰ no usa separador de miles', () => {
        expect(permilleToText(1000)).toBe('1000');
        expect(permilleToText(12.5)).toBe('12,5');
        expect(permilleToText(null)).toBe('');
    });
});

describe('parseo de la tabla', () => {
    it('lee CSV con punto y coma, coma decimal y la columna en %', () => {
        const rows = parseDelimitedTable('\uFEFFUnidad;Nombre;Email;%\r\n101;Ana;a@x.cl;"62,5"\r\nDepto 102;Luis;;37,5\r\n');
        const table = extractRightsFromTable(rows);
        expect(table?.meta).toMatchObject({ header: '%', scale: 'percent', scaleInferred: false, unitsWithValue: 2 });
        expect(table?.byUnit.get('101')).toBe('625');
        expect(table?.byUnit.get('102')).toBe('375');
    });

    it('sin columna de derechos devuelve null', () => {
        expect(extractRightsFromTable(parseDelimitedTable('unidad,nombre\n101,Ana'))).toBeNull();
    });

    it('agrega derechos_permil a las filas por unidad', () => {
        const table = extractRightsFromTable(parseDelimitedTable('unidad;derechos_permil\n101;600\n102;400'));
        const { rows, rights } = attachRights([
            { name: 'Ana', unit_id: '101', email: '', phone: '' },
            { name: 'Luis', unit_id: 'Depto 102', email: '', phone: '' },
            { name: 'Sin derechos', unit_id: '103', email: '', phone: '' },
        ], table);
        expect(rows.map(row => row.derechos_permil)).toEqual(['600', '400', '']);
        expect(rights?.header).toBe('derechos_permil');
    });

    it('sin tabla usa lo que copió la IA con la misma conversión', () => {
        const { rows, rights } = attachRights([
            { name: 'Ana', unit_id: '101', email: '', phone: '', rawRights: '55%' },
            { name: 'Luis', unit_id: '102', email: '', phone: '', rawRights: '45%' },
        ], null);
        expect(rows.map(row => row.derechos_permil)).toEqual(['550', '450']);
        expect(rows[0]).not.toHaveProperty('rawRights');
        expect(rights?.scale).toBe('percent');
    });

    it('lee el valor guardado en raw_data', () => {
        expect(rightsFromRawData({ derechos_permil: '12,5' })).toBe('12,5');
        expect(rightsFromRawData({})).toBe('');
        expect(rightsFromRawData(null)).toBe('');
    });
});

describe('vista previa (validación con validateUnitRights)', () => {
    const row = (unit_id: string, derechos_permil: string) => ({ unit_id, derechos_permil });

    it('completa si todas las unidades suman 1000‰ ± 0,5; verificada solo con fuente', () => {
        const rows = [row('101', '333,3'), row('102', '333,3'), row('103', '333,3'), row('103', '333,3')];
        const preview = previewOnboardingRights(rows, '');
        expect(preview.status).toBe('complete');
        expect(preview.units).toBe(3);
        expect(preview.willBeVerified).toBe(false);
        expect(preview.task).toBeNull();
        expect(previewOnboardingRights(rows, 'Reglamento de copropiedad, art. 5').willBeVerified).toBe(true);
    });

    it('parcial si falta una unidad o no suman, con la tarea pendiente', () => {
        const missing = previewOnboardingRights([row('101', '600'), row('102', '')], '');
        expect(missing.status).toBe('partial');
        expect(missing.errors.join(' ')).toMatch(/Faltan los derechos de la unidad 102/);
        expect(missing.task?.href).toBe(RIGHTS_TASK_HREF);
        const offSum = previewOnboardingRights([row('101', '600'), row('102', '398')], '');
        expect(offSum.status).toBe('partial');
        expect(offSum.errors.join(' ')).toMatch(/faltan 2‰/);
    });

    it('marca valores ilegibles y unidades con dos valores distintos', () => {
        const invalid = previewOnboardingRights([row('101', 'abc'), row('102', '1000')], '');
        expect(invalid.errors.join(' ')).toMatch(/Valores no válidos en 101/);
        const conflict = previewOnboardingRights([row('101', '500'), row('101', '400'), row('102', '500')], '');
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

    it('guarda si viene todo y suma 1000‰; verificado con fuente', () => {
        const plan = planOnboardingRights(units, [
            { unitId: 'u1', label: '101', raw: '600' }, { unitId: 'u2', label: '102', raw: '400' },
        ], '  Reglamento de copropiedad, art. 5 ');
        expect(plan).toEqual({ action: 'save', values: { u1: 600, u2: 400 }, sourceNote: 'Reglamento de copropiedad, art. 5', verified: true });
        const provisional = planOnboardingRights(units, [
            { unitId: 'u1', label: '101', raw: '600' }, { unitId: 'u2', label: '102', raw: '400' },
        ], '');
        expect(provisional).toMatchObject({ action: 'save', verified: false });
    });

    it('no guarda si una unidad que ya existía queda sin derechos: tarea pendiente', () => {
        const plan = planOnboardingRights([...units, { id: 'u3', label: '103', sharePermille: null }], [
            { unitId: 'u1', label: '101', raw: '600' }, { unitId: 'u2', label: '102', raw: '400' },
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
            { unitId: 'u1', label: '101', raw: '600' }, { unitId: 'u1', label: '101', raw: '500' }, { unitId: 'u2', label: '102', raw: '400' },
        ], '');
        expect(plan.action).toBe('skip');
    });
});
