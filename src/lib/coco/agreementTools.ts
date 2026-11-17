import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { BillingError } from '@/lib/finance/billingService';
import { cancelAgreement, createAgreement, listAgreements, payInstallment } from '@/lib/finance/agreementService';
import { activeCommitteeMembers } from '@/lib/finance/committeeMembers';

/**
 * Convenios de pago (administración) y avance de mediaciones por CoCo.
 *
 * Convenios: sin lógica de dinero propia; delegan en agreementService, las
 * mismas funciones de /admin/finanzas (cuotas, comité, un convenio activo por
 * unidad). Si la comunidad tiene comité, el convenio exige un revisor: con un
 * solo integrante se usa ese; con varios, se pide elegir.
 *
 * Mediaciones: avanza el estado (enviado, acuerdo, escalado). La avanza quien
 * la pidió o la administración de la comunidad.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
type Row = Record<string, unknown>;

function billingMessage(error: unknown, fallback: string) {
    return error instanceof BillingError ? error.message : fallback;
}

export async function listPaymentAgreements(communityId: string) {
    const agreements = await listAgreements(communityId) as unknown as Row[];
    return {
        convenios: agreements.slice(0, 20).map(a => ({
            agreement_id: a.id, unidad: a.unitLabel, titulo: a.title, estado: a.status,
            total: a.totalAmount, pagado: a.paidAmount,
            cuotas_pendientes: ((a.installments ?? []) as Row[]).filter(i => i.status !== 'paid').map(i => ({
                installment_id: i.id, numero: i.sequence, vence: i.dueDate, monto: i.amount,
            })),
        })),
    };
}

export async function createPaymentAgreement(admin: SupabaseClient, communityId: string, adminId: string, input: Record<string, unknown>) {
    const number = text(input.unit_number, 20);
    if (!number) return { error: 'Dime el número de departamento.' };
    let unitQuery = admin.from('units').select('id, number, tower').eq('community_id', communityId).eq('number', number).limit(3);
    const tower = text(input.tower, 10);
    if (tower) unitQuery = unitQuery.eq('tower', tower);
    const { data: units } = await unitQuery;
    const matches = (units ?? []) as Row[];
    if (!matches.length) return { error: `No encontré el departamento ${number} en tu comunidad.` };
    if (matches.length > 1) return { error: `Hay más de un ${number} (distintas torres). Dime la torre.` };

    let reviewerId = text(input.reviewer_id, 36);
    if (!UUID.test(reviewerId)) {
        const committee = await activeCommitteeMembers(communityId);
        if (committee.length === 1) reviewerId = committee[0].id;
        else if (committee.length > 1) {
            return {
                error: 'La comunidad tiene comité de finanzas: elige quién revisa el convenio y vuelve a llamar con reviewer_id.',
                comite: committee.map(member => ({ reviewer_id: member.id, nombre: member.name })),
            };
        }
    }

    try {
        await createAgreement(communityId, adminId, {
            unitId: String(matches[0].id),
            title: text(input.title, 140) || `Convenio depto ${number}`,
            totalAmount: Number(input.total_amount),
            installmentCount: Number(input.installment_count),
            notes: text(input.notes, 500),
            reviewerId: reviewerId || undefined,
        });
        return {
            success: true,
            message: reviewerId
                ? `Convenio creado para el ${number}. Queda pendiente hasta que el comité lo revise.`
                : `Convenio firmado para el ${number}: ${Number(input.installment_count)} cuotas, la primera vence hoy.`,
        };
    } catch (error) {
        return { error: billingMessage(error, 'No se pudo crear el convenio.') };
    }
}

export async function cancelPaymentAgreement(communityId: string, input: Record<string, unknown>) {
    const agreementId = text(input.agreement_id, 36);
    if (!UUID.test(agreementId)) return { error: 'Necesito el agreement_id que devuelve list_payment_agreements.' };
    try {
        await cancelAgreement(communityId, agreementId);
        return { success: true, message: 'Convenio anulado. Las cuotas pendientes dejan de cobrarse; la deuda vuelve a la cuenta de la unidad.' };
    } catch (error) {
        return { error: billingMessage(error, 'No se pudo anular el convenio.') };
    }
}

export async function payAgreementInstallment(communityId: string, adminId: string, input: Record<string, unknown>) {
    const installmentId = text(input.installment_id, 36);
    if (!UUID.test(installmentId)) return { error: 'Necesito el installment_id que devuelve list_payment_agreements.' };
    try {
        await payInstallment(communityId, adminId, {
            installmentId,
            paidAt: text(input.paid_at, 10),
            method: text(input.method, 20) || 'transfer',
            reference: text(input.reference, 120),
        });
        return { success: true, message: 'Cuota registrada como pagada.' };
    } catch (error) {
        return { error: billingMessage(error, 'No se pudo registrar el pago de la cuota.') };
    }
}

export async function updateMediationStatus(admin: SupabaseClient, actor: { id: string; role: string; communityId: string }, input: Record<string, unknown>) {
    const mediationId = text(input.mediation_id, 36);
    if (!UUID.test(mediationId)) return { error: 'Necesito el mediation_id.' };
    const status = text(input.status, 12);
    if (!['sent', 'agreement', 'escalated'].includes(status)) return { error: 'El estado debe ser sent (enviado), agreement (hubo acuerdo) o escalated (escalar a la administración).' };
    const { data: mediation } = await admin.from('neighbor_mediations').select('id, reporter_id, community_id, status').eq('id', mediationId).maybeSingle();
    if (!mediation || mediation.community_id !== actor.communityId) return { error: 'No encontré esa mediación en tu comunidad.' };
    if (mediation.reporter_id !== actor.id && actor.role !== 'admin') return { error: 'Solo quien pidió la mediación o la administración la avanza.' };
    const { error } = await admin.from('neighbor_mediations').update({ status }).eq('id', mediationId).eq('community_id', actor.communityId);
    if (error) return { error: 'No se pudo actualizar la mediación.' };
    const done: Record<string, string> = { sent: 'quedó como enviada', agreement: 'quedó con acuerdo', escalated: 'se escaló a la administración' };
    return { success: true, message: `La mediación ${done[status]}.` };
}

export async function listMyMediations(admin: SupabaseClient, actor: { id: string; role: string; communityId: string }) {
    let query = admin.from('neighbor_mediations').select('id, target_unit, request, status, created_at')
        .eq('community_id', actor.communityId).order('created_at', { ascending: false }).limit(15);
    if (actor.role !== 'admin') query = query.eq('reporter_id', actor.id);
    const { data, error } = await query;
    if (error) return { error: 'No pude cargar las mediaciones.' };
    return { mediaciones: ((data ?? []) as Row[]).map(m => ({ mediation_id: m.id, con_depto: m.target_unit, peticion: m.request, estado: m.status })) };
}
