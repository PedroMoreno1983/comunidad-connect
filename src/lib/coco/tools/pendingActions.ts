/** Título y resumen de la confirmación de cada herramienta que escribe. Movido desde tools.ts (21-11-2026). */
import { describeAlicuotaInput } from '../alicuotaInput';
import { reminderConfirmationFromInput } from '@/lib/agent-center/cocoReminders';
import { isUuid } from './shared';

/** Título + resumen legible de una acción pendiente, para la pantalla de confirmación. */
export function describePendingAction(name: string, input: Record<string, unknown>): { title: string; summary: string } {
    const str = (key: string) => typeof input[key] === 'string' ? (input[key] as string) : '';
    const unit = (key: string) => {
        const value = str(key);
        return isUuid(value) ? 'tu unidad' : value;
    };

    switch (name) {
        case 'create_claim':
            return { title: 'Registrar reclamo', summary: str('description') || 'Nuevo reclamo o solicitud de mantención.' };
        case 'create_reservation':
            return { title: 'Reservar espacio común', summary: `${str('space_name') || 'Espacio'} el ${str('date')} de ${str('start_time')} a ${str('end_time')}.` };
        case 'book_parking': {
            // Fechas en ISO: mostrarlas crudas en la confirmación no le dice
            // nada al residente, que es justo quien tiene que decidir.
            const legible = (key: string) => {
                const fecha = new Date(str(key));
                return Number.isFinite(fecha.getTime())
                    ? fecha.toLocaleString('es-CL', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
                    : str(key);
            };
            return {
                title: 'Reservar estacionamiento',
                summary: `Desde el ${legible('starts_at')} hasta el ${legible('ends_at')}. El monto se calcula con la tarifa del cupo y se carga a la cuenta de gastos comunes de tu unidad (o se paga en línea si la comunidad lo habilitó).`,
            };
        }
        case 'propose_community_deal':
            return { title: 'Proponer convenio', summary: `${str('title')}. ${str('description')}`.trim() };
        case 'join_community_deal':
            return {
                title: input.interested === false ? 'Salir de un convenio' : 'Sumarme a un convenio',
                summary: input.interested === false ? 'Dejar de figurar como interesado.' : 'Quedar como interesado; no compromete pago.',
            };
        case 'add_community_deal_quote':
            return { title: 'Registrar cotización', summary: `${str('provider_name')}${input.price ? ` · ${input.price}` : ''}. ${str('offer')}`.trim() };
        case 'publish_marketplace_item':
            return {
                title: 'Publicar en el Marketplace',
                summary: `${str('title')} · ${Number(input.price) ? `${Number(input.price).toLocaleString('es-CL')}` : 'permuta'}${str('description') ? `. ${str('description')}` : ''}`,
            };
        case 'request_service':
            return {
                title: 'Pedir servicio',
                summary: `${str('description')} · ${str('preferred_date')} a las ${str('preferred_time')}. El proveedor confirma el horario.`,
            };
        case 'rent_storage': {
            const meses = Number(input.months) || 0;
            return {
                title: 'Arrendar bodega',
                summary: `Desde el ${str('starts_on')} por ${meses} ${meses === 1 ? 'mes' : 'meses'}. Cada mes se carga el arriendo a la cuenta de gastos comunes de tu unidad.`,
            };
        }
        case 'cancel_reservation':
            return {
                title: 'Cancelar reserva',
                summary: `${str('space_name') || 'Espacio común'} el ${str('date')}${str('start_time') ? ` a las ${str('start_time')}` : ''}. El horario queda libre para otros vecinos.`,
            };
        case 'cancel_parking_booking':
            return {
                title: 'Cancelar reserva de estacionamiento',
                summary: 'Sin costo si faltan más horas que el plazo de la comunidad (2 h por defecto); si no, el cobro se mantiene.',
            };
        case 'cancel_storage_rental':
            return {
                title: 'Terminar arriendo de bodega',
                summary: 'Se anulan los cobros de los meses que aún no empiezan. El mes en curso y lo ya pagado se mantienen.',
            };
        case 'publish_my_parking_spot': {
            const precios = [['hourly_rate', 'hora'], ['daily_rate', 'día'], ['monthly_rate', 'mes']]
                .filter(([key]) => Number(input[key]) > 0)
                .map(([key, unidad]) => `$${Number(input[key]).toLocaleString('es-CL')} por ${unidad}`);
            return {
                title: 'Publicar mi estacionamiento',
                summary: `"${str('label')}"${precios.length ? ` · ${precios.join(', ')}` : ''}. Queda pendiente hasta que la administración lo apruebe.`,
            };
        }
        case 'message_marketplace_seller':
            return { title: 'Escribirle al vendedor', summary: `Sobre "${str('item_title') || 'el artículo'}": ${str('message')}` };
        case 'reply_marketplace_conversation':
            return { title: 'Responder en el Marketplace', summary: str('message') };
        case 'update_my_name':
            return { title: 'Cambiar mi nombre', summary: `Aparecerás como ${str('full_name')}.` };
        case 'delete_shopping_list':
            return { title: 'Borrar lista del súper', summary: str('title') || 'La lista elegida.' };
        case 'register_my_vehicle':
            return { title: 'Registrar mi vehículo', summary: `Patente ${str('plate').toUpperCase()}${str('vehicle_description') ? ` · ${str('vehicle_description')}` : ''}, contacto ${str('phone')}.` };
        case 'request_payment_agreement':
            return { title: 'Pedir un convenio de pago', summary: 'La administración recibe tu solicitud para conversar un convenio. No se crea ningún compromiso todavía.' };
        case 'extend_parking_booking': {
            const minutos = Number(input.additional_minutes) || 0;
            const tramo = minutos % 60 === 0 ? `${minutos / 60} ${minutos === 60 ? 'hora' : 'horas'}` : `${minutos} minutos`;
            return { title: 'Extender reserva de estacionamiento', summary: `${tramo} más. Si cuesta más, se suma al cobro de la reserva.` };
        }
        case 'rate_parking_booking': {
            const estrellas = Number(input.rating) || 0;
            return { title: 'Calificar estacionamiento', summary: `${'★'.repeat(Math.max(0, Math.min(5, estrellas)))} (${estrellas}/5)${str('comment') ? `: "${str('comment')}"` : ''}.` };
        }
        case 'set_my_spot_availability': {
            const dias = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
            const ventanas = (Array.isArray(input.windows) ? input.windows as Record<string, unknown>[] : [])
                .map(w => `${dias[Number(w.weekday)] ?? '?'} ${w.start_time}–${w.end_time}`).join(', ');
            return { title: 'Horarios de mi estacionamiento', summary: `${str('listing_name') || 'Tu estacionamiento'}: ${ventanas || 'sin horarios (no recibe reservas)'}. Reemplaza los anteriores.` };
        }
        case 'review_parking_access':
            return input.approve === false
                ? { title: 'Rechazar conductor externo', summary: `${str('driver_name') || 'El conductor'}. Se cancelan sus reservas futuras.` }
                : { title: 'Aprobar conductor externo', summary: `${str('driver_name') || 'El conductor'} podrá reservar estacionamientos de la comunidad.` };
        case 'update_my_listing': {
            const cambios = [['hourly_rate', 'por hora'], ['daily_rate', 'por día'], ['monthly_rate', 'por mes']]
                .filter(([key]) => input[key] !== undefined && input[key] !== '')
                .map(([key, unidad]) => `${Number(input[key]).toLocaleString('es-CL')} ${unidad}`);
            if (str('description')) cambios.push('nueva descripción');
            return { title: 'Editar mi publicación', summary: `${str('listing_name') || 'Tu publicación'}: ${cambios.join(', ') || 'sin cambios'}.` };
        }
        case 'set_my_listing_status': {
            const accion: Record<string, string> = { pause: 'Pausar', resume: 'Retomar', resubmit: 'Reenviar a revisión' };
            return { title: `${accion[str('action')] || 'Cambiar estado'}: ${str('listing_name') || 'mi publicación'}`, summary: str('action') === 'pause' ? 'Deja de recibir reservas nuevas; las confirmadas siguen.' : 'Vuelve a estar disponible para los vecinos.' };
        }
        case 'remove_my_listing':
            return { title: 'Retirar mi publicación', summary: `${str('listing_name') || 'La publicación'} se borra. Solo si nunca tuvo reservas ni arriendos.` };
        case 'publish_my_storage_unit':
            return {
                title: 'Publicar mi bodega',
                summary: `"${str('label')}" · $${(Number(input.monthly_rate) || 0).toLocaleString('es-CL')} al mes. Queda pendiente hasta que la administración la apruebe.`,
            };
        case 'update_marketplace_item': {
            const estados: Record<string, string> = {
                sold: 'Marcar como vendido', reserved: 'Marcar como reservado',
                available: 'Volver a ofrecer', hidden: 'Retirar la publicación',
            };
            return { title: estados[str('status')] || 'Actualizar publicación', summary: str('title') || 'Tu publicación del Marketplace.' };
        }
        case 'report_transfer': {
            const monto = Number(input.amount);
            return {
                title: 'Informar transferencia a la administración',
                summary: `${Number.isFinite(monto) ? `$${monto.toLocaleString('es-CL')}` : 'Transferencia'} del ${str('paid_at')}, comprobante ${str('reference')}, para el gasto común ${str('month')}. Tu saldo cambia cuando la administración lo verifique.`,
            };
        }
        case 'create_circular':
            return { title: 'Publicar circular', summary: str('title') || 'Aviso oficial para la comunidad.' };
        case 'create_social_post':
            return { title: 'Publicar en el muro social', summary: str('content') || 'Nueva publicación.' };
        case 'vote_in_poll':
            return { title: 'Emitir voto', summary: 'Registrar tu voto en la votación activa.' };
        case 'register_visitor':
            return { title: 'Registrar visita', summary: `${str('visitor_name') || 'Visitante'} → unidad ${unit('host_unit_id')}.` };
        case 'register_package':
            return { title: 'Registrar encomienda', summary: `Paquete de ${str('courier') || 'courier'} para la unidad ${unit('unit_id')}.` };
        case 'send_whatsapp_notification':
            return { title: 'Enviar WhatsApp', summary: str('message') || 'Notificación a un residente.' };
        case 'create_poll':
            return { title: 'Crear votación', summary: str('title') || 'Nueva votación para la comunidad.' };
        case 'update_unit_data':
            return { title: 'Modificar unidad', summary: `Actualizar datos de la unidad ${unit('unit_id')}.` };
        case 'decide_pending_resident':
            return input.approve === false
                ? { title: 'Quitar vecino', summary: `${str('resident_name') || 'El vecino'} no vive en el edificio: pierde el acceso a la comunidad y su departamento queda libre.` }
                : { title: 'Validar vecino', summary: `${str('resident_name') || 'El vecino'} vive en el edificio: queda con acceso completo y ligado a su departamento.` };
        case 'delete_marketplace_item':
            return { title: 'Borrar publicación', summary: `${str('title') || 'La publicación elegida'} se borra definitivamente del Marketplace.` };
        case 'update_community_deal':
            return { title: 'Actualizar convenio', summary: `${str('deal_title') || 'El convenio'}${str('status') ? ` → ${str('status')}` : ''}${input.deal_price ? ` · ${Number(input.deal_price).toLocaleString('es-CL')}` : ''}.` };
        case 'delete_deal_quote':
            return { title: 'Borrar cotización', summary: str('quote_label') || 'La cotización elegida.' };
        case 'update_provider_profile':
            return { title: 'Editar perfil de maestro', summary: `Cambia: ${Object.keys((typeof input.fields === 'object' && input.fields) || {}).join(', ') || 'nada'}.` };
        case 'delete_provider_photo':
            return { title: 'Borrar foto del perfil', summary: 'La foto deja de verse en el perfil del maestro.' };
        case 'preview_resident_import':
            return { title: 'Revisar nómina de residentes', summary: 'Leo el archivo adjunto y dejo los residentes en revisión, sin crear cuentas todavía.' };
        case 'apply_resident_import':
            return { title: 'Cargar residentes', summary: `${str('summary') || 'Los residentes del lote revisado'}. Se unen a sus unidades y quienes tienen correo reciben su acceso.` };
        case 'save_community_document':
            return { title: 'Publicar documento para la comunidad', summary: `${str('title') || 'El documento'} (${str('kind') || 'otro'}). Todos los vecinos podrán consultarlo con CoCo.` };
        case 'create_amenity':
            return { title: 'Crear espacio común', summary: `${str('name')} · ${input.max_capacity ?? 12} personas · ${Number(input.hourly_rate) ? `${Number(input.hourly_rate).toLocaleString('es-CL')} por hora` : 'sin costo'}.` };
        case 'set_unit_owner':
            return { title: 'Dueño de la unidad', summary: input.clear === true ? `El ${str('unit_number')} queda sin dueño.` : `${str('resident_name') || 'El residente'} → dueño del ${str('unit_number')}.` };
        case 'create_payment_agreement':
            return { title: 'Crear convenio de pago', summary: `Depto ${str('unit_number')}: ${(Number(input.total_amount) || 0).toLocaleString('es-CL')} en ${input.installment_count} cuotas; la primera vence hoy.` };
        case 'cancel_payment_agreement':
            return { title: 'Anular convenio', summary: `${str('agreement_label') || 'El convenio elegido'}. Las cuotas pendientes dejan de cobrarse.` };
        case 'pay_agreement_installment':
            return { title: 'Registrar pago de cuota', summary: `Pagada el ${str('paid_at')}${str('reference') ? `, ref. ${str('reference')}` : ''}.` };
        case 'update_mediation_status': {
            const estados: Record<string, string> = { sent: 'Marcar como enviada', agreement: 'Marcar acuerdo', escalated: 'Escalar a la administración' };
            return { title: estados[str('status')] || 'Actualizar mediación', summary: 'Tu mediación con el vecino.' };
        }
        case 'add_unit_charge':
            return { title: input.kind === 'committee' ? 'Descuento a la unidad' : 'Cargo a la unidad', summary: `Depto ${str('unit_number')}: ${str('label')} · ${(Number(input.amount) || 0).toLocaleString('es-CL')} (${str('month')}).` };
        case 'cancel_unit_charge':
            return { title: 'Anular cargo', summary: `${str('charge_label') || 'El cargo elegido'} deja de sumar a la deuda.` };
        case 'delete_unit_payment':
            return { title: 'Anular pago', summary: `${str('payment_detail') || 'El pago elegido'}. La deuda de la unidad se recalcula.` };
        case 'delete_community_expense':
            return { title: 'Borrar gasto del mes', summary: str('expense_label') || 'El gasto elegido.' };
        case 'propose_initiative': {
            const tipos: Record<string, string> = { time_bank: 'banco de tiempo', collective_purchase: 'compra colectiva', community_project: 'proyecto comunitario' };
            return { title: `Proponer ${tipos[str('type')] || 'iniciativa'}`, summary: `${str('title')}. Queda pendiente hasta que la administración la valide.` };
        }
        case 'join_initiative':
            return { title: 'Pedir sumarme', summary: `${str('initiative_title') || 'La iniciativa'}${str('message') ? `: "${str('message')}"` : ''}. El coordinador decide.` };
        case 'resolve_participation':
            return { title: input.accept === false ? 'Rechazar solicitud' : 'Aceptar solicitud', summary: 'El vecino recibe el aviso.' };
        case 'review_initiative': {
            const decisiones: Record<string, string> = { approved: 'Aprobar', changes_requested: 'Pedir cambios a', rejected: 'Rechazar' };
            return { title: `${decisiones[str('decision')] || 'Revisar'} iniciativa`, summary: `${str('initiative_title') || 'La iniciativa'}${str('note') ? `: ${str('note')}` : ''}.` };
        }
        case 'request_mediation':
            return { title: 'Preparar mediación', summary: `Con el depto ${str('target_unit')}: "${str('request')}". Revisas el mensaje antes de enviarlo.` };
        case 'update_service_request_status': {
            const estados: Record<string, string> = { accepted: 'Aceptar', awaiting_confirmation: 'Marcar como realizada', completed: 'Confirmar terminada', cancelled: 'Cancelar', pending: 'Reprogramar' };
            const fecha = str('preferred_date') ? ` · nueva fecha ${str('preferred_date')} ${str('preferred_time')}` : '';
            return { title: `${estados[str('status')] || 'Actualizar'} solicitud de servicio`, summary: `${str('request_description') || 'La solicitud elegida'}${fecha}.` };
        }
        case 'register_incident':
            return { title: `Registrar incidencia${str('urgency') ? ` (${str('urgency')})` : ''}`, summary: `${str('title')}. Se avisa a la administración.` };
        case 'record_water_reading':
            return { title: 'Registrar lectura de agua', summary: `Depto ${str('unit_number')}: ${input.reading_value} m³${str('month') ? ` (${str('month')})` : ''}.` };
        case 'update_case_status': {
            const estados: Record<string, string> = { open: 'abierto', in_progress: 'en revisión', resolved: 'resuelto', closed: 'cerrado', cancelled: 'cancelado' };
            return { title: 'Cambiar estado del caso', summary: `${str('case_title') || 'El caso'} → ${estados[str('status')] || str('status')}. El residente recibe el aviso.` };
        }
        case 'review_listing':
            return input.approve === false
                ? { title: 'Rechazar publicación', summary: `${str('listing_name') || 'La publicación'}: ${str('reason')}` }
                : { title: 'Aprobar publicación', summary: `${str('listing_name') || 'La publicación'} aparecerá para los vecinos.` };
        case 'review_group_order':
            return { title: input.approve === false ? 'Rechazar compra comunitaria' : 'Aprobar compra comunitaria', summary: str('order_title') || 'La compra propuesta por un vecino.' };
        case 'assign_resident_unit':
            return { title: 'Asignar departamento', summary: `${str('resident_name') || 'Residente'} → departamento ${str('unit_number')}.` };
        case 'create_unit':
            return { title: 'Crear unidad', summary: `Depto ${str('number')}${str('tower') ? `, torre ${str('tower')}` : ''}${describeAlicuotaInput('create_unit', input) ? `, alícuota ${describeAlicuotaInput('create_unit', input)}` : ''}.` };
        case 'set_unit_alicuota':
            return { title: 'Fijar alícuota', summary: `Unidad ${unit('unit_id')} → ${describeAlicuotaInput('set_unit_alicuota', input) || 'alícuota no válida'}. Sin fuente queda provisoria.` };
        case 'distribute_alicuotas_equally':
            return { title: 'Repartir alícuotas', summary: 'Dividir el 100 % en partes iguales entre todas las unidades. Sin fuente queda provisorio.' };
        case 'add_community_expense':
            return { title: 'Cargar egreso', summary: `${str('label') || 'Egreso'} · ${str('amount')} · ${str('month')}.${str('attachment_id') ? ' La foto queda como respaldo.' : ''}` };
        case 'record_payment':
            return { title: 'Registrar pago recibido', summary: `Unidad ${unit('unit_id')} · $${str('amount')} · ${str('paid_at')} · ${str('method')} · referencia ${str('reference')}. Confirma solo si verificaste el pago fuera de CoCo; esto actualiza el saldo de la unidad.` };
        case 'issue_billing':
            return { title: 'Emitir gasto común', summary: `Emitir ${str('month')} (vence ${str('due_date')}): crea el cobro real a las unidades. Revisa el reparto antes de aprobar.` };
        case 'cancel_issued_billing':
            return { title: 'Anular emisión de gasto común', summary: 'Anula los cobros de esa emisión si nadie ha pagado todavía.' };
        case 'schedule_community_notice':
            return { title: 'Programar aviso a la comunidad', summary: `${str('text')} · ${str('when') || 'fecha'} ${str('time') || '09:00'}. Sale en la revisión diaria.` };
        case 'decide_booking':
            return {
                title: str('decision') === 'approve' ? 'Aprobar reserva' : 'Anular reserva',
                summary: str('decision') === 'approve' ? 'La reserva pendiente queda confirmada.' : 'La reserva queda anulada.',
            };
        case 'draft_outbound_email':
            return {
                title: 'Enviar un correo',
                summary: `Borrador para ${str('to')}: ${str('subject')}. Al confirmar se envía un solo correo. No es un aviso masivo.`,
            };
        case 'request_urgent_access_approval':
            return { title: 'Pedir acceso de emergencia', summary: str('reason') || 'Solicitud de apertura remota urgente.' };
        case 'dispatch_provider':
            return { title: 'Proponer proveedor de emergencia', summary: str('details') || 'Identificar un proveedor y notificar al equipo para que confirme el despacho.' };
        case 'register_external_provider':
            return { title: 'Registrar maestro externo', summary: `${str('name')} · ${str('category') || 'general'} · ${str('contact_phone')}. Queda sin verificar en la red de la comunidad.` };
        case 'send_provider_portal_link':
            return { title: 'Generar enlace para el maestro', summary: `Enlace personal de ${str('provider_name') || 'el maestro'} para editar su perfil y responder solicitudes. Vence en 90 días y el enlace anterior deja de funcionar.` };
        case 'rate_provider':
            return { title: 'Publicar reseña', summary: `${str('provider_name')}: ${str('rating')}/5. "${str('comment')}"` };
        case 'review_provider_document': {
            const kind = str('document_kind') === 'identity' ? 'Cédula de identidad' : str('document_kind') === 'background_certificate' ? 'Certificado de antecedentes' : 'Documento';
            const document = `${kind} de ${str('provider_name')}, subido el ${str('uploaded_at') || 'fecha no indicada'}`;
            return {
                title: str('decision') === 'approve' ? 'Aprobar documento del maestro' : 'Rechazar documento del maestro',
                summary: str('decision') === 'approve'
                    ? `${document}: su perfil lo mostrará como revisado.`
                    : `${document}. Motivo: ${str('note') || 'sin motivo'}`,
            };
        }
        case 'save_provider_attachment': {
            const label: Record<string, string> = { profile_photo: 'foto de perfil', work_photo: 'foto de trabajo', background_certificate: 'certificado de antecedentes', identity: 'cédula de identidad' };
            // La descripción de una foto de trabajo se publica: se muestra antes de aprobar.
            const caption = str('kind') === 'work_photo' && str('caption') ? ` Descripción pública: "${str('caption')}".` : '';
            return { title: 'Guardar imagen en el perfil del maestro', summary: `La imagen adjunta como ${label[str('kind')] || 'imagen'} de ${str('provider_name')}.${caption}` };
        }
        case 'set_community_cover_photo':
            return { title: 'Cambiar la portada del condominio', summary: 'La imagen adjunta pasa a ser la foto de portada que ven la administración y todos los residentes en su inicio.' };
        case 'create_supermarket_group_order':
            return { title: 'Crear compra grupal', summary: `${str('title')}. Lista: ${str('shopping_list')}.` };
        case 'save_shopping_list':
            return { title: 'Guardar lista de compras', summary: str('body') || 'Guardar una lista personal en Convive.' };
        case 'join_supermarket_group_order':
            return { title: 'Sumarme a la compra grupal', summary: str('shopping_list') || 'Agregar mis productos y cantidades.' };
        case 'lock_supermarket_group_order':
            return {
                title: 'Cerrar compra grupal',
                summary: str('store')
                    ? `Cerrar nuevos aportes y comprar en ${str('store')}.`
                    : 'Cerrar nuevos aportes con la canasta completa mas barata.',
            };
        case 'record_supermarket_group_purchase':
            return {
                title: 'Registrar total de la compra grupal',
                summary: `Total pagado: ${Number(input.final_total || 0).toLocaleString('es-CL')}. El reparto entre vecinos se ajusta a ese monto.`,
            };
        case 'remember_community_fact':
            return {
                title: input.action === 'forget' ? 'Olvidar un dato de la comunidad' : 'Recordar un dato de la comunidad',
                summary: `${str('category') || 'general'}: ${str('fact')}`,
            };
        case 'create_reminder':
            return reminderConfirmationFromInput(input);
        case 'cancel_reminder':
            return { title: 'Cancelar recordatorio', summary: 'No se enviará el aviso pendiente.' };
        case 'resume_agent_task':
            return { title: 'Retomar tarea de CoCo', summary: 'Continúa la tarea guardada. Si hay una escritura pendiente, sigue esperando tu aprobación.' };
        case 'delegate_background_task':
            return { title: 'Dejar una tarea en segundo plano', summary: `${str('goal') || 'Revisión'}. Te aviso cuando termine. No cambia datos.` };
        case 'draft_committee_report':
            return { title: 'Preparar informe del comité', summary: 'Un HTML y un PDF con totales de asambleas y reservas. Sin nombres ni montos.' };
        case 'create_routine':
            return { title: 'Crear rutina', summary: `${str('request')}. Corre en hora de Chile y te avisa en la app.` };
        case 'pause_routine':
            return { title: 'Pausar rutina', summary: 'Deja de correr hasta que la actives de nuevo.' };
        case 'delete_routine':
            return { title: 'Borrar rutina', summary: 'No vuelve a correr. El registro queda.' };
        case 'coordinate_specialists':
            return { title: 'Coordinar Cocos especializados', summary: `${str('request') || 'Pedido'}. Se audita el traspaso y no se cambia ningún dato.` };
        case 'send_gmail':
            return { title: 'Enviar correo de Gmail', summary: `De tu Gmail a ${str('to')}: ${str('subject')}. Sale solo si confirmas.` };
        case 'create_calendar_event':
            return { title: 'Crear evento en Google Calendar', summary: `${str('title')} desde ${str('start')} hasta ${str('end')}.` };
        default:
            return { title: name, summary: 'Acción propuesta por CoCo.' };
    }
}
