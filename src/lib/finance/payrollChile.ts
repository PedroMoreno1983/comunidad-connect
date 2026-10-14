import type { PayrollIndicators, Payslip, PayslipInput } from '@/lib/types';

// Impuesto único de segunda categoría, tabla mensual en UTM (art. 43 LIR).
// Los tramos están fijados por ley; lo que cambia cada mes es el valor de la UTM.
const INCOME_TAX_BRACKETS: { upToUtm: number; rate: number; rebateUtm: number }[] = [
    { upToUtm: 13.5, rate: 0, rebateUtm: 0 },
    { upToUtm: 30, rate: 0.04, rebateUtm: 0.54 },
    { upToUtm: 50, rate: 0.08, rebateUtm: 1.74 },
    { upToUtm: 70, rate: 0.135, rebateUtm: 4.49 },
    { upToUtm: 90, rate: 0.23, rebateUtm: 11.14 },
    { upToUtm: 120, rate: 0.304, rebateUtm: 17.8 },
    { upToUtm: 310, rate: 0.35, rebateUtm: 23.32 },
    { upToUtm: Infinity, rate: 0.4, rebateUtm: 38.82 },
];

// Gratificación del art. 50 del Código del Trabajo: 25% de lo devengado, con
// tope anual de 4,75 ingresos mínimos, pagado en doceavos.
const GRATIFICATION_RATE = 0.25;
const GRATIFICATION_CAP_MINIMUM_WAGES = 4.75;

const peso = (value: number) => Math.round(value);

export function incomeTax(taxBase: number, utm: number): number {
    if (taxBase <= 0) return 0;
    const inUtm = taxBase / utm;
    const bracket = INCOME_TAX_BRACKETS.find(item => inUtm <= item.upToUtm)!;
    return Math.max(0, peso(taxBase * bracket.rate - bracket.rebateUtm * utm));
}

export function gratificationFor(baseSalary: number, minimumWage: number): number {
    const cap = (GRATIFICATION_CAP_MINIMUM_WAGES * minimumWage) / 12;
    return peso(Math.min(baseSalary * GRATIFICATION_RATE, cap));
}

export function familyAllowanceFor(taxableIncome: number, dependents: number, indicators: PayrollIndicators): number {
    if (dependents <= 0) return 0;
    const tier = indicators.familyAllowance.find(item => item.upTo === null || taxableIncome <= item.upTo);
    return (tier?.amount || 0) * dependents;
}

export class PayrollInputError extends Error {}

/**
 * Liquidación mensual de un trabajador dependiente, mes completo trabajado.
 * Sin ausencias, horas extra, APV ni anticipos: esos casos se ingresan como
 * bono o quedan fuera hasta que el módulo los soporte.
 */
export function calculatePayslip(input: PayslipInput, indicators: PayrollIndicators): Payslip {
    const baseSalary = peso(input.baseSalary);
    if (!Number.isFinite(baseSalary) || baseSalary <= 0) {
        throw new PayrollInputError('El sueldo base debe ser mayor que cero.');
    }

    if (input.calculation === 'fixed') {
        return {
            calculation: 'fixed',
            baseSalary,
            gratification: 0,
            taxableBonus: 0,
            taxableIncome: baseSalary,
            mealAllowance: 0,
            transportAllowance: 0,
            familyAllowance: 0,
            grossPay: baseSalary,
            afp: null,
            health: { system: input.healthSystem, amount: 0, legalAmount: 0 },
            unemploymentWorker: 0,
            taxBase: 0,
            incomeTax: 0,
            totalDeductions: 0,
            netPay: baseSalary,
            employer: { sis: 0, afp: 0, socialInsurance: 0, socialInsuranceDetail: {}, unemployment: 0, accidentInsurance: 0, total: 0 },
            employerCost: baseSalary,
        };
    }

    const afpName = (input.afp || '').toLowerCase();
    const afpRate = indicators.afpWorkerRates[afpName];
    if (afpRate === undefined) {
        throw new PayrollInputError(`Falta la AFP o no está en los indicadores del mes (${input.afp || 'sin AFP'}).`);
    }
    if (input.healthSystem === 'isapre' && !(Number(input.isaprePlanUf) > 0)) {
        throw new PayrollInputError('Indica el valor del plan de isapre en UF.');
    }

    const gratification = input.gratification ? gratificationFor(baseSalary, indicators.minimumWage) : 0;
    const taxableBonus = Math.max(0, peso(input.taxableBonus));
    const taxableIncome = baseSalary + gratification + taxableBonus;

    const pensionBase = Math.min(taxableIncome, peso(indicators.afpCapUf * indicators.uf));
    const unemploymentBase = Math.min(taxableIncome, peso(indicators.unemploymentCapUf * indicators.uf));

    const afpAmount = peso(pensionBase * afpRate);
    const legalHealth = peso(pensionBase * indicators.healthRate);
    const healthAmount = input.healthSystem === 'isapre'
        ? Math.max(legalHealth, peso(Number(input.isaprePlanUf) * indicators.uf))
        : legalHealth;
    const unemploymentRates = indicators.unemployment[input.contractType];
    const unemploymentWorker = peso(unemploymentBase * unemploymentRates.worker);

    // Solo el 7% legal de salud rebaja la base tributable; el adicional de isapre no.
    const taxBase = Math.max(0, taxableIncome - afpAmount - legalHealth - unemploymentWorker);
    const tax = incomeTax(taxBase, indicators.utm);

    const mealAllowance = Math.max(0, peso(input.mealAllowance));
    const transportAllowance = Math.max(0, peso(input.transportAllowance));
    const familyAllowance = familyAllowanceFor(taxableIncome, input.familyDependents, indicators);

    const grossPay = taxableIncome + mealAllowance + transportAllowance + familyAllowance;
    const totalDeductions = afpAmount + healthAmount + unemploymentWorker + tax;

    // Cada aporte se redondea por separado: Previred los recibe en campos distintos.
    const socialInsuranceDetail = Object.fromEntries(
        Object.entries(indicators.socialInsuranceRates).map(([concept, rate]) => [concept, peso(pensionBase * rate)]),
    );
    const employer = {
        sis: peso(pensionBase * indicators.sisRate),
        afp: peso(pensionBase * indicators.employerAfpRate),
        socialInsurance: Object.values(socialInsuranceDetail).reduce((sum, amount) => sum + amount, 0),
        socialInsuranceDetail,
        unemployment: peso(unemploymentBase * unemploymentRates.employer),
        accidentInsurance: peso(pensionBase * input.accidentRate),
        total: 0,
    };
    employer.total = employer.sis + employer.afp + employer.socialInsurance + employer.unemployment + employer.accidentInsurance;

    return {
        calculation: 'chile',
        baseSalary,
        gratification,
        taxableBonus,
        taxableIncome,
        mealAllowance,
        transportAllowance,
        familyAllowance,
        grossPay,
        afp: { name: afpName, rate: afpRate, amount: afpAmount },
        health: { system: input.healthSystem, amount: healthAmount, legalAmount: legalHealth },
        unemploymentWorker,
        taxBase,
        incomeTax: tax,
        totalDeductions,
        netPay: grossPay - totalDeductions,
        employer,
        // La asignación familiar la paga el empleador y la descuenta de lo que
        // entera en Previred: no es costo para la comunidad.
        employerCost: grossPay - familyAllowance + employer.total,
    };
}
