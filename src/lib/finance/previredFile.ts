import { splitRut } from '@/lib/utils/rut';
import type { PayrollContractType, PayrollIndicators, Payslip, PreviredWorker } from '@/lib/types';

// Formato de envío estándar de largo variable por separador, Previred v100
// (septiembre 2026): 105 campos por línea separados por ';'. Ningún campo se
// omite: los numéricos vacíos van en 0 y los alfanuméricos vacíos sin texto.
export const PREVIRED_FORMAT_VERSION = 'v100 (septiembre 2026)';
const FIELD_COUNT = 105;

// Tabla N°10.
export const PREVIRED_AFP_CODES: Record<string, string> = {
    cuprum: '03', habitat: '05', provida: '08', planvital: '29', capital: '33', modelo: '34', uno: '35',
};

// Tabla N°16.
export const PREVIRED_HEALTH_INSTITUTIONS: { code: string; name: string }[] = [
    { code: '01', name: 'Banmédica' },
    { code: '02', name: 'Consalud' },
    { code: '03', name: 'VidaTres' },
    { code: '04', name: 'Colmena' },
    { code: '05', name: 'Cruz Blanca' },
    { code: '10', name: 'Nueva Masvida' },
    { code: '11', name: 'Isalud' },
    { code: '12', name: 'Fundación' },
    { code: '25', name: 'Cruz del Norte' },
    { code: '28', name: 'Esencial' },
];
const FONASA_CODE = '07';

// Tabla N°7: movimiento de personal al contratar en el mes.
const HIRE_MOVEMENT: Record<PayrollContractType, string> = { indefinido: '1', plazo_fijo: '7', indefinido_11: '1' };

export class PreviredFileError extends Error {
    constructor(public problems: string[]) {
        super(`El archivo Previred no se puede generar: ${problems.join(' ')}`);
    }
}

export { splitRut } from '@/lib/utils/rut';

/** Mayúsculas sin tildes; Previred rechaza caracteres no alfabéticos. Conserva la Ñ. */
function previredName(value: string | null): string {
    return (value || '')
        .toUpperCase()
        .replace(/Ñ/g, '\u0000')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/\u0000/g, 'Ñ')
        .replace(/[^A-ZÑ ]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 30);
}

function familyTier(taxableIncome: number, dependents: number, indicators: PayrollIndicators): string {
    if (dependents <= 0) return 'D';
    const index = indicators.familyAllowance.findIndex(tier => tier.upTo === null || taxableIncome <= tier.upTo);
    return ['A', 'B', 'C'][index] || 'D';
}

function ufAmount(value: number): string {
    return value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '').replace('.', ',');
}

/**
 * Una línea por trabajador calculado con la ley chilena. Las personas en monto
 * fijo no se informan: no son trabajadores dependientes para Previred.
 */
export function buildPreviredFile(input: {
    month: string;
    indicators: PayrollIndicators;
    ccafCode: string;
    mutualCode: string;
    workers: PreviredWorker[];
}): string {
    const [year, month] = input.month.split('-');
    const period = `${month}${year}`;
    const problems: string[] = [];
    const lines: string[] = [];

    for (const worker of input.workers) {
        const slip: Payslip = worker.slip;
        if (slip.calculation !== 'chile' || !slip.afp) continue;
        const who = worker.fullName;
        const rut = worker.rut ? splitRut(worker.rut) : null;
        if (!rut) problems.push(`${who}: RUT ausente o inválido.`);
        if (!worker.firstNames || !worker.fatherLastName) problems.push(`${who}: faltan nombres o apellido paterno.`);
        if (!worker.sex) problems.push(`${who}: falta el sexo.`);
        const afpCode = PREVIRED_AFP_CODES[slip.afp.name];
        if (!afpCode) problems.push(`${who}: AFP sin código Previred (${slip.afp.name}).`);
        const isapre = slip.health.system === 'isapre';
        if (isapre && !worker.isapreCode) problems.push(`${who}: falta la isapre.`);
        if (!rut || !afpCode || (isapre && !worker.isapreCode)) continue;

        const pensionBase = Math.min(slip.taxableIncome, Math.round(input.indicators.afpCapUf * input.indicators.uf));
        const unemploymentBase = Math.min(slip.taxableIncome, Math.round(input.indicators.unemploymentCapUf * input.indicators.uf));
        const hiredThisMonth = worker.hireDate?.startsWith(input.month) ?? false;
        const hasCcaf = input.ccafCode !== '00';
        const hasMutual = input.mutualCode !== '00';
        const fonasaToCcaf = hasCcaf && !isapre ? Math.round(pensionBase * 0.042) : 0;

        const f: (string | number)[] = new Array(FIELD_COUNT + 1).fill(0);
        const set = (field: number, value: string | number) => { f[field] = value; };
        const alphanumeric = [3, 4, 5, 6, 11, 14, 16, 17, 18, 25, 35, 36, 37, 41, 46, 51, 52, 53, 54, 56, 57, 76, 104, 105];
        for (const field of alphanumeric) f[field] = '';

        set(1, rut.number);
        set(2, rut.dv);
        set(3, previredName(worker.fatherLastName));
        set(4, previredName(worker.motherLastName));
        set(5, previredName(worker.firstNames));
        set(6, worker.sex || '');
        set(7, worker.foreignNational ? 1 : 0);
        set(8, '01');
        set(9, period);
        set(10, period);
        set(11, 'AFP');
        set(12, 0);
        set(13, 30);
        set(14, '00');
        set(15, hiredThisMonth ? HIRE_MOVEMENT[worker.contractType] : '0');
        if (hiredThisMonth) {
            const [hy, hm, hd] = worker.hireDate!.split('-');
            set(16, `${hd}-${hm}-${hy}`);
        }
        set(18, familyTier(slip.taxableIncome, worker.familyDependents, input.indicators));
        set(19, worker.familyDependents);
        set(22, slip.familyAllowance);
        set(25, 'N');

        set(26, afpCode);
        set(27, pensionBase);
        set(28, slip.afp.amount + slip.employer.afp);
        set(29, slip.employer.sis);

        // Régimen AFP informa el tope AFP como renta para Fonasa e ISL.
        if (!isapre || !hasMutual) set(64, pensionBase);
        if (!isapre) set(70, slip.health.amount - fonasaToCcaf);
        if (!hasMutual) set(71, slip.employer.accidentInsurance);
        if (!hasCcaf && slip.familyAllowance) set(73, slip.familyAllowance);

        set(75, isapre ? worker.isapreCode! : FONASA_CODE);
        if (isapre) {
            set(77, pensionBase);
            set(78, 2);
            set(79, ufAmount(worker.isaprePlanUf || 0));
            set(80, slip.health.legalAmount);
            set(81, slip.health.amount - slip.health.legalAmount);
        }

        if (hasCcaf) {
            set(83, input.ccafCode);
            set(84, pensionBase);
            set(90, fonasaToCcaf);
            set(91, slip.familyAllowance);
        }
        set(93, worker.partTime ? 2 : 1);
        set(94, slip.employer.socialInsuranceDetail.expectativaDeVida || 0);
        set(95, slip.employer.socialInsuranceDetail.rentabilidadProtegida || 0);

        if (hasMutual) {
            set(96, input.mutualCode);
            set(97, pensionBase);
            set(98, slip.employer.accidentInsurance);
        }

        set(100, unemploymentBase);
        set(101, slip.unemploymentWorker);
        set(102, slip.employer.unemployment);

        lines.push(f.slice(1).join(';'));
    }

    if (problems.length) throw new PreviredFileError(problems);
    if (!lines.length) throw new PreviredFileError(['No hay trabajadores con liquidación legal en ese mes.']);
    return lines.join('\r\n') + '\r\n';
}
