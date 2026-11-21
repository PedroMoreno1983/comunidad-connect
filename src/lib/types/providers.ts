import type { ParkingChargeMethod, ParkingChargeStatus, UtilityService } from './finance';

export interface ProviderCardProps {
  provider: ServiceProvider;
  showCategory?: boolean;
  compact?: boolean;
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
  /** De la Red Convive: lo ven todas las comunidades y lo gestiona Convive. */
  network?: boolean;
  /** Certificado de antecedentes aprobado por la administración o Convive. */
  backgroundCheckedAt?: string | null;
  /** Cédula de identidad aprobada. */
  identityCheckedAt?: string | null;
  workPhotos?: ProviderWorkPhoto[];
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
  community_id?: string | null;
  background_checked_at?: string | null;
  identity_checked_at?: string | null;
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

export interface ServiceRequestQueueItem {
  id: string;
  provider_id: string | null;
  user_id: string;
  preferred_date: string | null;
  preferred_time: string | null;
  description: string;
  status: ServiceRequestStatus;
  created_at: string;
  service_providers?: {
    name: string;
    category: string;
    contact_phone?: string | null;
  } | null;
}

export type ServiceRequestStatus = 'pending' | 'accepted' | 'awaiting_confirmation' | 'completed' | 'cancelled';

export type ServiceRequestFilter = 'all' | 'active' | ServiceRequestStatus;

export interface ResidentServiceRequestRow extends Omit<ServiceRequestQueueItem, 'preferred_date' | 'preferred_time'> {
    preferred_date: string;
    preferred_time: string;
    updated_at?: string;
}

export interface ProviderServiceRequestRow extends ResidentServiceRequestRow {
    profiles?: { name?: string | null; email?: string | null } | null;
}

export interface ServiceRequestTransitionInput {
    current: ServiceRequestStatus;
    next: ServiceRequestStatus;
    requester: boolean;
    manager: boolean;
    reschedule: boolean;
}

export type PaymentProviderId = 'haulmer' | 'transbank';

/** Proveedores de inicio de sesión habilitados en Supabase Auth. */
export type AuthProviderSettings = { google: boolean };

/** Lo que un proveedor necesita para cobrar un arriendo. El monto viene del libro, nunca del cliente. */
export interface ParkingChargeProviderInput {
  chargeId: string;
  bookingId: string;
  communityId: string;
  amount: number;
  description: string;
  payer: { name: string; email: string | null; phone?: string | null };
  returnUrl: string;
  /** Por qué se usa este proveedor (queda en la bitácora del cobro). */
  note?: string;
}

export type ParkingChargeProviderOutcome =
  | { kind: 'checkout'; checkoutUrl: string; providerReference: string }
  | { kind: 'posted_to_unit'; status: ParkingChargeStatus };

/**
 * Proveedor de cobro de arriendos de estacionamiento. Hoy hay dos: gastos
 * comunes (siempre disponible) y Haulmer (apagado por defecto).
 */
export interface PaymentProvider {
  id: ParkingChargeMethod;
  /** null si está disponible; si no, por qué no (para la bitácora del cobro). */
  unavailableReason(): string | null;
  createCharge(input: ParkingChargeProviderInput): Promise<ParkingChargeProviderOutcome>;
  refund(input: { chargeId: string; amount: number; providerReference: string | null }): Promise<{ refunded: boolean; reason: string }>;
}

/* ── Portal del maestro externo ────────────────────────────── */

export interface ProviderPortalProfile {
  id: string;
  name: string;
  category: ServiceProvider['category'];
  contactPhone: string;
  email: string;
  bio: string;
  yearsExperience: number;
  specialties: string[];
  certifications: string[];
  hourlyRate: number | null;
  availability: ServiceProvider['availability'];
  responseTime: string;
  serviceAddress: string;
  verified: boolean;
  rating: number;
  reviewCount: number;
  completedJobs: number;
  photo: string | null;
  backgroundCheckedAt: string | null;
  identityCheckedAt: string | null;
}

export interface ProviderPortalRequest {
  id: string;
  preferredDate: string;
  preferredTime: string;
  description: string;
  status: ServiceRequestStatus;
  createdAt: string;
  requesterName: string;
  requesterUnit: string;
  /** Comunidad de la solicitud: el maestro de la Red Convive atiende varias. */
  communityName: string;
}

export interface ProviderPortalData {
  communityName: string;
  /** Maestro de la Red Convive: atiende a todas las comunidades. */
  network: boolean;
  expiresAt: string;
  provider: ProviderPortalProfile;
  requests: ProviderPortalRequest[];
  workPhotos: ProviderWorkPhoto[];
  /** Estado de sus documentos (sin el chequeo ni el archivo). */
  documents: ProviderDocument[];
}

/** Cambios de perfil que puede hacer el propio maestro o la administración. */
export interface ProviderProfileInput {
  name?: string;
  contactPhone?: string;
  email?: string;
  bio?: string;
  yearsExperience?: number;
  specialties?: string[];
  certifications?: string[];
  hourlyRate?: number | null;
  availability?: ServiceProvider['availability'];
  responseTime?: string;
  serviceAddress?: string;
}

export interface ProviderInviteLink {
  url: string;
  expiresAt: string;
  providerName: string;
}

/** Documentos que un maestro sube para que se revisen sus antecedentes. */
export type ProviderDocumentKind = 'background_certificate' | 'identity';

export type ProviderDocumentStatus = 'pending' | 'approved' | 'rejected';

/** Lo que el sistema leyó del documento (IA). Fechas en AAAA-MM-DD. */
export interface ProviderDocumentExtraction {
  documentType: 'background_certificate' | 'identity' | 'other';
  fullName: string | null;
  rut: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  /** Certificado de antecedentes: true si registra anotaciones. */
  hasRecords: boolean | null;
  verificationCode: string | null;
}

export interface ProviderDocumentAutoCheck {
  verdict: 'looks_ok' | 'needs_review' | 'problem';
  findings: string[];
  extracted: ProviderDocumentExtraction | null;
  /** Certificado de antecedentes en PDF: firma electrónica del Registro Civil (19-11-2026). */
  signature?: ProviderDocumentSignature;
}

export interface ProviderDocumentSignature {
  status: 'verified' | 'modified' | 'untrusted' | 'unsigned' | 'invalid';
  detail: string;
  signer?: string;
  signedAt?: string;
}

export interface ProviderDocument {
  id: string;
  kind: ProviderDocumentKind;
  fileName: string;
  status: ProviderDocumentStatus;
  createdAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
  /** Solo para quien revisa (administración o Convive). */
  autoCheck?: ProviderDocumentAutoCheck;
  /** Enlace temporal para verlo; solo para quien revisa. */
  viewUrl?: string | null;
}

export interface ProviderWorkPhoto {
  id: string;
  url: string;
  caption: string | null;
  createdAt: string;
}

/** Dónde se gestiona el perfil: con sesión (dueño o administración) o con el enlace del maestro. */
export type ProviderMediaTarget = { kind: 'provider'; id: string } | { kind: 'portal'; token: string };

export interface ProviderMediaManagerProps {
  target: ProviderMediaTarget;
  photo?: string | null;
  workPhotos: ProviderWorkPhoto[];
  /** Estado de los documentos para el maestro; la administración los ve en ProviderDocumentsReview. */
  documents?: ProviderDocument[];
  onChanged: () => void;
}

export interface ProviderDocumentsReviewProps {
  providerId: string;
  /** 'superadmin' para maestros de la Red Convive. */
  scope: 'admin' | 'superadmin';
}

/** Quién cambia fotos o documentos de un maestro: un usuario (id) o el maestro con su enlace (id null). */
export type ProviderMediaActor = { id: string | null; role: string; email?: string | null };

/** Quién hace un cambio en la Red Convive (superadmin): va a la bitácora global. */
export type ProviderNetworkActor = { id: string; email?: string | null };

/** Quién gestiona un proveedor con sesión, y si puede revisar sus documentos. */
export type ProviderManagerAccess = { providerId: string; actor: ProviderMediaActor; isReviewer: boolean };

/** Lo mínimo de un proveedor para decidir alcance y permisos. */
export type ProviderIdentity = { id: string; name: string; community_id: string | null; user_id?: string | null; category?: string | null };

export type ProviderReviewInput = { providerId: string; rating: number; comment: string; serviceType?: string };

/** Maestro visto por Convive: de la Red (communityId null) o de una comunidad. */
export interface NetworkProviderRow {
  id: string;
  name: string;
  category: string;
  contactPhone: string;
  email: string | null;
  verified: boolean;
  rating: number;
  reviewCount: number;
  completedJobs: number;
  communityId: string | null;
  communityName: string | null;
  hasAccount: boolean;
}

export interface NetworkProviderInput {
  name: string;
  category: string;
  contactPhone: string;
  email?: string;
  bio?: string;
  specialties?: string[];
}

export type NetworkProviderAction =
  | { action: 'to_network' }
  | { action: 'to_community'; communityId: string }
  | { action: 'verify'; verified: boolean };

export interface ProviderProfileFormProps {
  initial: ProviderProfileInput;
  onSubmit: (input: ProviderProfileInput) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
}

export interface ProviderAdminPanelProps {
  provider: ServiceProvider;
  onChanged: () => void;
}

export interface ProviderPortalClientProps {
  token: string;
}

export interface UtilityProvider {
    id: string;
    name: string;
    service: UtilityService;
    /** Portal oficial donde el cliente paga con su n° de cliente. */
    payUrl: string;
    /** Cómo llama la empresa al número que pide (n° de cliente, n° de servicio…). */
    customerNumberLabel: string;
}
