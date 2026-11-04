"use client";

import { useEffect, useState } from "react";

type Status = { connected?: boolean; email?: string; error?: string };

export default function CocoGooglePage() {
    const [status, setStatus] = useState<Status>({});
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;
        fetch("/api/admin/google", { cache: "no-store" })
            .then(async response => ({ ok: response.ok, data: await response.json() }))
            .then(result => {
                if (cancelled) return;
                if (!result.ok) setError(result.data.error || "No pude leer la conexión.");
                else setStatus(result.data);
            })
            .catch(() => {
                if (!cancelled) setError("No pude leer la conexión.");
            });
        return () => { cancelled = true; };
    }, []);

    async function disconnect() {
        const response = await fetch("/api/admin/google", { method: "DELETE" });
        if (!response.ok) {
            setError("No pude desconectar Google.");
            return;
        }
        setStatus({ connected: false });
    }

    return (
        <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
            <div>
                <h1 className="text-2xl font-semibold">Google de CoCo</h1>
                <p className="mt-2 text-sm text-slate-600">
                    Conecta el Gmail y el Calendar de tu cuenta de administrador. CoCo lee lo tuyo. Enviar un correo o crear un evento siempre te pide confirmación.
                </p>
            </div>
            {error ? <p className="text-sm text-red-700">{error}</p> : null}
            {status.connected ? (
                <div className="rounded-xl border px-4 py-3">
                    <p>Conectado como {status.email}</p>
                    <button type="button" onClick={disconnect} className="mt-3 text-sm underline">Desconectar</button>
                </div>
            ) : (
                <a href="/api/admin/google/connect" className="inline-block rounded-full border px-4 py-2 text-sm">Conectar Google</a>
            )}
        </div>
    );
}
