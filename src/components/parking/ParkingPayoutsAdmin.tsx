"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Wallet, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/cc/Button";
import { Tag } from "@/components/cc/Tag";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency } from "@/lib/utils";
import { parkingErrorMessage } from "@/lib/parking";
import { ParkingPayoutService } from "@/lib/services/parkingPayoutService";
import {
  PARKING_BANK_ACCOUNT_TYPE_LABELS,
  PARKING_PAYOUT_DESTINATION_SHORT,
  PARKING_PAYOUT_STATUS_LABELS,
  PARKING_PAYOUT_STATUS_TONES,
  formatDateEsCl,
  summarizeParkingPayouts,
  todayInChile,
} from "@/lib/parkingPayouts/payouts";
import type { ParkingPayout } from "@/lib/parkingPayouts/types";

type Filter = "todo" | "transferir" | "revisar";

/**
 * Liquidaciones a los dueños de estacionamientos, para la administración.
 *
 * El abono a gastos comunes y la donación al fondo de reserva se hacen solos
 * cuando el arriendo queda pagado. Aquí queda lo que requiere una persona:
 * transferir y marcar como pagada, reintentar un abono que no se pudo hacer o
 * reanudar una en pausa, y revisar las marcadas. Una liquidación no se anula a
 * mano mientras el arriendo siga vigente: se anula sola si el cobro se anula o
 * se reembolsa.
 */
export function ParkingPayoutsAdmin({ communityId }: { communityId: string }) {
  const { toast } = useToast();
  const [payouts, setPayouts] = useState<ParkingPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("todo");
  const [payingId, setPayingId] = useState<string | null>(null);
  const [paidOn, setPaidOn] = useState(todayInChile());
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPayouts(await ParkingPayoutService.getCommunityPayouts(communityId));
      setLoadError(null);
    } catch (error: unknown) {
      setPayouts([]);
      setLoadError(parkingErrorMessage(error, "No se pudieron leer las liquidaciones."));
    } finally {
      setLoading(false);
    }
  }, [communityId]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(() => summarizeParkingPayouts(payouts), [payouts]);
  const toTransfer = payouts.filter((p) => p.destination === "bank_transfer" && p.status === "pending");
  const visible = filter === "transferir" ? toTransfer : filter === "revisar" ? payouts.filter((p) => p.needsReview) : payouts;

  const run = async (payout: ParkingPayout, action: () => Promise<unknown>, success: string) => {
    setBusyId(payout.id);
    try {
      await action();
      toast({ title: success, variant: "success" });
      setPayingId(null);
      await load();
    } catch (error: unknown) {
      toast({ title: "No se pudo completar", description: parkingErrorMessage(error), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const startPaying = (payout: ParkingPayout) => {
    setPayingId(payout.id);
    setPaidOn(todayInChile());
    setReference("");
    setNote("");
  };

  const askNote = (question: string) => {
    const value = window.prompt(question);
    return value && value.trim().length >= 3 ? value.trim() : null;
  };

  const sync = async () => {
    try {
      const created = await ParkingPayoutService.adminSync();
      toast({
        title: created > 0 ? `Se crearon ${created} liquidaciones` : "Todo al día",
        description: created > 0 ? undefined : "Cada arriendo pagado ya tiene su liquidación.",
        variant: "success",
      });
      await load();
    } catch (error: unknown) {
      toast({ title: "No se pudo sincronizar", description: parkingErrorMessage(error), variant: "destructive" });
    }
  };

  const field = "w-full rounded-xl border border-subtle bg-surface px-3 py-2 text-[13px] cc-text-primary";

  return (
    <div className="rounded-2xl border border-subtle bg-surface p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Wallet size={18} style={{ color: "var(--cc-copper)" }} />
          <h3 className="text-[16px] font-semibold cc-text-primary">Liquidaciones a dueños</h3>
          {totals.reviewCount > 0 && <Tag tone="amber" solid>{totals.reviewCount} por revisar</Tag>}
        </div>
        <div className="flex items-center gap-2">
          <select className="rounded-xl border border-subtle bg-surface px-2 py-1.5 text-[12px]" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
            <option value="todo">Todas</option>
            <option value="transferir">Por transferir ({toTransfer.length})</option>
            <option value="revisar">Por revisar ({totals.reviewCount})</option>
          </select>
          <Button size="sm" variant="ghost" onClick={sync}>
            <RefreshCw size={13} /> Sincronizar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-subtle p-3">
          <p className="text-[11px] uppercase tracking-wider cc-text-tertiary">Por transferir</p>
          <p className="text-[16px] font-semibold cc-text-primary">
            {formatCurrency(toTransfer.reduce((sum, p) => sum + p.netAmount, 0))}
          </p>
        </div>
        <div className="rounded-xl border border-subtle p-3">
          <p className="text-[11px] uppercase tracking-wider cc-text-tertiary">Abonado a gastos comunes</p>
          <p className="text-[16px] font-semibold cc-text-primary">{formatCurrency(totals.credited)}</p>
        </div>
        <div className="rounded-xl border border-subtle p-3">
          <p className="text-[11px] uppercase tracking-wider cc-text-tertiary">Donado al fondo de reserva</p>
          <p className="text-[16px] font-semibold cc-text-primary">{formatCurrency(totals.donated)}</p>
        </div>
        <div className="rounded-xl border border-subtle p-3">
          <p className="text-[11px] uppercase tracking-wider cc-text-tertiary">Comisión de la comunidad</p>
          <p className="text-[16px] font-semibold cc-text-primary">{formatCurrency(totals.commission)}</p>
        </div>
      </div>

      {loading ? (
        <SkeletonList rows={3} />
      ) : loadError ? (
        <EmptyState
          icon={<AlertTriangle size={22} />}
          title="No se pudieron leer las liquidaciones"
          description={loadError}
          tone="neutral"
          dashed={false}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Wallet size={22} />}
          title={filter === "todo" ? "Sin liquidaciones todavía" : "Nada pendiente aquí"}
          description="Cada arriendo pagado genera una liquidación para el dueño del estacionamiento."
          tone="neutral"
          dashed={false}
        />
      ) : (
        <div className="space-y-2">
          {visible.map((payout) => {
            const bank = payout.bankSnapshot;
            const busy = busyId === payout.id;
            return (
              <div key={payout.id} className="rounded-xl border border-subtle p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-medium cc-text-primary">
                        {payout.ownerName || "Dueño"} · Estacionamiento {payout.spotLabel || "—"}
                      </span>
                      <Tag tone={PARKING_PAYOUT_STATUS_TONES[payout.status]} solid>
                        {PARKING_PAYOUT_STATUS_LABELS[payout.status]}
                      </Tag>
                      {payout.needsReview && <Tag tone="amber">Revisar</Tag>}
                    </div>
                    <p className="mt-1 text-[12px] cc-text-secondary">
                      Neto {formatCurrency(payout.netAmount)} (bruto {formatCurrency(payout.grossAmount)}, comisión{" "}
                      {formatCurrency(payout.commissionAmount)}) · {PARKING_PAYOUT_DESTINATION_SHORT[payout.destination]}
                      {payout.destinationSource !== "owner_choice" ? " (automático)" : ""}
                    </p>
                    {payout.destination === "bank_transfer" && bank && (
                      <p className="text-[12px] cc-text-tertiary">
                        {bank.bankName} · {bank.accountType ? PARKING_BANK_ACCOUNT_TYPE_LABELS[bank.accountType] : ""} N.º{" "}
                        {bank.accountNumber} · {bank.holderName} ({bank.holderRut})
                      </p>
                    )}
                    {payout.status === "paid" && payout.paidOn && (
                      <p className="text-[12px] cc-text-tertiary">
                        Transferida el {formatDateEsCl(payout.paidOn)}
                        {payout.paymentReference ? ` · Ref. ${payout.paymentReference}` : ""}
                        {payout.paymentNote ? ` · ${payout.paymentNote}` : ""}
                      </p>
                    )}
                    {payout.reviewReason && (
                      <p className="mt-1 text-[12px]" style={{ color: "var(--cc-copper)" }}>{payout.reviewReason}</p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    {payout.destination === "bank_transfer" && payout.status === "pending" && (
                      <Button size="sm" variant="copper" disabled={busy} onClick={() => startPaying(payout)}>
                        Marcar transferida
                      </Button>
                    )}
                    {((payout.destination !== "bank_transfer" && payout.status === "pending") || payout.status === "on_hold") && (
                      <Button
                        size="sm"
                        variant="copper"
                        disabled={busy}
                        onClick={() => run(payout, () => ParkingPayoutService.adminRetry(payout.id), "Liquidación procesada")}
                      >
                        Liquidar ahora
                      </Button>
                    )}
                    {payout.needsReview && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => {
                          const resolution = askNote("¿Qué se resolvió?");
                          if (resolution) run(payout, () => ParkingPayoutService.adminResolveReview(payout.id, resolution), "Revisión registrada");
                        }}
                      >
                        Marcar revisada
                      </Button>
                    )}
                  </div>
                </div>

                {payingId === payout.id && (
                  <div className="grid gap-2 rounded-xl border border-subtle bg-subtle/20 p-3 sm:grid-cols-4">
                    <div>
                      <label className="text-[11px] uppercase tracking-wider cc-text-tertiary block mb-1">Fecha</label>
                      <input type="date" className={field} value={paidOn} max={todayInChile()} onChange={(e) => setPaidOn(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-[11px] uppercase tracking-wider cc-text-tertiary block mb-1">N.º de comprobante</label>
                      <input className={field} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Opcional" />
                    </div>
                    <div>
                      <label className="text-[11px] uppercase tracking-wider cc-text-tertiary block mb-1">Nota</label>
                      <input className={field} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opcional" />
                    </div>
                    <div className="flex items-end gap-2">
                      <Button
                        size="sm"
                        variant="copper"
                        disabled={busy || !paidOn}
                        onClick={() => run(payout, () => ParkingPayoutService.adminMarkPaid(payout.id, paidOn, reference, note), "Transferencia registrada")}
                      >
                        Confirmar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setPayingId(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
