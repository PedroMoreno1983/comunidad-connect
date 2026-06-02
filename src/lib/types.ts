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

export interface Package {
  id: string;
  recipientUnitId: string;
  description: string;
  receivedAt: string;
  pickedUpAt?: string;
  status: 'pending' | 'picked-up';
}

export interface Amenity {
  id: string;
  name: string;
  description: string;
  maxCapacity: number;
  hourlyRate: number; // 0 if free
  iconName: string; // Lucide icon name
  gradient: string; // Tailwind gradient classes
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

export interface Announcement {
  id: string;
  title: string;
  content: string;
  author: string; // Admin Name
  priority: 'info' | 'alert' | 'event';
  createdAt: string;
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

export interface CommunityFinance {
  totalRevenue: number;
  totalExpenses: number;
  reserveFund: number;
  collectionRate: number; // 0-100
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
