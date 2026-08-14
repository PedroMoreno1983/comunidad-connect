"use client";

import React, { useState } from "react";
import { Car, Zap, Umbrella, CheckCircle, Layers } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { FLOOR_LEVEL_LABELS, VEHICLE_SIZE_LABELS } from "@/lib/parking";
import type { ParkingFloorLevel, ParkingMapLevel, ParkingMapSpot } from "@/lib/types";

interface ParkingMapProps {
  levels: ParkingMapLevel[];
  selectedSpotId?: string | null;
  onSelectSpot: (spot: ParkingMapSpot) => void;
  hours: number;
}

export function ParkingMap({
  levels,
  selectedSpotId,
  onSelectSpot,
  hours,
}: ParkingMapProps) {
  const [activeLevelId, setActiveLevelId] = useState<ParkingFloorLevel>(
    levels[0]?.levelId || "S1"
  );

  const currentLevel = levels.find((l) => l.levelId === activeLevelId) || levels[0];

  if (!currentLevel) {
    return (
      <div className="p-8 text-center rounded-2xl border border-subtle bg-surface text-[13px] cc-text-secondary">
        Cargando plano de estacionamientos…
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-subtle bg-surface p-5 space-y-5">
      {/* Header with floor level selector tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-subtle pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Layers size={16} style={{ color: "var(--cc-copper)" }} />
            <h3 className="text-[15px] font-semibold cc-text-primary">
              Mapa Interactivo del Condominio
            </h3>
          </div>
          <p className="text-[12px] cc-text-secondary mt-0.5">
            Selecciona un nivel y haz clic en un cupo verde para reservar.
          </p>
        </div>

        {/* Level pills */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-subtle/40 border border-subtle">
          {levels.map((lvl) => {
            const isActive = lvl.levelId === activeLevelId;
            return (
              <button
                key={lvl.levelId}
                onClick={() => setActiveLevelId(lvl.levelId)}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                  isActive
                    ? "bg-surface shadow-xs font-semibold cc-text-primary border border-subtle"
                    : "cc-text-secondary hover:cc-text-primary"
                }`}
              >
                {lvl.levelId} · {lvl.availableSpots} libres
              </button>
            );
          })}
        </div>
      </div>

      {/* Legend & Stats */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] cc-text-secondary bg-subtle/20 p-2.5 rounded-xl">
        <span className="font-medium cc-text-primary">
          {FLOOR_LEVEL_LABELS[currentLevel.levelId] || currentLevel.name}
        </span>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20" />
            Disponible
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-amber-500/20" />
            Ocupado
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-zinc-400" />
            No disponible
          </span>
        </div>
      </div>

      {/* Visual Architectural Parking Lot Grid */}
      <div className="relative rounded-xl border border-subtle bg-subtle/10 p-6 overflow-x-auto min-h-[300px] flex flex-col justify-between">
        {/* Top Row of Spots */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {currentLevel.spots.slice(0, 4).map((spot) => {
            const isSelected = selectedSpotId === spot.spotId;
            const isAvailable = spot.status === "available";

            return (
              <button
                key={spot.id}
                disabled={!isAvailable}
                onClick={() => onSelectSpot(spot)}
                className={`relative flex flex-col justify-between p-3 rounded-xl border-2 transition-all text-left min-h-[110px] ${
                  isSelected
                    ? "border-[var(--cc-copper)] bg-[var(--cc-copper-tint)] ring-2 ring-[var(--cc-copper)]/30 scale-[1.02]"
                    : isAvailable
                    ? "border-emerald-500/50 bg-surface hover:border-emerald-500 hover:shadow-md cursor-pointer"
                    : "border-subtle bg-subtle/40 opacity-60 cursor-not-allowed"
                }`}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className="font-mono text-[14px] font-bold cc-text-primary">
                    P-{spot.label}
                  </span>
                  <div className="flex items-center gap-1">
                    {spot.isCovered && (
                      <span title="Techado">
                        <Umbrella size={11} className="text-zinc-500" />
                      </span>
                    )}
                    {spot.hasEvCharger && (
                      <span title="Cargador EV">
                        <Zap size={11} className="text-amber-500" />
                      </span>
                    )}
                  </div>
                </div>

                <div className="my-1 text-center">
                  <Car
                    size={22}
                    className={`mx-auto transition-colors ${
                      isSelected
                        ? "text-[var(--cc-copper)]"
                        : isAvailable
                        ? "text-emerald-600"
                        : "text-zinc-400"
                    }`}
                  />
                  <span className="text-[10px] uppercase tracking-wider cc-text-tertiary">
                    {VEHICLE_SIZE_LABELS[spot.vehicleSize]}
                  </span>
                </div>

                <div className="flex items-center justify-between border-t border-subtle pt-1.5 text-[11px]">
                  <span className="font-semibold cc-text-primary">
                    {formatCurrency(spot.hourlyRate)}/h
                  </span>
                  {isAvailable ? (
                    <span className="text-[10px] font-medium text-emerald-600">Libre</span>
                  ) : (
                    <span className="text-[10px] text-amber-600">Ocupado</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Driving Lane / Calle de maniobra */}
        <div className="my-6 py-2 px-4 rounded-lg bg-subtle/30 border border-dashed border-subtle flex items-center justify-between text-[11px] cc-text-tertiary font-mono">
          <span>← ACCESO & SALIDA (VÍA VEHICULAR)</span>
          <span>VELOCIDAD MÁX 10 KM/H →</span>
        </div>

        {/* Bottom Row of Spots */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {currentLevel.spots.slice(4, 8).map((spot) => {
            const isSelected = selectedSpotId === spot.spotId;
            const isAvailable = spot.status === "available";

            return (
              <button
                key={spot.id}
                disabled={!isAvailable}
                onClick={() => onSelectSpot(spot)}
                className={`relative flex flex-col justify-between p-3 rounded-xl border-2 transition-all text-left min-h-[110px] ${
                  isSelected
                    ? "border-[var(--cc-copper)] bg-[var(--cc-copper-tint)] ring-2 ring-[var(--cc-copper)]/30 scale-[1.02]"
                    : isAvailable
                    ? "border-emerald-500/50 bg-surface hover:border-emerald-500 hover:shadow-md cursor-pointer"
                    : "border-subtle bg-subtle/40 opacity-60 cursor-not-allowed"
                }`}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className="font-mono text-[14px] font-bold cc-text-primary">
                    P-{spot.label}
                  </span>
                  <div className="flex items-center gap-1">
                    {spot.isCovered && (
                      <span title="Techado">
                        <Umbrella size={11} className="text-zinc-500" />
                      </span>
                    )}
                    {spot.hasEvCharger && (
                      <span title="Cargador EV">
                        <Zap size={11} className="text-amber-500" />
                      </span>
                    )}
                  </div>
                </div>

                <div className="my-1 text-center">
                  <Car
                    size={22}
                    className={`mx-auto transition-colors ${
                      isSelected
                        ? "text-[var(--cc-copper)]"
                        : isAvailable
                        ? "text-emerald-600"
                        : "text-zinc-400"
                    }`}
                  />
                  <span className="text-[10px] uppercase tracking-wider cc-text-tertiary">
                    {VEHICLE_SIZE_LABELS[spot.vehicleSize]}
                  </span>
                </div>

                <div className="flex items-center justify-between border-t border-subtle pt-1.5 text-[11px]">
                  <span className="font-semibold cc-text-primary">
                    {formatCurrency(spot.hourlyRate)}/h
                  </span>
                  {isAvailable ? (
                    <span className="text-[10px] font-medium text-emerald-600">Libre</span>
                  ) : (
                    <span className="text-[10px] text-amber-600">Ocupado</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {hours > 0 && selectedSpotId && (
        <div className="flex items-center justify-between bg-[var(--cc-copper-tint)] border border-[rgba(156,86,54,0.2)] rounded-xl p-3 text-[13px] cc-text-primary">
          <div className="flex items-center gap-2">
            <CheckCircle size={15} style={{ color: "var(--cc-copper)" }} />
            <span>Estacionamiento seleccionado en el plano</span>
          </div>
          <span className="text-[12px] font-semibold">
            Cotización: {hours}h
          </span>
        </div>
      )}
    </div>
  );
}
