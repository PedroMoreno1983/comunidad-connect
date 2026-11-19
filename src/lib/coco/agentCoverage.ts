/**
 * Cobertura agéntica: qué de lo que se puede hacer en la interfaz puede hacer
 * también CoCo, conversando.
 *
 * Cada acción que modifica datos desde la interfaz (un método de un Service en
 * src/lib/api/, o cada verbo POST/PATCH/PUT/DELETE de una ruta de src/app/api/
 * con clave "VERBO /api/ruta": un PUT y un DELETE son acciones distintas) tiene que
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
    'AmenitiesService.createAmenity': { tool: 'create_amenity' },
    'ParkingService.book': { tool: 'book_parking' },
    'ParkingService.cancelBooking': { tool: 'cancel_parking_booking' },
    'ParkingService.saveMyDriver': { tool: 'register_my_vehicle' },
    'ParkingService.createSpot': { tool: 'publish_my_parking_spot' },
    'ParkingService.updateSpot': { tool: 'update_my_listing' },
    'ParkingService.deleteSpot': { tool: 'remove_my_listing' },
    'ParkingService.setAvailability': { tool: 'set_my_spot_availability' },
    'ParkingService.toggleSpotInstantAvailability': { tool: 'set_my_listing_status' },
    'ParkingService.rateBooking': { tool: 'rate_parking_booking' },
    'ParkingService.recordAccess': { ui: 'Conserjería registra entradas y salidas en la portería, con el código a la vista.' },
    'ParkingService.requestCommunityAccess': { gap: 'Pedir que la comunidad habilite estacionamientos.' },
    'ParkingService.requestEarningsPayout': { ui: 'No implementado: la pantalla solo informa que los retiros no están habilitados (esperan las credenciales de Haulmer).' },
    'ParkingService.updateCommunitySettings': { ui: 'Configuración del módulo de estacionamientos de la comunidad.' },
    'StorageService.rent': { tool: 'rent_storage' },
    'StorageService.cancelRental': { tool: 'cancel_storage_rental' },
    'StorageService.createUnit': { tool: 'publish_my_storage_unit' },
    'StorageService.updateUnit': { tool: 'update_my_listing' },
    'StorageService.setUnitStatus': { tool: 'set_my_listing_status' },
    'StorageService.deleteUnit': { tool: 'remove_my_listing' },

    // ── Residente: marketplace, votaciones, servicios ───────────────────────
    'MarketplaceService.createItem': { tool: 'publish_marketplace_item' },
    'MarketplaceService.updateStatus': { tool: 'update_marketplace_item' },
    'DELETE /api/marketplace-items/[id]': { tool: 'delete_marketplace_item' },

    'PATCH /api/marketplace-items/[id]': { tool: 'update_marketplace_item' },
    'POST /api/marketplace-items/embed': { system: 'Indexa la publicación para la búsqueda, después de crearla.' },
    'MarketplaceMessagingService.startConversation': { tool: 'message_marketplace_seller' },
    'MarketplaceMessagingService.sendMessage': { tool: ['message_marketplace_seller', 'reply_marketplace_conversation'] },
    'MarketplaceMessagingService.markRead': { system: 'La pantalla marca leído al abrir la conversación.' },
    'PollsService.submitVote': { tool: 'vote_in_poll' },
    'POST /api/polls': { tool: 'create_poll' },
    'POST /api/service-requests': { tool: 'request_service' },
    'PATCH /api/service-requests/[id]/status': { tool: 'update_service_request_status' },
    'POST /api/reviews': { tool: 'rate_provider' },
    'CocoCasesService.updateStatus': { tool: 'update_case_status' },
    'MaintenanceService.createServiceTask': { tool: 'create_claim' },
    'POST /api/admin/maintenance/tasks/[id]/complete': { ui: 'Cerrar una tarea exige subir la foto del trabajo terminado como respaldo (bucket privado); se hace en Mantenimiento.' },

    // ── Residente: dinero ───────────────────────────────────────────────────
    'ResidentFinanceService.reportTransfer': { tool: 'report_transfer' },
    'POST /api/finance/transfer-report': { tool: 'report_transfer' },
    'ResidentFinanceService.requestAgreementConversation': { tool: 'request_payment_agreement' },
    'POST /api/resident/agreement-request': { tool: 'request_payment_agreement' },
    'POST /api/payments/create-haulmer-link': { gap: 'Link de pago en línea: espera las credenciales de Haulmer.' },
    'POST /api/payments/transbank/return': { system: 'Retorno del proveedor de pagos.' },
    'BoatsService.create': { gap: 'Registrar una embarcación (Vida junto al lago).' },
    'POST /api/boats': { gap: 'Registrar una embarcación (Vida junto al lago).' },
    'BoatsService.remove': { ui: 'Quitar una embarcación del registro: se hace en la pantalla, con confirmación.' },
    'DELETE /api/boats': { ui: 'Quitar una embarcación del registro: se hace en la pantalla, con confirmación.' },
    'UtilityAccountsService.create': { gap: 'Registrar una cuenta personal de luz, agua o gas (Mis servicios).' },
    'POST /api/resident/utility-accounts': { gap: 'Registrar una cuenta personal de luz, agua o gas (Mis servicios).' },
    'UtilityAccountsService.update': { gap: 'Marcar como pagada una cuenta de luz, agua o gas, o cambiar su vencimiento.' },
    'PATCH /api/resident/utility-accounts': { gap: 'Marcar como pagada una cuenta de luz, agua o gas, o cambiar su vencimiento.' },
    'UtilityAccountsService.remove': { ui: 'Quitar una cuenta de Mis servicios: se hace en la pantalla, con confirmación.' },
    'DELETE /api/resident/utility-accounts': { ui: 'Quitar una cuenta de Mis servicios: se hace en la pantalla, con confirmación.' },

    // ── Residente: perfil y cuenta ──────────────────────────────────────────
    'ProfileService.saveProfile': { tool: 'update_my_name' },
    'ProfileService.saveWhatsapp': { ui: 'Consentimiento de WhatsApp (Ley 19.628): se da en /privacy-center con el aviso a la vista; la evidencia solo admite ese canal. CoCo lleva ahí.' },
    'ProfileService.uploadAvatar': { ui: 'Subir una foto de perfil.' },
    'POST /api/profile/avatar': { ui: 'Subir una foto de perfil.' },
    'ProfileService.sendPasswordReset': { ui: 'Recuperar la clave: pasa por el correo, fuera de la sesión.' },
    'POST /api/profile/ensure-resident-unit': { system: 'La app asocia la unidad al cargar el perfil.' },
    'AuthProvidersService.joinCommunity': { ui: 'Elegir edificio al registrarse, antes de tener sesión con CoCo.' },
    'AuthProvidersService.settings': { read: 'Lee qué proveedores de inicio de sesión están activos.' },
    'NeighborModeService.summary': { read: 'Resumen del modo vecino para la pantalla de inicio.' },
    'PushService.registerDevice': { system: 'La app nativa registra el dispositivo para notificaciones.' },
    'POST /api/privacy/consents': { ui: 'Consentimientos de privacidad: se dan en pantalla, con el texto a la vista.' },
    'POST /api/privacy/requests': { ui: 'Solicitudes de datos personales (Ley 19.628): formulario con identidad verificada.' },

    // ── Comunidad (convivencia) ─────────────────────────────────────────────
    'CommunityCollaborationService.createTimeBankOffer': { tool: 'propose_initiative' },
    'CommunityCollaborationService.requestTimeBankOffer': { tool: 'join_initiative' },
    'CommunityCollaborationService.createCollectivePurchase': { tool: 'propose_initiative' },
    'CommunityCollaborationService.joinCollectivePurchase': { tool: 'join_initiative' },
    'CommunityCollaborationService.createCommunityProject': { tool: 'propose_initiative' },
    'CommunityCollaborationService.joinCommunityProject': { tool: 'join_initiative' },
    'CommunityCollaborationService.resolveParticipationRequest': { tool: 'resolve_participation' },
    'CommunityCollaborationService.createMediationCase': { tool: 'request_mediation' },
    'CommunityCollaborationService.updateMediationStatus': { tool: 'update_mediation_status' },
    'CommunityDealsService.setInterest': { tool: 'join_community_deal' },
    'CommunityDealsService.addQuote': { tool: 'add_community_deal_quote' },
    'CommunityDealsService.deleteQuote': { tool: 'delete_deal_quote' },
    'CommunityDealsService.update': { tool: 'update_community_deal' },
    'POST /api/solidarity/apply': { ui: 'Postular exige consentimiento expreso de datos sensibles (salud, desempleo) con el aviso a la vista; la evidencia solo admite el canal del centro de privacidad.' },
    'PATCH /api/solidarity/applications/[id]/status': { ui: 'Resolver obliga a leer datos sensibles del postulante; no deben pasar por el chat.' },
    'POST /api/solidarity/fund': { ui: 'Configurar el fondo solidario.' },
    'POST /api/solidarity/tasks': { ui: 'Tareas del fondo solidario: se toman y verifican en portería con PIN.' },

    'PUT /api/solidarity/tasks': { ui: 'Verificación de tareas con PIN en portería.' },
    'POST /api/assemblies': { ui: 'Asambleas (Ley 21.442): citación, quórum, poderes, asistencia y acta son un flujo legal con requisitos formales, en pantalla. CoCo orienta y redacta (prepare_legal_draft).' },
    'POST /api/assemblies/unit-rights': { ui: 'Derechos de voto por unidad: planilla de la asamblea.' },

    // ── Supermercado ────────────────────────────────────────────────────────
    'SupermarketCatalogService.saveList': { tool: 'save_shopping_list' },
    'DELETE /api/supermarket/lists': { tool: 'delete_shopping_list' },
    'PUT /api/supermarket/lists': { tool: 'save_shopping_list' },
    'SupermarketCatalogService.resolveList': { read: 'Interpreta una lista contra el catálogo.' },
    'SupermarketCatalogService.deleteList': { tool: 'delete_shopping_list' },
    'SupermarketGroupService.create': { tool: 'create_supermarket_group_order' },
    'SupermarketGroupService.join': { tool: 'join_supermarket_group_order' },
    'SupermarketGroupService.settle': { tool: 'lock_supermarket_group_order' },
    'SupermarketGroupService.recordPurchase': { tool: 'record_supermarket_group_purchase' },
    'POST /api/supermarket/group-orders': { tool: ['create_supermarket_group_order', 'join_supermarket_group_order', 'lock_supermarket_group_order', 'record_supermarket_group_purchase'] },
    'POST /api/supermarket': { read: 'Busca productos y precios.' },
    'POST /api/supermarket/alternatives': { read: 'Sugiere productos alternativos.' },
    'POST /api/supermarket/cart-plan': { read: 'Arma el plan de compra por tienda.' },
    'POST /api/supermarket/catalog/resolve': { read: 'Interpreta productos contra el catálogo.' },
    'POST /api/supermarket/real-total': { read: 'Calcula el total real del carro.' },
    'POST /api/supermarket/refresh': { system: 'Refresca precios del catálogo.' },
    'POST /api/supermarket/seals': { read: 'Consulta sellos nutricionales.' },
    'DELETE /api/supermarket/history': { system: 'Guarda el historial de búsquedas del comparador.' },

    'PATCH /api/supermarket/history': { system: 'Guarda el historial de búsquedas del comparador.' },

    'POST /api/supermarket/history': { system: 'Guarda el historial de búsquedas del comparador.' },
    'POST /api/supermarket/revision': { system: 'Registra la revisión de una lista en el comparador.' },
    'POST /api/supermarket/list-upload': { ui: 'Subir una foto o archivo de lista.' },
    'POST /api/supermarket/cart-handoff': { ui: 'Abre la compra en el sitio de la tienda, en el navegador del residente.' },

    // ── Proveedores (Red Convive) ───────────────────────────────────────────
    'ProviderNetworkService.create': { tool: 'register_external_provider' },
    'POST /api/providers': { tool: 'register_external_provider' },
    'ProviderNetworkService.createInvite': { tool: 'send_provider_portal_link' },
    'ProviderProfileService.createInvite': { tool: 'send_provider_portal_link' },
    'POST /api/providers/[id]/invite': { tool: 'send_provider_portal_link' },
    'ProviderProfileService.setVerified': { tool: 'review_provider_document' },
    'ProviderProfileService.update': { tool: 'update_provider_profile' },
    'PATCH /api/providers/[id]': { tool: 'update_provider_profile' },
    'ProviderMediaService.uploadPhoto': { tool: 'save_provider_attachment' },
    'CommunityCoverService.upload': { tool: 'set_community_cover_photo' },
    'POST /api/admin/community-cover': { tool: 'set_community_cover_photo' },
    'CommunityCoverService.reset': { ui: 'Volver a la foto genérica: un botón en la portada del inicio.' },
    'DELETE /api/admin/community-cover': { ui: 'Volver a la foto genérica: un botón en la portada del inicio.' },
    'ProviderMediaService.uploadDocument': { tool: 'save_provider_attachment' },
    'DELETE /api/providers/[id]/media': { tool: 'delete_provider_photo' },

    'POST /api/providers/[id]/media': { tool: 'save_provider_attachment' },
    'PATCH /api/providers/[id]/documents': { tool: 'review_provider_document' },

    'POST /api/providers/[id]/documents': { tool: 'save_provider_attachment' },
    'ProviderMediaService.deletePhoto': { tool: 'delete_provider_photo' },
    'ProviderPortalService.updateProfile': PORTAL,
    'ProviderPortalService.updateRequest': PORTAL,
    'PATCH /api/provider-portal/[token]': PORTAL,
    'POST /api/provider-portal/[token]/documents': PORTAL,
    'DELETE /api/provider-portal/[token]/media': PORTAL,

    'POST /api/provider-portal/[token]/media': PORTAL,
    'PATCH /api/provider-portal/[token]/requests/[requestId]': PORTAL,

    // ── Conserjería ─────────────────────────────────────────────────────────
    'POST /api/concierge/visit-notify': { tool: 'register_visitor' },
    'POST /api/concierge/incidents': { tool: 'register_incident' },
    'POST /api/intercom/calls': { ui: 'Citófono: llamada en vivo desde portería.' },
    'POST /api/intercom/calls/[id]': { ui: 'Citófono: contestar o cortar una llamada en vivo.' },
    'POST /api/admin/access-gate': { ui: 'Configuración del portón y sus dispositivos.' },
    'POST /api/whatsapp-notify': { tool: 'send_whatsapp_notification' },

    // ── Administración: comunicación y residentes ───────────────────────────
    'AnnouncementsService.createAnnouncement': { tool: ['create_circular', 'schedule_community_notice'] },
    'PATCH /api/admin/pending-residents': { tool: 'decide_pending_resident' },
    'POST /api/admin/users/assign-unit': { tool: 'assign_resident_unit' },
    'WaterService.createUnit': { tool: 'create_unit' },
    'WaterService.updateUnit': { tool: ['update_unit_data', 'set_unit_alicuota'] },
    'WaterService.assignResident': { tool: 'set_unit_owner' },
    'WaterService.saveReading': { tool: 'record_water_reading' },
    'POST /api/onboarding/batches': { tool: 'preview_resident_import' },
    'POST /api/onboarding/batches/[id]': { ui: 'Revisión de una carga masiva.' },
    'POST /api/onboarding/extract': { read: 'Interpreta una planilla subida.' },
    'POST /api/onboarding/upsert': { tool: 'apply_resident_import' },
    'POST /api/agent-center': { system: 'Es CoCo mismo en la vista de operaciones: lo que se pide ahí ya es conversacional.' },
    'POST /api/agent-center/tasks/[id]/resume': { tool: 'resume_agent_task' },
    'POST /api/agent-center/committee-digest': { ui: 'Revisar y aprobar el informe al comité es el control humano; generarlo conversando ya se hace con draft_committee_report.' },
    'POST /api/agent-center/scheduler': { system: 'Tarea programada del Agent Center.' },
    'POST /api/admin/coco-memory': { tool: 'remember_community_fact' },
    'POST /api/admin/coco-proposals': { ui: 'Aprobar o rechazar lo que CoCo propuso: es el control humano sobre el agente.' },
    'POST /api/admin/coco-activity': { ui: 'Bitácora de CoCo: revisión humana.' },
    'DELETE /api/admin/google': { ui: 'Conectar Google (OAuth) se autoriza en pantalla.' },
    'POST /api/admin/api-keys': { ui: 'Claves de integración: secretos, nunca por chat.' },
    'POST /api/admin/oversight-links': { ui: 'Enlaces de supervisión para el comité.' },
    'POST /api/operations/events': { system: 'Registro de auditoría de operaciones.' },
    'POST /api/admin-onboarding/register': { ui: 'Alta de una administración nueva, antes de tener cuenta.' },
    'POST /api/admin-onboarding/guide': { read: 'Guía de puesta en marcha.' },

    // ── Administración: finanzas ────────────────────────────────────────────
    'DELETE /api/admin/billing': { tool: 'cancel_issued_billing' },

    'POST /api/admin/billing': { tool: ['preview_billing', 'issue_billing'] },
    'POST /api/admin/billing-review': { ui: 'Revisión del comité antes de emitir: decisión con el detalle a la vista.' },
    'DELETE /api/admin/payments': { tool: 'delete_unit_payment' },

    'POST /api/admin/payments': { tool: 'record_payment' },
    'POST /api/admin/payments/import': { ui: 'Importar la cartola del banco (archivo).' },
    'DELETE /api/admin/bank-reconciliation': { ui: 'Conciliación bancaria: cuadrar movimiento por movimiento.' },

    'POST /api/admin/bank-reconciliation': { ui: 'Conciliación bancaria: cuadrar movimiento por movimiento.' },
    'POST /api/admin/bank-reconciliation/parse': { read: 'Interpreta una cartola subida.' },
    'DELETE /api/admin/community-expenses': { tool: 'delete_community_expense' },

    'POST /api/admin/community-expenses': { tool: 'add_community_expense' },
    'DELETE /api/admin/charges': { tool: 'cancel_unit_charge' },

    'POST /api/admin/charges': { tool: 'add_unit_charge' },
    'POST /api/admin/agreements': { tool: ['create_payment_agreement', 'cancel_payment_agreement', 'pay_agreement_installment'] },
    'POST /api/finance/agreement-review': { ui: 'Revisión de convenios por el comité.' },
    'POST /api/finance/committee-review': { ui: 'Revisión del comité de finanzas.' },
    'FinanceCommitteeService.request': { ui: 'La administración pide al comité revisar el cobro antes de emitir: es el control humano del cobro, con el detalle a la vista.' },
    'FinanceCommitteeService.endMembership': { ui: 'Terminar la designación de un integrante del comité de finanzas: gobierno del comité, en pantalla.' },
    'POST /api/admin/finance-committee': { ui: 'Integrar el comité de finanzas.' },
    'POST /api/admin/finance-report': { tool: ['get_monthly_finance_report', 'draft_committee_report'] },
    'POST /api/admin/finance-documents': { ui: 'Subir respaldos contables (archivos).' },
    'POST /api/admin/financial-statements': { ui: 'Estados financieros: cierre contable.' },
    'POST /api/admin/journal': { ui: 'Libro diario: asientos contables.' },
    'POST /api/admin/budget': { ui: 'Presupuesto anual: planilla.' },
    'POST /api/admin/payroll': { ui: 'Remuneraciones del personal: planilla y liquidaciones.' },
    'POST /api/admin/invoicing': { ui: 'Facturación electrónica: emisión con datos tributarios.' },
    'POST /api/parking/charges/process': { system: 'Procesa el cobro de una reserva de estacionamiento.' },
    'POST /api/parking/payouts/reconcile': { ui: 'Conciliar pagos a dueños de estacionamientos.' },
    'POST /api/iot/test-trigger': { system: 'Prueba de sensores IoT.' },

    // ── Correos del sistema ─────────────────────────────────────────────────
    'POST /api/email/booking-confirmation': SYSTEM_EMAIL,
    'POST /api/email/expense-alert': SYSTEM_EMAIL,
    'POST /api/email/new-community': SYSTEM_EMAIL,
    'POST /api/email/send-expenses': { tool: 'issue_billing' },
    'POST /api/email/welcome': SYSTEM_EMAIL,
    'POST /api/email/outreach': { tool: ['draft_outbound_email', 'send_gmail'] },

    // ── Detectados al tratar todo método como escritura salvo verbo de lectura ─
    'CommunityCollaborationService.reviewInitiative': { tool: 'review_initiative' },
    'CommunityDealsService.propose': { tool: 'propose_community_deal' },
    'FinanceCommitteeService.decideAgreement': { ui: 'El comité de finanzas decide un convenio con el detalle a la vista.' },
    'FinanceCommitteeService.appoint': { ui: 'Nombrar integrantes del comité de finanzas.' },
    'FinanceCommitteeService.decide': { ui: 'Decisión del comité de finanzas sobre una revisión.' },
    'MaintenanceService.advanceService': { tool: 'update_service_request_status' },
    'MaintenanceService.completeTask': { ui: 'Cerrar una tarea exige la foto del trabajo terminado; se hace en Mantenimiento.' },
    'NeighborBuildingsService.activate': { ui: 'Activar un edificio de vecinos como comunidad administrada (operación comercial).' },
    'PendingResidentsService.decide': { tool: 'decide_pending_resident' },
    'NeighborInviteService.myInvite': { tool: 'get_neighbor_invite_link' },
    'ParkingService.processCharge': { system: 'Procesa el cobro de una reserva recién creada.' },
    'ParkingService.adminPostChargeToUnit': { ui: 'La administración carga a mano un cobro de estacionamiento, con el detalle a la vista.' },
    'ParkingService.adminMarkChargeRefunded': { ui: 'Marcar un reembolso registra la salida de banco: revisión de la administración.' },
    'ParkingService.reviewSpot': { tool: 'review_listing' },
    'ParkingService.applyEarningsToExpenses': { ui: 'No implementado: la pantalla solo informa que el abono no está habilitado (falta el puente con billingService).' },
    'ParkingService.extendBooking': { tool: 'extend_parking_booking' },
    'ParkingService.reviewAccessRequest': { tool: 'review_parking_access' },
    'PasskeyService.register': { ui: 'Registrar huella o Face ID: credencial del propio dispositivo.' },
    'ProviderNetworkService.act': SUPERADMIN,
    'ProviderMediaService.reviewDocument': { tool: 'review_provider_document' },
    'PushService.unregisterDevice': { system: 'La app nativa da de baja el dispositivo de notificaciones.' },
    'StorageService.reviewUnit': { tool: 'review_listing' },
    'SupermarketCartService.prepareHandoff': { ui: 'Prepara la compra para abrirla en el sitio de la tienda.' },
    'SupermarketCatalogService.extractList': { read: 'Interpreta una foto o archivo de lista.' },
    'SupermarketGroupService.lock': { tool: 'lock_supermarket_group_order' },
    'SupermarketGroupService.review': { tool: 'review_group_order' },

    // ── Comercial, marketing, capacitación, superadmin ──────────────────────
    'CommercialService.submitLead': { ui: 'Formulario comercial de la landing, sin sesión.' },
    'POST /api/marketing/reels': { ui: 'Marketing de la plataforma.' },
    'POST /api/marketing/reels/upload': { ui: 'Marketing de la plataforma.' },
    'PATCH /api/training/assignments': TRAINING,

    'POST /api/training/assignments': TRAINING,
    'POST /api/training/attempts': TRAINING,
    'POST /api/training/generate-slides': TRAINING,
    'DELETE /api/training/modules': TRAINING,

    'PATCH /api/training/modules': TRAINING,

    'POST /api/training/modules': TRAINING,
    'POST /api/training/multi-agent': TRAINING,
    'POST /api/training/parse': TRAINING,
    'POST /api/training/progress': TRAINING,
    'POST /api/training/retention': TRAINING,
    'POST /api/superadmin/buildings': SUPERADMIN,
    'PATCH /api/superadmin/communities': SUPERADMIN,
    'POST /api/superadmin/providers': SUPERADMIN,
    'PATCH /api/superadmin/providers/[id]': SUPERADMIN,
    'PATCH /api/superadmin/providers/[id]/documents': SUPERADMIN,
    'POST /api/superadmin/providers/[id]/invite': SUPERADMIN,
};

export function coverageSummary(entries: Record<string, AgentCoverage> = AGENT_COVERAGE) {
    const count = { tool: 0, gap: 0, ui: 0, read: 0, system: 0 };
    for (const entry of Object.values(entries)) count[Object.keys(entry)[0] as keyof typeof count] += 1;
    // Lo que una persona podría pedir: lo que CoCo hace más lo que le falta.
    const askable = count.tool + count.gap;
    return { ...count, askable, percent: askable ? Math.round((count.tool / askable) * 100) : 100 };
}
