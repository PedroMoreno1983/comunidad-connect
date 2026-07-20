import type { ReactNode } from 'react';

export type UserRole = 'admin' | 'resident' | 'concierge';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl?: string; // Optional avatar
  photo?: string; // Alias for avatarUrl or external photo
  unitId?: string; // For residents/tenants
  unitName?: string; // User-friendly unit designator
  communityId?: string; // Multi-tenant ID
  communityCoverPhotoUrl?: string; // Optional real building photo, set per-community
  features?: Record<string, boolean>; // Plan features
}

export interface Unit {
  id: string;
  number: string;
  floor: number;
  tower: string;
  ownerId?: string; // User ID
  tenantId?: string; // User ID
}

export interface MarketplaceItem {
  id: string;
  title: string;
  description: string;
  price: number;
  sellerId: string; // User ID
  imageUrl?: string;
  images?: string[];
  category: 'electronics' | 'furniture' | 'clothing' | 'other';
  createdAt: string;
  status: 'available' | 'sold' | 'reserved' | 'hidden';
  allowSale?: boolean; // New: accepts money
  allowSwap?: boolean; // New: swap for similar/specific item (Permuta)
  swapDetails?: string; // New: details for swap
  allowBarter?: boolean; // New: indicates if seller accepts trades for anything (Trueque)
  barterDetails?: string; // New: what the seller is looking for in return
  paymentStatus?: 'pending' | 'completed' | 'none';
}

export interface MarketplaceConversation {
  id: string;
  itemId: string;
  itemTitle: string;
  itemImageUrl?: string;
  itemStatus: MarketplaceItem['status'];
  buyerId: string;
  sellerId: string;
  peerId: string;
  peerName: string;
  peerAvatarUrl?: string;
  lastMessage?: string;
  lastMessageAt: string;
  unreadCount: number;
}

export interface MarketplaceMessage {
  id: string;
  conversationId: string;
  communityId: string;
  senderId: string;
  content: string;
  createdAt: string;
  readAt?: string;
}

export interface MarketplaceChatModalProps {
  initialItem: MarketplaceItem | null;
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
}

export interface ChatMessage {
  id: string;
  sender_id: string;
  receiver_id?: string; // Optional: null means global chat
  content: string;
  created_at: string;
  read?: boolean;
  profiles?: {
    name: string;
    avatar_url?: string;
  };
}

export interface Conversation {
  peerId: string;
  peerProfile: { name: string; avatar_url?: string };
  lastMessage: string;
  lastAt: string;
}

export interface ChatMessageSummary {
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
}

export interface ProfileSummary {
  id: string;
  name: string;
  avatar_url?: string;
}

export interface DirectoryNeighbor {
  id: string;
  name: string;
  avatar_url?: string;
  role: UserRole;
  unit_id?: string;
  unitLabel?: string;
  email?: string;
}

export interface NeighborMediationCase {
  id: string;
  reporterId: string;
  reporterName: string;
  communityId?: string;
  targetUnit: string;
  observation: string;
  feeling: string;
  need: string;
  request: string;
  draftedMessage: string;
  status: 'drafted' | 'sent' | 'agreement' | 'escalated';
  createdAt: string;
}

export interface TimeBankOffer {
  id: string;
  profileId?: string;
  communityId?: string;
  neighborName: string;
  unitLabel: string;
  skill: string;
  description: string;
  availability: string;
  credits: number;
  requestsCount: number;
  category: 'tools' | 'care' | 'digital' | 'home' | 'learning' | 'other';
  createdAt: string;
}

export interface CollectivePurchaseCampaign {
  id: string;
  communityId?: string;
  title: string;
  supplier: string;
  category: 'water' | 'gas' | 'cleaning' | 'food' | 'eco' | 'other';
  unitPrice: number;
  retailPrice: number;
  minimumParticipants: number;
  participants: number;
  deadline: string;
  status: 'open' | 'ready' | 'ordered';
  organizer: string;
  createdAt: string;
}

export interface CommunityProject {
  id: string;
  communityId?: string;
  title: string;
  area: 'huerto' | 'reciclaje' | 'cuidados' | 'mascotas' | 'cultura' | 'otro';
  description: string;
  impact: string;
  participants: number;
  needed: string;
  cocoInsight: string;
  status: 'active' | 'forming' | 'completed';
  createdAt: string;
}

export interface ProfileSettings {
  avatarUrl?: string;
  phoneNumber: string;
  whatsappEnabled: boolean;
  unitNumber: string;
  unitTower: string;
}

export interface ResidentHomeAnnouncement {
  title: string;
  content: string;
  category: string;
  time: string;
}

export interface ResidentHomeSummary {
  pendingExpensesCount: number;
  pendingExpensesAmount: number;
  bookingsCount: number;
  recentAnnouncement: ResidentHomeAnnouncement | null;
}

export interface ResidentHomeQuickActionProps {
  href: string;
  icon: ReactNode;
  title: string;
  detail: string;
}

export interface ConciergeQuickActionProps {
  href: string;
  icon: ReactNode;
  title: string;
  detail: string;
}

export interface ConciergeShiftEvent {
  id: string;
  timestamp: number;
  time: string;
  type: string;
  desc: string;
  status: string;
  tone: 'sage' | 'copper' | 'rose' | 'neutral';
}

export interface AdminDashboardMetricPoint {
  label: string;
  collected: number;
  target: number;
}

export interface AdminDashboardCategory {
  label: string;
  amount: number;
  color: string;
}

export interface AdminDashboardListItem {
  title: string;
  detail: string;
  status: string;
  tone: 'copper' | 'sage' | 'amber' | 'rose' | 'plum' | 'ink';
}

export interface AdminDashboardSummary {
  residentsActive: number;
  unitsTotal: number;
  collectionRate: number;
  collectionCollected: number;
  collectionTarget: number;
  openRequests: number;
  criticalRequests: number;
  quorumPct: number;
  assetsOptimalPct: number;
  cocoCasesOpen: number;
  monthlyCollection: AdminDashboardMetricPoint[];
  expenseCategories: AdminDashboardCategory[];
  amenityUsage: AdminDashboardMetricPoint[];
  activeRequests: AdminDashboardListItem[];
}

export interface ServiceProvider {
  id: string;
  name: string;
  category: 'plumbing' | 'electrical' | 'locksmith' | 'cleaning' | 'general';
  rating: number;
  reviewCount: number;
  contactPhone: string;
  email?: string;

  // Enhanced profile fields
  photo?: string;
  bio: string;
  yearsExperience: number;
  specialties: string[];
  certifications: string[];
  hourlyRate?: number;
  availability: 'available' | 'busy' | 'unavailable';
  responseTime: string; // e.g., "< 2 horas"
  completedJobs: number;
  verified: boolean;
}

export interface ServiceProviderDatabaseRow {
  id: string;
  name: string;
  category: ServiceProvider['category'];
  rating: number;
  review_count: number;
  contact_phone: string;
  email?: string;
  photo?: string;
  bio: string;
  years_experience: number;
  specialties: string[];
  certifications: string[];
  hourly_rate?: number;
  availability: ServiceProvider['availability'];
  response_time: string;
  completed_jobs: number;
  verified: boolean;
}

export interface Review {
  id: string;
  providerId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  rating: number;
  comment: string;
  createdAt: string;
  serviceType: string;
}


export interface ServiceRequest {
  id: string;
  requesterId: string;
  unitId: string;
  providerId?: string; // If specific provider selected
  serviceType: 'plumbing' | 'electrical' | 'locksmith' | 'cleaning' | 'other';
  description: string;
  status: 'pending' | 'approved' | 'in-progress' | 'completed' | 'cancelled';
  scheduledDate?: string;
  scheduledTime?: string; // New field for specific time slot
  createdAt: string;
}

export interface VisitorLog {
  id: string;
  visitorName: string;
  unitId: string; // Destination unit
  entryTime: string;
  exitTime?: string;
  purpose?: string;
  isQr?: boolean;
}

export interface VisitorLogDatabaseRow {
  id: string;
  visitor_name: string;
  unit_id: string;
  entry_time: string;
  exit_time?: string;
  purpose?: string;
  is_qr?: boolean;
  units?: { number: string } | null;
}

export interface Package {
  id: string;
  recipientUnitId: string;
  recipientUnitNumber?: string;
  description: string;
  receivedAt: string;
  pickedUpAt?: string;
  status: 'pending' | 'picked-up';
}

export interface PackageDatabaseRow {
  id: string;
  recipient_unit_id: string;
  description: string | null;
  received_at: string | null;
  picked_up_at: string | null;
  status: 'pending' | 'picked-up' | null;
  community_id?: string | null;
  units?: { number?: string | null } | null;
}

export interface PackageUnitLookupRow {
  id: string;
  number: string | null;
}

export interface CreatePackageInput {
  recipientUnitId: string;
  description: string;
  communityId: string;
}

export interface PackageSummaryCardProps {
  label: string;
  value: number;
  icon: ReactNode;
  tone: 'copper' | 'sage';
}

export interface Amenity {
  id: string;
  name: string;
  description: string;
  maxCapacity: number;
  hourlyRate: number; // 0 if free
  iconName: string; // Lucide icon name
  gradient: string; // Tailwind gradient classes
  communityId?: string;
}

export interface CreateAmenityInput {
  name: string;
  description: string;
  maxCapacity: number;
  hourlyRate: number;
  iconName: string;
  gradient: string;
  communityId?: string;
}

export interface Booking {
  id: string;
  amenityId: string;
  userId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  status: 'pending' | 'confirmed' | 'cancelled';
}

export interface AdminBooking {
  id: string;
  date: string;
  start_time?: string | null;
  end_time?: string | null;
  status: 'pending' | 'confirmed' | 'cancelled';
  created_at?: string | null;
  profiles?: { name?: string | null; email?: string | null } | { name?: string | null; email?: string | null }[] | null;
  amenities?: { name?: string | null; icon_name?: string | null; gradient?: string | null } | { name?: string | null; icon_name?: string | null; gradient?: string | null }[] | null;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  author: string; // Admin Name
  priority: 'info' | 'alert' | 'event';
  createdAt: string;
}

export interface AnnouncementDatabaseRow {
  id: string;
  title: string;
  content: string;
  author_name?: string | null;
  priority: 'info' | 'alert' | 'event';
  created_at: string;
}

export interface CreateAnnouncementInput {
  title: string;
  content: string;
  priority: 'info' | 'alert' | 'event';
  authorId: string;
  authorName: string;
  communityId: string;
}

export interface ExpenseBreakdown {
  category: 'water' | 'electricity' | 'salaries' | 'maintenance' | 'security' | 'other';
  label: string;
  amount: number;
}

export interface ExpenseRecord {
  id: string;
  unitId: string;
  month: string; // YYYY-MM
  amount: number;
  breakdown: ExpenseBreakdown[];
  status: 'paid' | 'pending' | 'overdue';
  dueDate: string;
  paidAt?: string;
}

export interface ResidentFinanceExpense {
  id: string;
  unit_id: string;
  month: string;
  amount: number;
  status: 'pending' | 'paid' | 'overdue';
  due_date: string;
  paid_at?: string;
  units?: {
    number: string;
  };
}

export type HaulmerFeeMode = 'base_percent' | 'mixed';

export interface HaulmerTariffRange {
  id: string;
  label: string;
  minInclusive: number;
  maxInclusive: number | null;
  basePercent: number;
  mixedPercent: number;
  mixedFixedFee: number;
}

export interface HaulmerFeeCalculation {
  baseAmount: number;
  feeMode: HaulmerFeeMode;
  range: HaulmerTariffRange;
  netFee: number;
  vat: number;
  vatRate: number;
  totalFee: number;
  totalWithFee: number;
}

export interface CommunityFinance {
  period: string;
  totalRevenue: number;
  totalBilled: number;
  totalExpenses: number;
  reserveFund: number;
  pendingAmount: number;
  overdueAmount: number;
  collectionRate: number; // 0-100
  totalUnits: number;
  billedUnits: number;
  paidUnits: number;
  pendingUnits: number;
  chronicDebtors: number;
  monthlyTrend: { month: string; monto: number }[];
  categoryBreakdown: { name: string; value: number; color?: string }[];
  recentActivity: {
    id: string;
    type: 'income' | 'expense';
    title: string;
    amount: number;
    date: string;
  }[];
}

export interface QRInvitation {
  id: string;
  residentId: string;
  unitId: string;
  guestName: string;
  guestDni: string;
  qrCode: string; // Dynamic string for QR generation
  validFrom: string;
  validTo: string;
  status: 'active' | 'used' | 'expired' | 'cancelled';
  createdAt: string;
}

export interface PollOption {
  id: string;
  text: string;
  votes: number;
}

export interface SupabasePollOptionRow {
  id: string;
  text?: string | null;
  label?: string | null;
}

export interface SupabasePollVoteRow {
  option_id: string;
}

export interface SupabasePollRow {
  id: string;
  title: string;
  description?: string | null;
  end_date?: string | null;
  status?: 'active' | 'closed' | string | null;
  category?: 'maintenance' | 'community' | 'rules' | 'other' | string | null;
  created_at?: string | null;
  options?: SupabasePollOptionRow[] | null;
  poll_options?: SupabasePollOptionRow[] | null;
  votes?: SupabasePollVoteRow[] | null;
}

export interface Poll {
  id: string;
  title: string;
  description: string;
  options: PollOption[];
  endDate: string;
  totalVotes: number;
  status: 'active' | 'closed';
  category: 'maintenance' | 'community' | 'rules' | 'other';
  createdAt: string;
}

export interface PollWithVoteState extends Poll {
  hasVotedInit?: boolean;
  votedOptionId?: string | null;
}

export interface PollVoteRecord {
  poll_id: string;
  option_id: string;
}

export interface Vote {
  id: string;
  pollId: string;
  userId: string;
  optionId: string;
  createdAt: string;
}

export interface BuildingAsset {
  id: string;
  name: string;
  category: 'elevator' | 'pump' | 'generator' | 'pool' | 'electrical' | 'fire' | 'other';
  brand: string;
  model: string;
  installationDate: string;
  location: string;
  healthStatus: 'optimal' | 'warning' | 'critical';
  lastMaintenance: string;
  nextMaintenance: string;
}

export interface MaintenanceTask {
  id: string;
  assetId: string;
  title: string;
  description: string;
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'annually';
  dueDate: string;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in_progress' | 'completed' | 'overdue';
}

export interface MaintenanceLog {
  id: string;
  assetId: string;
  taskId?: string;
  performedBy: string;
  description: string;
  cost: number;
  date: string;
  attachments?: string[];
}

export interface MaintenanceServiceRow {
  id: string;
  service_type?: string | null;
  category?: string | null;
  description?: string | null;
  status?: string | null;
  scheduled_date?: string | null;
  preferred_date?: string | null;
  created_at?: string | null;
}

export interface CocoCase {
  id: string;
  title: string;
  type?: string | null;
  category: string;
  urgency: 'baja' | 'media' | 'alta' | 'emergencia';
  action?: string | null;
  status: 'open' | 'in_progress' | 'resolved' | 'closed' | 'cancelled';
  reason?: string | null;
  source_message: string;
  assistant_reply?: string | null;
  unit_label?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface CocoCaseEvent {
  id: string;
  case_id: string;
  event_type: 'created' | 'status_changed' | 'comment' | 'system';
  from_status: string | null;
  to_status: string | null;
  body: string | null;
  actor_role: string | null;
  created_at: string;
}

export interface ResidentCasesSummary {
  cases: CocoCase[];
  eventsByCase: Record<string, CocoCaseEvent[]>;
}

export interface AdminProfile {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
  units?: { number: string }[] | { number: string } | null;
}

export interface AdminUsersDirectory {
  users: AdminProfile[];
  communityName: string;
  residentCode: string | null;
  conciergeCode: string | null;
}

export interface ServiceRequestQueueItem {
  id: string;
  provider_id: string | null;
  user_id: string;
  preferred_date: string | null;
  preferred_time: string | null;
  description: string;
  status: 'pending' | 'accepted' | 'completed' | 'cancelled';
  created_at: string;
  service_providers?: {
    name: string;
    category: string;
    contact_phone?: string | null;
  } | null;
}

export interface MaintenanceAdminOverview {
  services: MaintenanceServiceRow[];
  cases: CocoCase[];
  assets: BuildingAsset[];
  logs: MaintenanceLog[];
}

export interface MaintenanceDashboardData extends MaintenanceAdminOverview {
  tasks: MaintenanceTask[];
  serviceRequests: ServiceRequestQueueItem[];
}

export interface WaterReading {
  id: string;
  unit_id: string;
  reading_value: number;
  reading_date: string;
  month: string;
  year: number;
  created_at: string;
  created_by?: string;

  // Computed frontend fields (optional)
  consumption?: number;
}

export interface ConsumptionMetric {
  month: string;
  personal: number;
  average: number;
}

export interface SocialPost {
  id: string;
  author_id: string;
  content: string;
  image_url?: string;
  likes_count: number;
  created_at: string;
  profiles?: {
    name: string;
    avatar_url?: string;
    unit_id?: string;
  };
  has_liked?: boolean; // Client-side computed
  comments_count?: number; // Client-side computed
}

export interface SocialComment {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  created_at: string;
  profiles?: {
    name: string;
    avatar_url?: string;
  };
}

export type ReelAudience = 'administrators' | 'committee' | 'residents' | 'property_managers';
export type ReelTone = 'premium' | 'urgent' | 'warm' | 'educational';

export interface ReelAgentInput {
  objective: string;
  audience: ReelAudience;
  tone: ReelTone;
  durationSeconds: number;
  featureFocus: string;
  proofPoint?: string;
  offer?: string;
  callToAction?: string;
}

export interface ReelScene {
  time: string;
  visual: string;
  onScreenText: string;
  voiceOver: string;
  productionNote: string;
}

export interface ReelCreativePackage {
  id: string;
  title: string;
  angle: string;
  hook: string;
  audienceLabel: string;
  durationSeconds: number;
  coverText: string;
  scenes: ReelScene[];
  caption: string;
  hashtags: string[];
  audioDirection: string;
  productionChecklist: string[];
  editingPrompt: string;
  createdAt: string;
  modelSource: 'anthropic' | 'template';
}

export type MarketingReelStatus =
  | 'draft'
  | 'generated'
  | 'rendering'
  | 'rendered'
  | 'approved'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'blocked'
  | 'failed';

export type MarketingCampaignStatus = 'draft' | 'active' | 'paused' | 'completed';
export type InstagramConnectionStatus = 'not_connected' | 'connected' | 'needs_reauth' | 'disabled';

export interface ReelRenderSpec {
  format: 'vertical_9_16';
  width: number;
  height: number;
  durationSeconds: number;
  brand: {
    name: string;
    domain: string;
    primaryColor: string;
    backgroundColor: string;
  };
  scenes: Array<ReelScene & { index: number }>;
  caption: string;
  hashtags: string[];
}

export interface MarketingCampaign {
  id: string;
  title: string;
  objective: string;
  audience: ReelAudience;
  tone: ReelTone;
  status: MarketingCampaignStatus;
  createdAt: string;
  updatedAt?: string | null;
}

export interface InstagramConnectionSummary {
  status: InstagramConnectionStatus;
  username?: string | null;
  instagramUserId?: string | null;
  pageId?: string | null;
  connectedAt?: string | null;
  lastError?: string | null;
}

export interface MarketingReelRecord {
  id: string;
  campaignId?: string | null;
  title: string;
  objective: string;
  audience: ReelAudience;
  tone: ReelTone;
  durationSeconds: number;
  featureFocus: string;
  status: MarketingReelStatus;
  creativePackage: ReelCreativePackage;
  renderSpec: ReelRenderSpec;
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
  caption: string;
  hashtags: string[];
  scheduledAt?: string | null;
  publishedAt?: string | null;
  instagramMediaId?: string | null;
  failureReason?: string | null;
  createdAt: string;
  updatedAt?: string | null;
}

export interface ProductCapabilities {
  onlinePayments: boolean;
  marketingReels: boolean;
  iotAutomation: boolean;
  externalMonitoring: boolean;
  supermarketOrdering: boolean;
}

export type ProductCapabilityKey = keyof ProductCapabilities;

export type CommercialLeadSource =
  | 'landing_contact'
  | 'commercial_tour'
  | 'onboarding_preactivation';

export type CommercialLeadStatus =
  | 'received'
  | 'notified'
  | 'delivery_pending'
  | 'contacted'
  | 'closed';

export interface CommercialLeadRequest {
  adminName: string;
  adminEmail: string;
  condoName?: string;
  message?: string;
  source: CommercialLeadSource;
  website?: string;
}

export interface CommercialLeadResponse {
  ok: boolean;
  leadId?: string;
  emailSent: boolean;
  teamNotified: boolean;
  status: CommercialLeadStatus;
  message: string;
  error?: string;
}

export interface CommercialLeadFormProps {
  source: CommercialLeadSource;
}

export interface ContactAdminModalProps {
  onClose: () => void;
}

export interface EmailDeliveryResult {
  sent: boolean;
  id?: string;
  error?: string;
}

export interface SuperAdminPricingTier {
  id: string;
  name: string;
  price_per_unit: number;
  base_price: number;
  features: Record<string, boolean>;
}

export type CommunitySubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'trialing';

export interface SuperAdminCommunity {
  id: string;
  name: string;
  address: string;
  tier_id: string;
  subscription_status: CommunitySubscriptionStatus;
  admin_code: string;
  resident_code: string;
  created_at: string;
}

export interface SuperAdminCommercialLead {
  id: string;
  admin_name: string;
  admin_email: string;
  condo_name: string;
  message: string | null;
  source: CommercialLeadSource;
  status: CommercialLeadStatus;
  delivery_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface SuperAdminDashboardResponse {
  communities: SuperAdminCommunity[];
  tiers: SuperAdminPricingTier[];
  leads: SuperAdminCommercialLead[];
  error?: string;
}

export interface ProductionHealthSnapshot {
  ok: boolean;
  status: string;
  runtime?: {
    productionReady?: boolean;
    fullPaidProductionReady?: boolean;
    deferredProduction?: string[];
  };
}

export interface DebugEndpointResult {
  status?: number;
  ok?: boolean;
  time?: string;
  url_used: string;
  error?: string;
}

export interface DebugStatsSnapshot {
  env: {
    NEXT_PUBLIC_SITE_URL: string;
    API_BASE_URL: string;
    window_origin: string;
  };
  endpoints: Record<string, DebugEndpointResult>;
}

export type PrivacyConsentType = 'terms' | 'privacy_notice' | 'whatsapp' | 'ai_processing' | 'sensitive_data';
export type PrivacyConsentAction = 'granted' | 'withdrawn';
export type PrivacyConsentChannel = 'signup' | 'profile' | 'privacy_center' | 'admin_onboarding';

export interface PrivacyConsentEvent {
  id: string;
  userId: string | null;
  communityId: string | null;
  consentType: PrivacyConsentType;
  action: PrivacyConsentAction;
  policyVersion: string;
  channel: PrivacyConsentChannel;
  createdAt: string;
}

export type DataSubjectRequestType = 'access' | 'rectification' | 'deletion' | 'opposition' | 'portability';
export type DataSubjectRequestStatus = 'received' | 'identity_check' | 'in_progress' | 'completed' | 'rejected' | 'cancelled';

export interface DataSubjectRequest {
  id: string;
  requestType: DataSubjectRequestType;
  status: DataSubjectRequestStatus;
  details: string | null;
  responseSummary: string | null;
  receivedAt: string;
  dueAt: string;
  completedAt: string | null;
}

export interface SignupResponse {
  ok?: boolean;
  role?: UserRole;
  requiresEmailConfirmation?: boolean;
  error?: string;
}

export interface DataSubjectRequestRecord {
  id: string;
  request_type: DataSubjectRequestType;
  status: DataSubjectRequestStatus;
  details: string | null;
  response_summary: string | null;
  received_at: string;
  due_at: string;
  completed_at: string | null;
}

export interface PrivacyRequestsResponse {
  requests?: DataSubjectRequestRecord[];
  request?: DataSubjectRequestRecord;
  error?: string;
}

export interface PrivacyConsentRecord {
  id: string;
  consent_type: PrivacyConsentType;
  action: PrivacyConsentAction;
  policy_version: string;
  channel: PrivacyConsentChannel;
  created_at: string;
}

export interface PrivacyConsentsResponse {
  whatsappEnabled?: boolean;
  events?: PrivacyConsentRecord[];
  error?: string;
}

export interface LegacyRedirectPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export interface SolidarityResolutionResult {
  user_id: string;
  category: 'unemployment' | 'pensioner' | 'medical' | 'emergency';
  approved_amount: number;
}
