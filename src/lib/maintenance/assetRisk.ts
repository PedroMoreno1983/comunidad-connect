/**
 * assetRisk.ts — Mantención predictiva: puntaje de riesgo por activo.
 *
 * Cálculo puro y explicable (sin caja negra): cada punto tiene una razón en
 * español que la administración puede leer y discutir. No pronostica una fecha
 * exacta de falla; ordena qué activo conviene mirar primero.
 *
 * Factores (máximo 100):
 *   - Edad frente a la vida útil típica del tipo de activo   hasta 30
 *   - Fallas correctivas en los últimos 180 días             hasta 30
 *   - Fallas que se aceleran (intervalo cada vez más corto)  10
 *   - Mantención preventiva atrasada                         hasta 20
 *   - Costo de 12 meses muy sobre la mediana del edificio    10
 *
 * Una falla correctiva es un registro de bitácora que no viene de una tarea
 * preventiva (task_id nulo).
 */
import { addFrequency, preventiveRuleFor, type PlanAsset, type PlanTask } from './preventivePlan';

export type RiskLevel = 'low' | 'medium' | 'high';

export const LIFESPAN_YEARS: Record<string, number> = {
    elevator: 25, pump: 12, generator: 20, electrical: 25, fire: 20, extinguisher: 10,
    gate: 10, boiler: 15, hvac: 12, other: 15,
};
export const RISK_HIGH = 60;
export const RISK_MEDIUM = 30;

export interface RiskAsset extends PlanAsset {
    installation_date?: string | null;
}

export interface RiskLog {
    asset_id: string | null;
    task_id: string | null;
    cost: number | string | null;
    date: string;
}

export interface AssetRisk {
    assetId: string;
    assetName: string;
    score: number;
    level: RiskLevel;
    reasons: string[];
    correctiveLast180: number;
    cost12m: number;
    /** Días promedio entre fallas correctivas (null con menos de 2 fallas). */
    meanDaysBetweenFailures: number | null;
}

function days(from: string, to: string) {
    return Math.round((Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
}

function categoryKey(category: string | null | undefined) {
    const rule = preventiveRuleFor(category);
    const entry = Object.entries(LIFESPAN_YEARS).find(([key]) => preventiveRuleFor(key) === rule);
    return entry ? entry[0] : 'other';
}

function median(values: number[]) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function levelFor(score: number): RiskLevel {
    return score >= RISK_HIGH ? 'high' : score >= RISK_MEDIUM ? 'medium' : 'low';
}

export function scoreAssetRisks(input: { assets: RiskAsset[]; tasks: PlanTask[]; logs: RiskLog[]; today: string }): AssetRisk[] {
    const today = input.today.slice(0, 10);
    const logsByAsset = new Map<string, RiskLog[]>();
    for (const log of input.logs) {
        if (!log.asset_id || log.date.slice(0, 10) > today) continue;
        logsByAsset.set(log.asset_id, [...(logsByAsset.get(log.asset_id) || []), log]);
    }
    const costOf = (assetId: string) => (logsByAsset.get(assetId) || [])
        .filter(log => days(log.date, today) <= 365)
        .reduce((sum, log) => sum + (Number(log.cost) || 0), 0);
    const buildingMedian = median(input.assets.map(asset => costOf(asset.id)).filter(cost => cost > 0));

    return input.assets.map(asset => {
        const reasons: string[] = [];
        let score = 0;
        const category = categoryKey(asset.category);

        // 1. Edad.
        if (asset.installation_date) {
            const ratio = days(asset.installation_date, today) / 365.25 / LIFESPAN_YEARS[category];
            const points = ratio >= 1 ? 30 : ratio > 0.6 ? Math.round(((ratio - 0.6) / 0.4) * 30) : 0;
            if (points) {
                score += points;
                reasons.push(ratio >= 1
                    ? `Superó su vida útil típica de ${LIFESPAN_YEARS[category]} años.`
                    : `Lleva el ${Math.round(ratio * 100)}% de su vida útil típica.`);
            }
        }

        // 2 y 3. Fallas correctivas y aceleración.
        const corrective = (logsByAsset.get(asset.id) || []).filter(log => !log.task_id)
            .map(log => log.date.slice(0, 10)).sort();
        const recent = corrective.filter(date => days(date, today) <= 180);
        if (recent.length >= 2) {
            const points = Math.min(30, (recent.length - 1) * 10);
            score += points;
            reasons.push(`${recent.length} fallas correctivas en los últimos 6 meses.`);
        }
        const gaps = corrective.slice(1).map((date, index) => days(corrective[index], date));
        if (gaps.length >= 2 && gaps[gaps.length - 1] < gaps[gaps.length - 2] * 0.75) {
            score += 10;
            reasons.push(`Las fallas se están acercando: la última llegó a ${gaps[gaps.length - 1]} días de la anterior, antes eran ${gaps[gaps.length - 2]}.`);
        }
        const meanDaysBetweenFailures = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null;

        // 4. Preventiva atrasada.
        const open = input.tasks.filter(task => task.asset_id === asset.id && ['pending', 'in_progress', 'overdue'].includes(task.status));
        const plannedDue = open.map(task => task.due_date.slice(0, 10)).sort()[0]
            || asset.next_maintenance?.slice(0, 10)
            || (asset.last_maintenance ? addFrequency(asset.last_maintenance, preventiveRuleFor(asset.category).frequency) : null);
        const late = plannedDue ? days(plannedDue, today) : 0;
        if (late > 0) {
            score += Math.min(20, Math.ceil(late / 30) * 7);
            reasons.push(`Mantención preventiva atrasada ${late} días.`);
        }

        // 5. Costo.
        const cost12m = costOf(asset.id);
        if (buildingMedian > 0 && cost12m > buildingMedian * 2) {
            score += 10;
            reasons.push('Su costo de los últimos 12 meses duplica la mediana del edificio.');
        }

        score = Math.min(100, score);
        return {
            assetId: asset.id, assetName: asset.name, score, level: levelFor(score), reasons,
            correctiveLast180: recent.length, cost12m, meanDaysBetweenFailures,
        };
    }).sort((a, b) => b.score - a.score || a.assetName.localeCompare(b.assetName));
}
