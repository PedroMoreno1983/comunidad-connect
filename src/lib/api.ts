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
    CreateAmenityInput,
    CommunityProject,
    MaintenanceAdminOverview,
    MaintenanceDashboardData,
    MaintenanceLog,
    MaintenanceServiceRow,
    MaintenanceTask,
    DirectoryNeighbor,
    MarketplaceItem,
    NeighborMediationCase,
    ProfileSettings,
    ResidentCasesSummary,
    ResidentHomeSummary,
    ResidentFinanceExpense,
    ServiceRequestQueueItem,
    TimeBankOffer,
    Unit,
    User,
    WaterReading,
} from './types';

async function sendBookingConfirmation(payload: {
    to: string;
    residentName: string;
    amenityName: string;
    date: string;
    startTime: string;
    endTime: string;
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
// Access / Signup API
// ==========================================

export const CommunityAccessService = {
    async validateInviteCode(code: string, role: User["role"]): Promise<{ id: string; name: string | null }> {
        const cleanCode = code.trim().toUpperCase();
        const { data, error } = await supabase
            .from("communities")
            .select("id, name, resident_code, concierge_code, admin_code")
            .or(`resident_code.eq.${cleanCode},concierge_code.eq.${cleanCode},admin_code.eq.${cleanCode}`)
            .limit(1);

        if (error) throw error;
        const community = Array.isArray(data) ? data[0] as Record<string, unknown> | undefined : undefined;

        if (!community) {
            throw new Error("El codigo de invitacion no existe o es incorrecto.");
        }

        const validForRole =
            (role === "resident" && community.resident_code === cleanCode) ||
            (role === "concierge" && community.concierge_code === cleanCode) ||
            (role === "admin" && community.admin_code === cleanCode);

        if (!validForRole) {
            const roleLabel = role === "resident" ? "Residente" : role === "admin" ? "Administrador" : "Conserje";
            throw new Error(`El codigo ingresado no corresponde al perfil ${roleLabel}.`);
        }

        return {
            id: String(community.id),
            name: typeof community.name === "string" ? community.name : null,
        };
    },
};

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

const COLLAB_STORAGE_KEYS = {
    mediations: 'convive-community-mediations',
    timeBank: 'convive-time-bank-offers',
    collectivePurchases: 'convive-collective-purchases',
    projects: 'convive-community-projects',
};

function createLocalId(prefix: string): string {
    throw new Error(`El modulo de convivencia requiere tablas Supabase reales antes de crear registros (${prefix}).`);
}

function readStoredList<T>(key: string, _fallback: T[]): T[] {
    void _fallback;
    console.warn(`[CommunityCollaborationService] ${key} unavailable; returning empty real-data state.`);
    return [];
}

function writeStoredList<T>(key: string, values: T[]) {
    void values;
    throw new Error(`El modulo de convivencia requiere tablas Supabase reales antes de escribir ${key}.`);
}

const DEFAULT_TIME_BANK_OFFERS: TimeBankOffer[] = [
    {
        id: 'tb-router',
        neighborName: 'Martina Rojas',
        unitLabel: '1204',
        skill: 'Configurar router y WiFi',
        description: 'Puedo ayudar a mejorar la senal, ordenar cables y configurar claves seguras.',
        availability: 'Martes y jueves despues de las 19:00',
        credits: 2,
        requestsCount: 3,
        category: 'digital',
        createdAt: '2026-06-01T12:00:00.000Z',
    },
    {
        id: 'tb-taladro',
        neighborName: 'Nicolas Herrera',
        unitLabel: '804',
        skill: 'Prestamo de taladro',
        description: 'Taladro percutor, brocas basicas y ayuda para perforaciones simples.',
        availability: 'Fines de semana',
        credits: 1,
        requestsCount: 6,
        category: 'tools',
        createdAt: '2026-06-01T12:05:00.000Z',
    },
    {
        id: 'tb-paquetes',
        neighborName: 'Ana Valdes',
        unitLabel: '302',
        skill: 'Recibir paquetes',
        description: 'Si viajas o llegas tarde, puedo recibir paquetes pequenos y avisarte por chat interno.',
        availability: 'Lunes a viernes hasta las 18:30',
        credits: 1,
        requestsCount: 4,
        category: 'care',
        createdAt: '2026-06-01T12:10:00.000Z',
    },
];

const DEFAULT_COLLECTIVE_PURCHASES: CollectivePurchaseCampaign[] = [
    {
        id: 'cp-agua',
        title: 'Bidones de agua purificada 20L',
        supplier: 'Distribuidora local Quilicura',
        category: 'water',
        unitPrice: 3200,
        retailPrice: 4900,
        minimumParticipants: 24,
        participants: 17,
        deadline: '2026-06-12',
        status: 'open',
        organizer: 'Comite de abasto',
        createdAt: '2026-06-01T13:00:00.000Z',
    },
    {
        id: 'cp-limpieza',
        title: 'Kit limpieza ecologica para areas comunes',
        supplier: 'Cooperativa BioLimpio',
        category: 'eco',
        unitPrice: 8900,
        retailPrice: 13900,
        minimumParticipants: 18,
        participants: 18,
        deadline: '2026-06-08',
        status: 'ready',
        organizer: 'Administracion',
        createdAt: '2026-06-01T13:05:00.000Z',
    },
];

const DEFAULT_COMMUNITY_PROJECTS: CommunityProject[] = [
    {
        id: 'project-huerto',
        title: 'Huerto comunitario en terraza norte',
        area: 'huerto',
        description: 'Organizar turnos de riego, compostaje y cosecha compartida con vecinos voluntarios.',
        impact: '12 familias inscritas, 3 adultos mayores participando y 18 kg de compost recuperados.',
        participants: 12,
        needed: 'Semillas, compostera y 2 turnos semanales de riego',
        cocoInsight: 'CoCo detecto que varias publicaciones mencionan plantas y compostaje; conviene abrir una cuadrilla estable.',
        status: 'active',
        createdAt: '2026-06-01T14:00:00.000Z',
    },
    {
        id: 'project-mascotas',
        title: 'Red de cuidado mutuo para mascotas pequenas',
        area: 'mascotas',
        description: 'Grupo de vecinos que se cubren paseos y alimentacion cuando alguien viaja o se enferma.',
        impact: '5 vecinos del piso 8 ya tienen mascotas pequenas y horarios compatibles.',
        participants: 5,
        needed: 'Calendario de turnos, reglas sanitarias y contacto de emergencia',
        cocoInsight: 'Martina, he notado que 5 vecinos en tu piso tienen mascotas pequenas. Podrias armar un grupo de cuidado mutuo.',
        status: 'forming',
        createdAt: '2026-06-01T14:05:00.000Z',
    },
];

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

function shouldUseLocalCollaborationFallback(error: unknown) {
    const message = error instanceof Error ? error.message : String((error as { message?: string })?.message || error || '');
    return Boolean(message);
}

export const CommunityCollaborationService = {
    async getMediationCases(): Promise<NeighborMediationCase[]> {
        const { data, error } = await supabase
            .from('neighbor_mediations')
            .select('*')
            .order('created_at', { ascending: false });
        if (!error && Array.isArray(data)) return (data as CollaborationRow[]).map(mapMediationRow);
        if (shouldUseLocalCollaborationFallback(error)) return readStoredList<NeighborMediationCase>(COLLAB_STORAGE_KEYS.mediations, []);
        return [];
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
        if (!error && data) return mapMediationRow(data as CollaborationRow);

        const current = readStoredList<NeighborMediationCase>(COLLAB_STORAGE_KEYS.mediations, []);
        const mediation: NeighborMediationCase = {
            ...input,
            id: createLocalId('mediation'),
            draftedMessage,
            status: 'drafted',
            createdAt: new Date().toISOString(),
        };
        writeStoredList(COLLAB_STORAGE_KEYS.mediations, [mediation, ...current]);
        return mediation;
    },

    async updateMediationStatus(id: string, status: NeighborMediationCase['status']): Promise<NeighborMediationCase[]> {
        const { error } = await supabase.from('neighbor_mediations').update({ status }).eq('id', id);
        if (!error) return this.getMediationCases();

        const current = readStoredList<NeighborMediationCase>(COLLAB_STORAGE_KEYS.mediations, []);
        const updated = current.map(item => item.id === id ? { ...item, status } : item);
        writeStoredList(COLLAB_STORAGE_KEYS.mediations, updated);
        return updated;
    },

    async getTimeBankOffers(): Promise<TimeBankOffer[]> {
        const { data, error } = await supabase
            .from('time_bank_offers')
            .select('*')
            .order('created_at', { ascending: false });
        if (!error && Array.isArray(data)) return (data as CollaborationRow[]).map(mapTimeBankRow);
        if (shouldUseLocalCollaborationFallback(error)) return readStoredList<TimeBankOffer>(COLLAB_STORAGE_KEYS.timeBank, DEFAULT_TIME_BANK_OFFERS);
        return DEFAULT_TIME_BANK_OFFERS;
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
        if (!error) return this.getTimeBankOffers();

        const current = readStoredList<TimeBankOffer>(COLLAB_STORAGE_KEYS.timeBank, DEFAULT_TIME_BANK_OFFERS);
        const offer: TimeBankOffer = {
            ...input,
            id: createLocalId('timebank'),
            requestsCount: 0,
            createdAt: new Date().toISOString(),
        };
        const updated = [offer, ...current];
        writeStoredList(COLLAB_STORAGE_KEYS.timeBank, updated);
        return updated;
    },

    async requestTimeBankOffer(id: string): Promise<TimeBankOffer[]> {
        const { data } = await supabase.from('time_bank_offers').select('requests_count').eq('id', id).maybeSingle();
        if (data) {
            const requestsCount = Number((data as { requests_count?: number }).requests_count || 0) + 1;
            const { error } = await supabase.from('time_bank_offers').update({ requests_count: requestsCount }).eq('id', id);
            if (!error) return this.getTimeBankOffers();
        }

        const current = readStoredList<TimeBankOffer>(COLLAB_STORAGE_KEYS.timeBank, DEFAULT_TIME_BANK_OFFERS);
        const updated = current.map(item => item.id === id ? { ...item, requestsCount: item.requestsCount + 1 } : item);
        writeStoredList(COLLAB_STORAGE_KEYS.timeBank, updated);
        return updated;
    },

    async getCollectivePurchases(): Promise<CollectivePurchaseCampaign[]> {
        const { data, error } = await supabase
            .from('collective_purchase_campaigns')
            .select('*')
            .order('created_at', { ascending: false });
        if (!error && Array.isArray(data)) return (data as CollaborationRow[]).map(mapCollectivePurchaseRow);
        if (shouldUseLocalCollaborationFallback(error)) return readStoredList<CollectivePurchaseCampaign>(COLLAB_STORAGE_KEYS.collectivePurchases, DEFAULT_COLLECTIVE_PURCHASES);
        return DEFAULT_COLLECTIVE_PURCHASES;
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
        if (!error) return this.getCollectivePurchases();

        const current = readStoredList<CollectivePurchaseCampaign>(COLLAB_STORAGE_KEYS.collectivePurchases, DEFAULT_COLLECTIVE_PURCHASES);
        const campaign: CollectivePurchaseCampaign = {
            ...input,
            id: createLocalId('purchase'),
            participants: 1,
            status: input.minimumParticipants <= 1 ? 'ready' : 'open',
            createdAt: new Date().toISOString(),
        };
        const updated = [campaign, ...current];
        writeStoredList(COLLAB_STORAGE_KEYS.collectivePurchases, updated);
        return updated;
    },

    async joinCollectivePurchase(id: string): Promise<CollectivePurchaseCampaign[]> {
        const { data } = await supabase.from('collective_purchase_campaigns').select('participants, minimum_participants, status').eq('id', id).maybeSingle();
        if (data) {
            const row = data as { participants?: number; minimum_participants?: number; status?: CollectivePurchaseCampaign['status'] };
            const participants = Number(row.participants || 0) + 1;
            const status = participants >= Number(row.minimum_participants || 1) ? 'ready' : row.status || 'open';
            const { error } = await supabase.from('collective_purchase_campaigns').update({ participants, status }).eq('id', id);
            if (!error) return this.getCollectivePurchases();
        }

        const current = readStoredList<CollectivePurchaseCampaign>(COLLAB_STORAGE_KEYS.collectivePurchases, DEFAULT_COLLECTIVE_PURCHASES);
        const updated = current.map(item => {
            if (item.id !== id) return item;
            const participants = item.participants + 1;
            return {
                ...item,
                participants,
                status: participants >= item.minimumParticipants ? 'ready' : item.status,
            };
        });
        writeStoredList(COLLAB_STORAGE_KEYS.collectivePurchases, updated);
        return updated;
    },

    async getCommunityProjects(): Promise<CommunityProject[]> {
        const { data, error } = await supabase
            .from('community_projects')
            .select('*')
            .order('created_at', { ascending: false });
        if (!error && Array.isArray(data)) return (data as CollaborationRow[]).map(mapCommunityProjectRow);
        if (shouldUseLocalCollaborationFallback(error)) return readStoredList<CommunityProject>(COLLAB_STORAGE_KEYS.projects, DEFAULT_COMMUNITY_PROJECTS);
        return DEFAULT_COMMUNITY_PROJECTS;
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
        if (!error) return this.getCommunityProjects();

        const current = readStoredList<CommunityProject>(COLLAB_STORAGE_KEYS.projects, DEFAULT_COMMUNITY_PROJECTS);
        const project: CommunityProject = {
            ...input,
            id: createLocalId('project'),
            participants: 1,
            status: 'forming',
            createdAt: new Date().toISOString(),
        };
        const updated = [project, ...current];
        writeStoredList(COLLAB_STORAGE_KEYS.projects, updated);
        return updated;
    },

    async joinCommunityProject(id: string): Promise<CommunityProject[]> {
        const { data } = await supabase.from('community_projects').select('participants').eq('id', id).maybeSingle();
        if (data) {
            const participants = Number((data as { participants?: number }).participants || 0) + 1;
            const { error } = await supabase.from('community_projects').update({ participants, status: 'active' }).eq('id', id);
            if (!error) return this.getCommunityProjects();
        }

        const current = readStoredList<CommunityProject>(COLLAB_STORAGE_KEYS.projects, DEFAULT_COMMUNITY_PROJECTS);
        const updated: CommunityProject[] = current.map(item => item.id === id ? { ...item, participants: item.participants + 1, status: 'active' } : item);
        writeStoredList(COLLAB_STORAGE_KEYS.projects, updated);
        return updated;
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
            .eq('status', 'pending');

        if (user.unitId) {
            expensesQuery = expensesQuery.eq('unit_id', user.unitId);
        }

        const today = new Date().toISOString().split('T')[0];
        let bookingsQuery = supabase
            .from('bookings')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .gte('date', today);

        if (user.unitId) {
            bookingsQuery = bookingsQuery.eq('unit_id', user.unitId);
        }

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
    "#B5664E",
    "#6E8268",
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

    // Crear nueva unidad
    async createUnit(unit: Partial<Unit>) {
        const { data, error } = await supabase
            .from('units')
            .insert(unit)
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
            throw error;
        }

        // Disparar email de confirmación (no bloquea si falla)
        try {
            const { data: profile } = await supabase
                .from('profiles')
                .select('email, name')
                .eq('id', bookingData.user_id)
                .single();

            if (profile?.email) {
                await sendBookingConfirmation({
                    to: profile.email,
                    residentName: profile.name || 'Residente',
                    amenityName: (data as { amenities?: { name: string } }).amenities?.name || 'Instalación',
                    date: bookingData.date,
                    startTime: bookingData.start_time,
                    endTime: bookingData.end_time,
                });
            }
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
    async getActivePolls() {
        const { data: polls, error } = await supabase
            .from('polls')
            .select(`
                *,
                options:poll_options(*),
                votes:poll_votes(option_id)
            `)
            .eq('status', 'active')
            .order('created_at', { ascending: false });

        if (error) {
            console.error("Error fetching polls:", error);
            throw error;
        }

        return polls;
    },

    async getClosedPolls() {
        const { data: polls, error } = await supabase
            .from('polls')
            .select(`
                *,
                options:poll_options(*),
                votes:poll_votes(option_id)
            `)
            .eq('status', 'closed')
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
    },

    // Process a payment for a specific expense with Haulmer tax compliance
    async payExpense(expenseId: string, taxData?: { rut: string; type: 'boleta' | 'factura'; business_type?: string }) {
        const { data, error } = await supabase
            .from('expenses')
            .update({
                status: 'paid',
                paid_at: new Date().toISOString(),
                payment_metadata: {
                    ...taxData,
                    processor: 'haulmer',
                    issued_tax_doc: true
                }
            })
            .eq('id', expenseId)
            .select()
            .single();

        if (error) {
            console.error("Error processing payment:", error);
            throw error;
        }
        return data;
    }
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

    async createAnnouncement(announcementData: { title: string; content: string; priority: 'info' | 'alert' | 'event'; author_id: string; author_name: string }) {
        const { data, error } = await supabase
            .from('announcements')
            .insert([{
                title: announcementData.title,
                content: announcementData.content,
                priority: announcementData.priority,
                author_id: announcementData.author_id,
                author_name: announcementData.author_name
            }])
            .select()
            .single();

        if (error) throw error;

        return {
            id: data.id,
            title: data.title,
            content: data.content,
            priority: data.priority,
            author_name: data.author_name || announcementData.author_name,
            created_at: data.created_at
        };
    }
};
