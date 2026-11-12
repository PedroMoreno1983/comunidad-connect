import type { CoCoThread } from '@/lib/types';

/**
 * Agrupa las conversaciones como lo hacen los chats conocidos: fijadas arriba y
 * el resto por antigüedad. Sin acceso a datos: se puede usar en cliente y tests.
 */

export interface CoCoThreadGroup {
    label: string;
    threads: CoCoThread[];
}

const DAY = 86_400_000;

function startOfDay(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function groupThreads(threads: CoCoThread[], query = '', now = new Date()): CoCoThreadGroup[] {
    const needle = query.trim().toLocaleLowerCase('es');
    const visible = threads.filter(thread => !needle || thread.title.toLocaleLowerCase('es').includes(needle));
    const today = startOfDay(now);
    const buckets: Array<{ label: string; test: (thread: CoCoThread) => boolean }> = [
        { label: 'Fijadas', test: thread => Boolean(thread.pinned) },
        { label: 'Hoy', test: thread => Date.parse(thread.updatedAt) >= today },
        { label: 'Ayer', test: thread => Date.parse(thread.updatedAt) >= today - DAY },
        { label: 'Últimos 7 días', test: thread => Date.parse(thread.updatedAt) >= today - 7 * DAY },
        { label: 'Últimos 30 días', test: thread => Date.parse(thread.updatedAt) >= today - 30 * DAY },
        { label: 'Anteriores', test: () => true },
    ];
    const used = new Set<string>();
    return buckets
        .map(bucket => {
            const items = visible
                .filter(thread => !used.has(thread.id) && bucket.test(thread))
                .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
            items.forEach(thread => used.add(thread.id));
            return { label: bucket.label, threads: items };
        })
        .filter(group => group.threads.length > 0);
}
