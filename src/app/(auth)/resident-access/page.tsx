"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function ResidentAccessPage() {
    return <Suspense fallback={null}><ResidentAccessForm /></Suspense>;
}

function ResidentAccessForm() {
    const searchParams = useSearchParams();
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState("");

    const displayError = error || (searchParams.get("error") === "invalid"
        ? "El enlace expiró, ya fue utilizado o no corresponde a un residente con unidad asignada. Solicita otro."
        : "");

    async function requestAccess(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setLoading(true);
        setError("");
        const response = await fetch("/api/auth/resident-access", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: email.trim().toLowerCase() }),
        }).catch(() => null);
        setLoading(false);
        if (!response?.ok) {
            setError("No pudimos procesar la solicitud. Inténtalo más tarde.");
            return;
        }
        setSent(true);
    }

    return (
        <main className="flex min-h-screen items-center justify-center bg-[#FAF7F1] px-6">
            <section className="w-full max-w-md space-y-6 rounded-2xl bg-white p-8 shadow-sm">
                <Link href="/login" className="text-sm text-[#9C5636]">← Volver al inicio de sesión</Link>
                <div className="space-y-2">
                    <h1 className="text-3xl font-semibold text-slate-900">Acceso de residentes</h1>
                    <p className="text-sm text-slate-600">Usa el correo que aparece en la nómina de tu comunidad. Te enviaremos un enlace para entrar sin pedir un código a administración.</p>
                </div>
                {sent ? (
                    <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">Si tu correo tiene acceso, recibirás un enlace personal para entrar.</p>
                ) : (
                    <form onSubmit={requestAccess} className="space-y-4">
                        <label htmlFor="resident-email" className="block text-sm font-medium text-slate-700">Correo de la nómina</label>
                        <input id="resident-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm" />
                        {displayError && <p role="alert" className="text-sm text-red-700">{displayError}</p>}
                        <button type="submit" disabled={loading} className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{loading ? "Enviando..." : "Enviar enlace de acceso"}</button>
                    </form>
                )}
                <p className="text-xs text-slate-500">Si tu nómina solo tiene celular, aún no podemos verificarlo por este medio. Pide que agreguen tu correo a la nómina.</p>
            </section>
        </main>
    );
}
