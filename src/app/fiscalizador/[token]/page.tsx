import type { Metadata } from 'next';
import { getOversightReport, OversightError } from '@/lib/operations/oversightService';
import type { OversightReport } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Portal del fiscalizador',
    robots: { index: false, follow: false },
};

const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const money = (value: number) => `$${Math.round(value).toLocaleString('es-CL')}`;
const monthLabel = (month: string) => {
    const [year, index] = month.split('-').map(Number);
    return `${MONTH_NAMES[index - 1]} ${year}`;
};

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
    return (
        <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper)' }}>
            <p className="text-xs uppercase tracking-[0.08em] cc-text-tertiary">{label}</p>
            <p className="mt-1 text-2xl font-semibold cc-text-primary">{value}</p>
            {hint && <p className="mt-1 text-xs cc-text-tertiary">{hint}</p>}
        </div>
    );
}

/** Rendición de solo lectura para quien fiscaliza la administración. */
export default async function OversightPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    let report: OversightReport;
    try {
        report = await getOversightReport(token);
    } catch (error) {
        const message = error instanceof OversightError ? error.message : 'No se pudo cargar la información. Intenta más tarde.';
        return (
            <main className="mx-auto flex min-h-screen max-w-xl items-center px-4" style={{ background: 'var(--cc-ivory)' }}>
                <div className="w-full rounded-2xl border p-8 text-center" style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper)' }}>
                    <h1 className="text-xl font-semibold cc-text-primary">Portal del fiscalizador</h1>
                    <p className="mt-3 text-sm cc-text-secondary">{message}</p>
                </div>
            </main>
        );
    }

    const latest = report.months[0];
    return (
        <main className="min-h-screen px-4 py-10" style={{ background: 'var(--cc-ivory)' }}>
            <div className="mx-auto max-w-4xl space-y-8">
                <header className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.12em] cc-text-tertiary">Portal del fiscalizador · solo lectura</p>
                    <h1 className="text-3xl font-semibold cc-text-primary" style={{ fontFamily: 'var(--cc-font-display)' }}>{report.community.name}</h1>
                    {report.community.address && <p className="text-sm cc-text-secondary">{report.community.address}</p>}
                    <p className="text-xs cc-text-tertiary">
                        Acceso para {report.label}. Vence el {new Date(report.expiresAt).toLocaleDateString('es-CL')}.
                        Datos al {new Date(report.generatedAt).toLocaleString('es-CL', { dateStyle: 'long', timeStyle: 'short' })}.
                    </p>
                </header>

                <section className="grid gap-3 sm:grid-cols-4">
                    <Stat label="Fondo de reserva" value={money(report.reserveFundBalance)} />
                    <Stat label="Deuda total" value={money(report.debt.totalDebt)} hint={`${report.debt.unitsWithDebt} de ${report.debt.totalUnits} unidades`} />
                    <Stat label="Deuda vencida" value={money(report.debt.totalOverdue)} hint={`${report.debt.unitsOverdue} unidades morosas`} />
                    <Stat label={`Recaudación ${monthLabel(latest.month)}`} value={`${latest.collectionRate}%`} hint={`${money(latest.collected.total)} de ${money(latest.charged.total)}`} />
                </section>

                <section className="space-y-3">
                    <h2 className="text-lg font-semibold cc-text-primary">Rendición mensual</h2>
                    <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper)' }}>
                        <table className="w-full text-sm">
                            <thead style={{ background: 'var(--cc-paper-warm)' }}>
                                <tr>
                                    {['Mes', 'Cobrado', 'Recaudado', 'Egresos', 'Resultado', 'Recaudación'].map(head => (
                                        <th key={head} className="px-4 py-2 text-right font-semibold cc-text-secondary first:text-left">{head}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {report.months.map(month => (
                                    <tr key={month.month} className="border-t" style={{ borderColor: 'var(--cc-line)' }}>
                                        <td className="px-4 py-2 capitalize cc-text-primary">{monthLabel(month.month)}</td>
                                        <td className="px-4 py-2 text-right cc-text-primary">{money(month.charged.total)}</td>
                                        <td className="px-4 py-2 text-right cc-text-primary">{money(month.collected.total)}</td>
                                        <td className="px-4 py-2 text-right cc-text-primary">{money(month.expenses.total)}</td>
                                        <td className="px-4 py-2 text-right font-medium" style={{ color: month.result < 0 ? 'var(--cc-danger, #b3402d)' : 'var(--cc-ink)' }}>{money(month.result)}</td>
                                        <td className="px-4 py-2 text-right cc-text-secondary">{month.collectionRate}%</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                <section className="space-y-3">
                    <h2 className="text-lg font-semibold cc-text-primary">Egresos de {monthLabel(latest.month)} por categoría</h2>
                    {latest.expenses.byCategory.length === 0 ? (
                        <p className="text-sm cc-text-secondary">Sin egresos registrados ese mes.</p>
                    ) : (
                        <ul className="divide-y rounded-2xl border text-sm" style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper)' }}>
                            {latest.expenses.byCategory.map(item => (
                                <li key={item.category} className="flex justify-between px-4 py-2">
                                    <span className="cc-text-secondary">{item.category}</span>
                                    <span className="cc-text-primary">{money(item.total)}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <footer className="text-xs cc-text-tertiary">
                    Información generada por ComunidadConnect a partir de los registros de la administración. El libro contable es auxiliar
                    y no reemplaza los estados financieros revisados por un profesional.
                </footer>
            </div>
        </main>
    );
}
