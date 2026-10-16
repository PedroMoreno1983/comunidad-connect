import { CocoCase } from '../types';

export async function readApi<T>(url: string, fallback: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, { cache: 'no-store', ...init });
    const data = await response.json().catch(() => ({})) as T & { error?: string };
    if (!response.ok) {
        throw new Error(typeof data.error === 'string' && data.error ? data.error : fallback);
    }
    return data;
}

export function financeWrite(body: object) {
    return {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    } satisfies RequestInit;
}

export function isUuid(value?: string | null) {
    return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value));
}

export type DbRow = Record<string, unknown>;

export function textValue(value: unknown, fallback = ""): string {
    return typeof value === "string" && value.trim() ? value : fallback;
}

export function nullableText(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value : null;
}

export function mapCocoCase(row: DbRow): CocoCase {
    return {
        id: textValue(row.id),
        title: textValue(row.title, "Caso operativo"),
        type: nullableText(row.type),
        category: textValue(row.category, "general"),
        urgency: (textValue(row.urgency, "media") as CocoCase["urgency"]),
        action: nullableText(row.action),
        status: (textValue(row.status, "open") as CocoCase["status"]),
        reason: nullableText(row.reason),
        source_message: textValue(row.source_message),
        assistant_reply: nullableText(row.assistant_reply),
        unit_label: nullableText(row.unit_label),
        created_at: textValue(row.created_at, new Date().toISOString()),
        updated_at: typeof row.updated_at === "string" ? row.updated_at : undefined,
    };
}
