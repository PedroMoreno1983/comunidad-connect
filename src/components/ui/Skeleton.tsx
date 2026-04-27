// Reusable Skeleton Loader Components
import clsx from 'clsx';

interface SkeletonProps {
    className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
    return (
        <div
            className={clsx(
                "animate-pulse bg-elevated rounded-xl",
                className
            )}
        />
    );
}

export function SkeletonCard({ className }: SkeletonProps) {
    return (
        <div className={clsx("bg-surface rounded-[2.5rem] border border-subtle p-6 space-y-4", className)}>
            <div className="flex items-center gap-3">
                <Skeleton className="w-12 h-12 rounded-full" />
                <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-20" />
                </div>
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
            <div className="flex gap-4 pt-2">
                <Skeleton className="h-8 w-20 rounded-full" />
                <Skeleton className="h-8 w-20 rounded-full" />
            </div>
        </div>
    );
}

export function SkeletonStats() {
    return (
        <div className="grid grid-cols-3 gap-4">
            {[0, 1, 2].map(i => (
                <div key={i} className="bg-surface rounded-2xl p-5 border border-subtle">
                    <Skeleton className="h-10 w-10 rounded-xl mb-3" />
                    <Skeleton className="h-6 w-12 mb-1" />
                    <Skeleton className="h-3 w-20" />
                </div>
            ))}
        </div>
    );
}

export function SkeletonList({ rows = 3, count }: { rows?: number; count?: number }) {
    const n = count ?? rows;
    return (
        <div className="space-y-3">
            {Array.from({ length: n }).map((_, i) => (
                <div key={i} className="bg-surface rounded-2xl p-4 border border-subtle flex items-center gap-4">
                    <Skeleton className="w-10 h-10 rounded-xl flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                        <Skeleton className="h-3 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                    </div>
                    <Skeleton className="h-8 w-16 rounded-xl" />
                </div>
            ))}
        </div>
    );
}

export function SkeletonTable({ rows = 3 }: { rows?: number }) {
    return (
        <div className="w-full">
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-subtle">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-6 w-20 rounded-full" />
                    <Skeleton className="h-8 w-28 rounded-xl ml-auto" />
                </div>
            ))}
        </div>
    );
}

export function SkeletonAnnouncement({ count = 3 }: { count?: number }) {
    return (
        <div className="space-y-4">
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="bg-surface rounded-2xl border border-subtle p-5 space-y-3">
                    <div className="flex items-center gap-3">
                        <Skeleton className="w-10 h-10 rounded-xl flex-shrink-0" />
                        <div className="flex-1 space-y-2">
                            <Skeleton className="h-4 w-48" />
                            <Skeleton className="h-3 w-32" />
                        </div>
                        <Skeleton className="h-6 w-20 rounded-full" />
                    </div>
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-4/5" />
                </div>
            ))}
        </div>
    );
}
