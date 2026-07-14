import { describe, expect, it } from 'vitest';
import { extractResidentQuery, isIndividualDebtQuery, looksReadOnlyRequest } from '../../src/lib/agent-center/intentSafety';

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

    it('does not classify an explicit write request as read only', () => {
        expect(looksReadOnlyRequest('crea un ticket para revisar el ascensor')).toBe(false);
    });
});
