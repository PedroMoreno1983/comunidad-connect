import { describe, expect, it } from 'vitest';
import { isToolAllowedForRole, MUTATING_TOOLS } from '@/lib/coco/tools';
import { cocoToolRisk } from '@/lib/agent-center/cocoRisk';
import { cleanEmailDraft, normalizeSingleEmail } from '@/lib/coco/emailDraft';
import { mapBraveResults, mapDuckDuckGoResults, officialUrlAllowed, readableExcerpt } from '@/lib/coco/externalInfo';

describe('páginas oficiales y búsqueda', () => {
    it('solo acepta HTTPS de MINVU, SEREMI, DOM municipal y BCN', () => {
        expect(officialUrlAllowed('https://www.minvu.cl/permiso')).toBe(true);
        expect(officialUrlAllowed('https://www.bcn.cl/leychile')).toBe(true);
        expect(officialUrlAllowed('https://seremi.minvu.gob.cl/aviso')).toBe(true);
        expect(officialUrlAllowed('https://www.munistgo.mun.cl/dom')).toBe(true);
        expect(officialUrlAllowed('http://www.minvu.cl/permiso')).toBe(false);
        expect(officialUrlAllowed('https://example.com/minvu.cl')).toBe(false);
        expect(officialUrlAllowed('https://user:pass@www.minvu.cl/')).toBe(false);
    });

    it('saca un fragmento y no se queda con el script', () => {
        const readable = readableExcerpt('<html><title>DOM</title><script>secreto</script><p>Permiso de obra menor en la comuna.</p></html>', 'permiso');
        expect(readable.title).toBe('DOM');
        expect(readable.excerpt).toContain('Permiso de obra menor');
        expect(readable.excerpt).not.toContain('secreto');
    });

    it('normaliza resultados sin inventar una URL insegura', () => {
        expect(mapBraveResults({ web: { results: [
            { title: 'MINVU', url: 'https://www.minvu.cl', description: 'Vivienda' },
            { title: 'raro', url: 'http://inseguro.example', description: 'no' },
        ] } })).toEqual([{ title: 'MINVU', url: 'https://www.minvu.cl', snippet: 'Vivienda' }]);
        expect(mapDuckDuckGoResults({
            Heading: 'Copropiedad',
            AbstractURL: 'https://www.bcn.cl/ley',
            AbstractText: 'Ley de copropiedad',
        })).toEqual([{ title: 'Copropiedad', url: 'https://www.bcn.cl/ley', snippet: 'Ley de copropiedad' }]);
    });
});

describe('correo y agenda como herramientas', () => {
    it('el correo es un borrador de administración y la agenda se puede leer', () => {
        expect(MUTATING_TOOLS.has('draft_outbound_email')).toBe(true);
        expect(cocoToolRisk('draft_outbound_email')).toBe('write_high');
        expect(isToolAllowedForRole('draft_outbound_email', 'admin')).toBe(true);
        expect(isToolAllowedForRole('draft_outbound_email', 'resident')).toBe(false);
        expect(cocoToolRisk('search_public_web')).toBe('read');
        expect(cocoToolRisk('read_official_page')).toBe('read');
        expect(cocoToolRisk('list_community_agenda')).toBe('read');
        expect(isToolAllowedForRole('list_community_agenda', 'resident')).toBe(true);
    });

    it('rechaza un envío masivo y acepta un solo texto', () => {
        expect(normalizeSingleEmail(' Persona@Comunidad.cl ')).toBe('persona@comunidad.cl');
        expect(normalizeSingleEmail('no es correo')).toBeNull();
        expect(cleanEmailDraft('Aviso', 'Hola, te dejo el acta de la reunión de comité.')).toMatchObject({
            subject: 'Aviso',
        });
        expect(cleanEmailDraft('Aviso', 'BCC a todos los residentes de la lista de correos')).toEqual({
            error: 'Solo se envía un correo a una persona. No armes un envío masivo.',
        });
    });
});
