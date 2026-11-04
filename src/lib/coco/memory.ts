/**
 * Memoria unificada de CoCo, guardada en `agent_memories`.
 *
 * No es una tabla nueva: los hechos de la persona y los de la comunidad
 * (reglamento, proveedores, acuerdos) viven junto al resto de la memoria del
 * agente, marcados con `metadata.kind = coco_fact` para no mezclarlos con los
 * recuerdos vectoriales. `coco_user_memory` se sigue escribiendo para que lo
 * que ya la leía no se quede atrás.
 *
 * La memoria de la comunidad solo la escribe la administración. El servidor
 * usa service_role y por eso la revisión del rol está aquí, no solo en RLS.
 */

import { supabaseAdmin as supabase } from '@/lib/supabase/supabaseAdmin';
import { MAX_MEMORY_FACTS, buildMemoryContext, mergeFacts } from './user-memory';

export const MAX_COMMUNITY_FACTS = 40;
export const MAX_INJECTED_COMMUNITY_FACTS = 8;
export const COCO_FACT_KIND = 'coco_fact';

export const COMMUNITY_MEMORY_CATEGORIES = ['reglamento', 'proveedor', 'acuerdo', 'general'] as const;
export type CommunityMemoryCategory = (typeof COMMUNITY_MEMORY_CATEGORIES)[number];

export type CommunityFact = {
    fact: string;
    category: CommunityMemoryCategory;
};

const CATEGORY_LABEL: Record<CommunityMemoryCategory, string> = {
    reglamento: 'Reglamento',
    proveedor: 'Proveedor',
    acuerdo: 'Acuerdo',
    general: 'Comunidad',
};

const STOPWORDS = new Set([
    'para', 'como', 'esta', 'este', 'esto', 'tiene', 'sobre', 'desde', 'hasta', 'cuando',
    'donde', 'quien', 'porque', 'tambien', 'comunidad', 'unidad', 'quiero', 'puedes', 'favor',
]);

type DbError = { code?: string; message?: string } | null;

function relationMissing(error: DbError) {
    if (!error) return false;
    if (error.code && ['42P01', '42703', 'PGRST204', 'PGRST205'].includes(error.code)) return true;
    return /agent_memories|schema cache|does not exist|column/i.test(error.message || '');
}

function normalizeFact(value: string) {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function isCommunityCategory(value: string): value is CommunityMemoryCategory {
    return (COMMUNITY_MEMORY_CATEGORIES as readonly string[]).includes(value);
}

function tokens(message: string) {
    return normalizeFact(message.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
        .split(/[^a-z0-9]+/)
        .filter(token => token.length >= 3 && !STOPWORDS.has(token));
}

/**
 * Hechos que vale la pena poner en el prompt. Si el mensaje no toca ninguno,
 * quedan los tres más nuevos para no vaciar el contexto ni volcar los cuarenta.
 */
export function selectRelevantFacts<T extends { fact: string; category?: string }>(
    facts: T[],
    message: string,
    limit: number,
): T[] {
    if (!facts.length || limit <= 0) return [];
    const words = tokens(message);
    if (!words.length) return facts.slice(-Math.min(3, limit));

    const scored = facts.map((item, index) => {
        const haystack = normalizeFact(`${item.category || ''} ${item.fact}`);
        const score = words.reduce((total, word) => total + (haystack.includes(word) ? 1 : 0), 0);
        return { item, index, score };
    });
    const hits = scored.filter(row => row.score > 0);
    const pool = hits.length ? hits : scored.slice(-Math.min(3, limit));
    return pool
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .slice(0, limit)
        .sort((a, b) => a.index - b.index)
        .map(row => row.item);
}

export function buildUnifiedMemoryContext(userFacts: string[], communityFacts: CommunityFact[], message: string): string {
    const userBlock = buildMemoryContext(userFacts);
    const relevant = selectRelevantFacts(communityFacts, message, MAX_INJECTED_COMMUNITY_FACTS);
    if (!relevant.length) return userBlock;
    const communityBlock = `\n\n## Lo que sabes de esta comunidad (reglamento, proveedores y acuerdos)\n`
        + relevant.map(item => `- [${CATEGORY_LABEL[item.category]}] ${item.fact}`).join('\n')
        + `\nÚsalo solo cuando venga al caso. Solo la administración puede corregirlo.`;
    return `${userBlock}${communityBlock}`;
}

type MemoryRow = {
    id: string;
    content: string;
    category?: string | null;
    updated_at?: string | null;
};

async function readFactRows(filter: { userId?: string; communityId: string; scope: 'user' | 'community' }): Promise<MemoryRow[] | null> {
    let query = supabase
        .from('agent_memories')
        .select('id, content, category, updated_at')
        .eq('condominio_id', filter.communityId)
        .eq('scope', filter.scope)
        .contains('metadata', { kind: COCO_FACT_KIND })
        .order('updated_at', { ascending: true })
        .limit(filter.scope === 'user' ? MAX_MEMORY_FACTS : MAX_COMMUNITY_FACTS);
    if (filter.userId) query = query.eq('user_id', filter.userId);
    const { data, error } = await query;
    if (relationMissing(error)) return null;
    if (error || !data) return [];
    return data as MemoryRow[];
}

async function readLegacyUserFacts(userId: string): Promise<string[]> {
    const { data, error } = await supabase
        .from('coco_user_memory')
        .select('facts')
        .eq('user_id', userId)
        .maybeSingle();
    if (error || !data) return [];
    return Array.isArray(data.facts) ? (data.facts as unknown[]).map(String) : [];
}

async function mirrorLegacy(userId: string, communityId: string | null, facts: string[]) {
    await supabase
        .from('coco_user_memory')
        .upsert(
            { user_id: userId, community_id: communityId, facts, updated_at: new Date().toISOString() },
            { onConflict: 'user_id' },
        );
}

export async function getUserMemory(userId: string, communityId?: string | null): Promise<string[]> {
    if (!userId) return [];
    if (communityId) {
        const rows = await readFactRows({ userId, communityId, scope: 'user' });
        if (rows && rows.length) return rows.map(row => row.content);
        if (rows && rows.length === 0) {
            const legacy = await readLegacyUserFacts(userId);
            return legacy;
        }
    }
    return readLegacyUserFacts(userId);
}

async function replaceUserFacts(userId: string, communityId: string, role: string, facts: string[]) {
    const existing = await readFactRows({ userId, communityId, scope: 'user' });
    if (existing === null) return false;
    const wanted = new Map(facts.map((fact, position) => [normalizeFact(fact), { fact, position }]));
    for (const row of existing) {
        if (!wanted.has(normalizeFact(row.content))) {
            await supabase.from('agent_memories').delete().eq('id', row.id);
        }
    }
    const now = new Date().toISOString();
    for (const { fact, position } of wanted.values()) {
        const current = existing.find(row => normalizeFact(row.content) === normalizeFact(fact));
        if (current) {
            await supabase.from('agent_memories').update({
                content: fact,
                category: 'preferencia',
                updated_at: now,
                metadata: { kind: COCO_FACT_KIND, source: 'coco_chat', position },
            }).eq('id', current.id);
            continue;
        }
        const { error } = await supabase.from('agent_memories').insert({
            condominio_id: communityId,
            user_id: userId,
            role: role.slice(0, 50) || 'resident',
            content: fact,
            importance: 0.5,
            scope: 'user',
            category: 'preferencia',
            metadata: { kind: COCO_FACT_KIND, source: 'coco_chat', position },
            updated_at: now,
        });
        if (error) return false;
    }
    return true;
}

export async function rememberFact(
    userId: string,
    communityId: string | null,
    fact: string,
    role = 'resident',
): Promise<string[]> {
    if (!userId) return [];
    const current = await getUserMemory(userId, communityId);
    const facts = mergeFacts(current, fact);
    if (communityId) {
        const saved = await replaceUserFacts(userId, communityId, role, facts);
        if (!saved) console.warn('[coco] rememberFact no pudo escribir agent_memories');
    }
    await mirrorLegacy(userId, communityId, facts);
    return facts;
}

export async function forgetUserMemory(userId: string, communityId?: string | null): Promise<void> {
    if (!userId) return;
    if (communityId) {
        const rows = await readFactRows({ userId, communityId, scope: 'user' });
        if (rows?.length) {
            await supabase.from('agent_memories').delete().in('id', rows.map(row => row.id));
        }
    } else {
        const { error } = await supabase
            .from('agent_memories')
            .delete()
            .eq('user_id', userId)
            .contains('metadata', { kind: COCO_FACT_KIND });
        if (error && !relationMissing(error)) console.warn('[coco] forgetUserMemory:', error.message);
    }
    await supabase.from('coco_user_memory').delete().eq('user_id', userId);
}

export async function getCommunityMemory(communityId: string): Promise<CommunityFact[]> {
    if (!communityId) return [];
    const rows = await readFactRows({ communityId, scope: 'community' });
    if (!rows) return [];
    return rows.map(row => ({
        fact: row.content,
        category: isCommunityCategory(String(row.category || '')) ? row.category as CommunityMemoryCategory : 'general',
    }));
}

export async function rememberCommunityFact(
    actor: { userId?: string; role?: string; communityId?: string | null },
    fact: string,
    category: string,
): Promise<{ facts: CommunityFact[] } | { error: string }> {
    if (actor.role !== 'admin') return { error: 'Solo la administración puede guardar memoria de la comunidad.' };
    if (!actor.userId || !actor.communityId) return { error: 'No pude identificar a la administración ni a la comunidad.' };
    if (!isCommunityCategory(category)) return { error: 'La categoría tiene que ser reglamento, proveedor, acuerdo o general.' };
    const cleaned = fact.trim().replace(/\s+/g, ' ').slice(0, 240);
    if (!cleaned) return { error: 'No hay nada que recordar.' };

    const current = await getCommunityMemory(actor.communityId);
    const without = current.filter(item => normalizeFact(item.fact) !== normalizeFact(cleaned));
    const next = [...without, { fact: cleaned, category }].slice(-MAX_COMMUNITY_FACTS);
    const rows = await readFactRows({ communityId: actor.communityId, scope: 'community' });
    if (rows === null) return { error: 'La memoria de la comunidad todavía no está disponible. Falta aplicar la migración.' };

    const keep = new Set(next.map(item => normalizeFact(item.fact)));
    for (const row of rows) {
        if (!keep.has(normalizeFact(row.content))) {
            await supabase.from('agent_memories').delete().eq('id', row.id);
        }
    }
    const now = new Date().toISOString();
    for (const [position, item] of next.entries()) {
        const currentRow = rows.find(row => normalizeFact(row.content) === normalizeFact(item.fact));
        if (currentRow) {
            await supabase.from('agent_memories').update({
                content: item.fact,
                category: item.category,
                updated_at: now,
                metadata: { kind: COCO_FACT_KIND, source: 'coco_chat', position },
            }).eq('id', currentRow.id);
            continue;
        }
        const { error } = await supabase.from('agent_memories').insert({
            condominio_id: actor.communityId,
            user_id: actor.userId,
            role: 'admin',
            content: item.fact,
            importance: item.category === 'reglamento' ? 0.8 : 0.6,
            scope: 'community',
            category: item.category,
            metadata: { kind: COCO_FACT_KIND, source: 'coco_chat', position },
            updated_at: now,
        });
        if (error) return { error: 'No pude guardar el recuerdo de la comunidad.' };
    }
    return { facts: next };
}

export async function forgetCommunityFact(
    actor: { userId?: string; role?: string; communityId?: string | null },
    fact: string,
): Promise<{ facts: CommunityFact[] } | { error: string }> {
    if (actor.role !== 'admin') return { error: 'Solo la administración puede borrar memoria de la comunidad.' };
    if (!actor.communityId) return { error: 'No pude identificar la comunidad.' };
    const target = normalizeFact(fact);
    if (!target) return { error: 'Dime qué recuerdo hay que olvidar.' };
    const rows = await readFactRows({ communityId: actor.communityId, scope: 'community' });
    if (rows === null) return { error: 'La memoria de la comunidad todavía no está disponible.' };
    const match = rows.find(row => normalizeFact(row.content) === target);
    if (!match) return { error: 'No encontré ese recuerdo en la comunidad.' };
    await supabase.from('agent_memories').delete().eq('id', match.id);
    const facts = (await getCommunityMemory(actor.communityId));
    return { facts };
}

export async function loadCoCoMemoryContext(input: {
    userId?: string;
    communityId?: string;
    role?: string;
    message: string;
}): Promise<string> {
    if (!input.userId && !input.communityId) return '';
    const userFacts = input.userId ? await getUserMemory(input.userId, input.communityId) : [];
    const communityFacts = input.communityId ? await getCommunityMemory(input.communityId) : [];
    return buildUnifiedMemoryContext(userFacts, communityFacts, input.message);
}
