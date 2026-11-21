import 'server-only';

/**
 * Ejecutores de herramientas de CoCo: community. Movidos tal cual desde el switch
 * de executeTool (21-11-2026). Devuelven NOT_HANDLED si la herramienta no es de este dominio.
 */
import { listMyMediations, updateMediationStatus } from '../../agreementTools';
import { setCommunityCoverFromChat } from '../../communityCoverTool';
import { joinInitiative, listCommunityInitiatives, proposeInitiative, requestMediation, resolveParticipation, reviewInitiative } from '../../convivenciaTools';
import { addDealQuoteForAdmin, listDealsForUser, proposeDealForUser, setDealInterestForUser, suggestDealsForCommunity } from '../../dealTools';
import { createAmenityForAdmin, deleteDealQuote, deleteMarketplaceItem, deleteProviderPhoto, listProviderPhotos, setUnitOwner, updateCommunityDeal, updateProviderProfile } from '../../finalGapTools';
import { publishMarketplaceItemForUser } from '../../residentActions';
import { listMyMarketplaceConversations, messageMarketplaceSeller, replyMarketplaceConversation } from '../../residentDailyTools';
import { getOrCreateInvite } from '@/lib/onboarding/neighborInvites';
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { NOT_HANDLED, UserContext, forbidden, isAdmin, isUuid, scopedCommunity, scopedUnit } from '../shared';

export async function executeCommunityTool(name: string, input: Record<string, string>, userCtx: UserContext): Promise<unknown> {
        switch (name) {
            case 'publish_marketplace_item': {
                const communityId = scopedCommunity(userCtx);
                if (!communityId || !userCtx.user_id) return forbidden('No pude identificarte.');
                return publishMarketplaceItemForUser(supabaseAdmin, communityId, userCtx.user_id, input as Record<string, unknown>);
            }

            case 'search_marketplace': {
                const communityId = scopedCommunity(userCtx);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                const query = supabaseAdmin
                    .from('marketplace_items')
                    .select('id, title, description, price, category, status')
                    .ilike('title', `%${input.query}%`)
                    .eq('community_id', communityId)
                    .eq('status', 'available')
                    .limit(5);
                const { data, error } = await query;
                if (error) return { error: 'No se pudo buscar en el Marketplace.' };
                return data ?? [];
            }

            case 'list_community_deals': {
                const communityId = scopedCommunity(userCtx);
                if (!communityId || !userCtx.user_id) return forbidden('No pude identificar al usuario.');
                return listDealsForUser(supabaseAdmin, communityId, userCtx.user_id, userCtx.role === 'admin');
            }

            case 'suggest_community_deals': {
                const communityId = scopedCommunity(userCtx);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                return suggestDealsForCommunity(supabaseAdmin, communityId);
            }

            case 'propose_community_deal': {
                const communityId = scopedCommunity(userCtx);
                if (!communityId || !userCtx.user_id) return forbidden('No pude identificar al usuario.');
                return proposeDealForUser(supabaseAdmin, communityId, userCtx.user_id, userCtx.role === 'admin', {
                    title: input.title, kind: input.kind, description: input.description,
                });
            }

            case 'join_community_deal': {
                const communityId = scopedCommunity(userCtx);
                if (!communityId || !userCtx.user_id) return forbidden('No pude identificar al usuario.');
                if (!isUuid(String(input.deal_id ?? ''))) return { error: 'Necesito el deal_id que devuelve list_community_deals.' };
                const interested = (input as Record<string, unknown>).interested !== false;
                return setDealInterestForUser(supabaseAdmin, communityId, userCtx.user_id, String(input.deal_id), interested, input.note);
            }

            case 'add_community_deal_quote': {
                const communityId = scopedCommunity(userCtx);
                if (!communityId || !userCtx.user_id) return forbidden('No pude identificar al usuario.');
                if (userCtx.role !== 'admin') return forbidden('Solo la administración registra cotizaciones.');
                if (!isUuid(String(input.deal_id ?? ''))) return { error: 'Necesito el deal_id que devuelve list_community_deals.' };
                return addDealQuoteForAdmin(supabaseAdmin, communityId, userCtx.user_id, input as unknown as Parameters<typeof addDealQuoteForAdmin>[3]);
            }

            case 'list_my_marketplace_conversations':
            case 'message_marketplace_seller':
            case 'reply_marketplace_conversation': {
                const communityId = scopedCommunity(userCtx);
                if (!communityId || !userCtx.user_id) return forbidden('No pude identificar al residente.');
                if (name === 'list_my_marketplace_conversations') return listMyMarketplaceConversations(supabaseAdmin, communityId, userCtx.user_id);
                const run = name === 'message_marketplace_seller' ? messageMarketplaceSeller : replyMarketplaceConversation;
                return run(supabaseAdmin, communityId, userCtx.user_id, input as Record<string, unknown>);
            }

            // ── COMUNICACIÓN ─────────────────────────────────────────────────
            case 'create_circular': {
                if (!isAdmin(userCtx)) return { error: 'Solo los administradores pueden enviar circulares.' };
                const communityId = scopedCommunity(userCtx, input.community_id);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                const { data, error } = await supabaseAdmin
                    .from('announcements')
                    .insert({
                        community_id: communityId,
                        title: input.title,
                        content: input.body,
                        author_id: userCtx.user_id || null,
                        priority: 'info',
                    })
                    .select('id')
                    .single();
                if (error) return { error: 'No se pudo publicar la circular.' };
                return { success: true, announcement_id: data.id, message: 'Circular publicada exitosamente.' };
            }

            case 'create_social_post': {
                const communityId = scopedCommunity(userCtx, input.community_id);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                if (!userCtx.user_id) return forbidden('No pude determinar el autor de la publicacion.');
                const unitId = await scopedUnit(userCtx, input.author_unit_id);
                if (!unitId) return forbidden('No pude determinar la unidad autora.');
                const { data, error } = await supabaseAdmin
                    .from('social_posts')
                    .insert({
                        community_id: communityId,
                        content: input.content,
                        author_id: userCtx.user_id,
                    })
                    .select('id')
                    .single();
                if (error) return { error: 'No se pudo publicar en el muro.' };
                return { success: true, post_id: data.id, message: 'Publicación en el muro realizada.' };
            }

            // ── VOTACIONES ──────────────────────────────────────────────────
            case 'list_active_polls': {
                const communityId = scopedCommunity(userCtx, input.community_id);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                const { data, error } = await supabaseAdmin
                    .from('polls')
                    .select('id,title,description,end_date,options:poll_options(id,text)')
                    .eq('community_id', communityId)
                    .eq('status', 'active')
                    .gte('end_date', new Date().toISOString())
                    .order('end_date', { ascending: true });
                if (error) return { error: 'No se pudieron consultar las votaciones.' };
                return data ?? [];
            }

            case 'vote_in_poll': {
                if (userCtx.role !== 'resident') return forbidden('Solo los residentes pueden emitir votos.');
                const communityId = scopedCommunity(userCtx);
                if (!communityId || !userCtx.user_id) return forbidden('No pude determinar al residente y su comunidad.');
                const unitId = await scopedUnit(userCtx, input.unit_id);
                if (!unitId) return forbidden('No pude determinar la unidad votante.');
                const { data: poll } = await supabaseAdmin
                    .from('polls')
                    .select('id')
                    .eq('id', input.poll_id)
                    .eq('community_id', communityId)
                    .eq('status', 'active')
                    .gte('end_date', new Date().toISOString())
                    .maybeSingle();
                if (!poll) return { error: 'La votacion no existe, ya cerro o no pertenece a tu comunidad.' };
                const { data: option } = await supabaseAdmin
                    .from('poll_options')
                    .select('id')
                    .eq('id', input.option_id)
                    .eq('poll_id', poll.id)
                    .maybeSingle();
                if (!option) return { error: 'La opcion indicada no pertenece a esta votacion.' };
                const { error } = await supabaseAdmin.rpc('coco_cast_vote', {
                    p_community_id: communityId,
                    p_poll_id: poll.id,
                    p_option_id: option.id,
                    p_user_id: userCtx.user_id,
                });
                if (error) return { error: 'No se pudo registrar el voto. ¿Ya votaste en esta encuesta?' };
                return { success: true, message: '¡Voto registrado exitosamente! 🗳️' };
            }

            case 'create_poll': {
                if (!isAdmin(userCtx)) return { error: 'Solo los administradores pueden crear votaciones.' };
                const communityId = scopedCommunity(userCtx, input.community_id);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                const options = input.options.split(',').map(o => o.trim()).filter(Boolean);
                if (options.length < 2) return { error: 'La votacion necesita al menos dos opciones.' };
                const endDate = input.closes_at;
                if (!endDate || Number.isNaN(Date.parse(endDate)) || Date.parse(endDate) <= Date.now()) {
                    return { error: 'La fecha de cierre debe ser valida y posterior al momento actual.' };
                }
                const { data: poll, error: pollErr } = await supabaseAdmin
                    .from('polls')
                    .insert({
                        community_id: communityId,
                        title: input.title,
                        description: input.description || input.title,
                        end_date: new Date(endDate).toISOString(),
                        status: 'active',
                        created_by: userCtx.user_id || null,
                    })
                    .select('id')
                    .single();
                if (pollErr) return { error: 'No se pudo crear la votación.' };
                const { error: optionsError } = await supabaseAdmin.from('poll_options').insert(
                    options.map((text, display_order) => ({ poll_id: poll.id, text, display_order, votes: 0 }))
                );
                if (optionsError) {
                    await supabaseAdmin.from('polls').delete().eq('id', poll.id).eq('community_id', communityId);
                    return { error: 'No se pudieron crear las opciones. La votacion fue revertida.' };
                }
                return { success: true, poll_id: poll.id, message: `Votación "${input.title}" creada con ${options.length} opciones.` };
            }

            case 'delete_marketplace_item':
            case 'update_provider_profile':
            case 'list_provider_photos':
            case 'delete_provider_photo':
            case 'update_community_deal':
            case 'delete_deal_quote':
            case 'create_amenity':
            case 'set_unit_owner': {
                const communityId = scopedCommunity(userCtx);
                if (!communityId || !userCtx.user_id) return forbidden('No pude determinar tu comunidad.');
                const actor = { id: userCtx.user_id, role: userCtx.role || 'resident', communityId };
                const args = input as Record<string, unknown>;
                if (name === 'delete_marketplace_item') return deleteMarketplaceItem(supabaseAdmin, actor, args);
                if (name === 'update_provider_profile') return updateProviderProfile(supabaseAdmin, actor, args);
                if (name === 'list_provider_photos') return listProviderPhotos(supabaseAdmin, actor, args);
                if (name === 'delete_provider_photo') return deleteProviderPhoto(supabaseAdmin, actor, args);
                if (!isAdmin(userCtx)) return { error: 'Solo la administración puede hacer eso.' };
                if (name === 'update_community_deal') return updateCommunityDeal(supabaseAdmin, communityId, args);
                if (name === 'delete_deal_quote') return deleteDealQuote(supabaseAdmin, communityId, args);
                if (name === 'create_amenity') return createAmenityForAdmin(supabaseAdmin, communityId, args);
                return setUnitOwner(supabaseAdmin, communityId, args);
            }

            case 'list_my_mediations':
            case 'update_mediation_status': {
                const communityId = scopedCommunity(userCtx);
                if (!communityId || !userCtx.user_id) return forbidden('No pude determinar tu comunidad.');
                const actor = { id: userCtx.user_id, role: userCtx.role || 'resident', communityId };
                if (name === 'list_my_mediations') return listMyMediations(supabaseAdmin, actor);
                return updateMediationStatus(supabaseAdmin, actor, input as Record<string, unknown>);
            }

            case 'list_community_initiatives':
            case 'propose_initiative':
            case 'join_initiative':
            case 'resolve_participation':
            case 'review_initiative':
            case 'request_mediation': {
                const communityId = scopedCommunity(userCtx);
                if (!communityId || !userCtx.user_id) return forbidden('No pude determinar tu comunidad.');
                const actor = { id: userCtx.user_id, role: userCtx.role || 'resident', communityId, name: userCtx.name || null };
                const run = {
                    list_community_initiatives: listCommunityInitiatives, propose_initiative: proposeInitiative, join_initiative: joinInitiative,
                    resolve_participation: resolveParticipation, review_initiative: reviewInitiative, request_mediation: requestMediation,
                }[name];
                return run(supabaseAdmin, actor, input as Record<string, unknown>);
            }

            case 'get_neighbor_invite_link': {
                if (!userCtx.user_id) return forbidden('No pude identificarte.');
                const invite = await getOrCreateInvite(userCtx.user_id);
                if (!invite) return { error: 'Solo los residentes de un edificio pueden invitar vecinos.' };
                return {
                    url: invite.url,
                    whatsapp_link: invite.whatsappUrl,
                    message_to_share: invite.message,
                    message: userCtx.channel === 'whatsapp'
                        ? 'Reenvía message_to_share tal cual a tus vecinos: ya trae tu enlace personal.'
                        : 'Entrega el enlace y el botón [Invitar por WhatsApp](whatsapp_link). Quien entra queda como vecino por validar.',
                };
            }

            case 'set_community_cover_photo': {
                if (userCtx.channel === 'whatsapp') return { error: 'Por WhatsApp no puedo guardar imágenes: súbela desde el chat web o desde el inicio.' };
                if (userCtx.role !== 'admin') return forbidden('Solo la administración cambia la portada del condominio.');
                const communityId = scopedCommunity(userCtx);
                if (!communityId || !userCtx.user_id) return forbidden('No pude identificarte.');
                return setCommunityCoverFromChat(communityId, userCtx.user_id, input as Record<string, unknown>);
            }

            default:
                return NOT_HANDLED;
        }
}
