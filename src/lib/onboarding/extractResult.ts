/**
 * Interpreta la respuesta del extractor de nómina.
 * Un HTTP 200 con data vacía o status=failed no es éxito: el lote debe
 * permanecer visible y el admin tiene que ver el error.
 */

export type RosterExtractRow = {
    id: string;
    name: string;
    unit_id: string;
    email: string;
    phone: string;
};

export type RosterExtractPayload = {
    status?: string;
    data?: unknown;
    error?: string;
    batchId?: string | null;
    documents?: Array<{ status?: string; error?: string; fileName?: string }>;
};

export type RosterExtractResult =
    | { ok: true; rows: RosterExtractRow[] }
    | { ok: false; message: string };

function asRow(value: unknown): RosterExtractRow | null {
    if (!value || typeof value !== "object") return null;
    const row = value as Record<string, unknown>;
    return {
        id: typeof row.id === "string" ? row.id : "",
        name: typeof row.name === "string" ? row.name : "",
        unit_id: typeof row.unit_id === "string" ? row.unit_id : "",
        email: typeof row.email === "string" ? row.email : "",
        phone: typeof row.phone === "string" ? row.phone : "",
    };
}

function firstDocumentError(payload: RosterExtractPayload): string | undefined {
    const failed = (payload.documents || []).filter(doc => doc.status === "failed");
    return failed.map(doc => doc.error).find((message): message is string => Boolean(message));
}

export function interpretRosterExtractResponse(
    payload: RosterExtractPayload,
    httpOk: boolean,
): RosterExtractResult {
    const documentError = firstDocumentError(payload);

    if (!httpOk) {
        return {
            ok: false,
            message: payload.error || documentError || "No se pudo procesar el lote.",
        };
    }

    if (!Array.isArray(payload.data)) {
        return {
            ok: false,
            message: payload.error || documentError || "No se pudo leer la nómina extraída.",
        };
    }

    const rows = payload.data.map(asRow).filter((row): row is RosterExtractRow => Boolean(row));

    if (payload.status === "failed" || rows.length === 0) {
        return {
            ok: false,
            message:
                payload.error
                || documentError
                || "No se encontraron columnas de nómina (nombre, unidad, correo o teléfono). Revisa el tipo de archivo e inténtalo de nuevo.",
        };
    }

    return { ok: true, rows };
}
