"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Car,
  Search,
  Zap,
  Umbrella,
  Clock,
  MapPin,
  KeyRound,
  XCircle,
  Layers,
  List,
  QrCode,
  DollarSign,
  Shield,
  Settings,
  Calendar,
  Sun,
  Moon,
} from "lucide-react";
import { ParkingService } from "@/lib/api";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/cc/Button";
import { Tag } from "@/components/cc/Tag";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { formatCurrency } from "@/lib/utils";
import {
  ACCESS_STATUS_LABELS,
  ACCESS_STATUS_TONES,
  BOOKING_STATUS_LABELS,
  BOOKING_STATUS_TONES,
  VEHICLE_SIZE_LABELS,
  calculateCommercialSavings,
  formatMinuteRate,
  formatParkingRange,
  getPresetSearchRange,
  nextHourInputValue,
  parkingDurationHours,
  parseLocalDateTime,
} from "@/lib/parking";
import { ParkingMap } from "@/components/parking/ParkingMap";
import { ParkingAccessPassModal } from "@/components/parking/ParkingAccessPassModal";
import { ParkingOwnerDashboard } from "@/components/parking/ParkingOwnerDashboard";
import { ParkingConciergeGate } from "@/components/parking/ParkingConciergeGate";
import type {
  ParkingAccessRequest,
  ParkingCommunityAccess,
  ParkingAvailabilityRule,
  ParkingBooking,
  ParkingCommunitySettings,
  ParkingDriver,
  ParkingMapLevel,
  ParkingMapSpot,
  ParkingOwnerEarnings,
  ParkingSearchResult,
  ParkingSpot,
  ParkingSpotInput,
} from "@/lib/types";

type ParkingTab = "search" | "owner" | "bookings" | "gate" | "admin";

function DriverForm({
  driver,
  onSaved,
}: {
  driver: ParkingDriver | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    fullName: driver?.fullName || "",
    phone: driver?.phone || "",
    plate: driver?.plate || "",
    vehicleDescription: driver?.vehicleDescription || "",
    nationalId: driver?.nationalId || "",
  });

  const submit = async () => {
    if (!form.fullName.trim() || !form.phone.trim() || !form.plate.trim()) {
      toast({
        title: "Faltan datos",
        description: "Necesitamos tu nombre, teléfono y patente para validar el acceso.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      await ParkingService.saveMyDriver(form);
      toast({
        title: driver ? "Vehículo actualizado" : "Vehículo verificado",
        description: "Ya puedes reservar estacionamientos en cualquier condominio habilitado.",
        variant: "success",
      });
      onSaved();
    } catch (error: unknown) {
      toast({
        title: "No se pudo guardar",
        description: error instanceof Error ? error.message : "Intenta nuevamente.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const field =
    "w-full rounded-xl border border-subtle bg-surface px-3 py-2.5 text-[13px] cc-text-primary";

  return (
    <div className="rounded-2xl border border-subtle bg-surface p-5 space-y-4">
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-lg bg-[var(--cc-copper-tint)] text-[var(--cc-copper)]">
          <Car size={16} />
        </div>
        <div>
          <h3 className="text-[15px] font-semibold cc-text-primary">
            {driver ? "Mi Vehículo Registrado" : "Validación de Seguridad Comunitaria"}
          </h3>
          <p className="text-[12px] cc-text-secondary">
            Conserjería requiere tu nombre, RUT, teléfono y patente para habilitar la barrera.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <input
          className={field}
          placeholder="Nombre completo"
          value={form.fullName}
          onChange={(e) => setForm({ ...form, fullName: e.target.value })}
        />
        <input
          className={field}
          placeholder="Teléfono (+56 9 ...)"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
        <input
          className={field}
          placeholder="Patente (ej: BBCC12)"
          value={form.plate}
          onChange={(e) => setForm({ ...form, plate: e.target.value.toUpperCase() })}
        />
        <input
          className={field}
          placeholder="RUT (ej: 18.234.567-8)"
          value={form.nationalId}
          onChange={(e) => setForm({ ...form, nationalId: e.target.value })}
        />
        <input
          className={`${field} sm:col-span-2`}
          placeholder="Descripción del vehículo (ej: Hyundai Tucson Gris Plata)"
          value={form.vehicleDescription}
          onChange={(e) => setForm({ ...form, vehicleDescription: e.target.value })}
        />
      </div>

      <div className="flex items-center justify-between gap-3 pt-2">
        {/* La autorización es por condominio, no un estado global del conductor:
            se muestra junto a cada comunidad, no aquí. */}
        {driver && <Tag tone="sage" solid>Vehículo registrado</Tag>}
        <Button size="sm" variant="copper" onClick={submit} disabled={saving} className="ml-auto">
          {saving ? "Guardando…" : driver ? "Actualizar Datos" : "Verificar y Continuar"}
        </Button>
      </div>
    </div>
  );
}

/**
 * Estado del conductor frente al condominio dueño del cupo.
 * "resident" es su propia comunidad; el resto exige aprobación del comité.
 */
type SpotAccessState = "resident" | "approved" | "pending" | "rejected" | "none";

function SpotCard({
  spot,
  hours,
  onBook,
  booking,
  accessState,
  onRequestAccess,
  requestingAccess,
}: {
  spot: ParkingSearchResult;
  hours: number;
  onBook: (spot: ParkingSearchResult) => void;
  booking: boolean;
  accessState: SpotAccessState;
  onRequestAccess: (spot: ParkingSearchResult) => void;
  requestingAccess: boolean;
}) {
  const savings = calculateCommercialSavings(spot.quotedAmount);
  const canBook = accessState === "resident" || accessState === "approved";

  return (
    <div className="rounded-2xl border border-subtle bg-surface p-5 hover:shadow-xs transition-shadow">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[15px] font-semibold cc-text-primary">
              Estacionamiento {spot.label}
            </h3>
            <Tag tone="neutral">{VEHICLE_SIZE_LABELS[spot.vehicleSize]}</Tag>
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              -{savings.savingsPercent}% vs Mall/Calle
            </span>
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-[12px] cc-text-secondary">
            <MapPin size={12} className="text-[var(--cc-copper)]" />
            {spot.communityName}
            {spot.unitLabel ? ` · Depto ${spot.unitLabel}` : ""} · {spot.ownerName}
          </p>
          {spot.description && (
            <p className="mt-2 text-[13px] cc-text-secondary">{spot.description}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {spot.isCovered && (
              <Tag tone="sage">
                <Umbrella size={11} /> Techado
              </Tag>
            )}
            {spot.hasEvCharger && (
              <Tag tone="copper">
                <Zap size={11} /> Carga eléctrica (EV)
              </Tag>
            )}
            <Tag tone="neutral">
              <Clock size={11} /> {formatMinuteRate(spot.hourlyRate)}
            </Tag>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-[20px] font-bold cc-text-primary">
            {formatCurrency(spot.quotedAmount)}
          </p>
          <p className="text-[11px] cc-text-tertiary">
            {hours} h · {formatCurrency(spot.hourlyRate)}/h
          </p>
          {canBook ? (
            <Button
              size="sm"
              variant="copper"
              className="mt-3"
              onClick={() => onBook(spot)}
              disabled={booking}
            >
              {booking ? "Reservando…" : "Reservar Puesto"}
            </Button>
          ) : accessState === "pending" || accessState === "rejected" ? (
            <div className="mt-3">
              <Tag tone={ACCESS_STATUS_TONES[accessState]} solid>
                {ACCESS_STATUS_LABELS[accessState]}
              </Tag>
            </div>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="mt-3"
              onClick={() => onRequestAccess(spot)}
              disabled={requestingAccess}
            >
              {requestingAccess ? "Enviando…" : "Solicitar acceso"}
            </Button>
          )}
        </div>
      </div>

      {accessState === "none" && (
        <p className="mt-3 border-t border-subtle pt-3 text-[12px] cc-text-secondary">
          No eres residente de {spot.communityName}. La administración del condominio debe
          aprobar tu vehículo antes de que puedas reservar aquí.
        </p>
      )}

      {accessState === "pending" && (
        <p className="mt-3 border-t border-subtle pt-3 text-[12px] cc-text-secondary">
          Tu solicitud está esperando respuesta de la administración de {spot.communityName}.
        </p>
      )}
    </div>
  );
}

function BookingRow({
  booking,
  onOpenPass,
  onCancel,
}: {
  booking: ParkingBooking;
  onOpenPass: (booking: ParkingBooking) => void;
  onCancel: (booking: ParkingBooking) => void;
}) {
  const cancellable = booking.status === "confirmed" || booking.status === "active";

  return (
    <div className="rounded-2xl border border-subtle bg-surface p-4 hover:shadow-xs transition-shadow">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-semibold cc-text-primary">
              Estacionamiento {booking.spotLabel || "—"}
            </span>
            <Tag tone={BOOKING_STATUS_TONES[booking.status]} solid>
              {BOOKING_STATUS_LABELS[booking.status]}
            </Tag>
          </div>
          <p className="mt-1 text-[12px] cc-text-secondary">
            {formatParkingRange(booking.startsAt, booking.endsAt)} · {formatCurrency(booking.totalAmount)}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {cancellable && (
            <Button size="sm" variant="copper" onClick={() => onOpenPass(booking)}>
              <QrCode size={14} /> Ver Pase Digital (QR)
            </Button>
          )}
          {cancellable && (
            <Button size="sm" variant="ghost" onClick={() => onCancel(booking)}>
              <XCircle size={13} /> Cancelar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function EstacionamientosContent() {
  const { user } = useAuth();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as ParkingTab) || "search";

  const [activeTab, setActiveTab] = useState<ParkingTab>(initialTab);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");

  useEffect(() => {
    const tabFromUrl = searchParams.get("tab") as ParkingTab | null;
    if (tabFromUrl && ["search", "owner", "bookings", "gate", "admin"].includes(tabFromUrl)) {
      setActiveTab(tabFromUrl);
    }
  }, [searchParams]);

  // Driver data
  const [driver, setDriver] = useState<ParkingDriver | null>(null);
  const [communityAccess, setCommunityAccess] = useState<ParkingCommunityAccess[]>([]);
  const [requestingAccessFor, setRequestingAccessFor] = useState<string | null>(null);
  const [driverLoaded, setDriverLoaded] = useState(false);
  const [showDriverForm, setShowDriverForm] = useState(false);

  // Search state
  const [startValue, setStartValue] = useState(() => nextHourInputValue(1));
  const [endValue, setEndValue] = useState(() => nextHourInputValue(4));
  const [results, setResults] = useState<ParkingSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [bookingSpotId, setBookingSpotId] = useState<string | null>(null);

  // Filter chips
  const [coveredOnly, setCoveredOnly] = useState(false);
  const [evOnly, setEvOnly] = useState(false);

  // My bookings & Pass modal
  const [myBookings, setMyBookings] = useState<ParkingBooking[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [selectedPassBooking, setSelectedPassBooking] = useState<ParkingBooking | null>(null);

  // Owner state
  const [mySpots, setMySpots] = useState<ParkingSpot[]>([]);
  const [mySpotsLoading, setMySpotsLoading] = useState(false);
  const [ownerEarnings, setOwnerEarnings] = useState<ParkingOwnerEarnings | null>(null);
  const [receivedBookings, setReceivedBookings] = useState<ParkingBooking[]>([]);

  // Concierge gate state
  const [todayBookings, setTodayBookings] = useState<ParkingBooking[]>([]);
  const [gateLoading, setGateLoading] = useState(false);

  // Map levels
  const [mapLevels, setMapLevels] = useState<ParkingMapLevel[]>([]);

  // Admin settings
  const [communitySettings, setCommunitySettings] = useState<ParkingCommunitySettings | null>(null);

  const loadDriver = useCallback(async () => {
    try {
      const current = await ParkingService.getMyDriver();
      setDriver(current);

      // Las autorizaciones son por condominio: sin ellas no se sabe en cuáles
      // de los cupos encontrados este conductor puede efectivamente reservar.
      if (current) {
        try {
          setCommunityAccess(await ParkingService.getMyCommunityAccess());
        } catch {
          setCommunityAccess([]);
        }
      } else {
        setCommunityAccess([]);
      }
      setShowDriverForm(!current);
    } catch {
      setDriver(null);
    } finally {
      setDriverLoaded(true);
    }
  }, []);

  const loadBookings = useCallback(async () => {
    setBookingsLoading(true);
    try {
      const bookings = await ParkingService.getMyBookings();
      setMyBookings(bookings);
    } catch {
      setMyBookings([]);
    } finally {
      setBookingsLoading(false);
    }
  }, []);

  const loadOwnerData = useCallback(async () => {
    setMySpotsLoading(true);
    try {
      const [spots, earnings, received] = await Promise.all([
        ParkingService.getMySpots(),
        ParkingService.getOwnerEarnings(),
        ParkingService.getBookingsForMySpots(),
      ]);
      setMySpots(spots);
      setOwnerEarnings(earnings);
      setReceivedBookings(received);
    } catch {
      // Fallback
    } finally {
      setMySpotsLoading(false);
    }
  }, []);

  const loadGateData = useCallback(async () => {
    setGateLoading(true);
    try {
      const communityId = user?.communityId || "11111111-1111-1111-1111-111111111111";
      const list = await ParkingService.getTodayCommunityBookings(communityId);
      setTodayBookings(list);
    } catch {
      setTodayBookings([]);
    } finally {
      setGateLoading(false);
    }
  }, [user?.communityId]);

  const loadMapData = useCallback(async () => {
    try {
      const levels = await ParkingService.getParkingMapLevels(user?.communityId);
      setMapLevels(levels);
    } catch {
      setMapLevels([]);
    }
  }, [user?.communityId]);

  const loadAdminSettings = useCallback(async () => {
    if (user?.role !== "admin") return;
    try {
      const communityId = user?.communityId || "11111111-1111-1111-1111-111111111111";
      const settings = await ParkingService.getCommunitySettings(communityId);
      setCommunitySettings(settings);
    } catch {
      // Sin datos reales se asume lo más restrictivo: externos cerrados.
      setCommunitySettings({ externalEnabled: false, commissionPercent: 0 });
    }
  }, [user?.role, user?.communityId]);

  useEffect(() => {
    if (!user) return;
    loadDriver();
    loadBookings();
    loadOwnerData();
    loadMapData();
    loadGateData();
    loadAdminSettings();
  }, [user, loadDriver, loadBookings, loadOwnerData, loadMapData, loadGateData, loadAdminSettings]);

  const applyPreset = (preset: "2h" | "afternoon" | "night" | "fullday") => {
    const range = getPresetSearchRange(preset);
    setStartValue(range.start);
    setEndValue(range.end);
  };

  const runSearch = async () => {
    const start = parseLocalDateTime(startValue);
    const end = parseLocalDateTime(endValue);

    if (!start || !end || end <= start) {
      toast({
        title: "Rango inválido",
        description: "La hora de término debe ser posterior a la de inicio.",
        variant: "destructive",
      });
      return;
    }

    setSearching(true);
    try {
      const searchRes = await ParkingService.search(start, end, user?.communityId);
      setResults(searchRes);
    } catch (error: unknown) {
      // Una búsqueda fallida devuelve vacío y lo dice. Antes rellenaba con dos
      // cupos inventados que el conductor intentaba reservar sin éxito.
      setResults([]);
      toast({
        title: "No se pudo buscar",
        description: error instanceof Error ? error.message : "Intenta nuevamente.",
        variant: "destructive",
      });
    } finally {
      setSearching(false);
    }
  };

  const bookSpot = async (spot: ParkingSearchResult | ParkingMapSpot) => {
    const start = parseLocalDateTime(startValue);
    const end = parseLocalDateTime(endValue);
    if (!start || !end) return;

    const spotId = "spotId" in spot ? spot.spotId : (spot as ParkingSearchResult).spotId;
    setBookingSpotId(spotId);

    try {
      // Si la reserva falla hay que decirlo. Antes se capturaba el error y se
      // seguía con un id inventado, así que el conductor veía "confirmada" una
      // reserva que la base había rechazado.
      const bookingId = await ParkingService.book(spotId, start, end);

      // El pase se arma con la fila real: el código de acceso lo genera la base
      // y es el que conserjería valida en la barrera. Uno inventado aquí no
      // coincidiría con nada y el conductor se quedaría fuera.
      const bookings = await ParkingService.getMyBookings();
      setMyBookings(bookings);

      const created = bookings.find((b) => b.id === bookingId);
      if (created) setSelectedPassBooking(created);

      toast({
        title: "Reserva confirmada",
        description: created
          ? `Estacionamiento ${spot.label}. Tu código de portería es ${created.accessCode}.`
          : `Estacionamiento ${spot.label}. Revisa el código en "Mis reservas".`,
        variant: "success",
      });

      await runSearch();
    } catch (error: unknown) {
      toast({
        title: "No se pudo reservar",
        description: error instanceof Error ? error.message : "Intenta nuevamente.",
        variant: "destructive",
      });
    } finally {
      setBookingSpotId(null);
    }
  };

  const cancelBooking = async (booking: ParkingBooking) => {
    try {
      await ParkingService.cancelBooking(booking.id);
      toast({
        title: "Reserva cancelada",
        description: "El cupo vuelve a estar disponible.",
        variant: "success",
      });
      await loadBookings();
    } catch (error: unknown) {
      toast({
        title: "No se pudo cancelar",
        description: error instanceof Error ? error.message : "Intenta nuevamente.",
        variant: "destructive",
      });
    }
  };

  const handleCreateSpot = async (
    input: ParkingSpotInput,
    availability: Omit<ParkingAvailabilityRule, "id" | "spotId">[]
  ) => {
    const newSpot = await ParkingService.createSpot(input);
    if (availability.length > 0) {
      await ParkingService.setAvailability(newSpot.id, availability);
    }
  };

  const handleToggleSpot = async (spotId: string, isAvailable: boolean) => {
    await ParkingService.toggleSpotInstantAvailability(spotId, isAvailable);
    toast({
      title: isAvailable ? "Puesto publicado" : "Puesto pausado",
      description: isAvailable
        ? "Tu estacionamiento ya recibe arriendos."
        : "Tu estacionamiento está en pausa temporal.",
      variant: "success",
    });
    await loadOwnerData();
  };

  const handleDeleteSpot = async (spotId: string) => {
    if (!confirm("¿Eliminar este estacionamiento?")) return;
    try {
      await ParkingService.deleteSpot(spotId);
      toast({ title: "Estacionamiento eliminado", variant: "success" });
      await loadOwnerData();
    } catch {
      toast({ title: "No se pudo eliminar", variant: "destructive" });
    }
  };

  const handleApplyToExpenses = async (amount: number) => {
    const result = await ParkingService.applyEarningsToExpenses(amount);
    // El abono todavía no está conectado a billingService. Si el servicio dice
    // que no se aplicó, hay que lanzar: si no, el dashboard celebra un descuento
    // que nunca llegó al gasto común.
    if (!result.success) throw new Error(result.message);
  };

  const start = parseLocalDateTime(startValue);
  const end = parseLocalDateTime(endValue);
  const hours = start && end ? parkingDurationHours(start.toISOString(), end.toISOString()) : 0;
  const canSearch = Boolean(driver) && hours > 0;
  const field =
    "w-full rounded-xl border border-subtle bg-surface px-3 py-2.5 text-[13px] cc-text-primary";

  // Filtered results
  const filteredResults = (results || []).filter((r) => {
    if (coveredOnly && !r.isCovered) return false;
    if (evOnly && !r.hasEvCharger) return false;
    return true;
  });

  /** Estado del conductor frente al condominio dueño de un cupo. */
  const accessStateFor = (communityId: string): SpotAccessState => {
    if (user?.communityId && communityId === user.communityId) return "resident";
    const record = communityAccess.find((access) => access.communityId === communityId);
    if (!record) return "none";
    return record.status === "approved"
      ? "approved"
      : record.status === "pending"
        ? "pending"
        : "rejected";
  };

  const requestAccess = async (spot: ParkingSearchResult) => {
    setRequestingAccessFor(spot.communityId);
    try {
      await ParkingService.requestCommunityAccess(spot.communityId);
      toast({
        title: "Solicitud enviada",
        description: `La administración de ${spot.communityName} revisará tu vehículo.`,
        variant: "success",
      });
      setCommunityAccess(await ParkingService.getMyCommunityAccess());
    } catch (error: unknown) {
      toast({
        title: "No se pudo enviar la solicitud",
        description: error instanceof Error ? error.message : "Intenta nuevamente.",
        variant: "destructive",
      });
    } finally {
      setRequestingAccessFor(null);
    }
  };

  const isAdmin = user?.role === "admin";
  // Nombre real del condominio para el pase. Si el perfil no lo trae, se deja
  // vacío en vez de rellenar con un edificio inventado.
  const communityName =
    (user as (typeof user & { condoName?: string; communityName?: string }) | null)?.condoName ||
    (user as (typeof user & { condoName?: string; communityName?: string }) | null)?.communityName ||
    "";
  const isConcierge = user?.role === "concierge";

  return (
    <div className="space-y-6">
      {/* Hero Header */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-[var(--cc-copper)] text-white flex items-center justify-center font-bold text-[16px] shadow-sm">
              <Car size={20} />
            </div>
            <div>
              <h1
                className="text-[22px] font-semibold cc-text-primary"
                style={{ fontFamily: "var(--cc-font-display)" }}
              >
                Estacionamientos
              </h1>
              <p className="text-[12px] cc-text-secondary">
                {isAdmin
                  ? "Panel de administración y gobernanza de estacionamientos del condominio."
                  : "Arrienda cupos desocupados por horas o rentabiliza tu puesto con descuento directo a tus gastos comunes."}
              </p>
            </div>
          </div>
        </div>

        {/* Persona Tabs Navigation */}
        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-subtle/50 border border-subtle">
          <button
            onClick={() => setActiveTab("search")}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[13px] font-medium transition-all cursor-pointer ${
              activeTab === "search"
                ? "bg-surface shadow-xs font-semibold cc-text-primary border border-subtle"
                : "cc-text-secondary hover:cc-text-primary"
            }`}
          >
            <Car size={15} style={{ color: "var(--cc-copper)" }} />
            Buscar
          </button>

          <button
            onClick={() => setActiveTab("owner")}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[13px] font-medium transition-all cursor-pointer ${
              activeTab === "owner"
                ? "bg-surface shadow-xs font-semibold cc-text-primary border border-subtle"
                : "cc-text-secondary hover:cc-text-primary"
            }`}
          >
            <DollarSign size={15} className="text-emerald-600" />
            Mis Estacionamientos ({mySpots.length})
          </button>

          <button
            onClick={() => setActiveTab("bookings")}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[13px] font-medium transition-all cursor-pointer ${
              activeTab === "bookings"
                ? "bg-surface shadow-xs font-semibold cc-text-primary border border-subtle"
                : "cc-text-secondary hover:cc-text-primary"
            }`}
          >
            <KeyRound size={15} style={{ color: "var(--cc-amber)" }} />
            Mis Reservas ({myBookings.length})
          </button>

          {(isConcierge || isAdmin) && (
            <button
              onClick={() => setActiveTab("gate")}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[13px] font-medium transition-all cursor-pointer ${
                activeTab === "gate"
                  ? "bg-surface shadow-xs font-semibold cc-text-primary border border-subtle"
                  : "cc-text-secondary hover:cc-text-primary"
              }`}
            >
              <Shield size={15} style={{ color: "var(--cc-copper)" }} />
              Portería
            </button>
          )}

          {isAdmin && (
            <button
              onClick={() => setActiveTab("admin")}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[13px] font-medium transition-all cursor-pointer ${
                activeTab === "admin"
                  ? "bg-surface shadow-xs font-semibold cc-text-primary border border-subtle"
                  : "cc-text-secondary hover:cc-text-primary"
              }`}
            >
              <Settings size={15} className="text-zinc-600" />
              Ajustes Edificio
            </button>
          )}
        </div>
      </header>

      {/* TAB 1: MODO CONDUCTOR (BUSCAR) */}
      {activeTab === "search" && (
        <div className="space-y-6">
          {/* Driver Registration Badge */}
          {driverLoaded && (showDriverForm || !driver) && (
            <DriverForm
              driver={driver}
              onSaved={() => {
                setShowDriverForm(false);
                loadDriver();
              }}
            />
          )}

          {driver && !showDriverForm && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-subtle bg-surface px-4 py-3">
              <Car size={16} style={{ color: "var(--cc-copper)" }} />
              <span className="text-[13px] cc-text-primary">
                Vehículo verificado: <span className="font-mono font-bold">{driver.plate}</span>
                {driver.vehicleDescription ? ` · ${driver.vehicleDescription}` : ""}
              </span>
              <Tag tone="sage" solid>Registrado</Tag>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto text-[12px]"
                onClick={() => setShowDriverForm(true)}
              >
                Editar vehículo
              </Button>
            </div>
          )}

          {/* Quick Preset Range Buttons */}
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            <span className="text-[11px] uppercase tracking-wider cc-text-tertiary mr-1">
              Accesos Rápidos:
            </span>
            <button
              onClick={() => applyPreset("2h")}
              className="px-3 py-1.5 rounded-xl border border-subtle bg-surface hover:bg-subtle/40 cc-text-primary transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Clock size={13} className="text-[var(--cc-copper)]" /> Próximas 2 Horas
            </button>
            <button
              onClick={() => applyPreset("afternoon")}
              className="px-3 py-1.5 rounded-xl border border-subtle bg-surface hover:bg-subtle/40 cc-text-primary transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Sun size={13} className="text-amber-500" /> Tarde (14:00 - 19:30)
            </button>
            <button
              onClick={() => applyPreset("night")}
              className="px-3 py-1.5 rounded-xl border border-subtle bg-surface hover:bg-subtle/40 cc-text-primary transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Moon size={13} className="text-indigo-400" /> Noche (20:00 - 08:00)
            </button>
            <button
              onClick={() => applyPreset("fullday")}
              className="px-3 py-1.5 rounded-xl border border-subtle bg-surface hover:bg-subtle/40 cc-text-primary transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Calendar size={13} className="text-emerald-500" /> Jornada Completa
            </button>
          </div>

          {/* Search Controls */}
          <div className="rounded-2xl border border-subtle bg-surface p-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <label className="block">
                <span className="mb-1.5 block text-[11px] uppercase tracking-wider cc-text-tertiary">
                  Desde (Fecha y Hora)
                </span>
                <input
                  type="datetime-local"
                  className={field}
                  value={startValue}
                  onChange={(e) => setStartValue(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[11px] uppercase tracking-wider cc-text-tertiary">
                  Hasta (Fecha y Hora)
                </span>
                <input
                  type="datetime-local"
                  className={field}
                  value={endValue}
                  onChange={(e) => setEndValue(e.target.value)}
                />
              </label>
              <Button
                variant="copper"
                onClick={runSearch}
                disabled={!canSearch || searching}
              >
                <Search size={14} />
                {searching ? "Buscando…" : "Buscar Cupos"}
              </Button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-subtle pt-3">
              {/* Quick filters */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCoveredOnly(!coveredOnly)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium border transition-colors cursor-pointer ${
                    coveredOnly
                      ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                      : "border-subtle hover:bg-subtle/50 text-zinc-600"
                  }`}
                >
                  <Umbrella size={12} /> Techado
                </button>
                <button
                  onClick={() => setEvOnly(!evOnly)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium border transition-colors cursor-pointer ${
                    evOnly
                      ? "border-[var(--cc-copper)] bg-[var(--cc-copper-tint)] text-[var(--cc-copper)] font-semibold"
                      : "border-subtle hover:bg-subtle/50 text-zinc-600"
                  }`}
                >
                  <Zap size={12} /> Cargador EV
                </button>
              </div>

              {/* View Switcher: List vs Map */}
              <div className="flex items-center gap-1 p-1 rounded-xl bg-subtle/40 border border-subtle">
                <button
                  onClick={() => setViewMode("list")}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    viewMode === "list"
                      ? "bg-surface shadow-xs text-zinc-900"
                      : "text-zinc-500 hover:text-zinc-800"
                  }`}
                  title="Vista de Lista"
                >
                  <List size={15} />
                </button>
                <button
                  onClick={() => setViewMode("map")}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    viewMode === "map"
                      ? "bg-surface shadow-xs text-zinc-900"
                      : "text-zinc-500 hover:text-zinc-800"
                  }`}
                  title="Vista de Mapa Interactivo"
                >
                  <Layers size={15} />
                </button>
              </div>
            </div>
          </div>

          {/* Results View: Interactive Map or Cards */}
          {searching && <SkeletonList rows={3} />}

          {!searching && viewMode === "map" && (
            <ParkingMap
              levels={mapLevels}
              hours={hours}
              // Se pasa el cupo del mapa tal cual. Envolverlo en un
              // ParkingSearchResult obligaba a inventar comunidad y tarifa; el
              // precio real lo calcula la base al reservar.
              onSelectSpot={(spot) => bookSpot(spot)}
            />
          )}

          {!searching && viewMode === "list" && results !== null && results.length === 0 && (
            <EmptyState
              icon={<Car size={22} />}
              title="Sin estacionamientos disponibles"
              description="Ningún vecino tiene su estacionamiento libre en ese horario. Prueba con otro rango de horas o revisa el mapa del edificio."
              tone="neutral"
            />
          )}

          {!searching && viewMode === "list" && results !== null && results.length > 0 && (
            <div className="space-y-3">
              <p className="text-[11px] uppercase tracking-wider cc-text-tertiary">
                {filteredResults.length} {filteredResults.length === 1 ? "cupo disponible" : "cupos disponibles"}
              </p>
              {filteredResults.map((spot) => (
                <SpotCard
                  key={spot.spotId}
                  spot={spot}
                  hours={hours}
                  onBook={bookSpot}
                  booking={bookingSpotId === spot.spotId}
                  accessState={accessStateFor(spot.communityId)}
                  onRequestAccess={requestAccess}
                  requestingAccess={requestingAccessFor === spot.communityId}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: MODO PROPIETARIO (MIS ESTACIONAMIENTOS & GANANCIAS) */}
      {activeTab === "owner" && (
        <ParkingOwnerDashboard
          spots={mySpots}
          earnings={ownerEarnings}
          bookings={receivedBookings}
          loading={mySpotsLoading}
          onRefresh={loadOwnerData}
          onCreateSpot={handleCreateSpot}
          onToggleSpot={handleToggleSpot}
          onDeleteSpot={handleDeleteSpot}
          onApplyToExpenses={handleApplyToExpenses}
        />
      )}

      {/* TAB 3: MIS RESERVAS */}
      {activeTab === "bookings" && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[16px] font-semibold cc-text-primary">
                Mis Reservas Vehiculares ({myBookings.length})
              </h2>
              <p className="text-[12px] cc-text-secondary">
                Accede a tu código de acceso digital y muéstralo en la portería del edificio.
              </p>
            </div>
          </div>

          {bookingsLoading ? (
            <SkeletonList rows={2} />
          ) : myBookings.length === 0 ? (
            <EmptyState
              icon={<KeyRound size={22} />}
              title="Todavía no tienes reservas"
              description="Busca un estacionamiento desocupado por horas en el mapa y tu credencial digital se generará aquí."
              tone="neutral"
            />
          ) : (
            <div className="space-y-3">
              {myBookings.map((booking) => (
                <BookingRow
                  key={booking.id}
                  booking={booking}
                  onOpenPass={(b) => setSelectedPassBooking(b)}
                  onCancel={cancelBooking}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* TAB 4: MODO PORTERÍA / CONSERJERÍA */}
      {activeTab === "gate" && (isConcierge || isAdmin) && (
        <ParkingConciergeGate
          onLookup={(code) => ParkingService.lookupAccess(code)}
          onRecordAccess={(id, type, notes) => ParkingService.recordAccess(id, type, notes)}
          todayBookings={todayBookings}
          loading={gateLoading}
        />
      )}

      {/* TAB 5: AJUSTES DE EDIFICIO (ADMIN) */}
      {activeTab === "admin" && isAdmin && (
        <div className="max-w-xl rounded-2xl border border-subtle bg-surface p-6 space-y-5">
          <div className="flex items-center gap-2">
            <Settings size={18} style={{ color: "var(--cc-copper)" }} />
            <h3 className="text-[16px] font-semibold cc-text-primary">
              Gobernanza de Estacionamientos
            </h3>
          </div>

          <div className="space-y-4">
            <label className="flex items-start gap-3 p-3.5 rounded-xl border border-subtle bg-subtle/20 cursor-pointer">
              <input
                type="checkbox"
                checked={communitySettings?.externalEnabled ?? true}
                onChange={(e) =>
                  setCommunitySettings((prev) =>
                    prev ? { ...prev, externalEnabled: e.target.checked } : null
                  )
                }
                className="mt-1 rounded border-subtle"
              />
              <div>
                <span className="text-[13px] font-semibold cc-text-primary block">
                  Permitir arriendos a visitas externas verificadas
                </span>
                <span className="text-[12px] cc-text-secondary">
                  Si se desactiva, solo los copropietarios y residentes del edificio podrán reservar cupos.
                </span>
              </div>
            </label>

            <div>
              <label className="text-[11px] uppercase tracking-wider cc-text-tertiary block mb-1">
                Comisión Comunitaria (% Fondo de Reserva)
              </label>
              <input
                type="number"
                min={0}
                max={50}
                className={field}
                value={communitySettings?.commissionPercent ?? 10}
                onChange={(e) =>
                  setCommunitySettings((prev) =>
                    prev ? { ...prev, commissionPercent: Number(e.target.value) } : null
                  )
                }
              />
              <span className="text-[11px] cc-text-secondary mt-1 block">
                Porcentaje de cada arriendo que ingresa directamente al fondo de reserva o rebaja general del condominio.
              </span>
            </div>

            <Button
              variant="copper"
              onClick={async () => {
                if (!communitySettings || !user?.communityId) return;
                await ParkingService.updateCommunitySettings(user.communityId, communitySettings);
                toast({ title: "Ajustes actualizados", variant: "success" });
              }}
            >
              Guardar Configuración
            </Button>
          </div>
        </div>
      )}

      {activeTab === "admin" && isAdmin && (
        <AccessRequestsInbox externalEnabled={Boolean(communitySettings?.externalEnabled)} />
      )}

      {/* Digital Access Pass Modal */}
      {selectedPassBooking && (
        <ParkingAccessPassModal
          booking={selectedPassBooking}
          isOpen={Boolean(selectedPassBooking)}
          onClose={() => setSelectedPassBooking(null)}
          buildingName={communityName}
        />
      )}
    </div>
  );
}

/**
 * Bandeja de conductores externos que piden entrar al condominio.
 *
 * Sin esta pantalla el arriendo a externos no funciona: la reserva exige una
 * solicitud aprobada y nadie más puede aprobarla.
 */
function AccessRequestsInbox({ externalEnabled }: { externalEnabled: boolean }) {
  const { toast } = useToast();
  const [requests, setRequests] = useState<ParkingAccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRequests(await ParkingService.listAccessRequests());
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const review = async (request: ParkingAccessRequest, approved: boolean) => {
    if (!approved) {
      const confirmed = window.confirm(
        `¿Rechazar a ${request.fullName} (${request.plate})? Se cancelarán sus reservas futuras.`,
      );
      if (!confirmed) return;
    }

    setBusyId(request.accessId);
    try {
      await ParkingService.reviewAccessRequest(request.accessId, approved);
      toast({
        title: approved ? "Conductor aprobado" : "Conductor rechazado",
        description: approved
          ? `${request.fullName} ya puede reservar estacionamientos en el condominio.`
          : `${request.fullName} no podrá reservar y se cancelaron sus reservas futuras.`,
        variant: "success",
      });
      await load();
    } catch (error: unknown) {
      toast({
        title: "No se pudo procesar",
        description: error instanceof Error ? error.message : "Intenta nuevamente.",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const pending = requests.filter((r) => r.status === "pending");

  return (
    <div className="max-w-xl rounded-2xl border border-subtle bg-surface p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Shield size={18} style={{ color: "var(--cc-copper)" }} />
        <h3 className="text-[16px] font-semibold cc-text-primary">Conductores externos</h3>
        {pending.length > 0 && <Tag tone="amber" solid>{pending.length} por revisar</Tag>}
      </div>

      {!externalEnabled && (
        <p className="text-[12px] cc-text-secondary">
          El arriendo a externos está desactivado. Las solicitudes quedan registradas, pero
          ningún conductor externo podrá reservar mientras siga apagado.
        </p>
      )}

      {loading ? (
        <SkeletonList rows={2} />
      ) : requests.length === 0 ? (
        <EmptyState
          icon={<Shield size={22} />}
          title="Sin solicitudes"
          description="Cuando un conductor externo pida acceso al condominio, aparecerá aquí con sus datos para que decidas."
          tone="neutral"
          dashed={false}
        />
      ) : (
        <div className="space-y-3">
          {requests.map((request) => (
            <div key={request.accessId} className="rounded-xl border border-subtle p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-medium cc-text-primary">{request.fullName}</span>
                    <span className="font-mono text-[13px] cc-text-secondary">{request.plate}</span>
                    <Tag tone={ACCESS_STATUS_TONES[request.status]} solid>
                      {ACCESS_STATUS_LABELS[request.status]}
                    </Tag>
                  </div>
                  <p className="mt-1 text-[12px] cc-text-secondary">
                    {request.phone}
                    {request.nationalId ? ` · ${request.nationalId}` : ""}
                    {request.vehicleDescription ? ` · ${request.vehicleDescription}` : ""}
                  </p>
                </div>

                {request.status === "pending" && (
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="copper"
                      disabled={busyId === request.accessId}
                      onClick={() => review(request, true)}
                    >
                      Aprobar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busyId === request.accessId}
                      onClick={() => review(request, false)}
                    >
                      Rechazar
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function EstacionamientosPage() {
  return (
    <ErrorBoundary name="Estacionamientos">
      <Suspense fallback={<SkeletonList rows={3} />}>
        <EstacionamientosContent />
      </Suspense>
    </ErrorBoundary>
  );
}
