/**
 * Propuestas proactivas para el administrador.
 * Detecta gastos vencidos y reservas pendientes. No avisa a residentes,
 * no aprueba reservas y no envía cobranza: deja una propuesta para confirmar.
 */

import { daysOverdue, readCollectionExpenses } from '@/lib/agent-center/collection';
import { chileTodayISO } from '@/lib/agent-center/chileDate';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

export const PROPOSAL_KINDS = ['overdue_followup', 'pending_bookings'] as const;
export type ProposalKind = (typeof PROPOSAL_KINDS)[number];
export type ProposalDecision = 'propose' | 'skip_below' | 'skip_open' | 'skip_cooldown';

const COOLDOWN_MS: Record<ProposalKind, number> = {
    overdue_followup: 24 * 60 * 60_000,
    pending_bookings: 6 * 60 * 60_000,
};

const MINIMUM: Record<ProposalKind, number> = {
    overdue_followup: 1,
    pending_bookings: 1,
};

export function decideProposal(input: {
    kind: ProposalKind;
    count: number;
    open: boolean;
    lastCreatedAt: string | null;
    now: Date;
}): ProposalDecision {
    if (input.count < MINIMUM[input.kind]) return 'skip_below';
    if (input.open) return 'skip_open';
    if (input.lastCreatedAt) {
        const age = input.now.getTime() - new Date(input.lastCreatedAt).getTime();
        if (Number.isFinite(age) && age >= 0 && age < COOLDOWN_MS[input.kind]) return 'skip_cooldown';
    }
    return 'propose';
}

export function proposalCopy(kind: ProposalKind, count: number): { title: string; body: string; href: string } {
    const units = count === 1 ? '1 unidad' : `${count} unidades`;
    const bookings = count === 1 ? '1 reserva' : `${count} reservas`;
    if (kind === 'overdue_followup') {
        return {
            title: 'CoCo propone revisar los gastos vencidos',
            body: `Hay ${units} con gastos vencidos. Si confirmas, abres la revisión. No se avisa a nadie hasta que tú lo decidas.`,
            href: '/expenses',
        };
    }
    return {
        title: 'CoCo propone revisar reservas pendientes',
        body: `Hay ${bookings} esperando una decisión. Confirma para verlas. No se aprueba ni se anula nada sola.`,
        href: '/amenities',
    };
}

type ProposalRow = { kind: string; status: string; created_at: string };

function latestOf(rows: ProposalRow[], kind: ProposalKind) {
    const matches = rows.filter(row => row.kind === kind);
    const open = matches.some(row => row.status === 'proposed');
    const lastCreatedAt = matches[0]?.created_at || null;
    return { open, lastCreatedAt };
}

async function countOverdueUnits(communityId: string, now: Date): Promise<number> {
    const today = chileTodayISO(now);
    const rows = await readCollectionExpenses(communityId);
    const units = new Set(
        rows
            .filter(row => daysOverdue(row.due_date, today) >= 1 && row.unit_id)
            .map(row => String(row.unit_id)),
    );
    return units.size;
}

async function countPendingBookings(communityId: string): Promise<number> {
    const { count, error } = await getSupabaseAdmin()
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('community_id', communityId)
        .eq('status', 'pending');
    if (error) throw error;
    return count || 0;
}

async function notifyAdmins(communityId: string, title: string, body: string) {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
        .from('profiles')
        .select('id')
        .eq('community_id', communityId)
        .eq('role', 'admin');
    if (error) throw error;
    const rows = (data || []).map(profile => ({
        user_id: profile.id,
        community_id: communityId,
        type: 'info',
        category: 'coco_proposal',
        title,
        body,
        link: '/admin/coco-actividad',
        read: false,
    }));
    if (!rows.length) return;
    const { error: insertError } = await admin.from('notifications').insert(rows);
    if (insertError) throw insertError;
}

async function proposeKind(communityId: string, kind: ProposalKind, count: number, history: ProposalRow[], now: Date) {
    const decision = decideProposal({ kind, count, ...latestOf(history, kind), now });
    if (decision !== 'propose') return { kind, decision, count };
    const copy = proposalCopy(kind, count);
    const { error } = await getSupabaseAdmin().from('coco_proactive_proposals').insert({
        community_id: communityId,
        kind,
        status: 'proposed',
        title: copy.title,
        body: copy.body,
        href: copy.href,
        subject_count: count,
    });
    if (error?.code === '23505') return { kind, decision: 'skip_open' as const, count };
    if (error) throw error;
    await notifyAdmins(communityId, copy.title, copy.body);
    return { kind, decision: 'proposed' as const, count };
}

export async function proposeForCommunity(communityId: string, now = new Date()) {
    const admin = getSupabaseAdmin();
    const [overdueUnits, pendingBookings, historyResult] = await Promise.all([
        countOverdueUnits(communityId, now),
        countPendingBookings(communityId),
        admin
            .from('coco_proactive_proposals')
            .select('kind, status, created_at')
            .eq('community_id', communityId)
            .order('created_at', { ascending: false })
            .limit(40),
    ]);
    if (historyResult.error) throw historyResult.error;
    const history = (historyResult.data || []) as ProposalRow[];
    const kinds = await Promise.all([
        proposeKind(communityId, 'overdue_followup', overdueUnits, history, now),
        proposeKind(communityId, 'pending_bookings', pendingBookings, history, now),
    ]);
    return { communityId, kinds };
}

export async function runProactiveProposals(now = new Date()) {
    const { data, error } = await getSupabaseAdmin().from('communities').select('id').limit(200);
    if (error) throw error;
    const results = [];
    for (const community of data || []) {
        try {
            results.push(await proposeForCommunity(String(community.id), now));
        } catch (communityError) {
            console.error('[coco proposals] community failed', community.id, communityError);
            results.push({ communityId: String(community.id), status: 'failed' });
        }
    }
    return { communities: (data || []).length, results };
}

export async function claimSchedulerTick(mode: string, bucket: string): Promise<boolean> {
    const { error } = await getSupabaseAdmin()
        .from('coco_scheduler_ticks')
        .insert({ mode, bucket });
    if (!error) return true;
    if (error.code === '23505') return false;
    throw error;
}

export async function releaseSchedulerTick(mode: string, bucket: string) {
    await getSupabaseAdmin().from('coco_scheduler_ticks').delete().eq('mode', mode).eq('bucket', bucket);
}
