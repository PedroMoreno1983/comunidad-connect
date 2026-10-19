"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarCheck, CalendarDays, HandCoins, MessageCircle, Receipt, Users } from "lucide-react";
import { ResidentFinanceService } from "@/lib/api";
import { useProductCapabilities } from "@/hooks/useProductCapabilities";
import { Eyebrow } from "@/components/cc/Eyebrow";
import { chileDateOfInstant } from "@/lib/home/nextUp";
import {
    bookingCopy,
    chargeCopy,
    eventCopy,
    formatMoney,
    installmentCopy,
} from "@/lib/home/nextUpCopy";
import type { NextUpCardProps, NextUpRowProps } from "@/lib/home/types";

/**
 * "Lo próximo a la vista": lo que viene para el residente apenas abre su inicio.
 * Tono de comunidad: el monto de su propia cuenta sí, lenguaje de deudor no, y
 * siempre una salida (pagar en línea, conversar o pedir un convenio).
 */
export function NextUpCard({ nextUp, today }: NextUpCardProps) {
    const capabilities = useProductCapabilities();
    const [requestState, setRequestState] = useState<"idle" | "sending" | "sent" | "error">("idle");
    const [requestMessage, setRequestMessage] = useState("");

    const charge = chargeCopy(nextUp.charge, today);
    const hasOpenCharge = nextUp.charge.state !== "clear";
    const canRequestAgreement = nextUp.charge.state === "open" && !nextUp.hasAgreement;
    const payLabel = capabilities.onlinePayments ? "Pagar en línea" : "Ver cómo pagar";

    const requestAgreement = async () => {
        setRequestState("sending");
        try {
            const result = await ResidentFinanceService.requestAgreementConversation();
            setRequestMessage(result.message);
            setRequestState("sent");
        } catch (error) {
            setRequestMessage(error instanceof Error ? error.message : "No pudimos enviar tu solicitud. Vuelve a intentarlo en un momento.");
            setRequestState("error");
        }
    };

    return (
        <section
            aria-labelledby="next-up-title"
            className="mt-5 border bg-paper p-5 sm:p-6"
            style={{ borderColor: "var(--cc-line)", borderRadius: 22, color: "var(--cc-ink)" }}
        >
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                    <Eyebrow className="mb-1">Lo próximo a la vista</Eyebrow>
                    <h2 id="next-up-title" className="text-[18px] font-semibold tracking-[-0.01em]" style={{ color: "var(--cc-ink)" }}>
                        Lo que viene para ti y tu comunidad
                    </h2>
                </div>
            </div>

            <div className="divide-y divide-[var(--cc-line)]">
                {/* Próximo vencimiento */}
                <div className="pb-4">
                    <NextUpRow
                        icon={<Receipt size={17} />}
                        eyebrow="Tu cuenta"
                        title={charge.title}
                        detail={charge.detail}
                        amount={charge.amount}
                        note={charge.note}
                        href="/expenses"
                        linkLabel={hasOpenCharge ? "" : "Ver mi cuenta"}
                    />
                    {hasOpenCharge && (
                        <div className="mt-3 flex flex-wrap gap-2 pl-[52px]">
                            <Link
                                href="/expenses"
                                className="inline-flex items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-[12px] font-semibold"
                                style={{ background: "var(--cc-copper)", color: "#fff" }}
                            >
                                {payLabel} <ArrowRight size={14} />
                            </Link>
                            <Link
                                href="/chat"
                                className="inline-flex items-center gap-1.5 rounded-[10px] border px-3.5 py-2 text-[12px] font-semibold"
                                style={{ borderColor: "var(--cc-line-strong)", color: "var(--cc-ink)" }}
                            >
                                <MessageCircle size={14} /> Conversar
                            </Link>
                            {canRequestAgreement && requestState !== "sent" && (
                                <button
                                    type="button"
                                    onClick={requestAgreement}
                                    disabled={requestState === "sending"}
                                    className="inline-flex items-center gap-1.5 rounded-[10px] border px-3.5 py-2 text-[12px] font-semibold disabled:opacity-60"
                                    style={{ borderColor: "var(--cc-line-strong)", color: "var(--cc-ink)", background: "transparent" }}
                                >
                                    <HandCoins size={14} /> {requestState === "sending" ? "Enviando…" : "Pedir un convenio"}
                                </button>
                            )}
                        </div>
                    )}
                    {requestMessage && (
                        <p
                            role={requestState === "error" ? "alert" : "status"}
                            className="mt-2 pl-[52px] text-[12px] leading-5"
                            style={{ color: requestState === "error" ? "var(--cc-rose)" : "var(--cc-ink-muted)" }}
                        >
                            {requestMessage}
                        </p>
                    )}
                </div>

                {nextUp.installment && (() => {
                    const copy = installmentCopy(nextUp.installment, today);
                    return (
                        <div className="py-4">
                            <NextUpRow
                                icon={<HandCoins size={17} />}
                                eyebrow="Tu convenio"
                                title={copy.title}
                                detail={copy.detail}
                                amount={copy.amount}
                                href="/expenses"
                                linkLabel="Ver convenio"
                            />
                        </div>
                    );
                })()}

                {nextUp.booking && (() => {
                    const copy = bookingCopy(nextUp.booking, today);
                    return (
                        <div className="py-4">
                            <NextUpRow
                                icon={<CalendarCheck size={17} />}
                                eyebrow="Tu próxima reserva"
                                title={copy.title}
                                detail={copy.detail}
                                amount={null}
                                note={copy.note}
                                href="/amenities"
                                linkLabel="Ver reservas"
                            />
                        </div>
                    );
                })()}

                {nextUp.event && (() => {
                    const copy = eventCopy(nextUp.event, today, chileDateOfInstant(nextUp.event.scheduledAt));
                    return (
                        <div className="py-4">
                            <NextUpRow
                                icon={<Users size={17} />}
                                eyebrow={nextUp.event.inProgress ? "Ahora en tu comunidad" : "Próximo encuentro"}
                                title={copy.title}
                                detail={copy.detail}
                                amount={null}
                                href="/votaciones/asambleas"
                                linkLabel={nextUp.event.inProgress ? "Entrar" : "Ver citación"}
                            />
                        </div>
                    );
                })()}

                {!nextUp.booking && !nextUp.event && (
                    <div className="pt-4">
                        <NextUpRow
                            icon={<CalendarDays size={17} />}
                            eyebrow="Tu agenda"
                            title="Sin reservas ni encuentros por ahora"
                            detail="¿Un asado, una junta o un rato en la piscina? Reserva un espacio y aprovecha tu comunidad."
                            amount={null}
                            href="/amenities"
                            linkLabel="Reservar"
                        />
                    </div>
                )}
            </div>
        </section>
    );
}

function NextUpRow({ icon, eyebrow, title, detail, amount, note, href, linkLabel }: NextUpRowProps) {
    return (
        <div className="flex items-start gap-3">
            <div
                className="grid shrink-0 place-items-center"
                style={{ width: 40, height: 40, borderRadius: 12, background: "var(--cc-copper-tint)", color: "var(--cc-copper)" }}
            >
                {icon}
            </div>
            <div className="min-w-0 flex-1">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--cc-ink-tertiary)" }}>{eyebrow}</div>
                <div className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <div className="text-[15px] font-semibold leading-snug" style={{ color: "var(--cc-ink)" }}>{title}</div>
                    {amount !== null && amount > 0 && (
                        <div className="font-mono text-[15px] font-semibold" style={{ color: "var(--cc-ink)" }}>{formatMoney(amount)}</div>
                    )}
                </div>
                <p className="mt-1 text-[13px] leading-5" style={{ color: "var(--cc-ink-muted)" }}>{detail}</p>
                {note && <p className="mt-1 text-[12px] leading-5" style={{ color: "var(--cc-ink-tertiary)" }}>{note}</p>}
                {linkLabel && (
                    <Link href={href} className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold" style={{ color: "var(--cc-copper)" }}>
                        {linkLabel} <ArrowRight size={13} />
                    </Link>
                )}
            </div>
        </div>
    );
}
