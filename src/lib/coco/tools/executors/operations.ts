import 'server-only';

/**
 * Ejecutores de herramientas de CoCo: operations. Movidos tal cual desde el switch
 * de executeTool (21-11-2026). Devuelven NOT_HANDLED si la herramienta no es de este dominio.
 */
import { listOpenCases, updateCaseStatusForStaff } from '../../adminReviewTools';
import { maybeCreateCoCoCase } from '../../caseService';
import { assignResidentUnitForAdmin, decidePendingResidentForAdmin, listPendingResidentsForAdmin } from '../../residentAdminTools';
import { deleteMyShoppingList, registerMyVehicle, updateMyName } from '../../residentDailyTools';
import { applyResidentImport, previewResidentImport } from '../../residentImportTools';
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { NOT_HANDLED, UserContext, forbidden, isAdmin, isStaff, scopedCommunity, scopedUnit } from '../shared';

export async function executeOperationsTool(name: string, input: Record<string, string>, userCtx: UserContext): Promise<unknown> {
        switch (name) {
            // ── RESIDENTE / FINANZAS ─────────────────────────────────────────
            case 'get_resident_info': {
                const unitId = await scopedUnit(userCtx, input.unit_id);
                if (!unitId) return forbidden('No pude determinar tu unidad.');
                const { data: unit, error: unitError } = await supabaseAdmin
                    .from('units')
                    .select('id,number,unit_number,tower,owner_id,community_id')
                    .eq('id', unitId)
                    .maybeSingle();
                if (unitError) return { error: 'No se pudo consultar la unidad.' };
                if (!unit) return { error: 'Unidad no encontrada' };
                const residentId = !isStaff(userCtx) ? userCtx.user_id : unit.owner_id;
                const { data: resident } = residentId
                    ? await supabaseAdmin.from('profiles').select('name,email,phone_number').eq('id', residentId).eq('community_id', unit.community_id).maybeSingle()
                    : { data: null };
                return { ...unit, resident };
            }

            case 'get_water_consumption': {
                const unitId = await scopedUnit(userCtx, input.unit_id);
                if (!unitId) return forbidden('No pude determinar tu unidad.');
                const month = input.month || new Date().toISOString().slice(0, 7);
                if (!/^\d{4}-\d{2}$/.test(month)) return { error: 'El periodo debe usar el formato YYYY-MM.' };
                const [year, monthNumber] = month.split('-').map(Number);
                const monthName = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][monthNumber - 1];
                if (!monthName) return { error: 'El periodo indicado no es valido.' };
                const { data, error } = await supabaseAdmin
                    .from('water_readings')
                    .select('reading_value,reading_date,month,year')
                    .eq('unit_id', unitId)
                    .eq('community_id', userCtx.community_id)
                    .eq('year', year)
                    .eq('month', monthName)
                    .order('reading_date', { ascending: false })
                    .limit(3);
                if (error) return { error: 'No se pudo consultar el consumo de agua.' };
                return data ?? { error: 'Sin datos de consumo para ese período' };
            }

            // ── RECLAMOS ────────────────────────────────────────────────────
            case 'create_claim': {
                const unitId = await scopedUnit(userCtx, input.unit_id);
                if (!unitId) return forbidden('No pude determinar la unidad asociada al reclamo.');
                const communityId = scopedCommunity(userCtx);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                const result = await maybeCreateCoCoCase(
                    input.description,
                    {
                        unitId,
                        communityId,
                        role: userCtx.role || 'resident',
                        channel: 'coco_tool',
                    },
                    'Reclamo registrado desde herramienta CoCo.',
                    { forceCreate: true },
                );

                if (!result.created) {
                    return {
                        error: 'No se pudo registrar el reclamo',
                        detail: result.error || result.reason || 'El router de casos no generó un registro.',
                    };
                }

                return { success: true, claim_id: result.id, message: 'Reclamo registrado correctamente.' };
            }

            case 'get_claim_status': {
                const communityId = scopedCommunity(userCtx);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                const query = supabaseAdmin
                    .from('coco_cases')
                    .select('id, category, description, status, urgency, created_at, updated_at')
                    .eq('id', input.claim_id)
                    .eq('community_id', communityId);
                if (!isStaff(userCtx)) {
                    const residentUnitId = await scopedUnit(userCtx);
                    if (!residentUnitId) return forbidden('No pude determinar tu unidad.');
                    query.eq('unit_id', residentUnitId);
                }
                const { data, error } = await query.maybeSingle();
                if (error) return { error: 'No se pudo consultar el reclamo.' };
                return data ?? { error: 'Reclamo no encontrado' };
            }

            case 'list_my_claims': {
                const unitId = await scopedUnit(userCtx, input.unit_id);
                if (!unitId) return forbidden('No pude determinar la unidad.');
                const query = supabaseAdmin
                    .from('coco_cases')
                    .select('id, category, description, status, urgency, created_at')
                    .eq('unit_id', unitId)
                    .neq('status', 'closed')
                    .order('created_at', { ascending: false })
                    .limit(10);
                if (userCtx.community_id) query.eq('community_id', userCtx.community_id);
                const { data, error } = await query;
                if (error) return { error: 'No se pudieron consultar los reclamos.' };
                return data ?? [];
            }

            case 'update_my_name':
            case 'delete_shopping_list':
            case 'register_my_vehicle': {
                if (!userCtx.user_id) return forbidden('No pude identificarte.');
                const run = { update_my_name: updateMyName, delete_shopping_list: deleteMyShoppingList, register_my_vehicle: registerMyVehicle }[name];
                return run(supabaseAdmin, userCtx.user_id, input as Record<string, unknown>);
            }

            // ── CONSERJERÍA ──────────────────────────────────────────────────
            case 'register_visitor': {
                const communityId = scopedCommunity(userCtx, input.community_id);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                const unitId = await scopedUnit(userCtx, input.host_unit_id);
                if (!unitId) return forbidden('La unidad de destino no existe en tu comunidad o no tienes permiso para usarla.');
                if (!userCtx.user_id) return forbidden('No pude identificar a quien registra la visita.');
                const { data, error } = await supabaseAdmin
                    .from('visitor_logs')
                    .insert({
                        community_id: communityId,
                        visitor_name: input.visitor_name,
                        unit_id: unitId,
                        purpose: input.expected_at
                            ? `Visita esperada a las ${input.expected_at}`
                            : 'Visita registrada desde CoCo',
                        registered_by: userCtx.user_id,
                    })
                    .select('id')
                    .single();
                if (error) return { error: 'No se pudo registrar la visita.' };
                return { success: true, visitor_id: data.id, message: `Visita de ${input.visitor_name} registrada.` };
            }

            case 'register_package': {
                if (!isStaff(userCtx)) return forbidden('Solo conserjería o administración pueden registrar encomiendas.');
                const communityId = scopedCommunity(userCtx, input.community_id);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                const unitId = await scopedUnit(userCtx, input.unit_id);
                if (!unitId) return forbidden('La unidad destinataria no existe en tu comunidad.');
                const packageDescription = [input.courier, input.description].filter(Boolean).join(' - ') || 'Encomienda sin descripcion';
                const { data, error } = await supabaseAdmin
                    .from('packages')
                    .insert({
                        community_id: communityId,
                        recipient_unit_id: unitId,
                        description: packageDescription,
                        status: 'pending',
                    })
                    .select('id')
                    .single();
                if (error) return { error: 'No se pudo registrar el paquete.' };
                return { success: true, package_id: data.id, message: 'Encomienda registrada. Se notificará al residente.' };
            }

            case 'get_pending_packages': {
                const unitId = await scopedUnit(userCtx, input.unit_id);
                if (!unitId) return forbidden('No pude determinar la unidad.');
                const communityId = scopedCommunity(userCtx);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                const { data, error } = await supabaseAdmin
                    .from('packages')
                    .select('id,description,received_at')
                    .eq('community_id', communityId)
                    .eq('recipient_unit_id', unitId)
                    .eq('status', 'pending')
                    .order('received_at', { ascending: false });
                if (error) return { error: 'No se pudieron consultar las encomiendas.' };
                return data ?? [];
            }

            case 'preview_resident_import':
            case 'apply_resident_import': {
                const communityId = scopedCommunity(userCtx);
                if (!communityId || !userCtx.user_id) return forbidden('No pude determinar tu comunidad.');
                if (!isAdmin(userCtx)) return { error: 'Solo la administración puede cargar residentes.' };
                const actor = { id: userCtx.user_id, role: 'admin', communityId, name: userCtx.name ?? null };
                return name === 'preview_resident_import'
                    ? previewResidentImport(actor, input as Record<string, unknown>)
                    : applyResidentImport(actor, input as Record<string, unknown>);
            }

            case 'list_open_cases':
            case 'update_case_status': {
                if (!isStaff(userCtx)) return { error: 'Solo la administración o conserjería gestiona casos.' };
                const communityId = scopedCommunity(userCtx);
                if (!communityId || !userCtx.user_id) return forbidden('No pude determinar tu comunidad.');
                if (name === 'list_open_cases') return listOpenCases(supabaseAdmin, communityId);
                return updateCaseStatusForStaff(supabaseAdmin, { id: userCtx.user_id, role: userCtx.role || '', communityId, name: userCtx.name || null }, input as Record<string, unknown>);
            }

            case 'list_pending_residents':
            case 'decide_pending_resident':
            case 'assign_resident_unit': {
                if (!isAdmin(userCtx)) return { error: 'Solo la administración valida vecinos y asigna departamentos.' };
                const communityId = scopedCommunity(userCtx);
                if (!communityId || !userCtx.user_id) return forbidden('No pude determinar tu comunidad.');
                if (name === 'list_pending_residents') return listPendingResidentsForAdmin(communityId);
                if (name === 'decide_pending_resident') return decidePendingResidentForAdmin(communityId, userCtx.user_id, input as Record<string, unknown>);
                return assignResidentUnitForAdmin(supabaseAdmin, communityId, input as Record<string, unknown>);
            }

            case 'update_unit_data': {
                if (!isAdmin(userCtx)) return { error: 'Solo los administradores pueden modificar información de departamentos.' };
                
                const communityId = scopedCommunity(userCtx);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                const unitId = await scopedUnit(userCtx, input.unit_id);
                if (!unitId) return forbidden('La unidad no existe en tu comunidad.');
                const updates: Record<string, string | number> = {};
                if (input.number !== undefined) updates.number = input.number.trim().slice(0, 80);
                if (input.floor !== undefined) {
                    const floor = Number(input.floor);
                    if (!Number.isInteger(floor) || floor < -10 || floor > 300) return { error: 'El piso indicado no es valido.' };
                    updates.floor = floor;
                }

                if (Object.keys(updates).length === 0) return { error: 'No se enviaron datos para actualizar' };

                const update = supabaseAdmin
                    .from('units')
                    .update(updates)
                    .eq('id', unitId)
                    .eq('community_id', communityId)
                    .select('id')
                    .maybeSingle();
                const { data: updatedUnit, error } = await update;
                
                if (error || !updatedUnit) return { error: 'No se pudo actualizar el departamento', detail: error?.message };
                return { success: true, message: `Información de la unidad actualizada correctamente.` };
            }

            // ── IOT & PREDICTIVE MAINTENANCE ─────────────────────────────────
            case 'request_urgent_access_approval': {
                if (!isStaff(userCtx)) return forbidden('Solo conserjeria o administracion pueden solicitar acceso urgente.');
                const communityId = scopedCommunity(userCtx);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                const unitId = await scopedUnit(userCtx, input.unit_id);
                if (!unitId) return forbidden('La unidad no existe en tu comunidad.');
                const { data: unit, error: unitError } = await supabaseAdmin
                    .from('units')
                    .select('owner_id')
                    .eq('id', unitId)
                    .eq('community_id', communityId)
                    .maybeSingle();
                if (unitError || !unit) return { error: 'No se pudo validar la unidad para solicitar acceso.' };
                const residentFilter = unit?.owner_id
                    ? `unit_id.eq.${unitId},id.eq.${unit.owner_id}`
                    : `unit_id.eq.${unitId}`;
                const { data: residents, error: residentsError } = await supabaseAdmin
                    .from('profiles')
                    .select('id')
                    .eq('community_id', communityId)
                    .or(residentFilter);
                if (residentsError) return { error: 'No se pudieron consultar los residentes de la unidad.' };

                const notifications = (residents || []).map(resident => ({
                    user_id: resident.id,
                    type: 'alert',
                    category: 'iot_access_approval',
                    title: 'Solicitud urgente de acceso',
                    body: input.reason,
                    link: '/resident/cases',
                    community_id: communityId,
                }));

                let notificationError: string | null = null;
                if (notifications.length > 0) {
                    const { error } = await supabaseAdmin.from('notifications').insert(notifications);
                    notificationError = error?.message || null;
                }

                return {
                    success: notifications.length > 0 && !notificationError,
                    status: 'APPROVAL_PENDING',
                    notified_residents: notifications.length,
                    ...(notificationError ? { error: 'No se pudo entregar la solicitud de acceso.' } : {}),
                    message: notifications.length > 0
                        ? `Se notificó a ${notifications.length} residente(s) de la unidad ${input.unit_id} para autorizar acceso urgente.`
                        : `No encontré residentes asociados a la unidad ${input.unit_id}; escalar a conserjería.`
                };
            }

            default:
                return NOT_HANDLED;
        }
}
