import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
import { consultOfficialLegalSource } from '@/lib/coco/officialLegalSources';

afterEach(() => vi.unstubAllGlobals());

describe('CoCo: consulta jurídica oficial', () => {
    it('usa solo IDs oficiales permitidos y entrega fuente y fecha', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ html: [{ t: '<p>Artículo 6.- Los copropietarios contribuirán a los gastos comunes.</p>' }] }) });
        vi.stubGlobal('fetch', fetchMock);
        const result = await consultOfficialLegalSource('copropiedad', 'artículo 6 gastos comunes');
        expect(fetchMock.mock.calls[0][0]).toBe('https://nuevo.leychile.cl/servicios/Navegar/get_norma_json?idNorma=1174663');
        expect(result).toMatchObject({ url: 'https://www.bcn.cl/leychile/navegar?idNorma=1174663', found: true });
        expect(result.excerpts?.[0]).toContain('Artículo 6');
        expect(result.consultedAt).toBeTruthy();
    });

    it('rechaza fuentes arbitrarias y falla sin fingir vigencia', async () => {
        expect(await consultOfficialLegalSource('https://evil.test', 'reglamento')).toHaveProperty('error');
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
        const result = await consultOfficialLegalSource('oguc', 'permiso de construcción');
        expect(result.error).toContain('No pude verificar');
        expect(result).not.toHaveProperty('consultedAt');
    });
});
