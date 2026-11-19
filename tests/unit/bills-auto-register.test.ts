/**
 * 19-11-2026: la boleta que llega por correo entra sola a los egresos cuando
 * su n° de cliente ya lo registró la administración y la lectura salió limpia.
 * Lo dudoso (cuenta nueva, monto que salta, repetida, sin vencimiento) espera un clic.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/supabaseAdmin', () => ({ getSupabaseAdmin: () => { throw new Error('sin base en tests'); } }));

import { canAutoRegister } from '@/lib/finance/billsInbox';
import type { FinanceDocumentDraft } from '@/lib/types';

const clean: FinanceDocumentDraft = {
    fileName: 'enel.pdf', label: 'Luz pasillos', amount: 45300, provider: 'Enel', category: 'electricity',
    documentDate: '2026-11-10', documentNumber: '123', warnings: [], suggestedMonth: '2026-12',
    utility: { customerNumber: '1234567', servicePeriod: '2026-11', dueDate: '2026-12-02', consumptionValue: 1250, consumptionUnit: 'kWh' },
    knownUtilityAccount: true, suggestedProrateMethod: 'share',
};

describe('boletas que entran solas', () => {
    it('cuenta conocida y lectura limpia: entra sola', () => {
        expect(canAutoRegister(clean)).toBe(true);
    });

    it('la primera boleta de una cuenta la confirma la administración', () => {
        expect(canAutoRegister({ ...clean, knownUtilityAccount: false })).toBe(false);
    });

    it('con cualquier aviso (repetida, monto que salta) espera un clic', () => {
        expect(canAutoRegister({ ...clean, warnings: ['El monto subió 80 % respecto de 2026-10.'] })).toBe(false);
    });

    it('sin monto, sin mes o sin n° de cliente no entra', () => {
        expect(canAutoRegister({ ...clean, amount: 0 })).toBe(false);
        expect(canAutoRegister({ ...clean, suggestedMonth: undefined })).toBe(false);
        expect(canAutoRegister({ ...clean, utility: undefined })).toBe(false);
        expect(canAutoRegister({ ...clean, category: 'other' })).toBe(false);
    });
});
