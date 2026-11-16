/**
 * Cobertura agéntica: qué de lo que se puede hacer en la interfaz puede hacer
 * también CoCo, conversando.
 *
 * Cada acción que modifica datos desde la interfaz (un método de un Service en
 * src/lib/api/ o una ruta POST/PATCH/PUT/DELETE de src/app/api/) tiene que
 * figurar aquí con una de cinco clases:
 *
 *   tool    CoCo la hace con esa herramienta.
 *   gap     CoCo todavía no la hace y debería. La razón dice qué falta. Es la
 *           lista de trabajo pendiente: cerrar una brecha es pasarla a `tool`.
 *   ui      Se queda en la interfaz a propósito (subir archivos, revisar
 *           planillas, configurar), con la razón. CoCo puede llevar a la
 *           pantalla con get_platform_guide.
 *   read    Usa POST pero no modifica nada (calcula, compara, interpreta).
 *   system  La llama otro flujo (un enlace con token, un proveedor de pagos,
 *           la propia pantalla al cargar), no una persona pidiendo algo.
 *
 * tests/unit/coco-agent-coverage.test.ts falla si aparece una acción nueva que
 * no figura aquí, si queda una entrada de algo que ya no existe, o si una
 * entrada `tool` apunta a una herramienta que CoCo no tiene. Así una pantalla
 * nueva no queda fuera de CoCo sin que alguien lo decida por escrito.
 *
 * El inventario lo arma el propio test: recorre src/lib/api/ y src/app/api/.
 */

export type AgentCoverage =
    | { tool: string | string[] }
    | { gap: string }
    | { ui: string }
    | { read: string }
    | { system: string };

const SYSTEM_EMAIL = { system: 'Correo que dispara otro flujo de la plataforma.' };
const TRAINING = { ui: 'Capacitación del personal: contenido y evaluaciones se gestionan en su módulo.' };
const SUPERADMIN = { ui: 'Operación de la plataforma (superadmin), fuera del alcance de un condominio.' };
const PORTAL = { system: 'Portal del proveedor externo, entra con su enlace con token, sin cuenta en la comunidad.' };

export const AGENT_COVERAGE: Record<string, AgentCoverage> = {
    // ── Residente: espacios comunes, estacionamiento, bodega ────────────────
    'AmenitiesService.createBooking': { tool: 'create_reservation' },
    'AmenitiesService.updateBookingStatus': { tool: ['decide_booking', 'cancel_reservation'] },
    'AmenitiesService.createAmenity': { gap: 'La administración no puede crear un espacio común conversando.' },
    'ParkingService.book': { tool: 'book_parking' },
    'ParkingService.cancelBooking': { tool: 'cancel_parking_booking' },
    'ParkingService.saveMyDriver': { gap: 'Registrar la patente: hoy CoCo manda a /estacionamientos y la reserva falla hasta hacerlo.' },
    'ParkingService.createSpot': { gap: 'Publicar el estacionamiento propio para arrendarlo a vecinos.' },
    'ParkingService.updateSpot': { gap: 'Cambiar precio o datos del estacionamiento propio.' },
    'ParkingService.deleteSpot': { gap: 'Retirar el estacionamiento propio.' },
    'ParkingService.setAvailability': { gap: 'Abrir o cerrar horarios del estacionamiento propio.' },
    'ParkingService.toggleSpotInstantAvailability': { gap: 'Ofrecer el estacionamiento propio "desde ahora".' },
    'ParkingService.rateBooking': { gap: 'Calificar una reserva de estacionamiento terminada.' },
    'ParkingService.recordAccess': { ui: 'Conserjería registra entradas y salidas en la portería, con el código a la vista.' },
    'ParkingService.requestCommunityAccess': { gap: 'Pedir que la comunidad habilite estacionamientos.' },
    'ParkingService.requestEarningsPayout': { gap: 'Pedir el pago de lo ganado arrendando el estacionamiento.' },
    'ParkingService.updateCommunitySettings': { ui: 'Configuración del módulo de estacionamientos de la comunidad.' },
    'StorageService.rent': { tool: 'rent_storage' },
    'StorageService.cancelRental': { tool: 'cancel_storage_rental' },
    'StorageService.createUnit': { gap: 'Publicar la bodega propia para arrendarla a vecinos.' },
    'StorageService.updateUnit': { gap: 'Cambiar precio o datos de la bodega propia.' },
    'StorageService.setUnitStatus': { gap: 'Pausar la bodega propia, o que la administración la apruebe.' },
    'StorageService.deleteUnit': { gap: 'Retirar la bodega propia.' },

    // ── Residente: marketplace, votaciones, servicios ───────────────────────
    'MarketplaceService.createItem': { tool: 'publish_marketplace_item' },
    'MarketplaceService.updateStatus': { tool: 'update_marketplace_item' },
    '/api/marketplace-items/[id]': { tool: 'update_marketplace_item' },
    '/api/marketplace-items/embed': { system: 'Indexa la publicación para la búsqueda, después de crearla.' },
    'MarketplaceMessagingService.startConversation': { gap: 'Escribirle al vendedor de un artículo.' },
    'MarketplaceMessagingService.sendMessage': { gap: 'Responder un mensaje del Marketplace.' },
    'MarketplaceMessagingService.markRead': { system: 'La pantalla marca leído al abrir la conversación.' },
    'PollsService.submitVote': { tool: 'vote_in_poll' },
    '/api/polls': { tool: 'create_poll' },
    '/api/service-requests': { tool: 'request_service' },
    '/api/service-requests/[id]/status': { gap: 'Aceptar, reprogramar o cerrar una solicitud de servicio.' },
    '/api/reviews': { tool: 'rate_provider' },
    'CocoCasesService.updateStatus': { gap: 'La administración no puede cambiar el estado de un caso conversando.' },
    'MaintenanceService.createServiceTask': { tool: 'create_claim' },
    '/api/admin/maintenance/tasks/[id]/complete': { gap: 'Cerrar una tarea de mantención.' },

    // ── Residente: dinero ───────────────────────────────────────────────────
    'ResidentFinanceService.reportTransfer': { tool: 'report_transfer' },
    '/api/finance/transfer-report': { tool: 'report_transfer' },
    'ResidentFinanceService.requestAgreementConversation': { gap: 'Pedir un convenio de pago.' },
    '/api/resident/agreement-request': { gap: 'Pedir un convenio de pago.' },
    '/api/payments/create-haulmer-link': { gap: 'Link de pago en línea: espera las credenciales de Haulmer.' },
    '/api/payments/transbank/return': { system: 'Retorno del proveedor de pagos.' },

    // ── Residente: perfil y cuenta ──────────────────────────────────────────
    'ProfileService.saveProfile': { gap: 'Actualizar los datos del propio perfil.' },
    'ProfileService.saveWhatsapp': { gap: 'Activar o cambiar el WhatsApp donde CoCo le escribe.' },
    'ProfileService.uploadAvatar': { ui: 'Subir una foto de perfil.' },
    '/api/profile/avatar': { ui: 'Subir una foto de perfil.' },
    'ProfileService.sendPasswordReset': { ui: 'Recuperar la clave: pasa por el correo, fuera de la sesión.' },
    '/api/profile/ensure-resident-unit': { system: 'La app asocia la unidad al cargar el perfil.' },
    'AuthProvidersService.joinCommunity': { ui: 'Elegir edificio al registrarse, antes de tener sesión con CoCo.' },
    'AuthProvidersService.settings': { read: 'Lee qué proveedores de inicio de sesión están activos.' },
    'PushService.registerDevice': { system: 'La app nativa registra el dispositivo para notificaciones.' },
    '/api/privacy/consents': { ui: 'Consentimientos de privacidad: se dan en pantalla, con el texto a la vista.' },
    '/api/privacy/requests': { ui: 'Solicitudes de datos personales (Ley 19.628): formulario con identidad verificada.' },

    // ── Comunidad (convivencia) ─────────────────────────────────────────────
    'CommunityCollaborationService.createTimeBankOffer': { gap: 'Ofrecer ayuda en el Banco de Tiempo.' },
    'CommunityCollaborationService.requestTimeBankOffer': { gap: 'Pedir una oferta del Banco de Tiempo.' },
    'CommunityCollaborationService.createCollectivePurchase': { gap: 'Proponer una compra colectiva (Abasto Comunitario).' },
    'CommunityCollaborationService.joinCollectivePurchase': { gap: 'Sumarse a una compra colectiva.' },
    'CommunityCollaborationService.createCommunityProject': { gap: 'Proponer un proyecto comunitario.' },
    'CommunityCollaborationService.joinCommunityProject': { gap: 'Sumarse a un proyecto comunitario.' },
    'CommunityCollaborationService.resolveParticipationRequest': { gap: 'La administración valida iniciativas y participantes.' },
    'CommunityCollaborationService.createMediationCase': { gap: 'Pedir una mediación entre vecinos.' },
    'CommunityCollaborationService.updateMediationStatus': { gap: 'Avanzar una mediación.' },
    'CommunityDealsService.setInterest': { tool: 'join_community_deal' },
    'CommunityDealsService.addQuote': { tool: 'add_community_deal_quote' },
    'CommunityDealsService.deleteQuote': { gap: 'Borrar una cotización de un convenio.' },
    'CommunityDealsService.update': { gap: 'La administración activa, pausa o edita un convenio.' },
    '/api/solidarity/apply': { gap: 'Postular al fondo solidario.' },
    '/api/solidarity/applications/[id]/status': { gap: 'Resolver una postulación al fondo solidario.' },
    '/api/solidarity/fund': { ui: 'Configurar el fondo solidario.' },
    '/api/solidarity/tasks': { gap: 'Tareas del fondo solidario.' },
    '/api/assemblies': { gap: 'Convocar o gestionar una asamblea.' },
    '/api/assemblies/unit-rights': { ui: 'Derechos de voto por unidad: planilla de la asamblea.' },

    // ── Supermercado ────────────────────────────────────────────────────────
    'SupermarketCatalogService.saveList': { tool: 'save_shopping_list' },
    '/api/supermarket/lists': { tool: 'save_shopping_list' },
    'SupermarketCatalogService.deleteList': { gap: 'Borrar una lista guardada.' },
    'SupermarketCatalogService.savedLists': { read: 'Lista las listas guardadas.' },
    'SupermarketCatalogService.resolveList': { read: 'Interpreta una lista contra el catálogo.' },
    'SupermarketGroupService.create': { tool: 'create_supermarket_group_order' },
    'SupermarketGroupService.join': { tool: 'join_supermarket_group_order' },
    'SupermarketGroupService.settle': { tool: 'lock_supermarket_group_order' },
    'SupermarketGroupService.recordPurchase': { tool: 'record_supermarket_group_purchase' },
    '/api/supermarket/group-orders': { tool: ['create_supermarket_group_order', 'join_supermarket_group_order', 'lock_supermarket_group_order', 'record_supermarket_group_purchase'] },
    '/api/supermarket': { read: 'Busca productos y precios.' },
    '/api/supermarket/alternatives': { read: 'Sugiere productos alternativos.' },
    '/api/supermarket/cart-plan': { read: 'Arma el plan de compra por tienda.' },
    '/api/supermarket/catalog/resolve': { read: 'Interpreta productos contra el catálogo.' },
    '/api/supermarket/real-total': { read: 'Calcula el total real del carro.' },
    '/api/supermarket/refresh': { system: 'Refresca precios del catálogo.' },
    '/api/supermarket/seals': { read: 'Consulta sellos nutricionales.' },
    '/api/supermarket/history': { system: 'Guarda el historial de búsquedas del comparador.' },
    '/api/supermarket/revision': { system: 'Registra la revisión de una lista en el comparador.' },
    '/api/supermarket/list-upload': { ui: 'Subir una foto o archivo de lista.' },
    '/api/supermarket/cart-handoff': { ui: 'Abre la compra en el sitio de la tienda, en el navegador del residente.' },

    // ── Proveedores (Red Convive) ───────────────────────────────────────────
    'ProviderNetworkService.create': { tool: 'register_external_provider' },
    '/api/providers': { tool: 'register_external_provider' },
    'ProviderNetworkService.createInvite': { tool: 'send_provider_portal_link' },
    'ProviderProfileService.createInvite': { tool: 'send_provider_portal_link' },
    '/api/providers/[id]/invite': { tool: 'send_provider_portal_link' },
    'ProviderProfileService.setVerified': { tool: 'review_provider_document' },
    'ProviderProfileService.update': { gap: 'Editar los datos de un proveedor.' },
    '/api/providers/[id]': { gap: 'Editar los datos de un proveedor.' },
    'ProviderMediaService.uploadPhoto': { tool: 'save_provider_attachment' },
    'ProviderMediaService.uploadDocument': { tool: 'save_provider_attachment' },
    '/api/providers/[id]/media': { tool: 'save_provider_attachment' },
    '/api/providers/[id]/documents': { tool: ['save_provider_attachment', 'review_provider_document'] },
    'ProviderMediaService.deletePhoto': { gap: 'Borrar una foto del perfil del maestro.' },
    'ProviderPortalService.updateProfile': PORTAL,
    'ProviderPortalService.updateRequest': PORTAL,
    '/api/provider-portal/[token]': PORTAL,
    '/api/provider-portal/[token]/documents': PORTAL,
    '/api/provider-portal/[token]/media': PORTAL,
    '/api/provider-portal/[token]/requests/[requestId]': PORTAL,

    // ── Conserjería ─────────────────────────────────────────────────────────
    '/api/concierge/visit-notify': { tool: 'register_visitor' },
    '/api/concierge/incidents': { gap: 'Registrar un incidente de conserjería.' },
    '/api/intercom/calls': { ui: 'Citófono: llamada en vivo desde portería.' },
    '/api/intercom/calls/[id]': { ui: 'Citófono: contestar o cortar una llamada en vivo.' },
    '/api/admin/access-gate': { ui: 'Configuración del portón y sus dispositivos.' },
    '/api/whatsapp-notify': { tool: 'send_whatsapp_notification' },

    // ── Administración: comunicación y residentes ───────────────────────────
    'AnnouncementsService.createAnnouncement': { tool: ['create_circular', 'schedule_community_notice'] },
    '/api/admin/pending-residents': { gap: 'Aprobar o rechazar a los residentes que se registraron.' },
    '/api/admin/users/assign-unit': { gap: 'Asignar la unidad a un residente.' },
    'WaterService.createUnit': { tool: 'create_unit' },
    'WaterService.updateUnit': { tool: ['update_unit_data', 'set_unit_alicuota'] },
    'WaterService.assignResident': { gap: 'Asignar un residente a una unidad.' },
    'WaterService.saveReading': { gap: 'Registrar una lectura de agua.' },
    '/api/onboarding/batches': { ui: 'Carga masiva de unidades y residentes desde una planilla.' },
    '/api/onboarding/batches/[id]': { ui: 'Revisión de una carga masiva.' },
    '/api/onboarding/extract': { read: 'Interpreta una planilla subida.' },
    '/api/onboarding/upsert': { ui: 'Aplica una carga masiva revisada.' },
    '/api/admin/coco-memory': { tool: 'remember_community_fact' },
    '/api/admin/coco-proposals': { ui: 'Aprobar o rechazar lo que CoCo propuso: es el control humano sobre el agente.' },
    '/api/admin/coco-activity': { ui: 'Bitácora de CoCo: revisión humana.' },
    '/api/admin/google': { ui: 'Conectar Google (OAuth) se autoriza en pantalla.' },
    '/api/admin/api-keys': { ui: 'Claves de integración: secretos, nunca por chat.' },
    '/api/admin/oversight-links': { ui: 'Enlaces de supervisión para el comité.' },
    '/api/operations/events': { system: 'Registro de auditoría de operaciones.' },
    '/api/admin-onboarding/register': { ui: 'Alta de una administración nueva, antes de tener cuenta.' },
    '/api/admin-onboarding/guide': { read: 'Guía de puesta en marcha.' },

    // ── Administración: finanzas ────────────────────────────────────────────
    '/api/admin/billing': { tool: ['preview_billing', 'issue_billing', 'cancel_issued_billing'] },
    '/api/admin/billing-review': { ui: 'Revisión del comité antes de emitir: decisión con el detalle a la vista.' },
    '/api/admin/payments': { tool: 'record_payment' },
    '/api/admin/payments/import': { ui: 'Importar la cartola del banco (archivo).' },
    '/api/admin/bank-reconciliation': { ui: 'Conciliación bancaria: cuadrar movimiento por movimiento.' },
    '/api/admin/bank-reconciliation/parse': { read: 'Interpreta una cartola subida.' },
    '/api/admin/community-expenses': { tool: 'add_community_expense' },
    '/api/admin/charges': { gap: 'Agregar o anular un cargo puntual a una unidad (multa, reembolso).' },
    '/api/admin/agreements': { gap: 'Crear o aprobar un convenio de pago.' },
    '/api/finance/agreement-review': { ui: 'Revisión de convenios por el comité.' },
    '/api/finance/committee-review': { ui: 'Revisión del comité de finanzas.' },
    'FinanceCommitteeService.request': { gap: 'Pedir sumarse al comité de finanzas.' },
    'FinanceCommitteeService.endMembership': { gap: 'Dejar el comité de finanzas.' },
    '/api/admin/finance-committee': { ui: 'Integrar el comité de finanzas.' },
    '/api/admin/finance-report': { tool: ['get_monthly_finance_report', 'draft_committee_report'] },
    '/api/admin/finance-documents': { ui: 'Subir respaldos contables (archivos).' },
    '/api/admin/financial-statements': { ui: 'Estados financieros: cierre contable.' },
    '/api/admin/journal': { ui: 'Libro diario: asientos contables.' },
    '/api/admin/budget': { ui: 'Presupuesto anual: planilla.' },
    '/api/admin/payroll': { ui: 'Remuneraciones del personal: planilla y liquidaciones.' },
    '/api/admin/invoicing': { ui: 'Facturación electrónica: emisión con datos tributarios.' },
    '/api/parking/charges/process': { system: 'Procesa el cobro de una reserva de estacionamiento.' },
    '/api/parking/payouts/reconcile': { ui: 'Conciliar pagos a dueños de estacionamientos.' },
    '/api/iot/test-trigger': { system: 'Prueba de sensores IoT.' },

    // ── Correos del sistema ─────────────────────────────────────────────────
    '/api/email/booking-confirmation': SYSTEM_EMAIL,
    '/api/email/expense-alert': SYSTEM_EMAIL,
    '/api/email/new-community': SYSTEM_EMAIL,
    '/api/email/send-expenses': { tool: 'issue_billing' },
    '/api/email/welcome': SYSTEM_EMAIL,
    '/api/email/outreach': { tool: ['draft_outbound_email', 'send_gmail'] },

    // ── Comercial, marketing, capacitación, superadmin ──────────────────────
    'CommercialService.submitLead': { ui: 'Formulario comercial de la landing, sin sesión.' },
    '/api/marketing/reels': { ui: 'Marketing de la plataforma.' },
    '/api/marketing/reels/upload': { ui: 'Marketing de la plataforma.' },
    '/api/training/assignments': TRAINING,
    '/api/training/attempts': TRAINING,
    '/api/training/generate-slides': TRAINING,
    '/api/training/modules': TRAINING,
    '/api/training/multi-agent': TRAINING,
    '/api/training/parse': TRAINING,
    '/api/training/progress': TRAINING,
    '/api/training/retention': TRAINING,
    '/api/superadmin/buildings': SUPERADMIN,
    '/api/superadmin/communities': SUPERADMIN,
    '/api/superadmin/providers': SUPERADMIN,
    '/api/superadmin/providers/[id]': SUPERADMIN,
    '/api/superadmin/providers/[id]/documents': SUPERADMIN,
    '/api/superadmin/providers/[id]/invite': SUPERADMIN,
};

export function coverageSummary(entries: Record<string, AgentCoverage> = AGENT_COVERAGE) {
    const count = { tool: 0, gap: 0, ui: 0, read: 0, system: 0 };
    for (const entry of Object.values(entries)) count[Object.keys(entry)[0] as keyof typeof count] += 1;
    // Lo que una persona podría pedir: lo que CoCo hace más lo que le falta.
    const askable = count.tool + count.gap;
    return { ...count, askable, percent: askable ? Math.round((count.tool / askable) * 100) : 100 };
}
