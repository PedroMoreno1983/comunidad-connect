import 'server-only';

import { randomBytes } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { hashSecret } from '@/lib/security/apiKeys';
import { recordOperationEvent } from '@/lib/operations/audit';
import { serviceRequestTransitionError, validServiceSchedule } from '@/lib/services/requestLifecycle';
import { providerProfileUpdate } from '@/lib/services/providerProfile';
import { sendProviderRequestEmail } from '@/lib/email';
import type { ProviderPortalData, ServiceRequestStatus } from '@/lib/types';

/**
 * Portal del maestro externo: sin cuenta, con un enlace secreto que envía la
 * administración. Mismo diseño que el portal del fiscalizador: se guarda solo el
 * hash del token, vence y se puede revocar. Con el enlace, el maestro edita su
 * perfil y responde sus solicitudes con las mismas reglas que un proveedor con
 * cuenta (serviceRequestTransitionError).
 */

export class ProviderPortalError extends Error {
    constructor(message: string, readonly status: number) {
        super(message);
    }
}

const DEFAULT_DAYS = 90;
const PROFILE_COLUMNS = 'id, name, category, contact_phone, email, bio, years_experience, specialties, certifications, hourly_rate, availability, response_time, service_address, verified, rating, review_count, completed_jobs, community_id, user_id';

/** Crea el enlace (y revoca los anteriores del mismo maestro). Solo proveedores externos de la comunidad. */
/**
 * Avisa por correo a un maestro sin cuenta que tiene una solicitud nueva. No
 * frena la creación de la solicitud: si falla, queda en el log.
 */
export async function notifyExternalProviderOfRequest(providerId: string, request: { preferredDate: string; preferredTime: string; description: string }) {
    try {
        const { data: provider } = await supabaseAdmin.from('service_providers')
            .select('name, email, user_id, community_id').eq('id', providerId).maybeSingle();
        if (!provider || provider.user_id || !provider.email) return;
        const { data: community } = await supabaseAdmin.from('communities').select('name').eq('id', provider.community_id).maybeSingle();
        await sendProviderRequestEmail({
            to: String(provider.email),
            providerName: String(provider.name),
            communityName: String(community?.name || 'tu comunidad'),
            date: request.preferredDate,
            time: request.preferredTime,
            description: request.description,
        });
    } catch (error) {
        console.error('[provider portal] no se pudo avisar al maestro', error instanceof Error ? error.message : error);
    }
}

export async function createProviderInvite(communityId: string, createdBy: string, providerId: string, days = DEFAULT_DAYS) {
    const { data: provider } = await supabaseAdmin.from('service_providers')
        .select('id, name, community_id, user_id').eq('id', providerId).maybeSingle();
    if (!provider || provider.community_id !== communityId) throw new ProviderPortalError('Proveedor no encontrado en tu comunidad.', 404);
    if (provider.user_id) throw new ProviderPortalError('Este proveedor tiene cuenta: gestiona su perfil desde su panel.', 409);

    const now = new Date().toISOString();
    await supabaseAdmin.from('service_provider_links').update({ revoked_at: now })
        .eq('provider_id', providerId).is('revoked_at', null);

    const token = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + Math.min(Math.max(days, 1), 365) * 86_400_000).toISOString();
    const { error } = await supabaseAdmin.from('service_provider_links').insert({
        community_id: communityId, provider_id: providerId, token_hash: hashSecret(token), expires_at: expiresAt, created_by: createdBy,
    });
    if (error) throw new ProviderPortalError('No se pudo crear el enlace.', 500);
    await recordOperationEvent({
        communityId, actorId: createdBy, actorRole: 'admin', action: 'service_provider.portal_link_created',
        entityType: 'service_provider', entityId: providerId, severity: 'success', status: 'success',
        summary: `Enlace de gestión enviado a ${provider.name}`, metadata: { expiresAt },
    });
    return { token, expiresAt, providerName: String(provider.name) };
}

async function resolveLink(token: string) {
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw new ProviderPortalError('Enlace no válido.', 404);
    const { data: link } = await supabaseAdmin.from('service_provider_links')
        .select('id, community_id, provider_id, expires_at, revoked_at, use_count')
        .eq('token_hash', hashSecret(token)).maybeSingle();
    if (!link || link.revoked_at) throw new ProviderPortalError('Este enlace no es válido. Pide uno nuevo a la administración.', 404);
    if (new Date(link.expires_at).getTime() <= Date.now()) throw new ProviderPortalError('Este enlace venció. Pide uno nuevo a la administración.', 410);
    void supabaseAdmin.from('service_provider_links')
        .update({ last_used_at: new Date().toISOString(), use_count: Number(link.use_count || 0) + 1 })
        .eq('id', link.id).then(() => undefined);
    return { communityId: String(link.community_id), providerId: String(link.provider_id), expiresAt: String(link.expires_at) };
}

export async function getProviderPortal(token: string): Promise<ProviderPortalData> {
    const link = await resolveLink(token);
    const [{ data: provider }, { data: community }, { data: requests }] = await Promise.all([
        supabaseAdmin.from('service_providers').select(PROFILE_COLUMNS).eq('id', link.providerId).maybeSingle(),
        supabaseAdmin.from('communities').select('name').eq('id', link.communityId).maybeSingle(),
        supabaseAdmin.from('service_requests')
            .select('id, user_id, preferred_date, preferred_time, description, status, created_at')
            .eq('provider_id', link.providerId).eq('community_id', link.communityId)
            .order('created_at', { ascending: false }).limit(50),
    ]);
    if (!provider) throw new ProviderPortalError('El perfil de proveedor ya no existe.', 404);

    // Del residente solo lo necesario para coordinar: nombre y departamento.
    const userIds = [...new Set((requests || []).map(row => String(row.user_id)))];
    const { data: people } = userIds.length
        ? await supabaseAdmin.from('profiles').select('id, name, unit_id').in('id', userIds)
        : { data: [] };
    const unitIds = [...new Set((people || []).map(row => String(row.unit_id || '')).filter(Boolean))];
    const { data: units } = unitIds.length
        ? await supabaseAdmin.from('units').select('id, number, tower').in('id', unitIds)
        : { data: [] };
    const unitLabel = new Map((units || []).map(unit => [String(unit.id), [unit.tower ? `Torre ${unit.tower}` : '', unit.number ? `depto ${unit.number}` : ''].filter(Boolean).join(', ')]));
    const person = new Map((people || []).map(row => [String(row.id), {
        name: String(row.name || 'Residente').split(' ')[0],
        unit: unitLabel.get(String(row.unit_id || '')) || '',
    }]));

    return {
        communityName: String(community?.name || 'tu comunidad'),
        expiresAt: link.expiresAt,
        provider: {
            id: String(provider.id),
            name: String(provider.name),
            category: provider.category,
            contactPhone: String(provider.contact_phone || ''),
            email: provider.email ? String(provider.email) : '',
            bio: String(provider.bio || ''),
            yearsExperience: Number(provider.years_experience || 0),
            specialties: (provider.specialties || []) as string[],
            certifications: (provider.certifications || []) as string[],
            hourlyRate: provider.hourly_rate === null ? null : Number(provider.hourly_rate),
            availability: provider.availability,
            responseTime: String(provider.response_time || ''),
            serviceAddress: String(provider.service_address || ''),
            verified: provider.verified === true,
            rating: Number(provider.rating || 0),
            reviewCount: Number(provider.review_count || 0),
            completedJobs: Number(provider.completed_jobs || 0),
        },
        requests: (requests || []).map(row => ({
            id: String(row.id),
            preferredDate: String(row.preferred_date),
            preferredTime: String(row.preferred_time),
            description: String(row.description),
            status: row.status as ServiceRequestStatus,
            createdAt: String(row.created_at),
            requesterName: person.get(String(row.user_id))?.name || 'Residente',
            requesterUnit: person.get(String(row.user_id))?.unit || '',
        })),
    };
}

export async function updateProviderProfileViaPortal(token: string, body: Record<string, unknown>) {
    const link = await resolveLink(token);
    const result = providerProfileUpdate(body);
    if ('error' in result) throw new ProviderPortalError(result.error, 400);
    const { error } = await supabaseAdmin.from('service_providers').update(result.update)
        .eq('id', link.providerId).eq('community_id', link.communityId);
    if (error) throw new ProviderPortalError('No se pudo guardar el perfil.', 500);
    await recordOperationEvent({
        communityId: link.communityId, actorRole: 'external_provider', action: 'service_provider.profile_updated',
        entityType: 'service_provider', entityId: link.providerId, severity: 'success', status: 'success',
        summary: 'El maestro actualizó su perfil desde su enlace', metadata: { fields: Object.keys(result.update) },
    });
}

export async function updateRequestViaPortal(
    token: string,
    requestId: string,
    input: { status: ServiceRequestStatus; preferredDate?: string; preferredTime?: string },
) {
    const link = await resolveLink(token);
    const { data: request } = await supabaseAdmin.from('service_requests')
        .select('id, provider_id, community_id, status').eq('id', requestId).maybeSingle();
    if (!request || request.provider_id !== link.providerId || request.community_id !== link.communityId) {
        throw new ProviderPortalError('Solicitud no encontrada.', 404);
    }
    const reschedule = Boolean(input.preferredDate || input.preferredTime);
    const transitionError = serviceRequestTransitionError({
        current: request.status, next: input.status, requester: false, manager: true, reschedule,
    });
    if (transitionError) throw new ProviderPortalError(transitionError, 409);
    if (reschedule && !validServiceSchedule(input.preferredDate || '', input.preferredTime || '')) {
        throw new ProviderPortalError('Indica una fecha y hora válidas.', 400);
    }
    const patch: Record<string, string> = { status: input.status };
    if (reschedule) {
        patch.preferred_date = input.preferredDate || '';
        patch.preferred_time = input.preferredTime || '';
    }
    const { data: updated, error } = await supabaseAdmin.from('service_requests').update(patch)
        .eq('id', requestId).eq('status', request.status).select('id, status').maybeSingle();
    if (error || !updated) throw new ProviderPortalError('La solicitud cambió. Actualiza la página antes de reintentar.', 409);
    await recordOperationEvent({
        communityId: link.communityId, actorRole: 'external_provider', action: 'service_request.status_changed',
        entityType: 'service_request', entityId: requestId,
        severity: input.status === 'cancelled' ? 'warning' : 'success',
        status: input.status === 'cancelled' ? 'blocked' : 'pending',
        summary: `El maestro ${reschedule ? 'propuso otro horario' : `marcó la solicitud como ${input.status}`} desde su enlace`,
        metadata: { previousStatus: request.status, nextStatus: input.status, providerId: link.providerId, channel: 'provider_portal' },
    });
    return { id: String(updated.id), status: updated.status as ServiceRequestStatus };
}
