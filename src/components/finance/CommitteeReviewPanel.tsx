'use client';

import { useEffect, useState } from 'react';
import { FinanceCommitteeService } from '@/lib/api';
import type { CommitteeReviewPanelProps, FinanceCommitteeReview, FinanceCommitteeResidentOption } from '@/lib/types';

export function CommitteeReviewPanel({ month, dueDate, quotaAmount, quotaMethod, issued }: CommitteeReviewPanelProps) {
    const [review, setReview] = useState<FinanceCommitteeReview | null>(null);
    const [reviewers, setReviewers] = useState<FinanceCommitteeResidentOption[]>([]);
    const [reviewerId, setReviewerId] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        let active = true;
        setLoading(true);
        setReview(null);
        setReviewerId('');
        FinanceCommitteeService.getAdmin(month).then(result => {
            if (!active) return;
            setReview(result.review); setReviewers(result.reviewers);
            setReviewerId(current => current || result.reviewers[0]?.id || '');
            setMessage('');
        }).catch(error => { if (active) setMessage(error instanceof Error ? error.message : 'No se pudo cargar la revisión.'); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [month]);

    async function requestReview() {
        if (!reviewerId) return;
        setSaving(true); setMessage('');
        try {
            const result = await FinanceCommitteeService.request({ month, dueDate, reviewerId, quotaAmount, quotaMethod });
            setReview(result.review);
            setMessage(result.warnings.length ? result.warnings.join(' ') : 'Solicitud enviada. El revisor puede abrir Mis gastos → Revisión del comité.');
        } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo solicitar la revisión.'); }
        finally { setSaving(false); }
    }

    const changed = review && (review.dueDate !== dueDate || review.quotaAmount !== (quotaAmount ?? null) || review.quotaMethod !== (quotaAmount ? quotaMethod : null));
    return <section className="rounded-2xl border p-5" style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper)' }}>
        <h2 className="font-semibold cc-text-primary">Revisión del comité</h2>
        <p className="mt-1 text-sm cc-text-secondary">Designa a un residente revisor para este mes. Una vez solicitada, la emisión espera su aprobación del cálculo vigente.</p>
        {loading ? <p className="mt-3 text-sm">Cargando…</p> : <>
            {review && <div className="mt-3 rounded-xl border p-3 text-sm" style={{ borderColor: 'var(--cc-line)' }}>
                <strong>{review.status === 'approved' ? 'Aprobada' : review.status === 'rejected' ? 'Rechazada' : 'Pendiente'}</strong>
                {' · '}{review.reviewerName || 'Residente designado'} · Vence {review.dueDate}
                {review.reviewNote && <p className="mt-1">Comentario: {review.reviewNote}</p>}
                {changed && <p className="mt-1 text-warning-fg">La fecha o cuota de la pantalla cambió. Solicita una nueva revisión antes de emitir.</p>}
            </div>}
            {!issued && <div className="mt-4 flex flex-wrap items-end gap-2">
                <label className="text-sm cc-text-secondary">Residente revisor
                    <select className="mt-1 block rounded-lg border bg-transparent p-2" value={reviewerId} onChange={event => setReviewerId(event.target.value)}>
                        {reviewers.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
                    </select>
                </label>
                <button type="button" className="rounded-lg bg-[var(--cc-ink)] px-4 py-2 text-sm text-white disabled:opacity-50" disabled={!reviewerId || saving} onClick={() => void requestReview()}>
                    {saving ? 'Enviando…' : review ? 'Solicitar nueva revisión' : 'Enviar a revisión'}
                </button>
            </div>}
            {!issued && reviewers.length === 0 && <p className="mt-2 text-sm cc-text-tertiary">No hay residentes de la comunidad disponibles como revisores.</p>}
        </>}
        {message && <p role="status" className="mt-3 text-sm cc-text-secondary">{message}</p>}
    </section>;
}
