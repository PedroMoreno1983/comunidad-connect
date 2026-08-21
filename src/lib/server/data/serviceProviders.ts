import type { DataClient } from './client';

export type ServiceProviderLookup = {
    id: string;
    name: string;
    user_id?: string | null;
    community_id?: string | null;
};

export async function getServiceProviderById(
    client: DataClient,
    providerId: string,
): Promise<ServiceProviderLookup | null> {
    const { data, error } = await client
        .from('service_providers')
        .select('id, name, user_id, community_id')
        .eq('id', providerId)
        .maybeSingle();

    if (error || !data) return null;
    return data as ServiceProviderLookup;
}
