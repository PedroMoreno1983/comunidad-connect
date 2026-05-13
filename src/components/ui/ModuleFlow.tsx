import { CheckCircle2 } from "lucide-react";

interface ModuleFlowProps {
    eyebrow?: string;
    title: string;
    description: string;
    steps: string[];
    outcome: string;
}

export function ModuleFlow({ eyebrow = "Flujo operativo", title, description, steps, outcome }: ModuleFlowProps) {
    return (
        <section className="rounded-lg border border-subtle bg-surface shadow-sm">
            <div className="grid gap-0 lg:grid-cols-[280px_1fr]">
                <div className="border-b border-subtle p-5 lg:border-b-0 lg:border-r">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand-600">{eyebrow}</p>
                    <h2 className="mt-2 text-lg font-semibold cc-text-primary">{title}</h2>
                    <p className="mt-2 text-sm leading-6 cc-text-secondary">{description}</p>
                </div>
                <div className="p-5">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {steps.map((step, index) => (
                            <div key={`${step}-${index}`} className="rounded-md border border-subtle bg-canvas p-4">
                                <div className="mb-3 flex h-7 w-7 items-center justify-center rounded-md bg-brand-50 text-xs font-bold text-brand-700">
                                    {index + 1}
                                </div>
                                <p className="text-sm font-semibold leading-5 cc-text-primary">{step}</p>
                            </div>
                        ))}
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
