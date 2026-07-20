export function bindIotPayloadToCommunity(
    payload: unknown,
    communityId: string,
): Record<string, unknown> {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error('El evento IoT debe ser un objeto JSON.');
    }

    return {
        ...(payload as Record<string, unknown>),
        community_id: communityId,
    };
}

export function requireCommunityIotSecret(secret: string | null | undefined): string {
    const normalized = secret?.trim();
    if (!normalized) {
        throw new Error('La comunidad no tiene un secreto IoT configurado.');
    }
    return normalized;
}
