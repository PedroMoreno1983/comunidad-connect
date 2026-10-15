"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/cc/Button";
import { Tag } from "@/components/cc/Tag";
import { AssemblyService } from "@/lib/services/assemblyService";
import { MY_STATUS_COPY, STATEMENT_LINK } from "@/lib/assemblies/eligibilityCopy";
import type { AssemblySummary, AssemblyView, AttendanceMode, VoteChoice } from "@/lib/assemblies/types";
import {
  CAPACITY_LABEL,
  CHOICE_LABEL,
  CLASS_LABEL,
  Card,
  Field,
  ItemResult,
  MarkdownBlock,
  MODALITY_LABEL,
  QuorumMeter,
  SESSION_LABEL,
  SectionTitle,
  StatusTag,
  fmtRights,
  formatDateTime,
  inputClass,
  inputStyle,
} from "./shared";

/**
 * Vista de residentes: citaciones, confirmar asistencia, poderes, votar y actas.
 * Integrantes vigentes del comité ven además la asistencia y los resultados de
 * toda la sesión, en solo lectura. La secretaría designada acredita desde aquí.
 */
export function ResidentAssemblies() {
  const [list, setList] = React.useState<AssemblySummary[]>([]);
  const [isCommittee, setIsCommittee] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [view, setView] = React.useState<AssemblyView | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState("");

  const refreshList = React.useCallback(() => AssemblyService.list()
    .then(data => {
      setList(data.assemblies); setIsCommittee(data.isCommittee);
      setSelectedId(current => current ?? data.assemblies.find(a => a.status === "in_progress" || a.status === "cited")?.id ?? data.assemblies[0]?.id ?? null);
    })
    .catch(error => setMessage(error instanceof Error ? error.message : "No se pudo cargar."))
    .finally(() => setLoading(false)), []);

  React.useEffect(() => { refreshList(); }, [refreshList]);
  React.useEffect(() => {
    if (!selectedId) return;
    AssemblyService.get(selectedId).then(setView).catch(error => setMessage(error instanceof Error ? error.message : "No se pudo cargar."));
  }, [selectedId]);
  React.useEffect(() => {
    if (!view || view.assembly.status !== "in_progress") return;
    const timer = window.setInterval(() => { AssemblyService.get(view.assembly.id).then(setView).catch(() => undefined); }, 5000);
    return () => window.clearInterval(timer);
  }, [view]);

  return (
    <main className="mx-auto max-w-4xl space-y-5 p-5 lg:p-8">
      <Link href="/votaciones" className="text-sm underline">← Votaciones</Link>
      <div>
        <p className="cc-eyebrow">Comunidad{isCommittee ? " · Comité" : ""}</p>
        <h1 className="text-3xl cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>Asambleas</h1>
        <p className="mt-2 text-sm cc-text-secondary">Aquí llegan las citaciones de tu comunidad. Confirma tu asistencia, deja un poder si no puedes ir y vota cada punto durante la sesión. Las actas firmadas quedan disponibles para todos.</p>
      </div>
      {message && <p role="status" className="rounded-xl border p-3 text-sm" style={{ borderColor: "var(--cc-line)" }}>{message}</p>}
      {loading ? <p className="text-sm cc-text-tertiary">Cargando…</p> : list.length === 0 ? <p className="text-sm cc-text-secondary">Aún no hay asambleas citadas.</p> : (
        <div className="flex flex-wrap gap-2">
          {list.map(item => (
            <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className="rounded-xl border px-3 py-2 text-left text-sm"
              style={{ borderColor: item.id === selectedId ? "var(--cc-copper)" : "var(--cc-line)", background: "var(--cc-paper)" }}>
              <span className="block font-medium cc-text-primary">{item.title}</span>
              <span className="block text-xs cc-text-tertiary">{formatDateTime(item.scheduledAt)}</span>
            </button>
          ))}
        </div>
      )}
      {view && <AssemblyDetail view={view} onView={next => { setView(next); refreshList(); }} />}
    </main>
  );
}

function AssemblyDetail({ view, onView }: { view: AssemblyView; onView: (view: AssemblyView) => void }) {
  const a = view.assembly;
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const run = async (action: () => Promise<AssemblyView>, success?: string) => {
    setBusy(true); setMessage("");
    try { onView(await action()); if (success) setMessage(success); } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo completar la acción."); } finally { setBusy(false); }
  };
  const runRequest = async (unitId: string) => {
    setBusy(true); setMessage("");
    try { const result = await AssemblyService.requestAgreement(a.id, unitId); onView(result.view); setMessage(result.message); }
    catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo completar la acción."); }
    finally { setBusy(false); }
  };
  const eligibleOf = (unitId: string) => view.myEligibility.find(entry => entry.unitId === unitId)?.eligible !== false;
  const defaultMode: AttendanceMode = a.modality === "in_person" ? "in_person" : "remote";
  const [mode, setMode] = React.useState<AttendanceMode>(defaultMode);
  const live = a.status === "in_progress";
  const mineAttendance = (unitId: string) => view.attendance.find(row => row.unitId === unitId);
  const broad = view.viewer.role !== "resident";

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="cc-eyebrow">{SESSION_LABEL[a.sessionType]} · {MODALITY_LABEL[a.modality]}</p>
            <h2 className="text-2xl cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>{a.title}</h2>
            <p className="mt-1 text-sm cc-text-secondary">{formatDateTime(a.scheduledAt)}</p>
            {a.videoUrl && (live || a.status === "cited") && <a className="mt-2 inline-block text-sm underline" style={{ color: "var(--cc-copper)" }} href={a.videoUrl} target="_blank" rel="noreferrer">Entrar a la videollamada</a>}
          </div>
          <StatusTag status={a.status} />
        </div>
        {message && <p role="status" className="mt-3 text-sm cc-text-secondary">{message}</p>}
      </Card>

      {(a.status === "cited" || live) && (
        <Card>
          <SectionTitle eyebrow="Tu participación" title={live ? "Únete a la sesión" : "Confirma tu asistencia"} />
          {view.representable.length === 0 ? (
            <p className="text-sm cc-text-secondary">No encontramos una unidad asociada a tu cuenta. Si eres copropietario, pide a administración que registre tu unidad.</p>
          ) : (
            <>
              {a.modality === "hybrid" && <Field label="¿Cómo participarás?"><select className={inputClass} style={inputStyle} value={mode} onChange={e => setMode(e.target.value as AttendanceMode)}><option value="remote">En línea</option><option value="in_person">En persona</option></select></Field>}
              {mode === "remote" && <p className="mt-2 text-xs cc-text-tertiary">Al acreditarte y al votar te identificarán con imagen y voz: ten cámara y micrófono encendidos. Puedes conectarte desde donde estés (DS 7, art. 16).</p>}
              <ul className="mt-3 space-y-2">
                {view.representable.map(unit => {
                  const row = mineAttendance(unit.unitId);
                  return (
                    <li key={unit.unitId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm" style={{ borderColor: "var(--cc-line)" }}>
                      <span className="cc-text-primary">{unit.label} · {CAPACITY_LABEL[unit.capacity]}</span>
                      {row?.status === "present" && row.identityVerifiedAt ? <Tag tone="sage">Acreditada</Tag>
                        : row ? <span className="flex items-center gap-2"><Tag tone="amber">{live ? "Esperando verificación" : "Confirmada"}</Tag>{!live && <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => AssemblyService.rsvp(a.id, unit.unitId, row.mode, false))}>Ya no podré</Button>}</span>
                        : <Button size="sm" variant="dark" disabled={busy} onClick={() => run(() => AssemblyService.rsvp(a.id, unit.unitId, mode), live ? "Avisamos a la mesa: te verificarán en un momento." : "Asistencia confirmada.")}>{live ? "Estoy aquí" : "Asistiré"}</Button>}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Card>
      )}

      {(a.status === "cited" || live) && view.myEligibility.length > 0 && <MyEligibilityCard view={view} busy={busy} onRequest={unitId => runRequest(unitId)} />}

      {live && <Card><SectionTitle eyebrow="En vivo" title="Quórum" /><QuorumMeter quorum={view.quorum} rightsMethod={view.rights.method} /></Card>}

      <Card>
        <SectionTitle eyebrow="Tabla" title="Puntos a tratar" />
        <ol className="space-y-3">
          {a.items.map(item => {
            const votableUnits = view.representable.filter(unit => {
              const row = mineAttendance(unit.unitId);
              return row && row.status === "present" && row.identityVerifiedAt && row.attendeeProfileId !== null;
            });
            return (
              <li key={item.id} className="rounded-xl border p-3" style={{ borderColor: item.votingStatus === "open" ? "var(--cc-copper)" : "var(--cc-line)" }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium cc-text-primary">{item.position}. {item.title}</p>
                  <Tag tone={item.quorumClass === "reinforced" ? "rose" : item.quorumClass === "absolute" ? "amber" : "sage"}>{CLASS_LABEL[item.quorumClass]}</Tag>
                </div>
                {item.description && <p className="mt-1 text-sm cc-text-secondary">{item.description}</p>}
                {live && item.votingStatus === "open" && (
                  <div className="mt-3 space-y-2">
                    {votableUnits.length === 0 && <p className="text-xs cc-text-tertiary">Podrás votar cuando la mesa verifique tu asistencia.</p>}
                    {votableUnits.filter(unit => !eligibleOf(unit.unitId)).map(unit => (
                      <p key={unit.unitId} className="text-xs cc-text-tertiary">{unit.label}: participas con tu voz; para votar, la unidad debe estar al día o con un convenio vigente. Revisa arriba cómo hacerlo, con total reserva.</p>
                    ))}
                    {votableUnits.filter(unit => eligibleOf(unit.unitId)).map(unit => {
                      const vote = view.votes.find(v => v.agendaItemId === item.id && v.unitId === unit.unitId);
                      return (
                        <div key={unit.unitId} className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="cc-text-secondary">{unit.label}:</span>
                          {(["yes", "no", "abstain"] as VoteChoice[]).map(choice => (
                            <Button key={choice} size="sm" variant={vote?.choice === choice ? "copper" : "ghost"} disabled={busy} onClick={() => run(() => AssemblyService.castVote(a.id, item.id, unit.unitId, choice))}>{CHOICE_LABEL[choice]}</Button>
                          ))}
                          {vote && vote.mode === "remote" && <span className="text-xs cc-text-tertiary">{vote.identityVerifiedAt ? "Voto verificado" : "La mesa verificará tu voto con imagen y voz"}</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
                {item.votingStatus === "closed" && <ItemResult item={item} rightsMethod={view.rights.method} />}
              </li>
            );
          })}
        </ol>
      </Card>

      {(a.status === "cited" || live) && <ProxyForm view={view} busy={busy} run={run} />}

      {broad && (a.status === "in_progress" || a.status === "closed" || a.status === "minutes_signed") && (
        <Card>
          <SectionTitle eyebrow={view.viewer.role === "secretary" ? "Secretaría" : "Comité · solo lectura"} title="Asistencia" />
          <table className="w-full text-left text-sm">
            <thead className="cc-text-tertiary"><tr><th className="py-2">Unidad</th><th>Calidad</th><th>Modalidad</th><th>Derechos</th><th>Estado</th></tr></thead>
            <tbody>{view.attendance.map(row => (
              <tr key={row.id} className="border-t" style={{ borderColor: "var(--cc-line)" }}>
                <td className="py-2 cc-text-primary">{row.unitLabel}</td><td className="cc-text-secondary">{CAPACITY_LABEL[row.capacity]}</td>
                <td className="cc-text-secondary">{row.mode === "remote" ? "En línea" : "Presencial"}</td><td className="cc-text-secondary">{fmtRights(row.weight, view.rights.method)}</td>
                <td>{row.status === "left" ? <Tag>Se retiró</Tag> : row.identityVerifiedAt ? <Tag tone="sage">Acreditada</Tag> : view.viewer.canVerify && live
                  ? <Button size="sm" variant="dark" disabled={busy} onClick={() => run(() => AssemblyService.verifyAttendance(a.id, row.id))}>{row.mode === "remote" ? "Imagen y voz OK" : "Acreditar"}</Button>
                  : <Tag tone="amber">Por verificar</Tag>}</td>
              </tr>
            ))}</tbody>
          </table>
          {view.viewer.canVerify && live && <PendingVotes view={view} busy={busy} run={run} />}
        </Card>
      )}

      {a.citationText && <Card><details open={a.status === "cited"}><summary className="cursor-pointer text-sm font-medium" style={{ color: "var(--cc-copper)" }}>Citación</summary><div className="mt-3"><MarkdownBlock content={a.citationText} /></div></details></Card>}

      {view.minutes && (
        <Card>
          <SectionTitle eyebrow={view.minutes.status === "signed" ? "Acta firmada" : "Borrador de acta · comité"} title="Acta" />
          {view.minutes.status !== "signed" && view.minutesDeadline && <p className="mb-2 text-sm cc-text-secondary">Firma a más tardar el {view.minutesDeadline.dueOn} (Ley 21.442, art. 15).</p>}
          <MarkdownBlock content={view.minutes.content} />
        </Card>
      )}
    </div>
  );
}

/** Lo que ve cada unidad de sí misma: si puede votar y, si no, sus dos salidas. Nadie más lo ve. */
function MyEligibilityCard({ view, busy, onRequest }: { view: AssemblyView; busy: boolean; onRequest: (unitId: string) => void }) {
  return (
    <Card>
      <SectionTitle eyebrow="Solo tú ves esto" title="Tu voto" />
      <ul className="space-y-3">
        {view.myEligibility.map(entry => {
          const copy = entry.eligible ? MY_STATUS_COPY.eligible : MY_STATUS_COPY.notEligible;
          return (
            <li key={entry.unitId} className="rounded-xl border p-3 text-sm" style={{ borderColor: entry.eligible ? "var(--cc-sage)" : "var(--cc-amber)" }}>
              <div className="flex flex-wrap items-center gap-2">
                <Tag tone={entry.eligible ? "sage" : "amber"} solid>{copy.title}</Tag>
                <span className="cc-text-secondary">{entry.label}</span>
              </div>
              <p className="mt-2 cc-text-secondary">{copy.body}</p>
              {!entry.eligible && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href={STATEMENT_LINK} className="inline-flex items-center rounded-full border px-3 py-1.5 text-sm" style={{ borderColor: "var(--cc-line)", color: "var(--cc-copper)" }}>Ver mi estado de cuenta</Link>
                  <Button size="sm" variant="dark" disabled={busy} onClick={() => onRequest(entry.unitId)}>Pedir un convenio</Button>
                </div>
              )}
              {!entry.certified && <p className="mt-2 text-xs cc-text-tertiary">{MY_STATUS_COPY.estimate}</p>}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function PendingVotes({ view, busy, run }: { view: AssemblyView; busy: boolean; run: (action: () => Promise<AssemblyView>) => Promise<void> }) {
  const open = view.assembly.items.find(item => item.votingStatus === "open");
  if (!open) return null;
  const pending = view.votes.filter(vote => vote.agendaItemId === open.id && vote.mode === "remote" && !vote.identityVerifiedAt);
  if (!pending.length) return null;
  const label = (unitId: string) => view.rights.units.find(unit => unit.unitId === unitId)?.label || "Unidad";
  return (
    <div className="mt-4">
      <p className="text-xs cc-text-tertiary">Votos en línea por verificar con imagen y voz (punto {open.position}):</p>
      {pending.map(vote => <Button key={vote.id} size="sm" variant="ghost" className="mr-2 mt-1" disabled={busy} onClick={() => run(() => AssemblyService.verifyVote(view.assembly.id, vote.id))}>{label(vote.unitId)} · {CHOICE_LABEL[vote.choice]} ✓</Button>)}
    </div>
  );
}

function ProxyForm({ view, busy, run }: { view: AssemblyView; busy: boolean; run: (action: () => Promise<AssemblyView>, success?: string) => Promise<void> }) {
  const owned = view.representable.filter(unit => unit.capacity === "owner");
  const [unitId, setUnitId] = React.useState(owned[0]?.unitId ?? "");
  const [proxyName, setProxyName] = React.useState("");
  const [coversReinforced, setCoversReinforced] = React.useState(false);
  const [note, setNote] = React.useState("");
  const mine = view.proxies.filter(proxy => owned.some(unit => unit.unitId === proxy.unitId));
  if (!owned.length) return null;
  return (
    <Card>
      <SectionTitle eyebrow="Si no puedes asistir" title="Deja un poder" />
      <p className="text-sm cc-text-secondary">Indica quién te representará. Administración lo revisa según el reglamento de copropiedad (DS 7, art. 11). El administrador no puede representar a nadie (Ley 21.442, art. 15).</p>
      {mine.length > 0 && <ul className="mt-3 space-y-1 text-sm">{mine.map(proxy => (
        <li key={proxy.id} className="flex flex-wrap items-center gap-2 cc-text-secondary">{proxy.unitLabel} → {proxy.proxyName || "residente"} <Tag tone={proxy.status === "accepted" ? "sage" : proxy.status === "pending" ? "amber" : "neutral"}>{proxy.status === "accepted" ? "Aceptado" : proxy.status === "pending" ? "En revisión" : proxy.status === "rejected" ? "No aceptado" : "Revocado"}</Tag>
          {(proxy.status === "pending" || proxy.status === "accepted") && <button type="button" className="text-xs underline" disabled={busy} onClick={() => run(() => AssemblyService.reviewProxy(view.assembly.id, proxy.id, "revoke"))}>Revocar</button>}</li>
      ))}</ul>}
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {owned.length > 1 && <Field label="Unidad"><select className={inputClass} style={inputStyle} value={unitId} onChange={e => setUnitId(e.target.value)}>{owned.map(unit => <option key={unit.unitId} value={unit.unitId}>{unit.label}</option>)}</select></Field>}
        <Field label="Nombre de quien te representa"><input className={inputClass} style={inputStyle} value={proxyName} onChange={e => setProxyName(e.target.value)} /></Field>
        <Field label="Detalle del poder" hint="Por ejemplo: poder simple firmado, entregado en conserjería."><input className={inputClass} style={inputStyle} value={note} onChange={e => setNote(e.target.value)} /></Field>
        {view.assembly.items.some(item => item.quorumClass === "reinforced") && <label className="flex items-center gap-2 text-sm cc-text-secondary"><input type="checkbox" checked={coversReinforced} onChange={e => setCoversReinforced(e.target.checked)} /> Incluye materias de mayoría reforzada</label>}
      </div>
      <Button className="mt-3" size="sm" variant="dark" disabled={busy || !unitId || proxyName.trim().length < 3} onClick={() => run(() => AssemblyService.registerProxy(view.assembly.id, { unitId, kind: "proxy", proxyName, coversReinforced, documentNote: note }), "Poder enviado a administración.")}>Enviar poder</Button>
    </Card>
  );
}
