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
  sharePermille?: number | null; // Alícuota en tanto por mil (‰); la suma de la comunidad debería dar 1000
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

export type SupermarketStore =
  | 'Jumbo'
  | 'Santa Isabel'
  | 'Lider'
  | 'Unimarc'
  | 'Tottus'
  | 'aCuenta'
  | 'Irurzun';

export type SupermarketChannelType = 'retail' | 'wholesale';
export type SupermarketGroupOrderStatus = 'open' | 'ready' | 'locked' | 'completed' | 'cancelled';

export interface SupermarketGroupOrderItem {
  id: string;
  orderId: string;
  userId: string;
  memberName: string;
  requestedTerm: string;
  quantity: number;
  createdAt: string;
  updatedAt: string;
}

export interface SupermarketGroupOrderMember {
  userId: string;
  name: string;
  joinedAt: string;
  /** Cuando el organizador dio por recibido su pago. null = pendiente. */
  paidAt: string | null;
}

export interface SupermarketGroupSettlement {
  userId: string;
  memberName: string;
  amount: number;
  payeeUserId: string;
  payeeName: string;
  isOrganizer: boolean;
  paidAt: string | null;
}

export interface SupermarketGroupOrder {
  id: string;
  communityId: string;
  createdBy: string;
  title: string;
  status: SupermarketGroupOrderStatus;
  closesAt: string;
  selectedStore?: SupermarketStore | null;
  selectedTotal?: number | null;
  selectedChannelType?: SupermarketChannelType | null;
  retailerUrl?: string | null;
  selectedItems: SupermarketGroupComparisonItem[];
  members: SupermarketGroupOrderMember[];
  items: SupermarketGroupOrderItem[];
  settlements: SupermarketGroupSettlement[];
  canManage: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface SupermarketGroupCreateInput {
  title: string;
  closesAt: string;
  shoppingList: string;
  requestId: string;
}


export type SupermarketMeasurementUnit = 'kg' | 'g' | 'l' | 'ml';

export interface SupermarketGroupComparisonItem {
  requestedTerm: string;
  requestedQuantity: number;
  requestedUnit?: SupermarketMeasurementUnit;
  name: string;
  store: SupermarketStore;
  price: number;
  quantity: number;
  packUnits: number;
  suppliedQuantity: number;
  lineTotal: number;
  productUrl?: string;
}

export interface SupermarketGroupComparison {
  orderId: string;
  store: SupermarketStore;
  channelType: SupermarketChannelType;
  subtotal: number;
  complete: boolean;
  missingTerms: string[];
  items: SupermarketGroupComparisonItem[];
  retailerUrl: string;
}

export interface SupermarketSearchCandidate {
  id: string;
  name: string;
  brand?: string;
  /** Codigo de la tienda. Sin el no se puede cargar el carro por API. */
  sku?: string;
  /**
   * Lider/Walmart: identificador de oferta que exige el enlace oficial de la app.
   * Es distinto del sku y solo existe para esa cadena.
   */
  offerId?: string;
  /** Unidad de venta que Lider interpreta al procesar el enlace oficial. */
  salesUnit?: string;
  requestedTerm: string;
  requestedQuantity: number;
  requestedUnit?: SupermarketMeasurementUnit;
  quantity: number;
  packUnits: number;
  suppliedQuantity: number;
  price: number;
  lineTotal: number;
  store?: string;
  productUrl?: string;
  originalPrice?: number;
  isOffer?: boolean;
  /** Por qué CoCo eligió esta marca/presentación (visible para el usuario). */
  selectionReason?: string;
  fetchedAt?: string;
}

export interface SupermarketShoppingItem extends SupermarketSearchCandidate {
  checked: boolean;
  available: boolean;
  source: 'catalog' | 'live' | 'missing' | 'manual';
}

export interface SupermarketBasketSummary {
  store: string;
  subtotal: number;
  coveredCount: number;
  requestedCount: number;
  coveragePercent: number;
  missingTerms: string[];
  complete: boolean;
}
export interface SupermarketBasketCandidate extends SupermarketBasketSummary {
  channelType: SupermarketChannelType;
  items: SupermarketSearchCandidate[];
  fetchedAt?: string;
}

export type SupermarketComparisonSourceStatus = 'ok' | 'no_results' | 'degraded';

export interface SupermarketComparisonSource {
  store: string;
  status: SupermarketComparisonSourceStatus;
}

export type SupermarketPurchasePlanStatus = 'single_store' | 'split_store' | 'needs_substitution';

export interface SupermarketPurchasePlanBasket {
  store: string;
  channelType: SupermarketChannelType;
  subtotal: number;
  items: SupermarketSearchCandidate[];
}

export interface SupermarketSubstitutionTask {
  requestedTerm: string;
  suggestedStore?: string;
  searchUrl?: string;
  reason: string;
}

export interface SupermarketPurchasePlan {
  status: SupermarketPurchasePlanStatus;
  complete: boolean;
  total: number;
  requestedCount: number;
  resolvedCount: number;
  storeCount: number;
  baskets: SupermarketPurchasePlanBasket[];
  unresolvedTerms: string[];
  substitutionTasks: SupermarketSubstitutionTask[];
}

export interface SupermarketRequestedItem {
  term: string;
  quantity: number;
  unit?: SupermarketMeasurementUnit;
}

export interface SupermarketSearchResponse {
  error?: string;
  message: string;
  items: SupermarketShoppingItem[];
  fetchedAt?: string;
  mode?: string;
  recommendedStore?: string | null;
  basketSubtotal?: number;
  basketReady: boolean;
  requestedCount: number;
  foundCount: number;
  missingTerms: string[];
  alternativesByTerm?: Record<string, SupermarketSearchCandidate[]>;
  requestedItems?: SupermarketRequestedItem[];
  basketComparison?: SupermarketBasketSummary[];
  basketOptions?: SupermarketBasketCandidate[];
  sources?: SupermarketComparisonSource[];
  degradedStores?: string[];
}

export interface SupermarketCartButtonProps {
  store: string;
  items: SupermarketSearchCandidate[];
  complete?: boolean;
}

export interface SupermarketCartHandoffItem {
  id: string;
  name: string;
  requestedTerm: string;
  quantity: number;
  sku?: string;
  offerId?: string;
  salesUnit?: string;
  productUrl?: string;
  /**
   * Precio unitario con el que se cotizo la canasta. Sirve para no sustituir en
   * silencio por otro producto cuando el sku exacto no esta disponible.
   */
  price?: number;
}

export interface SupermarketCartHandoff {
  supported: boolean;
  store: string;
  mode: 'remote_browser' | 'direct_url' | 'official_app_link' | 'unavailable';
  cartUrl?: string;
  /** Enlaces consecutivos que, juntos, cubren toda la canasta en la app oficial. */
  cartUrls?: string[];
  sessionUrl?: string;
  sessionId?: string;
  expiresAt?: string;
  plannedCount: number;
  missingItems: string[];
  reason?: string;
}

export interface LiderShoppableCartProduct {
  upc: string;
  oid: string;
  q: string;
  qu: string | null;
}

export interface LiderShoppableCartPayload {
  rid: string;
  cd: LiderShoppableCartProduct[];
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

export type SolidarityActiveTab = 'transparency' | 'apply' | 'tasks';

export interface SolidarityFund {
  id: string;
  community_id: string;
  balance: number | string;
  updated_at: string;
}

export interface SolidarityLedgerEntry {
  id: string;
  community_id: string;
  entry_type: 'contribution' | 'subsidize' | 'work_offset';
  amount: number | string;
  hours: number | string;
  description: string;
  created_at: string;
}

export interface SolidarityApplication {
  id: string;
  community_id: string;
  user_id: string;
  category: 'unemployment' | 'pensioner' | 'medical' | 'emergency';
  description: string;
  amount_requested: number | string;
  amount_approved: number | string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  resolved_at: string | null;
  profiles?: {
    name: string;
    email: string;
  };
}

export interface SolidarityTask {
  id: string;
  community_id: string;
  title: string;
  category: 'gardening' | 'packages' | 'recycling' | 'digital';
  hours: number | string;
  status: 'free' | 'reserved' | 'completed';
  reserved_by: string | null;
  reserved_at: string | null;
  completed_at: string | null;
  verified_by: string | null;
  pin_code: string;
  created_at: string;
  profiles?: { name: string };
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
  /** La cuenta existe igual si esto es false: solo falló el envío del correo. */
  confirmationEmailSent?: boolean;
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
export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'alert';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  link?: string;
}

export interface NotificationRowProps {
  notification: Notification;
  onRead: () => void;
  onRemove: () => void;
}
export interface ResidentNavigationContext {
  hasMarketplaceListings: boolean;
  isServiceProvider: boolean;
}

export interface ConciergeOperationEvent {
  id: string;
  action: string;
  summary: string;
  severity: 'info' | 'success' | 'warning' | 'error';
  status: 'success' | 'error' | 'blocked' | 'pending';
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ConciergeHandoverForm {
  pendingVisitors: boolean;
  pendingPackages: boolean;
  criticalIncidents: boolean;
  note: string;
}
export interface ConciergeOperationsResponse {
  events?: ConciergeOperationEvent[];
  event?: ConciergeOperationEvent;
  error?: string;
}

/* ── Estacionamientos ───────────────────────────────────────── */

export type ParkingVehicleSize = 'moto' | 'auto' | 'suv' | 'camioneta';
export type ParkingSpotStatus = 'draft' | 'pending_approval' | 'published' | 'paused' | 'rejected';
export type ParkingBookingStatus = 'confirmed' | 'active' | 'completed' | 'cancelled' | 'no_show';
export type ParkingPaymentStatus = 'pending' | 'paid' | 'refunded' | 'failed';
/**
 * Autorización de un conductor para operar en un condominio concreto.
 * Es por comunidad y no un estado global del conductor: que un comité lo acepte
 * no dice nada sobre otro edificio.
 */
export type ParkingAccessRequestStatus = 'pending' | 'approved' | 'rejected';
export type ParkingAccessEventType = 'entry' | 'exit' | 'denied';

/** Conductor: puede ser un residente o alguien externo al condominio. */
export interface ParkingDriver {
  id: string;
  userId: string;
  /** Presente solo cuando el conductor además es residente de una comunidad. */
  profileId?: string;
  fullName: string;
  phone: string;
  nationalId?: string;
  plate: string;
  vehicleDescription: string;
}

/** Solicitud de acceso de un conductor externo, vista por él mismo. */
export interface ParkingCommunityAccess {
  accessId: string;
  communityId: string;
  communityName: string;
  status: ParkingAccessRequestStatus;
  reviewReason?: string;
  createdAt: string;
}

/** Solicitud pendiente en la bandeja de la administración. */
export interface ParkingAccessRequest {
  accessId: string;
  driverId: string;
  fullName: string;
  phone: string;
  nationalId?: string;
  plate: string;
  vehicleDescription: string;
  status: ParkingAccessRequestStatus;
  message: string;
  reviewReason?: string;
  createdAt: string;
  reviewedAt?: string;
}

export interface ParkingDriverInput {
  fullName: string;
  phone: string;
  plate: string;
  vehicleDescription?: string;
  nationalId?: string;
}

/** Ventana semanal de disponibilidad. weekday sigue Date.getDay(): 0 = domingo. */
export interface ParkingAvailabilityRule {
  id: string;
  spotId: string;
  weekday: number;
  startTime: string; // HH:MM
  endTime: string;   // HH:MM
}

export interface ParkingSpot {
  id: string;
  communityId: string;
  ownerId: string;
  ownerName?: string;
  unitLabel: string;
  label: string;
  description: string;
  /** Instrucciones de acceso: solo llegan al conductor con reserva confirmada. */
  accessNotes?: string;
  vehicleSize: ParkingVehicleSize;
  /** Nivel del edificio donde está el cupo. Lo declara el dueño al publicar. */
  floorLevel: ParkingFloorLevel;
  isCovered: boolean;
  hasEvCharger: boolean;
  hourlyRate: number;
  dailyRate?: number;
  monthlyRate?: number;
  minuteRate?: number;
  minHours: number;
  allowsExternal: boolean;
  status: ParkingSpotStatus;
  rejectionReason?: string;
  rating?: number;
  ratingCount?: number;
  createdAt: string;
  availability?: ParkingAvailabilityRule[];
}

export interface ParkingSpotInput {
  label: string;
  description?: string;
  accessNotes?: string;
  vehicleSize: ParkingVehicleSize;
  /** Nivel del edificio donde está el cupo. Lo declara el dueño al publicar. */
  floorLevel: ParkingFloorLevel;
  isCovered: boolean;
  hasEvCharger: boolean;
  hourlyRate: number;
  dailyRate?: number | null;
  monthlyRate?: number | null;
  minuteRate?: number | null;
  minHours: number;
  allowsExternal: boolean;
  status?: ParkingSpotStatus;
}

/** Resultado de búsqueda: incluye el precio ya cotizado para el rango pedido. */
export interface ParkingSearchResult {
  spotId: string;
  communityId: string;
  communityName: string;
  label: string;
  unitLabel: string;
  description: string;
  vehicleSize: ParkingVehicleSize;
  /** Nivel del edificio donde está el cupo. Lo declara el dueño al publicar. */
  floorLevel: ParkingFloorLevel;
  isCovered: boolean;
  hasEvCharger: boolean;
  hourlyRate: number;
  dailyRate?: number;
  monthlyRate?: number;
  minuteRate?: number;
  minHours: number;
  ownerName: string;
  quotedAmount: number;
  commercialEstimateAmount?: number;
  savingsPercent?: number;
  rating?: number;
}

export interface ParkingBooking {
  id: string;
  communityId: string;
  spotId: string;
  spotLabel?: string;
  unitLabel?: string;
  driverId: string;
  driverName?: string;
  driverPlate?: string;
  ownerId: string;
  ownerName?: string;
  driverIsResident: boolean;
  startsAt: string;
  endsAt: string;
  totalAmount: number;
  communityFeeAmount: number;
  ownerPayoutAmount: number;
  status: ParkingBookingStatus;
  paymentStatus: ParkingPaymentStatus;
  /** Código que el conductor muestra en portería. */
  accessCode: string;
  allowExtension?: boolean;
  cancellationReason?: string;
  rating?: number;
  ratingComment?: string;
  createdAt: string;
}

/** Lo que ve conserjería al validar un código o una patente en la barrera. */
export interface ParkingAccessLookup {
  bookingId: string;
  spotLabel: string;
  unitLabel: string;
  driverName: string;
  driverPhone: string;
  driverNationalId?: string;
  plate: string;
  vehicleDescription: string;
  driverIsResident: boolean;
  startsAt: string;
  endsAt: string;
  status: ParkingBookingStatus;
  isValidNow: boolean;
  lastEvent?: ParkingAccessEventType;
}

export interface ParkingAccessEvent {
  id: string;
  bookingId: string;
  communityId: string;
  eventType: ParkingAccessEventType;
  recordedBy?: string;
  notes: string;
  createdAt: string;
}

/** Ajustes que el comité de copropiedad controla desde el panel admin. */
export interface ParkingCommunitySettings {
  externalEnabled: boolean;
  commissionPercent: number;
}

export interface ParkingEarningsTransaction {
  id: string;
  bookingId?: string;
  spotLabel?: string;
  driverName?: string;
  plate?: string;
  type: 'rental_income' | 'expense_offset' | 'payout_transfer';
  description: string;
  amount: number;
  date: string;
  status: 'completed' | 'pending' | 'processing';
}

export interface ParkingOwnerEarnings {
  currentMonthEarnings: number;
  totalHistoricalEarnings: number;
  availableBalance: number;
  appliedToExpenses: number;
  totalHoursRented: number;
  totalBookingsCount: number;
  transactions: ParkingEarningsTransaction[];
}

export type ParkingFloorLevel = 'S1' | 'S2' | 'S3' | 'PB' | 'EXT';

export interface ParkingMapSpot {
  id: string;
  spotId: string;
  label: string;
  floorLevel: ParkingFloorLevel;
  position: { x: number; y: number; width?: number; height?: number };
  status: 'available' | 'reserved' | 'occupied' | 'my_spot' | 'unavailable';
  hourlyRate: number;
  isCovered: boolean;
  hasEvCharger: boolean;
  vehicleSize: ParkingVehicleSize;
  ownerName?: string;
  unitLabel?: string;
  currentBookingEndsAt?: string;
}

export interface ParkingMapLevel {
  levelId: ParkingFloorLevel;
  name: string;
  totalSpots: number;
  availableSpots: number;
  spots: ParkingMapSpot[];
}

export interface ParkingPassDetail {
  bookingId: string;
  spotLabel: string;
  unitLabel: string;
  accessCode: string;
  qrPayload: string;
  startsAt: string;
  endsAt: string;
  driverName: string;
  driverPhone: string;
  plate: string;
  vehicleDescription: string;
  communityName: string;
  communityAddress?: string;
  accessNotes?: string;
  wazeUrl: string;
  googleMapsUrl: string;
  status: ParkingBookingStatus;
  isOverdue: boolean;
  overdueMinutes: number;
  remainingMinutes: number;
}

export interface SupermarketSimulationItem {
    sku: string;
    quantity: number;
    seller?: string;
}

export interface SupermarketSimulationResult {
    supported: boolean;
    complete?: boolean;
    total?: number;
    discount?: number;
    resolvedItems?: number;
    reason?: string;
    error?: string;
    /**
     * Monto minimo de pedido que la tienda declara, en pesos.
     *
     * `undefined` significa desconocido, no ausencia de minimo, y la diferencia
     * importa: la consulta se hace sin direccion de despacho, y el minimo puede
     * aparecer o cambiar al elegir comuna o metodo de entrega. aCuenta avisa
     * "Te faltan $16.895 para completar el pedido minimo" en su propio carro, y
     * ninguna API disponible lo anticipa.
     */
    minimumOrder?: number;
    /** Si el minimo se consulto sin direccion, y por lo tanto puede cambiar. */
    minimumOrderWithoutAddress?: boolean;
}

export interface SupermarketHistoryResponse {
    enabled?: boolean;
    recorded?: number;
    error?: string;
    suggestions?: Array<{ term: string; daysSinceLast: number }>;
}

export interface SupermarketSealsResponse {
    supported?: boolean;
    seals?: Record<string, string[]>;
    error?: string;
}

// ============================================================================
// Finanzas del condominio
// ----------------------------------------------------------------------------
// Estaban definidos dentro de cada pagina de /admin/finanzas, contra la regla
// del CLAUDE.md. Un tipo que vive en la pagina no lo puede reutilizar nadie y
// se desincroniza del Service que produce esos datos: cuando cambia la forma de
// la respuesta, la pagina sigue compilando con la forma vieja.
//
// Varios llegaban con nombres que no sobreviven a un archivo compartido -Data,
// Txn, Report, Settings, Preview- asi que se renombraron por lo que son.
// ============================================================================

/** Certificado de deuda de una unidad. Antes `Certificate` en certificado/page. */
export interface DebtCertificate {
    community: { name: string; address: string | null };
    unit: { label: string; ownerName: string | null };
    issuedAt: string;
    issuedBy: string | null;
    balance: number;
    overdueAmount: number;
    oldestOverdueMonth: string | null;
    pendingByMonth: Array<{ month: string; concepts: Array<{ label: string; amount: number }>; total: number }>;
    isUpToDate: boolean;
}

/** Una linea del presupuesto anual frente a lo realmente gastado. */
export interface BudgetLine {
    category: string;
    categoryLabel: string;
    annualBudget: number;
    expectedToDate: number;
    actualToDate: number;
    variance: number;
    variancePercent: number;
}

/** Presupuesto contra ejecucion del año. Antes `Comparison` en presupuesto/page. */
export interface BudgetComparison {
    year: number;
    lines: BudgetLine[];
    totals: { annualBudget: number; expectedToDate: number; actualToDate: number; variance: number };
    monthsElapsed: number;
}

/** Rendicion mensual: que se gasto, que se cobro y que se recaudo. Antes `Report`. */
export interface MonthlyFinanceReport {
    month: string;
    expenses: { total: number; byCategory: Array<{ category: string; total: number }> };
    charged: { gastoComun: number; otherCharges: number; total: number };
    collected: { total: number; byMethod: Array<{ method: string; total: number }> };
    collectionRate: number;
    result: number;
}

/** Fondo de reserva del condominio y sus movimientos. Antes `Fund`. */
export interface ReserveFund {
    balance: number;
    totalContributions: number;
    totalWithdrawals: number;
    movements: Array<{ id: string; kind: string; amount: number; month: string; label: string }>;
}

/** Tasas que la comunidad define para su cobranza. Antes `Settings`. */
export interface FinanceSettings {
    lateInterestMonthlyRate: number;
    reserveFundRate: number;
}

/** Saldo de una unidad: cuanto se le cobro, cuanto pago y cuanto debe. */
export interface UnitBalance {
    unitId: string;
    label: string;
    balance: number;
    overdueAmount: number;
    oldestOverdueMonth: string | null;
    totalCharged: number;
    totalPaid: number;
}

/** Los saldos de toda la comunidad, con sus totales de morosidad. */
export interface CommunityBalances {
    units: UnitBalance[];
    totalDebt: number;
    totalOverdue: number;
    unitsWithDebt: number;
    unitsOverdue: number;
}

/** Un movimiento de la cartola de una unidad. */
export interface StatementEntry {
    id: string;
    date: string;
    kind: string;
    label: string;
    amount: number;
    balance: number;
    reference: string | null;
}

/** Cartola de una unidad: sus movimientos y el saldo que dejan. */
export interface UnitStatement {
    unitLabel: string;
    entries: StatementEntry[];
    balance: number;
    overdueAmount: number;
    totalCharged: number;
    totalPaid: number;
}

/** Movimiento del banco a conciliar. Antes `Txn` en conciliacion/page. */
export interface BankTransaction {
    id: string;
    txnDate: string;
    amount: number;
    description: string;
    reference: string | null;
    status: string;
    matchedPaymentId: string | null;
}

/** Pago registrado por una unidad. Antes `Payment`, demasiado generico. */
export interface UnitPayment {
    id: string;
    unitLabel: string;
    amount: number;
    paidAt: string;
    method: string;
    reference: string | null;
    matched: boolean;
}

/** Calce propuesto entre un movimiento del banco y un pago. */
export interface ReconciliationSuggestion {
    transactionId: string;
    paymentId: string;
    dayGap: number;
    referenceMatch: boolean;
}

/** Todo lo que la pantalla de conciliacion necesita. Antes `Data`. */
export interface ReconciliationData {
    transactions: BankTransaction[];
    unmatchedPayments: UnitPayment[];
    suggestions: ReconciliationSuggestion[];
    summary: {
        totalTransactions: number;
        matched: number;
        pending: number;
        ignored: number;
        unexplainedDeposits: number;
        pendingInflowAmount: number;
    };
}

/** Gasto del condominio a prorratear entre las unidades. */
export interface CommunityExpense {
    id: string;
    category: string;
    label: string;
    amount: number;
    provider: string | null;
    prorate_method: "share" | "equal";
}

/** Una emision de gastos comunes ya realizada. Antes `IssuedRun`. */
export interface IssuedBillingRun {
    id: string;
    total_amount: number;
    units_count: number;
    due_date: string;
    issued_at: string;
}

/** Lo que le tocaria pagar a una unidad en una emision. Antes `PreviewUnit`. */
export interface BillingPreviewUnit {
    unitId: string;
    label: string;
    sharePermille: number | null;
    total: number;
}

/** Simulacion de una emision antes de cursarla. Antes `Preview`. */
export interface BillingPreview {
    unitCount: number;
    totalExpenses: number;
    totalCharged: number;
    fellBackToEqualSplit: boolean;
    warnings: string[];
    units: BillingPreviewUnit[];
}

/** Una alternativa concreta con menos sellos informados que el producto elegido. */
export interface SupermarketSealAlternativeOption {
    sku: string;
    name: string;
    price: number;
    seals: string[];
    /** Diferencia contra el producto actual. Positivo = cuesta mas. */
    priceDelta: number;
}

/**
 * Alternativas para un producto de la canasta. `seals: null` en `current`
 * significa que no se pudieron consultar, no que el producto no tenga: sin ese
 * dato no hay contra que comparar y `options` viene vacio.
 */
export interface SupermarketSealAlternative {
    requestedTerm: string;
    current: { sku: string; name: string; price: number; seals: string[] | null };
    options: SupermarketSealAlternativeOption[];
    unknownCurrent: boolean;
}

export interface SupermarketAlternativesResponse {
    supported?: boolean;
    alternatives?: SupermarketSealAlternative[];
    error?: string;
}

// ─── Onboarding de nóminas ──────────────────────────────────────────────────
// Vivían repartidos entre `documentExtractor.ts` y la página, que redeclaraba
// `OnboardingAssessment` con su propia copia. Dos declaraciones de la misma
// respuesta se separan en silencio: la página compila con la forma vieja.

export interface ExtractedResident {
    name: string;
    unit_id: string;
    email: string;
    phone: string;
}

/** Fila ya guardada: la que vuelve del lote con su id. */
export interface OnboardingExtractedRow extends ExtractedResident {
    id: string;
}

export interface OnboardingAssessment {
    totalRows: number;
    validRows: number;
    missingNameRows: number;
    missingUnitRows: number;
    missingContactRows: number;
    duplicateUnits: string[];
    confidenceScore: number;
    warnings: string[];
}

export interface ExtractedDocumentKnowledge {
    title: string;
    documentKind: string;
    summary: string;
    searchText: string;
}

/**
 * Los dos endpoints de lotes devuelven documentos con forma distinta bajo la
 * misma llave `documents`, y por eso son dos tipos y no uno: el POST informa lo
 * que acaba de procesar (camelCase, en memoria) y el GET devuelve la fila
 * guardada (snake_case, tal como sale de la tabla).
 */
export interface OnboardingBatchDocumentResult {
    id: string;
    fileName: string;
    status: string;
    rows: number;
    error?: string;
}

export interface OnboardingBatchDocumentRecord {
    id: string;
    file_name: string;
    document_kind?: string | null;
    summary?: string | null;
    status?: string | null;
    extracted_rows?: number | null;
    error?: string | null;
    size_bytes?: number | null;
    created_at?: string | null;
}

export interface OnboardingBatchRecord {
    id?: string;
    status?: string | null;
    row_count?: number | null;
    valid_row_count?: number | null;
    warnings?: string[] | null;
}

export interface OnboardingBatchExtractResponse {
    error?: string;
    batchId?: string | null;
    status?: string;
    data?: OnboardingExtractedRow[];
    assessment?: OnboardingAssessment;
    documents?: OnboardingBatchDocumentResult[];
}

/** El detalle del lote agrega el estado por fila, que el POST no tiene aun. */
export interface OnboardingBatchStoredRow extends OnboardingExtractedRow {
    status?: string | null;
    warnings?: string[] | null;
    error?: string | null;
    documentId?: string | null;
}

export interface OnboardingBatchDetailResponse {
    error?: string;
    batch?: OnboardingBatchRecord;
    documents?: OnboardingBatchDocumentRecord[];
    data?: OnboardingBatchStoredRow[];
}

export interface OnboardingBatchRetryResponse {
    error?: string;
    recovered?: number;
    remaining?: number;
    assessment?: OnboardingAssessment;
    data?: OnboardingExtractedRow[];
}

export interface OnboardingSyncRowResult {
    name: string;
    unit: string;
    status: 'synced' | 'unit_only' | 'failed';
    detail: string;
}

export interface OnboardingUpsertResponse {
    error?: string;
    message?: string;
    processed?: number;
    success?: number;
    errors?: number;
    unitOnly?: number;
    destinations?: string[];
    rowResults?: OnboardingSyncRowResult[];
}

/** Resumen que la pantalla arma tras sincronizar; no viaja por la API. */
export interface OnboardingSyncResult {
    fileName: string;
    rows: number;
    success: number;
    errors: number;
    unitOnly: number;
}

// ─── Geocodificación de la dirección del condominio ─────────────────────────

export interface GeocodeSuggestion {
    label: string;
    latitude: number;
    longitude: number;
    placeId: string;
    /** La página lo declaraba como `string`; el endpoint solo emite estos dos. */
    source: 'mapbox' | 'nominatim';
}

export interface GeocodeSuggestionsResponse {
    suggestions: GeocodeSuggestion[];
}

export interface AdminOnboardingRegisterResponse {
    error?: string;
    code?: string;
    loginUrl?: string;
}

// ─── Unidades y alícuotas ───────────────────────────────────────────────────

/** Perfil como opción de un selector de residente. */
export interface UnitProfileOption {
    id: string;
    name: string;
    email: string;
    role: string;
}

/**
 * Unidad con el perfil embebido por el join y la alícuota cruda. Supabase puede
 * devolver `share_permille` como texto, y por eso el tipo lo admite en vez de
 * mentir con `number`.
 */
export type UnitRow = Unit & {
    profiles?: { name: string; email: string } | null;
    share_permille?: number | string | null;
};

// ─── WhatsApp: estado de la integración y avisos masivos ────────────────────

export interface WhatsAppSetupInfo {
    provider: string;
    inboundMethod: string;
    inboundContentType: string;
    inboundPath: string;
    outboundPath: string;
    paymentTemplateSetupPath?: string;
}

export interface WhatsAppStatus {
    configured: boolean;
    webhookConfigured: boolean;
    accountSidMasked: string;
    fromMasked: string;
    webhookUrl: string;
    requiredEnv: Record<string, boolean>;
    setup?: WhatsAppSetupInfo;
}

export interface WhatsAppBroadcastFailure {
    userId: string;
    reason: string;
}

/** Lo que la pantalla muestra tras un envío real. */
export interface WhatsAppBroadcastResult {
    sent: number;
    skipped: number;
    failed: number;
    recipients: number;
    truncated?: boolean;
    detail?: string;
    failures?: WhatsAppBroadcastFailure[];
}

/**
 * El mismo endpoint responde dos formas: el conteo previo (`dryRun`) no trae
 * `sent`, `skipped` ni `failed`. Un solo tipo con todo obligatorio prometía
 * campos que la consulta previa nunca devuelve.
 */
export interface WhatsAppBroadcastResponse {
    error?: string;
    dryRun?: boolean;
    limit?: number;
    sent?: number;
    skipped?: number;
    failed?: number;
    recipients?: number;
    truncated?: boolean;
    detail?: string;
    failures?: WhatsAppBroadcastFailure[];
}

// ─── Centro operativo y salud del sistema ───────────────────────────────────

export interface OperationEvent {
    id: string;
    action: string;
    entity_type: string;
    entity_id?: string | null;
    severity: 'info' | 'success' | 'warning' | 'error';
    status: 'success' | 'error' | 'blocked' | 'pending';
    summary: string;
    metadata?: Record<string, unknown> | null;
    created_at: string;
}

export interface OperationEventsSummary {
    total: number;
    success: number;
    warnings: number;
    errors: number;
    pending: number;
}

export interface OperationsResponse {
    error?: string;
    summary: OperationEventsSummary;
    events: OperationEvent[];
}

/**
 * Un grupo de `/api/health` no es solo banderas: `integrationDetail` anida
 * objetos y hasta un texto (`iotMode`). Declararlo como
 * `Record<string, boolean>` hacia que el conteo de chequeos sanos sumara esos
 * objetos por ser truthy, e inflaba las dos cifras a la vez.
 */
export type HealthCheckGroup = Record<string, unknown>;

export interface HealthRuntimeInfo {
    productionReady: boolean;
    fullPaidProductionReady: boolean;
    missingProduction: string[];
    deferredProduction: string[];
}

export interface HealthResponse {
    ok?: boolean;
    status?: string;
    service?: string;
    checkedAt?: string;
    runtime?: HealthRuntimeInfo;
    checks?: Record<string, HealthCheckGroup>;
}

// ─── Gasto común visto por el residente ─────────────────────────────────────

/**
 * Fila cruda de `expenses` con su desglose. `unit_id` es TEXT en la base, no
 * UUID, y `amount` llega como número o texto segun el driver: por eso el tipo
 * los admite en vez de prometer lo que la base no garantiza.
 */
export interface ExpenseDatabaseRow {
    id: string;
    unit_id?: string | null;
    month?: string | null;
    amount?: number | string | null;
    status?: ExpenseRecord['status'] | null;
    due_date?: string | null;
    paid_at?: string | null;
    payment_metadata?: { amount?: number | string | null } | null;
    items?: ExpenseItemDatabaseRow[] | null;
}

export interface ExpenseItemDatabaseRow {
    category?: ExpenseBreakdown['category'] | null;
    label?: string | null;
    amount?: number | string | null;
}

/**
 * Lo que la pantalla del residente muestra: el cobro mas lo que se sabe del
 * pago. `ExpenseRecord` describe el cobro nomas y no tiene donde poner el monto
 * efectivamente pagado, que puede diferir del emitido.
 */
export interface UnitExpenseView extends Omit<ExpenseRecord, 'paidAt'> {
    /** `null` es "no pagado" y llega asi desde la base; no es lo mismo que ausente. */
    paidAt?: string | null;
    paymentAmount?: number | null;
}

// ─── CoCo en el chat del residente ──────────────────────────────────────────

export interface CoCoPendingAction {
    toolUseId: string;
    name: string;
    input: Record<string, unknown>;
    title: string;
    summary: string;
}

/** Resoluciones del usuario a una tanda de acciones pendientes, por tool_use_id. */
export type CoCoResolutions = Record<string, 'approved' | 'rejected'>;

/** Lo que `/api/coco` devuelve al navegador. */
export interface CoCoApiResponse {
    reply?: string;
    navigate?: string;
    action?: string;
    pendingActions?: CoCoPendingAction[];
}

export interface CoCoChatMessage {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    nav?: string;
    action?: string;
    pendingActions?: CoCoPendingAction[];
    resolvedActions?: CoCoResolutions;
}

// ─── Marketplace: resumen de la publicación recién creada ───────────────────

export interface MarketplacePublicationSummary {
    title: string;
    modes: string[];
    imageCount: number;
    createdAt: string;
}

// ─── Reels Agent (marketing) ────────────────────────────────────────────────

/** Lo que hay configurado hoy: cada bandera es una credencial presente o no. */
export interface MarketingCapabilities {
    aiScriptGeneration: boolean;
    videoRendering: boolean;
    professionalAudio: boolean;
    videoAiGeneration: boolean;
    videoAiProvider: string | null;
    instagramPublishing: boolean;
    instagramOAuth: boolean;
    cronSecretConfigured: boolean;
}

export interface MarketingReelsDashboard {
    campaigns: MarketingCampaign[];
    reels: MarketingReelRecord[];
    instagram: InstagramConnectionSummary;
    capabilities: MarketingCapabilities;
}

/** El POST devuelve el mismo panel más el reel recién generado. */
export interface MarketingReelsDashboardResponse extends Partial<MarketingReelsDashboard> {
    error?: string;
    reel?: MarketingReelRecord;
}

// ─── Aula virtual ───────────────────────────────────────────────────────────

export interface TrainingLesson {
    id: string;
    title: string;
    content: string;
    order_index: number;
}

export interface TrainingModule {
    id: string;
    title: string;
    description: string;
    target_audience?: string | null;
    is_active?: boolean | null;
    community_id?: string | null;
    created_at?: string | null;
    training_lessons: TrainingLesson[];
}

export interface TrainingProgressRecord {
    module_id: string;
    status: 'in_progress' | 'completed';
    last_slide_index: number;
    started_at?: string | null;
    completed_at?: string | null;
    updated_at?: string | null;
}

// ─── Invitaciones QR de un residente ────────────────────────────────────────

export interface QrInvitation {
    id: string;
    residentId: string;
    guestName: string;
    guestDni: string;
    status: 'active' | 'used' | 'expired' | 'cancelled';
    validFrom: string;
    validTo: string;
    qrCode: string;
}

export interface QrInvitationDatabaseRow {
    id: string;
    resident_id?: string | null;
    unit_id?: string | null;
    guest_name?: string | null;
    guest_dni?: string | null;
    status?: QrInvitation['status'] | null;
    valid_from?: string | null;
    valid_to?: string | null;
    qr_code?: string | null;
    community_id?: string | null;
    created_at?: string | null;
}

// ─── Lista de compras: autocompletado y corrección ──────────────────────────

export interface ShoppingTermSuggestion {
    term: string;
    /** Cuántos productos del catálogo responden a este término. */
    products: number;
}

/**
 * `unverified` no es `unknown`: el primero significa que no se pudo consultar el
 * vocabulario, el segundo que sí se consultó y el término no aparece. Marcar lo
 * no verificado como error haría que la pantalla le achacara a la persona un
 * problema que es nuestro.
 */
export interface ShoppingTermReview {
    term: string;
    status: 'ok' | 'unknown' | 'unverified';
    suggestions: ShoppingTermSuggestion[];
}

export interface ShoppingSuggestionsResponse {
    error?: string;
    suggestions?: ShoppingTermSuggestion[];
}

export interface ShoppingReviewResponse {
    error?: string;
    items?: ShoppingTermReview[];
}
