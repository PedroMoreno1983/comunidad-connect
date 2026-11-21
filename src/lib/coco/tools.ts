/**
 * Herramientas de CoCo: definiciones, permisos por rol y ejecución.
 *
 * Desde el 21-11-2026 el código de cada dominio vive en src/lib/coco/tools/:
 * definitions/<dominio>.ts (lo que ve el modelo), executors/<dominio>.ts (lo que
 * hace), pendingActions.ts (la confirmación) y shared.ts (auxiliares). Aquí quedan
 * los sets de permisos y el punto de entrada. Herramienta nueva: definición y
 * ejecutor en su dominio, y los sets de abajo (ver CLAUDE.md).
 */
import { blockCoCoWrite } from './autonomyGate';
import { COMMUNITY_MODULES, disabledModulesOf, toolsBlockedByModules } from '@/lib/community/modules';
import { NEIGHBOR_MODE_BLOCKED_TOOLS } from '@/lib/neighborMode';
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { NOT_HANDLED, UserContext, forbidden } from './tools/shared';
import { OPERATIONS_TOOL_DEFINITIONS } from './tools/definitions/operations';
import { FINANCE_TOOL_DEFINITIONS } from './tools/definitions/finance';
import { RENTALS_TOOL_DEFINITIONS } from './tools/definitions/rentals';
import { COMMUNITY_TOOL_DEFINITIONS } from './tools/definitions/community';
import { PROVIDERS_TOOL_DEFINITIONS } from './tools/definitions/providers';
import { SUPERMARKET_TOOL_DEFINITIONS } from './tools/definitions/supermarket';
import { ASSISTANT_TOOL_DEFINITIONS } from './tools/definitions/assistant';
import { executeOperationsTool } from './tools/executors/operations';
import { executeFinanceTool } from './tools/executors/finance';
import { executeRentalsTool } from './tools/executors/rentals';
import { executeCommunityTool } from './tools/executors/community';
import { executeProvidersTool } from './tools/executors/providers';
import { executeSupermarketTool } from './tools/executors/supermarket';
import { executeAssistantTool } from './tools/executors/assistant';

export { describePendingAction } from './tools/pendingActions';

const TOOL_EXECUTORS = [executeOperationsTool, executeFinanceTool, executeRentalsTool, executeCommunityTool, executeProvidersTool, executeSupermarketTool, executeAssistantTool];

const MODULE_TOOLS = new Set<string>(Object.values(COMMUNITY_MODULES).flatMap(module => [...module.tools]));

// ── Definiciones de herramientas para Anthropic ──────────────────────────────

export const TOOL_DEFINITIONS = [
    ...OPERATIONS_TOOL_DEFINITIONS,
    ...FINANCE_TOOL_DEFINITIONS,
    ...RENTALS_TOOL_DEFINITIONS,
    ...COMMUNITY_TOOL_DEFINITIONS,
    ...PROVIDERS_TOOL_DEFINITIONS,
    ...SUPERMARKET_TOOL_DEFINITIONS,
    ...ASSISTANT_TOOL_DEFINITIONS,
] as const;

// ── Herramientas que mutan datos reales ──────────────────────────────────────
// Estas SIEMPRE deben pasar por confirmación explícita del usuario antes de
// ejecutarse (ver askCoCo en agent.ts). Las que no están en este set son de
// solo lectura y se ejecutan de inmediato.
export const MUTATING_TOOLS = new Set<string>([
    'save_shopping_list',
    'save_community_document',
    'preview_resident_import', 'apply_resident_import',
    'create_claim',
    'create_reservation',
    // Compromete dinero y un cupo del edificio: el residente confirma antes.
    'book_parking',
    // Genera cargos mensuales en gastos comunes: el residente confirma antes.
    'rent_storage',
    // Deshacer lo que CoCo reserva o publica. Cancelar libera un cupo que otro
    // puede tomar, así que no se revierte: también confirma.
    'cancel_reservation',
    'cancel_parking_booking',
    'cancel_storage_rental',
    // Publicar lo propio: queda pendiente de aprobación, pero es contenido
    // público con precio. Confirma.
    'publish_my_parking_spot',
    'publish_my_storage_unit',
    'update_my_listing',
    'set_my_listing_status',
    // Extender cambia el cobro; los horarios y el acceso deciden quién reserva.
    'extend_parking_booking',
    'set_my_spot_availability',
    'rate_parking_booking',
    'review_parking_access',
    'remove_my_listing',
    // Hablan con terceros o cambian datos propios: confirma.
    'message_marketplace_seller',
    'reply_marketplace_conversation',
    'update_my_name',
    'delete_shopping_list',
    'register_my_vehicle',
    'request_payment_agreement',
    'publish_marketplace_item',
    'update_marketplace_item',
    // Avisa a la administración en nombre del residente.
    'report_transfer',
    'request_service',
    'propose_community_deal',
    'join_community_deal',
    'add_community_deal_quote',
    'create_circular',
    'create_social_post',
    'vote_in_poll',
    'register_visitor',
    'register_package',
    'send_whatsapp_notification',
    'create_poll',
    'update_unit_data',
    // Validar o quitar a un vecino, y asignar su departamento: cambian el
    // acceso de otra persona. Confirma siempre.
    'decide_pending_resident',
    'assign_resident_unit',
    // Estado de casos y aprobaciones: el vecino recibe el resultado. Confirma.
    'update_case_status',
    'review_listing',
    'update_service_request_status',
    'register_incident',
    'propose_initiative',
    'join_initiative',
    // Dinero: cambian la deuda de una unidad o el gasto del mes. Confirma.
    'add_unit_charge',
    'cancel_unit_charge',
    'delete_unit_payment',
    'delete_community_expense',
    'create_payment_agreement',
    'delete_marketplace_item',
    'update_community_deal',
    'delete_deal_quote',
    'update_provider_profile',
    'delete_provider_photo',
    'create_amenity',
    'set_unit_owner',
    'cancel_payment_agreement',
    'pay_agreement_installment',
    'update_mediation_status',
    'resolve_participation',
    'review_initiative',
    'request_mediation',
    'record_water_reading',
    'review_group_order',
    'request_urgent_access_approval',
    'dispatch_provider',
    'register_external_provider',
    'send_provider_portal_link',
    'rate_provider',
    'review_provider_document',
    'save_provider_attachment',
    'set_community_cover_photo',
    'create_supermarket_group_order',
    'join_supermarket_group_order',
    'lock_supermarket_group_order',
    'record_supermarket_group_purchase',
    'create_unit',
    'set_unit_alicuota',
    'distribute_alicuotas_equally',
    'add_community_expense',
    'record_payment',
    'issue_billing',
    'cancel_issued_billing',
    'schedule_community_notice',
    'decide_booking',
    'remember_community_fact',
    'create_reminder',
    'cancel_reminder',
    'resume_agent_task',
    'delegate_background_task',
    'draft_outbound_email',
    'draft_committee_report',
    'create_routine',
    'pause_routine',
    'delete_routine',
    'coordinate_specialists',
    'send_gmail',
    'create_calendar_event',
]);

const RESIDENT_TOOLS = new Set([
    'save_shopping_list',
    'get_resident_info', 'get_payment_status', 'get_water_consumption', 'list_services',
    'search_marketplace', 'create_claim', 'get_claim_status', 'list_my_claims',
    'check_availability', 'create_reservation', 'create_social_post', 'list_active_polls',
    'vote_in_poll', 'register_visitor', 'get_pending_packages',
    'list_supermarket_group_orders', 'compare_supermarket_group_order',
    'create_supermarket_group_order', 'join_supermarket_group_order', 'lock_supermarket_group_order',
    'record_supermarket_group_purchase',
    'remember_preference', 'create_reminder', 'list_reminders', 'cancel_reminder',
    'get_platform_guide', 'consult_official_legal_source', 'research_chilean_law',
    'search_public_web', 'read_official_page', 'list_community_agenda',
    // Estacionamientos. Las dos primeras son de lectura y estan acotadas a la
    // comunidad del residente. book_parking si muta, y por eso figura tambien
    // en MUTATING_TOOLS: el residente confirma antes de que se cobre nada.
    'get_my_parking', 'search_parking', 'book_parking',
    'get_my_storage', 'search_storage', 'rent_storage',
    'cancel_reservation', 'cancel_parking_booking', 'cancel_storage_rental', 'report_transfer',
    'publish_my_parking_spot', 'publish_my_storage_unit',
    'list_my_listings', 'update_my_listing', 'set_my_listing_status', 'remove_my_listing',
    'extend_parking_booking', 'set_my_spot_availability', 'rate_parking_booking',
    'list_service_requests', 'update_service_request_status',
    'list_community_initiatives', 'propose_initiative', 'join_initiative', 'resolve_participation', 'request_mediation',
    'list_my_mediations', 'update_mediation_status',
    'delete_marketplace_item', 'update_provider_profile', 'list_provider_photos', 'delete_provider_photo',
    'list_my_marketplace_conversations', 'message_marketplace_seller', 'reply_marketplace_conversation',
    'update_my_name', 'delete_shopping_list', 'register_my_vehicle', 'request_payment_agreement',
    'compare_shopping_list', 'publish_marketplace_item', 'update_marketplace_item', 'request_service',
    'list_community_deals', 'suggest_community_deals', 'propose_community_deal', 'join_community_deal',
    // Perfil del maestro: valorar, y que el propio maestro (con cuenta) suba
    // fotos o documentos por el chat; el ejecutor comprueba que sea su perfil.
    'rate_provider', 'save_provider_attachment',
    'get_neighbor_invite_link',
    // Documentos de la comunidad (reglamento, actas): buscar y citar la página.
    'search_community_documents',
]);

const CONCIERGE_TOOLS = new Set([
    ...RESIDENT_TOOLS,
    'register_package', 'send_whatsapp_notification', 'request_urgent_access_approval',
    'list_open_cases', 'update_case_status', 'register_incident',
    'dispatch_provider',
]);

const ADMIN_TOOLS = new Set([
    ...CONCIERGE_TOOLS,
    // Portada del condominio: la ve toda la comunidad.
    'set_community_cover_photo',
    // Borradores legales: solo la administración (ver legalDraftMarker.ts).
    'prepare_legal_draft',
    'add_community_deal_quote',
    'create_circular', 'get_defaulters_list', 'create_poll', 'update_unit_data',
    'list_pending_residents', 'decide_pending_resident', 'assign_resident_unit',
    'list_pending_listings', 'review_listing', 'review_group_order', 'record_water_reading', 'review_initiative',
    'get_unit_account', 'add_unit_charge', 'cancel_unit_charge', 'delete_unit_payment', 'list_community_expenses', 'delete_community_expense',
    'list_payment_agreements', 'create_payment_agreement', 'cancel_payment_agreement', 'pay_agreement_installment',
    'list_parking_access_requests', 'review_parking_access',
    'update_community_deal', 'delete_deal_quote', 'create_amenity', 'set_unit_owner',
    'create_unit', 'set_unit_alicuota', 'distribute_alicuotas_equally',
    'add_community_expense', 'record_payment', 'get_monthly_finance_report', 'preview_billing', 'issue_billing',
    'resume_agent_task',
    'delegate_background_task',
    'draft_committee_report',
    'create_routine', 'list_routines', 'pause_routine', 'delete_routine',
    'coordinate_specialists',
    'list_my_gmail', 'list_my_calendar', 'send_gmail', 'create_calendar_event',
    'cancel_issued_billing', 'schedule_community_notice', 'list_pending_bookings', 'decide_booking',
    'remember_community_fact',
    'save_community_document',
    'preview_resident_import', 'apply_resident_import',
    'draft_outbound_email',
    'register_external_provider', 'send_provider_portal_link',
    'list_provider_documents', 'review_provider_document',
]);

const SYSTEM_TOOLS = new Set([
    'list_services', 'create_claim', 'request_urgent_access_approval', 'dispatch_provider',
]);

// Herramientas de residente que el personal no usa aunque herede el conjunto:
// votar es de los copropietarios, y la administración modera el Marketplace,
// no vende en él (política de roles del prompt).
// El supermercado personal (/resident/supermercado) solo lo abre un residente:
// ofrecerle al personal comparar o guardar listas lo llevaría a una pantalla
// que lo rechaza.
// Informar una transferencia es del residente: la administración registra el
// pago en cobranza (la ruta de la pantalla también la rechaza para admin).
const RESIDENT_ONLY_TOOLS = new Set([
    'vote_in_poll', 'publish_marketplace_item', 'update_marketplace_item', 'compare_shopping_list', 'save_shopping_list', 'report_transfer',
    // Comprar y vender entre vecinos, su súper, su auto y su deuda: del residente.
    'list_my_marketplace_conversations', 'message_marketplace_seller', 'reply_marketplace_conversation',
    'delete_shopping_list', 'register_my_vehicle', 'request_payment_agreement',
]);

// Conserjería no abre /services (roleAccess.ts): pedir un servicio lo dejaría
// sin forma de revisar ni gestionar la solicitud que creó.
const NOT_FOR_CONCIERGE_TOOLS = new Set(['request_service']);

/** Herramientas que se le ofrecen al modelo según rol y canal. */
export function isToolOfferedFor(name: string, role?: string, channel?: string) {
    // save_provider_attachment necesita la imagen guardada aparte, y eso solo pasa en el chat web.
    if ((name === 'save_provider_attachment' || name === 'set_community_cover_photo') && channel === 'whatsapp') return false;
    return isToolAllowedForRole(name, role);
}

export function isToolAllowedForRole(name: string, role?: string) {
    if (role === 'system') return SYSTEM_TOOLS.has(name);
    if (role === 'admin') return ADMIN_TOOLS.has(name) && !RESIDENT_ONLY_TOOLS.has(name);
    if (role === 'concierge') return CONCIERGE_TOOLS.has(name) && !RESIDENT_ONLY_TOOLS.has(name) && !NOT_FOR_CONCIERGE_TOOLS.has(name);
    return RESIDENT_TOOLS.has(name);
}

export async function executeTool(
    name: string,
    input: Record<string, string>,
    userCtx: UserContext
): Promise<unknown> {
    try {
        if (!isToolAllowedForRole(name, userCtx.role)) return forbidden();
        if (MODULE_TOOLS.has(name) && userCtx.community_id) {
            const { data: community } = await supabaseAdmin.from('communities').select('disabled_modules').eq('id', userCtx.community_id).maybeSingle();
            if (toolsBlockedByModules(disabledModulesOf(community?.disabled_modules)).has(name)) {
                return forbidden('Ese módulo no está activo en esta comunidad.');
            }
        }
        if (NEIGHBOR_MODE_BLOCKED_TOOLS.has(name) && userCtx.community_id) {
            const [{ data: community }, { data: profile }] = await Promise.all([
                supabaseAdmin.from('communities').select('managed').eq('id', userCtx.community_id).maybeSingle(),
                userCtx.user_id ? supabaseAdmin.from('profiles').select('residence_verified').eq('id', userCtx.user_id).maybeSingle() : Promise.resolve({ data: null }),
            ]);
            if (community?.managed === false) return forbidden('Eso se activa cuando la administración del edificio se suma a Convive.');
            if (profile?.residence_verified === false) return forbidden('Eso se activa cuando la administración confirme que vives en el edificio.');
        }
        if (MUTATING_TOOLS.has(name)) {
            const blocked = await blockCoCoWrite(userCtx);
            if (blocked) return blocked;
        }
        // Cada dominio despacha sus herramientas (src/lib/coco/tools/executors/).
        for (const run of TOOL_EXECUTORS) {
            const result = await run(name, input, userCtx);
            if (result !== NOT_HANDLED) return result;
        }
        return { error: `Herramienta desconocida: ${name}` };
    } catch (err) {
        console.error(`[CoCo Tool Error] ${name}:`, err);
        return { error: `Error ejecutando herramienta ${name}` };
    }
}
