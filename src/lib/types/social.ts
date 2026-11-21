import type { ReactNode } from 'react';
import type { User, UserRole } from './users';

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

export interface DirectoryNeighbor {
  id: string;
  name: string;
  avatar_url?: string;
  role: UserRole;
  unit_id?: string;
  unitLabel?: string;
  email?: string;
}

export type SolidarityActiveTab = 'transparency' | 'apply' | 'tasks';

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

export interface ResidentHomeAnnouncement {
  title: string;
  content: string;
  category: string;
  time: string;
}

/** Inicio del residente en modo vecino o esperando validación. */
export interface NeighborHomeProps {
  firstName: string;
  buildingName: string;
  /** true: edificio administrado, la administración aún no confirma que vive ahí. */
  pendingValidation: boolean;
  initials: string;
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

/** Códigos de invitación: solo los entrega el servidor a la administración. */
export interface AdminInviteCodes {
  residentCode: string | null;
  conciergeCode: string | null;
  adminCode: string | null;
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

/** Lo que ven los vecinos de una comunidad sin administrar. */
export type NeighborModeSummary = { buildingName: string; residents: number; highlightInvite: boolean };

export interface NeighborModeBannerProps {
  pathname: string;
  buildingName?: string;
}

/** Edificio sin administrar en la lista de superadmin. */
export type NeighborBuildingRow = { id: string; name: string; address: string; createdAt: string; residents: number; readyForSales: boolean };

/** Pantalla de la administración vista en modo vecino. */
export type NeighborModeGate = { title: string; description: string };

export interface NeighborModeGateProps {
  gate: NeighborModeGate;
  buildingName?: string;
  /** El edificio ya está administrado pero la administración no ha validado a este vecino. */
  pendingValidation?: boolean;
}

/** El enlace personal de un residente para invitar vecinos por WhatsApp. */
export type NeighborInviteShare = { code: string; url: string; message: string; whatsappUrl: string; buildingName: string };

export interface InviteNeighborsButtonProps {
  variant?: 'primary' | 'secondary';
}

/** Lo que ve quien abre un enlace de invitación (/unirse/<código>). */
export type NeighborInvitePreview = { code: string; buildingName: string; inviterFirstName: string };

export interface SolidarityResolutionResult {
  user_id: string;
  category: 'unemployment' | 'pensioner' | 'medical' | 'emergency';
  approved_amount: number;
}

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'alert';
  /** Para reaccionar a avisos puntuales, como 'intercom_call'. */
  category?: string;
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

export interface OnboardingConversationMessage {
    role: "user" | "assistant";
    content: string;
}

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

export type WhatsAppStartStatus =
    | { available: true; url: string }
    | { available: false; reason: 'unconfigured' | 'consent' | 'phone' };

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

// ─── Marketplace: resumen de la publicación recién creada ───────────────────

export interface MarketplacePublicationSummary {
    title: string;
    modes: string[];
    imageCount: number;
    createdAt: string;
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

export type IntercomVisitKind = "visit" | "delivery" | "service" | "other";

export type IntercomCallStatus = "ringing" | "approved" | "rejected" | "cancelled" | "expired" | "admitted";

/** Llamada del citófono digital: conserjería pregunta, la unidad aprueba o rechaza. */
export interface IntercomCall {
    id: string;
    unitId: string;
    unitNumber: string | null;
    visitorName: string;
    visitKind: IntercomVisitKind;
    note: string | null;
    status: IntercomCallStatus;
    createdAt: string;
    answeredAt: string | null;
    expiresAt: string;
    gateStatus: "opened" | "failed" | "not_configured" | null;
    admitted: boolean;
}

// ── Notificaciones push (app nativa, FCM) ──
export type PushPlatform = 'android' | 'ios';

export interface PushMessage {
  notificationId: string;
  title: string;
  body: string;
  /** Ruta interna que abre la app al tocar el aviso. */
  link?: string | null;
}

export interface PushSendResult {
  sent: number;
  /** Envíos que fallaron por algo pasajero (429/5xx, red). */
  failed: number;
  invalidTokens: string[];
  skipped?: string;
}
