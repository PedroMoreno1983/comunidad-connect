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
            sis: 13350, afp: 750, socialInsurance: 12150,
            socialInsuranceDetail: { rentabilidadProtegida: 6750, expectativaDeVida: 5400 },
            unemployment: 18000, accidentInsurance: 6975, total: 51225,
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

describe('indicadores desde la página de Previred', () => {
    it('lee el mes y todos los valores tal como los usa el cálculo', async () => {
        const { readFileSync } = await import('node:fs');
        const { parsePreviredIndicators } = await import('@/lib/finance/previredIndicators');
        const html = readFileSync('tests/fixtures/previred-indicadores-2026-09.html', 'utf8');
        const parsed = parsePreviredIndicators(html);
        expect(parsed.month).toBe('2026-09');
        expect(parsed.values.socialInsuranceRates.rentabilidadProtegida).toBeCloseTo(0.009, 6);
        expect(parsed.values.socialInsuranceRates.expectativaDeVida).toBeCloseTo(0.0072, 6);
        const round = (value: unknown): unknown => typeof value === 'number'
            ? Math.round(value * 1e6) / 1e6
            : value && typeof value === 'object'
                ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, round(v)]))
                : value;
        expect(round(parsed.values)).toEqual(round({
            ...SEPTEMBER_2026,
            familyAllowance: SEPTEMBER_2026.familyAllowance.map(tier => ({ amount: tier.amount, upTo: tier.upTo })),
        }));
    });

    it('se niega a cargar una página que no reconoce', async () => {
        const { parsePreviredIndicators, IndicatorsParseError } = await import('@/lib/finance/previredIndicators');
        expect(() => parsePreviredIndicators('<html><body>Mantención programada</body></html>')).toThrow(IndicatorsParseError);
    });
});

describe('archivo Previred de 105 campos', () => {
    const worker = (overrides: Partial<import('@/lib/types').PreviredWorker> = {}): import('@/lib/types').PreviredWorker => ({
        fullName: 'José Muñoz Pérez',
        rut: '12.345.678-5',
        firstNames: 'José Andrés',
        fatherLastName: 'Muñoz',
        motherLastName: 'Pérez',
        sex: 'M',
        foreignNational: false,
        contractType: 'indefinido',
        hireDate: '2024-03-01',
        familyDependents: 0,
        isapreCode: null,
        isaprePlanUf: null,
        partTime: false,
        slip: calculatePayslip(concierge, SEPTEMBER_2026),
        ...overrides,
    });

    it('valida el RUT con módulo 11', async () => {
        const { splitRut } = await import('@/lib/finance/previredFile');
        expect(splitRut('12.345.678-5')).toEqual({ number: '12345678', dv: '5' });
        expect(splitRut('12.345.678-9')).toBeNull();
        expect(splitRut('10.000.013-k')).toEqual({ number: '10000013', dv: 'K' });
    });

    it('escribe exactamente 105 campos con los montos del cálculo', async () => {
        const { buildPreviredFile } = await import('@/lib/finance/previredFile');
        const text = buildPreviredFile({ month: '2026-09', indicators: SEPTEMBER_2026, ccafCode: '00', mutualCode: '00', workers: [worker()] });
        const lines = text.trimEnd().split('\r\n');
        expect(lines).toHaveLength(1);
        const f = ['', ...lines[0].split(';')];
        expect(f.length - 1).toBe(105);
        expect(f.slice(1, 16)).toEqual(['12345678', '5', 'MUÑOZ', 'PEREZ', 'JOSE ANDRES', 'M', '0', '01', '092026', '092026', 'AFP', '0', '30', '00', '0']);
        expect(f[18]).toBe('D');
        expect(f[26]).toBe('05');
        expect(f[27]).toBe('750000');
        expect(f[28]).toBe(String(84525 + 750));
        expect(f[29]).toBe('13350');
        expect(f[64]).toBe('750000');
        expect(f[70]).toBe('52500');
        expect(f[71]).toBe('6975');
        expect(f[75]).toBe('07');
        expect(f[93]).toBe('1');
        expect(f[94]).toBe('5400');
        expect(f[95]).toBe('6750');
        expect([f[100], f[101], f[102]]).toEqual(['750000', '4500', '18000']);
    });

    it('con isapre, CCAF y mutual reparte la salud y el seguro de accidentes donde corresponde', async () => {
        const { buildPreviredFile } = await import('@/lib/finance/previredFile');
        const slip = calculatePayslip({ ...concierge, healthSystem: 'isapre', isaprePlanUf: 4.0241 }, SEPTEMBER_2026);
        const text = buildPreviredFile({
            month: '2026-09', indicators: SEPTEMBER_2026, ccafCode: '02', mutualCode: '01',
            workers: [worker({ slip, isapreCode: '01', isaprePlanUf: 4.0241, hireDate: '2026-09-15', contractType: 'plazo_fijo' })],
        });
        const f = ['', ...text.trimEnd().split(';')];
        expect([f[15], f[16]]).toEqual(['7', '15-09-2026']);
        expect([f[70], f[71]]).toEqual(['0', '0']);
        expect([f[75], f[77], f[78], f[79]]).toEqual(['01', '750000', '2', '4,0241']);
        expect(Number(f[80]) + Number(f[81])).toBe(slip.health.amount);
        expect([f[83], f[84]]).toEqual(['02', '750000']);
        expect([f[96], f[97], f[98]]).toEqual(['01', '750000', '6975']);
    });

    it('no genera un archivo que Previred va a rechazar', async () => {
        const { buildPreviredFile, PreviredFileError } = await import('@/lib/finance/previredFile');
        expect(() => buildPreviredFile({
            month: '2026-09', indicators: SEPTEMBER_2026, ccafCode: '00', mutualCode: '00',
            workers: [worker({ rut: '11.111.111-2', sex: null })],
        })).toThrow(PreviredFileError);
    });
});
