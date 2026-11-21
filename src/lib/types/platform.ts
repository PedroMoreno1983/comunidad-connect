import type { FirebaseFederatedAccount, FirebaseServiceAccountKey } from './finance';
import type { PaymentProviderId } from './providers';
import type { UserRole } from './users';

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
  /** La escribió alguien que tuvo un servicio completado con este maestro. */
  verifiedService?: boolean;
}

export interface ProductCapabilities {
  onlinePayments: boolean;
  /** Pasarela que se usará si hay más de una configurada. null si ninguna. */
  paymentProvider: PaymentProviderId | null;
  marketingReels: boolean;
  iotAutomation: boolean;
  externalMonitoring: boolean;
  supermarketOrdering: boolean;
}

export type ProductCapabilityKey = keyof ProductCapabilities;

export interface EmailDeliveryResult {
  sent: boolean;
  id?: string;
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

export interface BuildingAddressPickerProps {
  value: GeocodeSuggestion | null;
  onChange: (value: GeocodeSuggestion | null) => void;
}

export interface SignupResponse {
  ok?: boolean;
  role?: UserRole;
  /** BUILDING_MANAGED: el edificio ya contrató; BUILDING_NAME_REQUIRED: es el primero y falta el nombre. */
  code?: 'BUILDING_MANAGED' | 'BUILDING_NAME_REQUIRED' | 'UNIT_TAKEN' | 'INVITE_INVALID';
  communityManaged?: boolean;
  communityCreated?: boolean;
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

export interface LegacyRedirectPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export interface ExtractedDocumentKnowledge {
    title: string;
    documentKind: string;
    summary: string;
    searchText: string;
}

// ─── Geocodificación de la dirección del condominio ─────────────────────────

/** Geocodificador que entregó la dirección (columna communities.address_geocoding_source). */
export type GeocodeSource = 'mapbox' | 'photon' | 'nominatim';

/** Dirección elegida por un residente que se registra sin código (una GeocodeSuggestion validada). */
export type BuildingAddressInput = { label: string; placeId: string; latitude: number; longitude: number; source: GeocodeSource };

export interface GeocodeSuggestion {
    label: string;
    latitude: number;
    longitude: number;
    placeId: string;
    /** Geocodificador que respondió en /api/geocode/address. */
    source: GeocodeSource;
}

export interface GeocodeSuggestionsResponse {
    suggestions: GeocodeSuggestion[];
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

export type ApiKeyScope = "units" | "finance" | "access";

/** Enlace de solo lectura para un fiscalizador, auditor o comité de vigilancia. */
export interface OversightLink {
    id: string;
    label: string;
    expiresAt: string;
    createdAt: string;
    revokedAt: string | null;
    lastViewedAt: string | null;
    viewCount: number;
}

export interface OversightReport {
    community: { name: string; address: string | null };
    label: string;
    expiresAt: string;
    generatedAt: string;
    months: import("@/lib/finance/reportingService").MonthlyReport[];
    reserveFundBalance: number;
    debt: {
        totalDebt: number;
        totalOverdue: number;
        unitsWithDebt: number;
        unitsOverdue: number;
        totalUnits: number;
    };
}

export type FirebaseCredential =
  | { kind: 'key'; account: FirebaseServiceAccountKey }
  | { kind: 'federated'; account: FirebaseFederatedAccount };
