"use client";

import { useEffect, useState } from "react";
import { ResidentFinanceService } from "@/lib/api";
import type { PaymentAgreement } from "@/lib/types";

const money = (value: number) => `$${Math.round(value).toLocaleString("es-CL")}`;

const STATUS_LABEL: Record<PaymentAgreement["status"], string> = {
    active: "Vigente",
    completed: "Cumplido",
    cancelled: "Cerrado",
};

export function PaymentAgreementCard() {
    const [agreements, setAgreements] = useState<PaymentAgreement[]>([]);

    useEffect(() => {
        let cancelled = false;
        ResidentFinanceService.getAgreements()
            .then(rows => { if (!cancelled) setAgreements(rows); })
            .catch(() => { if (!cancelled) setAgreements([]); });
        return () => { cancelled = true; };
    }, []);

    const visible = agreements.filter(agreement => agreement.status !== "cancelled");
    if (!visible.length) return null;

    return (
        <section className="mb-6 rounded-2xl border p-4" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
            <p className="text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--cc-ink-tertiary)" }}>
                Convenio de pago
            </p>
            <div className="mt-3 space-y-4">
                {visible.map(agreement => {
                    const next = agreement.installments.find(item => item.status === "pending");
                    return (
                        <article key={agreement.id}>
                            <p className="font-semibold cc-text-primary">{agreement.title}</p>
                            <p className="mt-1 text-sm cc-text-secondary">
                                {STATUS_LABEL[agreement.status]} · {money(agreement.paidAmount)} de {money(agreement.totalAmount)}
                            </p>
                            {next && (
                                <p className="mt-1 text-sm cc-text-secondary">
                                    Próxima cuota {next.sequence}: {money(next.amount)} el {next.dueDate}. La administración la registra cuando recibe el pago.
                                </p>
                            )}
                        </article>
                    );
                })}
            </div>
        </section>
    );
}
