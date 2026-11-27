/**
 * Servicios básicos (18-11-2026): boletas compartidas de la administración y
 * cuentas personales privadas del residente.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/supabaseAdmin', () => ({ getSupabaseAdmin: () => { throw new Error('sin base en tests'); } }));

import {
    UTILITY_PROVIDERS, UTILITY_SERVICES, daysBetween, matchUtilityProvider, nextDueDate, normalizeCustomerNumber, utilityAmountWarning,
} from '@/lib/utilities/providers';
import { buildUtilityReminders, type UtilityReminderAccount } from '@/lib/utilities/reminders';
import { validateAccountInput } from '@/lib/utilities/residentAccounts';
import { parseUtilityFields } from '@/lib/finance/expenseDocumentExtractor';

describe('catálogo de empresas', () => {
    it('cada empresa tiene un portal https y un servicio válido', () => {
        for (const provider of UTILITY_PROVIDERS) {
            expect(provider.payUrl.startsWith('https://')).toBe(true);
            expect(UTILITY_SERVICES).toContain(provider.service);
        }
        expect(new Set(UTILITY_PROVIDERS.map(item => item.id)).size).toBe(UTILITY_PROVIDERS.length);
        expect(new Set(UTILITY_PROVIDERS.map(item => item.service))).toEqual(
            new Set(['electricity', 'water', 'gas', 'internet', 'highway', 'mobile']),
        );
    });

    it('reconoce la empresa por el nombre largo de la boleta', () => {
        expect(matchUtilityProvider('ENEL DISTRIBUCIÓN CHILE S.A.')?.id).toBe('enel');
        expect(matchUtilityProvider('Aguas Andinas S.A.')?.service).toBe('water');
        expect(matchUtilityProvider('Constructora XYZ')).toBeUndefined();
        expect(matchUtilityProvider('Movistar Hogar')).toBeUndefined();
    });

    it('normaliza el n° de cliente para detectar la misma cuenta', () => {
        expect(normalizeCustomerNumber(' 12.345.678-9 ')).toBe('12345678-9');
        expect(normalizeCustomerNumber('abc 123')).toBe('ABC123');
    });
});

describe('vencimientos', () => {
    it('el próximo vencimiento es este mes si no ha pasado, si no el siguiente', () => {
        expect(nextDueDate(25, '2026-11-18')).toBe('2026-11-25');
        expect(nextDueDate(10, '2026-11-18')).toBe('2026-12-10');
        expect(nextDueDate(5, '2026-12-20')).toBe('2027-01-05');
    });

    it('un día 31 en un mes corto vence el último día', () => {
        expect(nextDueDate(31, '2026-11-18')).toBe('2026-11-30');
        expect(nextDueDate(31, '2027-02-01')).toBe('2027-02-28');
    });

    it('cuenta días entre fechas civiles', () => {
        expect(daysBetween('2026-11-18', '2026-11-21')).toBe(3);
        expect(daysBetween('2026-11-18', '2026-11-18')).toBe(0);
    });
});

describe('avisos de vencimiento', () => {
    const account: UtilityReminderAccount = {
        id: 'acc-1', userId: 'user-1', communityId: 'com-1', service: 'electricity', provider: 'enel', dueDay: 21, lastPaidPeriod: null,
    };

    it('avisa 3 días antes y el mismo día, y no otros días', () => {
        expect(buildUtilityReminders([account], '2026-11-18')).toHaveLength(1);
        expect(buildUtilityReminders([account], '2026-11-21')[0].title).toBe('Hoy vence tu cuenta de luz');
        expect(buildUtilityReminders([account], '2026-11-19')).toHaveLength(0);
    });

    it('no avisa si la cuenta ya está marcada como pagada ese mes', () => {
        expect(buildUtilityReminders([{ ...account, lastPaidPeriod: '2026-11' }], '2026-11-18')).toHaveLength(0);
        expect(buildUtilityReminders([{ ...account, lastPaidPeriod: '2026-10' }], '2026-11-18')).toHaveLength(1);
    });

    it('usa la fecha de la boleta sobre el día habitual y no inventa otro vencimiento', () => {
        const dated = { ...account, billDueDate: '2026-11-25', dueDay: 21 };
        expect(buildUtilityReminders([dated], '2026-11-22')).toHaveLength(1);
        expect(buildUtilityReminders([dated], '2026-12-18')).toHaveLength(0);
        expect(buildUtilityReminders([{ ...dated, lastPaidBillDueDate: '2026-11-25' }], '2026-11-25')).toHaveLength(0);
    });

    it('el id del aviso es estable: correr el cron dos veces no duplica', () => {
        const first = buildUtilityReminders([account], '2026-11-18')[0];
        const second = buildUtilityReminders([account], '2026-11-18')[0];
        expect(first.id).toBe(second.id);
        expect(first.link).toBe('/resident/servicios');
        expect(first.body).not.toContain('$');
    });
});

describe('boletas compartidas', () => {
    it('lee los datos de boleta de la respuesta de la IA', () => {
        expect(parseUtilityFields({ customerNumber: '123.456-7', servicePeriod: '2026-10', dueDate: '2026-11-25', consumptionValue: '1.234,5', consumptionUnit: 'kWh' }))
            .toEqual({ customerNumber: '123456-7', servicePeriod: '2026-10', dueDate: '2026-11-25', consumptionValue: 1234.5, consumptionUnit: 'kWh' });
        expect(parseUtilityFields({ customerNumber: '', servicePeriod: '2026-10' })).toBeUndefined();
        expect(parseUtilityFields({ customerNumber: '9', servicePeriod: 'octubre', dueDate: '25/11/2026' }))
            .toMatchObject({ servicePeriod: '', dueDate: '' });
    });

    it('avisa si el monto se aleja más de 40% de la boleta anterior', () => {
        expect(utilityAmountWarning(150_000, { amount: 100_000, period: '2026-09' })).toContain('sube 50%');
        expect(utilityAmountWarning(50_000, { amount: 100_000, period: '2026-09' })).toContain('baja 50%');
        expect(utilityAmountWarning(120_000, { amount: 100_000, period: '2026-09' })).toBeNull();
        expect(utilityAmountWarning(120_000, null)).toBeNull();
    });
});

describe('cuentas personales', () => {
    it('valida empresa, servicio y número', () => {
        expect(validateAccountInput({ provider: 'sin-tag', customerNumber: ' AB-CD-12 ' }))
            .toMatchObject({ service: 'highway', customer_number: 'AB-CD-12' });
        expect(validateAccountInput({ provider: 'metrogas', customerNumber: '55-1' })).toMatchObject({ service: 'gas', customer_number: '55-1', reminders_enabled: true });
        expect(() => validateAccountInput({ provider: 'otra', customerNumber: '1' })).toThrow('Elige la empresa');
        expect(() => validateAccountInput({ provider: 'enel', service: 'water', customerNumber: '1' })).toThrow('no corresponde');
        expect(() => validateAccountInput({ provider: 'enel', customerNumber: '  ' })).toThrow('n° de cliente');
        expect(() => validateAccountInput({ provider: 'enel', customerNumber: '1', dueDay: 40 })).toThrow('del 1 al 31');
    });

    it('son privadas: ninguna política de la tabla deja leer a la administración', () => {
        const migration = readFileSync('supabase/migrations/20261118180000_utility_bills.sql', 'utf8');
        const section = migration.slice(migration.indexOf('-- ── 3.'));
        expect(section).toContain('USING (user_id = auth.uid())');
        expect(section).not.toMatch(/get_my_role|community_id/);
    });

    it('el servicio filtra siempre por el dueño', () => {
        const source = readFileSync('src/lib/utilities/residentAccounts.ts', 'utf8');
        const queries = source.match(/from\('resident_utility_accounts'\)[\s\S]*?;/g) ?? [];
        expect(queries.length).toBeGreaterThanOrEqual(4);
        for (const query of queries) {
            if (query.includes('.insert(')) expect(query).toContain('user_id: userId');
            else expect(query).toContain(".eq('user_id', userId)");
        }
    });
});
