import type { DataClient } from './client';

export type CocoCaseStatus = 'open' | 'in_progress' | 'resolved' | 'closed' | 'cancelled' | string;

export type CocoCaseRow = {
    id: string;
    title: string;
    status?: string | null;
    user_id?: string | null;
    community_id?: string | null;
    metadata?: Record<string, unknown> | null;
    type?: string | null;
    category?: string | null;
    urgency?: string | null;
    action?: string | null;
    reason?: string | null;
    source_message?: string | null;
    assistant_reply?: string | null;
    unit_label?: string | null;
    created_at?: string | null;
};

export type CocoCaseEventRow = {
    id: string;
    case_id: string;
    event_type?: string | null;
    from_status?: string | null;
    to_status?: string | null;
    body?: string | null;
    actor_role?: string | null;
    created_at?: string | null;
};

const CASE_COLUMNS = 'id, title, status, user_id, community_id, metadata, type, category, urgency, action, reason, source_message, assistant_reply, unit_label, created_at';
const EVENT_COLUMNS = 'id, case_id, event_type, from_status, to_status, body, actor_role, created_at';

export async function getCocoCaseById(
    client: DataClient,
    caseId: string,
): Promise<CocoCaseRow | null> {
    const { data, error } = await client
        .from('coco_cases')
        .select(CASE_COLUMNS)
        .eq('id', caseId)
        .maybeSingle();

    if (error || !data) return null;
    return data as CocoCaseRow;
}

export async function updateCocoCaseStatus(
    client: DataClient,
    input: {
        caseId: string;
        status: CocoCaseStatus;
        metadata: Record<string, unknown>;
    },
): Promise<CocoCaseRow | null> {
    const { data, error } = await client
        .from('coco_cases')
        .update({
            status: input.status,
            metadata: input.metadata,
        })
        .eq('id', input.caseId)
        .select(CASE_COLUMNS)
        .single();

    if (error || !data) return null;
    return data as CocoCaseRow;
}

export async function listCocoCaseEvents(
    client: DataClient,
    caseId: string,
): Promise<CocoCaseEventRow[]> {
    const { data, error } = await client
        .from('coco_case_events')
        .select(EVENT_COLUMNS)
        .eq('case_id', caseId)
        .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []) as CocoCaseEventRow[];
}

export async function insertCocoCaseEvent(
    client: DataClient,
    input: {
        caseId: string;
        communityId?: string | null;
        actorId: string;
        actorRole: string;
        eventType: string;
        body: string;
        fromStatus?: string | null;
        toStatus?: string | null;
        metadata?: Record<string, unknown>;
    },
): Promise<CocoCaseEventRow | null> {
    const { data, error } = await client
        .from('coco_case_events')
        .insert({
            case_id: input.caseId,
            community_id: input.communityId,
            actor_id: input.actorId,
            actor_role: input.actorRole,
            event_type: input.eventType,
            body: input.body,
            from_status: input.fromStatus ?? null,
            to_status: input.toStatus ?? null,
            metadata: input.metadata ?? {},
        })
        .select(EVENT_COLUMNS)
        .single();

    if (error || !data) return null;
    return data as CocoCaseEventRow;
}
