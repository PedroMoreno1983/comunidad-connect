"use client";

import { useEffect, useState } from "react";

type Proposal = { id: string; fact: string; category: string };

export default function CocoMemoryPage() {
    const [proposals, setProposals] = useState<Proposal[]>([]);
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;
        fetch("/api/admin/coco-memory", { cache: "no-store" })
            .then(async response => ({ ok: response.ok, data: await response.json() }))
            .then(result => {
                if (cancelled) return;
                if (!result.ok) setError(result.data.error || "No pude cargar las propuestas.");
                else setProposals(result.data.proposals || []);
            })
            .catch(() => {
                if (!cancelled) setError("No pude cargar las propuestas.");
            });
        return () => { cancelled = true; };
    }, []);

    async function decide(id: string, decision: "approve" | "reject") {
        const response = await fetch("/api/admin/coco-memory", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, decision }),
        });
        const data = await response.json();
        if (!response.ok) {
            setError(data.error || "No se pudo guardar la decisión.");
            return;
        }
        setProposals(current => current.filter(item => item.id !== id));
    }

    return (
        <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
            <div>
                <h1 className="text-2xl font-semibold">Memoria de la comunidad</h1>
                <p className="mt-2 text-sm text-slate-600">
                    Al cerrar una conversación, CoCo propone datos del reglamento, de proveedores o de acuerdos. Nada se guarda hasta que lo apruebas.
                </p>
            </div>
            {error ? <p className="text-sm text-red-700">{error}</p> : null}
            <ul className="space-y-3">
                {proposals.map(proposal => (
                    <li key={proposal.id} className="rounded-xl border px-4 py-3">
                        <p className="text-xs uppercase tracking-wide text-slate-500">{proposal.category}</p>
                        <p className="mt-1">{proposal.fact}</p>
                        <div className="mt-3 flex gap-3">
                            <button type="button" onClick={() => decide(proposal.id, "approve")} className="text-sm underline">Guardar</button>
                            <button type="button" onClick={() => decide(proposal.id, "reject")} className="text-sm underline">Descartar</button>
                        </div>
                    </li>
                ))}
                {!proposals.length ? <li className="text-sm text-slate-500">No hay propuestas pendientes.</li> : null}
            </ul>
        </div>
    );
}
