import { describe, expect, it } from 'vitest';
import {
    describeParkingPayout,
    effectivePayoutDestination,
    isBankDataComplete,
    isParkingPayoutCredit,
    isValidRut,
    maskAccountNumber,
    normalizeRut,
    splitParkingPayout,
    summarizeParkingPayouts,
    validateCommissionPercent,
    validatePayoutSettingsInput,
} from '@/lib/parkingPayouts/payouts';
import type { ParkingOwnerPayoutSettings } from '@/lib/parkingPayouts/types';

const BANK: ParkingOwnerPayoutSettings = {
    destination: null,
    creditUnitId: null,
    bankName: 'Banco de Chile',
    bankAccountType: 'corriente',
    bankAccountNumber: '00-123-45678-09',
    holderRut: '12345678-5',
    holderName: 'Titular de Prueba',
};

describe('comisión y neto (CLP enteros)', () => {
    it('0 % por defecto: todo va al dueño', () => {
        expect(splitParkingPayout(3000, 0)).toEqual({ gross: 3000, commission: 0, net: 3000 });
    });

    it('100 %: todo queda en la comunidad', () => {
        expect(splitParkingPayout(3000, 100)).toEqual({ gross: 3000, commission: 3000, net: 0 });
    });

    it('redondea la comisión al peso, con la mitad hacia arriba', () => {
        expect(splitParkingPayout(2500, 10)).toEqual({ gross: 2500, commission: 250, net: 2250 });
        expect(splitParkingPayout(50, 1).commission).toBe(1); // 0,5 → 1
        expect(splitParkingPayout(49, 1).commission).toBe(0); // 0,49 → 0
        expect(splitParkingPayout(1500, 12.35).commission).toBe(185); // 185,25 → 185
        expect(splitParkingPayout(1999, 12.5).commission).toBe(250); // 249,875 → 250
        expect(splitParkingPayout(1004, 12.5).commission).toBe(126); // 125,5 → 126
    });

    it('no arrastra errores de punto flotante (0,1 + 0,2)', () => {
        // 0.29 * 100 = 28.999999999999996 en flotante; la tasa se lleva a enteros.
        expect(splitParkingPayout(10000, 0.29).commission).toBe(29);
        expect(splitParkingPayout(100, 33.33).commission).toBe(33);
    });

    it('bruto = comisión + neto siempre, exacto, para cualquier monto y tasa', () => {
        const rates = [0, 0.01, 0.5, 1, 5, 7.77, 10, 12.35, 15, 19.99, 33.33, 50, 66.67, 99.99, 100];
        for (let gross = 0; gross <= 20000; gross += 137) {
            for (const rate of rates) {
                const { commission, net } = splitParkingPayout(gross, rate);
                expect(Number.isInteger(commission)).toBe(true);
                expect(Number.isInteger(net)).toBe(true);
                expect(commission + net).toBe(gross);
                expect(commission).toBeGreaterThanOrEqual(0);
                expect(net).toBeGreaterThanOrEqual(0);
                // Diferencia con el valor exacto: a lo más medio peso.
                expect(Math.abs(commission - (gross * rate) / 100)).toBeLessThanOrEqual(0.5 + 1e-9);
            }
        }
    });

    it('acota la tasa a 0–100 y rechaza montos que no son pesos enteros', () => {
        expect(splitParkingPayout(1000, 150).commission).toBe(1000);
        expect(splitParkingPayout(1000, -5).commission).toBe(0);
        expect(() => splitParkingPayout(10.5, 10)).toThrow(/entero/);
        expect(() => splitParkingPayout(-1, 10)).toThrow(/entero/);
    });

    it('valida la comisión que fija la administración', () => {
        expect(validateCommissionPercent(0)).toBeNull();
        expect(validateCommissionPercent(100)).toBeNull();
        expect(validateCommissionPercent(12.35)).toBeNull();
        expect(validateCommissionPercent(12.345)).toMatch(/2 decimales/);
        expect(validateCommissionPercent(-0.01)).toMatch(/0 % a 100 %/);
        expect(validateCommissionPercent(100.01)).toMatch(/0 % a 100 %/);
        expect(validateCommissionPercent(Number.NaN)).toMatch(/porcentaje/);
    });
});

describe('destino de lo recaudado', () => {
    it('sin preferencia ni datos bancarios: abono a gastos comunes', () => {
        expect(effectivePayoutDestination(null)).toEqual({ destination: 'common_expenses_credit', source: 'default_credit' });
    });

    it('sin elección pero con datos bancarios completos: transferencia', () => {
        expect(effectivePayoutDestination(BANK)).toEqual({ destination: 'bank_transfer', source: 'default_bank' });
    });

    it('datos bancarios incompletos no bastan para transferir por defecto', () => {
        expect(effectivePayoutDestination({ ...BANK, holderRut: null })).toEqual({
            destination: 'common_expenses_credit', source: 'default_credit',
        });
        expect(isBankDataComplete({ ...BANK, bankName: '  ' })).toBe(false);
    });

    it('la elección del dueño manda sobre el destino automático', () => {
        expect(effectivePayoutDestination({ ...BANK, destination: 'reserve_fund_donation' })).toEqual({
            destination: 'reserve_fund_donation', source: 'owner_choice',
        });
        expect(effectivePayoutDestination({ ...BANK, destination: 'common_expenses_credit' }).destination)
            .toBe('common_expenses_credit');
    });

    it('elegir transferencia exige datos bancarios completos y un RUT válido', () => {
        expect(validatePayoutSettingsInput({ ...BANK, destination: 'bank_transfer' })).toEqual([]);
        expect(validatePayoutSettingsInput({ ...BANK, destination: 'bank_transfer', bankAccountNumber: null }))
            .toContain('Para recibir transferencias completa banco, tipo y número de cuenta, RUT y titular.');
        expect(validatePayoutSettingsInput({ ...BANK, holderRut: '12345678-9' })).toContain('El RUT del titular no es válido.');
        expect(validatePayoutSettingsInput({ ...BANK, bankAccountNumber: 'abc' }))
            .toContain('El número de cuenta solo lleva dígitos (y guiones).');
        // Abono o donación no piden datos bancarios.
        expect(validatePayoutSettingsInput({
            destination: 'reserve_fund_donation', creditUnitId: null, bankName: null, bankAccountType: null,
            bankAccountNumber: null, holderRut: null, holderName: null,
        })).toEqual([]);
    });
});

describe('RUT', () => {
    it('normaliza y valida con módulo 11', () => {
        expect(normalizeRut('12.345.678-5')).toBe('12345678-5');
        expect(normalizeRut(' 7.654.321-k ')).toBe('7654321-K');
        expect(isValidRut('12.345.678-5')).toBe(true);
        expect(isValidRut('7.654.321-6')).toBe(true);
        expect(isValidRut('11.111.111-1')).toBe(true);
        expect(isValidRut('12.345.678-K')).toBe(false);
        expect(isValidRut('123-4')).toBe(false);
        expect(isValidRut('')).toBe(false);
    });
});

describe('totales y textos', () => {
    it('suma lo entregado y lo pendiente sin contar anuladas', () => {
        const totals = summarizeParkingPayouts([
            { grossAmount: 3000, commissionAmount: 300, netAmount: 2700, status: 'paid', needsReview: false },
            { grossAmount: 2000, commissionAmount: 200, netAmount: 1800, status: 'credited', needsReview: false },
            { grossAmount: 1000, commissionAmount: 100, netAmount: 900, status: 'pending', needsReview: true },
            { grossAmount: 5000, commissionAmount: 500, netAmount: 4500, status: 'cancelled', needsReview: false },
            { grossAmount: 1000, commissionAmount: 0, netAmount: 1000, status: 'donated', needsReview: false },
        ]);
        expect(totals).toMatchObject({
            gross: 7000, commission: 600, net: 6400, delivered: 5500, pending: 900,
            transferred: 2700, credited: 1800, donated: 1000, reviewCount: 1,
        });
        expect(totals.gross).toBe(totals.commission + totals.net);
    });

    it('describe cada estado sin lenguaje de deudor', () => {
        const texts = (['pending', 'on_hold', 'paid', 'credited', 'donated', 'retained', 'cancelled'] as const)
            .map(status => describeParkingPayout({ status, destination: 'bank_transfer', paidOn: '2026-10-15', needsReview: false }));
        expect(texts[2]).toBe('Transferida el 15-10-2026.');
        for (const text of texts) {
            expect(text).not.toMatch(/deud|moros|atras|multa|cobranza/i);
        }
    });

    it('reconoce el abono de una liquidación en los pagos de la unidad', () => {
        expect(isParkingPayoutCredit('parking_payout:abc')).toBe(true);
        expect(isParkingPayoutCredit('TRX-123')).toBe(false);
        expect(isParkingPayoutCredit(null)).toBe(false);
        expect(maskAccountNumber('00-123-45678-09')).toBe('•••• 7809');
    });
});
