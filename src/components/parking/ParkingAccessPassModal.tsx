"use client";

import React, { useEffect, useState } from "react";
import {
  Car,
  Clock,
  MapPin,
  QrCode,
  Copy,
  Check,
  Navigation,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  X,
  Share2,
  Printer,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/cc/Button";
import { Tag } from "@/components/cc/Tag";
import { useToast } from "@/components/ui/Toast";
import {
  buildGoogleMapsNavigationUrl,
  buildParkingShareWhatsAppUrl,
  buildWazeNavigationUrl,
  calculateParkingTimeStatus,
  formatChileanDateTime,
  formatParkingRange,
  type ParkingTimeStatus,
} from "@/lib/parking";
import type { ParkingBooking } from "@/lib/types";

interface ParkingAccessPassModalProps {
  booking: ParkingBooking;
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
  const [copied, setCopied] = useState(false);
  const [timeStatus, setTimeStatus] = useState<ParkingTimeStatus>(() =>
    calculateParkingTimeStatus(booking.startsAt, booking.endsAt, 2000, new Date())
  );

  // Actualiza el reloj y el temporizador de tiempo restante cada 30 segundos
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeStatus(
        calculateParkingTimeStatus(booking.startsAt, booking.endsAt, 2000, new Date())
      );
    }, 30000);
    return () => clearInterval(interval);
  }, [booking.startsAt, booking.endsAt]);

  if (!isOpen) return null;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(booking.accessCode);
    setCopied(true);
    toast({
      title: "Código copiado",
      description: `Código ${booking.accessCode} copiado al portapapeles.`,
      variant: "success",
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareWhatsApp = () => {
    const shareUrl = buildParkingShareWhatsAppUrl({
      spotLabel: booking.spotLabel || "Puesto Asignado",
      accessCode: booking.accessCode,
      plate: booking.driverPlate || "—",
      buildingName,
      buildingAddress,
      range: formatParkingRange(booking.startsAt, booking.endsAt),
    });
    window.open(shareUrl, "_blank");
  };

  const handlePrint = () => {
    window.print();
  };

  const wazeUrl = buildWazeNavigationUrl(buildingAddress);
  const mapsUrl = buildGoogleMapsNavigationUrl(buildingAddress);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-subtle bg-surface shadow-2xl space-y-0">
        {/* Pass Header Banner */}
        <div
          className="p-6 text-white text-center relative overflow-hidden"
          style={{ background: "linear-gradient(135deg, #1E293B 0%, #0F172A 100%)" }}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-white/10 text-white/80 hover:bg-white/20 transition-colors"
          >
            <X size={18} />
          </button>

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-[12px] font-medium text-[var(--cc-copper,#E07A5F)] mb-2">
            <ShieldCheck size={14} />
            <span>Pase Digital de Acceso</span>
          </div>

          <h2 className="text-[20px] font-bold tracking-tight">
            Estacionamiento {booking.spotLabel || "—"}
          </h2>
          <p className="text-[12px] text-white/70 mt-0.5">
            {buildingName} {booking.unitLabel ? `· Depto ${booking.unitLabel}` : ""}
          </p>

          {/* Real-time Status Badge */}
          <div className="mt-4 inline-flex items-center gap-2 px-4 py-1.5 rounded-2xl bg-white/15 backdrop-blur-xs font-mono text-[13px]">
            <Clock size={14} className={timeStatus.isOverdue ? "text-rose-400" : "text-emerald-400"} />
            <span className={timeStatus.isOverdue ? "text-rose-300 font-bold" : "text-emerald-300 font-semibold"}>
              {timeStatus.formattedCountdown}
            </span>
          </div>

          {/* Progress bar */}
          <div className="mt-3 w-full bg-white/20 h-1.5 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                timeStatus.isOverdue ? "bg-rose-500" : "bg-emerald-400"
              }`}
              style={{ width: `${timeStatus.progressPercentage}%` }}
            />
          </div>
        </div>

        {/* Pass Body */}
        <div className="p-6 space-y-5">
          {/* Overstay Alert if overdue */}
          {timeStatus.isOverdue && (
            <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-[12px]">
              <AlertTriangle size={18} className="text-rose-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-semibold">Tiempo de reserva excedido</strong>
                Por favor retira tu vehículo o extiende la reserva para evitar cargos adicionales.
              </div>
            </div>
          )}

          {/* Scannable QR and PIN Access */}
          <div className="flex flex-col items-center justify-center p-5 rounded-2xl bg-subtle/30 border border-subtle space-y-3">
            <span className="text-[11px] uppercase tracking-wider cc-text-tertiary">
              Presentar en Portería / Barrera
            </span>

            {/* QR Visual */}
            <div className="w-36 h-36 bg-white p-2.5 rounded-2xl shadow-sm border border-subtle flex items-center justify-center relative">
              <svg viewBox="0 0 100 100" className="w-full h-full text-zinc-900">
                <rect x="0" y="0" width="30" height="30" fill="currentColor" rx="4" />
                <rect x="5" y="5" width="20" height="20" fill="white" rx="2" />
                <rect x="10" y="10" width="10" height="10" fill="currentColor" rx="1" />

                <rect x="70" y="0" width="30" height="30" fill="currentColor" rx="4" />
                <rect x="75" y="5" width="20" height="20" fill="white" rx="2" />
                <rect x="80" y="10" width="10" height="10" fill="currentColor" rx="1" />

                <rect x="0" y="70" width="30" height="30" fill="currentColor" rx="4" />
                <rect x="5" y="75" width="20" height="20" fill="white" rx="2" />
                <rect x="10" y="80" width="10" height="10" fill="currentColor" rx="1" />

                <rect x="40" y="10" width="8" height="8" fill="currentColor" />
                <rect x="52" y="10" width="8" height="8" fill="currentColor" />
                <rect x="40" y="24" width="8" height="8" fill="currentColor" />
                <rect x="52" y="24" width="8" height="8" fill="currentColor" />

                <rect x="40" y="40" width="20" height="20" fill="var(--cc-copper, #9C5636)" rx="4" />
                <rect x="44" y="44" width="12" height="12" fill="white" rx="2" />
                <path d="M47 48 L50 54 L53 48" stroke="var(--cc-copper, #9C5636)" strokeWidth="2" strokeLinecap="round" fill="none" />

                <rect x="10" y="45" width="8" height="8" fill="currentColor" />
                <rect x="22" y="45" width="8" height="8" fill="currentColor" />
                <rect x="70" y="45" width="8" height="8" fill="currentColor" />
                <rect x="82" y="45" width="8" height="8" fill="currentColor" />

                <rect x="40" y="70" width="8" height="8" fill="currentColor" />
                <rect x="52" y="70" width="8" height="8" fill="currentColor" />
                <rect x="70" y="70" width="8" height="8" fill="currentColor" />
                <rect x="82" y="82" width="8" height="8" fill="currentColor" />
              </svg>
            </div>

            {/* Monospace Code with 1-click Copy */}
            <div className="flex items-center gap-2">
              <span className="font-mono text-[22px] font-bold tracking-widest text-zinc-900 bg-white px-3 py-1 rounded-xl border border-subtle">
                {booking.accessCode}
              </span>
              <Button size="sm" variant="ghost" onClick={handleCopyCode}>
                {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
              </Button>
            </div>
          </div>

          {/* Vehicle and Booking Details */}
          <div className="space-y-2 text-[12px] bg-subtle/20 p-4 rounded-2xl border border-subtle">
            <div className="flex justify-between">
              <span className="cc-text-secondary">Conductor Autorizado:</span>
              <span className="font-medium cc-text-primary">
                {booking.driverName || "Conductor Registrado"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="cc-text-secondary">Patente del Vehículo:</span>
              <span className="font-mono font-bold cc-text-primary">
                {booking.driverPlate || "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="cc-text-secondary">Horario Reservado:</span>
              <span className="font-medium cc-text-primary text-right">
                {formatParkingRange(booking.startsAt, booking.endsAt)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="cc-text-secondary">Dirección:</span>
              <span className="font-medium cc-text-primary text-right truncate max-w-[200px]">
                {buildingAddress}
              </span>
            </div>
          </div>

          {/* Step by step guide */}
          <div className="grid grid-cols-3 gap-2 text-center text-[10px] cc-text-secondary">
            <div className="p-2 rounded-xl bg-subtle/30 border border-subtle space-y-1">
              <span className="w-5 h-5 rounded-full bg-[var(--cc-copper-tint)] text-[var(--cc-copper)] font-bold flex items-center justify-center mx-auto text-[10px]">1</span>
              <span>Llega a portería</span>
            </div>
            <div className="p-2 rounded-xl bg-subtle/30 border border-subtle space-y-1">
              <span className="w-5 h-5 rounded-full bg-[var(--cc-copper-tint)] text-[var(--cc-copper)] font-bold flex items-center justify-center mx-auto text-[10px]">2</span>
              <span>Muestra tu pase</span>
            </div>
            <div className="p-2 rounded-xl bg-subtle/30 border border-subtle space-y-1">
              <span className="w-5 h-5 rounded-full bg-[var(--cc-copper-tint)] text-[var(--cc-copper)] font-bold flex items-center justify-center mx-auto text-[10px]">3</span>
              <span>Estaciónate libre</span>
            </div>
          </div>

          {/* Direct Navigation Links */}
          <div className="grid grid-cols-2 gap-3">
            <a
              href={wazeUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-[#33CCFF]/10 text-[#0088CC] hover:bg-[#33CCFF]/20 text-[12px] font-semibold transition-colors"
            >
              <Navigation size={14} /> Abrir en Waze
            </a>
            <a
              href={mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 text-[12px] font-semibold transition-colors"
            >
              <MapPin size={14} /> Google Maps
            </a>
          </div>

          {/* Action Row: Share via WhatsApp & Print */}
          <div className="flex items-center gap-2 pt-1 border-t border-subtle">
            <button
              onClick={handleShareWhatsApp}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-semibold transition-colors"
            >
              <Share2 size={13} /> Compartir por WhatsApp
            </button>
            <Button size="sm" variant="ghost" onClick={handlePrint} title="Imprimir Pase">
              <Printer size={14} />
            </Button>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-subtle/30 px-6 py-3 border-t border-subtle flex items-center justify-between text-[11px] cc-text-tertiary">
          <span className="flex items-center gap-1">
            <ShieldCheck size={12} className="text-emerald-600" />
            Acceso Autorizado ComunidadConnect
          </span>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  );
}
