import { describe, expect, it } from 'vitest';
import { assessResidents, residentDedupeKey } from '../../src/lib/onboarding/documentExtractor';

describe('Onboarding document batches', () => {
    it('deduplicates by email and falls back to unit plus name', () => {
        expect(residentDedupeKey({ name: 'Andrea Dupré', unit_id: '1204', email: 'Andrea@Mail.cl', phone: '' })).toBe('email:andrea@mail.cl');
        expect(residentDedupeKey({ name: 'Andrea Dupré', unit_id: '1204', email: '', phone: '' })).toBe('unit-name:1204|andrea dupré');
    });

    it('assesses consolidated rows and warns about duplicate units', () => {
        const assessment = assessResidents([
            { name: 'Andrea', unit_id: '1204', email: 'a@example.com', phone: '' },
            { name: 'Pedro', unit_id: '1204', email: '', phone: '' },
            { name: '', unit_id: '1302', email: '', phone: '' },
        ]);
        expect(assessment.totalRows).toBe(3);
        expect(assessment.validRows).toBe(2);
        expect(assessment.duplicateUnits).toContain('1204');
        expect(assessment.warnings.length).toBeGreaterThan(0);
    });
});
