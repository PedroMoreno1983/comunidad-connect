import { supabase } from '../supabase';
import type {
    CommunityDeal,
    CommunityDealInput,
    CommunityDealKind,
    CommunityDealPriceUnit,
    CommunityDealQuote,
    CommunityDealQuoteInput,
    CommunityDealStatus,
    CommunityDealUpdate,
} from '../types';

/**
 * Convenios comunitarios. Un residente propone y se suma; la administración
 * avanza el ciclo, registra cotizaciones y elige una. Lecturas y permisos los
 * resuelve la base (RLS y list_community_deals).
 */

type Row = Record<string, unknown>;

const text = (value: unknown) => (typeof value === 'string' ? value : '');
const nullableNum = (value: unknown) => {
    if (value === null || value === undefined) return null;
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

function mapDeal(row: Row): CommunityDeal {
    return {
        id: text(row.id),
        title: text(row.title),
        kind: text(row.kind) as CommunityDealKind,
        description: text(row.description),
        status: text(row.status) as CommunityDealStatus,
        interestGoal: nullableNum(row.interest_goal),
        needsAssembly: row.needs_assembly === true,
        assemblyNote: text(row.assembly_note),
        referencePrice: nullableNum(row.reference_price),
        dealPrice: nullableNum(row.deal_price),
        priceUnit: (text(row.price_unit) || 'unit_month') as CommunityDealPriceUnit,
        selectedQuoteId: text(row.selected_quote_id) || null,
        terms: text(row.terms),
        schedule: text(row.schedule),
        startsOn: text(row.starts_on) || null,
        endsOn: text(row.ends_on) || null,
        reviewNote: text(row.review_note) || null,
        createdBy: text(row.created_by),
        createdByName: text(row.created_by_name) || 'Vecino',
        createdAt: text(row.created_at),
        interestedCount: nullableNum(row.interested_count) ?? 0,
        iAmInterested: row.i_am_interested === true,
    };
}

function mapQuote(row: Row): CommunityDealQuote {
    return {
        id: text(row.id),
        dealId: text(row.deal_id),
        providerName: text(row.provider_name),
        contact: text(row.contact),
        offer: text(row.offer),
        price: nullableNum(row.price),
        priceUnit: (text(row.price_unit) || 'unit_month') as CommunityDealPriceUnit,
        createdAt: text(row.created_at),
    };
}

function updateRow(update: CommunityDealUpdate): Row {
    const row: Row = {};
    if (update.status !== undefined) row.status = update.status;
    if (update.interestGoal !== undefined) row.interest_goal = update.interestGoal;
    if (update.needsAssembly !== undefined) row.needs_assembly = update.needsAssembly;
    if (update.assemblyNote !== undefined) row.assembly_note = update.assemblyNote.slice(0, 1000);
    if (update.referencePrice !== undefined) row.reference_price = update.referencePrice;
    if (update.dealPrice !== undefined) row.deal_price = update.dealPrice;
    if (update.priceUnit !== undefined) row.price_unit = update.priceUnit;
    if (update.selectedQuoteId !== undefined) row.selected_quote_id = update.selectedQuoteId;
    if (update.terms !== undefined) row.terms = update.terms.slice(0, 3000);
    if (update.schedule !== undefined) row.schedule = update.schedule.slice(0, 300);
    if (update.startsOn !== undefined) row.starts_on = update.startsOn;
    if (update.endsOn !== undefined) row.ends_on = update.endsOn;
    if (update.reviewNote !== undefined) row.review_note = update.reviewNote;
    return row;
}

export const CommunityDealsService = {
    async list(): Promise<CommunityDeal[]> {
        const { data, error } = await supabase.rpc('list_community_deals');
        if (error) throw new Error(error.message);
        return ((data || []) as Row[]).map(mapDeal);
    },

    /** Un residente propone: queda en 'proposed' hasta que la administración lo abra. */
    async propose(userId: string, communityId: string, input: CommunityDealInput, asAdmin = false): Promise<void> {
        const { error } = await supabase.from('community_deals').insert({
            community_id: communityId,
            created_by: userId,
            title: input.title.trim().slice(0, 120),
            kind: input.kind,
            description: (input.description || '').trim().slice(0, 2000),
            // La administración lo abre directo a sondeo de interés.
            status: asAdmin ? 'gauging' : 'proposed',
        });
        if (error) throw new Error(error.message);
    },

    /** Me sumo (o me salgo). Devuelve cuántos interesados quedan. */
    async setInterest(dealId: string, interested: boolean, note = ''): Promise<number> {
        const { data, error } = await supabase.rpc('set_community_deal_interest', {
            p_deal_id: dealId,
            p_interested: interested,
            p_note: note,
        });
        if (error) throw new Error(error.message);
        return Number(data) || 0;
    },

    async getQuotes(dealId: string): Promise<CommunityDealQuote[]> {
        const { data, error } = await supabase
            .from('community_deal_quotes')
            .select('id,deal_id,provider_name,contact,offer,price,price_unit,created_at')
            .eq('deal_id', dealId)
            .order('price', { ascending: true, nullsFirst: false });
        if (error) throw new Error(error.message);
        return ((data || []) as Row[]).map(mapQuote);
    },

    // ── Administración ──────────────────────────────────────────
    async update(dealId: string, update: CommunityDealUpdate): Promise<void> {
        const { error } = await supabase.from('community_deals').update(updateRow(update)).eq('id', dealId);
        if (error) throw new Error(error.message);
    },

    async addQuote(dealId: string, communityId: string, input: CommunityDealQuoteInput): Promise<void> {
        const { error } = await supabase.from('community_deal_quotes').insert({
            deal_id: dealId,
            community_id: communityId,
            provider_name: input.providerName.trim().slice(0, 120),
            contact: (input.contact || '').trim().slice(0, 200),
            offer: (input.offer || '').trim().slice(0, 2000),
            price: input.price ?? null,
            price_unit: input.priceUnit || 'unit_month',
        });
        if (error) throw new Error(error.message);
    },

    async deleteQuote(quoteId: string): Promise<void> {
        const { error } = await supabase.from('community_deal_quotes').delete().eq('id', quoteId);
        if (error) throw new Error(error.message);
    },
};
