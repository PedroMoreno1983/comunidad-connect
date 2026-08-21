/**
 * CommunityCollaborationService: mediacion vecinal, banco de tiempo,
 * compras colectivas y proyectos comunitarios.
 *
 * Extraído de `src/lib/api.ts`, que reexporta estos servicios para no
 * romper a quienes los importan desde `@/lib/api`.
 * Ver docs/deuda-arquitectonica.md.
 */

import { supabase } from '../supabase';
import type {
    CollectivePurchaseCampaign,
    CommunityProject,
    NeighborMediationCase,
    TimeBankOffer,
} from '../types';

function getDraftedCnvMessage(input: {
    reporterName: string;
    targetUnit: string;
    observation: string;
    feeling: string;
    need: string;
    request: string;
}) {
    return [
        `Hola, soy ${input.reporterName || 'un vecino de la comunidad'}. Te escribo con buena intencion para resolver algo sin escalarlo.`,
        `Observacion: ${input.observation}.`,
        `Me siento ${input.feeling} y necesito ${input.need}.`,
        `¿Podrias ${input.request}?`,
        `Gracias por recibir este mensaje. La idea es cuidarnos entre vecinos antes de llegar a multas o denuncias.`,
    ].join('\n\n');
}

type CollaborationRow = Record<string, unknown>;

function asString(value: unknown, fallback = '') {
    return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function mapMediationRow(row: CollaborationRow): NeighborMediationCase {
    return {
        id: asString(row.id),
        reporterId: asString(row.reporter_id),
        reporterName: asString(row.reporter_name, 'Vecino'),
        communityId: asString(row.community_id) || undefined,
        targetUnit: asString(row.target_unit),
        observation: asString(row.observation),
        feeling: asString(row.feeling),
        need: asString(row.need),
        request: asString(row.request),
        draftedMessage: asString(row.drafted_message),
        status: (asString(row.status, 'drafted') as NeighborMediationCase['status']),
        createdAt: asString(row.created_at, new Date().toISOString()),
    };
}

function mapTimeBankRow(row: CollaborationRow): TimeBankOffer {
    return {
        id: asString(row.id),
        profileId: asString(row.profile_id) || undefined,
        communityId: asString(row.community_id) || undefined,
        neighborName: asString(row.neighbor_name, 'Vecino'),
        unitLabel: asString(row.unit_label, 'Depto'),
        skill: asString(row.skill),
        description: asString(row.description),
        availability: asString(row.availability),
        credits: asNumber(row.credits, 1),
        requestsCount: asNumber(row.requests_count),
        category: (asString(row.category, 'other') as TimeBankOffer['category']),
        createdAt: asString(row.created_at, new Date().toISOString()),
    };
}

function mapCollectivePurchaseRow(row: CollaborationRow): CollectivePurchaseCampaign {
    return {
        id: asString(row.id),
        communityId: asString(row.community_id) || undefined,
        title: asString(row.title),
        supplier: asString(row.supplier),
        category: (asString(row.category, 'other') as CollectivePurchaseCampaign['category']),
        unitPrice: asNumber(row.unit_price),
        retailPrice: asNumber(row.retail_price),
        minimumParticipants: asNumber(row.minimum_participants, 1),
        participants: asNumber(row.participants, 1),
        deadline: asString(row.deadline),
        status: (asString(row.status, 'open') as CollectivePurchaseCampaign['status']),
        organizer: asString(row.organizer, 'Comite vecinal'),
        createdAt: asString(row.created_at, new Date().toISOString()),
    };
}

function mapCommunityProjectRow(row: CollaborationRow): CommunityProject {
    return {
        id: asString(row.id),
        communityId: asString(row.community_id) || undefined,
        title: asString(row.title),
        area: (asString(row.area, 'otro') as CommunityProject['area']),
        description: asString(row.description),
        impact: asString(row.impact),
        participants: asNumber(row.participants, 1),
        needed: asString(row.needed),
        cocoInsight: asString(row.coco_insight),
        status: (asString(row.status, 'forming') as CommunityProject['status']),
        createdAt: asString(row.created_at, new Date().toISOString()),
    };
}

export const CommunityCollaborationService = {
    async getMediationCases(): Promise<NeighborMediationCase[]> {
        const { data, error } = await supabase
            .from('neighbor_mediations')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return ((data || []) as CollaborationRow[]).map(mapMediationRow);
    },

    async getAdminMediationCases(): Promise<NeighborMediationCase[]> {
        const { data, error } = await supabase
            .from('neighbor_mediations')
            .select('*')
            .in('status', ['escalated', 'agreement'])
            .order('created_at', { ascending: false });
        if (error) throw error;
        return ((data || []) as CollaborationRow[]).map(mapMediationRow);
    },

    async createMediationCase(input: Omit<NeighborMediationCase, 'id' | 'draftedMessage' | 'status' | 'createdAt'>): Promise<NeighborMediationCase> {
        const draftedMessage = getDraftedCnvMessage(input);
        const { data, error } = await supabase
            .from('neighbor_mediations')
            .insert({
                reporter_id: input.reporterId,
                reporter_name: input.reporterName,
                community_id: input.communityId,
                target_unit: input.targetUnit,
                observation: input.observation,
                feeling: input.feeling,
                need: input.need,
                request: input.request,
                drafted_message: draftedMessage,
                status: 'drafted',
            })
            .select('*')
            .single();
        if (error) throw error;
        if (!data) throw new Error('No se pudo recuperar la mediacion creada.');
        return mapMediationRow(data as CollaborationRow);
    },

    async updateMediationStatus(id: string, status: NeighborMediationCase['status']): Promise<NeighborMediationCase[]> {
        const { error } = await supabase.from('neighbor_mediations').update({ status }).eq('id', id);
        if (error) throw error;
        return this.getMediationCases();
    },

    async getTimeBankOffers(): Promise<TimeBankOffer[]> {
        const { data, error } = await supabase
            .from('time_bank_offers')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return ((data || []) as CollaborationRow[]).map(mapTimeBankRow);
    },

    async createTimeBankOffer(input: Omit<TimeBankOffer, 'id' | 'requestsCount' | 'createdAt'>): Promise<TimeBankOffer[]> {
        const { error } = await supabase.from('time_bank_offers').insert({
            profile_id: input.profileId,
            community_id: input.communityId,
            neighbor_name: input.neighborName,
            unit_label: input.unitLabel,
            skill: input.skill,
            description: input.description,
            availability: input.availability,
            credits: input.credits,
            category: input.category,
        });
        if (error) throw error;
        return this.getTimeBankOffers();
    },

    async requestTimeBankOffer(id: string): Promise<TimeBankOffer[]> {
        const { data, error: readError } = await supabase.from('time_bank_offers').select('requests_count').eq('id', id).maybeSingle();
        if (readError) throw readError;
        if (!data) throw new Error('Oferta de tiempo no encontrada.');
        const requestsCount = Number((data as { requests_count?: number }).requests_count || 0) + 1;
        const { error } = await supabase.from('time_bank_offers').update({ requests_count: requestsCount }).eq('id', id);
        if (error) throw error;
        return this.getTimeBankOffers();
    },

    async getCollectivePurchases(): Promise<CollectivePurchaseCampaign[]> {
        const { data, error } = await supabase
            .from('collective_purchase_campaigns')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return ((data || []) as CollaborationRow[]).map(mapCollectivePurchaseRow);
    },

    async createCollectivePurchase(input: Omit<CollectivePurchaseCampaign, 'id' | 'participants' | 'status' | 'createdAt'>): Promise<CollectivePurchaseCampaign[]> {
        const { error } = await supabase.from('collective_purchase_campaigns').insert({
            community_id: input.communityId,
            title: input.title,
            supplier: input.supplier,
            category: input.category,
            unit_price: input.unitPrice,
            retail_price: input.retailPrice,
            minimum_participants: input.minimumParticipants,
            participants: 1,
            deadline: input.deadline,
            status: input.minimumParticipants <= 1 ? 'ready' : 'open',
            organizer: input.organizer,
        });
        if (error) throw error;
        return this.getCollectivePurchases();
    },

    async joinCollectivePurchase(id: string): Promise<CollectivePurchaseCampaign[]> {
        const { data, error: readError } = await supabase.from('collective_purchase_campaigns').select('participants, minimum_participants, status').eq('id', id).maybeSingle();
        if (readError) throw readError;
        if (!data) throw new Error('Compra colectiva no encontrada.');
        const row = data as { participants?: number; minimum_participants?: number; status?: CollectivePurchaseCampaign['status'] };
        const participants = Number(row.participants || 0) + 1;
        const status = participants >= Number(row.minimum_participants || 1) ? 'ready' : row.status || 'open';
        const { error } = await supabase.from('collective_purchase_campaigns').update({ participants, status }).eq('id', id);
        if (error) throw error;
        return this.getCollectivePurchases();
    },

    async getCommunityProjects(): Promise<CommunityProject[]> {
        const { data, error } = await supabase
            .from('community_projects')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return ((data || []) as CollaborationRow[]).map(mapCommunityProjectRow);
    },

    async createCommunityProject(input: Omit<CommunityProject, 'id' | 'participants' | 'status' | 'createdAt'>): Promise<CommunityProject[]> {
        const { error } = await supabase.from('community_projects').insert({
            community_id: input.communityId,
            title: input.title,
            area: input.area,
            description: input.description,
            impact: input.impact,
            needed: input.needed,
            coco_insight: input.cocoInsight,
            participants: 1,
            status: 'forming',
        });
        if (error) throw error;
        return this.getCommunityProjects();
    },

    async joinCommunityProject(id: string): Promise<CommunityProject[]> {
        const { data, error: readError } = await supabase.from('community_projects').select('participants').eq('id', id).maybeSingle();
        if (readError) throw readError;
        if (!data) throw new Error('Proyecto comunitario no encontrado.');
        const participants = Number((data as { participants?: number }).participants || 0) + 1;
        const { error } = await supabase.from('community_projects').update({ participants, status: 'active' }).eq('id', id);
        if (error) throw error;
        return this.getCommunityProjects();
    },
};
