"use client";

import { useEffect, useState } from "react";
import type { CocoInsights } from "@/lib/types";

/** Qué preguntan los vecinos a CoCo, en conjunto. Nunca conversaciones ni nombres. */
export function CocoInsightsCard() {
    const [insights, setInsights] = useState<CocoInsights | null>(null);
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;
        fetch("/api/admin/coco-insights", { cache: "no-store" })
            .then(async response => ({ ok: response.ok, data: await response.json() }))
            .then(result => {
                if (cancelled) return;
                if (result.ok) setInsights(result.data.insights);
                else setError(result.data.error || "No pude cargar los datos de uso.");
            })
            .catch(() => { if (!cancelled) setError("No pude cargar los datos de uso."); });
        return () => { cancelled = true; };
    }, []);

    return (
        <section className="rounded-xl border px-4 py-4">
            <h2 className="text-lg font-semibold">Qué consultan los vecinos a CoCo</h2>
            <p className="mt-1 text-sm text-slate-600">
                Últimos {insights?.days ?? 30} días, en conjunto. Las conversaciones son privadas: aquí no hay textos ni nombres, y un tema aparece solo si lo consultaron al menos {insights?.minPeople ?? 3} personas.
            </p>
            {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
            {insights && insights.residents === null ? (
                <p className="mt-3 text-sm text-slate-600">Todavía hay muy pocos vecinos usando CoCo para mostrar datos sin que se pueda saber quiénes son.</p>
            ) : null}
            {insights && insights.residents !== null ? (
                <>
                    <dl className="mt-3 grid grid-cols-3 gap-3 text-center">
                        <div className="rounded-lg bg-slate-50 px-2 py-3"><dt className="text-xs text-slate-500">Vecinos</dt><dd className="text-xl font-semibold">{insights.residents}</dd></div>
                        <div className="rounded-lg bg-slate-50 px-2 py-3"><dt className="text-xs text-slate-500">Consultas</dt><dd className="text-xl font-semibold">{insights.messages}</dd></div>
                        <div className="rounded-lg bg-slate-50 px-2 py-3"><dt className="text-xs text-slate-500">Por WhatsApp</dt><dd className="text-xl font-semibold">{insights.whatsappShare}%</dd></div>
                    </dl>
                    <ul className="mt-4 space-y-2">
                        {insights.topics.map(topic => (
                            <li key={topic.topic} className="flex items-center justify-between gap-3 text-sm">
                                <span>{topic.label}</span>
                                <span className="text-slate-500">{topic.people} vecinos · {topic.messages} consultas</span>
                            </li>
                        ))}
                    </ul>
                    {insights.hiddenTopics > 0 ? (
                        <p className="mt-3 text-xs text-slate-500">{insights.hiddenTopics} tema(s) más con menos de {insights.minPeople} personas, que no se muestran.</p>
                    ) : null}
                </>
            ) : null}
        </section>
    );
}
