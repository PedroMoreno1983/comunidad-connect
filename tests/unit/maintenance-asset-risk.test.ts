import { describe, expect, it } from 'vitest';
import { levelFor, scoreAssetRisks, type RiskAsset } from '@/lib/maintenance/assetRisk';
import { planPreventiveMaintenance } from '@/lib/maintenance/preventivePlan';

const TODAY = '2026-10-14';
const asset = (over: Partial<RiskAsset>): RiskAsset => ({
    id: 'a1', name: 'Bomba A', category: 'pump', health_status: 'optimal',
    last_maintenance: '2026-10-01', next_maintenance: null, installation_date: '2024-01-01', ...over,
});
const failure = (date: string, cost = 100000, assetId = 'a1') => ({ asset_id: assetId, task_id: null, cost, date });

describe('asset risk scoring', () => {
    it('a young, well kept asset is low risk with no reasons', () => {
        const [risk] = scoreAssetRisks({ assets: [asset({})], tasks: [], logs: [], today: TODAY });
        expect(risk).toMatchObject({ score: 0, level: 'low', reasons: [], meanDaysBetweenFailures: null });
    });

    it('age past lifespan, repeated and accelerating failures add up to high risk', () => {
        const logs = [failure('2026-03-01'), failure('2026-06-01'), failure('2026-08-15'), failure('2026-09-25')];
        const [risk] = scoreAssetRisks({ assets: [asset({ installation_date: '2012-01-01' })], tasks: [], logs, today: TODAY });
        expect(risk.level).toBe('high');
        expect(risk.score).toBe(30 + 20 + 10); // edad + 3 fallas en 6 meses + aceleración
        expect(risk.reasons.join(' ')).toContain('vida útil');
        expect(risk.reasons.join(' ')).toContain('se están acercando');
        expect(risk.correctiveLast180).toBe(3);
        expect(risk.meanDaysBetweenFailures).toBe(69);
    });

    it('preventive logs (with task_id) are not counted as failures', () => {
        const logs = [{ ...failure('2026-08-01'), task_id: 't1' }, { ...failure('2026-09-01'), task_id: 't2' }];
        const [risk] = scoreAssetRisks({ assets: [asset({})], tasks: [], logs, today: TODAY });
        expect(risk.correctiveLast180).toBe(0);
    });

    it('overdue preventive work and cost far above the building median raise risk', () => {
        const assets = [asset({ id: 'a1', last_maintenance: '2026-05-01' }), asset({ id: 'a2', name: 'Bomba B' }), asset({ id: 'a3', name: 'Bomba C' })];
        const logs = [failure('2026-05-01', 900000, 'a1'), failure('2026-05-01', 100000, 'a2'), failure('2026-05-01', 120000, 'a3')];
        const risks = scoreAssetRisks({ assets, tasks: [], logs, today: TODAY });
        expect(risks[0].assetId).toBe('a1');
        expect(risks[0].reasons.join(' ')).toContain('atrasada');
        expect(risks[0].reasons.join(' ')).toContain('mediana');
        expect(risks[0].cost12m).toBe(900000);
    });

    it('levels have fixed thresholds', () => {
        expect([levelFor(29), levelFor(30), levelFor(59), levelFor(60)]).toEqual(['low', 'medium', 'medium', 'high']);
    });

    it('high risk advances the next preventive task to within 7 days and raises priority', () => {
        const plan = planPreventiveMaintenance({
            assets: [asset({ category: 'gate', last_maintenance: '2026-10-01' })], tasks: [], today: TODAY,
            riskLevels: new Map([['a1', 'high']]),
        });
        expect(plan.newTasks[0]).toMatchObject({ dueDate: '2026-10-21', priority: 'high', riskAdvanced: true });
        expect(plan.assetUpdates[0]).toMatchObject({ healthStatus: 'warning', nextMaintenance: '2026-10-21' });
    });
});
