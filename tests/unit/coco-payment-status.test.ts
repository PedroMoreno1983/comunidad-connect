import { describe, expect, it } from 'vitest';
import { summarizeResidentPaymentStatus } from '@/lib/coco/paymentStatus';
import { TOOL_DEFINITIONS } from '@/lib/coco/tools';

/**
 * Live 2026-08-27, residente Andrea Depto 1204:
 * - Home: "2 pago pendiente" y "$223.600 CLP Por pagar"
 * - /expenses: "Total a pagar antes del 02-ago $75.000 (Gasto común 2026-07)"
 * - CoCo con filtro al mes en curso (2026-08) respondía que no había cobro.
 *
 * get_payment_status debe devolver el mismo recorte que Home (todos los
 * pending/overdue) y señalar el gasto común vigente que muestra Mis Gastos.
 */
const ANDREA_ROWS = [
    {
        month: '2026-07',
        amount: 75000,
        status: 'pending',
        due_date: '2026-08-02',
        paid_at: null,
        items: [{ label: 'Gasto común 2026-07', amount: 75000 }],
    },
    {
        month: '2026-06',
        amount: 148600,
        status: 'pending',
        due_date: '2026-07-05',
        paid_at: null,
        items: [{ label: 'Gasto común 2026-06', amount: 148600 }],
    },
];

describe('summarizeResidentPaymentStatus', () => {
    it('matches the home hero: all pending payments, not only the current month', () => {
        const summary = summarizeResidentPaymentStatus(ANDREA_ROWS, null);

        expect(summary.al_dia).toBe(false);
        expect(summary.pending_count).toBe(2);
        expect(summary.pending_amount).toBe(223600);
        expect(summary.month_filter).toBeNull();
        expect(summary.latest_unpaid?.month).toBe('2026-07');
        expect(summary.latest_unpaid?.amount).toBe(75000);
        expect(summary.latest_unpaid?.concept).toMatch(/Gasto común 2026-07/);
        expect(summary.resumen).toMatch(/223\.600/);
        expect(summary.resumen).toMatch(/2 pagos pendientes/);
    });

    it('does not report al día when the current month has no issued expense but prior months are unpaid', () => {
        const augustOnly = ANDREA_ROWS.filter(row => row.month === '2026-08');
        expect(augustOnly).toHaveLength(0);

        const wronglyScoped = summarizeResidentPaymentStatus(augustOnly, '2026-08');
        expect(wronglyScoped.al_dia).toBe(true);

        const correctScope = summarizeResidentPaymentStatus(ANDREA_ROWS, null);
        expect(correctScope.al_dia).toBe(false);
        expect(correctScope.pending_amount).toBe(223600);
    });

    it('when a month is requested, only reports that period', () => {
        const summary = summarizeResidentPaymentStatus(
            ANDREA_ROWS.filter(row => row.month === '2026-07'),
            '2026-07',
        );
        expect(summary.month_filter).toBe('2026-07');
        expect(summary.pending_count).toBe(1);
        expect(summary.pending_amount).toBe(75000);
        expect(summary.latest_unpaid?.due_date).toBe('2026-08-02');
    });

    it('reports al día when every cobro is paid', () => {
        const summary = summarizeResidentPaymentStatus([
            { month: '2026-07', amount: 75000, status: 'paid', due_date: '2026-08-02', paid_at: '2026-08-01' },
        ]);
        expect(summary.al_dia).toBe(true);
        expect(summary.pending_count).toBe(0);
        expect(summary.pending_amount).toBe(0);
        expect(summary.latest_unpaid).toBeNull();
    });
});

describe('get_payment_status tool contract', () => {
    it('does not tell the model to default to the current month', () => {
        const def = (TOOL_DEFINITIONS as ReadonlyArray<{
            name: string;
            description: string;
            input_schema: { properties: Record<string, { description?: string }> };
        }>).find(tool => tool.name === 'get_payment_status');
        expect(def?.description).toMatch(/pendientes/i);
        expect(def?.description).not.toMatch(/mes actual/i);
        expect(def?.input_schema.properties.month?.description).toMatch(/pendientes/i);
        expect(def?.input_schema.properties.month?.description).not.toMatch(/mes actual/i);
    });
});
