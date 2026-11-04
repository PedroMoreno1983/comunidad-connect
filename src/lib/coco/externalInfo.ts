/**
 * Búsqueda web y lectura de páginas oficiales (MINVU, SEREMI, DOM, BCN).
 * Solo HTTPS y solo dominios de la lista. No sigue un salto hacia otro sitio.
 */

const OFFICIAL_SUFFIXES = ['minvu.cl', 'bcn.cl', 'leychile.cl', 'gob.cl', 'mun.cl'];

export function officialUrlAllowed(value: string): boolean {
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:') return false;
        if (url.username || url.password) return false;
        const host = url.hostname.toLowerCase().replace(/\.$/, '');
        return OFFICIAL_SUFFIXES.some(suffix => host === suffix || host.endsWith(`.${suffix}`));
    } catch {
        return false;
    }
}

export function readableExcerpt(html: string, query: string): { title: string; excerpt: string } {
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 180);
    const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/\s+/g, ' ')
        .trim();
    const terms = (query.toLocaleLowerCase('es-CL').match(/[\p{L}\p{N}]{4,}/gu) || []).slice(0, 6);
    const lower = text.toLocaleLowerCase('es-CL');
    const at = terms.map(term => lower.indexOf(term)).find(index => index >= 0) ?? 0;
    const start = Math.max(0, at - 180);
    return { title, excerpt: text.slice(start, start + 900) };
}

export type WebSearchHit = { title: string; url: string; snippet: string };

export function mapBraveResults(payload: unknown): WebSearchHit[] {
    const web = payload && typeof payload === 'object' ? (payload as { web?: { results?: unknown[] } }).web : undefined;
    return (web?.results || []).slice(0, 5).flatMap(item => {
        if (!item || typeof item !== 'object') return [];
        const row = item as { title?: unknown; url?: unknown; description?: unknown };
        const url = typeof row.url === 'string' ? row.url : '';
        const title = typeof row.title === 'string' ? row.title : '';
        if (!url.startsWith('https://') || !title) return [];
        return [{ title: title.slice(0, 180), url, snippet: typeof row.description === 'string' ? row.description.slice(0, 280) : '' }];
    });
}

export function mapDuckDuckGoResults(payload: unknown): WebSearchHit[] {
    if (!payload || typeof payload !== 'object') return [];
    const body = payload as { AbstractText?: unknown; AbstractURL?: unknown; Heading?: unknown; RelatedTopics?: unknown[] };
    const hits: WebSearchHit[] = [];
    if (typeof body.AbstractURL === 'string' && body.AbstractURL.startsWith('https://') && typeof body.AbstractText === 'string' && body.AbstractText) {
        hits.push({
            title: typeof body.Heading === 'string' && body.Heading ? body.Heading.slice(0, 180) : body.AbstractURL,
            url: body.AbstractURL,
            snippet: body.AbstractText.slice(0, 280),
        });
    }
    for (const topic of body.RelatedTopics || []) {
        if (hits.length >= 5 || !topic || typeof topic !== 'object') continue;
        const row = topic as { Text?: unknown; FirstURL?: unknown };
        if (typeof row.FirstURL === 'string' && row.FirstURL.startsWith('https://') && typeof row.Text === 'string' && row.Text) {
            hits.push({ title: row.Text.slice(0, 180), url: row.FirstURL, snippet: row.Text.slice(0, 280) });
        }
    }
    return hits;
}

async function readLimited(response: Response): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) return (await response.text()).slice(0, 200_000);
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        total += value.byteLength;
        if (total > 200_000) break;
        chunks.push(value);
    }
    reader.cancel().catch(() => undefined);
    return Buffer.concat(chunks).toString('utf8').slice(0, 200_000);
}

export async function searchPublicWeb(query: string): Promise<{ provider: string; results: WebSearchHit[]; note?: string }> {
    const q = query.trim().slice(0, 180);
    if (q.length < 3) return { provider: 'none', results: [], note: 'La búsqueda es demasiado corta.' };
    const braveKey = process.env.BRAVE_SEARCH_API_KEY?.trim();
    try {
        if (braveKey) {
            const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=5`, {
                headers: { Accept: 'application/json', 'X-Subscription-Token': braveKey },
                signal: AbortSignal.timeout(8_000),
            });
            if (!response.ok) throw new Error('brave');
            return { provider: 'brave', results: mapBraveResults(await response.json()) };
        }
        const response = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`, {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(8_000),
        });
        if (!response.ok) throw new Error('duckduckgo');
        const results = mapDuckDuckGoResults(await response.json());
        return {
            provider: 'duckduckgo',
            results,
            note: results.length ? 'Resultados de la respuesta instantánea. Si falta la fuente oficial, usa read_official_page.' : 'No hubo resultados instantáneos. Prueba un enlace oficial directo.',
        };
    } catch {
        return { provider: braveKey ? 'brave' : 'duckduckgo', results: [], note: 'No pude buscar en la web ahora. No inventes el resultado.' };
    }
}

export async function readOfficialPage(rawUrl: string, query: string) {
    if (!officialUrlAllowed(rawUrl)) {
        return { error: 'Solo leo páginas HTTPS de MINVU, SEREMI (gob.cl), DOM municipal (mun.cl o minvu.cl) y BCN.' };
    }
    try {
        let current = rawUrl;
        let response = await fetch(current, {
            redirect: 'manual',
            headers: { Accept: 'text/html', 'User-Agent': 'ConviveConnect-CoCo/1.0' },
            signal: AbortSignal.timeout(8_000),
        });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
            const next = new URL(response.headers.get('location') || '', current).toString();
            if (!officialUrlAllowed(next)) return { error: 'La página redirige fuera de los sitios oficiales y no la seguí.' };
            current = next;
            response = await fetch(current, {
                redirect: 'manual',
                headers: { Accept: 'text/html', 'User-Agent': 'ConviveConnect-CoCo/1.0' },
                signal: AbortSignal.timeout(8_000),
            });
        }
        if (!response.ok) return { error: 'La página oficial no respondió. No afirmes su contenido.' };
        const html = await readLimited(response);
        const readable = readableExcerpt(html, query);
        if (!readable.excerpt) return { error: 'La página no trajo texto legible.' };
        return { url: current, ...readable, consultedAt: new Date().toISOString(), note: 'Fragmento de la página. Contrasta el enlace antes de concluir.' };
    } catch {
        return { error: 'No pude leer la página oficial ahora. No afirmes que la consultaste.' };
    }
}
