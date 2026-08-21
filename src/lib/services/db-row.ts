/**
 * Lectura segura de filas crudas de Supabase.
 * Lo usan los mapeadores de mantenimiento y de casos CoCo.
 */

export type DbRow = Record<string, unknown>;

export function textValue(value: unknown, fallback = ""): string {
    return typeof value === "string" && value.trim() ? value : fallback;
}

export function nullableText(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value : null;
}
