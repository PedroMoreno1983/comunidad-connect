"use client";

import { motion } from "framer-motion";

// ==========================================
// Skeleton Loader
// ==========================================
export function Skeleton({
    className = "",
    width,
    height,
}: {
    className?: string;
    width?: string | number;
    height?: string | number;
}) {
    return (
        <div
            className={`animate-pulse rounded-xl bg-elevated ${className}`}
            style={{ width, height }}
        />
    );
}

// Card Skeleton
export function CardSkeleton({ lines = 3 }: { lines?: number }) {
    return (
        <div className="p-5 rounded-lg border border-subtle bg-surface space-y-4">
            <div className="flex items-center gap-3">
                <Skeleton className="w-12 h-12 rounded-xl" />
                <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                </div>
            </div>
            {Array.from({ length: lines }).map((_, i) => (
                <Skeleton key={i} className="h-3" width={`${90 - i * 15}%`} />
            ))}
        </div>
    );
}

// Stats Skeleton
export function StatsSkeleton({ count = 4 }: { count?: number }) {
    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: count }).map((_, i) => (
                <div
                    key={i}
                    className="p-5 rounded-2xl border border-subtle bg-surface"
                >
                    <Skeleton className="h-4 w-20 mb-3" />
                    <Skeleton className="h-8 w-24 mb-2" />
                    <Skeleton className="h-3 w-16" />
                </div>
            ))}
        </div>
    );
}

// Table Skeleton
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
    return (
        <div className="rounded-2xl border border-subtle bg-surface overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-subtle flex gap-4">
                {Array.from({ length: cols }).map((_, i) => (
                    <Skeleton key={i} className="h-4 flex-1" />
                ))}
            </div>
            {/* Rows */}
            {Array.from({ length: rows }).map((_, r) => (
                <div key={r} className="p-4 border-b border-subtle flex gap-4">
                    {Array.from({ length: cols }).map((_, c) => (
                        <Skeleton key={c} className="h-4 flex-1" />
                    ))}
                </div>
            ))}
        </div>
    );
}

// ==========================================
// Empty State
// ==========================================
export function EmptyState({
    icon: Icon,
    title,
    description,
    action,
    actionLabel,
}: {
    icon?: React.ComponentType<{ className?: string }>;
    title: string;
    description: string;
    action?: () => void;
    actionLabel?: string;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center rounded-lg border border-dashed border-subtle bg-surface py-14 px-8 text-center"
        >
            {Icon && (
                <div className="w-12 h-12 rounded-lg bg-elevated flex items-center justify-center mb-5">
                    <Icon className="w-6 h-6 cc-text-tertiary" />
                </div>
            )}
            <h3 className="text-xl font-bold cc-text-primary mb-2">{title}</h3>
            <p className="cc-text-secondary max-w-md mb-6">{description}</p>
            {action && actionLabel && (
                <button
                    onClick={action}
                    className="px-5 py-2.5 text-white font-semibold rounded-md transition-colors"
                    style={{ backgroundColor: 'var(--cc-brand-500)' }}
                >
                    {actionLabel}
                </button>
            )}
        </motion.div>
    );
}

// ==========================================
// Status Badge
// ==========================================
export function StatusBadge({
    status,
    size = "md",
}: {
    status: string;
    size?: "sm" | "md" | "lg";
}) {
    const configs: Record<string, { bg: string; text: string; dot: string; label: string }> = {
        active: { bg: "bg-success-bg", text: "text-success-fg", dot: "bg-emerald-500", label: "Activo" },
        paid: { bg: "bg-success-bg", text: "text-success-fg", dot: "bg-emerald-500", label: "Pagado" },
        confirmed: { bg: "bg-success-bg", text: "text-success-fg", dot: "bg-emerald-500", label: "Confirmado" },
        completed: { bg: "bg-success-bg", text: "text-success-fg", dot: "bg-emerald-500", label: "Completado" },
        pending: { bg: "bg-warning-bg", text: "text-warning-fg", dot: "bg-amber-500", label: "Pendiente" },
        overdue: { bg: "bg-danger-bg", text: "text-danger-fg", dot: "bg-red-500", label: "Vencido" },
        cancelled: { bg: "bg-slate-100 dark:bg-slate-500/10", text: "cc-text-secondary", dot: "bg-slate-400", label: "Cancelado" },
        expired: { bg: "bg-slate-100 dark:bg-slate-500/10", text: "cc-text-secondary", dot: "bg-slate-400", label: "Expirado" },
        used: { bg: "bg-blue-50 dark:bg-blue-500/10", text: "text-blue-700 dark:text-blue-400", dot: "bg-blue-500", label: "Utilizado" },
        "in-progress": { bg: "bg-blue-50 dark:bg-blue-500/10", text: "text-blue-700 dark:text-blue-400", dot: "bg-blue-500", label: "En Progreso" },
        closed: { bg: "bg-slate-100 dark:bg-slate-500/10", text: "cc-text-secondary", dot: "bg-slate-400", label: "Cerrada" },
        available: { bg: "bg-success-bg", text: "text-success-fg", dot: "bg-emerald-500", label: "Disponible" },
        sold: { bg: "bg-brand-50 dark:bg-purple-500/10", text: "text-brand-700 dark:text-brand-400", dot: "bg-brand-500", label: "Vendido" },
        reserved: { bg: "bg-blue-50 dark:bg-blue-500/10", text: "text-blue-700 dark:text-blue-400", dot: "bg-blue-500", label: "Reservado" },
    };

    const config = configs[status] || configs.pending;
    const sizeClasses = {
        sm: "px-2 py-0.5 text-xs",
        md: "px-3 py-1 text-xs",
        lg: "px-4 py-1.5 text-sm",
    };

    return (
        <span className={`inline-flex items-center gap-1.5 rounded-md font-semibold ${config.bg} ${config.text} ${sizeClasses[size]}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
            {config.label}
        </span>
    );
}

// ==========================================
// Page Header
// ==========================================
export function PageHeader({
    title,
    description,
    icon: Icon,
    action,
}: {
    title: string;
    description?: string;
    icon?: React.ComponentType<{ className?: string }>;
    gradient?: string;
    action?: React.ReactNode;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8"
        >
            <div className="flex items-center gap-4">
                {Icon && (
                    <div className="w-10 h-10 rounded-lg border border-brand-200 bg-brand-50 text-brand-600 flex items-center justify-center">
                        <Icon className="w-5 h-5" />
                    </div>
                )}
                <div>
                    <h1 className="text-2xl lg:text-3xl font-bold cc-text-primary">{title}</h1>
                    {description && (
                        <p className="cc-text-secondary font-medium mt-1">{description}</p>
                    )}
                </div>
            </div>
            {action && <div className="flex items-center gap-3">{action}</div>}
        </motion.div>
    );
}

// ==========================================
// Stat Card
// ==========================================
export function StatCard({
    title,
    value,
    subtitle,
    icon: Icon,
    trend,
    trendValue,
}: {
    title: string;
    value: string | number;
    subtitle?: string;
    icon?: React.ComponentType<{ className?: string }>;
    trend?: "up" | "down" | "neutral";
    trendValue?: string;
    gradient?: string;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="group relative p-5 rounded-lg bg-surface border border-subtle shadow-sm transition-colors overflow-hidden"
        >
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-xs font-semibold cc-text-secondary uppercase tracking-[0.08em]">{title}</p>
                    <p className="text-2xl font-semibold cc-text-primary mt-2">{value}</p>
                    {subtitle && (
                        <div className="flex items-center gap-2 mt-2">
                            {trend && (
                                <span className={`text-xs font-bold ${trend === "up" ? "text-emerald-500" : trend === "down" ? "text-red-500" : "text-slate-400"}`}>
                                    {trend === "up" ? "↑" : trend === "down" ? "↓" : "→"} {trendValue}
                                </span>
                            )}
                            <span className="text-xs cc-text-tertiary">{subtitle}</span>
                        </div>
                    )}
                </div>
                {Icon && (
                    <div className="w-10 h-10 rounded-lg border border-subtle bg-elevated flex items-center justify-center cc-text-secondary">
                        <Icon className="w-5 h-5" />
                    </div>
                )}
            </div>
        </motion.div>
    );
}
