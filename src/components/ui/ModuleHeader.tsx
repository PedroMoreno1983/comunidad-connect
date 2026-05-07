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
        <header className="flex flex-col gap-5 border-b border-subtle pb-6 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
                <div className="mb-3 flex items-center gap-3">
                    {icon && (
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500 text-white shadow-sm">
                            {icon}
                        </div>
                    )}
                    <div className="min-w-0">
                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-600">{eyebrow}</p>
                        {meta && <div className="mt-1 text-xs font-medium cc-text-secondary">{meta}</div>}
                    </div>
                </div>
                <h1 className="text-2xl font-bold cc-text-primary md:text-3xl">{title}</h1>
                {description && <p className="mt-2 max-w-2xl text-sm leading-6 cc-text-secondary">{description}</p>}
            </div>
            {actions && <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div>}
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
            className={`flex min-h-[92px] items-center justify-between rounded-lg border bg-surface p-4 text-left shadow-sm transition-colors ${
                active ? "border-brand-300 bg-brand-50" : "border-subtle hover:border-default"
            }`}
        >
            <div>
                <p className="text-2xl font-semibold cc-text-primary">{value}</p>
                <p className="mt-1 text-xs font-semibold cc-text-secondary">{label}</p>
            </div>
            {icon && <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-elevated cc-text-secondary">{icon}</div>}
        </Comp>
    );
}
