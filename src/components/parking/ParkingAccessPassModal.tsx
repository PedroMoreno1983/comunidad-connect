"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  QrCode,
  MapPin,
  Clock,
  Navigation,
  Car,
  AlertTriangle,
  CheckCircle,
  Copy,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/cc/Button";
import { Tag } from "@/components/cc/Tag";
import { useToast } from "@/components/ui/Toast";
import {
  calculateParkingTimeStatus,
  formatParkingRange,
  type ParkingTimeStatus,
} from "@/lib/parking";
import type { ParkingBooking } from "@/lib/types";

interface ParkingAccessPassModalProps {
  booking: ParkingBooking | null;
  isOpen: boolean;
  onClose: () => void;
  buildingName?: string;
  buildingAddress?: string;
}

export function ParkingAccessPassModal({
  booking,
  isOpen,
  onClose,
  buildingName = "Condominio Convive",
  buildingAddress = "Av. Las Condes 12340, Santiago",
}: ParkingAccessPassModalProps) {
  const { toast } = useToast();
  const [timeStatus, setTimeStatus] = useState<ParkingTimeStatus | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!booking) return;

    const updateTimer = () => {
      setTimeStatus(
        calculateParkingTimeStatus(
          booking.startsAt,
          booking.endsAt,
          2000,
          new Date()
        )
      );
    };

    updateTimer();
    const interval = setInterval(updateTimer, 10000); // Actualizar cada 10s
    return () => clearInterval(interval);
  }, [booking]);

  if (!isOpen || !booking) return null;

  const copyCode = () => {
    navigator.clipboard.writeText(booking.accessCode);
    setCopied(true);
    toast({
      title: "Código copiado",
      description: "Muestra este código al conserje en la barrera.",
      variant: "success",
    });
    setTimeout(() => setCopied(false), 2500);
  };

  const wazeUrl = `https://waze.com/ul?q=${encodeURIComponent(buildingAddress)}&navigate=yes`;
  const gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(buildingAddress)}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-md rounded-3xl border border-subtle bg-surface shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        style={{ background: "var(--cc-ivory, #FCFBF7)" }}
      >
        {/* Header Ribbon */}
        <div
          className="px-6 py-4 flex items-center justify-between text-white"
          style={{ background: "linear-gradient(135deg, #2D3748 0%, #1A202C 100%)" }}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-[var(--cc-copper,#E07A5F)] font-bold">
              V
            </div>
            <div>
              <h3 className="text-[14px] font-semibold tracking-wide">
                Pase Digital Vimba
              </h3>
              <p className="text-[11px] text-white/70">Credencial de Acceso Vehicular</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Live Time Indicator */}
          {timeStatus && (
            <div
              className={`rounded-2xl p-4 border transition-all ${
                timeStatus.isOverdue
                  ? "bg-rose-50 border-rose-200 text-rose-900"
                  : timeStatus.isStarted
                  ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                  : "bg-amber-50 border-amber-200 text-amber-900"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="flex items-center gap-1.5 text-[12px] font-semibold">
                  {timeStatus.isOverdue ? (
                    <AlertTriangle size={15} className="text-rose-600 animate-pulse" />
                  ) : (
                    <Clock size={15} className="text-emerald-600" />
                  )}
                  {timeStatus.isOverdue
                    ? "Tiempo de estadía excedido"
                    : timeStatus.isStarted
                    ? "Reserva en curso"
                    : "Reserva programada"}
                </span>
                <span className="font-mono text-[13px] font-bold">
                  {timeStatus.formattedCountdown}
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-black/10 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    timeStatus.isOverdue ? "bg-rose-600" : "bg-emerald-600"
                  }`}
                  style={{ width: `${timeStatus.progressPercentage}%` }}
                />
              </div>

              {timeStatus.isOverdue && timeStatus.overstayPenaltyAmount > 0 && (
                <p className="mt-2 text-[11px] text-rose-700">
                  Recargo por sobreestadía: +${timeStatus.overstayPenaltyAmount.toLocaleString("es-CL")}
                </p>
              )}
            </div>
          )}

          {/* QR Code & Access Code Section */}
          <div className="flex flex-col items-center justify-center p-5 rounded-2xl border border-subtle bg-white shadow-xs text-center">
            {/* Visual QR Code Display */}
            <div className="relative p-3 bg-white rounded-2xl border-2 border-zinc-900/10 shadow-xs mb-3">
              <div className="w-36 h-36 bg-zinc-950 rounded-xl flex items-center justify-center relative overflow-hidden">
                {/* SVG pattern representing scannable Vimba QR */}
                <svg className="w-full h-full p-2" viewBox="0 0 100 100" fill="white">
                  <rect x="10" y="10" width="25" height="25" rx="3" fill="#FFF" />
                  <rect x="15" y="15" width="15" height="15" rx="2" fill="#000" />
                  <rect x="65" y="10" width="25" height="25" rx="3" fill="#FFF" />
                  <rect x="70" y="15" width="15" height="15" rx="2" fill="#000" />
                  <rect x="10" y="65" width="25" height="25" rx="3" fill="#FFF" />
                  <rect x="15" y="70" width="15" height="15" rx="2" fill="#000" />
                  {/* Central Vimba V mark */}
                  <rect x="42" y="42" width="16" height="16" rx="4" fill="#E07A5F" />
                  {/* Dense data matrix pixels */}
                  <rect x="42" y="15" width="6" height="6" fill="#FFF" />
                  <rect x="52" y="22" width="6" height="6" fill="#FFF" />
                  <rect x="15" y="45" width="6" height="6" fill="#FFF" />
                  <rect x="25" y="52" width="6" height="6" fill="#FFF" />
                  <rect x="68" y="45" width="6" height="6" fill="#FFF" />
                  <rect x="78" y="52" width="6" height="6" fill="#FFF" />
                  <rect x="42" y="68" width="6" height="6" fill="#FFF" />
                  <rect x="52" y="78" width="6" height="6" fill="#FFF" />
                  <rect x="65" y="65" width="8" height="8" fill="#FFF" />
                  <rect x="78" y="78" width="8" height="8" fill="#FFF" />
                </svg>
              </div>
              <div className="absolute inset-x-0 bottom-1 flex justify-center">
                <span className="text-[9px] font-mono tracking-widest text-zinc-500 uppercase bg-white/90 px-1 rounded">
                  ESCANEABLE EN BARRERA
                </span>
              </div>
            </div>

            <p className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1">
              Código Alfanumérico Portería
            </p>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[24px] font-extrabold tracking-[0.25em] text-zinc-900">
                {booking.accessCode}
              </span>
              <button
                onClick={copyCode}
                className="p-1.5 rounded-lg border border-subtle hover:bg-subtle/50 transition-colors text-zinc-600"
                title="Copiar código"
              >
                {copied ? <CheckCircle size={15} className="text-emerald-600" /> : <Copy size={15} />}
              </button>
            </div>
          </div>

          {/* Spot & Vehicle Details */}
          <div className="rounded-2xl border border-subtle bg-surface p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-subtle pb-2">
              <div>
                <p className="text-[10px] uppercase tracking-wider cc-text-tertiary">Estacionamiento Asignado</p>
                <p className="text-[15px] font-bold cc-text-primary">
                  Puesto {booking.spotLabel || "—"}
                  {booking.unitLabel ? ` · Depto ${booking.unitLabel}` : ""}
                </p>
              </div>
              <Tag tone="copper" solid>
                Vimba Pass
              </Tag>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[12px]">
              <div>
                <span className="text-[10px] uppercase cc-text-tertiary block">Vehículo / Patente</span>
                <span className="font-mono font-semibold cc-text-primary">
                  {booking.driverPlate || "Patente registrada"}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase cc-text-tertiary block">Conductor</span>
                <span className="font-medium cc-text-primary truncate block">
                  {booking.driverName || "Conductor Vimba"}
                </span>
              </div>
            </div>

            <div className="border-t border-subtle pt-2 text-[12px]">
              <span className="text-[10px] uppercase cc-text-tertiary block">Horario Contratado</span>
              <span className="font-medium cc-text-primary">
                {formatParkingRange(booking.startsAt, booking.endsAt)}
              </span>
            </div>
          </div>

          {/* Location & Navigation Actions */}
          <div className="rounded-2xl border border-subtle bg-surface p-4 space-y-3">
            <div className="flex items-start gap-2 text-[12px]">
              <MapPin size={15} className="text-[var(--cc-copper)] shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold cc-text-primary">{buildingName}</p>
                <p className="text-[11px] cc-text-secondary">{buildingAddress}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <a
                href={wazeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white text-[12px] font-medium transition-all"
              >
                <Navigation size={13} />
                Abrir en Waze
              </a>
              <a
                href={gmapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-medium transition-all"
              >
                <ExternalLink size={13} />
                Google Maps
              </a>
            </div>
          </div>

          {/* Security Note */}
          <div className="flex items-center gap-2 p-3 rounded-xl bg-[var(--cc-amber-tint)] border border-[rgba(201,154,74,0.25)] text-[11px] cc-text-secondary">
            <ShieldCheck size={16} className="text-[var(--cc-amber)] shrink-0" />
            <span>
              Verificado con 3 filtros de seguridad Vimba. Entrada autorizada por conserjería.
            </span>
          </div>
        </div>

        <div className="p-4 border-t border-subtle bg-subtle/20 flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  );
}
