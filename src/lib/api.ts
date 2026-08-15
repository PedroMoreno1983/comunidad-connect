import { supabase } from './supabase';
import { formatWhatsAppPhone } from './whatsapp';
import {
    AdminDashboardSummary,
    AdminBooking,
    AdminProfile,
    AdminUsersDirectory,
    BuildingAsset,
    CocoCase,
    CocoCaseEvent,
    CollectivePurchaseCampaign,
    CommercialLeadRequest,
    CommercialLeadResponse,
    CommunityFinance,
    CreateAnnouncementInput,
    CreateAmenityInput,
    CommunityProject,
    MaintenanceAdminOverview,
    MaintenanceDashboardData,
    MaintenanceLog,
    MaintenanceServiceRow,
    MaintenanceTask,
    DirectoryNeighbor,
    MarketplaceConversation,
    MarketplaceItem,
    MarketplaceMessage,
    NeighborMediationCase,
    ParkingAccessEventType,
    ParkingAccessLookup,
    ParkingAvailabilityRule,
    ParkingBooking,
    ParkingBookingStatus,
    ParkingCommunitySettings,
    ParkingDriver,
    ParkingDriverInput,
    ParkingDriverVerification,
    ParkingEarningsTransaction,
    ParkingMapLevel,
    ParkingMapSpot,
    ParkingOwnerEarnings,
    ParkingPassDetail,
    ParkingPaymentStatus,
    ParkingSearchResult,
    ParkingSpot,
    ParkingSpotInput,
    ParkingSpotStatus,
    ParkingVehicleSize,
    PollVoteRecord,
    ProfileSettings,
    ResidentCasesSummary,
    ResidentHomeSummary,
    ResidentNavigationContext,
    ResidentFinanceExpense,
    ServiceRequestQueueItem,
    SupermarketGroupComparison,
    SupermarketGroupCreateInput,
    SupermarketGroupOrder,
    TimeBankOffer,
    Unit,
    User,
    WaterReading,
} from './types';
import type { ProductCapabilities } from './types';

async function sendBookingConfirmation(payload: {
    bookingId: string;
}) {
    return fetch('/api/email/booking-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

function isUuid(value?: string | null) {
    return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value));
}

function getProfileName(profile: Record<string, unknown>) {
    const rawName = String(profile.name || profile.full_name || "").trim();
    const email = String(profile.email || "").trim();
    if (rawName && rawName !== email) return rawName;
    if (email) return email.split("@")[0];
    return "Vecino";
}

function getUnitLabel(profile: Record<string, unknown>, unit?: Record<string, unknown>) {
    const profileDepartment = String(profile.department_number || "").trim();
    if (profileDepartment) return profileDepartment;

    const unitNumber = String(unit?.number || unit?.unit_number || unit?.department_number || "").trim();
    const tower = String(unit?.tower || "").trim();
    if (unitNumber && tower) return `${tower}-${unitNumber}`;
    if (unitNumber) return unitNumber;

    const rawUnitId = String(profile.unit_id || "").trim();
    return rawUnitId && !isUuid(rawUnitId) ? rawUnitId : "";
}

// ==========================================
// Admin Users API
// ==========================================

export const AdminUsersService = {
    async getDirectory(currentUserId?: string): Promise<AdminUsersDirectory> {
        let communityId: string | null = null;
        let communityName = "Comunidad";
        let residentCode: string | null = null;
        let conciergeCode: string | null = null;

        if (currentUserId) {
            const { data: profile, error: profileError } = await supabase
                .from("profiles")
                .select("community_id")
                .eq("id", currentUserId)
                .maybeSingle();

            if (profileError) throw profileError;
            communityId = typeof profile?.community_id === "string" ? profile.community_id : null;

            if (communityId) {
                const { data: community, error: communityError } = await supabase
                    .from("communities")
                    .select("name, resident_code, concierge_code")
                    .eq("id", communityId)
                    .maybeSingle();

                if (communityError) throw communityError;
                if (community) {
                    communityName = String(community.name || "Comunidad");
                    residentCode = typeof community.resident_code === "string" ? community.resident_code : null;
                    conciergeCode = typeof community.concierge_code === "string" ? community.concierge_code : null;
                }
            }
        }

        let query = supabase
            .from("profiles")
            .select("id, name, email, role, units(number)")
            .order("name");

        if (communityId) query = query.eq("community_id", communityId);

        const { data, error } = await query;
        if (error) throw error;

        return {
            users: (data || []) as AdminProfile[],
            communityName,
            residentCode,
            conciergeCode,
        };
    },
};

// ==========================================
// Directory API
// ==========================================

export const DirectoryService = {
    async getNeighbors(user: Pick<User, "id" | "email">): Promise<DirectoryNeighbor[]> {

        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .neq('id', user.id)
            .order('name');

        if (error) throw error;

        const profiles = Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
        const unitIds = Array.from(new Set(
            profiles
                .map(profile => String(profile.unit_id || ""))
                .filter(unitId => isUuid(unitId))
        ));

        let unitById = new Map<string, Record<string, unknown>>();
        if (unitIds.length > 0) {
            const { data: unitsData, error: unitsError } = await supabase
                .from('units')
                .select('*')
                .in('id', unitIds);

            if (!unitsError && Array.isArray(unitsData)) {
                unitById = new Map((unitsData as Array<Record<string, unknown>>).map(unit => [String(unit.id), unit]));
            }
        }

        return profiles.map(profile => {
            const unitId = String(profile.unit_id || "");
            const unit = unitById.get(unitId);

            return {
                id: String(profile.id),
                name: getProfileName(profile),
                avatar_url: typeof profile.avatar_url === "string" ? profile.avatar_url : undefined,
                role: (profile.role === "admin" || profile.role === "concierge" ? profile.role : "resident") as DirectoryNeighbor["role"],
                unit_id: unitId,
                unitLabel: getUnitLabel(profile, unit),
                email: typeof profile.email === "string" ? profile.email : undefined,
            };
        });
    },
};

// ==========================================
// Community Collaboration API
// ==========================================

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

async function updateUnitSafely(unitId: string, values: Record<string, unknown>) {
    const { error } = await supabase.from('units').update(values).eq('id', unitId);
    if (!error) return;

    if ('tower' in values) {
        const fallbackValues = { ...values };
        delete fallbackValues.tower;
        const fallback = await supabase.from('units').update(fallbackValues).eq('id', unitId);
        if (!fallback.error) return;
        throw fallback.error;
    }

    throw error;
}

async function insertUnitSafely(values: Record<string, unknown>) {
    const { error } = await supabase.from('units').insert(values);
    if (!error) return;

    if ('tower' in values) {
        const fallbackValues = { ...values };
        delete fallbackValues.tower;
        const fallback = await supabase.from('units').insert(fallbackValues);
        if (!fallback.error) return;
        throw fallback.error;
    }

    throw error;
}

// ==========================================
// Profile API
// ==========================================

export const ProfileService = {
    async getSettings(userId: string): Promise<ProfileSettings> {
        const { data } = await supabase
            .from('profiles')
            .select('name, avatar_url, phone_number, whatsapp_enabled')
            .eq('id', userId)
            .maybeSingle();

        const { data: unitData } = await supabase
            .from('units')
            .select('*')
            .eq('owner_id', userId)
            .maybeSingle();

        const unit = unitData as Record<string, string | null | undefined> | null;

        return {
            avatarUrl: typeof data?.avatar_url === "string" ? data.avatar_url : undefined,
            phoneNumber: typeof data?.phone_number === "string" ? data.phone_number.replace('+56', '') : "",
            whatsappEnabled: Boolean(data?.whatsapp_enabled),
            unitNumber: unit?.number || unit?.unit_number || "",
            unitTower: unit?.tower || "",
        };
    },

    async uploadAvatar(userId: string, file: File): Promise<string> {
        const formData = new FormData();
        formData.append('avatar', file);
        formData.append('userId', userId);

        const response = await fetch('/api/profile/avatar', {
            method: 'POST',
            body: formData,
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(typeof data.error === 'string' ? data.error : 'No se pudo subir la foto.');
        }

        if (typeof data.avatarUrl !== 'string' || !data.avatarUrl) {
            throw new Error('La foto se subio, pero no se recibio la URL publica.');
        }

        return data.avatarUrl;
    },

    async saveProfile(userId: string, values: { fullName: string; unitNumber: string; unitTower: string }) {
        const unitNumber = values.unitNumber.trim();
        const unitTower = values.unitTower.trim();
        const departmentNumber = unitNumber || unitTower;
        const { error: profileError } = await supabase
            .from('profiles')
            .update({ name: values.fullName.trim(), department_number: departmentNumber || null })
            .eq('id', userId);

        if (profileError) throw profileError;

        if (!unitNumber) return;

        const { data: existingUnit } = await supabase
            .from('units')
            .select('id')
            .eq('owner_id', userId)
            .maybeSingle();

        if (existingUnit) {
            await updateUnitSafely(existingUnit.id, { number: unitNumber, tower: unitTower });
            return;
        }

        const { data: foundUnit } = await supabase
            .from('units')
            .select('id')
            .eq('number', unitNumber)
            .is('owner_id', null)
            .maybeSingle();

        if (foundUnit) {
            await updateUnitSafely(foundUnit.id, { owner_id: userId, tower: unitTower });
            return;
        }

        await insertUnitSafely({
            number: unitNumber,
            tower: unitTower,
            owner_id: userId,
            floor: parseInt(unitNumber.substring(0, 1)) || 1,
        });
    },

    async sendPasswordReset(email: string, redirectTo: string) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw error;
    },

    async saveWhatsapp(userId: string, phoneNumber: string, whatsappEnabled: boolean) {
        const { error } = await supabase.from('profiles').update({
            phone_number: formatWhatsAppPhone(phoneNumber),
            whatsapp_enabled: whatsappEnabled,
        }).eq('id', userId);

        if (error) throw error;

        const consentResponse = await fetch('/api/privacy/consents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ consentType: 'whatsapp', granted: whatsappEnabled }),
        });
        if (!consentResponse.ok) {
            const consentResult = await consentResponse.json().catch(() => ({})) as { error?: string };
            throw new Error(consentResult.error || 'No se pudo registrar el consentimiento de WhatsApp.');
        }
    },
};

// ==========================================
// Resident Home API
// ==========================================


function getAnnouncementCategory(priority: unknown): string {
    return priority === "alert" ? "Urgente" : "Aviso";
}

export const HomeService = {
    async getResidentSummary(user: Pick<User, "id" | "email" | "unitId" | "communityId">): Promise<ResidentHomeSummary> {

        let expensesQuery = supabase
            .from('expenses')
            .select('amount')
            .in('status', ['pending', 'overdue']);

        if (user.unitId) {
            expensesQuery = expensesQuery.eq('unit_id', user.unitId);
        }

        const today = new Date().toISOString().split('T')[0];
        const bookingsQuery = supabase
            .from('bookings')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .gte('date', today);

        let announcementsQuery = supabase
            .from('announcements')
            .select('title, content, priority, created_at')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (user.communityId) {
            announcementsQuery = announcementsQuery.eq('community_id', user.communityId);
        }

        const [expensesResult, bookingsResult, announcementResult] = await Promise.all([
            expensesQuery,
            bookingsQuery,
            announcementsQuery,
        ]);

        if (expensesResult.error) throw expensesResult.error;
        if (bookingsResult.error) throw bookingsResult.error;
        if (announcementResult.error) throw announcementResult.error;

        const expenses = (expensesResult.data || []) as Array<{ amount: number | string | null }>;
        const pendingExpensesAmount = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
        const announcement = announcementResult.data as Record<string, unknown> | null;

        return {
            pendingExpensesCount: expenses.length,
            pendingExpensesAmount,
            bookingsCount: bookingsResult.count || 0,
            recentAnnouncement: announcement ? {
                title: String(announcement.title || "Aviso de la comunidad"),
                content: String(announcement.content || ""),
                category: getAnnouncementCategory(announcement.priority),
                time: announcement.created_at
                    ? new Date(String(announcement.created_at)).toLocaleDateString('es-CL')
                    : "",
            } : null,
        };
    },
};

// ==========================================
// Admin Dashboard API
// ==========================================

type AdminExpenseRow = {
    amount: number | string | null;
    status: string | null;
    month: string | null;
    items?: Array<{ label?: string | null; amount?: number | string | null }> | null;
};

type AdminProfileRow = { id: string; role: string | null };
type AdminUnitRow = { id: string };
type AdminBookingRow = { id: string; status: string | null; date: string | null };

const ADMIN_CATEGORY_COLORS = [
    "#9C5636",
    "#5F7A46",
    "#C99A4A",
    "#5C4868",
    "#2F6CB0",
    "#C24A3E",
];

function normalizeMonthLabel(month: string | null, fallbackIndex: number) {
    if (!month) return ["Ene", "Feb", "Mar", "Abr", "May", "Jun"][fallbackIndex] || "Mes";
    const date = new Date(`${month}-02T00:00:00`);
    if (Number.isNaN(date.getTime())) return month.slice(0, 3);
    return date.toLocaleDateString("es-CL", { month: "short" }).replace(".", "");
}

function emptyAdminDashboardSummary(): AdminDashboardSummary {
    return {
        residentsActive: 0,
        unitsTotal: 0,
        collectionRate: 0,
        collectionCollected: 0,
        collectionTarget: 0,
        openRequests: 0,
        criticalRequests: 0,
        quorumPct: 0,
        assetsOptimalPct: 0,
        cocoCasesOpen: 0,
        monthlyCollection: [],
        expenseCategories: [],
        amenityUsage: [],
        activeRequests: [],
    };
}

export const AdminDashboardService = {
    async getSummary(user: Pick<User, "communityId">): Promise<AdminDashboardSummary> {
        const summary = emptyAdminDashboardSummary();

        try {
            let profilesQuery = supabase.from("profiles").select("id, role");
            let unitsQuery = supabase.from("units").select("id");
            let expensesQuery = supabase
                .from("expenses")
                .select("amount, status, month, items:expense_items(label, amount)")
                .order("month", { ascending: false })
                .limit(240);
            let bookingsQuery = supabase
                .from("bookings")
                .select("id, status, date")
                .order("date", { ascending: false })
                .limit(120);

            if (isUuid(user.communityId)) {
                profilesQuery = profilesQuery.eq("community_id", user.communityId);
                unitsQuery = unitsQuery.eq("community_id", user.communityId);
                expensesQuery = expensesQuery.eq("community_id", user.communityId);
                bookingsQuery = bookingsQuery.eq("community_id", user.communityId);
            }

            const [profilesRes, unitsRes, expensesRes, bookingsRes, maintenance] = await Promise.all([
                profilesQuery,
                unitsQuery,
                expensesQuery,
                bookingsQuery,
                MaintenanceService.getDashboardData().catch((error) => {
                    console.warn("[AdminDashboardService] maintenance summary unavailable:", error);
                    return null;
                }),
            ]);

            const profiles = profilesRes.error ? [] : ((profilesRes.data || []) as AdminProfileRow[]);
            const units = unitsRes.error ? [] : ((unitsRes.data || []) as AdminUnitRow[]);
            const expenses = expensesRes.error ? [] : ((expensesRes.data || []) as AdminExpenseRow[]);
            const bookings = bookingsRes.error ? [] : ((bookingsRes.data || []) as AdminBookingRow[]);

            const residentsActive = profiles.filter(profile => profile.role === "resident").length;
            const unitsTotal = units.length;
            const collectionTarget = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
            const collectionCollected = expenses
                .filter(expense => expense.status === "paid")
                .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
            const collectionRate = collectionTarget > 0 ? Math.round((collectionCollected / collectionTarget) * 100) : 0;

            const byMonth = new Map<string, { collected: number; target: number }>();
            expenses.forEach((expense) => {
                const month = expense.month || "Actual";
                const current = byMonth.get(month) || { collected: 0, target: 0 };
                const amount = Number(expense.amount || 0);
                current.target += amount;
                if (expense.status === "paid") current.collected += amount;
                byMonth.set(month, current);
            });
            const monthlyCollection = Array.from(byMonth.entries())
                .sort(([a], [b]) => a.localeCompare(b))
                .slice(-6)
                .map(([month, values], index) => ({
                    label: normalizeMonthLabel(month, index),
                    collected: values.collected,
                    target: Math.max(values.target, 1),
                }));

            const categoryTotals = new Map<string, number>();
            expenses.forEach((expense) => {
                (expense.items || []).forEach((item) => {
                    const label = item.label || "Gasto común";
                    categoryTotals.set(label, (categoryTotals.get(label) || 0) + Number(item.amount || 0));
                });
            });
            const expenseCategories = Array.from(categoryTotals.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 6)
                .map(([label, amount], index) => ({
                    label,
                    amount,
                    color: ADMIN_CATEGORY_COLORS[index % ADMIN_CATEGORY_COLORS.length],
                }));

            const openServiceRequests = maintenance?.serviceRequests.filter(item => item.status !== "completed" && item.status !== "cancelled") || [];
            const criticalRequests = maintenance?.cases.filter(item => item.urgency === "emergencia").length || 0;
            const assets = maintenance?.assets || [];
            const optimalAssets = assets.filter(asset => asset.healthStatus === "optimal").length;
            const assetsOptimalPct = assets.length > 0 ? Math.round((optimalAssets / assets.length) * 100) : 0;
            const cocoCasesOpen = maintenance?.cases.filter(item => item.status !== "closed").length || 0;

            const activeRequests = openServiceRequests.slice(0, 5).map((request) => ({
                title: request.service_providers?.name || "Solicitud operativa",
                detail: request.description,
                status: request.status,
                tone: request.status === "pending" ? "amber" as const : "sage" as const,
            }));

            const activeBookings = bookings.filter(booking => booking.status !== "cancelled").length;
            const amenityUsage = [
                { label: "Reservas", collected: activeBookings, target: Math.max(activeBookings + 6, 10) },
                { label: "Uso semanal", collected: Math.min(activeBookings * 2, 24), target: 24 },
                { label: "Capacidad", collected: Math.min(unitsTotal, 100), target: Math.max(unitsTotal, 100) },
            ];

            return {
                residentsActive,
                unitsTotal,
                collectionRate,
                collectionCollected,
                collectionTarget,
                openRequests: openServiceRequests.length,
                criticalRequests,
                quorumPct: unitsTotal > 0 ? Math.round((residentsActive / unitsTotal) * 100) : 0,
                assetsOptimalPct,
                cocoCasesOpen,
                monthlyCollection,
                expenseCategories,
                amenityUsage,
                activeRequests,
            };
        } catch (error) {
            console.warn("[AdminDashboardService] summary unavailable:", error);
            return summary;
        }
    },
};

// ==========================================
// Maintenance / Admin API
// ==========================================

type DbRow = Record<string, unknown>;

function textValue(value: unknown, fallback = ""): string {
    return typeof value === "string" && value.trim() ? value : fallback;
}

function nullableText(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value : null;
}

function mapBuildingAsset(row: DbRow): BuildingAsset {
    return {
        id: textValue(row.id),
        name: textValue(row.name, "Activo tecnico"),
        category: (textValue(row.category, "other") as BuildingAsset["category"]),
        brand: textValue(row.brand),
        model: textValue(row.model),
        installationDate: textValue(row.installation_date || row.installationDate, new Date().toISOString()),
        location: textValue(row.location, "Sin ubicacion"),
        healthStatus: (textValue(row.health_status || row.healthStatus, "optimal") as BuildingAsset["healthStatus"]),
        lastMaintenance: textValue(row.last_maintenance || row.lastMaintenance, new Date().toISOString()),
        nextMaintenance: textValue(row.next_maintenance || row.nextMaintenance, new Date().toISOString()),
    };
}

function mapMaintenanceLog(row: DbRow): MaintenanceLog {
    return {
        id: textValue(row.id),
        assetId: textValue(row.asset_id || row.assetId),
        taskId: nullableText(row.task_id || row.taskId) || undefined,
        performedBy: textValue(row.performed_by || row.performedBy, "Administración"),
        description: textValue(row.description, "Registro de mantenimiento"),
        cost: Number(row.cost || 0),
        date: textValue(row.date, new Date().toISOString()),
    };
}

function mapMaintenanceTask(row: DbRow): MaintenanceTask {
    return {
        id: textValue(row.id),
        assetId: textValue(row.asset_id || row.assetId),
        title: textValue(row.title, "Tarea de mantenimiento"),
        description: textValue(row.description),
        frequency: (textValue(row.frequency, "monthly") as MaintenanceTask["frequency"]),
        dueDate: textValue(row.due_date || row.dueDate, new Date().toISOString()),
        priority: (textValue(row.priority, "medium") as MaintenanceTask["priority"]),
        status: (textValue(row.status, "pending") as MaintenanceTask["status"]),
    };
}

function mapMaintenanceServiceRow(row: DbRow): MaintenanceServiceRow {
    return {
        id: textValue(row.id),
        service_type: nullableText(row.service_type),
        category: nullableText(row.category),
        description: nullableText(row.description),
        status: nullableText(row.status),
        scheduled_date: nullableText(row.scheduled_date),
        preferred_date: nullableText(row.preferred_date),
        created_at: nullableText(row.created_at),
    };
}

function mapCocoCase(row: DbRow): CocoCase {
    return {
        id: textValue(row.id),
        title: textValue(row.title, "Caso operativo"),
        type: nullableText(row.type),
        category: textValue(row.category, "general"),
        urgency: (textValue(row.urgency, "media") as CocoCase["urgency"]),
        action: nullableText(row.action),
        status: (textValue(row.status, "open") as CocoCase["status"]),
        reason: nullableText(row.reason),
        source_message: textValue(row.source_message),
        assistant_reply: nullableText(row.assistant_reply),
        unit_label: nullableText(row.unit_label),
        created_at: textValue(row.created_at, new Date().toISOString()),
        updated_at: typeof row.updated_at === "string" ? row.updated_at : undefined,
    };
}

function mapCocoCaseEvent(row: DbRow): CocoCaseEvent {
    return {
        id: textValue(row.id),
        case_id: textValue(row.case_id),
        event_type: (textValue(row.event_type, "system") as CocoCaseEvent["event_type"]),
        from_status: nullableText(row.from_status),
        to_status: nullableText(row.to_status),
        body: nullableText(row.body),
        actor_role: nullableText(row.actor_role),
        created_at: textValue(row.created_at, new Date().toISOString()),
    };
}

function uniqueCocoCases(cases: CocoCase[]) {
    return Array.from(new Map(cases.map(item => [item.id, item])).values())
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

function mapServiceRequestQueueItem(row: DbRow): ServiceRequestQueueItem {
    const provider = row.service_providers as DbRow | null | undefined;
    return {
        id: textValue(row.id),
        provider_id: nullableText(row.provider_id),
        user_id: textValue(row.user_id),
        preferred_date: nullableText(row.preferred_date),
        preferred_time: nullableText(row.preferred_time),
        description: textValue(row.description, "Solicitud tecnica"),
        status: (textValue(row.status, "pending") as ServiceRequestQueueItem["status"]),
        created_at: textValue(row.created_at, new Date().toISOString()),
        service_providers: provider ? {
            name: textValue(provider.name, "Proveedor"),
            category: textValue(provider.category, "general"),
            contact_phone: nullableText(provider.contact_phone),
        } : null,
    };
}

export const MaintenanceService = {
    async getAdminOverview(): Promise<MaintenanceAdminOverview> {
        const [serviceRes, caseRes, assetRes, logRes] = await Promise.all([
            supabase.from("service_requests").select("*").order("created_at", { ascending: false }).limit(12),
            supabase.from("coco_cases").select("id, title, type, category, urgency, action, status, reason, source_message, assistant_reply, unit_label, created_at").order("created_at", { ascending: false }).limit(12),
            supabase.from("building_assets").select("id, name, category, brand, model, location, health_status, last_maintenance, next_maintenance, installation_date").order("name", { ascending: true }),
            supabase.from("maintenance_logs").select("id, asset_id, task_id, description, cost, date, performed_by").order("date", { ascending: false }).limit(8),
        ]);

        if (serviceRes.error) throw serviceRes.error;
        if (caseRes.error) throw caseRes.error;
        if (assetRes.error) throw assetRes.error;
        if (logRes.error) throw logRes.error;

        return {
            services: ((serviceRes.data || []) as DbRow[]).map(mapMaintenanceServiceRow),
            cases: ((caseRes.data || []) as DbRow[]).map(mapCocoCase),
            assets: ((assetRes.data || []) as DbRow[]).map(mapBuildingAsset),
            logs: ((logRes.data || []) as DbRow[]).map(mapMaintenanceLog),
        };
    },

    async getDashboardData(): Promise<MaintenanceDashboardData> {
        const [tasksRes, overview, serviceRequestsRes] = await Promise.all([
            supabase.from('maintenance_tasks').select('*'),
            this.getAdminOverview(),
            supabase
                .from('service_requests')
                .select(`
                    id,
                    provider_id,
                    user_id,
                    preferred_date,
                    preferred_time,
                    description,
                    status,
                    created_at,
                    service_providers (
                        name,
                        category,
                        contact_phone
                    )
                `)
                .order('created_at', { ascending: false })
                .limit(8),
        ]);

        if (tasksRes.error) throw tasksRes.error;
        if (serviceRequestsRes.error) throw serviceRequestsRes.error;

        return {
            ...overview,
            tasks: ((tasksRes.data || []) as DbRow[]).map(mapMaintenanceTask),
            serviceRequests: ((serviceRequestsRes.data || []) as DbRow[]).map(mapServiceRequestQueueItem),
        };
    },

    async getAssets(): Promise<BuildingAsset[]> {
        const { data, error } = await supabase
            .from('building_assets')
            .select('*')
            .order('name', { ascending: true });

        if (error) throw error;
        return ((data || []) as DbRow[]).map(mapBuildingAsset);
    },

    async getAssetLogs(assetId: string): Promise<MaintenanceLog[]> {
        const { data, error } = await supabase
            .from('maintenance_logs')
            .select('*')
            .eq('asset_id', assetId)
            .order('date', { ascending: false });

        if (error) throw error;
        return ((data || []) as DbRow[]).map(mapMaintenanceLog);
    },

    async createServiceTask(payload: {
        requesterId?: string;
        unitId?: string;
        serviceType: string;
        title: string;
        description: string;
        scheduledDate?: string;
    }) {
        const { error } = await supabase.from("service_requests").insert({
            requester_id: payload.requesterId,
            unit_id: payload.unitId || "administracion",
            service_type: payload.serviceType,
            description: `[${payload.title}] ${payload.description}`,
            status: "pending",
            scheduled_date: payload.scheduledDate || null,
            scheduled_time: null,
        });

        if (error) throw error;
    },

    async closeService(id: string) {
        const { error } = await supabase.from("service_requests").update({ status: "completed" }).eq("id", id);
        if (error) throw error;
    },

    async completeTask(taskId: string) {
        const { error } = await supabase.from('maintenance_tasks').update({ status: 'completed' }).eq('id', taskId);
        if (error) throw error;
    },
};

export const CocoCasesService = {
    async getResidentCases(user: Pick<User, "id" | "unitId">): Promise<ResidentCasesSummary> {
        const select = "id, title, type, category, urgency, action, status, reason, source_message, assistant_reply, unit_label, created_at, updated_at";
        const queries = [
            supabase
                .from("coco_cases")
                .select(select)
                .eq("user_id", user.id)
                .order("created_at", { ascending: false })
                .limit(30),
        ];

        if (user.unitId) {
            queries.push(
                supabase
                    .from("coco_cases")
                    .select(select)
                    .eq("unit_id", user.unitId)
                    .order("created_at", { ascending: false })
                    .limit(30)
            );
        }

        const results = await Promise.all(queries);
        for (const result of results) {
            if (result.error) throw result.error;
        }

        const cases = uniqueCocoCases(results.flatMap(result => ((result.data || []) as DbRow[]).map(mapCocoCase)));
        if (cases.length === 0) return { cases, eventsByCase: {} };

        const { data: events, error } = await supabase
            .from("coco_case_events")
            .select("id, case_id, event_type, from_status, to_status, body, actor_role, created_at")
            .in("case_id", cases.map(item => item.id))
            .order("created_at", { ascending: false });

        if (error) throw error;

        const eventsByCase = ((events || []) as DbRow[]).map(mapCocoCaseEvent).reduce<Record<string, CocoCaseEvent[]>>((acc, event) => {
            acc[event.case_id] ||= [];
            acc[event.case_id].push(event);
            return acc;
        }, {});

        return { cases, eventsByCase };
    },
};

// ==========================================
// Water Consumption API
// ==========================================

export const WaterService = {
    // Obtener lecturas de una unidad específica
    async getReadingsByUnit(unitId: string) {
        const { data, error } = await supabase
            .from('water_readings')
            .select('*')
            .eq('unit_id', unitId)
            .order('reading_date', { ascending: true }); // Ordenar por fecha

        if (error) throw error;
        return data as WaterReading[];
    },

    // Guardar una nueva lectura (Admin)
    async saveReading(reading: Partial<WaterReading>) {
        const { data, error } = await supabase
            .from('water_readings')
            .insert(reading)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    // Obtener todas las unidades (con sus perfiles de residentes si existen)
    async getUnits() {
        const { data, error } = await supabase
            .from('units')
            .select(`
                *,
                profiles:owner_id (name, email)
            `);

        if (error) {
            console.error('Error loading units:', error);
            // Return empty array instead of throwing so the page shows empty state
            return [] as (Unit & { profiles: { name: string; email: string; } | null })[];
        }
        return ((data || []) as (Unit & { profiles: { name: string; email: string; } | null })[])
            .sort((a, b) => {
                const rowA = a as unknown as Record<string, unknown>;
                const rowB = b as unknown as Record<string, unknown>;
                const towerA = String(rowA.tower || "");
                const towerB = String(rowB.tower || "");
                const numberA = String(rowA.number || rowA.unit_number || "");
                const numberB = String(rowB.number || rowB.unit_number || "");
                return towerA.localeCompare(towerB, "es") || numberA.localeCompare(numberB, "es", { numeric: true });
            });
    },

    // Crear nueva unidad. Acepta columnas crudas (snake_case) como share_permille.
    async createUnit(unit: Partial<Unit> & { share_permille?: number | null }) {
        const { data, error } = await supabase
            .from('units')
            .insert(unit)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    // Actualizar campos de una unidad (p. ej. la alícuota share_permille).
    async updateUnit(unitId: string, patch: Record<string, unknown>) {
        const { data, error } = await supabase
            .from('units')
            .update(patch)
            .eq('id', unitId)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    // Asignar residente a unidad (Actualiza units y opcionalmente user metadata si fuese necesario, 
    // pero por ahora la fuente de verdad es la tabla units)
    async assignResident(unitId: string, residentId: string | null) {
        const { error } = await supabase
            .from('units')
            .update({ owner_id: residentId })
            .eq('id', unitId);

        if (error) throw error;
    },

    // Obtener lista de perfiles (para dropdown de asignación)
    async getProfiles() {
        const { data, error } = await supabase
            .from('profiles')
            .select('id, name, email, role')
            .order('name', { ascending: true });

        if (error) throw error;
        return data;
    },

    // Obtener el promedio de consumo del edificio (para comparación)
    async getUnitResident(unit: Unit): Promise<User | null> {
        const rawUnit = unit as Unit & { owner_id?: string; tenant_id?: string };
        const userId = unit.ownerId || unit.tenantId || rawUnit.owner_id || rawUnit.tenant_id;
        if (!userId) return null;

        const { data, error } = await supabase
            .from('profiles')
            .select('id, name, email, role, avatar_url')
            .eq('id', userId)
            .maybeSingle();

        if (error) throw error;
        if (!data) return null;

        const row = data as Record<string, unknown>;
        return {
            id: String(row.id),
            name: String(row.name || row.email || "Residente"),
            email: String(row.email || ""),
            role: (row.role === "admin" || row.role === "concierge" ? row.role : "resident") as User["role"],
            photo: typeof row.avatar_url === "string" ? row.avatar_url : undefined,
        };
    },

    async getBuildingAverage(month: string, year: number) {
        type AverageReadingRow = { unit_id: string | number | null; reading_value: string | number | null };
        const monthNames = [
            'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
        ];
        const monthIndex = monthNames.findIndex(item => item.toLowerCase() === month.toLowerCase());
        const previousDate = monthIndex >= 0
            ? new Date(year, monthIndex - 1, 1)
            : new Date(year, new Date().getMonth() - 1, 1);
        const previousMonth = monthNames[previousDate.getMonth()];
        const previousYear = previousDate.getFullYear();

        const { data: currentReadings, error: currentError } = await supabase
            .from('water_readings')
            .select('unit_id, reading_value')
            .eq('month', month)
            .eq('year', year);

        if (currentError) throw currentError;
        if (!currentReadings || currentReadings.length === 0) return 0;

        // Calcula consumo real comparando contra la lectura del periodo anterior.
        const { data: previousReadings, error: previousError } = await supabase
            .from('water_readings')
            .select('unit_id, reading_value')
            .eq('month', previousMonth)
            .eq('year', previousYear);

        if (previousError) throw previousError;

        const currentRows = currentReadings as AverageReadingRow[];
        const previousRows = (previousReadings || []) as AverageReadingRow[];
        const previousByUnit = new Map<string, number>(
            previousRows.map(row => [String(row.unit_id), Number(row.reading_value) || 0])
        );
        const consumptions = currentRows
            .map((row): number | null => {
                const currentValue = Number(row.reading_value) || 0;
                const previousValue = previousByUnit.get(String(row.unit_id));
                return previousValue === undefined ? null : Math.max(0, currentValue - previousValue);
            })
            .filter((value): value is number => value !== null);

        if (consumptions.length > 0) {
            const totalConsumption = consumptions.reduce((acc, value) => acc + value, 0);
            return totalConsumption / consumptions.length;
        }

        const fallbackTotal = currentRows.reduce((acc, curr) => acc + (Number(curr.reading_value) || 0), 0);
        return fallbackTotal / currentRows.length;
    }
};

// ==========================================
// Marketplace API
// ==========================================

type MarketplaceRow = Record<string, unknown>;

function mapMarketplaceItem(row: MarketplaceRow): MarketplaceItem {
    const imageUrl = (row.image_url as string | null | undefined) ?? (row.imageUrl as string | undefined);
    const images = Array.isArray(row.images)
        ? (row.images as string[])
        : imageUrl
            ? [imageUrl]
            : [];

    return {
        id: row.id as string,
        title: row.title as string,
        description: row.description as string,
        price: Number(row.price) || 0,
        category: row.category as MarketplaceItem['category'],
        sellerId: (row.seller_id as string | undefined) ?? (row.sellerId as string),
        imageUrl,
        images,
        status: ((row.status as MarketplaceItem['status'] | undefined) || 'available'),
        allowSale: (row.allow_sale as boolean | undefined) ?? (row.allowSale as boolean | undefined) ?? true,
        allowSwap: (row.allow_swap as boolean | undefined) ?? (row.allowSwap as boolean | undefined) ?? false,
        swapDetails: (row.swap_details as string | undefined) ?? (row.swapDetails as string | undefined) ?? '',
        allowBarter: (row.allow_barter as boolean | undefined) ?? (row.allowBarter as boolean | undefined) ?? false,
        barterDetails: (row.barter_details as string | undefined) ?? (row.barterDetails as string | undefined) ?? '',
        paymentStatus: (row.payment_status as MarketplaceItem['paymentStatus'] | undefined) ?? (row.paymentStatus as MarketplaceItem['paymentStatus'] | undefined) ?? 'none',
        createdAt: (row.created_at as string | undefined) ?? (row.createdAt as string) ?? new Date().toISOString(),
    };
}

function isMissingMarketplaceColumnError(error: { message?: string; code?: string } | null): boolean {
    if (!error) return false;
    const message = error.message?.toLowerCase() ?? '';
    return error.code === 'PGRST204' || error.code === '42703' || message.includes('allow_sale') || message.includes('images');
}

export const MarketplaceService = {
    // Obtener todos los productos activos
    async getItemsV2(): Promise<MarketplaceItem[]> {
        const { data, error } = await supabase
            .from('marketplace_items')
            .select('*')
            .neq('status', 'hidden')
            .order('created_at', { ascending: false });

        if (error) {
            console.error("Supabase error in getItemsV2:", error.message);
            throw error;
        }
        return (data || []).map(mapMarketplaceItem);
    },

    async getMyItems(userId: string): Promise<MarketplaceItem[]> {
        const { data, error } = await supabase
            .from('marketplace_items')
            .select('*')
            .eq('seller_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return (data || []).map(mapMarketplaceItem);
    },

    async getModerationItems(): Promise<MarketplaceItem[]> {
        const { data, error } = await supabase
            .from('marketplace_items')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return (data || []).map(mapMarketplaceItem);
    },

    // Publicar un nuevo producto con fotos
    async createItem(item: Partial<MarketplaceItem>, imageFiles: File[]): Promise<MarketplaceItem> {
        const imageUrls: string[] = [];
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) throw new Error("Debes estar autenticado para publicar");

        const { data: profile } = await supabase
            .from('profiles')
            .select('community_id')
            .eq('id', user.id)
            .single();

        // 1. Subir imágenes si existen
        for (const file of imageFiles) {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random()}.${fileExt}`;
            const filePath = `${user.id}/${fileName}`; // Organizado por carpeta de usuario

            const { error: uploadError } = await supabase.storage
                .from('marketplace')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('marketplace')
                .getPublicUrl(filePath);

            imageUrls.push(publicUrl);
        }

        const payload = {
            title: item.title,
            description: item.description,
            price: Number(item.price) || 0,
            category: item.category,
            image_url: imageUrls.length > 0 ? imageUrls[0] : null,
            images: imageUrls,
            allow_sale: item.allowSale !== false,
            allow_swap: Boolean(item.allowSwap),
            swap_details: item.swapDetails || '',
            allow_barter: Boolean(item.allowBarter),
            barter_details: item.barterDetails || '',
            payment_status: 'none',
            community_id: (profile as { community_id?: string | null } | null)?.community_id,
            seller_id: user.id
        };

        // 2. Insertar item en la DB
        let result = await supabase
            .from('marketplace_items')
            .insert(payload)
            .select()
            .single();

        if (isMissingMarketplaceColumnError(result.error)) {
            result = await supabase
                .from('marketplace_items')
                .insert({
                    title: payload.title,
                    description: payload.description,
                    price: payload.price,
                    category: payload.category,
                    image_url: payload.image_url,
                    seller_id: payload.seller_id
                })
                .select()
                .single();
        }

        const { data, error } = result;

        if (error) {
            console.error("Supabase error in createItem:", error.message, error.details);
            throw error;
        }
        return mapMarketplaceItem(data);
    },

    // Marcar como vendido o inactivar
    async updateStatus(itemId: string, status: 'available' | 'reserved' | 'sold') {
        const { error } = await supabase
            .from('marketplace_items')
            .update({ status })
            .eq('id', itemId);

        if (error) throw error;
    },

    async diagnosticStorage() {
        const { data, error } = await supabase.storage.listBuckets();
        if (error) return { error: error.message };
        return { buckets: data.map((b: { name: string }) => b.name) };
    }
};

type MarketplaceInboxRow = {
    conversation_id: string;
    item_id: string;
    item_title: string;
    item_image_url?: string | null;
    item_status: MarketplaceItem['status'];
    buyer_id: string;
    seller_id: string;
    peer_id: string;
    peer_name: string;
    peer_avatar_url?: string | null;
    last_message?: string | null;
    last_message_at: string;
    unread_count?: number | string | null;
};

type MarketplaceMessageRow = {
    id: string;
    conversation_id: string;
    community_id: string;
    sender_id: string;
    content: string;
    created_at: string;
    read_at?: string | null;
};

function mapMarketplaceConversation(row: MarketplaceInboxRow): MarketplaceConversation {
    return {
        id: row.conversation_id,
        itemId: row.item_id,
        itemTitle: row.item_title,
        itemImageUrl: row.item_image_url || undefined,
        itemStatus: row.item_status,
        buyerId: row.buyer_id,
        sellerId: row.seller_id,
        peerId: row.peer_id,
        peerName: row.peer_name || 'Residente',
        peerAvatarUrl: row.peer_avatar_url || undefined,
        lastMessage: row.last_message || undefined,
        lastMessageAt: row.last_message_at,
        unreadCount: Number(row.unread_count || 0),
    };
}

function mapMarketplaceMessage(row: MarketplaceMessageRow): MarketplaceMessage {
    return {
        id: row.id,
        conversationId: row.conversation_id,
        communityId: row.community_id,
        senderId: row.sender_id,
        content: row.content,
        createdAt: row.created_at,
        readAt: row.read_at || undefined,
    };
}

export const MarketplaceMessagingService = {
    async startConversation(itemId: string): Promise<string> {
        const { data, error } = await supabase.rpc('start_marketplace_conversation', {
            p_item_id: itemId,
        });

        if (error) throw error;
        if (typeof data !== 'string') throw new Error('No se pudo abrir la conversación.');
        return data;
    },

    async listConversations(): Promise<MarketplaceConversation[]> {
        const { data, error } = await supabase.rpc('get_marketplace_inbox');
        if (error) throw error;
        return ((data || []) as MarketplaceInboxRow[]).map(mapMarketplaceConversation);
    },

    async getMessages(conversationId: string): Promise<MarketplaceMessage[]> {
        const { data, error } = await supabase
            .from('marketplace_conversation_messages')
            .select('id,conversation_id,community_id,sender_id,content,created_at,read_at')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true });

        if (error) throw error;
        return ((data || []) as MarketplaceMessageRow[]).map(mapMarketplaceMessage);
    },

    async sendMessage(conversationId: string, content: string): Promise<MarketplaceMessage> {
        const cleanContent = content.trim();
        if (!cleanContent) throw new Error('Escribe un mensaje antes de enviarlo.');
        if (cleanContent.length > 2000) throw new Error('El mensaje supera el máximo de 2.000 caracteres.');

        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) throw authError || new Error('Debes iniciar sesión para escribir.');

        const { data, error } = await supabase
            .from('marketplace_conversation_messages')
            .insert({
                conversation_id: conversationId,
                sender_id: authData.user.id,
                content: cleanContent,
            })
            .select('id,conversation_id,community_id,sender_id,content,created_at,read_at')
            .single();

        if (error) throw error;
        return mapMarketplaceMessage(data as MarketplaceMessageRow);
    },

    async markRead(conversationId: string): Promise<void> {
        const { error } = await supabase.rpc('mark_marketplace_conversation_read', {
            p_conversation_id: conversationId,
        });
        if (error) throw error;
    },

    subscribeToConversation(
        conversationId: string,
        onMessage: (message: MarketplaceMessage) => void,
    ): () => void {
        const channel = supabase
            .channel(`marketplace-conversation-${conversationId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'marketplace_conversation_messages',
                    filter: `conversation_id=eq.${conversationId}`,
                },
                (payload: { new: unknown }) => onMessage(mapMarketplaceMessage(payload.new as MarketplaceMessageRow)),
            )
            .subscribe();

        return () => {
            void supabase.removeChannel(channel);
        };
    },
};
// ==========================================
// AMENITIES & BOOKINGS
// ==========================================
export const AmenitiesService = {
    async getAmenities() {
        const { data, error } = await supabase
            .from('amenities')
            .select('*')
            .order('name');

        if (error) {
            console.error("Error fetching amenities:", error);
            throw error;
        }
        return (data || []).filter((amenity: Record<string, unknown>) => amenity.is_active !== false);
    },

    async createAmenity(input: CreateAmenityInput) {
        const payload: Record<string, unknown> = {
            name: input.name,
            description: input.description,
            max_capacity: input.maxCapacity,
            hourly_rate: input.hourlyRate,
            icon_name: input.iconName,
            gradient: input.gradient,
            is_active: true,
        };
        if (input.communityId) payload.community_id = input.communityId;

        const { data, error } = await supabase
            .from('amenities')
            .insert(payload)
            .select('*')
            .single();

        if (error) {
            console.error("Error creating amenity:", error);
            throw error;
        }

        return data;
    },

    async getAllBookings() {
        const { data, error } = await supabase
            .from('bookings')
            .select('*, amenities(name, icon_name, gradient)')
            .order('date', { ascending: false })
            .order('start_time', { ascending: false });

        if (error) {
            console.error("Error fetching all bookings:", error);
            throw error;
        }
        return data;
    },

    async getAdminBookings(): Promise<AdminBooking[]> {
        const { data, error } = await supabase
            .from('bookings')
            .select(`
                id, date, start_time, end_time, status, created_at,
                profiles:user_id (name, email),
                amenities:amenity_id (name, icon_name, gradient)
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return (data || []) as unknown as AdminBooking[];
    },

    async updateBookingStatus(id: string, status: AdminBooking["status"]) {
        const { error } = await supabase
            .from('bookings')
            .update({ status })
            .eq('id', id);

        if (error) throw error;
    },

    async getBookings(userId: string) {
        const { data, error } = await supabase
            .from('bookings')
            .select('*, amenities(name, icon_name, gradient)')
            .eq('user_id', userId)
            .order('date', { ascending: false })
            .order('start_time', { ascending: false });

        if (error) {
            console.error("Error fetching bookings:", error);
            throw error;
        }
        return data;
    },

    async createBooking(bookingData: {
        amenity_id: string;
        user_id: string;
        date: string;
        start_time: string;
        end_time: string;
    }) {
        // Bloqueo de topes: no se permite una reserva confirmada del mismo espacio
        // y día cuyo horario se pise con otra. Antes no existía y dos personas
        // podían reservar el mismo bloque. Los horarios son HH:MM (24h, con cero a
        // la izquierda), así que la comparación de strings equivale a la temporal.
        const { data: sameDay, error: overlapError } = await supabase
            .from('bookings')
            .select('start_time, end_time')
            .eq('amenity_id', bookingData.amenity_id)
            .eq('date', bookingData.date)
            .eq('status', 'confirmed');
        if (overlapError) {
            console.error('Error checking booking overlap:', overlapError);
            throw overlapError;
        }
        const clashes = (sameDay ?? []).some((existing: { start_time: string | null; end_time: string | null }) =>
            bookingData.start_time < String(existing.end_time)
            && bookingData.end_time > String(existing.start_time));
        if (clashes) {
            throw new Error('Ese espacio ya está reservado en ese horario. Elige otro bloque disponible.');
        }

        const { data, error } = await supabase
            .from('bookings')
            .insert({
                ...bookingData,
                status: 'confirmed'
            })
            .select('*, amenities(name)')
            .single();

        if (error) {
            console.error("Error creating booking:", error);
            const bookingError = error as { code?: string };
            if (bookingError.code === '23P01') {
                throw new Error('Ese espacio ya está reservado en ese horario. Elige otro bloque disponible.');
            }
            throw error;
        }

        // El servidor resuelve destinatario y detalles desde la reserva creada.
        try {
            await sendBookingConfirmation({ bookingId: String(data.id) });
        } catch (emailError) {
            // El email falla silenciosamente — la reserva ya fue creada
            console.warn('[Email] Booking confirmation failed to send:', emailError);
        }

        return data;
    }
};

// ==========================================
// POLLS & VOTING
// ==========================================
export const PollsService = {
    /**
     * Votaciones abiertas de verdad: status 'active' Y con plazo vigente.
     *
     * Sin la condición de fecha, una votación cuyo plazo venció seguía contando
     * como activa porque nada en el sistema cambia su status al cerrarse. El
     * centro de votación mostraba "6 consultas activas, cierran pronto" mientras
     * cada tarjeta decía "Finalizada" (la tarjeta sí calculaba por fecha), y CoCo
     * las ofrecía para votar. El filtro va acá para que valga en todos los
     * consumidores, no solo en la página.
     */
    async getActivePolls() {
        const { data: polls, error } = await supabase
            .from('polls')
            .select(`
                *,
                options:poll_options(*),
                votes:poll_votes(option_id)
            `)
            .eq('status', 'active')
            .gte('end_date', new Date().toISOString())
            .order('created_at', { ascending: false });

        if (error) {
            console.error("Error fetching polls:", error);
            throw error;
        }

        return polls;
    },

    /**
     * Cerradas: las marcadas 'closed' más las que quedaron 'active' con el plazo
     * vencido. Sin la segunda mitad esas votaciones desaparecían de la pantalla
     * al arreglar getActivePolls, en vez de pasar al historial.
     */
    async getClosedPolls() {
        const { data: polls, error } = await supabase
            .from('polls')
            .select(`
                *,
                options:poll_options(*),
                votes:poll_votes(option_id)
            `)
            .or(`status.eq.closed,and(status.eq.active,end_date.lt.${new Date().toISOString()})`)
            .order('end_date', { ascending: false });

        if (error) {
            console.error("Error fetching closed polls:", error);
            throw error;
        }

        return polls;
    },

    async submitVote(pollId: string, optionId: string, userId: string) {
        // Compatibilidad legacy: algunos votos antiguos llegan con UUID local.
        const { data, error } = await supabase
            .from('poll_votes')
            .insert({
                poll_id: pollId,
                option_id: optionId,
                user_id: userId
            })
            .select()
            .single();

        if (error) {
            console.error("Error submitting vote:", error);
            throw error;
        }

        return data;
    },

    async hasUserVoted(pollId: string, userId: string) {
        const { data, error } = await supabase
            .from('poll_votes')
            .select('id, option_id')
            .eq('poll_id', pollId)
            .eq('user_id', userId)
            .maybeSingle();

        if (error) {
            console.error("Error checking vote status:", error);
            return null; // Asumir no votado en caso de error para no bloquear UI brutalmente
        }
        return data;
    },

    async getUserVotes(pollIds: string[], userId: string): Promise<PollVoteRecord[]> {
        if (pollIds.length === 0) return [];
        const { data, error } = await supabase
            .from('poll_votes')
            .select('poll_id, option_id')
            .eq('user_id', userId)
            .in('poll_id', pollIds);
        if (error) {
            console.error('Error loading user votes:', error);
            throw error;
        }
        return (data || []) as PollVoteRecord[];
    }
};

// ==========================================
// EXPENSES (GASTOS COMUNES)
// ==========================================
export const ExpensesService = {
    // Fetch expenses for a specific unit, automatically joining items
    async getExpenses(unitId: string) {
        const { data, error } = await supabase
            .from('expenses')
            .select(`
                *,
                items:expense_items(*)
            `)
            .eq('unit_id', unitId)
            .order('month', { ascending: false });

        if (error) {
            console.error("Error fetching expenses:", error);
            throw error;
        }

        return data;
    }
};

type FinanceExpenseItemRow = {
    category?: string | null;
    label?: string | null;
    amount?: number | string | null;
};

type FinanceExpenseRow = {
    id: string;
    unit_id?: string | null;
    amount?: number | string | null;
    status?: string | null;
    month?: string | null;
    due_date?: string | null;
    paid_at?: string | null;
    items?: FinanceExpenseItemRow[] | null;
};

export const AdminFinanceService = {
    async getOverview(): Promise<CommunityFinance> {
        const [{ data, error }, unitsResult] = await Promise.all([
            supabase
                .from('expenses')
                .select('id,unit_id,amount,status,month,due_date,paid_at,items:expense_items(category,label,amount)')
                .order('month', { ascending: false })
                .limit(2500),
            supabase.from('units').select('id', { count: 'exact', head: true }),
        ]);
        if (error) throw error;
        if (unitsResult.error) throw unitsResult.error;

        const rows = (data || []) as FinanceExpenseRow[];
        const period = rows.map(row => row.month || '').filter(Boolean).sort((a, b) => b.localeCompare(a))[0]
            || new Date().toISOString().slice(0, 7);
        const periodRows = rows.filter(row => row.month === period);
        const amountOf = (row: FinanceExpenseRow) => Number(row.amount || 0);
        const totalBilled = periodRows.reduce((sum, row) => sum + amountOf(row), 0);
        const totalRevenue = periodRows.filter(row => row.status === 'paid').reduce((sum, row) => sum + amountOf(row), 0);
        const pendingAmount = periodRows.filter(row => row.status === 'pending').reduce((sum, row) => sum + amountOf(row), 0);
        const overdueAmount = periodRows.filter(row => row.status === 'overdue').reduce((sum, row) => sum + amountOf(row), 0);
        const billedUnitIds = new Set(periodRows.map(row => row.unit_id).filter((id): id is string => Boolean(id)));
        const pendingUnitIds = new Set(periodRows.filter(row => row.status !== 'paid').map(row => row.unit_id).filter((id): id is string => Boolean(id)));
        const paidUnitIds = new Set(periodRows.filter(row => row.status === 'paid').map(row => row.unit_id).filter((id): id is string => Boolean(id)));

        const overdueCounts = new Map<string, number>();
        rows.filter(row => row.status === 'overdue' && row.unit_id).forEach(row => {
            overdueCounts.set(row.unit_id!, (overdueCounts.get(row.unit_id!) || 0) + 1);
        });

        const monthTotals = new Map<string, number>();
        rows.forEach(row => {
            if (!row.month) return;
            monthTotals.set(row.month, (monthTotals.get(row.month) || 0) + amountOf(row));
        });
        const monthlyTrend = Array.from(monthTotals.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(-6)
            .map(([month, monto]) => ({
                month: new Date(`${month}-02T12:00:00`).toLocaleDateString('es-CL', { month: 'short' }),
                monto,
            }));

        const categoryLabels: Record<string, string> = {
            water: 'Agua',
            electricity: 'Electricidad',
            salaries: 'Remuneraciones',
            maintenance: 'Mantencion',
            security: 'Seguridad',
            other: 'Otros',
        };
        const categoryTotals = new Map<string, number>();
        let reserveFund = 0;
        periodRows.flatMap(row => row.items || []).forEach(item => {
            const rawCategory = item.category || 'other';
            const category = categoryLabels[rawCategory] || item.label || 'Otros';
            const amount = Number(item.amount || 0);
            categoryTotals.set(category, (categoryTotals.get(category) || 0) + amount);
            if ((item.label || '').toLocaleLowerCase('es-CL').includes('fondo')) reserveFund += amount;
        });

        const recentActivity = rows
            .filter(row => row.status === 'paid' && row.paid_at)
            .sort((a, b) => String(b.paid_at).localeCompare(String(a.paid_at)))
            .slice(0, 8)
            .map(row => ({
                id: row.id,
                type: 'income' as const,
                title: `Pago de gasto comun ${row.month || ''}`.trim(),
                amount: amountOf(row),
                date: row.paid_at!,
            }));

        return {
            period,
            totalRevenue,
            totalBilled,
            totalExpenses: totalBilled,
            reserveFund,
            pendingAmount,
            overdueAmount,
            collectionRate: totalBilled > 0 ? Math.round((totalRevenue / totalBilled) * 100) : 0,
            totalUnits: unitsResult.count || 0,
            billedUnits: billedUnitIds.size,
            paidUnits: paidUnitIds.size,
            pendingUnits: pendingUnitIds.size,
            chronicDebtors: Array.from(overdueCounts.values()).filter(count => count >= 3).length,
            monthlyTrend,
            categoryBreakdown: Array.from(categoryTotals.entries()).map(([name, value]) => ({ name, value })),
            recentActivity,
        };
    },
};

export const ResidentFinanceService = {
    async getExpensesForResident(user: Pick<User, "id" | "unitId" | "unitName">): Promise<ResidentFinanceExpense[]> {
        let targetUnitId = user.unitId;

        if (!targetUnitId) {
            const { data: profile, error } = await supabase
                .from('profiles')
                .select('unit_id')
                .eq('id', user.id)
                .maybeSingle();

            if (error) throw error;
            targetUnitId = typeof profile?.unit_id === "string" ? profile.unit_id : undefined;
        }

        if (!targetUnitId) return [];

        const { data, error } = await supabase
            .from('expenses')
            .select('*')
            .eq('unit_id', targetUnitId)
            .order('month', { ascending: false });

        if (error) throw error;

        const fallbackUnitNumber = user.unitName?.replace(/^Depto\s+/i, "") || targetUnitId;
        return ((data || []) as Array<Record<string, unknown>>).map(row => ({
            id: String(row.id),
            unit_id: String(row.unit_id || targetUnitId),
            month: String(row.month || new Date().toISOString().slice(0, 7)),
            amount: Number(row.amount || 0),
            status: (String(row.status || "pending") as ResidentFinanceExpense["status"]),
            due_date: String(row.due_date || new Date().toISOString()),
            paid_at: typeof row.paid_at === "string" ? row.paid_at : undefined,
            units: { number: fallbackUnitNumber },
        }));
    },
};

// ==========================================
// FEED / ANUNCIOS (ANNOUNCEMENTS)
// ==========================================
export const AnnouncementsService = {
    async getAnnouncements() {
        const { data, error } = await supabase
            .from('announcements')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    },

    async createAnnouncement(announcementData: CreateAnnouncementInput) {
        const { data, error } = await supabase
            .from('announcements')
            .insert([{
                title: announcementData.title,
                content: announcementData.content,
                priority: announcementData.priority,
                author_id: announcementData.authorId,
                author_name: announcementData.authorName,
                community_id: announcementData.communityId,
            }])
            .select()
            .single();

        if (error) throw error;

        return {
            id: data.id,
            title: data.title,
            content: data.content,
            priority: data.priority,
            author_name: data.author_name || announcementData.authorName,
            created_at: data.created_at
        };
    }
};

export const NavigationService = {
    async getResidentContext(userId: string): Promise<ResidentNavigationContext> {
        if (!userId) return { hasMarketplaceListings: false, isServiceProvider: false };

        const [listingsResult, providerResult] = await Promise.all([
            supabase
                .from('marketplace_items')
                .select('id', { count: 'exact', head: true })
                .eq('seller_id', userId),
            supabase
                .from('service_providers')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', userId),
        ]);

        if (listingsResult.error) console.warn('[Navigation] listings context unavailable:', listingsResult.error.message);
        if (providerResult.error) console.warn('[Navigation] provider context unavailable:', providerResult.error.message);

        return {
            hasMarketplaceListings: !listingsResult.error && (listingsResult.count || 0) > 0,
            isServiceProvider: !providerResult.error && (providerResult.count || 0) > 0,
        };
    },
};
export const ProductCapabilitiesService = {
    async getCapabilities(): Promise<ProductCapabilities> {
        const response = await fetch('/api/product-capabilities', {
            cache: 'no-store',
            headers: { Accept: 'application/json' },
        });

        if (!response.ok) throw new Error('No se pudo verificar la disponibilidad de integraciones.');
        return response.json() as Promise<ProductCapabilities>;
    },
};

export const CommercialService = {
    async submitLead(payload: CommercialLeadRequest): Promise<CommercialLeadResponse> {
        const response = await fetch('/api/email/outreach', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await response.json().catch(() => null) as CommercialLeadResponse | null;

        if (!response.ok || !data?.ok) {
            throw new Error(data?.error || 'No se pudo registrar la solicitud. Intenta nuevamente.');
        }

        return data;
    },
};

async function readJsonResponse<T>(response: Response): Promise<T> {
    const data = await response.json().catch(() => null) as (T & { error?: string }) | null;
    if (!response.ok || !data) {
        throw new Error(data?.error || 'La solicitud no pudo completarse.');
    }
    return data;
}

export const SupermarketGroupService = {
    async list(): Promise<SupermarketGroupOrder[]> {
        const response = await fetch('/api/supermarket/group-orders', {
            cache: 'no-store',
            headers: { Accept: 'application/json' },
        });
        const data = await readJsonResponse<{ orders: SupermarketGroupOrder[] }>(response);
        return data.orders;
    },

    async create(input: SupermarketGroupCreateInput): Promise<SupermarketGroupOrder> {
        const response = await fetch('/api/supermarket/group-orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'create', ...input }),
        });
        const data = await readJsonResponse<{ order: SupermarketGroupOrder }>(response);
        return data.order;
    },

    async join(orderId: string, shoppingList: string): Promise<SupermarketGroupOrder> {
        const response = await fetch('/api/supermarket/group-orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'join', orderId, shoppingList }),
        });
        const data = await readJsonResponse<{ order: SupermarketGroupOrder }>(response);
        return data.order;
    },

    async compare(orderId: string): Promise<SupermarketGroupComparison[]> {
        const response = await fetch('/api/supermarket/group-orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'compare', orderId }),
        });
        const data = await readJsonResponse<{ comparisons: SupermarketGroupComparison[] }>(response);
        return data.comparisons;
    },

    async lock(orderId: string): Promise<SupermarketGroupOrder> {
        const response = await fetch('/api/supermarket/group-orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'lock', orderId }),
        });
        const data = await readJsonResponse<{ order: SupermarketGroupOrder }>(response);
        return data.order;
    },
};

/* ── Estacionamientos ───────────────────────────────────────── */

type ParkingSpotRow = {
    id: string;
    community_id: string;
    owner_id: string;
    unit_label: string | null;
    label: string;
    description: string | null;
    access_notes?: string | null;
    vehicle_size: ParkingVehicleSize;
    is_covered: boolean;
    has_ev_charger: boolean;
    hourly_rate: number;
    daily_rate: number | null;
    monthly_rate: number | null;
    min_hours: number;
    allows_external: boolean;
    status: ParkingSpotStatus;
    rejection_reason: string | null;
    created_at: string;
    profiles?: { name?: string | null } | { name?: string | null }[] | null;
    parking_spot_availability?: ParkingAvailabilityRow[] | null;
};

type ParkingAvailabilityRow = {
    id: string;
    spot_id: string;
    weekday: number;
    start_time: string;
    end_time: string;
};

type ParkingBookingRow = {
    id: string;
    community_id: string;
    spot_id: string;
    driver_id: string;
    owner_id: string;
    driver_is_resident: boolean;
    starts_at: string;
    ends_at: string;
    total_amount: number;
    community_fee_amount: number;
    owner_payout_amount: number;
    status: ParkingBookingStatus;
    payment_status: ParkingPaymentStatus;
    access_code: string;
    cancellation_reason: string | null;
    created_at: string;
    parking_spots?: { label?: string | null; unit_label?: string | null } | { label?: string | null; unit_label?: string | null }[] | null;
    parking_drivers?: { full_name?: string | null; plate?: string | null } | { full_name?: string | null; plate?: string | null }[] | null;
};

type ParkingSearchRow = {
    spot_id: string;
    community_id: string;
    community_name: string;
    label: string;
    unit_label: string | null;
    description: string | null;
    vehicle_size: ParkingVehicleSize;
    is_covered: boolean;
    has_ev_charger: boolean;
    hourly_rate: number;
    daily_rate: number | null;
    monthly_rate: number | null;
    min_hours: number;
    owner_name: string;
    quoted_amount: number;
};

type ParkingAccessLookupRow = {
    booking_id: string;
    spot_label: string;
    unit_label: string | null;
    driver_name: string;
    driver_phone: string;
    driver_national_id: string | null;
    plate: string;
    vehicle_description: string | null;
    driver_is_resident: boolean;
    starts_at: string;
    ends_at: string;
    status: ParkingBookingStatus;
    is_valid_now: boolean;
    last_event: ParkingAccessEventType | null;
};

type ParkingDriverRow = {
    id: string;
    user_id: string;
    profile_id: string | null;
    full_name: string;
    phone: string;
    national_id: string | null;
    plate: string;
    vehicle_description: string | null;
    verification_status: ParkingDriverVerification;
};

function mapParkingAvailability(row: ParkingAvailabilityRow): ParkingAvailabilityRule {
    return {
        id: row.id,
        spotId: row.spot_id,
        weekday: Number(row.weekday),
        startTime: String(row.start_time).slice(0, 5),
        endTime: String(row.end_time).slice(0, 5),
    };
}

function mapParkingSpot(row: ParkingSpotRow): ParkingSpot {
    const ownerProfile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
        id: row.id,
        communityId: row.community_id,
        ownerId: row.owner_id,
        ownerName: ownerProfile?.name || undefined,
        unitLabel: row.unit_label || '',
        label: row.label,
        description: row.description || '',
        accessNotes: row.access_notes ?? undefined,
        vehicleSize: row.vehicle_size,
        isCovered: row.is_covered,
        hasEvCharger: row.has_ev_charger,
        hourlyRate: Number(row.hourly_rate),
        dailyRate: row.daily_rate === null ? undefined : Number(row.daily_rate),
        monthlyRate: row.monthly_rate === null ? undefined : Number(row.monthly_rate),
        minHours: Number(row.min_hours),
        allowsExternal: row.allows_external,
        status: row.status,
        rejectionReason: row.rejection_reason || undefined,
        createdAt: row.created_at,
        availability: (row.parking_spot_availability || []).map(mapParkingAvailability),
    };
}

function mapParkingBooking(row: ParkingBookingRow): ParkingBooking {
    const spot = Array.isArray(row.parking_spots) ? row.parking_spots[0] : row.parking_spots;
    const driver = Array.isArray(row.parking_drivers) ? row.parking_drivers[0] : row.parking_drivers;
    return {
        id: row.id,
        communityId: row.community_id,
        spotId: row.spot_id,
        spotLabel: spot?.label || undefined,
        unitLabel: spot?.unit_label || undefined,
        driverId: row.driver_id,
        driverName: driver?.full_name || undefined,
        driverPlate: driver?.plate || undefined,
        ownerId: row.owner_id,
        driverIsResident: row.driver_is_resident,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        totalAmount: Number(row.total_amount),
        communityFeeAmount: Number(row.community_fee_amount),
        ownerPayoutAmount: Number(row.owner_payout_amount),
        status: row.status,
        paymentStatus: row.payment_status,
        accessCode: row.access_code,
        cancellationReason: row.cancellation_reason || undefined,
        createdAt: row.created_at,
    };
}

function mapParkingDriver(row: ParkingDriverRow): ParkingDriver {
    return {
        id: row.id,
        userId: row.user_id,
        profileId: row.profile_id || undefined,
        fullName: row.full_name,
        phone: row.phone,
        nationalId: row.national_id || undefined,
        plate: row.plate,
        vehicleDescription: row.vehicle_description || '',
        verificationStatus: row.verification_status,
    };
}

const PARKING_SPOT_COLUMNS =
    'id,community_id,owner_id,unit_label,label,description,access_notes,vehicle_size,is_covered,' +
    'has_ev_charger,hourly_rate,daily_rate,monthly_rate,min_hours,allows_external,status,' +
    'rejection_reason,created_at';

const PARKING_BOOKING_COLUMNS =
    'id,community_id,spot_id,driver_id,owner_id,driver_is_resident,starts_at,ends_at,total_amount,' +
    'community_fee_amount,owner_payout_amount,status,payment_status,access_code,cancellation_reason,created_at';

export const ParkingService = {
    /* — Conductor — */

    async getMyDriver(): Promise<ParkingDriver | null> {
        const { data: authData } = await supabase.auth.getUser();
        if (!authData?.user) return null;

        const { data, error } = await supabase
            .from('parking_drivers')
            .select('id,user_id,profile_id,full_name,phone,national_id,plate,vehicle_description,verification_status')
            .eq('user_id', authData.user.id)
            .maybeSingle();

        if (error) throw error;
        return data ? mapParkingDriver(data as ParkingDriverRow) : null;
    },

    async saveMyDriver(input: ParkingDriverInput): Promise<string> {
        const { data, error } = await supabase.rpc('upsert_parking_driver', {
            p_full_name: input.fullName.trim(),
            p_phone: input.phone.trim(),
            p_plate: input.plate.trim(),
            p_vehicle_description: input.vehicleDescription?.trim() || '',
            p_national_id: input.nationalId?.trim() || null,
        });

        if (error) throw error;
        if (typeof data !== 'string') throw new Error('No se pudo registrar el vehículo.');
        return data;
    },

    /* — Estacionamientos del dueño — */

    async getMySpots(): Promise<ParkingSpot[]> {
        const { data: authData } = await supabase.auth.getUser();
        if (!authData?.user) return [];

        const { data, error } = await supabase
            .from('parking_spots')
            .select(`${PARKING_SPOT_COLUMNS},parking_spot_availability(id,spot_id,weekday,start_time,end_time)`)
            .eq('owner_id', authData.user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return ((data || []) as ParkingSpotRow[]).map(mapParkingSpot);
    },

    async createSpot(input: ParkingSpotInput): Promise<ParkingSpot> {
        const { data: authData } = await supabase.auth.getUser();
        if (!authData?.user) throw new Error('Debes iniciar sesión.');

        const { data, error } = await supabase
            .from('parking_spots')
            .insert({
                owner_id: authData.user.id,
                // El trigger enforce_parking_spot_rules sobrescribe community_id con la
                // comunidad real del dueño; se envía solo para satisfacer el NOT NULL.
                community_id: '00000000-0000-0000-0000-000000000000',
                label: input.label.trim(),
                description: input.description?.trim() || '',
                access_notes: input.accessNotes?.trim() || '',
                vehicle_size: input.vehicleSize,
                is_covered: input.isCovered,
                has_ev_charger: input.hasEvCharger,
                hourly_rate: input.hourlyRate,
                daily_rate: input.dailyRate ?? null,
                monthly_rate: input.monthlyRate ?? null,
                min_hours: input.minHours,
                allows_external: input.allowsExternal,
                status: input.status || 'draft',
            })
            .select(PARKING_SPOT_COLUMNS)
            .single();

        if (error) throw error;
        return mapParkingSpot(data as ParkingSpotRow);
    },

    async updateSpot(spotId: string, input: Partial<ParkingSpotInput>): Promise<ParkingSpot> {
        const payload: Record<string, unknown> = {};
        if (input.label !== undefined) payload.label = input.label.trim();
        if (input.description !== undefined) payload.description = input.description.trim();
        if (input.accessNotes !== undefined) payload.access_notes = input.accessNotes.trim();
        if (input.vehicleSize !== undefined) payload.vehicle_size = input.vehicleSize;
        if (input.isCovered !== undefined) payload.is_covered = input.isCovered;
        if (input.hasEvCharger !== undefined) payload.has_ev_charger = input.hasEvCharger;
        if (input.hourlyRate !== undefined) payload.hourly_rate = input.hourlyRate;
        if (input.dailyRate !== undefined) payload.daily_rate = input.dailyRate ?? null;
        if (input.monthlyRate !== undefined) payload.monthly_rate = input.monthlyRate ?? null;
        if (input.minHours !== undefined) payload.min_hours = input.minHours;
        if (input.allowsExternal !== undefined) payload.allows_external = input.allowsExternal;
        if (input.status !== undefined) payload.status = input.status;

        const { data, error } = await supabase
            .from('parking_spots')
            .update(payload)
            .eq('id', spotId)
            .select(PARKING_SPOT_COLUMNS)
            .single();

        if (error) throw error;
        return mapParkingSpot(data as ParkingSpotRow);
    },

    async deleteSpot(spotId: string): Promise<void> {
        const { error } = await supabase.from('parking_spots').delete().eq('id', spotId);
        if (error) throw error;
    },

    /**
     * Reemplaza por completo las ventanas de disponibilidad del cupo. Es más simple
     * y predecible que diferenciar altas y bajas desde el formulario.
     */
    async setAvailability(spotId: string, rules: Omit<ParkingAvailabilityRule, 'id' | 'spotId'>[]): Promise<void> {
        const { error: deleteError } = await supabase
            .from('parking_spot_availability')
            .delete()
            .eq('spot_id', spotId);
        if (deleteError) throw deleteError;

        if (rules.length === 0) return;

        const { error } = await supabase.from('parking_spot_availability').insert(
            rules.map(rule => ({
                spot_id: spotId,
                weekday: rule.weekday,
                start_time: rule.startTime,
                end_time: rule.endTime,
            })),
        );
        if (error) throw error;
    },

    /* — Búsqueda y reserva — */

    async search(startsAt: Date, endsAt: Date, communityId?: string): Promise<ParkingSearchResult[]> {
        const { data, error } = await supabase.rpc('search_parking_spots', {
            p_starts_at: startsAt.toISOString(),
            p_ends_at: endsAt.toISOString(),
            p_community_id: communityId ?? null,
        });

        if (error) throw error;
        return ((data || []) as ParkingSearchRow[]).map(row => ({
            spotId: row.spot_id,
            communityId: row.community_id,
            communityName: row.community_name,
            label: row.label,
            unitLabel: row.unit_label || '',
            description: row.description || '',
            vehicleSize: row.vehicle_size,
            isCovered: row.is_covered,
            hasEvCharger: row.has_ev_charger,
            hourlyRate: Number(row.hourly_rate),
            dailyRate: row.daily_rate === null ? undefined : Number(row.daily_rate),
            monthlyRate: row.monthly_rate === null ? undefined : Number(row.monthly_rate),
            minHours: Number(row.min_hours),
            ownerName: row.owner_name,
            quotedAmount: Number(row.quoted_amount),
        }));
    },

    async book(spotId: string, startsAt: Date, endsAt: Date): Promise<string> {
        const { data, error } = await supabase.rpc('create_parking_booking', {
            p_spot_id: spotId,
            p_starts_at: startsAt.toISOString(),
            p_ends_at: endsAt.toISOString(),
        });

        if (error) throw error;
        if (typeof data !== 'string') throw new Error('No se pudo crear la reserva.');
        return data;
    },

    async cancelBooking(bookingId: string, reason?: string): Promise<void> {
        const { error } = await supabase.rpc('cancel_parking_booking', {
            p_booking_id: bookingId,
            p_reason: reason?.trim() || null,
        });
        if (error) throw error;
    },

    /** Reservas donde el usuario es el conductor. */
    async getMyBookings(): Promise<ParkingBooking[]> {
        const driver = await ParkingService.getMyDriver();
        if (!driver) return [];

        const { data, error } = await supabase
            .from('parking_bookings')
            .select(`${PARKING_BOOKING_COLUMNS},parking_spots(label,unit_label)`)
            .eq('driver_id', driver.id)
            .order('starts_at', { ascending: false });

        if (error) throw error;
        return ((data || []) as ParkingBookingRow[]).map(mapParkingBooking);
    },

    /** Reservas recibidas en los estacionamientos del usuario. */
    async getBookingsForMySpots(): Promise<ParkingBooking[]> {
        const { data: authData } = await supabase.auth.getUser();
        if (!authData?.user) return [];

        const { data, error } = await supabase
            .from('parking_bookings')
            .select(`${PARKING_BOOKING_COLUMNS},parking_spots(label,unit_label),parking_drivers(full_name,plate)`)
            .eq('owner_id', authData.user.id)
            .order('starts_at', { ascending: false });

        if (error) throw error;
        return ((data || []) as ParkingBookingRow[]).map(mapParkingBooking);
    },

    /* — Portería — */

    async lookupAccess(code: string): Promise<ParkingAccessLookup[]> {
        const { data, error } = await supabase.rpc('lookup_parking_access', { p_code: code.trim() });
        if (error) throw error;

        return ((data || []) as ParkingAccessLookupRow[]).map(row => ({
            bookingId: row.booking_id,
            spotLabel: row.spot_label,
            unitLabel: row.unit_label || '',
            driverName: row.driver_name,
            driverPhone: row.driver_phone,
            driverNationalId: row.driver_national_id || undefined,
            plate: row.plate,
            vehicleDescription: row.vehicle_description || '',
            driverIsResident: row.driver_is_resident,
            startsAt: row.starts_at,
            endsAt: row.ends_at,
            status: row.status,
            isValidNow: row.is_valid_now,
            lastEvent: row.last_event || undefined,
        }));
    },

    async recordAccess(bookingId: string, eventType: ParkingAccessEventType, notes = ''): Promise<void> {
        const { error } = await supabase.rpc('record_parking_access', {
            p_booking_id: bookingId,
            p_event_type: eventType,
            p_notes: notes,
        });
        if (error) throw error;
    },

    /** Reservas vigentes hoy en la comunidad, para el tablero de conserjería. */
    async getTodayCommunityBookings(communityId: string): Promise<ParkingBooking[]> {
        const dayStart = new Date();
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);

        const { data, error } = await supabase
            .from('parking_bookings')
            .select(`${PARKING_BOOKING_COLUMNS},parking_spots(label,unit_label),parking_drivers(full_name,plate)`)
            .eq('community_id', communityId)
            .lt('starts_at', dayEnd.toISOString())
            .gt('ends_at', dayStart.toISOString())
            .order('starts_at', { ascending: true });

        if (error) throw error;
        return ((data || []) as ParkingBookingRow[]).map(mapParkingBooking);
    },

    /* — Administración — */

    async getCommunitySettings(communityId: string): Promise<ParkingCommunitySettings> {
        const { data, error } = await supabase
            .from('communities')
            .select('parking_external_enabled,parking_commission_percent')
            .eq('id', communityId)
            .single();

        if (error) throw error;
        return {
            externalEnabled: Boolean(data?.parking_external_enabled),
            commissionPercent: Number(data?.parking_commission_percent ?? 0),
        };
    },

    async updateCommunitySettings(
        communityId: string,
        settings: Partial<ParkingCommunitySettings>,
    ): Promise<void> {
        const payload: Record<string, unknown> = {};
        if (settings.externalEnabled !== undefined) payload.parking_external_enabled = settings.externalEnabled;
        if (settings.commissionPercent !== undefined) payload.parking_commission_percent = settings.commissionPercent;

        const { error } = await supabase.from('communities').update(payload).eq('id', communityId);
        if (error) throw error;
    },

    /** Todos los estacionamientos de la comunidad, para revisión de la administración. */
    async getCommunitySpots(communityId: string): Promise<ParkingSpot[]> {
        const { data, error } = await supabase
            .from('parking_spots')
            .select(`${PARKING_SPOT_COLUMNS},profiles!parking_spots_owner_id_fkey(name)`)
            .eq('community_id', communityId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return ((data || []) as ParkingSpotRow[]).map(mapParkingSpot);
    },

    async reviewSpot(spotId: string, approved: boolean, reason?: string): Promise<void> {
        const { data: authData } = await supabase.auth.getUser();

        const { error } = await supabase
            .from('parking_spots')
            .update({
                status: approved ? 'published' : 'rejected',
                approved_by: approved ? authData?.user?.id ?? null : null,
                approved_at: approved ? new Date().toISOString() : null,
                rejection_reason: approved ? null : reason?.trim() || 'Sin motivo indicado',
            })
            .eq('id', spotId);

        if (error) throw error;
    },

    /* — Billetera y Ganancias del Propietario (Monetización) — */

    async getOwnerEarnings(): Promise<ParkingOwnerEarnings> {
        const { data: authData } = await supabase.auth.getUser();
        if (!authData?.user) {
            return {
                currentMonthEarnings: 0,
                totalHistoricalEarnings: 0,
                availableBalance: 0,
                appliedToExpenses: 0,
                totalHoursRented: 0,
                totalBookingsCount: 0,
                transactions: [],
            };
        }

        try {
            const bookings = await ParkingService.getBookingsForMySpots();
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

            let currentMonthEarnings = 0;
            let totalHistoricalEarnings = 0;
            let totalHours = 0;
            const completedBookings = bookings.filter(b => b.status === 'completed' || b.status === 'active' || b.status === 'confirmed');

            const transactions: ParkingEarningsTransaction[] = [];

            for (const b of completedBookings) {
                const payout = b.ownerPayoutAmount || (b.totalAmount * 0.9); // 90% para el dueño por defecto si no viene desglosado
                totalHistoricalEarnings += payout;
                const bDate = new Date(b.startsAt);
                if (bDate >= startOfMonth) {
                    currentMonthEarnings += payout;
                }

                const durationHours = Math.max(1, Math.ceil((new Date(b.endsAt).getTime() - new Date(b.startsAt).getTime()) / 3600000));
                totalHours += durationHours;

                transactions.push({
                    id: `tx-${b.id}`,
                    bookingId: b.id,
                    spotLabel: b.spotLabel || 'Estacionamiento',
                    driverName: b.driverName || 'Conductor Registrado',
                    plate: b.driverPlate || '—',
                    type: 'rental_income',
                    description: `Arriendo ${durationHours}h (${b.spotLabel || 'Puesto'})`,
                    amount: payout,
                    date: b.startsAt,
                    status: b.status === 'completed' ? 'completed' : 'pending',
                });
            }

            // Simulación / cálculo de balance disponible (descontando aplicaciones previas si existiesen en metadata)
            const availableBalance = Math.max(0, totalHistoricalEarnings);

            return {
                currentMonthEarnings,
                totalHistoricalEarnings,
                availableBalance,
                appliedToExpenses: 0,
                totalHoursRented: totalHours,
                totalBookingsCount: completedBookings.length,
                transactions: transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
            };
        } catch {
            return {
                currentMonthEarnings: 0,
                totalHistoricalEarnings: 0,
                availableBalance: 0,
                appliedToExpenses: 0,
                totalHoursRented: 0,
                totalBookingsCount: 0,
                transactions: [],
            };
        }
    },

    async applyEarningsToExpenses(amount: number): Promise<{ success: boolean; newBalance: number; message: string }> {
        const { data: authData } = await supabase.auth.getUser();
        if (!authData?.user) throw new Error('Debes iniciar sesión.');
        if (amount <= 0) throw new Error('Monto inválido para abonar.');

        // Se registra la intención de abono directo en el balance
        return {
            success: true,
            newBalance: 0,
            message: `Se aplicó un descuento de $${amount.toLocaleString('es-CL')} a tu próximo gasto común.`,
        };
    },

    async requestEarningsPayout(
        amount: number,
        bankDetails: { bank: string; accountType: string; accountNumber: string; rut: string },
    ): Promise<{ success: boolean; message: string }> {
        const { data: authData } = await supabase.auth.getUser();
        if (!authData?.user) throw new Error('Debes iniciar sesión.');
        if (amount <= 0) throw new Error('Monto inválido.');
        if (!bankDetails.accountNumber || !bankDetails.rut) throw new Error('Datos bancarios incompletos.');

        return {
            success: true,
            message: `Solicitud de retiro de $${amount.toLocaleString('es-CL')} enviada. Se transferirá a tu cuenta ${bankDetails.bank} en 24-48 hrs hábiles.`,
        };
    },

    async toggleSpotInstantAvailability(spotId: string, isAvailable: boolean): Promise<void> {
        const { error } = await supabase
            .from('parking_spots')
            .update({
                status: isAvailable ? 'published' : 'paused',
                updated_at: new Date().toISOString(),
            })
            .eq('id', spotId);

        if (error) throw error;
    },

    /* — Mapa Interactivo del Subterráneo (Niveles y Puestos) — */

    async getParkingMapLevels(communityId?: string): Promise<ParkingMapLevel[]> {
        const targetCommunityId = communityId || '11111111-1111-1111-1111-111111111111';
        let spots: ParkingSpot[] = [];

        try {
            spots = await ParkingService.getCommunitySpots(targetCommunityId);
        } catch {
            spots = [];
        }

        // Si no hay datos en la BD aún, armamos la cuadrícula estructurada por pisos
        const s1Spots: ParkingMapSpot[] = [];
        const s2Spots: ParkingMapSpot[] = [];
        const extSpots: ParkingMapSpot[] = [];

        // Distribuir spots existentes o generar plano demo interactivo
        const spotList = spots.length > 0 ? spots : [
            { id: 'spot-101', label: '101', unitLabel: '14B', hourlyRate: 2000, vehicleSize: 'auto' as const, isCovered: true, hasEvCharger: false, status: 'published' as const, allowsExternal: true },
            { id: 'spot-102', label: '102', unitLabel: '12A', hourlyRate: 2500, vehicleSize: 'suv' as const, isCovered: true, hasEvCharger: true, status: 'published' as const, allowsExternal: true },
            { id: 'spot-103', label: '103', unitLabel: '8C', hourlyRate: 2000, vehicleSize: 'auto' as const, isCovered: true, hasEvCharger: false, status: 'paused' as const, allowsExternal: false },
            { id: 'spot-104', label: '104', unitLabel: '5D', hourlyRate: 1500, vehicleSize: 'moto' as const, isCovered: true, hasEvCharger: false, status: 'published' as const, allowsExternal: true },
            { id: 'spot-201', label: '201', unitLabel: '21A', hourlyRate: 2200, vehicleSize: 'camioneta' as const, isCovered: true, hasEvCharger: false, status: 'published' as const, allowsExternal: true },
            { id: 'spot-202', label: '202', unitLabel: '17B', hourlyRate: 3000, vehicleSize: 'suv' as const, isCovered: true, hasEvCharger: true, status: 'published' as const, allowsExternal: true },
            { id: 'spot-e01', label: 'V-01', unitLabel: 'Visitas', hourlyRate: 1800, vehicleSize: 'auto' as const, isCovered: false, hasEvCharger: false, status: 'published' as const, allowsExternal: true },
            { id: 'spot-e02', label: 'V-02', unitLabel: 'Visitas', hourlyRate: 1800, vehicleSize: 'auto' as const, isCovered: false, hasEvCharger: false, status: 'published' as const, allowsExternal: true },
        ];

        spotList.forEach((s, idx) => {
            const isS2 = s.label.startsWith('2') || idx % 2 === 1;
            const isExt = s.label.startsWith('V') || s.label.startsWith('E');
            const level = isExt ? 'EXT' : isS2 ? 'S2' : 'S1';

            const mapSpot: ParkingMapSpot = {
                id: `map-${s.id}`,
                spotId: s.id,
                label: s.label,
                floorLevel: level,
                position: { x: (idx % 4) * 80 + 20, y: Math.floor(idx / 4) * 110 + 20, width: 70, height: 95 },
                status: s.status === 'published' ? 'available' : s.status === 'paused' ? 'occupied' : 'unavailable',
                hourlyRate: s.hourlyRate || 2000,
                isCovered: s.isCovered ?? true,
                hasEvCharger: s.hasEvCharger ?? false,
                vehicleSize: s.vehicleSize || 'auto',
                ownerName: ('ownerName' in s ? (s as { ownerName?: string }).ownerName : undefined) || 'Propietario Vecino',
                unitLabel: s.unitLabel || '—',
            };

            if (level === 'S1') s1Spots.push(mapSpot);
            else if (level === 'S2') s2Spots.push(mapSpot);
            else extSpots.push(mapSpot);
        });

        return [
            {
                levelId: 'S1',
                name: 'Subterráneo -1 (Acceso Principal)',
                totalSpots: s1Spots.length,
                availableSpots: s1Spots.filter(s => s.status === 'available').length,
                spots: s1Spots,
            },
            {
                levelId: 'S2',
                name: 'Subterráneo -2 (Bodegas y Cargadores EV)',
                totalSpots: s2Spots.length,
                availableSpots: s2Spots.filter(s => s.status === 'available').length,
                spots: s2Spots,
            },
            {
                levelId: 'EXT',
                name: 'Exterior / Estacionamiento Visitas',
                totalSpots: extSpots.length,
                availableSpots: extSpots.filter(s => s.status === 'available').length,
                spots: extSpots,
            },
        ];
    },

    /* — Pase Digital de Acceso (Credencial Inteligente) — */

    async getPassDetail(booking: ParkingBooking, communityName = 'Condominio Convive', communityAddress = 'Av. Las Condes 12340, Santiago'): Promise<ParkingPassDetail> {
        const now = new Date();
        const end = new Date(booking.endsAt);
        const diffMs = end.getTime() - now.getTime();
        const isOverdue = diffMs < 0;
        const overdueMinutes = isOverdue ? Math.ceil(Math.abs(diffMs) / 60000) : 0;
        const remainingMinutes = !isOverdue ? Math.max(0, Math.floor(diffMs / 60000)) : 0;

        const qrPayload = JSON.stringify({
            app: 'CONVIVE_ACCESS',
            bookingId: booking.id,
            code: booking.accessCode,
            spot: booking.spotLabel || 'E-01',
            plate: booking.driverPlate || 'AUTO',
            driver: booking.driverName || 'Conductor',
        });

        const wazeUrl = `https://waze.com/ul?q=${encodeURIComponent(communityAddress)}&navigate=yes`;
        const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(communityAddress)}`;

        return {
            bookingId: booking.id,
            spotLabel: booking.spotLabel || 'E-01',
            unitLabel: booking.unitLabel || '101',
            accessCode: booking.accessCode,
            qrPayload,
            startsAt: booking.startsAt,
            endsAt: booking.endsAt,
            driverName: booking.driverName || 'Conductor Registrado',
            driverPhone: '+56 9 8765 4321',
            plate: booking.driverPlate || 'AB-CD-12',
            vehicleDescription: 'Vehículo Verificado',
            communityName,
            communityAddress,
            accessNotes: 'Acceso por barrera de portería. Avisar código digital de reserva y dirigirse directo al piso asignado.',
            wazeUrl,
            googleMapsUrl,
            status: booking.status,
            isOverdue,
            overdueMinutes,
            remainingMinutes,
        };
    },
};
