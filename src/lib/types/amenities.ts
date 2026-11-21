import type { ParkingBillingMethod, ParkingCharge, ParkingPaymentStatus } from './finance';

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

/* ── Estacionamientos ───────────────────────────────────────── */

export type ParkingVehicleSize = 'moto' | 'auto' | 'suv' | 'camioneta';

export type ParkingSpotStatus = 'draft' | 'pending_approval' | 'published' | 'paused' | 'rejected';

export type ParkingBookingStatus = 'confirmed' | 'active' | 'completed' | 'cancelled' | 'no_show';

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
  /** Cobro del libro; ausente si la migración del libro no está aplicada. */
  charge?: ParkingCharge;
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
  /** Ausente si la migración del libro de cobros no está aplicada. */
  billingMethod?: ParkingBillingMethod;
  /** Horas antes del inicio hasta las que se cancela sin costo. */
  freeCancellationHours?: number;
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

/* ── Bodegas: arriendo mensual entre vecinos ───────────────── */

export type StorageUnitStatus = 'pending_approval' | 'published' | 'paused' | 'rejected';

export type StorageRentalStatus = 'active' | 'cancelled' | 'completed';

export interface StorageUnit {
  id: string;
  communityId: string;
  ownerId: string;
  ownerName?: string;
  label: string;
  description: string;
  floorLevel: string;
  areaM2: number | null;
  monthlyRate: number;
  minMonths: number;
  status: StorageUnitStatus;
  rejectionReason: string | null;
  createdAt: string;
}

export interface StorageUnitInput {
  label: string;
  description?: string;
  floorLevel?: string;
  areaM2?: number | null;
  monthlyRate: number;
  minMonths?: number;
}

export interface StorageSearchResult {
  id: string;
  label: string;
  description: string;
  floorLevel: string;
  areaM2: number | null;
  monthlyRate: number;
  minMonths: number;
  ownerId: string;
  ownerName: string;
  totalAmount: number;
}

export interface StorageRental {
  id: string;
  storageId: string;
  storageLabel: string;
  ownerId: string;
  tenantId: string;
  startsOn: string;
  endsOn: string;
  months: number;
  monthlyRate: number;
  totalAmount: number;
  status: StorageRentalStatus;
  cancelReason: string | null;
  createdAt: string;
}

/* ── Convenios comunitarios ────────────────────────────────── */

export type CommunityDealKind = 'vendor_visit' | 'bulk_service' | 'space_income';

export type CommunityDealStatus = 'proposed' | 'gauging' | 'quoting' | 'active' | 'closed' | 'rejected';

export type CommunityDealPriceUnit = 'unit_month' | 'unit_once' | 'community_month' | 'discount_percent';

export interface CommunityDeal {
  id: string;
  title: string;
  kind: CommunityDealKind;
  description: string;
  status: CommunityDealStatus;
  interestGoal: number | null;
  needsAssembly: boolean;
  assemblyNote: string;
  referencePrice: number | null;
  dealPrice: number | null;
  priceUnit: CommunityDealPriceUnit;
  selectedQuoteId: string | null;
  terms: string;
  schedule: string;
  startsOn: string | null;
  endsOn: string | null;
  reviewNote: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  interestedCount: number;
  iAmInterested: boolean;
}

export interface CommunityDealInput {
  title: string;
  kind: CommunityDealKind;
  description?: string;
}

/** Lo que la administración ajusta al avanzar un convenio. */
export interface CommunityDealUpdate {
  status?: CommunityDealStatus;
  interestGoal?: number | null;
  needsAssembly?: boolean;
  assemblyNote?: string;
  referencePrice?: number | null;
  dealPrice?: number | null;
  priceUnit?: CommunityDealPriceUnit;
  selectedQuoteId?: string | null;
  terms?: string;
  schedule?: string;
  startsOn?: string | null;
  endsOn?: string | null;
  reviewNote?: string | null;
}

export interface CommunityDealOpportunity {
  theme: string;
  kind: CommunityDealKind;
  title: string;
  why: string;
  households: number;
  source: 'cases' | 'purchases';
}

// ─── Vida junto al lago: embarcaciones ──────────────────────────────────────

export interface CommunityBoat {
    id: string;
    ownerId: string;
    ownerName: string;
    unitNumber: string;
    kind: 'lancha' | 'velero' | 'kayak' | 'moto_agua' | 'bote' | 'otro';
    name: string;
    registration: string;
    lengthM: number | null;
    notes: string;
    createdAt: string;
}

export interface CommunityBoatInput {
    kind: CommunityBoat['kind'];
    name?: string;
    registration?: string;
    lengthM?: number | null;
    notes?: string;
}
