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
        <section className="rounded-lg border border-subtle bg-surface shadow-sm" data-module-flow={title}>
            <div className="grid gap-0 lg:grid-cols-[280px_1fr]">
                <div className="border-b border-subtle p-5 lg:border-b-0 lg:border-r">
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand-600">{eyebrow}</p>
                        {statusLabel && (
                            <span className="rounded-md bg-elevated px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] cc-text-secondary" data-module-flow-status>
                                {statusLabel}
                            </span>
                        )}
                    </div>
                    <h2 className="mt-2 text-lg font-semibold cc-text-primary">{title}</h2>
                    <p className="mt-2 text-sm leading-6 cc-text-secondary">{description}</p>
                    {(primaryActionHref || secondaryActionHref) && (
                        <div className="mt-5 flex flex-col gap-2">
                            {primaryActionHref && primaryActionLabel && (
                                <Link
                                    href={primaryActionHref}
                                    className="inline-flex items-center justify-center gap-2 rounded-md bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-600"
                                >
                                    {primaryActionLabel}
                                    <ArrowRight className="h-4 w-4" />
                                </Link>
                            )}
                            {secondaryActionHref && secondaryActionLabel && (
                                <Link
                                    href={secondaryActionHref}
                                    className="inline-flex items-center justify-center gap-2 rounded-md border border-subtle bg-surface px-4 py-2.5 text-sm font-semibold cc-text-primary transition-colors hover:bg-elevated"
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
                            const isDone = completedSteps >= stepNumber;
                            const isCurrent = !isDone && activeStep === stepNumber;

                            return (
                                <div
                                    key={`${step}-${index}`}
                                    className={`rounded-md border p-4 transition-colors ${
                                        isDone
                                            ? "border-success-border bg-success-bg"
                                            : isCurrent
                                                ? "border-brand-300 bg-brand-50"
                                                : "border-subtle bg-canvas"
                                    }`}
                                    data-module-flow-step={stepNumber}
                                    data-module-flow-step-state={isDone ? "done" : isCurrent ? "current" : "pending"}
                                >
                                    <div
                                        className={`mb-3 flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold ${
                                            isDone
                                                ? "bg-emerald-600 text-white"
                                                : isCurrent
                                                    ? "bg-brand-500 text-white"
                                                    : "bg-elevated cc-text-secondary"
                                        }`}
                                    >
                                        {isDone ? <CheckCircle2 className="h-4 w-4" /> : isCurrent ? stepNumber : <Circle className="h-3.5 w-3.5" />}
                                    </div>
                                    <p className="text-sm font-semibold leading-5 cc-text-primary">{step}</p>
                                    <p className={`mt-2 text-[10px] font-bold uppercase tracking-[0.1em] ${
                                        isDone ? "text-success-fg" : isCurrent ? "text-brand-700" : "cc-text-tertiary"
                                    }`}>
                                        {isDone ? "Completado" : isCurrent ? "Ahora" : "Pendiente"}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                    <div className="mt-4 flex items-start gap-3 rounded-md border border-success-border bg-success-bg p-4">
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success-fg" />
                        <p className="text-sm font-semibold leading-6 text-success-fg">{outcome}</p>
                    </div>
                </div>
            </div>
        </section>
    );
}
