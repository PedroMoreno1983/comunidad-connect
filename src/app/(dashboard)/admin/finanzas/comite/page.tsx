'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { FinanceCommitteeService } from '@/lib/api';
import type { FinanceCommitteeMember, FinanceCommitteeResidentOption } from '@/lib/types';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

export default function FinanceCommitteePage() {
    const [members, setMembers] = useState<FinanceCommitteeMember[]>([]);
    const [residents, setResidents] = useState<FinanceCommitteeResidentOption[]>([]);
    const [residentId, setResidentId] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const load = useCallback(async () => {
        try {
            const data = await FinanceCommitteeService.getMembers();
            setMembers(data.members); setResidents(data.residents);
            setResidentId(current => current || data.residents[0]?.id || '');
        } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo cargar el comité.'); }
    }, []);
    useEffect(() => { void load(); }, [load]);
    async function appoint() {
        setBusy(true); setMessage('');
        try { await FinanceCommitteeService.appoint(residentId); await load(); setMessage('Integrante designado.'); }
        catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo designar.'); }
        finally { setBusy(false); }
    }
    async function end(membershipId: string) {
        setBusy(true); setMessage('');
        try { await FinanceCommitteeService.endMembership(membershipId); await load(); setMessage('Designación terminada.'); }
        catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo terminar la designación.'); }
        finally { setBusy(false); }
    }
    const active = members.filter(member => !member.endedAt);
    return <ErrorBoundary name="Integrantes del comité">
        <main className="mx-auto max-w-4xl space-y-5 p-5 lg:p-8">
            <Link href="/admin/finanzas" className="text-sm underline">← Finanzas</Link>
            <header><p className="text-xs uppercase tracking-widest cc-text-tertiary">Gobierno financiero</p>
                <h1 className="text-3xl cc-text-primary" style={{ fontFamily: 'var(--cc-font-display)' }}>Integrantes del comité</h1>
                <p className="mt-2 text-sm cc-text-secondary">Designa quién puede aprobar el gasto común y los convenios. Cada alta y baja queda registrada.</p></header>
            {message && <p role="status" className="rounded-xl border p-3 text-sm">{message}</p>}
            <section className="rounded-2xl border p-5" style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper)' }}>
                <h2 className="font-semibold">Designar integrante</h2>
                <div className="mt-3 flex flex-wrap items-end gap-2"><label className="text-sm">Residente
                    <select className="mt-1 block rounded-lg border bg-transparent p-2" value={residentId} onChange={event => setResidentId(event.target.value)}>
                        {residents.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
                    </select></label><button type="button" disabled={!residentId || busy} onClick={() => void appoint()} className="rounded-lg bg-[var(--cc-ink)] px-4 py-2 text-sm text-[var(--cc-paper)] disabled:opacity-50">Designar</button></div>
            </section>
            <section className="rounded-2xl border p-5" style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper)' }}>
                <h2 className="font-semibold">Integrantes vigentes</h2>
                {active.length === 0 ? <p className="mt-2 text-sm cc-text-secondary">Aún no hay integrantes designados. Los cobros existentes pueden emitirse sin revisión hasta que configures el comité.</p>
                    : <ul className="mt-3 space-y-3">{active.map(member => <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">
                        <span>{member.name} <span className="cc-text-tertiary">· desde {member.startsOn}</span></span>
                        <button type="button" disabled={busy} onClick={() => void end(member.id)} className="underline disabled:opacity-50">Terminar designación</button>
                    </li>)}</ul>}
            </section>
            {members.some(member => member.endedAt) && <p className="text-xs cc-text-tertiary">El historial de designaciones se conserva para auditoría.</p>}
        </main>
    </ErrorBoundary>;
}
