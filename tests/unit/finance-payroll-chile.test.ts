import { describe, expect, it } from 'vitest';
import { calculatePayslip, gratificationFor, incomeTax, PayrollInputError } from '@/lib/finance/payrollChile';
import type { PayrollIndicators, PayslipInput } from '@/lib/types';

// Previred, remuneraciones de septiembre 2026.
const SEPTEMBER_2026: PayrollIndicators = {
    uf: 41057.2,
    utm: 71721,
    minimumWage: 553553,
    afpCapUf: 90,
    unemploymentCapUf: 135.2,
    afpWorkerRates: { capital: 0.1144, cuprum: 0.1144, habitat: 0.1127, planvital: 0.1116, provida: 0.1145, modelo: 0.1058, uno: 0.1046 },
    employerAfpRate: 0.001,
    sisRate: 0.0178,
    socialInsuranceRates: { rentabilidadProtegida: 0.009, expectativaDeVida: 0.0072 },
    unemployment: {
        indefinido: { employer: 0.024, worker: 0.006 },
        plazo_fijo: { employer: 0.03, worker: 0 },
        indefinido_11: { employer: 0.008, worker: 0 },
    },
    healthRate: 0.07,
    familyAllowance: [
        { upTo: 649039, amount: 22601 },
        { upTo: 947990, amount: 13870 },
        { upTo: 1478539, amount: 4382 },
        { upTo: null, amount: 0 },
    ],
};

const concierge: PayslipInput = {
    calculation: 'chile',
    baseSalary: 600000,
    afp: 'Habitat',
    healthSystem: 'fonasa',
    isaprePlanUf: null,
    contractType: 'indefinido',
    gratification: true,
    taxableBonus: 0,
    mealAllowance: 40000,
    transportAllowance: 30000,
    familyDependents: 0,
    accidentRate: 0.0093,
};

describe('liquidación chilena', () => {
    it('calcula al conserje de sueldo bajo: exento de impuesto, con gratificación del 25%', () => {
        const slip = calculatePayslip(concierge, SEPTEMBER_2026);
        expect(slip.gratification).toBe(150000);
        expect(slip.taxableIncome).toBe(750000);
        expect(slip.afp).toEqual({ name: 'habitat', rate: 0.1127, amount: 84525 });
        expect(slip.health.amount).toBe(52500);
        expect(slip.unemploymentWorker).toBe(4500);
        expect(slip.incomeTax).toBe(0);
        expect(slip.netPay).toBe(750000 + 70000 - 84525 - 52500 - 4500);
        expect(slip.employer).toEqual({
            sis: 13350, afp: 750, socialInsurance: 12150, unemployment: 18000, accidentInsurance: 6975, total: 51225,
        });
        expect(slip.employerCost).toBe(820000 + 51225);
    });

    it('topa la gratificación en 4,75 ingresos mínimos al año', () => {
        expect(gratificationFor(2_000_000, 553553)).toBe(219115);
    });

    it('aplica el tramo del impuesto único con su rebaja', () => {
        // 1.500.000 / 71.721 = 20,9 UTM -> tramo 4% con rebaja de 0,54 UTM.
        expect(incomeTax(1_500_000, 71721)).toBe(Math.round(1_500_000 * 0.04 - 0.54 * 71721));
        expect(incomeTax(900_000, 71721)).toBe(0);
    });

    it('topa las cotizaciones en 90 UF y descuenta el plan de isapre completo, pero solo rebaja el 7% del impuesto', () => {
        const slip = calculatePayslip({
            ...concierge,
            baseSalary: 5_000_000,
            gratification: false,
            healthSystem: 'isapre',
            isaprePlanUf: 8,
        }, SEPTEMBER_2026);
        const cap = Math.round(90 * 41057.2);
        expect(slip.afp?.amount).toBe(Math.round(cap * 0.1127));
        expect(slip.health.legalAmount).toBe(Math.round(cap * 0.07));
        expect(slip.health.amount).toBe(Math.round(8 * 41057.2));
        expect(slip.taxBase).toBe(5_000_000 - slip.afp!.amount - slip.health.legalAmount - slip.unemploymentWorker);
        expect(slip.incomeTax).toBeGreaterThan(0);
    });

    it('paga asignación familiar sin sumarla al costo de la comunidad', () => {
        const slip = calculatePayslip({ ...concierge, familyDependents: 2 }, SEPTEMBER_2026);
        expect(slip.familyAllowance).toBe(2 * 13870);
        expect(slip.employerCost).toBe(slip.grossPay - slip.familyAllowance + slip.employer.total);
    });

    it('en plazo fijo el seguro de cesantía lo paga solo el empleador', () => {
        const slip = calculatePayslip({ ...concierge, contractType: 'plazo_fijo' }, SEPTEMBER_2026);
        expect(slip.unemploymentWorker).toBe(0);
        expect(slip.employer.unemployment).toBe(Math.round(750000 * 0.03));
    });

    it('en modo fijo paga el monto tal cual, como antes', () => {
        const slip = calculatePayslip({ ...concierge, calculation: 'fixed', afp: null }, SEPTEMBER_2026);
        expect(slip.netPay).toBe(600000);
        expect(slip.employerCost).toBe(600000);
    });

    it('rechaza una AFP desconocida o un plan de isapre vacío', () => {
        expect(() => calculatePayslip({ ...concierge, afp: 'Inventada' }, SEPTEMBER_2026)).toThrow(PayrollInputError);
        expect(() => calculatePayslip({ ...concierge, healthSystem: 'isapre' }, SEPTEMBER_2026)).toThrow(PayrollInputError);
    });
});

describe('liquidación en PDF', () => {
    it('genera una página con acentos sin romper la codificación', async () => {
        const { renderPayslipPdf } = await import('@/lib/finance/payslipPdf');
        const bytes = await renderPayslipPdf({
            communityName: 'Comunidad Edificio Ñuñoa',
            communityAddress: 'Av. Irarrázaval 1234',
            month: '2026-09',
            employee: { fullName: 'José Muñoz', roleTitle: 'Conserje', rut: '12.345.678-5' },
            slip: calculatePayslip({ ...concierge, familyDependents: 1 }, SEPTEMBER_2026),
            indicatorsMonth: '2026-09',
        });
        expect(Buffer.from(bytes.slice(0, 4)).toString()).toBe('%PDF');
    });
});
