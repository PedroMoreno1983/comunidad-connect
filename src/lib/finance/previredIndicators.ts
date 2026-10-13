import type { PayrollIndicators } from '@/lib/types';

export const PREVIRED_INDICATORS_URL = 'https://www.previred.com/indicadores-previsionales/';

const MONTHS = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const AFP_KEYS: Record<string, string> = {
    capital: 'capital', cuprum: 'cuprum', habitat: 'habitat', planvital: 'planvital',
    provida: 'provida', modelo: 'modelo', uno: 'uno',
};

export class IndicatorsParseError extends Error {}

/** HTML de Previred a celdas de texto separadas por '|', en el orden en que aparecen. */
export function flattenHtml(html: string): string {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, '|')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#8211;/g, '-')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .replace(/(\s*\|\s*)+/g, '|');
}

const pesos = (text: string) => Number(text.replace(/[^\d,]/g, '').replace(',', '.'));
// Previred mezcla "1,78%" y "0.90%" en la misma página.
const percent = (text: string) => Number(text.replace('%', '').replace(/R\.I\./, '').trim().replace(',', '.')) / 100;

function cellAfter(cells: string[], label: RegExp, offset = 1): string {
    const index = cells.findIndex(cell => label.test(cell));
    if (index < 0 || !cells[index + offset]) {
        throw new IndicatorsParseError(`No encontré "${label.source}" en la página de Previred.`);
    }
    return cells[index + offset];
}

/**
 * Lee los indicadores de la página pública de Previred. Falla en vez de adivinar:
 * si la página cambia de forma, es mejor no cargar el mes que cargarlo mal.
 */
export function parsePreviredIndicators(html: string): { month: string; values: PayrollIndicators } {
    const text = flattenHtml(html);
    const period = text.match(/remuneraciones\s+([a-záéíóú]+)\s+(\d{4})/i);
    const monthIndex = period ? MONTHS.indexOf(period[1].toLowerCase()) : -1;
    if (!period || monthIndex < 0) throw new IndicatorsParseError('No encontré el período de remuneraciones.');
    const month = `${period[2]}-${String(monthIndex + 1).padStart(2, '0')}`;

    const cells = text.split('|').map(cell => cell.trim()).filter(Boolean);
    const uf = pesos(cellAfter(cells, /^Al \d+ de \S+ del \d{4}:$/));
    // El tope viene en la etiqueta: "Para afiliados a una AFP (90 UF):".
    const capInLabel = (label: RegExp) => Number(
        cells.find(cell => label.test(cell))?.match(/\(([\d,]+) UF\)/)?.[1].replace(',', '.'),
    );
    const afpCapUf = capInLabel(/^Para afiliados a una AFP \(/);
    const unemploymentCapUf = capInLabel(/^Para Seguro de Cesantía \(/);

    const afpWorkerRates: Record<string, number> = {};
    let employerAfpRate = NaN;
    for (const [label, key] of Object.entries(AFP_KEYS)) {
        const index = cells.findIndex(cell => cell.toLowerCase() === label);
        if (index < 0) throw new IndicatorsParseError(`No encontré la AFP ${label}.`);
        afpWorkerRates[key] = percent(cells[index + 1]);
        employerAfpRate = percent(cells[index + 2]);
    }

    const utmIndex = cells.findIndex(cell => /^\S+ \d{4}$/.test(cell) && cells[cells.indexOf(cell) - 1] === 'UTA');
    const utm = utmIndex >= 0 ? pesos(cells[utmIndex + 1]) : NaN;
    const minimumWage = pesos(cellAfter(cells, /^Trab\. Dependientes e Independientes:$/));
    const rentabilidadProtegida = percent(cellAfter(cells, /^Rentabilidad Protegida$/));
    const expectativaDeVida = percent(cellAfter(cells, /^Expectativa de Vida$/));
    const sisRate = percent(cellAfter(cells, /^Seguro de Invalidez y Sobrevivencia \(SIS\)/));

    const unemploymentRow = (label: RegExp) => {
        const employer = percent(cellAfter(cells, label, 1));
        const workerCell = cellAfter(cells, label, 2);
        return { employer, worker: workerCell === '-' ? 0 : percent(workerCell) };
    };

    const familyAllowance = [/^1 \(A\)$/, /^2 \(B\)$/, /^3 \(C\)$/].map(label => ({
        amount: pesos(cellAfter(cells, label, 1)),
        upTo: pesos(cellAfter(cells, label, 2).split('<').pop() || ''),
    }));

    const values: PayrollIndicators = {
        uf,
        utm,
        minimumWage,
        afpCapUf,
        unemploymentCapUf,
        afpWorkerRates,
        employerAfpRate,
        sisRate,
        socialInsuranceRates: { rentabilidadProtegida, expectativaDeVida },
        unemployment: {
            indefinido: unemploymentRow(/^Plazo Indefinido$/),
            plazo_fijo: unemploymentRow(/^Plazo Fijo$/),
            indefinido_11: unemploymentRow(/^Plazo Indefinido 11 años o más/),
        },
        healthRate: 0.07,
        familyAllowance: [...familyAllowance, { upTo: null, amount: 0 }],
    };
    assertSane(values);
    return { month, values };
}

/** Rangos amplios pero imposibles de cumplir con un valor mal leído. */
function assertSane(v: PayrollIndicators) {
    const checks: [boolean, string][] = [
        [v.uf > 20000 && v.uf < 100000, `UF fuera de rango (${v.uf})`],
        [v.utm > 40000 && v.utm < 200000, `UTM fuera de rango (${v.utm})`],
        [v.minimumWage > 300000 && v.minimumWage < 2000000, `ingreso mínimo fuera de rango (${v.minimumWage})`],
        [v.afpCapUf > 60 && v.afpCapUf < 200, `tope AFP fuera de rango (${v.afpCapUf})`],
        [v.unemploymentCapUf > 90 && v.unemploymentCapUf < 300, `tope cesantía fuera de rango (${v.unemploymentCapUf})`],
        [Object.values(v.afpWorkerRates).every(rate => rate > 0.1 && rate < 0.13), 'tasa AFP fuera de rango'],
        [v.employerAfpRate >= 0 && v.employerAfpRate < 0.05, 'aporte empleador AFP fuera de rango'],
        [v.sisRate > 0.005 && v.sisRate < 0.05, 'SIS fuera de rango'],
        [Object.values(v.socialInsuranceRates).every(rate => rate >= 0 && rate < 0.05), 'Seguro Social fuera de rango'],
        [v.unemployment.indefinido.worker === 0.006 || (v.unemployment.indefinido.worker > 0 && v.unemployment.indefinido.worker < 0.02), 'cesantía trabajador fuera de rango'],
        [v.familyAllowance.slice(0, 3).every(tier => tier.amount > 0 && (tier.upTo || 0) > 100000), 'asignación familiar mal leída'],
    ];
    const failed = checks.filter(([ok]) => !ok).map(([, message]) => message);
    if (failed.length) throw new IndicatorsParseError(`Indicadores sospechosos: ${failed.join('; ')}.`);
}
