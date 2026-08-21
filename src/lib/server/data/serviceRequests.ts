import type { DataClient } from './client';

export type ServiceRequestStatus = 'pending' | 'accepted' | 'completed' | 'cancelled' | string;

export type ServiceRequestRow = {
    id: string;
    provider_id?: string | null;
    user_id?: string | null;
    preferred_date?: string | null;
    preferred_time?: string | null;
    description: string;
    status: ServiceRequestStatus;
    created_at?: string | null;
    community_id?: string | null;
};

const SERVICE_REQUEST_COLUMNS =
    'id, provider_id, user_id, preferred_date, preferred_time, description, status, created_at, community_id';

export async function getServiceRequestById(
    client: DataClient,
    requestId: string,
): Promise<ServiceRequestRow | null> {
    const { data, error } = await client
        .from('service_requests')
        .select(SERVICE_REQUEST_COLUMNS)
        .eq('id', requestId)
        .maybeSingle();

    if (error || !data) return null;
    return data as ServiceRequestRow;
}

export async function createServiceRequest(
    client: DataClient,
    input: {
        providerId: string;
        userId: string;
        preferredDate: string;
        preferredTime: string;
        description: string;
        communityId?: string | null;
    },
): Promise<ServiceRequestRow | null> {
    const { data, error } = await client
        .from('service_requests')
        .insert({
            provider_id: input.providerId,
            user_id: input.userId,
            preferred_date: input.preferredDate,
            preferred_time: input.preferredTime,
            description: input.description,
            status: 'pending',
            community_id: input.communityId,
        })
        .select(SERVICE_REQUEST_COLUMNS)
        .single();

    if (error || !data) return null;
    return data as ServiceRequestRow;
}

export async function updateServiceRequestStatus(
    client: DataClient,
    requestId: string,
    status: ServiceRequestStatus,
): Promise<ServiceRequestRow | null> {
    const { data, error } = await client
        .from('service_requests')
        .update({ status })
        .eq('id', requestId)
        .select(SERVICE_REQUEST_COLUMNS)
        .single();

    if (error || !data) return null;
    return data as ServiceRequestRow;
}
