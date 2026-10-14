"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, PencilLine, Sparkles } from "lucide-react";
import { Button } from "@/components/cc/Button";
import { CommitteeDigestService } from "@/lib/services/committeeDigestService";
import type { CommitteeDigestRecord } from "@/lib/committeeDigest/types";
import { periodLabel } from "@/lib/committeeDigest/week";
import { DigestMarkdown } from "./DigestMarkdown";

/**
 * Tarjeta "Resumen semanal" del Agent Center (admin): borrador, edición,
 * aprobación e historial. El comité solo lo ve después de la aprobación.
 */
export function CommitteeDigestCard({ refreshKey = 0 }: { refreshKey?: number }) {
  const [digests, setDigests] = useState<CommitteeDigestRecord[]>([]);
  const [hasCommittee, setHasCommittee] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const view = await CommitteeDigestService.getAdminView();
      setDigests(view.digests);
      setHasCommittee(view.hasCommittee);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo cargar el resumen semanal.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const current = digests[0] || null;
  const draft = current?.status === "draft" ? current : null;
  const history = digests.filter((digest) => digest.status === "published" && digest.id !== draft?.id);

  async function run(task: () => Promise<string>) {
    setWorking(true);
    setMessage("");
    try {
      setMessage(await task());
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo completar la acción.");
    } finally {
      setWorking(false);
    }
  }

  const generate = () => run(async () => {
    const result = await CommitteeDigestService.generate();
    return result.created ? "Borrador listo. Revísalo antes de compartirlo." : "Ya existe el resumen de esta semana: hay uno solo por semana.";
  });

  const save = () => run(async () => {
    if (!draft) return "";
    await CommitteeDigestService.saveDraft(draft.id, draftText);
    setEditing(false);
    return "Cambios guardados en el borrador.";
  });

  const approve = () => run(async () => {
    if (!draft) return "";
    const result = await CommitteeDigestService.approve(draft.id, editing ? draftText : undefined);
    setEditing(false);
    return result.digest.audience === "committee"
      ? `Aprobado. ${result.notified} integrante(s) del comité recibieron el aviso en la app.`
      : `Aprobado. No hay comité vigente, así que lo verán los administradores (${result.notified} aviso(s) en la app).`;
  });

  return (
    <section id="resumen-semanal" className="mt-7 rounded-2xl border p-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.12em] cc-text-tertiary">Para el comité · cada lunes 8:00</p>
          <h2 className="mt-1 text-2xl leading-none cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>Resumen semanal</h2>
        </div>
        {!draft && (
          <Button variant="ghost" size="sm" type="button" onClick={generate} disabled={working || loading}>
            {working ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Generar el de esta semana
          </Button>
        )}
      </div>
      <p className="mt-2 text-[13px] leading-5 cc-text-secondary">
        CoCo lo arma con datos agregados, sin nombres ni montos individuales. Lo ve {hasCommittee ? "el comité" : "administración (no hay comité vigente)"} solo después de tu aprobación, con un aviso dentro de la app.
      </p>

      {loading ? (
        <p className="mt-4 text-[13px] cc-text-tertiary">Cargando…</p>
      ) : draft ? (
        <div className="mt-4 rounded-xl border p-4" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-medium uppercase tracking-[0.1em]">
            <span style={{ color: "var(--cc-plum)" }}>Borrador · espera tu revisión</span>
            <span className="cc-text-tertiary">
              {periodLabel(draft.periodStart, draft.periodEnd)} · {draft.source === "ai" ? "redactado por IA" : "redacción automática"}{draft.edited ? " · editado" : ""}
            </span>
          </div>
          {editing ? (
            <textarea
              aria-label="Editar resumen semanal"
              className="mt-3 min-h-[320px] w-full rounded-xl border p-3 font-mono text-[13px] leading-5 outline-none focus:border-[var(--cc-copper)]"
              style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}
              maxLength={3000}
              value={draftText}
              onChange={(event) => setDraftText(event.target.value)}
            />
          ) : (
            <div className="mt-3"><DigestMarkdown content={draft.content} /></div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {editing ? (
              <>
                <Button variant="ghost" size="sm" type="button" onClick={save} disabled={working || !draftText.trim()}>Guardar cambios</Button>
                <Button variant="ghost" size="sm" type="button" onClick={() => setEditing(false)} disabled={working}>Cancelar</Button>
              </>
            ) : (
              <Button variant="ghost" size="sm" type="button" onClick={() => { setDraftText(draft.content); setEditing(true); }} disabled={working}>
                <PencilLine className="h-3.5 w-3.5" /> Editar
              </Button>
            )}
            <Button variant="copper" size="sm" type="button" onClick={approve} disabled={working || (editing && !draftText.trim())}>
              {working ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              {editing ? "Guardar y aprobar" : "Aprobar y compartir"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed p-4 text-[13px] cc-text-secondary" style={{ borderColor: "var(--cc-line)" }}>
          {current?.status === "published"
            ? "El resumen de esta semana ya fue aprobado y compartido."
            : "Aún no hay resumen esta semana. Se genera solo el lunes a las 8:00, o puedes pedirlo ahora."}
        </div>
      )}

      {message && <p role="status" className="mt-3 text-[13px] cc-text-secondary">{message}</p>}

      {history.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-[13px] font-medium" style={{ color: "var(--cc-copper)" }}>Historial ({history.length})</summary>
          <div className="mt-3 space-y-3">
            {history.map((digest) => (
              <article key={digest.id} className="rounded-xl border p-4" style={{ borderColor: "var(--cc-line)" }}>
                <p className="text-[11px] font-medium uppercase tracking-[0.1em] cc-text-tertiary">
                  {periodLabel(digest.periodStart, digest.periodEnd)} · compartido con {digest.audience === "committee" ? "el comité" : "administración"}
                  {digest.approvedAt ? ` · ${new Date(digest.approvedAt).toLocaleDateString("es-CL", { dateStyle: "medium" })}` : ""}
                </p>
                <div className="mt-2"><DigestMarkdown content={digest.content} /></div>
              </article>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
