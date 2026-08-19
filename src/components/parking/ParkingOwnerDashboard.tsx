"use client";

import React, { useState } from "react";
import {
  Plus,
  Car,
  Zap,
  Umbrella,
  Clock,
  ArrowDownToLine,
  TrendingUp,
  Receipt,
  Power,
  CreditCard,
  Trash2,
  Calculator,
  Sparkles,
} from "lucide-react";
import { SkeletonList } from "@/components/ui/Skeleton";
import { Button } from "@/components/cc/Button";
import { Tag } from "@/components/cc/Tag";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency } from "@/lib/utils";
import {
  FLOOR_LEVEL_LABELS,
  SPOT_STATUS_LABELS,
  SPOT_STATUS_TONES,
  VEHICLE_SIZE_LABELS,
  WEEKDAY_LABELS,
  SUGGESTED_HOURLY_RATES,
  parkingErrorMessage,
} from "@/lib/parking";
import type {
  ParkingAvailabilityRule,
  ParkingFloorLevel,
  ParkingBooking,
  ParkingOwnerEarnings,
  ParkingSpot,
  ParkingSpotInput,
  ParkingVehicleSize,
} from "@/lib/types";

interface ParkingOwnerDashboardProps {
  spots: ParkingSpot[];
  earnings: ParkingOwnerEarnings | null;
  bookings: ParkingBooking[];
  loading: boolean;
  onRefresh: () => void;
  onCreateSpot: (input: ParkingSpotInput, availability: Omit<ParkingAvailabilityRule, "id" | "spotId">[]) => Promise<void>;
  onToggleSpot: (spotId: string, isAvailable: boolean) => Promise<void>;
  onDeleteSpot: (spotId: string) => Promise<void>;
  onApplyToExpenses: (amount: number) => Promise<void>;
  /** El comité habilitó el arriendo a conductores ajenos al condominio. */
  externalEnabled: boolean;
}

export function ParkingOwnerDashboard({
  spots,
  earnings,
  bookings,
  loading,
  onRefresh,
  onCreateSpot,
  onToggleSpot,
  onDeleteSpot,
  onApplyToExpenses,
  externalEnabled,
}: ParkingOwnerDashboardProps) {
  const { toast } = useToast();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showExpenseOffsetModal, setShowExpenseOffsetModal] = useState(false);
  const [offsetAmount, setOffsetAmount] = useState<number>(0);
  const [saving, setSaving] = useState(false);

  // New Spot Form state
  const [form, setForm] = useState<{
    label: string;
    description: string;
    accessNotes: string;
    vehicleSize: ParkingVehicleSize;
    floorLevel: ParkingFloorLevel;
    isCovered: boolean;
    hasEvCharger: boolean;
    hourlyRate: number;
    minHours: number;
    allowsExternal: boolean;
  }>({
    label: "",
    description: "",
    accessNotes: "",
    vehicleSize: "auto",
    floorLevel: "S1",
    isCovered: true,
    hasEvCharger: false,
    hourlyRate: 2000,
    minHours: 1,
    allowsExternal: false,
  });

  // Weekly availability builder state (Lun a Vie 08:30 a 18:30 by default)
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]); // Lun-Vie
  const [startTime, setStartTime] = useState("08:30");
  const [endTime, setEndTime] = useState("18:30");

  const toggleWeekday = (day: number) => {
    if (weekdays.includes(day)) {
      setWeekdays(weekdays.filter((d) => d !== day));
    } else {
      setWeekdays([...weekdays, day].sort());
    }
  };

  // Cálculo de estimación mensual: horas por día * días por semana * 4 semanas * tarifa * 0.9 (neto dueño) * 60% ocupación media
  const calculateEstimatedMonthly = () => {
    const [startH, startM] = startTime.split(":").map(Number);
    const [endH, endM] = endTime.split(":").map(Number);
    const dailyHours = Math.max(1, (endH + endM / 60) - (startH + startM / 60));
    const weeklyHours = dailyHours * weekdays.length;
    const monthlyHours = weeklyHours * 4.3;
    const estimatedNet = Math.round(monthlyHours * form.hourlyRate * 0.9 * 0.65);
    return Math.max(0, estimatedNet);
  };

  const handleCreateSubmit = async () => {
    if (!form.label.trim()) {
      toast({
        title: "Falta el identificador",
        description: "Indica el número o etiqueta de tu estacionamiento.",
        variant: "destructive",
      });
      return;
    }

    if (form.hourlyRate <= 0) {
      toast({
        title: "Tarifa inválida",
        description: "La tarifa por hora debe ser mayor a $0.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const availabilityRules = weekdays.map((day) => ({
        weekday: day,
        startTime,
        endTime,
      }));

      await onCreateSpot(
        {
          label: form.label,
          description: form.description,
          accessNotes: form.accessNotes,
          vehicleSize: form.vehicleSize,
          floorLevel: form.floorLevel,
          isCovered: form.isCovered,
          hasEvCharger: form.hasEvCharger,
          hourlyRate: form.hourlyRate,
          minHours: form.minHours,
          allowsExternal: form.allowsExternal,
          status: "published",
        },
        availabilityRules
      );

      toast({
        title: "Estacionamiento publicado con éxito",
        description: "Tu puesto ya está disponible para generar ingresos en la comunidad.",
        variant: "success",
      });
      setShowAddModal(false);
      onRefresh();
    } catch (err: unknown) {
      toast({
        title: "Error al publicar",
        description: parkingErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleApplyOffset = async () => {
    if (offsetAmount <= 0 || (earnings && offsetAmount > earnings.availableBalance)) {
      toast({
        title: "Monto inválido",
        description: "Ingresa un monto válido menor o igual a tu saldo disponible.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      await onApplyToExpenses(offsetAmount);
      toast({
        title: "Descuento aplicado con éxito",
        description: `Se abonaron ${formatCurrency(offsetAmount)} como rebaja en tu próximo aviso de gastos comunes.`,
        variant: "success",
      });
      setShowExpenseOffsetModal(false);
      onRefresh();
    } catch (err: unknown) {
      toast({
        title: "No se pudo aplicar",
        description: parkingErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const field =
    "w-full rounded-xl border border-subtle bg-surface px-3 py-2.5 text-[13px] cc-text-primary";

  return (
    <div className="space-y-6">
      {/* Monetization / Earnings Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-subtle bg-surface p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider cc-text-tertiary">
              Ganancias este mes
            </span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600">
              <TrendingUp size={16} />
            </div>
          </div>
          <p className="mt-3 text-[22px] font-bold cc-text-primary">
            {formatCurrency(earnings?.currentMonthEarnings || 0)}
          </p>
          <p className="text-[11px] cc-text-secondary mt-0.5">
            {earnings?.totalHoursRented || 0} hrs arrendadas este mes
          </p>
        </div>

        <div className="rounded-2xl border border-subtle bg-surface p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider cc-text-tertiary">
              Saldo para Descuento GGCC
            </span>
            <div className="p-2 rounded-xl bg-[var(--cc-copper-tint)] text-[var(--cc-copper)]">
              <Receipt size={16} />
            </div>
          </div>
          <p className="mt-3 text-[22px] font-bold text-emerald-600">
            {formatCurrency(earnings?.availableBalance || 0)}
          </p>
          <button
            onClick={() => {
              setOffsetAmount(earnings?.availableBalance || 0);
              setShowExpenseOffsetModal(true);
            }}
            disabled={!earnings || earnings.availableBalance <= 0}
            className="mt-1 text-[11px] font-semibold text-[var(--cc-copper)] hover:underline flex items-center gap-1 disabled:opacity-50 disabled:no-underline text-left cursor-pointer"
          >
            <ArrowDownToLine size={12} />
            Abonar a Gastos Comunes →
          </button>
        </div>

        <div className="rounded-2xl border border-subtle bg-surface p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider cc-text-tertiary">
              Histórico Acumulado
            </span>
            <div className="p-2 rounded-xl bg-zinc-500/10 text-zinc-600">
              <CreditCard size={16} />
            </div>
          </div>
          <p className="mt-3 text-[22px] font-bold cc-text-primary">
            {formatCurrency(earnings?.totalHistoricalEarnings || 0)}
          </p>
          <p className="text-[11px] cc-text-secondary mt-0.5">
            {earnings?.totalBookingsCount || 0} reservas completadas
          </p>
        </div>

        <div className="rounded-2xl border border-subtle bg-[var(--cc-copper-tint)]/30 border-[rgba(156,86,54,0.2)] p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-[var(--cc-copper)] uppercase tracking-wider">
              Ahorro Vecinal
            </span>
            <Sparkles size={16} style={{ color: "var(--cc-copper)" }} />
          </div>
          <p className="mt-2 text-[12px] cc-text-secondary">
            Rentabiliza tu puesto cuando estés trabajando o de viaje y descuéntalo de tus gastos comunes.
          </p>
          <Button
            size="sm"
            variant="copper"
            className="mt-3 w-full"
            onClick={() => setShowAddModal(true)}
          >
            <Plus size={14} /> Publicar Puesto
          </Button>
        </div>
      </div>

      {/* Mis Estacionamientos Publicados */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-semibold cc-text-primary">
              Mis Estacionamientos ({spots.length})
            </h2>
            <p className="text-[12px] cc-text-secondary">
              Controla tus cupos, fija tarifas por hora y activa o pausa la disponibilidad con un clic.
            </p>
          </div>
          <Button size="sm" onClick={() => setShowAddModal(true)}>
            <Plus size={13} /> Añadir Estacionamiento
          </Button>
        </div>

        {/* Mismo motivo: mostrar el estado vacío mientras carga hacía creer
            al dueño que sus estacionamientos habían desaparecido. */}
        {loading ? (
          <SkeletonList rows={2} />
        ) : spots.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-subtle bg-surface p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[var(--cc-copper-tint)] text-[var(--cc-copper)] flex items-center justify-center mx-auto">
              <Car size={24} />
            </div>
            <h3 className="text-[15px] font-semibold cc-text-primary">
              No tienes estacionamientos registrados
            </h3>
            <p className="text-[13px] cc-text-secondary max-w-md mx-auto">
              Si sales a trabajar durante el día o tienes un cupo desocupado, publícalo y empieza a generar ingresos automáticamente.
            </p>
            <Button size="sm" variant="copper" onClick={() => setShowAddModal(true)}>
              <Plus size={14} /> Publicar mi estacionamiento
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {spots.map((spot) => {
              const isPublished = spot.status === "published";
              return (
                <div
                  key={spot.id}
                  className="rounded-2xl border border-subtle bg-surface p-5 space-y-4 hover:shadow-xs transition-shadow"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[16px] font-bold cc-text-primary">
                          Estacionamiento {spot.label}
                        </span>
                        <Tag tone={SPOT_STATUS_TONES[spot.status]} solid>
                          {SPOT_STATUS_LABELS[spot.status]}
                        </Tag>
                      </div>
                      <p className="text-[12px] cc-text-secondary mt-0.5">
                        {spot.unitLabel ? `Depto ${spot.unitLabel} · ` : ""}
                        {VEHICLE_SIZE_LABELS[spot.vehicleSize]}
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="text-[18px] font-bold cc-text-primary">
                        {formatCurrency(spot.hourlyRate)}
                      </span>
                      <span className="text-[11px] cc-text-tertiary block">por hora</span>
                    </div>
                  </div>

                  {spot.description && (
                    <p className="text-[13px] cc-text-secondary line-clamp-2">
                      {spot.description}
                    </p>
                  )}

                  {/* Attributes */}
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    {spot.isCovered && (
                      <Tag tone="sage">
                        <Umbrella size={11} /> Techado
                      </Tag>
                    )}
                    {spot.hasEvCharger && (
                      <Tag tone="copper">
                        <Zap size={11} /> Cargador EV
                      </Tag>
                    )}
                    <Tag tone="neutral">
                      <Clock size={11} /> Mín. {spot.minHours}h
                    </Tag>
                  </div>

                  {/* Quick Toggle & Actions */}
                  <div className="flex items-center justify-between border-t border-subtle pt-3">
                    <button
                      onClick={() => onToggleSpot(spot.id, !isPublished)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium transition-all cursor-pointer ${
                        isPublished
                          ? "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20"
                          : "bg-zinc-500/10 text-zinc-700 hover:bg-zinc-500/20"
                      }`}
                    >
                      <Power size={13} />
                      {isPublished ? "Disponible para arriendos" : "Pausado"}
                    </button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDeleteSpot(spot.id)}
                      className="text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Historial de Arriendos Recibidos */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Receipt size={16} style={{ color: "var(--cc-copper)" }} />
          <h2 className="text-[15px] font-semibold cc-text-primary">
            Historial de Arriendos en mis Puestos
          </h2>
        </div>

        {bookings.length === 0 ? (
          <div className="rounded-2xl border border-subtle bg-surface p-6 text-center text-[13px] cc-text-secondary">
            Aún no registras reservas en tus estacionamientos. Cuando un vecino o visita arriende tu puesto, aparecerá aquí en tiempo real.
          </div>
        ) : (
          <div className="divide-y divide-subtle rounded-2xl border border-subtle bg-surface overflow-hidden">
            {bookings.map((b) => (
              <div key={b.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[14px] cc-text-primary">
                      Puesto {b.spotLabel || "—"}
                    </span>
                    <span className="font-mono text-[12px] bg-subtle/50 px-2 py-0.5 rounded font-bold">
                      {b.driverPlate || "Patente"}
                    </span>
                    <Tag tone="sage" solid>
                      {b.status === "completed" ? "Completado" : "Activo"}
                    </Tag>
                  </div>
                  <p className="text-[12px] cc-text-secondary mt-0.5">
                    Conductor: {b.driverName || "Vecino"} · {new Date(b.startsAt).toLocaleDateString("es-CL")}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[15px] font-bold text-emerald-600">
                    +{formatCurrency(b.ownerPayoutAmount || b.totalAmount * 0.9)}
                  </span>
                  <span className="text-[10px] cc-text-tertiary block">Ganancia neta</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Modal: Publicar Nuevo Estacionamiento */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-3xl border border-subtle bg-surface p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-[17px] font-semibold cc-text-primary">
              Publicar Estacionamiento para Arriendo
            </h3>
            <p className="text-[12px] cc-text-secondary">
              Ingresa los datos de tu puesto y los horarios semanales en que estará disponible.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] uppercase tracking-wider cc-text-tertiary block mb-1">
                  Número / Identificador del Puesto *
                </label>
                <input
                  className={field}
                  placeholder="Ej: S1-104, 201, Torre B-15, etc."
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] uppercase tracking-wider cc-text-tertiary block mb-1">
                    Tipo de Vehículo
                  </label>
                  <select
                    className={field}
                    value={form.vehicleSize}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        vehicleSize: e.target.value as ParkingVehicleSize,
                      })
                    }
                  >
                    <option value="auto">Auto estándar</option>
                    <option value="suv">SUV / Crossover</option>
                    <option value="camioneta">Camioneta</option>
                    <option value="moto">Moto</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-wider cc-text-tertiary block mb-1">
                    Nivel del Edificio
                  </label>
                  <select
                    className={field}
                    value={form.floorLevel}
                    onChange={(e) =>
                      setForm({ ...form, floorLevel: e.target.value as ParkingFloorLevel })
                    }
                  >
                    {(Object.keys(FLOOR_LEVEL_LABELS) as ParkingFloorLevel[]).map((level) => (
                      <option key={level} value={level}>
                        {FLOOR_LEVEL_LABELS[level]}
                      </option>
                    ))}
                  </select>
                  <span className="text-[11px] cc-text-secondary mt-1 block">
                    Define en qué piso se dibuja tu puesto en el plano del edificio.
                  </span>
                </div>
                <div className="col-span-2">
                  <label
                    className="flex items-start gap-3 p-3.5 rounded-xl border border-subtle"
                    style={{ opacity: externalEnabled ? 1 : 0.55 }}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 rounded border-subtle"
                      disabled={!externalEnabled}
                      checked={form.allowsExternal}
                      onChange={(e) => setForm({ ...form, allowsExternal: e.target.checked })}
                    />
                    <div>
                      <span className="text-[13px] font-semibold cc-text-primary block">
                        Abrir también a conductores externos
                      </span>
                      <span className="text-[12px] cc-text-secondary">
                        {externalEnabled
                          ? "Además de tus vecinos, podrán reservarlo conductores de fuera aprobados por la administración."
                          : "La administración de tu condominio no habilitó el arriendo a externos, así que tu puesto queda solo para vecinos."}
                      </span>
                    </div>
                  </label>
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-wider cc-text-tertiary block mb-1">
                    Tarifa por Hora ($ CLP) *
                  </label>
                  <input
                    type="number"
                    className={field}
                    value={form.hourlyRate}
                    onChange={(e) =>
                      setForm({ ...form, hourlyRate: Number(e.target.value) })
                    }
                  />
                </div>
              </div>

              {/* Suggestions */}
              <div className="flex flex-wrap gap-2 text-[11px]">
                {SUGGESTED_HOURLY_RATES.map((s) => (
                  <button
                    key={s.rate}
                    type="button"
                    onClick={() => setForm({ ...form, hourlyRate: s.rate })}
                    className={`px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                      form.hourlyRate === s.rate
                        ? "border-[var(--cc-copper)] bg-[var(--cc-copper-tint)] font-semibold text-[var(--cc-copper)]"
                        : "border-subtle hover:bg-subtle/50 text-zinc-600"
                    }`}
                  >
                    {s.label} (${s.rate.toLocaleString("es-CL")})
                  </button>
                ))}
              </div>

              {/* Checkboxes */}
              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-2 text-[13px] cc-text-primary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isCovered}
                    onChange={(e) =>
                      setForm({ ...form, isCovered: e.target.checked })
                    }
                    className="rounded border-subtle"
                  />
                  Techado
                </label>
                <label className="flex items-center gap-2 text-[13px] cc-text-primary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.hasEvCharger}
                    onChange={(e) =>
                      setForm({ ...form, hasEvCharger: e.target.checked })
                    }
                    className="rounded border-subtle"
                  />
                  Cargador Eléctrico (EV)
                </label>
              </div>

              {/* Disponibilidad Semanal */}
              <div className="p-3.5 rounded-2xl bg-subtle/20 border border-subtle space-y-2.5">
                <span className="text-[12px] font-semibold cc-text-primary block">
                  Disponibilidad Semanal por Defecto
                </span>
                <div className="flex items-center justify-between gap-1">
                  {WEEKDAY_LABELS.map((lbl, idx) => {
                    const active = weekdays.includes(idx);
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => toggleWeekday(idx)}
                        className={`w-9 h-9 rounded-xl text-[11px] font-semibold transition-all cursor-pointer ${
                          active
                            ? "bg-[var(--cc-copper)] text-white shadow-xs"
                            : "bg-surface border border-subtle text-zinc-500 hover:border-zinc-400"
                        }`}
                      >
                        {lbl}
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <span className="text-[10px] uppercase cc-text-tertiary block">
                      Hora Inicio
                    </span>
                    <input
                      type="time"
                      className={field}
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                    />
                  </div>
                  <div>
                    <span className="text-[10px] uppercase cc-text-tertiary block">
                      Hora Término
                    </span>
                    <input
                      type="time"
                      className={field}
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                    />
                  </div>
                </div>

                {/* Live Estimator Badge */}
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 text-[12px]">
                  <div className="flex items-center gap-1.5">
                    <Calculator size={14} className="text-emerald-600" />
                    <span>Ingreso estimado:</span>
                  </div>
                  <strong className="font-bold">
                    ~{formatCurrency(calculateEstimatedMonthly())} / mes
                  </strong>
                </div>
              </div>

              <div>
                <label className="text-[11px] uppercase tracking-wider cc-text-tertiary block mb-1">
                  Instrucciones Secretas de Acceso (Solo para quien reserve)
                </label>
                <textarea
                  className={field}
                  rows={2}
                  placeholder="Ej: Bajar por rampa poniente, puesto al lado del pilar 14 frente al ascensor."
                  value={form.accessNotes}
                  onChange={(e) =>
                    setForm({ ...form, accessNotes: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-subtle">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAddModal(false)}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button
                variant="copper"
                size="sm"
                onClick={handleCreateSubmit}
                disabled={saving}
              >
                {saving ? "Publicando…" : "Publicar Estacionamiento"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Abonar a Gastos Comunes */}
      {showExpenseOffsetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-3xl border border-subtle bg-surface p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600">
                <Receipt size={20} />
              </div>
              <div>
                <h3 className="text-[16px] font-semibold cc-text-primary">
                  Abonar a Gastos Comunes
                </h3>
                <p className="text-[12px] cc-text-secondary">
                  Aplica tu saldo acumulado directamente como descuento en tu próximo cobro.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-subtle/30 border border-subtle space-y-2">
              <div className="flex justify-between text-[13px]">
                <span className="cc-text-secondary">Saldo Disponible:</span>
                <span className="font-bold text-emerald-600">
                  {formatCurrency(earnings?.availableBalance || 0)}
                </span>
              </div>
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-wider cc-text-tertiary block mb-1">
                Monto a Descontar ($ CLP)
              </label>
              <input
                type="number"
                className={field}
                value={offsetAmount}
                max={earnings?.availableBalance || 0}
                onChange={(e) => setOffsetAmount(Number(e.target.value))}
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-subtle">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowExpenseOffsetModal(false)}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button
                variant="copper"
                size="sm"
                onClick={handleApplyOffset}
                disabled={saving || offsetAmount <= 0}
              >
                {saving ? "Aplicando…" : "Confirmar Abono"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
