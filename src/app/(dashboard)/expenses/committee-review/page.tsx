'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { FinanceCommitteeService } from '@/lib/api';
import type { FinanceCommitteeReview } from '@/lib/types';

const money = (amount: number) => `$${Math.round(amount).toLocaleString('es-CL')}`;

export default function CommitteeReviewPage() {
    const [reviews, setReviews] = useState<FinanceCommitteeReview[]>([]);
    const [loading, setLoading] = useState(true);
    const [working, setWorking] = useState<string | null>(null);
    const [note, setNote] = useState<Record<string, string>>({});
    const [message, setMessage] = useState('');
    const load = useCallback(async () => {
        try { setReviews(await FinanceCommitteeService.getAssigned()); }
        catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudieron cargar las revisiones.'); }
        finally { setLoading(false); }
    }, []);
    useEffect(() => { void load(); }, [load]);

    async function decide(review: FinanceCommitteeReview, decision: 'approved' | 'rejected') {
        setWorking(review.id); setMessage('');
        try {
            const result = await FinanceCommitteeService.decide(review.id, decision, note[review.id] || '');
            setMessage(result.warnings.length ? result.warnings.join(' ') : `Revisión ${decision === 'approved' ? 'aprobada' : 'rechazada'}.`);
            await load();
        } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo guardar la decisión.'); }
        finally { setWorking(null); }
    }

    return <main className="mx-auto max-w-4xl space-y-5 p-5 lg:p-8">
        <Link href="/expenses" className="text-sm underline">← Mis gastos</Link>
        <div><p className="text-xs uppercase tracking-widest cc-text-tertiary">Finanzas</p>
            <h1 className="text-3xl cc-text-primary" style={{ fontFamily: 'var(--cc-font-display)' }}>Revisión del comité</h1>
            <p className="mt-2 text-sm cc-text-secondary">Revisa los montos y el desglose antes de aprobar. Tu decisión queda registrada con tu cuenta.</p></div>
        {message && <p role="status" className="rounded-xl border p-3 text-sm">{message}</p>}
        {loading ? <p>Cargando revisiones…</p> : reviews.length === 0 ? <p>No tienes revisiones asignadas.</p> : reviews.map(review =>
            <section key={review.id} className="rounded-2xl border p-5" style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper)' }}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><h2 className="text-xl font-semibold">Gasto común {review.month}</h2>
                        <p className="text-sm cc-text-secondary">Vencimiento {review.dueDate} · {review.snapshot.unitCount} unidades</p></div>
                    <strong>{money(review.snapshot.totalCharged)}</strong>
                </div>
                {review.quotaAmount && <p className="mt-2 text-sm">Cuota fija: {money(review.quotaAmount)} · {review.quotaMethod === 'equal' ? 'partes iguales' : 'alícuota'}</p>}
                {review.snapshot.warnings.length > 0 && <ul className="mt-3 list-disc pl-5 text-sm text-warning-fg">{review.snapshot.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}
                <div className="mt-4 rounded-xl border p-3" style={{ borderColor: 'var(--cc-line)' }}>
                    <h3 className="font-semibold">Egresos registrados del mes</h3>
                    {review.snapshot.sourceExpenses?.length ? <ul className="mt-2 space-y-1 text-sm">{review.snapshot.sourceExpenses.map(expense =>
                        <li key={expense.id} className="flex flex-wrap justify-between gap-2"><span>{expense.label}{expense.hasDocument
                            ? <> · <a className="underline" href={`/api/finance-documents/${expense.id}`} target="_blank" rel="noopener noreferrer">Ver respaldo</a></>
                            : ' · Sin respaldo adjunto'}</span><strong>{money(expense.amount)}</strong></li>)}</ul>
                        : <p className="mt-2 text-sm cc-text-secondary">No hay egresos registrados para este mes.</p>}
                </div>
                <div className="mt-4 max-h-96 overflow-auto rounded-xl border" style={{ borderColor: 'var(--cc-line)' }}>
                    <table className="w-full text-sm"><thead><tr className="text-left"><th className="p-2">Unidad</th><th className="p-2">Conceptos</th><th className="p-2 text-right">Cobro</th></tr></thead>
                        <tbody>{review.snapshot.units.map(unit => <tr key={unit.unitId} className="border-t align-top" style={{ borderColor: 'var(--cc-line)' }}>
                            <td className="p-2">{unit.label}</td><td className="p-2">{unit.items.map(item => <div key={item.expenseId}>{item.label}: {money(item.amount)}</div>)}</td>
                            <td className="p-2 text-right font-semibold">{money(unit.total)}</td></tr>)}</tbody></table>
                </div>
                <p className="mt-3 text-sm">Total de egresos o cuota a repartir: {money(review.snapshot.totalExpenses)}</p>
                {review.status === 'pending' ? <div className="mt-4 space-y-2">
                    <label className="block text-sm">Observación para administración
                        <textarea className="mt-1 w-full rounded-lg border bg-transparent p-2" maxLength={1000} rows={3} value={note[review.id] || ''}
                            onChange={event => setNote(current => ({ ...current, [review.id]: event.target.value }))} placeholder="Obligatoria si rechazas" />
                    </label>
                    <div className="flex gap-2"><button type="button" disabled={working !== null} onClick={() => void decide(review, 'approved')} className="rounded-lg bg-[var(--cc-ink)] px-4 py-2 text-sm text-white disabled:opacity-50">Aprobar cálculo</button>
                        <button type="button" disabled={working !== null || !(note[review.id] || '').trim()} onClick={() => void decide(review, 'rejected')} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50">Rechazar y pedir corrección</button></div>
                </div> : <p className="mt-4 text-sm font-semibold">{review.status === 'approved' ? 'Aprobado' : 'Rechazado'}{review.reviewNote ? ` · ${review.reviewNote}` : ''}</p>}
            </section>)}
    </main>;
}
