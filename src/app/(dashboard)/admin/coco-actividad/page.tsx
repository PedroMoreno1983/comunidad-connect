"use client";

import { useEffect, useState } from "react";

type Row = {
    id: string;
    action: string;
    summary: string;
    status: string;
    actorRole: string | null;
    createdAt: string;
    canUndo: boolean;
};

type Proposal = {
    id: string;
    title: string;
    body: string;
    href: string;
};

export default function CocoActivityPage() {
    const [autonomy, setAutonomy] = useState(true);
    const [events, setEvents] = useState<Row[]>([]);
    const [proposals, setProposals] = useState<Proposal[]>([]);
    const [error, setError] = useState("");

    function applyPayload(responseOk: boolean, data: { error?: string; autonomy?: boolean; events?: Row[] }) {
        if (!responseOk) {
            setError(data.error || "No pude cargar la actividad.");
            return;
        }
        setAutonomy(Boolean(data.autonomy));
        setEvents(data.events || []);
        setError("");
    }

    useEffect(() => {
        let cancelled = false;
        fetch("/api/admin/coco-activity", { cache: "no-store" })
            .then(async response => ({ ok: response.ok, data: await response.json() }))
            .then(result => {
                if (!cancelled) applyPayload(result.ok, result.data);
            })
            .catch(() => {
                if (!cancelled) setError("No pude cargar la actividad.");
            });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        let cancelled = false;
        fetch("/api/admin/coco-proposals", { cache: "no-store" })
            .then(async response => ({ ok: response.ok, data: await response.json() }))
            .then(result => {
                if (!cancelled && result.ok) setProposals(result.data.proposals || []);
            })
            .catch(() => {
                if (!cancelled) setError("No pude cargar las propuestas.");
            });
        return () => { cancelled = true; };
    }, []);

    async function load() {
        const response = await fetch("/api/admin/coco-activity", { cache: "no-store" });
        applyPayload(response.ok, await response.json());
    }

    async function toggle() {
        const response = await fetch("/api/admin/coco-activity", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ autonomy: !autonomy }),
        });
        if (response.ok) setAutonomy(!autonomy);
    }

    async function decide(id: string, decision: "accept" | "dismiss") {
        const response = await fetch("/api/admin/coco-proposals", {
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
        if (decision === "accept" && data.href) window.location.assign(data.href);
    }

    async function undo(id: string) {
        const response = await fetch("/api/admin/coco-activity", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ undoEventId: id }),
        });
        const data = await response.json();
        if (!response.ok) {
            setError(data.error || "No se pudo deshacer.");
            return;
        }
        await load();
    }

    return (
        <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
            <div>
                <h1 className="text-2xl font-semibold">Actividad de CoCo</h1>
                <p className="mt-2 text-sm text-slate-600">Qué hizo CoCo en esta comunidad, quién lo aprobó y qué se puede deshacer.</p>
            </div>
            <label className="flex items-center justify-between rounded-xl border px-4 py-3">
                <span>CoCo puede cambiar datos</span>
                <button type="button" onClick={toggle} className="rounded-full border px-3 py-1 text-sm">
                    {autonomy ? "Encendido" : "Apagado"}
                </button>
            </label>
            {error ? <p className="text-sm text-red-700">{error}</p> : null}
            <section className="space-y-3">
                <h2 className="text-lg font-semibold">Propuestas para confirmar</h2>
                {proposals.map(proposal => (
                    <article key={proposal.id} className="rounded-xl border px-4 py-3">
                        <p className="font-medium">{proposal.title}</p>
                        <p className="mt-1 text-sm text-slate-600">{proposal.body}</p>
                        <div className="mt-3 flex gap-3">
                            <button type="button" onClick={() => decide(proposal.id, "accept")} className="text-sm underline">Confirmar</button>
                            <button type="button" onClick={() => decide(proposal.id, "dismiss")} className="text-sm underline">Descartar</button>
                        </div>
                    </article>
                ))}
                {!proposals.length ? <p className="text-sm text-slate-500">No hay propuestas pendientes.</p> : null}
            </section>
            <ul className="space-y-3">
                {events.map(event => (
                    <li key={event.id} className="rounded-xl border px-4 py-3">
                        <p className="font-medium">{event.summary}</p>
                        <p className="mt-1 text-xs text-slate-500">{event.action} · {event.actorRole || "sistema"} · {event.status}</p>
                        {event.canUndo ? (
                            <button type="button" onClick={() => undo(event.id)} className="mt-2 text-sm underline">Deshacer</button>
                        ) : null}
                    </li>
                ))}
                {!events.length ? <li className="text-sm text-slate-500">Todavía no hay acciones de CoCo.</li> : null}
            </ul>
        </div>
    );
}
