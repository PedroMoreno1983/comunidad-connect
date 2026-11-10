import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
import { researchChileanLaw } from '@/lib/coco/normaResearch';

function rpcOk(text: string) {
    return { ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text }] } }) };
}

describe('CoCo: investigación jurídica en Norma', () => {
    beforeEach(() => {
        vi.stubEnv('NORMA_MCP_KEY', 'nmcp_test');
        vi.stubEnv('NORMA_MCP_URL', '');
    });
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it('llama la herramienta de jurisprudencia con la llave como Bearer y devuelve el JSON', async () => {
        const fetchMock = vi.fn().mockResolvedValue(rpcOk('{"ok":true,"masPertinentes":[{"rol":"Rol N° 105013-2023"}]}'));
        vi.stubGlobal('fetch', fetchMock);
        const result = await researchChileanLaw({ source: 'jurisprudencia', query: 'cobro gastos comunes', tribunal: 'CORTE_SUPREMA', limit: 3 });

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://norma.datawiseconsultoria.com/api/mcp');
        expect(init.headers.Authorization).toBe('Bearer nmcp_test');
        expect(JSON.parse(init.body)).toMatchObject({
            method: 'tools/call',
            params: { name: 'buscar_jurisprudencia_judicial', arguments: { consulta: 'cobro gastos comunes', tribunal: 'CORTE_SUPREMA', limite: 3 } },
        });
        expect(result).toMatchObject({ source: 'jurisprudencia', result: { masPertinentes: [{ rol: 'Rol N° 105013-2023' }] } });
    });

    it('arma indicadores sin consulta y descarta unidades inventadas', async () => {
        const fetchMock = vi.fn().mockResolvedValue(rpcOk('{"UTM":68000}'));
        vi.stubGlobal('fetch', fetchMock);
        await researchChileanLaw({ source: 'indicadores', convert: [{ monto: 3, unidad: 'UTM' }, { monto: 1, unidad: 'BTC' }] });
        expect(JSON.parse(fetchMock.mock.calls[0][1].body).params).toEqual({
            name: 'indicadores_economicos', arguments: { convertir: [{ monto: 3, unidad: 'UTM' }] },
        });
    });

    it('rechaza fuentes fuera del catálogo y consultas vacías sin llamar a la red', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        expect(await researchChileanLaw({ source: 'https://evil.test', query: 'x' })).toHaveProperty('error');
        expect(await researchChileanLaw({ source: 'dictamenes_cgr', query: '   ' })).toHaveProperty('error');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('en la respuesta síncrona de Twilio no lanza búsquedas lentas; por el número compartido sí', async () => {
        const fetchMock = vi.fn().mockResolvedValue(rpcOk('{"ok":true}'));
        vi.stubGlobal('fetch', fetchMock);
        expect((await researchChileanLaw({ source: 'jurisprudencia', query: 'ruidos', syncReply: true })).error).toContain('app');
        expect(fetchMock).not.toHaveBeenCalled();
        await researchChileanLaw({ source: 'dictamenes_cgr', query: 'administrador', syncReply: true });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        await researchChileanLaw({ source: 'jurisprudencia', query: 'ruidos', syncReply: false });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('sin llave, deriva a la fuente BCN en vez de fingir', async () => {
        vi.stubEnv('NORMA_MCP_KEY', '');
        const result = await researchChileanLaw({ source: 'jurisprudencia', query: 'ruidos molestos' });
        expect(result.error).toContain('consult_official_legal_source');
    });

    it('si Norma falla, avisa que no se citen fallos sin verificar', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
        const result = await researchChileanLaw({ source: 'dictamenes_cgr', query: 'administrador condominio' });
        expect(result.error).toContain('No cites');
        expect(result).not.toHaveProperty('consultedAt');
    });

    it('propaga el error de herramienta de Norma (por ejemplo, cupo agotado)', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: { isError: true, content: [{ type: 'text', text: 'Cupo mensual agotado' }] } }) }));
        expect(await researchChileanLaw({ source: 'normativa', query: 'copropiedad' })).toEqual({ error: 'Cupo mensual agotado' });
    });
});
