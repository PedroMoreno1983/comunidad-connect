"use client";

import * as React from "react";
import { Button } from "@/components/cc/Button";
import { Tag } from "@/components/cc/Tag";
import { UnitRightsService } from "@/lib/services/unitRightsService";
import {
  formatPermille,
  parsePermilleText,
  parseRightsCsv,
  RIGHTS_TOLERANCE_PERMILLE,
  RIGHTS_TOTAL_PERMILLE,
  rightsLockMessage,
  validateUnitRights,
} from "@/lib/assemblies/unitRights";
import type { UnitRightsMethod, UnitRightsRevision, UnitRightsStatus, UnitRightsView } from "@/lib/assemblies/types";
import { Card, Field, SectionTitle, formatDateTime, inputClass, inputStyle } from "./shared";

type DraftMethod = "manual" | "csv" | "expense_prorate";

const STATUS_META: Record<UnitRightsStatus, { label: string; tone: "rose" | "amber" | "sage" }> = {
  missing: { label: "Incompletos · 1 unidad = 1 voto", tone: "rose" },
  provisional: { label: "Provisorios · no verificados", tone: "amber" },
  verified: { label: "Verificados con fuente", tone: "sage" },
};

const METHOD_LABEL: Record<UnitRightsMethod, string> = {
  manual: "Tabla",
  csv: "Pegado / CSV",
  expense_prorate: "Prorrateo de gastos comunes",
  verify: "Fuente registrada",
  direct: "Cambio fuera de esta sección",
  onboarding: "Onboarding (importación de unidades)",
};

const SOURCE_PLACEHOLDER = "Reglamento de copropiedad, art. X / escritura";

function draftsFrom(view: UnitRightsView): Record<string, string> {
  return Object.fromEntries(view.units.map(unit => [unit.id, unit.sharePermille === null ? "" : formatPermille(unit.sharePermille)]));
}

/**
 * "Derechos de cada unidad (‰)": la proporción con que vota cada unidad en
 * asamblea (Ley 21.442, arts. 3 y 15), según el reglamento de copropiedad.
 * Sin fuente, lo cargado queda provisorio y se marca como no verificado.
 */
export function UnitRightsEditor() {
  const [view, setView] = React.useState<UnitRightsView | null>(null);
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [method, setMethod] = React.useState<DraftMethod>("manual");
  const [sourceNote, setSourceNote] = React.useState("");
  const [verifyNote, setVerifyNote] = React.useState("");
  const [csvText, setCsvText] = React.useState("");
  const [csvReport, setCsvReport] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState("");
  const [showHistory, setShowHistory] = React.useState(false);

  const apply = React.useCallback((next: UnitRightsView) => {
    setView(next);
    setDrafts(draftsFrom(next));
    setMethod("manual");
  }, []);

  React.useEffect(() => {
    UnitRightsService.get().then(apply).catch(err => setError(err instanceof Error ? err.message : "No se pudieron cargar los derechos."));
  }, [apply]);

  const values = React.useMemo(() => {
    const parsed: Record<string, number | null> = {};
    for (const [unitId, raw] of Object.entries(drafts)) {
      const value = parsePermilleText(raw);
      parsed[unitId] = value === undefined ? Number.NaN : value;
    }
    return parsed;
  }, [drafts]);

  const validation = React.useMemo(() => (view ? validateUnitRights(view.units, values) : null), [view, values]);
  const dirty = React.useMemo(() => Boolean(view?.units.some(unit => {
    const value = values[unit.id];
    return (value ?? null) !== unit.sharePermille;
  })), [view, values]);

  if (!view) {
    return (
      <Card id="derechos">
        <SectionTitle eyebrow="Ley 21.442 · arts. 3 y 15" title="Derechos de cada unidad (‰)" />
        <p className="text-sm cc-text-secondary">{error || "Cargando…"}</p>
      </Card>
    );
  }

  const lock = rightsLockMessage(view.lockedBy);
  const status = STATUS_META[view.status];

  async function run(action: () => Promise<UnitRightsView>, success: string) {
    setBusy(true); setMessage(""); setError("");
    try {
      apply(await action());
      setMessage(success);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally { setBusy(false); }
  }

  function importCsv(text: string) {
    if (!view) return;
    const result = parseRightsCsv(text, view.units);
    const count = Object.keys(result.values).length;
    setDrafts(prev => ({ ...prev, ...Object.fromEntries(Object.entries(result.values).map(([id, value]) => [id, formatPermille(value)])) }));
    if (count) setMethod("csv");
    const notes = [`${count} de ${view.units.length} unidades leídas.`];
    if (result.unmatched.length) notes.push(`No calzan con ninguna unidad: ${result.unmatched.join(", ")}.`);
    if (result.duplicates.length) notes.push(`Repetidas (vale la última): ${result.duplicates.join(", ")}.`);
    if (result.invalid.length) notes.push(`Filas con valor no válido: ${result.invalid.join(", ")}.`);
    setCsvReport(notes.join(" "));
  }

  function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 200_000) { setCsvReport("El archivo es muy grande para una tabla de derechos."); return; }
    file.text().then(text => { setCsvText(text); importCsv(text); }).catch(() => setCsvReport("No se pudo leer el archivo."));
  }

  function useExpenseProrate() {
    if (!view?.expenseProrate) return;
    const source = view.expenseProrate;
    setDrafts(Object.fromEntries(view.units.map(unit => [unit.id, formatPermille(source.values[unit.id] ?? null)])));
    setMethod("expense_prorate");
    setSourceNote("");
    setMessage(`Precargado desde el prorrateo de gastos comunes de ${source.month}. Es PROVISORIO: confírmalo contra el reglamento de copropiedad antes de registrar la fuente.`);
  }

  const diffTone = validation && Math.abs(validation.difference) <= RIGHTS_TOLERANCE_PERMILLE ? "var(--cc-sage)" : "var(--cc-rose)";
  const willBeProvisional = sourceNote.trim().length === 0 || method === "expense_prorate";

  return (
    <Card id="derechos">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionTitle eyebrow="Ley 21.442 · arts. 3 y 15" title="Derechos de cada unidad (‰)" />
        <Tag tone={status.tone} solid>{status.label}</Tag>
      </div>
      <p className="text-sm cc-text-secondary">
        Cada unidad vota en proporción a sus derechos, que fija el reglamento de copropiedad. Suelen coincidir con el prorrateo de gastos comunes, pero no siempre: confirma contra el reglamento o la escritura. Estos mismos valores se usan para prorratear los gastos comunes por alícuota.
      </p>

      {view.status === "missing" && (
        <p role="status" className="mt-3 rounded-xl border px-3 py-2 text-sm cc-text-secondary" style={{ borderColor: "var(--cc-amber)" }}>
          Mientras falte alguna unidad, las asambleas cuentan 1 unidad = 1 voto para todas. La ley pide votos proporcionales a los derechos (art. 15).
        </p>
      )}
      {view.status === "provisional" && (
        <p role="status" className="mt-3 rounded-xl border px-3 py-2 text-sm cc-text-secondary" style={{ borderColor: "var(--cc-amber)" }}>
          No verificados: los derechos vigentes no tienen fuente registrada. Se usan para votar, pero conviene confirmarlos contra el reglamento y registrar la fuente.
        </p>
      )}
      {view.status === "verified" && view.latest?.sourceNote && (
        <p className="mt-3 text-sm cc-text-secondary">Fuente: {view.latest.sourceNote}</p>
      )}
      {lock && <p role="alert" className="mt-3 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--cc-rose)" }}>{lock}</p>}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[420px] text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.12em] cc-text-tertiary">
            <tr><th className="py-2 pr-3">Unidad</th><th className="py-2 pr-3">Vigente</th><th className="py-2">Nuevo (‰)</th></tr>
          </thead>
          <tbody>
            {view.units.map(unit => {
              const value = values[unit.id];
              const invalid = Number.isNaN(value) || (value !== null && value !== undefined && (value <= 0 || value > RIGHTS_TOTAL_PERMILLE));
              return (
                <tr key={unit.id} style={{ borderTop: "1px solid var(--cc-line)" }}>
                  <td className="py-2 pr-3 font-medium cc-text-primary">{unit.label}</td>
                  <td className="py-2 pr-3 cc-text-secondary">{unit.sharePermille === null ? "—" : `${formatPermille(unit.sharePermille)}‰`}</td>
                  <td className="py-2">
                    <input
                      type="text" inputMode="decimal" aria-label={`Derechos de la unidad ${unit.label}`} placeholder="—"
                      value={drafts[unit.id] ?? ""} disabled={Boolean(lock) || busy}
                      onChange={event => setDrafts(prev => ({ ...prev, [unit.id]: event.target.value }))}
                      className={`${inputClass} max-w-[140px]`} style={{ ...inputStyle, borderColor: invalid ? "var(--cc-rose)" : inputStyle.borderColor }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "1px solid var(--cc-line-strong)" }}>
              <td className="py-2 pr-3 font-medium cc-text-primary">Suma</td>
              <td className="py-2 pr-3 cc-text-secondary">{formatPermille(view.total) || "0"}‰</td>
              <td className="py-2 font-medium" style={{ color: diffTone }}>
                {validation ? `${formatPermille(validation.total) || "0"}‰ · diferencia ${validation.difference > 0 ? "+" : ""}${formatPermille(validation.difference) || "0"}‰` : ""}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-1 text-xs cc-text-tertiary">Deben sumar {RIGHTS_TOTAL_PERMILLE}‰ (tolerancia de redondeo ± 0,5‰). Hasta 4 decimales; acepta coma decimal.</p>

      {!lock && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Pegar o importar CSV" hint="Una fila por unidad: unidad;derechos (también tabulador o coma). Ej: 1204;125,5">
            <textarea className={inputClass} style={inputStyle} rows={4} value={csvText} onChange={event => setCsvText(event.target.value)} placeholder={"unidad;derechos\n805;120,25\n1104;130"} />
          </Field>
          <div className="space-y-2 self-end">
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" type="button" disabled={!csvText.trim() || busy} onClick={() => importCsv(csvText)}>Aplicar a la tabla</Button>
              <label className="cursor-pointer rounded-[10px] border px-3 py-2 text-xs cc-text-primary" style={{ borderColor: "var(--cc-line-strong)" }}>
                Elegir archivo CSV
                <input type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" onChange={onFile} />
              </label>
            </div>
            {csvReport && <p className="text-xs cc-text-secondary">{csvReport}</p>}
            {view.expenseProrate && (
              <div className="rounded-xl border p-3" style={{ borderColor: "var(--cc-amber)" }}>
                <Button variant="ghost" size="sm" type="button" disabled={busy} onClick={useExpenseProrate}>Usar prorrateo de gastos comunes como punto de partida</Button>
                <p className="mt-2 text-xs cc-text-secondary">Toma la proporción del cobro de {view.expenseProrate.month}. Queda provisorio: hay que confirmarlo contra el reglamento de copropiedad.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {!lock && (
        <div className="mt-4 space-y-3">
          <Field label="Fuente (opcional)" hint="Sin fuente, los derechos quedan provisorios y se marcan como no verificados.">
            <input className={inputClass} style={inputStyle} value={sourceNote} maxLength={500} onChange={event => setSourceNote(event.target.value)} placeholder={SOURCE_PLACEHOLDER} />
          </Field>
          {validation && !validation.ok && dirty && (
            <ul role="alert" className="space-y-1 text-sm" style={{ color: "var(--cc-rose)" }}>{validation.errors.map(item => <li key={item}>{item}</li>)}</ul>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="copper" type="button" disabled={busy || !dirty || !validation?.ok}
              onClick={() => run(() => UnitRightsService.save(values, method, method === "expense_prorate" ? "" : sourceNote), willBeProvisional ? "Derechos guardados como provisorios (no verificados)." : "Derechos guardados con su fuente.")}>
              {busy ? "Guardando…" : willBeProvisional ? "Guardar como provisorios" : "Guardar con fuente"}
            </Button>
            {dirty && <Button variant="ghost" type="button" disabled={busy} onClick={() => { setDrafts(draftsFrom(view)); setMethod("manual"); }}>Descartar cambios</Button>}
          </div>
          {method === "expense_prorate" && <p className="text-xs cc-text-secondary">Lo precargado del prorrateo se guarda siempre como provisorio. Después de revisarlo contra el reglamento, registra la fuente abajo.</p>}
        </div>
      )}

      {!lock && view.status === "provisional" && !dirty && (
        <div className="mt-4 rounded-xl border p-3" style={{ borderColor: "var(--cc-line)" }}>
          <Field label="Registrar fuente de los derechos vigentes" hint="Confirma que los valores de la tabla coinciden con el reglamento o la escritura. No cambia los valores.">
            <input className={inputClass} style={inputStyle} value={verifyNote} maxLength={500} onChange={event => setVerifyNote(event.target.value)} placeholder={SOURCE_PLACEHOLDER} />
          </Field>
          <div className="mt-2">
            <Button variant="primary" size="sm" type="button" disabled={busy || !verifyNote.trim()}
              onClick={() => run(() => UnitRightsService.verify(verifyNote), "Fuente registrada: derechos verificados.").then(() => setVerifyNote(""))}>Registrar fuente</Button>
          </div>
        </div>
      )}

      {message && <p role="status" className="mt-3 text-sm cc-text-secondary">{message}</p>}
      {error && <p role="alert" className="mt-3 text-sm" style={{ color: "var(--cc-rose)" }}>{error}</p>}

      <div className="mt-5">
        <button type="button" className="text-sm underline cc-text-secondary" onClick={() => setShowHistory(open => !open)}>
          {showHistory ? "Ocultar registro de cambios" : `Ver registro de cambios (${view.revisions.length})`}
        </button>
        {showHistory && <RevisionList revisions={view.revisions} />}
      </div>
    </Card>
  );
}

function RevisionList({ revisions }: { revisions: UnitRightsRevision[] }) {
  if (!revisions.length) return <p className="mt-2 text-sm cc-text-tertiary">Aún no hay cambios registrados.</p>;
  return (
    <ul className="mt-2 space-y-2">
      {revisions.map(revision => (
        <li key={revision.id} className="rounded-xl border p-3 text-sm" style={{ borderColor: "var(--cc-line)" }}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium cc-text-primary">{formatDateTime(revision.savedAt)}</span>
            <span className="cc-text-secondary">· {revision.savedByName || "Sistema"} · {METHOD_LABEL[revision.method]}</span>
            <Tag tone={revision.verified ? "sage" : "amber"}>{revision.verified ? "Con fuente" : "Provisorio"}</Tag>
          </div>
          {revision.sourceNote && <p className="mt-1 text-xs cc-text-secondary">Fuente: {revision.sourceNote}</p>}
          <details className="mt-1">
            <summary className="cursor-pointer text-xs cc-text-tertiary">Valores anteriores y nuevos</summary>
            <table className="mt-1 text-xs cc-text-secondary">
              <tbody>
                {revision.newValues.map(value => {
                  const before = revision.previousValues.find(item => item.unitId === value.unitId)?.permille ?? null;
                  return (
                    <tr key={value.unitId}>
                      <td className="pr-3">{value.label}</td>
                      <td className="pr-3">{before === null ? "—" : `${formatPermille(before)}‰`}</td>
                      <td>→ {value.permille === null ? "—" : `${formatPermille(value.permille)}‰`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </details>
        </li>
      ))}
    </ul>
  );
}
