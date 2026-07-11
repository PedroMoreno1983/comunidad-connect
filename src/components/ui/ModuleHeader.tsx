import type { ReactNode } from "react";

type ModuleHeaderProps = {
    eyebrow: string;
    title: string;
    description?: string;
    icon?: ReactNode;
    meta?: ReactNode;
    actions?: ReactNode;
};

export function ModuleHeader({ eyebrow, title, description, icon, meta, actions }: ModuleHeaderProps) {
    return (
        <header
            className="flex flex-col gap-5 pb-6 sm:flex-row sm:items-end sm:justify-between"
            style={{ borderBottom: "1px solid var(--cc-line)" }}
        >
            <div className="min-w-0">
                <div className="mb-3 flex items-center gap-3">
                    {icon && (
                        <div
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                            style={{ background: "var(--cc-copper-tint)", color: "var(--cc-copper)" }}
                        >
                            {icon}
                        </div>
                    )}
                    <div className="min-w-0">
                        <p className="text-[10px] font-medium uppercase tracking-[0.18em]" style={{ color: "var(--cc-ink-tertiary)" }}>{eyebrow}</p>
                        {meta && <div className="mt-1 text-xs cc-text-secondary">{meta}</div>}
                    </div>
                </div>
                <h1
                    className="text-[28px] leading-none sm:text-[34px]"
                    style={{ fontFamily: "var(--cc-font-display)", color: "var(--cc-ink)", letterSpacing: "-0.01em" }}
                >
                    {title}
                </h1>
                {description && <p className="mt-2.5 max-w-2xl text-sm leading-6 cc-text-secondary">{description}</p>}
            </div>
            {actions && <div className="flex shrink-0 flex-wrap items-center gap-2.5">{actions}</div>}
        </header>
    );
}

type ModuleStatProps = {
    label: string;
    value: string | number;
    icon?: ReactNode;
    active?: boolean;
    onClick?: () => void;
};

export function ModuleStat({ label, value, icon, active, onClick }: ModuleStatProps) {
    const Comp = onClick ? "button" : "div";

    return (
        <Comp
            onClick={onClick}
            className="flex min-h-[92px] items-center justify-between rounded-xl border p-4 text-left transition-colors"
            style={{
                borderColor: active ? "rgba(181,102,78,0.30)" : "var(--cc-line)",
                background: active ? "var(--cc-copper-tint)" : "var(--cc-paper)",
            }}
        >
            <div>
                <p className="text-2xl leading-none" style={{ fontFamily: "var(--cc-font-display)", color: "var(--cc-ink)" }}>{value}</p>
                <p className="mt-1.5 text-xs cc-text-secondary">{label}</p>
            </div>
            {icon && (
                <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: "var(--cc-paper-warm)", color: "var(--cc-ink-tertiary)" }}
                >
                    {icon}
                </div>
            )}
        </Comp>
    );
}
