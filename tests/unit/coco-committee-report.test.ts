import { describe, expect, it } from 'vitest';
import { cocoToolRisk } from '@/lib/agent-center/cocoRisk';
import { checkDigestPrivacy } from '@/lib/committeeDigest/privacy';
import { buildCommitteeReport, committeeReportPdf } from '@/lib/coco/committeeReport';
import { isToolAllowedForRole, MUTATING_TOOLS } from '@/lib/coco/tools';

describe('informe del comité', () => {
    it('usa la línea gráfica y solo totales', async () => {
        const report = buildCommitteeReport({
            community: 'Edificio Los Aromos',
            assemblies: 1,
            bookings: 3,
            requestedTitle: 'Deudores del mes $100.000',
            generatedOn: '2026-11-04',
        });
        expect('error' in report).toBe(false);
        if ('error' in report) return;
        expect(report.title).toBe('Informe para el comité');
        expect(report.note).toContain('título pedido');
        expect(report.html).toContain('#9C5636');
        expect(report.html).toContain('Convive Connect');
        expect(report.html).toContain('1 asamblea');
        expect(checkDigestPrivacy(report.paragraphs.join('\n')).ok).toBe(true);
        const pdf = Buffer.from(await committeeReportPdf(report));
        expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('lo pide la administración y queda para confirmar', () => {
        expect(MUTATING_TOOLS.has('draft_committee_report')).toBe(true);
        expect(cocoToolRisk('draft_committee_report')).toBe('write_high');
        expect(isToolAllowedForRole('draft_committee_report', 'admin')).toBe(true);
        expect(isToolAllowedForRole('draft_committee_report', 'resident')).toBe(false);
    });
});
