import { describe, expect, it } from 'vitest';
import { extractResidentQuery, extractUnitNumber, isIndividualDebtQuery, looksReadOnlyRequest } from '../../src/lib/agent-center/intentSafety';
import { buildIndividualDebtAction, preventReadOnlyMutation } from '../../src/lib/agent-center/intentActions';
import type { AgentAction } from '../../src/lib/agent-center/domain';

describe('Agent Center intent safety', () => {
    it('detects an individual resident debt question', () => {
        const message = 'necesito que me digas si la residente Andrea Dupré debe algo';
        expect(isIndividualDebtQuery(message)).toBe(true);
        expect(extractResidentQuery(message)).toBe('Andrea Dupré');
        expect(looksReadOnlyRequest(message)).toBe(true);
    });

    it('keeps collection workflows separate from individual lookups', () => {
        expect(isIndividualDebtQuery('revisar morosos y preparar cobranza')).toBe(false);
    });

    it.each([
        ['necesito saber si el depto 1204 debe algo', '1204'],
        ['necesito que me digas cuánto debe el dpto 1204', '1204'],
        ['debe algo el depto 1204?', '1204'],
        ['cuanto adeuda el dpto. N° 1204?', '1204'],
        ['saldo pendiente de la unidad A-302', 'A-302'],
        ['el departamento numero 509 tiene deuda?', '509'],
    ])('extracts the unit from a debt question: %s', (message, expectedUnit) => {
        expect(isIndividualDebtQuery(message)).toBe(true);
        expect(extractUnitNumber(message)).toBe(expectedUnit);
        expect(looksReadOnlyRequest(message)).toBe(true);
    });

    it('does not classify an explicit write request as read only', () => {
        expect(looksReadOnlyRequest('crea un ticket para revisar el ascensor')).toBe(false);
    });

    it('builds a read-only department lookup for administrators', () => {
        const result = buildIndividualDebtAction('debe algo el depto 1204?', {
            id: 'admin', role: 'admin', community_id: 'community',
        });
        expect(result.toolName).toBe('get_resident_expenses');
        expect(result.args).toEqual({ unitNumber: '1204' });
        expect(result.requiresConfirmation).toBe(false);
    });

    it.each(['hay reservas para manana?', 'dime si existe un ticket por el ascensor', 'consulta si hay visitas hoy'])
    ('blocks mutating fallbacks for read-only questions: %s', message => {
        const mutatingAction: AgentAction = {
            agentKey: 'maintenance', toolName: 'create_service_request', args: {}, requiresConfirmation: true,
            title: 'Crear', summary: 'Crear', targetHref: '/services',
        };
        expect(preventReadOnlyMutation(message, mutatingAction).toolName).toBe('clarify_intent');
    });
});
