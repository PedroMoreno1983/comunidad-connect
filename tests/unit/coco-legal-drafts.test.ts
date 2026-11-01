import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
import { LEGAL_DRAFT_MARKER, legalDraftTypeNames, prepareLegalDraft } from '@/lib/coco/legalDrafts';
import { markdownToDocx } from '@/lib/coco/docx';
import { cocoToolRisk } from '@/lib/agent-center/cocoRisk';
import { TOOL_DEFINITIONS } from '@/lib/coco/tools';

afterEach(() => vi.unstubAllGlobals());

const okFetch = () => vi.fn().mockResolvedValue({ ok: true, json: async () => ({ html: [{ t: '<p>Artículo 10.- El contrato de trabajo contendrá: jornada, remuneración, asamblea, reglamento, gastos comunes, administrador, quórum, citación.</p>' }] }) });

describe('CoCo: borradores legales', () => {
    it('cubre los documentos clave de la industria', () => {
        expect(legalDraftTypeNames()).toEqual(expect.arrayContaining(['reglamento_copropiedad', 'contrato_trabajo_conserje', 'contrato_administracion', 'contrato_mantencion', 'acta_asamblea', 'convocatoria_asamblea']));
    });

    it('pide los datos faltantes en vez de inventarlos y cita solo lo verificado', async () => {
        vi.stubGlobal('fetch', okFetch());
        const draft = await prepareLegalDraft({ document_type: 'contrato_trabajo_conserje', known_data: { nombre_condominio: 'Edificio Prueba', trabajador: 'pendiente', remuneracion: '', inventado: 'x' } });
        expect(draft).toMatchObject({ header: LEGAL_DRAFT_MARKER, known_data: { nombre_condominio: 'Edificio Prueba' } });
        const missing = ('missing_fields' in draft ? draft.missing_fields : []).map(f => f.key);
        expect(missing).toEqual(expect.arrayContaining(['trabajador', 'remuneracion', 'jornada']));
        expect(missing).not.toContain('nombre_condominio');
        expect('verified_sources' in draft && draft.verified_sources.length).toBeGreaterThan(0);
        expect('verified_sources' in draft && draft.verified_sources[0].url).toContain('bcn.cl');
    });

    it('marca como no verificadas las referencias si BCN no responde', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
        const draft = await prepareLegalDraft({ document_type: 'reglamento_copropiedad' });
        expect('verified_sources' in draft && draft.verified_sources).toEqual([]);
        expect('unverified_references' in draft && draft.unverified_references.length).toBeGreaterThan(0);
    });

    it('rechaza tipos desconocidos', async () => {
        expect(await prepareLegalDraft({ document_type: 'escritura_compraventa' })).toHaveProperty('error');
    });

    it('es una herramienta de solo lectura declarada', () => {
        expect(cocoToolRisk('prepare_legal_draft')).toBe('read');
        expect(TOOL_DEFINITIONS.some(t => t.name === 'prepare_legal_draft')).toBe(true);
    });
});

describe('CoCo: exportación DOCX', () => {
    it('genera un Word legible con el texto del borrador', async () => {
        const file = markdownToDocx(`**${LEGAL_DRAFT_MARKER}**\n\n## Cláusula primera\n- Remuneración: [monto bruto] & <otro>\n1. Jornada`);
        expect(file.subarray(0, 2).toString()).toBe('PK');
        const mammoth = await import('mammoth');
        const text = (await mammoth.extractRawText({ buffer: file })).value;
        expect(text).toContain(LEGAL_DRAFT_MARKER);
        expect(text).toContain('Cláusula primera');
        expect(text).toContain('[monto bruto] & <otro>');
    });
});
