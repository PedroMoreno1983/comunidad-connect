'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { DigestMarkdown } from '@/components/committeeDigest/DigestMarkdown';
import { CommitteeDigestService } from '@/lib/services/committeeDigestService';
import type { CommitteeDigestPublished } from '@/lib/committeeDigest/types';
import { periodLabel } from '@/lib/committeeDigest/week';

/** Vista de solo lectura del comité: resúmenes semanales ya aprobados por administración. */
export default function CommitteeDigestPage() {
    const [digests, setDigests] = useState<CommitteeDigestPublished[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');

    useEffect(() => {
        CommitteeDigestService.getPublished()
            .then(setDigests)
            .catch(error => setMessage(error instanceof Error ? error.message : 'No se pudo cargar el resumen semanal.'))
            .finally(() => setLoading(false));
    }, []);

    const [latest, ...history] = digests;
    return <main className="mx-auto max-w-3xl space-y-5 p-5 lg:p-8">
        <Link href="/expenses/committee-review" className="text-sm underline">← Revisión del comité</Link>
        <div>
            <p className="text-xs uppercase tracking-widest cc-text-tertiary">Comité</p>
            <h1 className="text-3xl cc-text-primary" style={{ fontFamily: 'var(--cc-font-display)' }}>Resumen semanal</h1>
            <p className="mt-2 text-sm cc-text-secondary">Lo que pasó en la comunidad esta semana, con datos agregados y las decisiones sugeridas para el comité. Administración lo revisa antes de compartirlo.</p>
        </div>
        {message && <p role="status" className="rounded-xl border p-3 text-sm" style={{ borderColor: 'var(--cc-line)' }}>{message}</p>}
        {loading ? <p className="text-sm cc-text-tertiary">Cargando…</p> : !latest ? (!message && <p className="text-sm cc-text-secondary">Aún no hay resúmenes compartidos.</p>) : <>
            <article className="rounded-2xl border p-5" style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper)' }}>
                <p className="text-[11px] font-medium uppercase tracking-[0.1em] cc-text-tertiary">{periodLabel(latest.periodStart, latest.periodEnd)}</p>
                <div className="mt-2"><DigestMarkdown content={latest.content} /></div>
            </article>
            {history.length > 0 && <details>
                <summary className="cursor-pointer text-sm font-medium" style={{ color: 'var(--cc-copper)' }}>Semanas anteriores ({history.length})</summary>
                <div className="mt-3 space-y-3">{history.map(digest => <article key={digest.id} className="rounded-2xl border p-5" style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper)' }}>
                    <p className="text-[11px] font-medium uppercase tracking-[0.1em] cc-text-tertiary">{periodLabel(digest.periodStart, digest.periodEnd)}</p>
                    <div className="mt-2"><DigestMarkdown content={digest.content} /></div>
                </article>)}</div>
            </details>}
        </>}
    </main>;
}
