import type { ReactNode } from 'react';
import type { CocoConsentState } from './coco';
import type { PayrollCalculation, PayrollContractType, PayrollHealthSystem } from './finance';
import type { ApiKeyScope, DataSubjectRequestRecord, GeocodeSuggestion } from './platform';
import type { ResidentHomeAnnouncement } from './social';

export type UserRole = 'admin' | 'resident' | 'concierge';

export interface PasskeyCredential {
  id: string;
  friendlyName: string;
  createdAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl?: string; // Optional avatar
  photo?: string; // Alias for avatarUrl or external photo
  unitId?: string; // For residents/tenants
  unitName?: string; // User-friendly unit designator
  /** "Casa" en un condominio de casas, "Depto" en un edificio. Sale de units.type de la comunidad. */
  unitNoun?: string;
  communityId?: string; // Multi-tenant ID
  communityName?: string; // Display name of the active community
  communityCoverPhotoUrl?: string; // Optional real building photo, set per-community
  features?: Record<string, boolean>; // Plan features
  /** Módulos que la comunidad apagó (communities.disabled_modules): 'parking', 'water'. */
  disabledModules?: string[];
  /** false: comunidad sin administrar (modo vecino). */
  communityManaged?: boolean;
  /** false: entró sin código; la administración lo valida al tomar el edificio. */
  residenceVerified?: boolean;
}

export interface Unit {
  id: string;
  number: string;
  floor: number;
  tower: string;
  /** 'house' en un condominio de casas; 'apartment' (por defecto) en un edificio. */
  type?: string | null;
  ownerId?: string; // User ID
  tenantId?: string; // User ID
  sharePermille?: number | null; // Alícuota en tanto por mil (‰); la suma de la comunidad debería dar 1000
}

export interface ProfileSummary {
  id: string;
  name: string;
  avatar_url?: string;
}

export type CommunityGovernanceStatus = 'pending' | 'approved' | 'changes_requested' | 'rejected' | 'suspended' | 'closed';

export type CommunityParticipationStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';

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
  creatorId?: string;
  governanceStatus: CommunityGovernanceStatus;
  coordinatorId?: string;
  coordinatorName?: string;
  governanceNote?: string;
  status: 'active' | 'forming' | 'completed';
  createdAt: string;
}

export interface CommunityParticipationRequest {
  id: string;
  communityId: string;
  initiativeType: 'time_bank' | 'collective_purchase' | 'community_project';
  initiativeId: string;
  requesterId: string;
  requesterName?: string;
  coordinatorId?: string;
  message?: string;
  status: CommunityParticipationStatus;
  createdAt: string;
}

export interface CommunityCoordinatorCandidate {
  id: string;
  name: string;
  role: 'admin' | 'resident' | 'concierge' | string;
}

export interface ProfileSettings {
  avatarUrl?: string;
  phoneNumber: string;
  whatsappEnabled: boolean;
  unitNumber: string;
  unitTower: string;
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
}

export type CommunitySubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'trialing';

export type PrivacyConsentType = 'terms' | 'privacy_notice' | 'whatsapp' | 'ai_processing' | 'sensitive_data';

/** Documentos de la comunidad que CoCo lee completos (reglamentos, actas, contratos). */
export type CommunityDocumentKind = 'reglamento' | 'acta' | 'contrato' | 'otro';

/** Lo que devuelve la lectura de un documento subido desde el chat. */
export interface CommunityDocumentRead {
  documentId: string;
  name: string;
  text: string;
  pageCount: number;
  ocrPages: number;
  truncated: boolean;
}

/** Un trozo de documento que responde a una búsqueda, con su página para citarla. */
export interface CommunityDocumentHit {
  documentId: string;
  title: string;
  kind: CommunityDocumentKind;
  /** Número de página, o de sección si el documento no tiene páginas (Word, texto). */
  page: number;
  paginated: boolean;
  excerpt: string;
}

export type PrivacyConsentAction = 'granted' | 'withdrawn';

export type PrivacyConsentChannel = 'signup' | 'profile' | 'privacy_center' | 'admin_onboarding' | 'chat' | 'whatsapp';

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

/** Elegir edificio después de entrar con Google por primera vez. */
export type JoinCommunityInput = {
  mode: 'code' | 'address' | 'invite';
  inviteCode?: string;
  accessCode?: string;
  address?: GeocodeSuggestion | null;
  buildingName?: string;
  departmentNumber: string;
  acceptTerms: boolean;
  acceptPrivacy: boolean;
  whatsappOptIn: boolean;
};

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
  /** Lo último que decidió sobre CoCo: unknown si nunca vio el aviso. */
  cocoConsent?: CocoConsentState;
  events?: PrivacyConsentRecord[];
  error?: string;
}

export interface ResidentNavigationContext {
  hasMarketplaceListings: boolean;
  isServiceProvider: boolean;
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

export interface CommunityEmployeeRecord {
    id: string;
    full_name: string;
    role_title: string;
    /** Sueldo base en modo 'chile'; monto a pagar en modo 'fixed'. */
    monthly_amount: number;
    active: boolean;
    created_at: string;
    calculation: PayrollCalculation;
    rut: string | null;
    afp: string | null;
    health_system: PayrollHealthSystem;
    isapre_name: string | null;
    isapre_plan_uf: number | null;
    contract_type: PayrollContractType;
    gratification: boolean;
    taxable_bonus: number;
    meal_allowance: number;
    transport_allowance: number;
    family_dependents: number;
    hire_date: string | null;
    first_names: string | null;
    father_last_name: string | null;
    mother_last_name: string | null;
    sex: "M" | "F" | null;
    foreign_national: boolean;
    isapre_code: string | null;
    part_time: boolean;
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
    /** Correos de bienvenida enviados a cuentas nuevas. */
    welcomeEmails?: number;
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

/** El edificio encontrado para esa dirección. `managed` false: comunidad sin administrar. */
export type ResidentBuildingMatch = { id: string; name: string; managed: boolean; residentCode: string };

export interface AdminOnboardingRegisterResponse {
    error?: string;
    code?: string;
    loginUrl?: string;
}

export type OnboardingUnitType = "apartment" | "house";

export interface OnboardingConversationDraft {
    communityName: string;
    unitType: OnboardingUnitType | null;
    unitCount: number | null;
    unitNumbers: string[];
    address: string;
    fullName: string;
    email: string;
    planId: string | null;
}

export interface OnboardingGuideResponse {
    reply: string;
    draft: OnboardingConversationDraft;
    ready: boolean;
    error?: string;
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
    /** Propietario anotado por la administración que aún no tiene cuenta. */
    owner_name?: string | null;
    share_permille?: number | string | null;
};

/** Clave de la API pública tal como se muestra: nunca incluye el secreto. */
export interface CommunityApiKey {
    id: string;
    name: string;
    prefix: string;
    scopes: ApiKeyScope[];
    createdAt: string;
    lastUsedAt: string | null;
    revokedAt: string | null;
}
