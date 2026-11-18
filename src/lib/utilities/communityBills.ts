import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import type { FinanceDocumentDraft, UtilityBillFields, UtilityService } from '@/lib/types';
import { isUtilityService, matchUtilityProvider, utilityAmountWarning } from './providers';

/**
 * Boletas de los medidores compartidos del condominio (luz de pasillos, agua de
 * riego, gas de la caldera). Solo administración. Las cuentas personales de
 * cada residente viven aparte y nunca pasan por aquí.
 */

/**
 * Completa el borrador que devolvió la IA con lo que el condominio ya sabe de
 * ese n° de cliente: categoría, nombre y prorrateo de la vez anterior, si la
 * boleta ya está cargada, y si el monto se aleja de la boleta anterior.
 */
export async function enrichUtilityDraft(communityId: string, draft: FinanceDocumentDraft): Promise<FinanceDocumentDraft> {
    const utility = draft.utility;
    if (!utility) return draft;
    const admin = getSupabaseAdmin();
    const warnings = [...draft.warnings];
    const next: FinanceDocumentDraft = { ...draft };

    if (utility.dueDate) next.suggestedMonth = utility.dueDate.slice(0, 7);
    if (!isUtilityService(next.category)) {
        const provider = matchUtilityProvider(draft.provider);
        if (provider) next.category = provider.service;
    }

    const { data: account } = await admin.from('community_utility_accounts')
        .select('service, label, prorate_method')
        .eq('community_id', communityId).eq('customer_number', utility.customerNumber).maybeSingle();
    if (account) {
        next.category = String(account.service);
        if (account.label) next.label = String(account.label);
        next.suggestedProrateMethod = account.prorate_method === 'equal' ? 'equal' : 'share';
    }

    if (utility.servicePeriod) {
        const { data: duplicate } = await admin.from('community_expenses')
            .select('id, month').eq('community_id', communityId)
            .eq('utility_customer_number', utility.customerNumber).eq('service_period', utility.servicePeriod)
            .limit(1).maybeSingle();
        if (duplicate) {
            warnings.unshift(`Esta boleta (n° ${utility.customerNumber}, ${utility.servicePeriod}) ya está cargada en los egresos de ${duplicate.month}.`);
        }
    }

    let previousQuery = admin.from('community_expenses')
        .select('amount, service_period, month').eq('community_id', communityId)
        .eq('utility_customer_number', utility.customerNumber);
    if (utility.servicePeriod) previousQuery = previousQuery.lt('service_period', utility.servicePeriod);
    const { data: previous } = await previousQuery
        .order('service_period', { ascending: false, nullsFirst: false }).order('month', { ascending: false })
        .limit(1).maybeSingle();
    const anomaly = utilityAmountWarning(draft.amount, previous
        ? { amount: Number(previous.amount), period: String(previous.service_period || previous.month) } : null);
    if (anomaly) warnings.push(anomaly);

    next.warnings = warnings.slice(0, 8);
    return next;
}

/** Recuerda el n° de cliente para que la próxima boleta llegue clasificada. */
export async function rememberUtilityAccount(communityId: string, userId: string, input: {
    utility: UtilityBillFields; category: string; provider: string; label: string; prorateMethod: 'share' | 'equal';
}) {
    if (!isUtilityService(input.category)) return;
    const service: UtilityService = input.category;
    const { error } = await getSupabaseAdmin().from('community_utility_accounts').upsert({
        community_id: communityId,
        customer_number: input.utility.customerNumber,
        service,
        provider: input.provider.slice(0, 80),
        label: input.label.slice(0, 160),
        prorate_method: input.prorateMethod,
        created_by: userId,
        updated_at: new Date().toISOString(),
    }, { onConflict: 'community_id,customer_number' });
    if (error) throw error;
}

/** Lee los datos de boleta que manda el formulario de guardado. */
export function utilityFieldsFromForm(form: FormData): UtilityBillFields | null {
    const customerNumber = String(form.get('utilityCustomerNumber') || '').trim();
    if (!customerNumber) return null;
    const period = String(form.get('utilityServicePeriod') || '');
    const due = String(form.get('utilityDueDate') || '');
    const consumption = Number(form.get('utilityConsumptionValue'));
    return {
        customerNumber: customerNumber.toUpperCase().replace(/[^0-9A-Z-]/g, '').slice(0, 40),
        servicePeriod: /^\d{4}-(0[1-9]|1[0-2])$/.test(period) ? period : '',
        dueDate: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : '',
        consumptionValue: form.get('utilityConsumptionValue') && Number.isFinite(consumption) && consumption >= 0 ? consumption : null,
        consumptionUnit: String(form.get('utilityConsumptionUnit') || '').slice(0, 12),
    };
}
