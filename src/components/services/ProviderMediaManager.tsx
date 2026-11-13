"use client";

import { useRef, useState } from "react";
import { Camera, FileCheck2, ImagePlus, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { ProviderMediaService } from "@/lib/api";
import type { ProviderDocumentKind, ProviderMediaManagerProps } from "@/lib/types";

const card = { borderColor: "var(--cc-line)", background: "var(--cc-paper)" };

const DOCUMENT_COPY: Record<ProviderDocumentKind, { title: string; help: string }> = {
    background_certificate: {
        title: "Certificado de antecedentes",
        help: "Descárgalo gratis en registrocivil.cl (para fines especiales o particulares). Debe tener menos de 60 días.",
    },
    identity: {
        title: "Cédula de identidad",
        help: "Foto o PDF de ambos lados, vigente.",
    },
};

const STATUS_COPY = {
    pending: { label: "En revisión", color: "var(--cc-amber, var(--cc-copper))" },
    approved: { label: "Aprobado", color: "var(--cc-sage)" },
    rejected: { label: "Rechazado", color: "var(--cc-danger, #b42318)" },
} as const;

/**
 * Foto de perfil, fotos de trabajos y documentos del maestro. Lo usan el
 * maestro (con su cuenta o su enlace) y la administración.
 */
export function ProviderMediaManager({ target, photo, workPhotos, documents, onChanged }: ProviderMediaManagerProps) {
    const [busy, setBusy] = useState<string | null>(null);
    const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
    const [caption, setCaption] = useState("");
    const profileInput = useRef<HTMLInputElement>(null);
    const workInput = useRef<HTMLInputElement>(null);
    const documentInput = useRef<HTMLInputElement>(null);
    const [documentKind, setDocumentKind] = useState<ProviderDocumentKind>("background_certificate");

    const run = async (key: string, action: () => Promise<string>) => {
        setBusy(key);
        setMessage(null);
        try {
            setMessage({ text: await action() });
            onChanged();
        } catch (error) {
            setMessage({ text: error instanceof Error ? error.message : "No se pudo completar.", error: true });
        } finally {
            setBusy(null);
        }
    };

    const pick = (input: HTMLInputElement | null) => {
        const file = input?.files?.[0] || null;
        if (input) input.value = "";
        return file;
    };

    return (
        <section className="space-y-5 rounded-2xl border p-5" style={card}>
            <div className="flex items-center gap-4">
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full border" style={{ borderColor: "var(--cc-line)", background: "var(--cc-ivory)" }}>
                    {photo
                        // eslint-disable-next-line @next/next/no-img-element -- foto subida al bucket público, tamaño variable
                        ? <img src={photo} alt="Foto de perfil" className="h-full w-full object-cover" />
                        : <div className="flex h-full w-full items-center justify-center cc-text-tertiary"><Camera className="h-7 w-7" /></div>}
                </div>
                <div>
                    <p className="font-semibold cc-text-primary">Foto de perfil</p>
                    <p className="text-xs cc-text-secondary">Una foto clara de tu cara genera confianza. JPG, PNG o WEBP, hasta 5 MB.</p>
                    <button type="button" disabled={busy !== null} onClick={() => profileInput.current?.click()}
                        className="mt-2 inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm cc-text-primary" style={{ borderColor: "var(--cc-line-strong)" }}>
                        {busy === "profile" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} {photo ? "Cambiar foto" : "Subir foto"}
                    </button>
                    <input ref={profileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                        onChange={() => {
                            const file = pick(profileInput.current);
                            if (file) void run("profile", async () => { await ProviderMediaService.uploadPhoto(target, "profile", file); return "Foto de perfil actualizada."; });
                        }} />
                </div>
            </div>

            <div className="space-y-3">
                <div>
                    <p className="font-semibold cc-text-primary">Fotos de trabajos ({workPhotos.length}/12)</p>
                    <p className="text-xs cc-text-secondary">Muestra trabajos terminados. No subas fotos con personas, patentes ni datos de clientes.</p>
                </div>
                {workPhotos.length > 0 && (
                    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {workPhotos.map(item => (
                            <li key={item.id} className="relative overflow-hidden rounded-xl border" style={{ borderColor: "var(--cc-line)" }}>
                                {/* eslint-disable-next-line @next/next/no-img-element -- foto subida al bucket público */}
                                <img src={item.url} alt={item.caption || "Trabajo realizado"} className="aspect-square w-full object-cover" />
                                {item.caption && <p className="truncate px-2 py-1 text-xs cc-text-secondary">{item.caption}</p>}
                                <button type="button" aria-label="Borrar foto" disabled={busy !== null}
                                    onClick={() => void run(`delete-${item.id}`, async () => { await ProviderMediaService.deletePhoto(target, item.id); return "Foto borrada."; })}
                                    className="absolute right-1.5 top-1.5 rounded-full p-1.5 text-white" style={{ background: "rgba(0,0,0,0.55)" }}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                {workPhotos.length < 12 && (
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <input value={caption} onChange={event => setCaption(event.target.value)} maxLength={160}
                            placeholder="Descripción (opcional): cambio de calefont, tablero eléctrico…"
                            className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }} />
                        <button type="button" disabled={busy !== null} onClick={() => workInput.current?.click()}
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm cc-text-primary" style={{ borderColor: "var(--cc-line-strong)" }}>
                            {busy === "work" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />} Agregar foto
                        </button>
                        <input ref={workInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                            onChange={() => {
                                const file = pick(workInput.current);
                                if (file) void run("work", async () => {
                                    await ProviderMediaService.uploadPhoto(target, "work", file, caption.trim() || undefined);
                                    setCaption("");
                                    return "Foto de trabajo agregada.";
                                });
                            }} />
                    </div>
                )}
            </div>

            <div className="space-y-3">
                <div>
                    <p className="flex items-center gap-1.5 font-semibold cc-text-primary"><ShieldCheck className="h-4 w-4" style={{ color: "var(--cc-sage)" }} /> Documentos</p>
                    <p className="text-xs cc-text-secondary">
                        Se guardan de forma privada: solo los ve la administración que los revisa, nunca los vecinos. Al aprobarlos, tu perfil muestra
                        &ldquo;Antecedentes revisados&rdquo;.
                    </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                    {(Object.keys(DOCUMENT_COPY) as ProviderDocumentKind[]).map(kind => (
                        <div key={kind} className="rounded-xl border p-3" style={{ borderColor: "var(--cc-line)" }}>
                            <p className="text-sm font-semibold cc-text-primary">{DOCUMENT_COPY[kind].title}</p>
                            <p className="mt-0.5 text-xs cc-text-secondary">{DOCUMENT_COPY[kind].help}</p>
                            <button type="button" disabled={busy !== null}
                                onClick={() => { setDocumentKind(kind); documentInput.current?.click(); }}
                                className="mt-2 inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm cc-text-primary" style={{ borderColor: "var(--cc-line-strong)" }}>
                                {busy === `doc-${kind}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />} Subir
                            </button>
                        </div>
                    ))}
                </div>
                <input ref={documentInput} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden"
                    onChange={() => {
                        const file = pick(documentInput.current);
                        if (file) void run(`doc-${documentKind}`, async () => {
                            await ProviderMediaService.uploadDocument(target, documentKind, file);
                            return "Documento recibido. Lo revisamos y te avisamos el resultado aquí.";
                        });
                    }} />
                {documents && documents.length > 0 && (
                    <ul className="space-y-1.5">
                        {documents.map(document => (
                            <li key={document.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--cc-line)" }}>
                                <span className="cc-text-primary">{DOCUMENT_COPY[document.kind].title} · {new Date(document.createdAt).toLocaleDateString("es-CL")}</span>
                                <span className="text-xs font-semibold" style={{ color: STATUS_COPY[document.status].color }}>
                                    {STATUS_COPY[document.status].label}{document.status === "rejected" && document.reviewNote ? `: ${document.reviewNote}` : ""}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {message && (
                <p className="rounded-xl border px-3 py-2 text-sm" role="status"
                    style={{ ...card, color: message.error ? "var(--cc-danger, #b42318)" : "var(--cc-ink)" }}>
                    {message.text}
                </p>
            )}
        </section>
    );
}
