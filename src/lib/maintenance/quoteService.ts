/**
 * quoteService.ts — Lectura y escritura de cotizaciones de mantención.
 * Las reglas viven en quotes.ts; aquí solo se cargan y guardan datos.
 */
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { jobCategory, type QuoteProvider, type QuoteRow } from './quotes';

export type QuoteTargetKind = 'task' | 'ticket';

export interface QuoteTarget {
    kind: QuoteTargetKind;
    id: string;
    title: string;
    status: string;
    category: string;
    providerId: string | null;
}

export interface StoredQuote extends QuoteRow {
    provider_name: string;
    valid_until: string | null;
    notes: string | null;
    requested_at: string;
}

export async function loadQuoteTarget(communityId: string, target: { taskId?: string; ticketId?: string }): Promise<QuoteTarget> {
    const admin = getSupabaseAdmin();
    if (target.taskId) {
        const { data: task, error } = await admin.from('maintenance_tasks')
            .select('id, title, status, asset_id').eq('id', target.taskId).eq('community_id', communityId).maybeSingle();
        if (error) throw error;
        if (!task) throw new Error('La tarea de mantención no existe en tu comunidad.');
        let assetCategory: string | null = null;
        if (task.asset_id) {
            const { data: asset, error: assetError } = await admin.from('building_assets').select('category')
                .eq('id', String(task.asset_id)).eq('community_id', communityId).maybeSingle();
            if (assetError) throw assetError;
            assetCategory = asset?.category ? String(asset.category) : null;
        }
        return {
            kind: 'task', id: String(task.id), title: String(task.title || 'Tarea de mantención'), status: String(task.status),
            category: jobCategory({ assetCategory, description: String(task.title || '') }), providerId: null,
        };
    }
    const { data: ticket, error } = await admin.from('service_requests')
        .select('id, description, status, provider_id').eq('id', String(target.ticketId)).eq('community_id', communityId).maybeSingle();
    if (error) throw error;
    if (!ticket) throw new Error('El ticket no existe en tu comunidad.');
    return {
        kind: 'ticket', id: String(ticket.id), title: String(ticket.description || 'Ticket de mantención').slice(0, 120),
        status: String(ticket.status), category: jobCategory({ description: String(ticket.description || '') }),
        providerId: ticket.provider_id ? String(ticket.provider_id) : null,
    };
}

export function targetColumn(kind: QuoteTargetKind) {
    return kind === 'task' ? 'task_id' : 'service_request_id';
}

export async function listQuotes(communityId: string, target: QuoteTarget): Promise<StoredQuote[]> {
    const { data, error } = await getSupabaseAdmin().from('maintenance_quotes')
        .select('id, provider_id, status, amount, valid_until, notes, requested_at, service_providers(name)')
        .eq('community_id', communityId).eq(targetColumn(target.kind), target.id).order('requested_at');
    if (error) throw error;
    return (data || []).map(row => {
        const provider = (row as { service_providers?: { name?: string } | { name?: string }[] | null }).service_providers;
        const name = Array.isArray(provider) ? provider[0]?.name : provider?.name;
        return {
            id: String(row.id), provider_id: String(row.provider_id), status: row.status as QuoteRow['status'],
            amount: row.amount === null ? null : Number(row.amount), provider_name: String(name || 'Proveedor'),
            valid_until: row.valid_until ? String(row.valid_until) : null, notes: row.notes ? String(row.notes) : null,
            requested_at: String(row.requested_at),
        };
    });
}

export async function listCommunityProviders(communityId: string): Promise<(QuoteProvider & { contact_phone: string | null; email: string | null; user_id: string | null })[]> {
    const { data, error } = await getSupabaseAdmin().from('service_providers')
        .select('id, name, category, specialties, verified, rating, completed_jobs, contact_phone, email, user_id')
        .eq('community_id', communityId).limit(500);
    if (error) throw error;
    return (data || []).map(row => ({
        id: String(row.id), name: String(row.name), category: row.category ? String(row.category) : null,
        specialties: Array.isArray(row.specialties) ? row.specialties.map(String) : [], verified: Boolean(row.verified),
        rating: row.rating === null ? null : Number(row.rating), completed_jobs: row.completed_jobs ?? null,
        contact_phone: row.contact_phone ? String(row.contact_phone) : null, email: row.email ? String(row.email) : null,
        user_id: row.user_id ? String(row.user_id) : null,
    }));
}
