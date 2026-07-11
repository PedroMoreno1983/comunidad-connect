import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle } from "lucide-react";

interface ModuleFlowProps {
    eyebrow?: string;
    title: string;
    description: string;
    steps: string[];
    outcome: string;
    currentStep?: number;
    completedSteps?: number;
    statusLabel?: string;
    primaryActionLabel?: string;
    primaryActionHref?: string;
    secondaryActionLabel?: string;
    secondaryActionHref?: string;
}

export function ModuleFlow({
    eyebrow = "Flujo operativo",
    title,
    description,
    steps,
    outcome,
    currentStep,
    completedSteps = 0,
    statusLabel,
    primaryActionLabel,
    primaryActionHref,
    secondaryActionLabel,
    secondaryActionHref,
}: ModuleFlowProps) {
    const activeStep = currentStep ?? Math.min(completedSteps + 1, steps.length);

    return (
        <section className="rounded-2xl border" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }} data-module-flow={title}>
            <div className="grid gap-0 lg:grid-cols-[280px_1fr]">
                <div className="p-5" style={{ borderBottom: "1px solid var(--cc-line)" }}>
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[10px] font-medium uppercase tracking-[0.14em]" style={{ color: "var(--cc-ink-tertiary)" }}>{eyebrow}</p>
                        {statusLabel && (
                            <span className="rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.1em] cc-text-secondary" style={{ background: "var(--cc-paper-warm)" }} data-module-flow-status>
                                {statusLabel}
                            </span>
                        )}
                    </div>
                    <h2 className="mt-2.5 text-lg leading-tight" style={{ fontFamily: "var(--cc-font-display)", color: "var(--cc-ink)" }}>{title}</h2>
                    <p className="mt-2 text-sm leading-6 cc-text-secondary">{description}</p>
                    {(primaryActionHref || secondaryActionHref) && (
                        <div className="mt-5 flex flex-col gap-2">
                            {primaryActionHref && primaryActionLabel && (
                                <Link
                                    href={primaryActionHref}
                                    className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
                                    style={{ background: "var(--cc-copper)" }}
                                >
                                    {primaryActionLabel}
                                    <ArrowRight className="h-4 w-4" />
                                </Link>
                            )}
                            {secondaryActionHref && secondaryActionLabel && (
                                <Link
                                    href={secondaryActionHref}
                                    className="inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium cc-text-primary transition-colors hover:bg-[var(--cc-paper-warm)]"
                                    style={{ borderColor: "var(--cc-line-strong)" }}
                                >
                                    {secondaryActionLabel}
                                </Link>
                            )}
                        </div>
                    )}
                </div>
                <div className="p-5">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {steps.map((step, index) => {
                            const stepNumber = index + 1;
                            const isFinalCurrent = completedSteps >= steps.length && stepNumber === steps.length;
                            const isDone = completedSteps >= stepNumber && !isFinalCurrent;
                            const isCurrent = isFinalCurrent || (!isDone && activeStep === stepNumber);
                            const cardStyle = isDone
                                ? { borderColor: "rgba(110,130,104,0.30)", background: "var(--cc-sage-tint)" }
                                : isCurrent
                                    ? { borderColor: "rgba(181,102,78,0.30)", background: "var(--cc-copper-tint)" }
                                    : { borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" };
                            const badgeStyle = isDone
                                ? { background: "var(--cc-sage)", color: "#fff" }
                                : isCurrent
                                    ? { background: "var(--cc-copper)", color: "#fff" }
                                    : { background: "var(--cc-paper)", color: "var(--cc-ink-tertiary)" };

                            return (
                                <div
                                    key={`${step}-${index}`}
                                    className="rounded-xl border p-4 transition-colors"
                                    style={cardStyle}
                                    data-module-flow-step={stepNumber}
                                    data-module-flow-step-state={isDone ? "done" : isCurrent ? "current" : "pending"}
                                >
                                    <div
                                        className="mb-3 flex h-7 w-7 items-center justify-center rounded-lg text-xs font-medium"
                                        style={badgeStyle}
                                    >
                                        {isDone ? <CheckCircle2 className="h-4 w-4" /> : isCurrent ? stepNumber : <Circle className="h-3.5 w-3.5" />}
                                    </div>
                                    <p className="text-sm font-medium leading-5 cc-text-primary">{step}</p>
                                    <p
                                        className="mt-2 text-[10px] font-medium uppercase tracking-[0.1em]"
                                        style={{ color: isDone ? "var(--cc-sage)" : isCurrent ? "var(--cc-copper)" : "var(--cc-ink-tertiary)" }}
                                    >
                                        {isDone ? "Completado" : isCurrent ? "Ahora" : "Pendiente"}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                    <div className="mt-4 flex items-start gap-3 rounded-xl border p-4" style={{ borderColor: "rgba(110,130,104,0.25)", background: "var(--cc-sage-tint)" }}>
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "var(--cc-sage)" }} />
                        <p className="text-sm font-medium leading-6" style={{ color: "var(--cc-sage)" }}>{outcome}</p>
                    </div>
                </div>
            </div>
        </section>
    );
}
