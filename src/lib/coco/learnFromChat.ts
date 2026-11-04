/**
 * Al cerrar una conversación, CoCo propone hechos de la comunidad.
 * No los guarda sola: quedan pendientes hasta que un administrador los apruebe.
 */

import { rememberCommunityFact, type CommunityMemoryCategory } from '@/lib/coco/memory';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

export type FactCandidate = { fact: string; category: CommunityMemoryCategory; key: string };

const CLOSE_RE = /^(chao|chau|hasta luego|eso es todo|cerramos|terminamos|ya esta|ya está)\b|\b(eso es todo|cerramos la conversaci[oó]n|terminamos por hoy)\b/i;
const RULE_RE = /(reglamento|qued[oó] acordado|acordamos|el proveedor|la empresa|se decidi[oó]|el horario)/i;
const PRIVATE_RE = /clave|contrase|password|rut\b|deuda|moros|sueldo|\$|\b\d{8,}\b|@/i;

export function isConversationClosing(message: string): boolean {
    const text = message.trim().toLocaleLowerCase('es-CL');
    if (!text || text.length > 160) return false;
    return CLOSE_RE.test(text);
}

export function linesFromConversation(messages: Array<{ content: string | object[] }>): string[] {
    return messages.flatMap(message => {
        if (typeof message.content === 'string') return message.content.trim() ? [message.content.trim()] : [];
        const text = message.content.map(block => {
            if (!block || typeof block !== 'object' || !('text' in block)) return '';
            return typeof block.text === 'string' ? block.text : '';
        }).join(' ').trim();
        return text ? [text] : [];
    });
}

function categoryFor(sentence: string): CommunityMemoryCategory {
    if (/reglamento/i.test(sentence)) return 'reglamento';
    if (/proveedor|empresa/i.test(sentence)) return 'proveedor';
    if (/acord|decidi/i.test(sentence)) return 'acuerdo';
    return 'general';
}

export function factKey(fact: string): string {
    return fact.toLocaleLowerCase('es-CL').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 180);
}

export function extractFactCandidates(lines: string[]): FactCandidate[] {
    const seen = new Set<string>();
    const found: FactCandidate[] = [];
    for (const line of lines) {
        const sentences = line.split(/(?<=[.!?])\s+/);
        for (const sentence of sentences) {
            const fact = sentence.replace(/\s+/g, ' ').trim().slice(0, 240);
            if (fact.length < 18 || fact.length > 240) continue;
            if (!RULE_RE.test(fact) || PRIVATE_RE.test(fact)) continue;
            const key = factKey(fact);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            found.push({ fact, category: categoryFor(fact), key });
            if (found.length >= 3) return found;
        }
    }
    return found;
}

export async function learnFromClosing(communityId: string, lines: string[]) {
    const candidates = extractFactCandidates(lines);
    if (!candidates.length) return { proposed: 0 };
    const admin = getSupabaseAdmin();
    let proposed = 0;
    for (const candidate of candidates) {
        const { error } = await admin.from('coco_memory_proposals').insert({
            community_id: communityId,
            fact: candidate.fact,
            fact_key: candidate.key,
            category: candidate.category,
            status: 'proposed',
        });
        if (!error) proposed += 1;
        else if (error.code !== '23505') throw error;
    }
    if (proposed > 0) {
        const { data: admins } = await admin.from('profiles').select('id').eq('community_id', communityId).eq('role', 'admin');
        const notes = (admins || []).map(profile => ({
            user_id: profile.id,
            community_id: communityId,
            type: 'info',
            category: 'coco_memory',
            title: 'CoCo propone un recuerdo de la comunidad',
            body: proposed === 1
                ? 'Hay un dato para revisar antes de guardarlo en la memoria de la comunidad.'
                : `Hay ${proposed} datos para revisar antes de guardarlos en la memoria de la comunidad.`,
            link: '/admin/coco-memoria',
            read: false,
        }));
        if (notes.length) await admin.from('notifications').insert(notes);
    }
    return { proposed };
}

export async function decideMemoryProposal(input: {
    communityId: string;
    adminId: string;
    proposalId: string;
    decision: 'approve' | 'reject';
}) {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
        .from('coco_memory_proposals')
        .select('id, fact, category, status')
        .eq('id', input.proposalId)
        .eq('community_id', input.communityId)
        .eq('status', 'proposed')
        .maybeSingle();
    if (error) throw error;
    if (!data) return { error: 'Esa propuesta ya no está pendiente.' as const };

    if (input.decision === 'approve') {
        const saved = await rememberCommunityFact(
            { userId: input.adminId, role: 'admin', communityId: input.communityId },
            String(data.fact),
            String(data.category),
        );
        if ('error' in saved) return { error: saved.error };
    }

    const { error: updateError } = await admin.from('coco_memory_proposals').update({
        status: input.decision === 'approve' ? 'approved' : 'rejected',
        decided_at: new Date().toISOString(),
        decided_by: input.adminId,
    }).eq('id', data.id).eq('status', 'proposed');
    if (updateError) throw updateError;
    return { ok: true as const };
}
