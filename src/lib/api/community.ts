import { supabase } from '../supabase';
import {
    CollectivePurchaseCampaign,
    CommunityGovernanceStatus,
    CommunityCoordinatorCandidate,
    CommunityParticipationRequest,
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
        governanceStatus: asString(row.governance_status, 'pending') as CommunityGovernanceStatus,
        coordinatorId: asString(row.coordinator_id) || undefined,
        coordinatorName: asString(row.coordinator_name) || undefined,
        governanceNote: asString(row.governance_note) || undefined,
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
        organizerId: asString(row.organizer_id) || undefined,
        governanceStatus: asString(row.governance_status, 'pending') as CommunityGovernanceStatus,
        coordinatorId: asString(row.coordinator_id) || undefined,
        coordinatorName: asString(row.coordinator_name) || undefined,
        governanceNote: asString(row.governance_note) || undefined,
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
        creatorId: asString(row.creator_id) || undefined,
        governanceStatus: asString(row.governance_status, 'pending') as CommunityGovernanceStatus,
        coordinatorId: asString(row.coordinator_id) || undefined,
        coordinatorName: asString(row.coordinator_name) || undefined,
        governanceNote: asString(row.governance_note) || undefined,
        status: (asString(row.status, 'forming') as CommunityProject['status']),
        createdAt: asString(row.created_at, new Date().toISOString()),
    };
}

export const CommunityCollaborationService = {
    async getCoordinatorCandidates(): Promise<CommunityCoordinatorCandidate[]> {
        const { data, error } = await supabase.from('profiles').select('id,name,role').order('name');
        if (error) throw error;
        return ((data || []) as CollaborationRow[]).map(row => ({
            id: asString(row.id), name: asString(row.name, 'Vecino'), role: asString(row.role, 'resident'),
        }));
    },
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

    async createTimeBankOffer(input: Omit<TimeBankOffer, 'id' | 'requestsCount' | 'createdAt' | 'governanceStatus' | 'coordinatorId' | 'coordinatorName' | 'governanceNote'>): Promise<TimeBankOffer[]> {
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
            governance_status: 'pending',
        });
        if (error) throw error;
        return this.getTimeBankOffers();
    },

    async requestTimeBankOffer(id: string, communityId: string, requesterId: string, message?: string): Promise<TimeBankOffer[]> {
        const { error } = await supabase.from('community_participation_requests').insert({
            initiative_type: 'time_bank', initiative_id: id, community_id: communityId,
            requester_id: requesterId, message: message?.trim() || null,
        });
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

    async createCollectivePurchase(input: Omit<CollectivePurchaseCampaign, 'id' | 'participants' | 'status' | 'createdAt' | 'governanceStatus' | 'coordinatorId' | 'coordinatorName' | 'governanceNote'>): Promise<CollectivePurchaseCampaign[]> {
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
            organizer_id: input.organizerId,
            governance_status: 'pending',
        });
        if (error) throw error;
        return this.getCollectivePurchases();
    },

    async joinCollectivePurchase(id: string, communityId: string, requesterId: string): Promise<CollectivePurchaseCampaign[]> {
        const { error } = await supabase.from('community_participation_requests').insert({
            initiative_type: 'collective_purchase', initiative_id: id, community_id: communityId, requester_id: requesterId,
        });
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

    async createCommunityProject(input: Omit<CommunityProject, 'id' | 'participants' | 'status' | 'createdAt' | 'governanceStatus' | 'coordinatorId' | 'coordinatorName' | 'governanceNote'>): Promise<CommunityProject[]> {
        const { error } = await supabase.from('community_projects').insert({
            community_id: input.communityId,
            title: input.title,
            area: input.area,
            description: input.description,
            impact: input.impact,
            needed: input.needed,
            coco_insight: input.cocoInsight,
            creator_id: input.creatorId,
            governance_status: 'pending',
            participants: 1,
            status: 'forming',
        });
        if (error) throw error;
        return this.getCommunityProjects();
    },

    async joinCommunityProject(id: string, communityId: string, requesterId: string): Promise<CommunityProject[]> {
        const { error } = await supabase.from('community_participation_requests').insert({
            initiative_type: 'community_project', initiative_id: id, community_id: communityId, requester_id: requesterId,
        });
        if (error) throw error;
        return this.getCommunityProjects();
    },

    async getParticipationRequests(): Promise<CommunityParticipationRequest[]> {
        const { data, error } = await supabase.from('community_participation_requests').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        return ((data || []) as CollaborationRow[]).map(row => ({
            id: asString(row.id), communityId: asString(row.community_id),
            initiativeType: asString(row.initiative_type) as CommunityParticipationRequest['initiativeType'],
            initiativeId: asString(row.initiative_id), requesterId: asString(row.requester_id),
            requesterName: asString(row.requester_name) || undefined, coordinatorId: asString(row.coordinator_id) || undefined,
            message: asString(row.message) || undefined,
            status: asString(row.status, 'pending') as CommunityParticipationRequest['status'], createdAt: asString(row.created_at),
        }));
    },

    async resolveParticipationRequest(id: string, status: 'accepted' | 'rejected') {
        const { data, error } = await supabase.from('community_participation_requests').update({
            status, resolved_at: new Date().toISOString(),
        }).eq('id', id).eq('status', 'pending').select('id').maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('No tienes permiso o la solicitud ya fue resuelta.');
    },

    async reviewInitiative(table: 'time_bank_offers' | 'collective_purchase_campaigns' | 'community_projects', id: string, input: {
        status: CommunityGovernanceStatus; coordinatorId?: string; note?: string; reviewerId: string;
    }) {
        const { error } = await supabase.from(table).update({
            governance_status: input.status, coordinator_id: input.coordinatorId || null,
            governance_note: input.note?.trim() || null, validated_by: input.reviewerId,
            validated_at: new Date().toISOString(),
        }).eq('id', id);
        if (error) throw error;
    },
};
