/**
 * CoCo carga la nómina: revisar no crea cuentas; aplicar usa la misma carga
 * masiva de Admin › Onboarding y solo con las filas en revisión de esa comunidad.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const calls = vi.hoisted(() => ({ stage: vi.fn(), sync: vi.fn() }));
vi.mock('@/lib/onboarding/batchStaging', () => ({ stageResidentBatch: calls.stage }));
vi.mock('@/lib/onboarding/rosterSync', () => ({ syncResidentRoster: calls.sync }));

const db = vi.hoisted(() => ({ tables: {} as Record<string, Array<Record<string, unknown>>>, file: Buffer.from('nombre,casa\nAna,1\n') }));
vi.mock('@/lib/supabase/supabaseAdmin', () => ({
    getSupabaseAdmin: () => ({
        from(table: string) {
            const filters: Array<[string, unknown]> = [];
            const rows = () => (db.tables[table] || []).filter(row => filters.every(([key, value]) => row[key] === value));
            const builder = {
                select: () => builder,
                eq: (key: string, value: unknown) => { filters.push([key, value]); return builder; },
                gte: () => builder,
                order: () => builder,
                limit: () => builder,
                maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
                then(resolve: (value: { data: unknown[]; error: null }) => void) { resolve({ data: rows(), error: null }); },
            };
            return builder;
        },
        storage: { from: () => ({ download: async () => ({ data: new Blob([db.file]), error: null }) }) },
    }),
}));

import { applyResidentImport, previewResidentImport } from '@/lib/coco/residentImportTools';

const ADMIN = { id: 'admin-1', role: 'admin', communityId: 'palmas' };

beforeEach(() => {
    calls.stage.mockReset();
    calls.sync.mockReset();
    db.tables = {
        community_documents: [{ id: 'doc-1', community_id: 'palmas', file_name: 'nomina.csv', storage_path: 'palmas/admin-1/x.csv', uploaded_by: 'admin-1' }],
        onboarding_import_batches: [{ id: 'batch-1', community_id: 'palmas', status: 'review', created_by: 'admin-1', source: 'agent_center' }],
        onboarding_import_rows: [
            { id: 'r1', batch_id: 'batch-1', community_id: 'palmas', status: 'staged', name: 'Ana', unit_number: '1', email: 'ana@example.com', phone: '', raw_data: {} },
            { id: 'r2', batch_id: 'batch-1', community_id: 'palmas', status: 'synced', name: 'Ya cargado', unit_number: '2', email: '', phone: '', raw_data: {} },
        ],
    };
});

describe('revisar la nómina', () => {
    it('deja las filas en revisión y resume lo que encontró, sin crear cuentas', async () => {
        calls.stage.mockResolvedValue({ status: 200, payload: {
            batchId: 'batch-1', status: 'review', documents: [], rights: null,
            assessment: { validRows: 1, warnings: ['1 fila sin contacto'] },
            data: [{ id: 'r1', name: 'Ana', unit_id: '1', email: 'ana@example.com', phone: '', derechos_porcentaje: '' }],
        } });
        const preview = await previewResidentImport(ADMIN, { document_id: 'doc-1' });
        expect(calls.stage).toHaveBeenCalledWith(
            { id: 'admin-1', role: 'admin', community_id: 'palmas' },
            [expect.objectContaining({ name: 'nomina.csv', type: 'text/csv' })],
            'agent_center',
        );
        expect(preview).toMatchObject({ batch_id: 'batch-1', filas: 1, con_correo: 1 });
        expect(calls.sync).not.toHaveBeenCalled();
    });

    it('no abre archivos de otra comunidad', async () => {
        const preview = await previewResidentImport({ ...ADMIN, communityId: 'otra' }, { document_id: 'doc-1' });
        expect(preview).toHaveProperty('error');
        expect(calls.stage).not.toHaveBeenCalled();
    });

    it('sin document_id usa el último archivo que esta administración adjuntó', async () => {
        calls.stage.mockResolvedValue({ status: 200, payload: { batchId: 'batch-2', status: 'review', documents: [], rights: null, assessment: { validRows: 1, warnings: [] }, data: [{ id: 'r', name: 'Ana', unit_id: '1', email: '', phone: '', derechos_porcentaje: '' }] } });
        const preview = await previewResidentImport(ADMIN, {});
        expect(preview).toMatchObject({ batch_id: 'batch-2' });
    });

    it('solo la administración', async () => {
        expect(await previewResidentImport({ ...ADMIN, role: 'resident' }, { document_id: 'doc-1' })).toHaveProperty('error');
        expect(await applyResidentImport({ ...ADMIN, role: 'resident' }, { batch_id: 'batch-1' })).toHaveProperty('error');
    });
});

describe('aplicar la nómina', () => {
    it('carga solo las filas en revisión, con la misma lógica de Onboarding', async () => {
        calls.sync.mockResolvedValue({ status: 200, payload: { message: 'ok', processed: 1, success: 1, unitOnly: 0, errors: 0, destinations: [], rowResults: [] } });
        const result = await applyResidentImport(ADMIN, { batch_id: 'batch-1' });
        const [, body] = calls.sync.mock.calls[0];
        expect(body.batchId).toBe('batch-1');
        expect(body.residents.map((row: { name: string }) => row.name)).toEqual(['Ana']);
        expect(result).toMatchObject({ success: true, con_acceso: 1 });
    });

    it('en el turno siguiente, sin batch_id, toma el último lote en revisión de esta administración', async () => {
        calls.sync.mockResolvedValue({ status: 200, payload: { message: 'ok', processed: 1, success: 1, unitOnly: 0, errors: 0, destinations: [], rowResults: [] } });
        await applyResidentImport(ADMIN, {});
        expect(calls.sync.mock.calls[0][1].batchId).toBe('batch-1');
    });

    it('con dos nóminas en revisión no adivina: pregunta cuál por su código', async () => {
        db.tables.onboarding_import_batches.push({ id: 'batch-2-abcdef', community_id: 'palmas', status: 'review', created_by: 'admin-1', source: 'agent_center' });
        const result = await applyResidentImport(ADMIN, {});
        expect(result).toMatchObject({ error: expect.stringContaining('más de una nómina') });
        expect(calls.sync).not.toHaveBeenCalled();
        calls.sync.mockResolvedValue({ status: 200, payload: { message: 'ok', processed: 1, success: 1, unitOnly: 0, errors: 0, destinations: [], rowResults: [] } });
        await applyResidentImport(ADMIN, { codigo: 'batch-1' });
        expect(calls.sync.mock.calls[0][1].batchId).toBe('batch-1');
    });

    it('los derechos quedan provisorios si la administración no dio la fuente', async () => {
        calls.sync.mockResolvedValue({ status: 200, payload: { message: 'ok', processed: 1, success: 1, unitOnly: 0, errors: 0, destinations: [], rowResults: [] } });
        await applyResidentImport(ADMIN, { batch_id: 'batch-1' });
        expect(calls.sync.mock.calls[0][1].rightsSourceNote).toBe('');
        await applyResidentImport(ADMIN, { batch_id: 'batch-1', fuente: 'Reglamento 1998, art. 5' });
        expect(calls.sync.mock.calls[1][1].rightsSourceNote).toBe('Reglamento 1998, art. 5');
    });

    it('un lote de otra comunidad no se aplica', async () => {
        const result = await applyResidentImport({ ...ADMIN, communityId: 'otra' }, { batch_id: 'batch-1' });
        expect(result).toHaveProperty('error');
        expect(calls.sync).not.toHaveBeenCalled();
    });
});
