"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/cc/Button";
import { Tag } from "@/components/cc/Tag";
import { AssemblyService, type AssemblyDraftPayload } from "@/lib/services/assemblyService";
import { CONDUCTOR_BADGE } from "@/lib/assemblies/eligibilityCopy";
import type {
  AssemblyAgendaItem,
  AssemblyMatter,
  AssemblySummary,
  AssemblyView,
  AttendanceCapacity,
  AttendanceMode,
  VoteChoice,
} from "@/lib/assemblies/types";
import {
  AlertList,
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
  fmt,
  formatDateTime,
  inputClass,
  inputStyle,
} from "./shared";

type Resident = { id: string; name: string };
type DraftItem = { matterCode: string; title: string; description: string };

const EMPTY_DRAFT: AssemblyDraftPayload = {
  title: "", sessionType: "ordinary", modality: "hybrid", scheduledAt: "", location: "Sala multiuso del condominio", videoUrl: "",
  requestReceivedOn: null, requestRightsShare: null, secretaryProfileId: null, notaryName: "",
  items: [{ matterCode: "ord_rendicion_cuentas", title: "Rendición de cuentas y aprobación del balance", description: "" }],
};

const RANK = { ordinary: 1, absolute: 2, reinforced: 3 } as const;

function toLocalInput(iso: string) {
  if (!iso) return "";
  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** datetime-local en hora de Chile -> ISO. Resuelve el desfase de Santiago para ese instante. */
function chileLocalToIso(local: string) {
  if (!local) return "";
  const guess = new Date(`${local}:00Z`);
  const shown = new Date(toLocalInput(guess.toISOString()) + ":00Z");
  return new Date(guess.getTime() + (guess.getTime() - shown.getTime())).toISOString();
}

function useAction(onView: (view: AssemblyView) => void) {
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const run = React.useCallback(async (action: () => Promise<AssemblyView | { view: AssemblyView }>, success?: string) => {
    setBusy(true); setMessage("");
    try {
      const result = await action();
      onView("view" in result && "assembly" in result.view ? result.view : result as AssemblyView);
      if (success) setMessage(success);
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo completar la acción.");
      return false;
    } finally { setBusy(false); }
  }, [onView]);
  return { busy, message, setMessage, run };
}

export function AdminAssemblies() {
  const [list, setList] = React.useState<AssemblySummary[]>([]);
  const [matters, setMatters] = React.useState<AssemblyMatter[]>([]);
  const [residents, setResidents] = React.useState<Resident[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [view, setView] = React.useState<AssemblyView | null>(null);
  const [editing, setEditing] = React.useState<AssemblyDraftPayload | null>(null);
  const [loadError, setLoadError] = React.useState("");

  const refreshList = React.useCallback(() => AssemblyService.list().then(data => setList(data.assemblies)).catch(error => setLoadError(error instanceof Error ? error.message : "No se pudo cargar.")), []);

  React.useEffect(() => {
    refreshList();
    AssemblyService.catalog().then(data => { setMatters(data.matters); setResidents(data.residents); }).catch(() => undefined);
    const fromUrl = new URLSearchParams(window.location.search).get("id");
    if (fromUrl) setSelectedId(fromUrl);
  }, [refreshList]);

  React.useEffect(() => {
    if (!selectedId) { setView(null); return; }
    AssemblyService.get(selectedId).then(setView).catch(error => setLoadError(error instanceof Error ? error.message : "No se pudo cargar."));
  }, [selectedId]);

  // Panel en vivo: refresco periódico de asistencia, quórum y votos.
  React.useEffect(() => {
    if (!view || view.assembly.status !== "in_progress") return;
    const timer = window.setInterval(() => { AssemblyService.get(view.assembly.id).then(setView).catch(() => undefined); }, 5000);
    return () => window.clearInterval(timer);
  }, [view]);

  const onView = React.useCallback((next: AssemblyView) => { setView(next); setSelectedId(next.assembly.id); refreshList(); }, [refreshList]);

  return (
    <main className="mx-auto max-w-6xl space-y-5 p-5 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="cc-eyebrow">Ley 21.442 · DS 7 de 2025</p>
          <h1 className="text-3xl cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>Asambleas</h1>
          <p className="mt-2 max-w-2xl text-sm cc-text-secondary">Cita, conduce y cierra asambleas presenciales, telemáticas o mixtas. La app calcula quórums y resultados por derechos; tú acreditas a cada asistente y revisas el acta.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/staff/training" className="text-sm underline cc-text-secondary">Curso: Asambleas y comité</Link>
          <Button variant="copper" onClick={() => { setEditing({ ...EMPTY_DRAFT }); setSelectedId(null); }}>Nueva asamblea</Button>
        </div>
      </div>
      {loadError && <p role="alert" className="rounded-xl border p-3 text-sm" style={{ borderColor: "var(--cc-rose)" }}>{loadError}</p>}

      <div className="grid gap-5 lg:grid-cols-[280px,1fr]">
        <aside className="space-y-2">
          {list.length === 0 && <p className="text-sm cc-text-tertiary">Aún no hay asambleas.</p>}
          {list.map(item => (
            <button key={item.id} type="button" onClick={() => { setEditing(null); setSelectedId(item.id); }}
              className="w-full rounded-2xl border p-3 text-left" style={{ borderColor: item.id === selectedId ? "var(--cc-copper)" : "var(--cc-line)", background: "var(--cc-paper)" }}>
              <p className="text-sm font-medium cc-text-primary">{item.title}</p>
              <p className="mt-1 text-xs cc-text-tertiary">{formatDateTime(item.scheduledAt)} · {MODALITY_LABEL[item.modality]}</p>
              <div className="mt-2"><StatusTag status={item.status} /></div>
            </button>
          ))}
        </aside>
        <div className="space-y-5">
          {editing && <DraftEditor draft={editing} matters={matters} residents={residents} assemblyId={view?.assembly.status === "draft" ? view.assembly.id : null}
            onCancel={() => setEditing(null)} onSaved={next => { setEditing(null); onView(next); }} />}
          {!editing && view && <AssemblyConsole view={view} residents={residents} onView={onView} onEdit={() => setEditing(draftFromView(view))} />}
          {!editing && !view && <Card><p className="text-sm cc-text-secondary">Elige una asamblea o crea una nueva.</p></Card>}
        </div>
      </div>
    </main>
  );
}

function draftFromView(view: AssemblyView): AssemblyDraftPayload {
  const a = view.assembly;
  return {
    title: a.title, sessionType: a.sessionType, modality: a.modality, scheduledAt: a.scheduledAt, location: a.location, videoUrl: a.videoUrl,
    requestReceivedOn: a.requestReceivedOn, requestRightsShare: a.requestRightsShare, secretaryProfileId: a.secretaryProfileId, notaryName: a.notaryName,
    items: a.items.map(item => ({ matterCode: item.matterCode, title: item.title, description: item.description })),
  };
}

function DraftEditor({ draft, matters, residents, assemblyId, onCancel, onSaved }: {
  draft: AssemblyDraftPayload; matters: AssemblyMatter[]; residents: Resident[]; assemblyId: string | null;
  onCancel: () => void; onSaved: (view: AssemblyView) => void;
}) {
  const [form, setForm] = React.useState<AssemblyDraftPayload>(draft);
  const [localDate, setLocalDate] = React.useState(toLocalInput(draft.scheduledAt));
  const { busy, message, run } = useAction(onSaved);
  const set = <K extends keyof AssemblyDraftPayload>(key: K, value: AssemblyDraftPayload[K]) => setForm(prev => ({ ...prev, [key]: value }));
  const setItem = (index: number, patch: Partial<DraftItem>) => setForm(prev => ({ ...prev, items: prev.items.map((item, i) => (i === index ? { ...item, ...patch } : item)) }));
  const byCode = new Map(matters.map(matter => [matter.code, matter]));
  const highest = form.items.reduce((rank, item) => Math.max(rank, RANK[byCode.get(item.matterCode)?.quorumClass ?? "ordinary"]), 1);
  const suggested = highest === 3 ? "reinforced" : highest === 2 ? "extraordinary" : "ordinary";
  const groups: { label: string; items: AssemblyMatter[] }[] = (["ordinary", "absolute", "reinforced"] as const).map(cls => ({ label: CLASS_LABEL[cls], items: matters.filter(matter => matter.quorumClass === cls) }));

  const submit = () => run(() => {
    const payload = { ...form, scheduledAt: chileLocalToIso(localDate) };
    return assemblyId ? AssemblyService.update(assemblyId, payload) : AssemblyService.create(payload);
  });

  return (
    <Card>
      <SectionTitle eyebrow={assemblyId ? "Editar borrador" : "Nueva asamblea"} title="Datos de la sesión" />
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Título"><input className={inputClass} style={inputStyle} value={form.title} onChange={e => set("title", e.target.value)} placeholder="Asamblea ordinaria anual 2026" /></Field>
        <Field label="Fecha y hora (hora de Chile)" hint="La citación debe publicarse entre 5 y 15 días antes (Ley 21.442, art. 16).">
          <input type="datetime-local" className={inputClass} style={inputStyle} value={localDate} onChange={e => setLocalDate(e.target.value)} />
        </Field>
        <Field label="Tipo de sesión" hint={suggested !== form.sessionType ? `Las materias elegidas piden al menos: ${SESSION_LABEL[suggested]}.` : undefined}>
          <select className={inputClass} style={inputStyle} value={form.sessionType} onChange={e => set("sessionType", e.target.value)}>
            {Object.entries(SESSION_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
        <Field label="Modalidad">
          <select className={inputClass} style={inputStyle} value={form.modality} onChange={e => set("modality", e.target.value)}>
            {Object.entries(MODALITY_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
        {form.modality !== "remote" && <Field label="Lugar" hint="Presencial o mixta: en el condominio, salvo acuerdo de otro lugar en la misma comuna (art. 16)."><input className={inputClass} style={inputStyle} value={form.location} onChange={e => set("location", e.target.value)} /></Field>}
        {form.modality !== "in_person" && <Field label="Enlace de la videollamada" hint="Debe permitir ver y oír a cada persona al acreditarse y al votar (DS 7, art. 16)."><input className={inputClass} style={inputStyle} value={form.videoUrl} onChange={e => set("videoUrl", e.target.value)} placeholder="https://" /></Field>}
        <Field label="Secretaría de la asamblea (opcional)" hint="Puede acreditar asistentes y verificar imagen y voz. No puede ser el administrador.">
          <select className={inputClass} style={inputStyle} value={form.secretaryProfileId ?? ""} onChange={e => set("secretaryProfileId", e.target.value || null)}>
            <option value="">Solo administración</option>
            {residents.map(resident => <option key={resident.id} value={resident.id}>{resident.name}</option>)}
          </select>
        </Field>
        <Field label="Notario (si corresponde)"><input className={inputClass} style={inputStyle} value={form.notaryName} onChange={e => set("notaryName", e.target.value)} placeholder="Nombre del notario" /></Field>
        <Field label="¿La pidieron copropietarios? Fecha de recepción" hint="Con al menos el 10% de los derechos, hay que citar dentro de 10 días corridos (DS 7, art. 15).">
          <input type="date" className={inputClass} style={inputStyle} value={form.requestReceivedOn ?? ""} onChange={e => set("requestReceivedOn", e.target.value || null)} />
        </Field>
        {form.requestReceivedOn && <Field label="Derechos que reúne la petición (%)">
          <input type="number" min={0} max={100} step="0.01" className={inputClass} style={inputStyle} value={form.requestRightsShare === null ? "" : Math.round(form.requestRightsShare * 10000) / 100}
            onChange={e => set("requestRightsShare", e.target.value === "" ? null : Number(e.target.value) / 100)} />
        </Field>}
      </div>

      <div className="mt-6">
        <SectionTitle eyebrow="Tabla" title="Materias a tratar" />
        <div className="space-y-3">
          {form.items.map((item, index) => {
            const matter = byCode.get(item.matterCode);
            return (
              <div key={index} className="rounded-xl border p-3" style={{ borderColor: "var(--cc-line)" }}>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label={`Punto ${index + 1}: materia del cuadro del art. 15`}>
                    <select className={inputClass} style={inputStyle} value={item.matterCode} onChange={e => setItem(index, { matterCode: e.target.value })}>
                      {groups.map(group => <optgroup key={group.label} label={group.label}>{group.items.map(m => <option key={m.code} value={m.code}>{m.reference} {m.label}</option>)}</optgroup>)}
                    </select>
                  </Field>
                  <Field label="Título del punto"><input className={inputClass} style={inputStyle} value={item.title} onChange={e => setItem(index, { title: e.target.value })} /></Field>
                </div>
                <Field label="Descripción (opcional)"><textarea className={`${inputClass} mt-1`} style={inputStyle} rows={2} value={item.description} onChange={e => setItem(index, { description: e.target.value })} /></Field>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs cc-text-tertiary">
                  {matter && <Tag tone={matter.quorumClass === "reinforced" ? "rose" : matter.quorumClass === "absolute" ? "amber" : "sage"}>{CLASS_LABEL[matter.quorumClass]}</Tag>}
                  {matter?.requiresNotary && <Tag tone="plum">Requiere notario</Tag>}
                  {form.items.length > 1 && <button type="button" className="underline" onClick={() => setForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }))}>Quitar</button>}
                </div>
              </div>
            );
          })}
        </div>
        <Button variant="ghost" size="sm" className="mt-3" onClick={() => setForm(prev => ({ ...prev, items: [...prev.items, { matterCode: "ord_otro", title: "", description: "" }] }))}>Agregar punto</Button>
      </div>

      {message && <p role="alert" className="mt-4 text-sm" style={{ color: "var(--cc-rose)" }}>{message}</p>}
      <div className="mt-5 flex gap-2">
        <Button variant="copper" disabled={busy} onClick={submit}>{assemblyId ? "Guardar borrador" : "Crear borrador"}</Button>
        <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
      </div>
    </Card>
  );
}

function AssemblyConsole({ view, residents, onView, onEdit }: { view: AssemblyView; residents: Resident[]; onView: (view: AssemblyView) => void; onEdit: () => void }) {
  const a = view.assembly;
  const { busy, message, run } = useAction(onView);
  const [citation, setCitation] = React.useState(a.citationText);
  React.useEffect(() => { setCitation(a.citationText); }, [a.citationText]);

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="cc-eyebrow">{SESSION_LABEL[a.sessionType]} · {MODALITY_LABEL[a.modality]}</p>
            <h2 className="text-2xl cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>{a.title}</h2>
            <p className="mt-1 text-sm cc-text-secondary">{formatDateTime(a.scheduledAt)}{a.videoUrl ? " · " : ""}{a.videoUrl && <a className="underline" href={a.videoUrl} target="_blank" rel="noreferrer">enlace de videollamada</a>}</p>
          </div>
          <StatusTag status={a.status} />
        </div>
        <div className="mt-4"><AlertList alerts={view.alerts} /></div>
        {message && <p role="status" className="mt-3 text-sm cc-text-secondary">{message}</p>}
      </Card>

      {a.status === "draft" && (
        <Card>
          <SectionTitle eyebrow="Citación" title="Redacta y publica" />
          <p className="text-sm cc-text-secondary">CoCo redacta la apertura; la tabla, los quórums y la modalidad los arma la app desde los datos. Revisa el texto antes de publicar. Se avisa solo dentro de la app.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={onEdit}>Editar datos y tabla</Button>
            <Button variant="dark" size="sm" disabled={busy} onClick={() => run(() => AssemblyService.draftCitation(a.id), "Citación redactada.")}>Redactar citación con IA</Button>
          </div>
          <textarea className={`${inputClass} mt-3 font-mono`} style={inputStyle} rows={14} value={citation} onChange={e => setCitation(e.target.value)} placeholder="Aún no hay texto. Usa «Redactar citación con IA»." />
          {citation && <details className="mt-3"><summary className="cursor-pointer text-sm" style={{ color: "var(--cc-copper)" }}>Vista previa</summary><div className="mt-2"><MarkdownBlock content={citation} /></div></details>}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="copper" disabled={busy} onClick={() => run(() => AssemblyService.publish(a.id, citation), "Citación publicada en la app.")}>Publicar citación</Button>
            <Button variant="ghost" disabled={busy} onClick={() => run(() => AssemblyService.cancel(a.id))}>Descartar</Button>
          </div>
        </Card>
      )}

      {a.status !== "draft" && a.citationText && a.status !== "in_progress" && (
        <Card><details><summary className="cursor-pointer text-sm font-medium" style={{ color: "var(--cc-copper)" }}>Citación publicada</summary><div className="mt-3"><MarkdownBlock content={a.citationText} /></div></details></Card>
      )}

      {(a.status === "cited" || a.status === "in_progress") && <ProxiesCard view={view} residents={residents} onView={onView} />}

      {a.status === "cited" && (
        <Card>
          <SectionTitle eyebrow="Día de la sesión" title="Confirmaciones" />
          <p className="text-sm cc-text-secondary">{view.attendance.length} unidad(es) confirmaron asistencia.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="copper" disabled={busy} onClick={() => run(() => AssemblyService.start(a.id), "Sesión iniciada. Se fijaron los derechos de cada unidad.")}>Iniciar sesión</Button>
            <Button variant="ghost" disabled={busy} onClick={() => run(() => AssemblyService.cancel(a.id))}>Suspender</Button>
          </div>
        </Card>
      )}

      {a.status === "in_progress" && <LivePanel view={view} residents={residents} onView={onView} />}
      {(a.status === "closed" || a.status === "minutes_signed") && <MinutesCard view={view} onView={onView} />}
      {(a.status === "closed" || a.status === "minutes_signed") && (
        <Card><SectionTitle eyebrow="Resultados" title="Acuerdos por punto" />{a.items.map(item => <div key={item.id} className="mt-3"><p className="text-sm font-medium cc-text-primary">{item.position}. {item.title}</p><ItemResult item={item} /></div>)}</Card>
      )}
    </div>
  );
}

function ProxiesCard({ view, residents, onView }: { view: AssemblyView; residents: Resident[]; onView: (view: AssemblyView) => void }) {
  const a = view.assembly;
  const { busy, message, run } = useAction(onView);
  const [unitId, setUnitId] = React.useState("");
  const [kind, setKind] = React.useState<"proxy" | "occupant_authorization" | "occupant_opt_out">("proxy");
  const [proxyProfileId, setProxyProfileId] = React.useState("");
  const [proxyName, setProxyName] = React.useState("");
  const [coversReinforced, setCoversReinforced] = React.useState(false);
  const [note, setNote] = React.useState("");
  const kindLabel = { proxy: "Poder", occupant_authorization: "Autorización expresa al ocupante", occupant_opt_out: "Sin representación del ocupante" } as const;
  return (
    <Card>
      <SectionTitle eyebrow="Representación" title="Poderes" />
      <p className="text-sm cc-text-secondary">Revisa cada poder según los requisitos del reglamento de copropiedad (DS 7, art. 11). El administrador no puede representar a nadie (art. 15). El ocupante registrado representa por ley si el titular no asiste, salvo que el titular lo niegue; en materias reforzadas necesita autorización expresa (DS 7, art. 12).</p>
      {view.proxies.length > 0 && (
        <ul className="mt-3 divide-y text-sm" style={{ borderColor: "var(--cc-line)" }}>
          {view.proxies.map(proxy => (
            <li key={proxy.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="cc-text-secondary">{proxy.unitLabel} · {kindLabel[proxy.kind]}{proxy.kind !== "occupant_opt_out" ? ` → ${proxy.proxyName || residents.find(r => r.id === proxy.proxyProfileId)?.name || "residente"}` : ""}{proxy.coversReinforced && proxy.kind === "proxy" ? " · incluye reforzadas" : ""}{proxy.documentNote ? ` · ${proxy.documentNote}` : ""}</span>
              <span className="flex items-center gap-2">
                <Tag tone={proxy.status === "accepted" ? "sage" : proxy.status === "pending" ? "amber" : "neutral"}>{proxy.status === "accepted" ? "Aceptado" : proxy.status === "pending" ? "Por revisar" : proxy.status === "rejected" ? "Rechazado" : "Revocado"}</Tag>
                {proxy.status === "pending" && <><Button size="sm" variant="dark" disabled={busy} onClick={() => run(() => AssemblyService.reviewProxy(a.id, proxy.id, "accept"))}>Aceptar</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => AssemblyService.reviewProxy(a.id, proxy.id, "reject"))}>Rechazar</Button></>}
                {proxy.status === "accepted" && <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => AssemblyService.reviewProxy(a.id, proxy.id, "revoke"))}>Revocar</Button>}
              </span>
            </li>
          ))}
        </ul>
      )}
      <details className="mt-3">
        <summary className="cursor-pointer text-sm" style={{ color: "var(--cc-copper)" }}>Registrar un poder recibido</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Field label="Unidad"><select className={inputClass} style={inputStyle} value={unitId} onChange={e => setUnitId(e.target.value)}><option value="">Elige</option>{view.rights.units.map(unit => <option key={unit.unitId} value={unit.unitId}>{unit.label}</option>)}</select></Field>
          <Field label="Tipo"><select className={inputClass} style={inputStyle} value={kind} onChange={e => setKind(e.target.value as typeof kind)}>{Object.entries(kindLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
          {kind !== "occupant_opt_out" && <Field label="Representante (residente)"><select className={inputClass} style={inputStyle} value={proxyProfileId} onChange={e => setProxyProfileId(e.target.value)}><option value="">Otra persona (indicar nombre)</option>{residents.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>}
          {kind !== "occupant_opt_out" && !proxyProfileId && <Field label="Nombre del representante"><input className={inputClass} style={inputStyle} value={proxyName} onChange={e => setProxyName(e.target.value)} /></Field>}
          {kind === "proxy" && <label className="flex items-center gap-2 text-sm cc-text-secondary"><input type="checkbox" checked={coversReinforced} onChange={e => setCoversReinforced(e.target.checked)} /> El poder incluye materias de mayoría reforzada</label>}
          <Field label="Documento revisado (nota)"><input className={inputClass} style={inputStyle} value={note} onChange={e => setNote(e.target.value)} placeholder="Poder simple firmado, recibido el…" /></Field>
        </div>
        {message && <p className="mt-2 text-sm" style={{ color: "var(--cc-rose)" }}>{message}</p>}
        <Button className="mt-3" size="sm" variant="dark" disabled={busy || !unitId} onClick={() => run(() => AssemblyService.registerProxy(a.id, { unitId, kind, proxyProfileId: proxyProfileId || null, proxyName, coversReinforced, documentNote: note }))}>Guardar como aceptado</Button>
      </details>
    </Card>
  );
}

function liveTally(view: AssemblyView, item: AssemblyAgendaItem) {
  const attendance = new Map(view.attendance.map(row => [row.unitId, row]));
  const sums = { yes: 0, no: 0, abstain: 0, pending: 0 };
  for (const vote of view.votes.filter(v => v.agendaItemId === item.id)) {
    const row = attendance.get(vote.unitId);
    const counts = row && row.status === "present" && row.identityVerifiedAt && (vote.mode === "in_person" || vote.identityVerifiedAt);
    if (counts) sums[vote.choice] += vote.weight; else sums.pending += 1;
  }
  return sums;
}

function LivePanel({ view, residents, onView }: { view: AssemblyView; residents: Resident[]; onView: (view: AssemblyView) => void }) {
  const a = view.assembly;
  const { busy, message, run } = useAction(onView);
  const [unitId, setUnitId] = React.useState("");
  const [capacity, setCapacity] = React.useState<AttendanceCapacity>("owner");
  const [attendeeProfileId, setAttendeeProfileId] = React.useState("");
  const [attendeeName, setAttendeeName] = React.useState("");
  const [proxyId, setProxyId] = React.useState("");
  const [mode, setMode] = React.useState<AttendanceMode>(a.modality === "remote" ? "remote" : "in_person");
  const [verified, setVerified] = React.useState(true);
  const [voteUnit, setVoteUnit] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const openItem = a.items.find(item => item.votingStatus === "open");
  const acceptedProxies = view.proxies.filter(p => p.kind === "proxy" && p.status === "accepted" && p.unitId === unitId);
  const present = view.attendance.filter(row => row.status === "present" && row.identityVerifiedAt);
  const pendingVotes = openItem ? view.votes.filter(vote => vote.agendaItemId === openItem.id && vote.mode === "remote" && !vote.identityVerifiedAt) : [];
  const labelOf = (id: string) => view.rights.units.find(unit => unit.unitId === id)?.label || "Unidad";
  const certificate = view.quorum.eligibility;
  const votingStarted = a.items.some(item => item.votingStatus !== "pending");
  // Solo quien conduce lo ve, y solo para la unidad que está acreditando.
  const selectedNotEligible = Boolean(unitId && view.conductor?.ineligibleUnitIds.includes(unitId));

  const closeVote = async (item: AssemblyAgendaItem) => {
    const ok = await run(() => AssemblyService.closeVote(a.id, item.id, false, notes));
    if (!ok && pendingVotes.length && window.confirm("Hay votos en línea sin verificar imagen y voz. ¿Cerrar igual? No se contarán.")) {
      await run(() => AssemblyService.closeVote(a.id, item.id, true, notes));
    }
    setNotes("");
  };

  return (
    <>
      <Card>
        <SectionTitle eyebrow="En vivo" title="Quórum" />
        <QuorumMeter quorum={view.quorum} rightsMethod={view.rights.method} />
        {message && <p role="alert" className="mt-3 text-sm" style={{ color: "var(--cc-rose)" }}>{message}</p>}
      </Card>

      <Card>
        <SectionTitle eyebrow="Ley 21.442, art. 15 · DS 7, art. 14" title="Certificado de habilidad" />
        <p className="text-sm cc-text-secondary">Solo votan los copropietarios hábiles: al día con la comunidad o con un convenio vigente con su primera cuota pagada. Todos asisten con voz. Emítelo con fecha de corte de hoy antes de abrir la primera votación; puedes volver a emitirlo hasta entonces si alguien se puso al día. El detalle por unidad queda guardado solo para administración.</p>
        {certificate ? (
          <p className="mt-2 text-sm cc-text-primary">Emitido el {formatDateTime(certificate.issuedAt)} por {certificate.issuedByName || "administración"} · corte {certificate.cutoffDate} · {certificate.eligibleUnits} de {certificate.totalUnits} unidades · {fmt(certificate.eligibleWeight)} de {fmt(certificate.totalWeight)} {view.rights.method === "share" ? "‰ de derechos" : "votos"} ({certificate.eligibleShare.toLocaleString("es-CL")}%)</p>
        ) : <p className="mt-2 text-sm" style={{ color: "var(--cc-amber)" }}>Aún no se emite: la votación no se puede abrir sin él.</p>}
        {!votingStarted && <Button className="mt-3" size="sm" variant="dark" disabled={busy} onClick={() => run(() => AssemblyService.certifyEligibility(a.id), "Certificado de habilidad emitido.")}>{certificate ? "Volver a emitir con datos de hoy" : "Emitir certificado de habilidad"}</Button>}
      </Card>

      <Card>
        <SectionTitle eyebrow="Acreditación" title="Asistencia por unidad" />
        <p className="text-sm cc-text-secondary">En línea, marca «verificada» solo después de ver y oír a la persona a la vez (DS 7, art. 16). No se puede exigir dónde está conectada.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <Field label="Unidad"><select className={inputClass} style={inputStyle} value={unitId} onChange={e => setUnitId(e.target.value)}><option value="">Elige</option>{view.rights.units.map(unit => <option key={unit.unitId} value={unit.unitId}>{unit.label} · {fmt(unit.weight)}</option>)}</select></Field>
          <Field label="Calidad"><select className={inputClass} style={inputStyle} value={capacity} onChange={e => setCapacity(e.target.value as AttendanceCapacity)}>{Object.entries(CAPACITY_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
          {a.modality === "hybrid" && <Field label="Modalidad"><select className={inputClass} style={inputStyle} value={mode} onChange={e => setMode(e.target.value as AttendanceMode)}><option value="in_person">Presencial</option><option value="remote">En línea</option></select></Field>}
          <Field label="Persona (residente)"><select className={inputClass} style={inputStyle} value={attendeeProfileId} onChange={e => setAttendeeProfileId(e.target.value)}><option value="">Sin cuenta (indicar nombre)</option>{residents.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
          {!attendeeProfileId && <Field label="Nombre"><input className={inputClass} style={inputStyle} value={attendeeName} onChange={e => setAttendeeName(e.target.value)} /></Field>}
          {capacity === "proxy" && <Field label="Poder aceptado"><select className={inputClass} style={inputStyle} value={proxyId} onChange={e => setProxyId(e.target.value)}><option value="">Elige</option>{acceptedProxies.map(p => <option key={p.id} value={p.id}>{p.proxyName || residents.find(r => r.id === p.proxyProfileId)?.name || "Poder"}</option>)}</select></Field>}
          <label className="flex items-center gap-2 text-sm cc-text-secondary"><input type="checkbox" checked={verified} onChange={e => setVerified(e.target.checked)} /> {mode === "remote" ? "Imagen y voz verificadas" : "Identidad acreditada en sala"}</label>
        </div>
        {selectedNotEligible && <p className="mt-3 text-sm" role="status"><Tag tone="amber">{CONDUCTOR_BADGE}</Tag> <span className="cc-text-tertiary">{view.conductor?.certified ? "Según el certificado." : "Estimación de hoy; el certificado lo confirma."} Acredítala igual: asiste y opina, pero su voto no se registra.</span></p>}
        <Button className="mt-3" size="sm" variant="dark" disabled={busy || !unitId} onClick={() => run(() => AssemblyService.checkIn(a.id, { unitId, capacity, attendeeProfileId: attendeeProfileId || null, attendeeName, proxyId: proxyId || null, mode, verified }))}>Acreditar</Button>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="cc-text-tertiary"><tr><th className="py-2">Unidad</th><th>Persona</th><th>Calidad</th><th>Modalidad</th><th>Derechos</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {view.attendance.map(row => (
                <tr key={row.id} className="border-t" style={{ borderColor: "var(--cc-line)" }}>
                  <td className="py-2 cc-text-primary">{row.unitLabel}</td>
                  <td className="cc-text-secondary">{row.attendeeName || "—"}</td>
                  <td className="cc-text-secondary">{CAPACITY_LABEL[row.capacity]}</td>
                  <td className="cc-text-secondary">{row.mode === "remote" ? "En línea" : "Presencial"}</td>
                  <td className="cc-text-secondary">{fmt(row.weight)}</td>
                  <td>{row.status === "left" ? <Tag>Se retiró</Tag> : row.identityVerifiedAt && row.status === "present" ? <Tag tone="sage">Acreditada</Tag> : <Tag tone="amber">Por verificar</Tag>}</td>
                  <td className="text-right">
                    {row.status !== "left" && !(row.identityVerifiedAt && row.status === "present") && <Button size="sm" variant="dark" disabled={busy} onClick={() => run(() => AssemblyService.verifyAttendance(a.id, row.id))}>{row.mode === "remote" ? "Imagen y voz OK" : "Acreditar"}</Button>}
                    {row.status === "present" && <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => AssemblyService.markLeft(a.id, row.id))}>Se retiró</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <SectionTitle eyebrow="Votación" title="Tabla" />
        <div className="space-y-4">
          {a.items.map(item => {
            const tally = liveTally(view, item);
            return (
              <div key={item.id} className="rounded-xl border p-3" style={{ borderColor: item.votingStatus === "open" ? "var(--cc-copper)" : "var(--cc-line)" }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium cc-text-primary">{item.position}. {item.title}</p>
                  <Tag tone={item.quorumClass === "reinforced" ? "rose" : item.quorumClass === "absolute" ? "amber" : "sage"}>{CLASS_LABEL[item.quorumClass]}</Tag>
                </div>
                {item.votingStatus === "pending" && <Button className="mt-2" size="sm" variant="dark" disabled={busy || Boolean(openItem) || !certificate} onClick={() => run(() => AssemblyService.openVote(a.id, item.id))}>Abrir votación</Button>}
                {item.votingStatus === "open" && (
                  <div className="mt-2 space-y-2 text-sm cc-text-secondary">
                    <p>A favor {fmt(tally.yes)} · En contra {fmt(tally.no)} · Abstención {fmt(tally.abstain)}{tally.pending ? ` · ${tally.pending} sin verificar` : ""}</p>
                    <div className="flex flex-wrap items-end gap-2">
                      <Field label="Registrar voto en sala"><select className={inputClass} style={inputStyle} value={voteUnit} onChange={e => setVoteUnit(e.target.value)}><option value="">Unidad</option>{present.map(row => <option key={row.unitId} value={row.unitId}>{row.unitLabel}</option>)}</select></Field>
                      {(["yes", "no", "abstain"] as VoteChoice[]).map(choice => <Button key={choice} size="sm" variant="ghost" disabled={busy || !voteUnit} onClick={() => run(() => AssemblyService.recordVote(a.id, item.id, voteUnit, choice))}>{CHOICE_LABEL[choice]}</Button>)}
                    </div>
                    {pendingVotes.length > 0 && <div><p className="text-xs cc-text-tertiary">Votos en línea por verificar con imagen y voz:</p>{pendingVotes.map(vote => <Button key={vote.id} size="sm" variant="ghost" className="mr-2 mt-1" disabled={busy} onClick={() => run(() => AssemblyService.verifyVote(a.id, vote.id))}>{labelOf(vote.unitId)} · {CHOICE_LABEL[vote.choice]} ✓</Button>)}</div>}
                    <Field label="Observaciones para el acta (opcional)"><input className={inputClass} style={inputStyle} value={notes} onChange={e => setNotes(e.target.value)} /></Field>
                    <Button size="sm" variant="copper" disabled={busy} onClick={() => closeVote(item)}>Cerrar votación y calcular</Button>
                  </div>
                )}
                {item.votingStatus === "closed" && <ItemResult item={item} />}
              </div>
            );
          })}
        </div>
        <Button className="mt-5" variant="copper" disabled={busy || Boolean(openItem)} onClick={() => { if (window.confirm("¿Cerrar la sesión? Se generará el borrador del acta.")) run(() => AssemblyService.close(a.id), "Sesión cerrada. Revisa el borrador del acta."); }}>Cerrar sesión y generar acta</Button>
      </Card>
    </>
  );
}

function MinutesCard({ view, onView }: { view: AssemblyView; onView: (view: AssemblyView) => void }) {
  const a = view.assembly;
  const minutes = view.minutes;
  const { busy, message, run } = useAction(onView);
  const [content, setContent] = React.useState(minutes?.content ?? "");
  const [signers, setSigners] = React.useState("");
  React.useEffect(() => { setContent(minutes?.content ?? ""); }, [minutes?.content]);
  if (!minutes) return <Card><p className="text-sm cc-text-secondary">El acta aún no está disponible.</p></Card>;
  if (minutes.status === "signed") {
    return <Card><SectionTitle eyebrow={`Firmada · ${minutes.signers}`} title="Acta" /><MarkdownBlock content={minutes.content} /></Card>;
  }
  return (
    <Card>
      <SectionTitle eyebrow={`Borrador ${minutes.source === "ai" ? "redactado con IA" : "automático"}${minutes.edited ? " · editado" : ""}`} title="Acta" />
      {view.minutesDeadline && <p className="text-sm" style={{ color: view.minutesDeadline.overdue ? "var(--cc-rose)" : "var(--cc-ink-muted)" }}>Firma a más tardar el {view.minutesDeadline.dueOn} ({view.minutesDeadline.overdue ? "plazo vencido" : `quedan ${view.minutesDeadline.daysLeft} días`}; Ley 21.442, art. 15).</p>}
      <textarea className={`${inputClass} mt-3 font-mono`} style={inputStyle} rows={20} value={content} onChange={e => setContent(e.target.value)} />
      <details className="mt-2"><summary className="cursor-pointer text-sm" style={{ color: "var(--cc-copper)" }}>Vista previa</summary><div className="mt-2"><MarkdownBlock content={content} /></div></details>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="dark" disabled={busy} onClick={() => run(() => AssemblyService.saveMinutes(a.id, content), "Borrador guardado.")}>Guardar</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => { if (window.confirm("¿Volver a generar el acta desde los datos? Se perderán tus cambios.")) run(() => AssemblyService.regenerateMinutes(a.id)); }}>Volver a generar</Button>
      </div>
      <div className="mt-5">
        <Field label="Firmantes" hint="Todos los miembros del comité o los copropietarios que designó la asamblea (art. 15). Registra la firma cuando ya esté hecha, presencial o electrónica.">
          <input className={inputClass} style={inputStyle} value={signers} onChange={e => setSigners(e.target.value)} placeholder="Comité de administración (presidencia y miembros)" />
        </Field>
        {message && <p className="mt-2 text-sm cc-text-secondary">{message}</p>}
        <Button className="mt-3" variant="copper" disabled={busy || signers.trim().length < 3} onClick={() => { if (window.confirm("¿Marcar el acta como firmada? Después no se puede editar.")) run(() => AssemblyService.signMinutes(a.id, signers, content), "Acta firmada y publicada a la comunidad."); }}>Marcar acta firmada</Button>
      </div>
    </Card>
  );
}
