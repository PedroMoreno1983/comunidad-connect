import 'server-only';

/**
 * Ejecutores de herramientas de CoCo: finance. Movidos tal cual desde el switch
 * de executeTool (21-11-2026). Devuelven NOT_HANDLED si la herramienta no es de este dominio.
 */
import { cancelPaymentAgreement, createPaymentAgreement, listPaymentAgreements, payAgreementInstallment } from '../../agreementTools';
import { addChargeForAdmin, cancelChargeForAdmin, deleteExpenseForAdmin, deletePaymentForAdmin, getUnitAccount, listExpensesForAdmin } from '../../financeAdminTools';
import { summarizeAccountPaymentStatus } from '../../paymentStatus';
import { requestAgreementConversation } from '@/lib/finance/agreementRequest';
import { BillingError, addCommunityExpense, cancelBilling, issueBilling, previewBilling } from '@/lib/finance/billingService';
import { PAYMENT_METHODS, getUnitStatement, recordPayment } from '@/lib/finance/collectionService';
import { addCommunityExpenseWithChatImage } from '@/lib/finance/expenseChatAttachment';
import { getMonthlyReport } from '@/lib/finance/reportingService';
import { reportTransferForUnit } from '@/lib/finance/transferReport';
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { NOT_HANDLED, UserContext, forbidden, isAdmin, parsePesos, scopedCommunity, scopedUnit } from '../shared';

export async function executeFinanceTool(name: string, input: Record<string, string>, userCtx: UserContext): Promise<unknown> {
        switch (name) {
            case 'get_payment_status': {
                if (!userCtx.community_id) return forbidden('No pude determinar tu comunidad.');
                const unitId = await scopedUnit(userCtx, input.unit_id);
                if (!unitId) return forbidden('No pude determinar tu unidad.');
                const monthFilter = (input.month || '').trim() || null;
                if (monthFilter && !/^\d{4}-\d{2}$/.test(monthFilter)) {
                    return { error: 'El periodo debe usar el formato YYYY-MM.' };
                }
                const statement = await getUnitStatement(userCtx.community_id, unitId);
                return summarizeAccountPaymentStatus(statement, monthFilter);
            }

            case 'request_payment_agreement': {
                if (!userCtx.user_id) return forbidden('No pude identificarte.');
                const unitId = await scopedUnit(userCtx, undefined);
                const result = await requestAgreementConversation(supabaseAdmin, {
                    id: userCtx.user_id, role: userCtx.role || 'resident', communityId: scopedCommunity(userCtx) ?? null, unitId: unitId ?? null,
                }, 'coco');
                if ('error' in result) return { error: result.error };
                return { success: true, message: result.message };
            }

            case 'report_transfer': {
                const communityId = scopedCommunity(userCtx);
                if (!communityId || !userCtx.user_id) return forbidden('No pude identificar al residente.');
                const unitId = await scopedUnit(userCtx, undefined);
                if (!unitId) return forbidden('Tu perfil todavía no tiene una unidad asignada; pídele a la administración que la asocie.');
                const result = await reportTransferForUnit(supabaseAdmin, {
                    communityId,
                    unitId,
                    amount: input.amount,
                    paidAt: input.paid_at,
                    reference: input.reference,
                    month: input.month,
                });
                if ('error' in result) return { error: result.error };
                return {
                    success: true,
                    message: result.notified
                        ? `Le avisé a la administración de tu transferencia de $${result.amount.toLocaleString('es-CL')} para ${result.month}. Tu saldo cambia cuando la verifique y la registre.`
                        : 'Quedó informada, pero tu comunidad no tiene una administración con cuenta que la reciba todavía.',
                };
            }

            // ── ADMINISTRADOR ────────────────────────────────────────────────
            case 'get_defaulters_list': {
                if (!isAdmin(userCtx)) return { error: 'Solo los administradores pueden acceder a esta información.' };
                const communityId = scopedCommunity(userCtx, input.community_id);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                const query = supabaseAdmin
                    .from('expenses')
                    .select('unit_id,amount,due_date,month')
                    .eq('community_id', communityId)
                    .in('status', ['pending', 'overdue'])
                    .order('due_date', { ascending: true });
                if (input.month) query.eq('month', input.month);
                const { data, error } = await query.limit(20);
                if (error) return { error: 'No se pudo consultar la cartera vencida.' };
                const expenseRows = data ?? [];
                const unitIds = [...new Set(expenseRows.map(row => row.unit_id).filter(Boolean))];
                if (unitIds.length === 0) return [];
                const { data: units, error: unitsError } = await supabaseAdmin
                    .from('units')
                    .select('id,number,unit_number')
                    .eq('community_id', communityId)
                    .in('id', unitIds);
                if (unitsError) return { error: 'No se pudieron identificar las unidades de la cartera vencida.' };
                const unitsById = new Map((units || []).map(unitRow => [unitRow.id, unitRow]));
                return expenseRows.map(expenseRow => ({
                    ...expenseRow,
                    unit: unitsById.get(expenseRow.unit_id) || null,
                }));
            }

            case 'list_payment_agreements':
            case 'create_payment_agreement':
            case 'cancel_payment_agreement':
            case 'pay_agreement_installment': {
                if (!isAdmin(userCtx)) return { error: 'Solo la administración gestiona convenios de pago.' };
                const communityId = scopedCommunity(userCtx);
                if (!communityId || !userCtx.user_id) return forbidden('No pude determinar tu comunidad.');
                const args = input as Record<string, unknown>;
                if (name === 'list_payment_agreements') return listPaymentAgreements(communityId);
                if (name === 'create_payment_agreement') return createPaymentAgreement(supabaseAdmin, communityId, userCtx.user_id, args);
                if (name === 'cancel_payment_agreement') return cancelPaymentAgreement(communityId, args);
                return payAgreementInstallment(communityId, userCtx.user_id, args);
            }

            case 'get_unit_account':
            case 'add_unit_charge':
            case 'cancel_unit_charge':
            case 'delete_unit_payment':
            case 'list_community_expenses':
            case 'delete_community_expense': {
                if (!isAdmin(userCtx)) return { error: 'Solo la administración gestiona cargos, pagos y gastos.' };
                const communityId = scopedCommunity(userCtx);
                if (!communityId || !userCtx.user_id) return forbidden('No pude determinar tu comunidad.');
                const args = input as Record<string, unknown>;
                if (name === 'get_unit_account') return getUnitAccount(supabaseAdmin, communityId, args);
                if (name === 'add_unit_charge') return addChargeForAdmin(supabaseAdmin, communityId, userCtx.user_id, args);
                if (name === 'cancel_unit_charge') return cancelChargeForAdmin(communityId, args);
                if (name === 'delete_unit_payment') return deletePaymentForAdmin(communityId, args);
                if (name === 'list_community_expenses') return listExpensesForAdmin(communityId, args);
                return deleteExpenseForAdmin(communityId, args);
            }

            case 'add_community_expense': {
                if (!isAdmin(userCtx)) return { error: 'Solo los administradores pueden cargar egresos.' };
                const communityId = scopedCommunity(userCtx);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                try {
                    const expenseInput = {
                        month: (input.month || '').trim(),
                        label: (input.label || '').trim(),
                        amount: parsePesos(input.amount),
                        category: (input.category || '').trim() || undefined,
                        prorateMethod: input.prorate_method === 'equal' ? 'equal' as const : 'share' as const,
                    };
                    // Con foto (chat web o WhatsApp), la boleta queda como respaldo del egreso.
                    const attachmentId = (input.attachment_id || '').trim();
                    const expense = attachmentId && userCtx.user_id
                        ? await addCommunityExpenseWithChatImage(communityId, userCtx.user_id, attachmentId, expenseInput)
                        : await addCommunityExpense(communityId, userCtx.user_id ?? null, expenseInput);
                    const backed = attachmentId && userCtx.user_id ? ' La foto quedó como respaldo.' : '';
                    return { success: true, expense_id: expense.id, message: `Egreso "${expense.label}" por ${Number(expense.amount).toLocaleString('es-CL')} cargado a ${expense.month}.${backed}` };
                } catch (billingError) {
                    if (billingError instanceof BillingError) return { error: billingError.message };
                    throw billingError;
                }
            }

            case 'record_payment': {
                if (!isAdmin(userCtx)) return forbidden('Solo los administradores pueden registrar pagos.');
                const communityId = scopedCommunity(userCtx);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                const unitId = await scopedUnit(userCtx, input.unit_id);
                if (!unitId) return { error: 'Indica una unidad existente de tu comunidad.' };
                const amountText = (input.amount || '').trim();
                const amount = Number(amountText);
                const reference = (input.reference || '').trim();
                const paidAt = (input.paid_at || '').trim();
                const method = (input.method || '').trim();
                if (!/^\d+$/.test(amountText) || !Number.isSafeInteger(amount) || amount <= 0) return { error: 'Indica un monto entero positivo en pesos, sin separadores.' };
                const parsedDate = new Date(`${paidAt}T00:00:00Z`);
                if (!/^\d{4}-\d{2}-\d{2}$/.test(paidAt) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== paidAt) return { error: 'Indica una fecha válida en formato AAAA-MM-DD.' };
                if (!PAYMENT_METHODS.has(method)) return { error: 'Indica un medio de pago válido.' };
                if (!reference || reference.length > 120) return { error: 'Indica una referencia de comprobante única (máximo 120 caracteres).' };
                try {
                    const payment = await recordPayment(communityId, userCtx.user_id ?? null, { unitId, amount, paidAt, method, reference });
                    return { success: true, payment_id: payment.id, message: `Pago de $${amount.toLocaleString('es-CL')} registrado manualmente para la unidad ${input.unit_id}, con referencia ${reference}. CoCo no verificó el banco.` };
                } catch (paymentError) {
                    if (paymentError instanceof BillingError) return { error: paymentError.message };
                    throw paymentError;
                }
            }

            case 'get_monthly_finance_report': {
                if (!isAdmin(userCtx)) return forbidden('Solo los administradores pueden ver la rendición mensual.');
                const communityId = scopedCommunity(userCtx);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                try {
                    return await getMonthlyReport(communityId, (input.month || '').trim());
                } catch (reportError) {
                    if (reportError instanceof BillingError) return { error: reportError.message };
                    throw reportError;
                }
            }

            case 'preview_billing': {
                if (!isAdmin(userCtx)) return { error: 'Solo los administradores pueden ver el prorrateo.' };
                const communityId = scopedCommunity(userCtx);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                try {
                    const preview = await previewBilling(communityId, (input.month || '').trim());
                    return {
                        month: preview.month,
                        total_egresos: preview.totalExpenses,
                        total_a_cobrar: preview.totalCharged,
                        unidades: preview.unitCount,
                        egresos_cargados: preview.expenseCount,
                        reparte_en_partes_iguales: preview.fellBackToEqualSplit,
                        advertencias: preview.warnings,
                        ya_emitido: Boolean(preview.issuedRun),
                        detalle: preview.units.map(unitRow => ({ unidad: unitRow.label, cobro: unitRow.total })),
                    };
                } catch (billingError) {
                    if (billingError instanceof BillingError) return { error: billingError.message };
                    throw billingError;
                }
            }

            case 'issue_billing': {
                if (!isAdmin(userCtx)) return { error: 'Solo los administradores pueden emitir el gasto común.' };
                const communityId = scopedCommunity(userCtx);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                try {
                    const result = await issueBilling(communityId, userCtx.user_id ?? null, (input.month || '').trim(), (input.due_date || '').trim());
                    return {
                        success: true,
                        message: `Gasto común de ${result.month} emitido: ${result.issuedUnits} unidad(es), total $${result.totalCharged.toLocaleString('es-CL')}. ${result.notified} residente(s) notificado(s).`
                            + (result.skippedUnits.length ? ` Omitidas por tener ya un cobro: ${result.skippedUnits.join(', ')}.` : ''),
                        ...result,
                    };
                } catch (billingError) {
                    if (billingError instanceof BillingError) return { error: billingError.message };
                    throw billingError;
                }
            }

            case 'cancel_issued_billing': {
                if (!isAdmin(userCtx)) return { error: 'Solo los administradores pueden anular una emisión.' };
                const communityId = scopedCommunity(userCtx);
                if (!communityId) return forbidden('No pude determinar la comunidad.');
                try {
                    const result = await cancelBilling(communityId, (input.run_id || '').trim(), userCtx.user_id ?? null);
                    return { success: true, run_id: (input.run_id || '').trim(), message: `Emisión de ${result.month} anulada.` };
                } catch (billingError) {
                    if (billingError instanceof BillingError) return { error: billingError.message };
                    throw billingError;
                }
            }

            default:
                return NOT_HANDLED;
        }
}
