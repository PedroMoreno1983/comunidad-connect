import 'server-only';

const SOURCES = {
    copropiedad: { title: 'Ley 21.442 de Copropiedad Inmobiliaria', id: '1174663' },
    reglamento_copropiedad: { title: 'Decreto 7 MINVU, Reglamento de la Ley 21.442', id: '1210089' },
    administradores: { title: 'Decreto 5 MINVU, Registro Nacional de Administradores', id: '1202148' },
    lguc: { title: 'DFL 458, Ley General de Urbanismo y Construcciones', id: '13560' },
    oguc: { title: 'Decreto 47, Ordenanza General de Urbanismo y Construcciones', id: '8201' },
    datos_personales: { title: 'Ley 21.719 de Protección de Datos Personales', id: '1209272' },
    privacidad_actual: { title: 'Ley 19.628 sobre Protección de la Vida Privada', id: '141599' },
    procedimiento_administrativo: { title: 'Ley 19.880 de Procedimiento Administrativo', id: '210676' },
    municipalidades: { title: 'DFL 1, Ley Orgánica de Municipalidades', id: '251693' },
    trabajo: { title: 'Código del Trabajo', id: '207436' },
    mascotas: { title: 'Ley 21.020 de Tenencia Responsable de Mascotas', id: '1106037' },
} as const;

export type OfficialLegalSource = keyof typeof SOURCES;

export function officialLegalSourceNames() { return Object.keys(SOURCES) as OfficialLegalSource[]; }

function plainText(html: string) {
    return html.replace(/<[^>]*>/g, ' ').replace(/&#(x[0-9a-f]+|\d+);/gi, (_match, code: string) => {
        const value = code.toLowerCase().startsWith('x') ? parseInt(code.slice(1), 16) : Number(code);
        return Number.isFinite(value) && value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : ' ';
    }).replace(/&(?:nbsp|amp|lt|gt|quot|apos);/gi, entity => ({
        '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
    })[entity.toLowerCase()] || ' ').replace(/\s+/g, ' ').trim();
}

export async function consultOfficialLegalSource(source: string, query: string) {
    if (!Object.prototype.hasOwnProperty.call(SOURCES, source)) return { error: 'Fuente no disponible en el catálogo oficial.' };
    const item = SOURCES[source as OfficialLegalSource];
    const url = `https://www.bcn.cl/leychile/navegar?idNorma=${item.id}`;
    const terms = (query.toLocaleLowerCase('es-CL').match(/[\p{L}\p{N}]{4,}/gu) || [])
        .filter(term => !['artículo', 'articulo', 'sobre', 'para', 'esta', 'este'].includes(term)).slice(0, 8);
    if (!terms.length) return { error: 'Indica un artículo o tema concreto para consultar.' };
    try {
        const response = await fetch(`https://nuevo.leychile.cl/servicios/Navegar/get_norma_json?idNorma=${item.id}`, {
            signal: AbortSignal.timeout(10_000), cache: 'no-store',
        });
        if (!response.ok) throw new Error(`BCN ${response.status}`);
        const body = await response.json() as { html?: Array<{ t?: string }> };
        const text = plainText((body.html || []).map(part => part.t || '').join(' '));
        if (!text) throw new Error('Texto oficial vacío');
        const lower = text.toLocaleLowerCase('es-CL');
        const positions = terms.flatMap(term => {
            const indexes: number[] = [];
            let cursor = 0;
            while (indexes.length < 30) {
                const index = lower.indexOf(term, cursor);
                if (index < 0) break;
                indexes.push(index);
                cursor = index + term.length;
            }
            return indexes;
        });
        const articleNumber = query.match(/art[ií]culo\s+(\d{1,3})/i)?.[1];
        const articlePosition = articleNumber
            ? lower.search(new RegExp(`art[ií]culo\\s+${articleNumber}(?!\\d)[°º.:-]?`, 'i')) : -1;
        const ranked = positions.map(position => ({
            position,
            score: terms.filter(term => lower.slice(Math.max(0, position - 250), position + 750).includes(term)).length
                + (articlePosition >= 0 && Math.abs(position - articlePosition) < 900 ? 10 : 0),
        })).sort((a, b) => b.score - a.score || a.position - b.position);
        const starts = [...new Set([...(articlePosition >= 0 ? [Math.max(0, articlePosition - 40)] : []),
            ...ranked.map(item => Math.max(0, item.position - 150))])];
        const excerpts = starts.slice(0, 5)
            .map(start => text.slice(start, start + 850));
        return {
            title: item.title, url, consultedAt: new Date().toISOString(),
            excerpts, found: excerpts.length > 0,
            note: source === 'datos_personales' && new Date() < new Date('2026-12-01T00:00:00-03:00')
                ? 'La Ley 21.719 tiene entrada en vigor diferida al 1 de diciembre de 2026. Para hechos anteriores consulta también la Ley 19.628 y verifica disposiciones transitorias.'
                : 'Fragmentos del texto disponible en BCN. Comprueba vigencia, artículo y contexto completo en el enlace antes de concluir.',
        };
    } catch {
        return { title: item.title, url, error: 'No pude verificar el texto oficial ahora. No afirmes que se consultó ni que está vigente.' };
    }
}
