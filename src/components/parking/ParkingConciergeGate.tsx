"use client";

import React, { useState } from "react";
import {
  ShieldCheck,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Car,
  AlertTriangle,
  LogIn,
  LogOut,
  QrCode,
  User,
  Phone,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/cc/Button";
import { Tag } from "@/components/cc/Tag";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency } from "@/lib/utils";
import {
  calculateParkingTimeStatus,
  formatParkingRange,
} from "@/lib/parking";
import type { ParkingAccessLookup, ParkingBooking } from "@/lib/types";

interface ParkingConciergeGateProps {
  onLookup: (query: string) => Promise<ParkingAccessLookup[]>;
  onRecordAccess: (bookingId: string, eventType: "entry" | "exit", notes?: string) => Promise<void>;
  todayBookings: ParkingBooking[];
  loading: boolean;
}

export function ParkingConciergeGate({
  onLookup,
  onRecordAccess,
  todayBookings,
  loading,
}: ParkingConciergeGateProps) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [lookupResults, setLookupResults] = useState<ParkingAccessLookup[] | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<"all" | "active" | "overdue">("all");

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setSearching(true);
    try {
      const results = await onLookup(query.trim());
      setLookupResults(results);
      if (results.length === 0) {
        toast({
          title: "Sin resultados",
          description: "No se encontró ninguna reserva activa con ese código o patente.",
          variant: "destructive",
        });
      }
    } catch (err: unknown) {
      toast({
        title: "Error en búsqueda",
        description: err instanceof Error ? err.message : "Intenta nuevamente.",
        variant: "destructive",
      });
    } finally {
      setSearching(false);
    }
  };

  const handleAction = async (bookingId: string, type: "entry" | "exit") => {
    setProcessingId(bookingId);
    try {
      await onRecordAccess(bookingId, type, `Registrado por conserjería`);
      toast({
        title: type === "entry" ? "Entrada registrada" : "Salida registrada",
        description: `Vehículo ${type === "entry" ? "ingresó" : "salió"} del estacionamiento.`,
        variant: "success",
      });
      // Re-consultar
      if (query.trim()) {
        const results = await onLookup(query.trim());
        setLookupResults(results);
      }
    } catch (err: unknown) {
      toast({
        title: "Error al registrar",
        description: err instanceof Error ? err.message : "Intenta nuevamente.",
        variant: "destructive",
      });
    } finally {
      setProcessingId(null);
    }
  };

  const filteredBookings = todayBookings.filter((b) => {
    if (filterMode === "all") return true;
    const timeStatus = calculateParkingTimeStatus(b.startsAt, b.endsAt, 2000, new Date());
    if (filterMode === "overdue") return timeStatus.isOverdue;
    if (filterMode === "active") return b.status === "active" || b.status === "confirmed";
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Search Header Banner */}
      <div
        className="rounded-3xl p-6 text-white shadow-md space-y-4"
        style={{ background: "linear-gradient(135deg, #1E293B 0%, #0F172A 100%)" }}
      >
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-white/10 text-[var(--cc-copper,#E07A5F)]">
            <ShieldCheck size={24} />
          </div>
          <div>
            <h2 className="text-[17px] font-semibold">
              Control Portería & Acceso Vehicular
            </h2>
            <p className="text-[12px] text-white/70">
              Valida patentes, credenciales de acceso y registra entradas y salidas en tiempo real.
            </p>
          </div>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-3.5 text-zinc-400" />
            <input
              type="text"
              placeholder="Ingresa código (ej: EST-104) o patente (ej: BBCC12)…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-2xl bg-white/10 border border-white/20 text-white placeholder:text-white/50 text-[14px] focus:outline-none focus:ring-2 focus:ring-[var(--cc-copper)]"
            />
          </div>
          <Button type="submit" variant="copper" disabled={searching || !query.trim()}>
            {searching ? "Buscando…" : "Validar Acceso"}
          </Button>
        </form>
      </div>

      {/* Search Results */}
      {lookupResults !== null && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-semibold cc-text-primary">
              Resultado de Validación ({lookupResults.length})
            </h3>
            <button
              onClick={() => {
                setLookupResults(null);
                setQuery("");
              }}
              className="text-[12px] text-zinc-500 hover:text-zinc-700 cursor-pointer"
            >
              Limpiar búsqueda
            </button>
          </div>

          {lookupResults.length === 0 ? (
            <div className="p-6 rounded-2xl border border-dashed border-subtle bg-surface text-center text-[13px] cc-text-secondary">
              No hay autorizaciones activas para &ldquo;{query}&rdquo;.
            </div>
          ) : (
            <div className="space-y-3">
              {lookupResults.map((item) => {
                const timeStatus = calculateParkingTimeStatus(
                  item.startsAt,
                  item.endsAt,
                  2000,
                  new Date()
                );
                return (
                  <div
                    key={item.bookingId}
                    className="p-5 rounded-2xl border border-subtle bg-surface shadow-xs space-y-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[18px] font-bold tracking-wider text-zinc-900 bg-zinc-100 px-2.5 py-1 rounded-lg border border-zinc-300">
                            {item.plate}
                          </span>
                          <Tag tone={item.isValidNow ? "sage" : "rose"} solid>
                            {item.isValidNow ? "Acceso Autorizado" : "Fuera de Horario"}
                          </Tag>
                          {item.driverIsResident && <Tag tone="copper">Residente</Tag>}
                        </div>
                        <p className="text-[14px] font-semibold cc-text-primary mt-1.5">
                          Estacionamiento {item.spotLabel} {item.unitLabel ? `(Depto ${item.unitLabel})` : ""}
                        </p>
                      </div>

                      {/* Status / Overstay Pill */}
                      <div className="text-right">
                        <span
                          className={`font-mono text-[13px] font-bold px-3 py-1 rounded-xl inline-block ${
                            timeStatus.isOverdue
                              ? "bg-rose-100 text-rose-800 animate-pulse"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {timeStatus.formattedCountdown}
                        </span>
                        <span className="text-[11px] cc-text-tertiary block mt-1">
                          {formatParkingRange(item.startsAt, item.endsAt)}
                        </span>
                      </div>
                    </div>

                    {/* Driver details */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-[12px] bg-subtle/20 p-3 rounded-xl">
                      <div className="flex items-center gap-2">
                        <User size={14} className="text-zinc-500" />
                        <div>
                          <span className="text-[10px] uppercase cc-text-tertiary block">Conductor</span>
                          <span className="font-medium cc-text-primary">{item.driverName}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone size={14} className="text-zinc-500" />
                        <div>
                          <span className="text-[10px] uppercase cc-text-tertiary block">Teléfono</span>
                          <a
                            href={`tel:${item.driverPhone}`}
                            className="font-medium text-[var(--cc-copper)] hover:underline"
                          >
                            {item.driverPhone}
                          </a>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 sm:col-span-1 col-span-2">
                        <Car size={14} className="text-zinc-500" />
                        <div>
                          <span className="text-[10px] uppercase cc-text-tertiary block">Vehículo</span>
                          <span className="font-medium cc-text-primary truncate block">
                            {item.vehicleDescription || "Sin descripción"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Gate action buttons */}
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-subtle">
                      <Button
                        size="sm"
                        variant="copper"
                        disabled={processingId === item.bookingId || !item.isValidNow}
                        onClick={() => handleAction(item.bookingId, "entry")}
                      >
                        <LogIn size={14} /> Registrar Entrada
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={processingId === item.bookingId}
                        onClick={() => handleAction(item.bookingId, "exit")}
                      >
                        <LogOut size={14} /> Registrar Salida
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tablero de Ocupación Hoy */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Clock size={16} style={{ color: "var(--cc-copper)" }} />
            <h3 className="text-[15px] font-semibold cc-text-primary">
              Reservas Programadas para Hoy ({todayBookings.length})
            </h3>
          </div>

          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-subtle/40 border border-subtle text-[12px]">
            <button
              onClick={() => setFilterMode("all")}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                filterMode === "all" ? "bg-surface shadow-xs font-semibold cc-text-primary" : "text-zinc-500"
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setFilterMode("active")}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                filterMode === "active" ? "bg-surface shadow-xs font-semibold cc-text-primary" : "text-zinc-500"
              }`}
            >
              Activos
            </button>
            <button
              onClick={() => setFilterMode("overdue")}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                filterMode === "overdue" ? "bg-rose-100 text-rose-800 font-semibold" : "text-zinc-500"
              }`}
            >
              Excedidos
            </button>
          </div>
        </div>

        {filteredBookings.length === 0 ? (
          <div className="p-6 rounded-2xl border border-subtle bg-surface text-center text-[13px] cc-text-secondary">
            No hay registros para este filtro en el turno de hoy.
          </div>
        ) : (
          <div className="divide-y divide-subtle rounded-2xl border border-subtle bg-surface overflow-hidden">
            {filteredBookings.map((b) => {
              const timeStatus = calculateParkingTimeStatus(
                b.startsAt,
                b.endsAt,
                2000,
                new Date()
              );
              return (
                <div
                  key={b.id}
                  className="p-4 flex flex-wrap items-center justify-between gap-3 hover:bg-subtle/10 transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[14px] cc-text-primary">
                        Puesto {b.spotLabel || "—"}
                      </span>
                      <span className="font-mono text-[12px] bg-zinc-100 font-bold px-2 py-0.5 rounded border border-zinc-300">
                        {b.driverPlate || "Patente"}
                      </span>
                      <Tag tone={timeStatus.isOverdue ? "rose" : "sage"} solid>
                        {timeStatus.isOverdue ? "Excedido" : b.status}
                      </Tag>
                    </div>
                    <p className="text-[12px] cc-text-secondary mt-0.5">
                      {b.driverName || "Conductor"} · Código: <span className="font-mono font-bold">{b.accessCode}</span> · {formatParkingRange(b.startsAt, b.endsAt)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setQuery(b.accessCode);
                        onLookup(b.accessCode).then(setLookupResults);
                      }}
                    >
                      Verificar
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
