import 'server-only';

/**
 * Ejecutores de herramientas de CoCo: providers. Movidos tal cual desde el switch
 * de executeTool (21-11-2026). Devuelven NOT_HANDLED si la herramienta no es de este dominio.
 */
import { listServiceRequests, recordWaterReading, registerIncidentForStaff, updateServiceRequestStatusForUser } from '../../operationsTools';
import { listProviderDocumentsForAdmin, rateProviderForUser, reviewProviderDocumentForAdmin, saveProviderAttachment } from '../../providerProfileTools';
import { rankNearbyProviders } from '../../providerSearch';
import { registerExternalProviderForAdmin, sendProviderPortalLinkForAdmin } from '../../providerTools';
import { requestServiceForUser } from '../../residentActions';
import { communityProvidersFilter } from '@/lib/services/providerNetwork';
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { NOT_HANDLED, UserContext, forbidden, isAdmin, isStaff, scopedCommunity } from '../shared';

export async function executeProvidersTool(name: string, input: Record<string, string>, userCtx: UserContext): Promise<unknown> {
        switch (name) {
            case 'request_service': {
                const communityId = scopedCommunity(userCtx);
                if (!communityId || !userCtx.user_id) return forbidden('No pude identificarte.');
                return requestServiceForUser(supabaseAdmin, communityId, userCtx.user_id, userCtx.role || 'resident', input as Record<string, unknown>);
            }

            case 'list_services': {
                const communityId = scopedCommunity(userCtx);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                const category = (input.category || '').trim();
                const search = (input.query || (!['plumbing', 'electrical', 'locksmith', 'cleaning', 'general'].includes(category) ? category : '')).trim();
                const query = supabaseAdmin
                    .from('service_providers')
                    .select('id, name, category, rating, contact_phone, bio, specialties, verified, service_address, service_latitude, service_longitude, community_id, background_checked_at')
                    // Los de la comunidad y los de la Red Convive (community_id NULL).
                    .or(communityProvidersFilter(communityId))
                    .order('rating', { ascending: false });
                
                if (['plumbing', 'electrical', 'locksmith', 'cleaning', 'general'].includes(category)) {
                    query.eq('category', category);
                }
                
                const [providers, community] = await Promise.all([
                    query.limit(100),
                    supabaseAdmin.from('communities').select('address_latitude,address_longitude').eq('id', communityId).maybeSingle(),
                ]);
                const { data, error } = providers;
                if (error) return { error: 'No se pudo obtener el directorio de servicios' };
                if (community.error) return { error: 'No se pudo consultar la ubicación de la comunidad.' };
                return rankNearbyProviders(data ?? [], search, community.data, 10);
            }

            case 'list_service_requests':
            case 'update_service_request_status':
            case 'register_incident':
            case 'record_water_reading': {
                const communityId = scopedCommunity(userCtx);
                if (!communityId || !userCtx.user_id) return forbidden('No pude determinar tu comunidad.');
                const actor = { id: userCtx.user_id, role: userCtx.role || 'resident', communityId };
                if (name === 'list_service_requests') return listServiceRequests(supabaseAdmin, actor);
                if (name === 'update_service_request_status') return updateServiceRequestStatusForUser(supabaseAdmin, actor, input as Record<string, unknown>);
                if (name === 'register_incident') {
                    if (!isStaff(userCtx)) return { error: 'Solo conserjería o administración registran incidencias.' };
                    return registerIncidentForStaff(supabaseAdmin, actor, input as Record<string, unknown>);
                }
                if (!isAdmin(userCtx)) return { error: 'Solo la administración registra lecturas de agua.' };
                return recordWaterReading(supabaseAdmin, actor, input as Record<string, unknown>);
            }

            case 'rate_provider': {
                const communityId = scopedCommunity(userCtx);
                if (!communityId || !userCtx.user_id) return forbidden('No pude identificarte.');
                return rateProviderForUser(userCtx.user_id, communityId, input as Record<string, unknown>);
            }

            case 'list_provider_documents':
            case 'review_provider_document': {
                if (userCtx.role !== 'admin') return forbidden('Solo la administración revisa documentos de maestros.');
                const communityId = scopedCommunity(userCtx);
                if (!communityId || !userCtx.user_id) return forbidden('No pude identificarte.');
                return name === 'list_provider_documents'
                    ? listProviderDocumentsForAdmin(communityId, input as Record<string, unknown>)
                    : reviewProviderDocumentForAdmin(communityId, userCtx.user_id, input as Record<string, unknown>);
            }

            case 'save_provider_attachment': {
                // Por WhatsApp la imagen no se guarda aparte: no hay adjunto_id que usar.
                if (userCtx.channel === 'whatsapp') return { error: 'Por WhatsApp no puedo guardar imágenes en el perfil: súbela desde la app o el chat web.' };
                const communityId = scopedCommunity(userCtx);
                if (!communityId || !userCtx.user_id || !userCtx.role) return forbidden('No pude identificarte.');
                return saveProviderAttachment({ id: userCtx.user_id, role: userCtx.role, communityId }, input as Record<string, unknown>);
            }

            case 'register_external_provider':
            case 'send_provider_portal_link': {
                if (userCtx.role !== 'admin') return forbidden('Solo la administración registra maestros externos y les envía su enlace.');
                const communityId = scopedCommunity(userCtx);
                if (!communityId || !userCtx.user_id) return forbidden('No pude identificarte.');
                return name === 'register_external_provider'
                    ? registerExternalProviderForAdmin(supabaseAdmin, communityId, userCtx.user_id, input as Record<string, unknown>)
                    : sendProviderPortalLinkForAdmin(supabaseAdmin, communityId, userCtx.user_id, input as Record<string, unknown>);
            }

            case 'dispatch_provider': {
                if (!isStaff(userCtx)) return forbidden('Solo conserjeria o administracion pueden gestionar proveedores de emergencia.');
                const communityId = scopedCommunity(userCtx);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                const providerQuery = supabaseAdmin
                    .from('service_providers')
                    .select('id, name, contact_phone, category, response_time')
                    .or(communityProvidersFilter(communityId))
                    .eq('availability', 'available')
                    .order('verified', { ascending: false })
                    .order('rating', { ascending: false })
                    .limit(1);
                if (input.category) providerQuery.eq('category', input.category);

                const { data: providers, error: providerError } = await providerQuery;
                if (providerError) return { error: 'No se pudo consultar el directorio de proveedores.' };
                const provider = providers?.[0];

                const { data: staff, error: staffError } = await supabaseAdmin
                    .from('profiles')
                    .select('id')
                    .eq('community_id', communityId)
                    .in('role', ['admin', 'concierge']);
                if (staffError) return { error: 'No se pudo consultar al equipo de la comunidad.' };

                let staffNotificationError: string | null = null;
                if (staff?.length) {
                    const { error } = await supabaseAdmin.from('notifications').insert(staff.map(member => ({
                        user_id: member.id,
                        type: input.urgency === 'URGENTE' ? 'alert' : 'warning',
                        category: 'iot_provider_dispatch',
                        title: provider ? 'Proveedor sugerido por CoCo' : 'Proveedor requerido por CoCo',
                        body: provider
                            ? `${provider.name} (${provider.contact_phone}) calza con ${input.category}. Detalle: ${input.details}`
                            : `No hay proveedor disponible para ${input.category}. Detalle: ${input.details}`,
                        link: '/admin/mantenimiento',
                        community_id: communityId,
                    })));
                    staffNotificationError = error?.message || null;
                }

                return {
                    success: Boolean(provider) && !staffNotificationError,
                    status: provider ? 'PROVIDER_IDENTIFIED' : 'NO_PROVIDER_AVAILABLE',
                    provider,
                    notified_staff: staff?.length || 0,
                    ...(staffNotificationError ? { error: 'No se pudo notificar al equipo de la comunidad.' } : {}),
                    message: provider
                        ? `Proveedor disponible sugerido: ${provider.name} (${provider.contact_phone}). Staff notificado para confirmar despacho.`
                        : `No encontré proveedor disponible para ${input.category}; staff notificado para gestión manual.`
                };
            }

            default:
                return NOT_HANDLED;
        }
}
