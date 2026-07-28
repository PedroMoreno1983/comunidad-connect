"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

interface Certificate {
    community: { name: string; address: string | null };
    unit: { label: string; ownerName: string | null };
    issuedAt: string;
    issuedBy: string | null;
    balance: number;
    overdueAmount: number;
    oldestOverdueMonth: string | null;
    pendingByMonth: Array<{ month: string; concepts: Array<{ label: string; amount: number }>; total: number }>;
    isUpToDate: boolean;
}

const money = (value: number) => `$${Math.round(value).toLocaleString("es-CL")}`;

function formatLongDate(iso: string) {
    const [year, month, day] = iso.split("-").map(Number);
    const months = [
        "enero", "febrero", "marzo", "abril", "mayo", "junio",
        "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
    ];
    return `${day} de ${months[month - 1]} de ${year}`;
}

function CertificateContent() {
    const params = useSearchParams();
    const unitId = params.get("unitId") || "";
    const [certificate, setCertificate] = useState<Certificate | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const query = unitId ? `?unitId=${encodeURIComponent(unitId)}` : "";
            const response = await fetch(`/api/admin/debt-certificate${query}`, { cache: "no-store" });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "No se pudo generar el certificado.");
            setCertificate(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Error inesperado.");
        }
    }, [unitId]);

    useEffect(() => { void load(); }, [load]);

    if (error) {
        return (
            <div className="mx-auto max-w-2xl p-8 text-center">
                <p className="text-sm text-danger-fg">{error}</p>
                <Link href="/admin/finanzas/cobranza" className="mt-4 inline-block text-sm underline cc-text-secondary">
                    Volver a Cobranza
                </Link>
            </div>
        );
    }

    if (!certificate) {
        return <p className="p-10 text-center text-sm cc-text-secondary">Generando certificado…</p>;
    }

    return (
        <div className="mx-auto max-w-3xl p-4 sm:p-8">
            {/* La barra de acciones no debe salir en el papel. */}
            <div className="mb-6 flex items-center justify-between print:hidden">
                <Link href="/admin/finanzas/cobranza" className="inline-flex items-center gap-2 text-sm cc-text-tertiary hover:underline">
                    <ArrowLeft className="h-4 w-4" /> Volver a Cobranza
                </Link>
                <Button type="button" onClick={() => window.print()} className="text-white" style={{ background: "var(--cc-ink)" }}>
                    <Printer className="mr-2 h-4 w-4" /> Imprimir o guardar como PDF
                </Button>
            </div>

            <article
                className="rounded-2xl border p-8 print:rounded-none print:border-0 print:p-0"
                style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}
            >
                <header className="border-b pb-6 text-center" style={{ borderColor: "var(--cc-line)" }}>
                    <h1 className="text-xl font-bold uppercase tracking-wide cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>
                        {certificate.isUpToDate ? "Certificado de no adeudar gastos comunes" : "Certificado de deuda de gastos comunes"}
                    </h1>
                    <p className="mt-2 text-sm cc-text-secondary">{certificate.community.name}</p>
                    {certificate.community.address && (
                        <p className="text-xs cc-text-tertiary">{certificate.community.address}</p>
                    )}
                </header>

                <section className="mt-6 space-y-1 text-sm">
                    <p className="cc-text-primary"><strong>Unidad:</strong> {certificate.unit.label}</p>
                    {certificate.unit.ownerName && (
                        <p className="cc-text-primary"><strong>Propietario:</strong> {certificate.unit.ownerName}</p>
                    )}
                    <p className="cc-text-primary"><strong>Fecha de emisión:</strong> {formatLongDate(certificate.issuedAt)}</p>
                </section>

                <section className="mt-6 text-sm leading-7 cc-text-primary">
                    {certificate.isUpToDate ? (
                        <p>
                            La administración de <strong>{certificate.community.name}</strong> certifica que la unidad{" "}
                            <strong>{certificate.unit.label}</strong> se encuentra <strong>al día</strong> en el pago de sus
                            gastos comunes a la fecha de emisión de este documento
                            {certificate.balance < 0 && (
                                <>, registrando además un saldo a favor de <strong>{money(-certificate.balance)}</strong></>
                            )}.
                        </p>
                    ) : (
                        <p>
                            La administración de <strong>{certificate.community.name}</strong> certifica que la unidad{" "}
                            <strong>{certificate.unit.label}</strong> registra a la fecha una deuda por concepto de gastos
                            comunes y cargos asociados por un total de <strong>{money(certificate.balance)}</strong>
                            {certificate.overdueAmount > 0 && (
                                <>, de los cuales <strong>{money(certificate.overdueAmount)}</strong> se encuentran vencidos
                                {certificate.oldestOverdueMonth && <> desde el periodo <strong>{certificate.oldestOverdueMonth}</strong></>}</>
                            )}.
                        </p>
                    )}
                </section>

                {certificate.pendingByMonth.length > 0 && (
                    <section className="mt-6">
                        <h2 className="mb-3 text-sm font-semibold cc-text-primary">Detalle de la deuda por periodo</h2>
                        <table className="w-full border-collapse text-sm">
                            <thead>
                                <tr style={{ background: "var(--cc-paper-warm)" }}>
                                    <th className="border px-3 py-2 text-left font-semibold cc-text-secondary" style={{ borderColor: "var(--cc-line)" }}>Periodo</th>
                                    <th className="border px-3 py-2 text-left font-semibold cc-text-secondary" style={{ borderColor: "var(--cc-line)" }}>Concepto</th>
                                    <th className="border px-3 py-2 text-right font-semibold cc-text-secondary" style={{ borderColor: "var(--cc-line)" }}>Monto</th>
                                </tr>
                            </thead>
                            <tbody>
                                {certificate.pendingByMonth.flatMap(period =>
                                    period.concepts.map((concept, index) => (
                                        <tr key={`${period.month}-${concept.label}-${index}`}>
                                            {index === 0 && (
                                                <td className="border px-3 py-2 align-top cc-text-primary" rowSpan={period.concepts.length} style={{ borderColor: "var(--cc-line)" }}>
                                                    {period.month}
                                                </td>
                                            )}
                                            <td className="border px-3 py-2 cc-text-primary" style={{ borderColor: "var(--cc-line)" }}>{concept.label}</td>
                                            <td className="border px-3 py-2 text-right cc-text-primary" style={{ borderColor: "var(--cc-line)" }}>{money(concept.amount)}</td>
                                        </tr>
                                    )),
                                )}
                                <tr style={{ background: "var(--cc-paper-warm)" }}>
                                    <td className="border px-3 py-2 font-semibold cc-text-primary" colSpan={2} style={{ borderColor: "var(--cc-line)" }}>Total adeudado</td>
                                    <td className="border px-3 py-2 text-right font-bold cc-text-primary" style={{ borderColor: "var(--cc-line)" }}>{money(certificate.balance)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </section>
                )}

                <footer className="mt-10 border-t pt-6 text-xs leading-5 cc-text-tertiary" style={{ borderColor: "var(--cc-line)" }}>
                    <div className="mb-8 mt-6 text-center">
                        <div className="mx-auto w-64 border-t" style={{ borderColor: "var(--cc-line)" }} />
                        <p className="mt-2 text-sm cc-text-primary">{certificate.issuedBy || "Administración"}</p>
                        <p className="text-xs cc-text-tertiary">Administración · {certificate.community.name}</p>
                    </div>
                    <p>
                        Documento emitido el {formatLongDate(certificate.issuedAt)} a partir de los registros contables de la
                        comunidad. Su validez está sujeta a los pagos registrados hasta esa fecha; pagos posteriores no se
                        encuentran reflejados.
                    </p>
                </footer>
            </article>
        </div>
    );
}

export default function CertificadoPage() {
    return (
        <ErrorBoundary name="Certificado de deuda">
            <Suspense fallback={<p className="p-10 text-center text-sm cc-text-secondary">Cargando…</p>}>
                <CertificateContent />
            </Suspense>
        </ErrorBoundary>
    );
}
