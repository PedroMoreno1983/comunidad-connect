'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function ResetPasswordPage() {
    const router = useRouter();
    const [ready, setReady] = useState(false);
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        let active = true;
        void (async () => {
            const result = await supabase.auth.getUser();
            if (active) setReady(Boolean(result.data.user));
        })();
        return () => { active = false; };
    }, []);

    async function save(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!ready || busy) return;
        if (password.length < 12) { setError('Usa al menos 12 caracteres.'); return; }
        if (password !== confirm) { setError('Las contraseñas no coinciden.'); return; }
        setBusy(true);
        setError('');
        const { error: updateError } = await supabase.auth.updateUser({ password });
        setBusy(false);
        if (updateError) { setError(updateError.message || 'No se pudo guardar la contraseña.'); return; }
        router.replace('/admin');
        router.refresh();
    }

    return (
        <main className="flex min-h-screen items-center justify-center bg-[#FAF7F1] px-6">
            <section className="w-full max-w-md space-y-5 rounded-2xl bg-white p-8 shadow-sm">
                <h1 className="text-2xl font-semibold text-slate-900">Crear nueva contraseña</h1>
                {!ready ? (
                    <p className="text-sm text-slate-600">El enlace expiró o aún no se ha verificado. Solicita uno nuevo desde el inicio de sesión.</p>
                ) : (
                    <form onSubmit={save} className="space-y-4">
                        <label className="block text-sm font-medium text-slate-700">Nueva contraseña
                            <input type="password" autoComplete="new-password" required minLength={12} value={password} onChange={event => setPassword(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3" />
                        </label>
                        <label className="block text-sm font-medium text-slate-700">Confirmar contraseña
                            <input type="password" autoComplete="new-password" required value={confirm} onChange={event => setConfirm(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3" />
                        </label>
                        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
                        <button disabled={busy} className="w-full rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-50">{busy ? 'Guardando...' : 'Guardar y entrar'}</button>
                    </form>
                )}
                <Link href="/login" className="block text-sm text-[#9C5636]">Volver al inicio de sesión</Link>
            </section>
        </main>
    );
}
