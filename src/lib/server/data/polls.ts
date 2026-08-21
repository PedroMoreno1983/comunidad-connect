import type { DataClient } from './client';

export type CreatePollInput = {
    title: string;
    description: string;
    category?: string;
    endDate: string;
    createdBy?: string | null;
    communityId: string;
    options: string[];
};

export type CreatedPollRow = {
    id: string;
    title: string;
    description?: string | null;
    category?: string | null;
    end_date?: string | null;
    status?: string | null;
    created_by?: string | null;
    community_id?: string | null;
};

export type CreatedPollOptionRow = {
    id?: string;
    poll_id: string;
    text: string;
    display_order: number;
    votes?: number;
};

export type CreatePollResult =
    | { ok: true; poll: CreatedPollRow; options: CreatedPollOptionRow[] }
    | { ok: false; reason: 'poll' | 'options' };

export async function createPollWithOptions(
    client: DataClient,
    input: CreatePollInput,
): Promise<CreatePollResult> {
    const { data: poll, error: pollError } = await client
        .from('polls')
        .insert({
            title: input.title,
            description: input.description,
            ...(input.category ? { category: input.category } : {}),
            end_date: input.endDate,
            status: 'active',
            created_by: input.createdBy ?? null,
            community_id: input.communityId,
        })
        .select('*')
        .single();

    if (pollError || !poll) return { ok: false, reason: 'poll' };

    const { data: createdOptions, error: optionsError } = await client
        .from('poll_options')
        .insert(input.options.map((text, display_order) => ({
            poll_id: poll.id,
            text,
            display_order,
            votes: 0,
        })))
        .select('*');

    if (optionsError) {
        await client.from('polls').delete().eq('id', poll.id).eq('community_id', input.communityId);
        return { ok: false, reason: 'options' };
    }

    return {
        ok: true,
        poll: poll as CreatedPollRow,
        options: (createdOptions || []) as CreatedPollOptionRow[],
    };
}
