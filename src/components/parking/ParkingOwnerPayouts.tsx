"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Wallet, Landmark, PiggyBank, Receipt } from "lucide-react";
import { Button } from "@/components/cc/Button";
import { Tag } from "@/components/cc/Tag";
import { useToast } from "@/components/ui/Toast";
import { SkeletonList } from "@/components/ui/Skeleton";
import { formatCurrency } from "@/lib/utils";
import { parkingErrorMessage } from "@/lib/parking";
import { ParkingPayoutService } from "@/lib/services/parkingPayoutService";
import {
  CHILEAN_BANKS,
  PARKING_BANK_ACCOUNT_TYPE_LABELS,
  PARKING_PAYOUT_DESTINATIONS,
  PARKING_PAYOUT_DESTINATION_HELP,
  PARKING_PAYOUT_DESTINATION_LABELS,
  PARKING_PAYOUT_DESTINATION_SHORT,
  PARKING_PAYOUT_STATUS_LABELS,
  PARKING_PAYOUT_STATUS_TONES,
  describeParkingPayout,
  effectivePayoutDestination,
  normalizeRut,
  summarizeParkingPayouts,
  validatePayoutSettingsInput,
} from "@/lib/parkingPayouts/payouts";
import type {
  ParkingBankAccountType,
  ParkingOwnerPayoutSettings,
  ParkingOwnerPayoutSettingsInput,
  ParkingOwnerUnitOption,
  ParkingPayout,
  ParkingPayoutDestination,
} from "@/lib/parkingPayouts/types";

const EMPTY_SETTINGS: ParkingOwnerPayoutSettingsInput = {
  destination: null,
  creditUnitId: null,
  bankName: null,
  bankAccountType: null,
  bankAccountNumber: null,
  holderRut: null,
  holderName: null,
};

const DESTINATION_ICONS: Record<ParkingPayoutDestination, React.ReactNode> = {
  bank_transfer: <Landmark size={16} />,
  common_expenses_credit: <Receipt size={16} />,
  reserve_fund_donation: <PiggyBank size={16} />,
};

/**
 * Lo que el dueño recibe por arrendar su estacionamiento: a dónde va (decide
 * él), lo recaudado, la comisión de la comunidad y el estado de cada
 * liquidación. Solo se liquida cuando el arriendo ya está pagado.
 */
export function ParkingOwnerPayouts() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<ParkingOwnerPayoutSettings | null>(null);
  const [form, setForm] = useState<ParkingOwnerPayoutSettingsInput>(EMPTY_SETTINGS);
  const [payouts, setPayouts] = useState<ParkingPayout[]>([]);
  const [units, setUnits] = useState<ParkingOwnerUnitOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mine, list, myUnits] = await Promise.all([
        ParkingPayoutService.getMySettings(),
        ParkingPayoutService.getMyPayouts(),
        ParkingPayoutService.getMyUnits(),
      ]);
      setSettings(mine);
      setForm(mine ? { ...mine } : EMPTY_SETTINGS);
      setPayouts(list);
      setUnits(myUnits);
      setUnavailable(false);
    } catch {
      // Sin la migración aplicada la sección no se muestra a medias.
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(() => summarizeParkingPayouts(payouts), [payouts]);
  const effective = effectivePayoutDestination(settings);

  const update = (patch: Partial<ParkingOwnerPayoutSettingsInput>) => setForm((prev) => ({ ...prev, ...patch }));

  const save = async () => {
    const input: ParkingOwnerPayoutSettingsInput = {
      ...form,
      holderRut: normalizeRut(form.holderRut),
      bankName: form.bankName?.trim() || null,
      bankAccountNumber: form.bankAccountNumber?.trim() || null,
      holderName: form.holderName?.trim() || null,
    };
    const errors = validatePayoutSettingsInput(input);
    if (errors.length > 0) {
      toast({ title: "Revisa tus datos", description: errors.join(" "), variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const saved = await ParkingPayoutService.saveMySettings(input);
      setSettings(saved);
      if (saved) setForm({ ...saved });
      toast({
        title: "Preferencia guardada",
        description: "Se aplica a los próximos arriendos que se paguen.",
        variant: "success",
      });
    } catch (error: unknown) {
      toast({ title: "No se pudo guardar", description: parkingErrorMessage(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (unavailable) return null;

  const field = "w-full rounded-xl border border-subtle bg-surface px-3 py-2.5 text-[13px] cc-text-primary";
  const showBank = form.destination === "bank_transfer" || form.destination === null;

  return (
    <section id="liquidaciones" className="space-y-4">
      <div className="flex items-center gap-2">
        <Wallet size={18} style={{ color: "var(--cc-copper)" }} />
        <div>
          <h2 className="text-[16px] font-semibold cc-text-primary">Lo que recibes por tus arriendos</h2>
          <p className="text-[12px] cc-text-secondary">
            Cuando un arriendo queda pagado, lo recaudado (menos la comisión de la comunidad, si la hay) va al destino que elijas.
          </p>
        </div>
      </div>

      {loading ? (
        <SkeletonList rows={2} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-subtle bg-surface p-3">
              <p className="text-[11px] uppercase tracking-wider cc-text-tertiary">Recaudado</p>
              <p className="text-[16px] font-semibold cc-text-primary">{formatCurrency(totals.gross)}</p>
            </div>
            <div className="rounded-xl border border-subtle bg-surface p-3">
              <p className="text-[11px] uppercase tracking-wider cc-text-tertiary">Comisión de la comunidad</p>
              <p className="text-[16px] font-semibold cc-text-primary">{formatCurrency(totals.commission)}</p>
            </div>
            <div className="rounded-xl border border-subtle bg-surface p-3">
              <p className="text-[11px] uppercase tracking-wider cc-text-tertiary">Ya recibido</p>
              <p className="text-[16px] font-semibold text-emerald-600">{formatCurrency(totals.delivered)}</p>
            </div>
            <div className="rounded-xl border border-subtle bg-surface p-3">
              <p className="text-[11px] uppercase tracking-wider cc-text-tertiary">Por recibir</p>
              <p className="text-[16px] font-semibold cc-text-primary">{formatCurrency(totals.pending)}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-subtle bg-surface p-5 space-y-4">
            <div>
              <h3 className="text-[14px] font-semibold cc-text-primary">¿A dónde va lo recaudado?</h3>
              <p className="text-[12px] cc-text-secondary">
                {settings?.destination
                  ? `Elegiste: ${PARKING_PAYOUT_DESTINATION_SHORT[settings.destination]}.`
                  : `Mientras no elijas, va a: ${PARKING_PAYOUT_DESTINATION_SHORT[effective.destination]} (transferencia si registras tus datos bancarios; si no, abono a tus gastos comunes).`}
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              {PARKING_PAYOUT_DESTINATIONS.map((destination) => {
                const selected = form.destination === destination;
                return (
                  <button
                    key={destination}
                    type="button"
                    onClick={() => update({ destination })}
                    className={`text-left rounded-xl border p-3 transition ${selected ? "border-[var(--cc-copper)] bg-[var(--cc-copper-tint)]" : "border-subtle"}`}
                  >
                    <span className="flex items-center gap-2 text-[13px] font-semibold cc-text-primary">
                      {DESTINATION_ICONS[destination]}
                      {PARKING_PAYOUT_DESTINATION_LABELS[destination]}
                    </span>
                    <span className="mt-1 block text-[11px] cc-text-secondary">{PARKING_PAYOUT_DESTINATION_HELP[destination]}</span>
                  </button>
                );
              })}
            </div>
            {form.destination !== null && (
              <button
                type="button"
                className="text-[11px] cc-text-tertiary hover:underline"
                onClick={() => update({ destination: null })}
              >
                Volver al destino automático
              </button>
            )}

            {form.destination === "common_expenses_credit" && units.length > 1 && (
              <div>
                <label className="text-[11px] uppercase tracking-wider cc-text-tertiary block mb-1">Unidad a la que se abona</label>
                <select
                  className={field}
                  value={form.creditUnitId ?? ""}
                  onChange={(e) => update({ creditUnitId: e.target.value || null })}
                >
                  <option value="">Elige una unidad</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>Unidad {unit.label}</option>
                  ))}
                </select>
              </div>
            )}

            {showBank && (
              <div className="grid gap-3 sm:grid-cols-2">
                <p className="sm:col-span-2 text-[12px] cc-text-secondary">
                  Datos bancarios {form.destination === "bank_transfer" ? "(obligatorios para transferencias)" : "(opcionales)"}. Solo los ven tú y la administración.
                </p>
                <div>
                  <label className="text-[11px] uppercase tracking-wider cc-text-tertiary block mb-1">Banco</label>
                  <input
                    className={field}
                    list="parking-payout-banks"
                    value={form.bankName ?? ""}
                    onChange={(e) => update({ bankName: e.target.value })}
                    placeholder="Banco"
                  />
                  <datalist id="parking-payout-banks">
                    {CHILEAN_BANKS.map((bank) => <option key={bank} value={bank} />)}
                  </datalist>
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-wider cc-text-tertiary block mb-1">Tipo de cuenta</label>
                  <select
                    className={field}
                    value={form.bankAccountType ?? ""}
                    onChange={(e) => update({ bankAccountType: (e.target.value || null) as ParkingBankAccountType | null })}
                  >
                    <option value="">Elige</option>
                    {(Object.keys(PARKING_BANK_ACCOUNT_TYPE_LABELS) as ParkingBankAccountType[]).map((type) => (
                      <option key={type} value={type}>{PARKING_BANK_ACCOUNT_TYPE_LABELS[type]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-wider cc-text-tertiary block mb-1">Número de cuenta</label>
                  <input
                    className={field}
                    inputMode="numeric"
                    value={form.bankAccountNumber ?? ""}
                    onChange={(e) => update({ bankAccountNumber: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-wider cc-text-tertiary block mb-1">RUT del titular</label>
                  <input
                    className={field}
                    value={form.holderRut ?? ""}
                    onChange={(e) => update({ holderRut: e.target.value })}
                    placeholder="12.345.678-5"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[11px] uppercase tracking-wider cc-text-tertiary block mb-1">Titular</label>
                  <input
                    className={field}
                    value={form.holderName ?? ""}
                    onChange={(e) => update({ holderName: e.target.value })}
                    placeholder="Nombre como aparece en el banco"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button variant="copper" size="sm" onClick={save} disabled={saving}>
                {saving ? "Guardando…" : "Guardar preferencia"}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-[14px] font-semibold cc-text-primary">Liquidaciones</h3>
            {payouts.length === 0 ? (
              <p className="text-[12px] cc-text-secondary">
                Aún no hay arriendos pagados. Cada arriendo pagado aparece aquí con lo que te corresponde.
              </p>
            ) : (
              payouts.map((payout) => (
                <div key={payout.id} className="rounded-xl border border-subtle p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-medium cc-text-primary">
                          Estacionamiento {payout.spotLabel || "—"}
                        </span>
                        <Tag tone={PARKING_PAYOUT_STATUS_TONES[payout.status]} solid>
                          {PARKING_PAYOUT_STATUS_LABELS[payout.status]}
                        </Tag>
                      </div>
                      <p className="mt-1 text-[12px] cc-text-secondary">
                        Recaudado {formatCurrency(payout.grossAmount)} · Comisión {formatCurrency(payout.commissionAmount)} ·{" "}
                        {PARKING_PAYOUT_DESTINATION_SHORT[payout.destination]}
                      </p>
                      <p className="text-[12px] cc-text-tertiary">{describeParkingPayout(payout)}</p>
                    </div>
                    <p className="text-[15px] font-semibold cc-text-primary">{formatCurrency(payout.netAmount)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </section>
  );
}
