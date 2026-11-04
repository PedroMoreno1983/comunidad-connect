'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [busy, setBusy] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState('');

    async function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setBusy(true);
        setError('');
        const response = await fetch('/api/auth/password-reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email.trim().toLowerCase() }),
        }).catch(() => null);
        setBusy(false);
        if (!response?.ok) { setError('No pudimos procesar la solicitud. Inténtalo más tarde.'); return; }
        setSent(true);
    }

    return (
        <main className="flex min-h-screen items-center justify-center bg-[#FAF7F1] px-6">
            <section className="w-full max-w-md space-y-5 rounded-2xl bg-white p-8 shadow-sm">
                <h1 className="text-2xl font-semibold text-slate-900">Recuperar acceso</h1>
                <p className="text-sm text-slate-600">Te enviaremos un código y un enlace a la página para ingresarlo y crear una contraseña nueva.</p>
                {sent ? (
                    <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">Si ese correo tiene una cuenta, recibirás un código y un enlace para ingresarlo. Revisa también la carpeta de spam.</p>
                ) : (
                    <form onSubmit={submit} className="space-y-4">
                        <label className="block text-sm font-medium text-slate-700">Correo de tu cuenta
                            <input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3" />
                        </label>
                        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
                        <button disabled={busy} className="w-full rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-50">{busy ? 'Enviando...' : 'Enviar código'}</button>
                    </form>
                )}
                <Link href="/login" className="block text-sm text-[#9C5636]">Volver al inicio de sesión</Link>
            </section>
        </main>
    );
}
