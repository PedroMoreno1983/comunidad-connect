"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, ShieldQuestion } from "lucide-react";
import { ProviderMediaService } from "@/lib/api";
import type { ProviderDocument, ProviderDocumentsReviewProps } from "@/lib/types";

const KIND_LABEL = { background_certificate: "Certificado de antecedentes", identity: "Cédula de identidad" } as const;

const VERDICT = {
    looks_ok: { label: "El chequeo automático no encontró problemas", icon: CheckCircle2, color: "var(--cc-sage)" },
    needs_review: { label: "Revisar a mano", icon: ShieldQuestion, color: "var(--cc-copper)" },
    problem: { label: "El chequeo encontró problemas", icon: AlertTriangle, color: "var(--cc-danger, #b42318)" },
} as const;

/**
 * Revisión de documentos de un maestro: la administración de su comunidad, o
 * Convive para la Red. El chequeo automático orienta; la decisión es humana.
 */
export function ProviderDocumentsReview({ providerId, scope }: ProviderDocumentsReviewProps) {
    const [documents, setDocuments] = useState<ProviderDocument[] | null>(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState<string | null>(null);
    const [notes, setNotes] = useState<Record<string, string>>({});

    const load = useCallback(async () => {
        try {
            setDocuments(await ProviderMediaService.listDocuments(providerId, scope));
            setError("");
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los documentos.");
        }
    }, [providerId, scope]);

    useEffect(() => { void load(); }, [load]);

    const decide = async (documentId: string, approve: boolean) => {
        setBusy(documentId);
        try {
            await ProviderMediaService.reviewDocument(providerId, scope, documentId, approve, notes[documentId]);
            await load();
        } catch (reviewError) {
            setError(reviewError instanceof Error ? reviewError.message : "No se pudo guardar la revisión.");
        } finally {
            setBusy(null);
        }
    };

    if (error && !documents) return <p className="text-sm" style={{ color: "var(--cc-danger, #b42318)" }}>{error}</p>;
    if (!documents) return <p className="text-sm cc-text-secondary">Cargando documentos…</p>;
    if (documents.length === 0) return <p className="text-sm cc-text-secondary">El maestro todavía no sube documentos.</p>;

    return (
        <div className="space-y-3">
            {error && <p className="text-sm" style={{ color: "var(--cc-danger, #b42318)" }}>{error}</p>}
            {documents.map(document => {
                const verdict = document.autoCheck ? VERDICT[document.autoCheck.verdict] : null;
                const Icon = verdict?.icon;
                return (
                    <article key={document.id} className="space-y-2 rounded-xl border p-3" style={{ borderColor: "var(--cc-line)" }}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-semibold cc-text-primary">
                                {KIND_LABEL[document.kind]} · {new Date(document.createdAt).toLocaleDateString("es-CL")}
                            </p>
                            {document.viewUrl && (
                                <a href={document.viewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--cc-copper)" }}>
                                    Ver archivo <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                            )}
                        </div>
                        {verdict && Icon && (
                            <div className="space-y-1">
                                <p className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: verdict.color }}><Icon className="h-4 w-4" /> {verdict.label}</p>
                                <ul className="list-disc space-y-0.5 pl-5 text-xs cc-text-secondary">
                                    {document.autoCheck?.findings.map(finding => <li key={finding}>{finding}</li>)}
                                </ul>
                            </div>
                        )}
                        {document.status === "pending" ? (
                            <div className="flex flex-col gap-2 sm:flex-row">
                                <input value={notes[document.id] || ""} onChange={event => setNotes({ ...notes, [document.id]: event.target.value })}
                                    maxLength={300} placeholder="Motivo si lo rechazas (el maestro lo verá)"
                                    className="min-w-0 flex-1 rounded-lg border px-3 py-1.5 text-sm" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }} />
                                <button type="button" disabled={busy !== null} onClick={() => void decide(document.id, true)}
                                    className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white" style={{ background: "var(--cc-sage)" }}>
                                    {busy === document.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Aprobar"}
                                </button>
                                <button type="button" disabled={busy !== null} onClick={() => void decide(document.id, false)}
                                    className="rounded-lg border px-3 py-1.5 text-sm cc-text-primary" style={{ borderColor: "var(--cc-line-strong)" }}>
                                    Rechazar
                                </button>
                            </div>
                        ) : (
                            <p className="text-xs font-semibold" style={{ color: document.status === "approved" ? "var(--cc-sage)" : "var(--cc-danger, #b42318)" }}>
                                {document.status === "approved" ? "Aprobado" : `Rechazado${document.reviewNote ? `: ${document.reviewNote}` : ""}`}
                                {document.reviewedAt ? ` el ${new Date(document.reviewedAt).toLocaleDateString("es-CL")}` : ""}
                            </p>
                        )}
                    </article>
                );
            })}
            <p className="text-xs cc-text-tertiary">
                El certificado de antecedentes se puede validar en el sitio del Registro Civil con su folio y código. El chequeo automático no lo hace.
            </p>
        </div>
    );
}
