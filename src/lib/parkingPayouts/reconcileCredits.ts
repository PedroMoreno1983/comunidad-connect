import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

/**
 * Después de un abono automático de una liquidación de estacionamiento, el
 * estado de los cobros de la unidad abonada (pendiente / vencido / pagado) se
 * recalcula con la misma lógica que un pago normal (`reconcileUnitStatuses`).
 *
 * La base no puede llamar esa lógica (vive en TypeScript): marca la liquidación
 * con `credit_reconciled_at = NULL` y el servidor la recalcula aquí. Se llama al
 * final de cada recálculo de unidad (un pago del arrendatario dispara el abono
 * al dueño), tras el webhook de Haulmer y desde la vista de administración.
 *
 * Recalcular una unidad puede pagar otro arriendo y abrir otro abono: se repite
 * hasta 3 vueltas. Un error aquí nunca rompe el pago que lo disparó.
 */
export async function reconcileParkingPayoutCredits(
    communityId: string,
    reconcileUnit: (communityId: string, unitId: string) => Promise<void>,
): Promise<number> {
    const admin = getSupabaseAdmin();
    let reconciled = 0;
    for (let pass = 0; pass < 3; pass += 1) {
        const { data, error } = await admin
            .from('parking_payouts')
            .select('id, credit_unit_id')
            .eq('community_id', communityId)
            .eq('status', 'credited')
            .is('credit_reconciled_at', null)
            .limit(200);
        if (error) throw error;
        const rows = (data || []) as { id: string; credit_unit_id: string | null }[];
        if (rows.length === 0) break;

        const units = [...new Set(rows.map(row => row.credit_unit_id).filter((id): id is string => Boolean(id)))];
        for (const unitId of units) await reconcileUnit(communityId, unitId);

        const { error: markError } = await admin
            .from('parking_payouts')
            .update({ credit_reconciled_at: new Date().toISOString() })
            .in('id', rows.map(row => row.id))
            .eq('status', 'credited');
        if (markError) throw markError;
        reconciled += rows.length;
    }
    return reconciled;
}
