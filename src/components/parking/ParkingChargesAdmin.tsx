"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Receipt, AlertTriangle } from "lucide-react";
import { ParkingService } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/cc/Button";
import { Tag } from "@/components/cc/Tag";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { formatCurrency } from "@/lib/utils";
import {
  PARKING_CHARGE_METHOD_LABELS,
  PARKING_CHARGE_STATUS_LABELS,
  PARKING_CHARGE_STATUS_TONES,
  formatParkingRange,
  parkingErrorMessage,
} from "@/lib/parking";
import type { ParkingCharge } from "@/lib/types";

/**
 * Cobros de estacionamiento de la comunidad, para la administración.
 *
 * Muestra el libro (un cobro por reserva) y las dos acciones que requieren una
 * persona: cargar a gastos comunes un cobro que quedó pendiente o fallido, y
 * registrar un reembolso hecho fuera de la plataforma.
 */
export function ParkingChargesAdmin({ communityId }: { communityId: string }) {
  const { toast } = useToast();
  const [charges, setCharges] = useState<ParkingCharge[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [onlyReview, setOnlyReview] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCharges(await ParkingService.getCommunityCharges(communityId));
      setLoadError(null);
    } catch (error: unknown) {
      setCharges([]);
      setLoadError(parkingErrorMessage(error, "No se pudieron leer los cobros."));
    } finally {
      setLoading(false);
    }
  }, [communityId]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(() => {
    const sum = (status: ParkingCharge["status"]) =>
      charges.filter((c) => c.status === status).reduce((acc, c) => acc + c.amount, 0);
    return {
      charged: sum("charged"),
      paid: sum("paid"),
      pending: sum("pending") + sum("failed"),
      review: charges.filter((c) => c.needsReview).length,
    };
  }, [charges]);

  const visible = onlyReview ? charges.filter((c) => c.needsReview) : charges;

  const postToUnit = async (charge: ParkingCharge) => {
    if (!window.confirm(`¿Cargar ${formatCurrency(charge.amount)} a la cuenta de gastos comunes de la unidad?`)) return;
    setBusyId(charge.id);
    try {
      const status = await ParkingService.adminPostChargeToUnit(charge.id);
      toast({
        title: status === "charged" ? "Cargado a gastos comunes" : "No se pudo cargar",
        description: status === "charged"
          ? "El cargo ya aparece en la cartola de la unidad."
          : "Revisa el motivo en el detalle del cobro.",
        variant: status === "charged" ? "success" : "destructive",
      });
      await load();
    } catch (error: unknown) {
      toast({ title: "No se pudo cargar", description: parkingErrorMessage(error), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const markRefunded = async (charge: ParkingCharge) => {
    const note = window.prompt("¿Cómo se devolvió el dinero? (p. ej. transferencia y número)");
    if (!note || note.trim().length < 3) return;
    setBusyId(charge.id);
    try {
      await ParkingService.adminMarkChargeRefunded(charge.id, note);
      toast({ title: "Reembolso registrado", variant: "success" });
      await load();
    } catch (error: unknown) {
      toast({ title: "No se pudo registrar", description: parkingErrorMessage(error), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="rounded-2xl border border-subtle bg-surface p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Receipt size={18} style={{ color: "var(--cc-copper)" }} />
          <h3 className="text-[16px] font-semibold cc-text-primary">Cobros de estacionamientos</h3>
          {totals.review > 0 && <Tag tone="amber" solid>{totals.review} por revisar</Tag>}
        </div>
        <label className="flex items-center gap-2 text-[12px] cc-text-secondary cursor-pointer">
          <input type="checkbox" checked={onlyReview} onChange={(e) => setOnlyReview(e.target.checked)} />
          Solo los que requieren revisión
        </label>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-subtle p-3">
          <p className="text-[11px] uppercase tracking-wider cc-text-tertiary">Cargado en gastos comunes</p>
          <p className="text-[16px] font-semibold cc-text-primary">{formatCurrency(totals.charged)}</p>
        </div>
        <div className="rounded-xl border border-subtle p-3">
          <p className="text-[11px] uppercase tracking-wider cc-text-tertiary">Pagado</p>
          <p className="text-[16px] font-semibold cc-text-primary">{formatCurrency(totals.paid)}</p>
        </div>
        <div className="rounded-xl border border-subtle p-3">
          <p className="text-[11px] uppercase tracking-wider cc-text-tertiary">Pendiente o fallido</p>
          <p className="text-[16px] font-semibold cc-text-primary">{formatCurrency(totals.pending)}</p>
        </div>
      </div>

      {loading ? (
        <SkeletonList rows={3} />
      ) : loadError ? (
        <EmptyState
          icon={<AlertTriangle size={22} />}
          title="No se pudieron leer los cobros"
          description={`${loadError} Si la migración del libro de cobros aún no está aplicada, esta sección queda vacía.`}
          tone="neutral"
          dashed={false}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Receipt size={22} />}
          title={onlyReview ? "Nada por revisar" : "Sin cobros todavía"}
          description="Cada reserva confirmada genera un cobro, que aparece aquí con su estado."
          tone="neutral"
          dashed={false}
        />
      ) : (
        <div className="space-y-2">
          {visible.map((charge) => (
            <div key={charge.id} className="rounded-xl border border-subtle p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-medium cc-text-primary">
                      Estacionamiento {charge.spotLabel || "—"}
                    </span>
                    <Tag tone={PARKING_CHARGE_STATUS_TONES[charge.status]} solid>
                      {PARKING_CHARGE_STATUS_LABELS[charge.status]}
                    </Tag>
                    {charge.needsReview && <Tag tone="amber">Revisar</Tag>}
                  </div>
                  <p className="mt-1 text-[12px] cc-text-secondary">
                    {formatCurrency(charge.amount)} · {PARKING_CHARGE_METHOD_LABELS[charge.method]}
                    {charge.unitLabel ? ` · Unidad ${charge.unitLabel}` : " · Sin unidad"}
                    {charge.driverName ? ` · ${charge.driverName}` : ""}
                    {charge.driverPlate ? ` (${charge.driverPlate})` : ""}
                  </p>
                  {charge.startsAt && charge.endsAt && (
                    <p className="text-[12px] cc-text-tertiary">{formatParkingRange(charge.startsAt, charge.endsAt)}</p>
                  )}
                  {charge.failureReason && (
                    <p className="mt-1 text-[12px]" style={{ color: "var(--cc-copper)" }}>{charge.failureReason}</p>
                  )}
                </div>

                <div className="flex shrink-0 gap-2">
                  {(charge.status === "pending" || charge.status === "failed") && (
                    <Button size="sm" variant="copper" disabled={busyId === charge.id} onClick={() => postToUnit(charge)}>
                      Cargar a gastos comunes
                    </Button>
                  )}
                  {charge.status === "paid" && charge.needsReview && (
                    <Button size="sm" variant="ghost" disabled={busyId === charge.id} onClick={() => markRefunded(charge)}>
                      Marcar reembolsado
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
