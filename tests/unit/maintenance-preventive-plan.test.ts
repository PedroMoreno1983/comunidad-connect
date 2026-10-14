import { describe, expect, it } from 'vitest';
import { addFrequency, planPreventiveMaintenance, preventiveRuleFor, type PlanAsset } from '@/lib/maintenance/preventivePlan';

const TODAY = '2026-10-14';
const asset = (over: Partial<PlanAsset>): PlanAsset => ({
    id: 'a1', name: 'Ascensor torre A', category: 'elevator', health_status: 'optimal', last_maintenance: null, next_maintenance: null, ...over,
});

describe('preventive maintenance plan', () => {
    it('maps categories and Spanish aliases to a rule', () => {
        expect(preventiveRuleFor('elevator').frequency).toBe('monthly');
        expect(preventiveRuleFor('Extintores').frequency).toBe('annual');
        expect(preventiveRuleFor('portón').frequency).toBe('quarterly');
        expect(preventiveRuleFor('jardin').title).toBe('Inspección preventiva');
    });

    it('adds frequencies clamping to month end', () => {
        expect(addFrequency('2026-01-31', 'monthly')).toBe('2026-02-28');
        expect(addFrequency('2026-11-15', 'quarterly')).toBe('2027-02-15');
        expect(addFrequency('2026-10-14', 'annual')).toBe('2027-10-14');
    });

    it('schedules the next task from the last maintenance plus frequency', () => {
        const plan = planPreventiveMaintenance({ assets: [asset({ last_maintenance: '2026-10-01' })], tasks: [], today: TODAY });
        expect(plan.newTasks).toEqual([expect.objectContaining({ assetId: 'a1', dueDate: '2026-11-01', priority: 'high', frequency: 'monthly', catchUp: false })]);
        expect(plan.assetUpdates).toEqual([{ assetId: 'a1', nextMaintenance: '2026-11-01' }]);
    });

    it('brings late maintenance to today and flags the asset after 30 days', () => {
        const plan = planPreventiveMaintenance({ assets: [asset({ category: 'gate', last_maintenance: '2026-05-01' })], tasks: [], today: TODAY });
        expect(plan.newTasks[0]).toMatchObject({ dueDate: TODAY, catchUp: true, priority: 'high' });
        expect(plan.assetUpdates[0]).toMatchObject({ healthStatus: 'warning', nextMaintenance: TODAY });
    });

    it('never duplicates: an asset with an open task gets no new one', () => {
        const plan = planPreventiveMaintenance({
            assets: [asset({})],
            tasks: [{ id: 't1', asset_id: 'a1', status: 'pending', due_date: '2026-10-20' }],
            today: TODAY,
        });
        expect(plan.newTasks).toEqual([]);
        expect(plan.assetUpdates).toEqual([]);
    });

    it('marks pending tasks past due as overdue and does not touch critical health', () => {
        const plan = planPreventiveMaintenance({
            assets: [asset({ health_status: 'critical' })],
            tasks: [{ id: 't1', asset_id: 'a1', status: 'pending', due_date: '2026-08-01' }, { id: 't2', asset_id: null, status: 'completed', due_date: '2026-01-01' }],
            today: TODAY,
        });
        expect(plan.overdueTaskIds).toEqual(['t1']);
        expect(plan.assetUpdates).toEqual([]);
    });

    it('leaves far-away maintenance for later but records its date', () => {
        const plan = planPreventiveMaintenance({ assets: [asset({ category: 'extinguisher', last_maintenance: '2026-09-01' })], tasks: [], today: TODAY });
        expect(plan.newTasks).toEqual([]);
        expect(plan.scheduledLater).toBe(1);
        expect(plan.assetUpdates).toEqual([{ assetId: 'a1', nextMaintenance: '2027-09-01' }]);
    });

    it('uses next_maintenance when present and assets without history start today', () => {
        const plan = planPreventiveMaintenance({
            assets: [asset({ id: 'a1', next_maintenance: '2026-10-20' }), asset({ id: 'a2', name: 'Bomba', category: 'pump' })],
            tasks: [], today: TODAY,
        });
        expect(plan.newTasks.map(task => [task.assetId, task.dueDate])).toEqual([['a1', '2026-10-20'], ['a2', TODAY]]);
        expect(plan.assetUpdates).toEqual([{ assetId: 'a2', nextMaintenance: TODAY }]);
    });
});
