import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { isSecretBoxConfigured, openSecret, sealSecret } from '@/lib/security/secretBox';
import { normalizeRut } from '@/lib/utils/rut';
import { buildDte, TaxDocumentError } from './taxDocumentBuilder';
import type {
    InvoicingEmitter,
    InvoicingSettingsView,
    TaxDocument,
    TaxDocumentDraft,
    TaxDocumentItem,
    TaxDocumentReceiver,
    TaxDocumentType,
} from '@/lib/types';

const HOSTS = { test: 'https://dev-api.haulmer.com', production: 'https://api.haulmer.com' } as const;
const PDF_BUCKET = 'finance-documents';
type Environment = keyof typeof HOSTS;

export class InvoicingError extends Error {
    constructor(message: string, public status = 400) {
        super(message);
    }
}

const DOCUMENT_COLUMNS = 'id, environment, dte_type, status, folio, receiver, items, net_amount, exempt_amount, tax_amount, total_amount, issue_date, pdf_path, warnings, error, created_at';

function toDocument(row: Record<string, unknown>): TaxDocument {
    return {
        id: String(row.id),
        environment: row.environment as Environment,
        type: Number(row.dte_type) as TaxDocumentType,
        status: row.status as TaxDocument['status'],
        folio: row.folio === null ? null : Number(row.folio),
        receiver: row.receiver as TaxDocumentReceiver,
        items: row.items as TaxDocumentItem[],
        totals: {
            net: Number(row.net_amount),
            exempt: Number(row.exempt_amount),
            tax: Number(row.tax_amount),
            total: Number(row.total_amount),
        },
        issueDate: String(row.issue_date),
        hasPdf: Boolean(row.pdf_path),
        warnings: Array.isArray(row.warnings) ? row.warnings as string[] : [],
        error: (row.error as string | null) ?? null,
        createdAt: String(row.created_at),
    };
}

export async function getInvoicingSettings(communityId: string): Promise<InvoicingSettingsView> {
    const { data, error } = await getSupabaseAdmin()
        .from('invoicing_settings').select('environment, emitter, api_key_hint').eq('community_id', communityId).maybeSingle();
    if (error) throw error;
    return {
        configured: Boolean(data),
        environment: (data?.environment as Environment) ?? 'test',
        emitter: (data?.emitter as InvoicingEmitter) ?? null,
        apiKeyHint: (data?.api_key_hint as string) ?? null,
        encryptionReady: isSecretBoxConfigured(),
    };
}

export async function saveInvoicingSettings(
    communityId: string,
    actorId: string,
    input: { environment: string; apiKey?: string; emitter: InvoicingEmitter },
) {
    const environment: Environment = input.environment === 'production' ? 'production' : 'test';
    const emitter: InvoicingEmitter = {
        rut: normalizeRut(input.emitter.rut || '') || '',
        businessName: (input.emitter.businessName || '').trim().slice(0, 100),
        activity: (input.emitter.activity || '').trim().slice(0, 80),
        activityCode: (input.emitter.activityCode || '').replace(/\D/g, '').slice(0, 6),
        address: (input.emitter.address || '').trim().slice(0, 70),
        commune: (input.emitter.commune || '').trim().slice(0, 20),
        ...(input.emitter.branchCode?.trim() ? { branchCode: input.emitter.branchCode.replace(/\D/g, '').slice(0, 9) } : {}),
    };
    if (!emitter.rut) throw new InvoicingError('El RUT del emisor no es válido.');
    if (!emitter.businessName || !emitter.activity || !emitter.address || !emitter.commune) {
        throw new InvoicingError('Completa razón social, giro, dirección y comuna del emisor.');
    }
    if (emitter.activityCode.length !== 6) throw new InvoicingError('El código de actividad del SII tiene 6 dígitos.');

    const apiKey = input.apiKey?.trim();
    const admin = getSupabaseAdmin();
    const { data: current } = await admin.from('invoicing_settings').select('community_id').eq('community_id', communityId).maybeSingle();
    if (!apiKey && !current) throw new InvoicingError('Ingresa la API key de OpenFactura.');
    if (apiKey && !/^[A-Za-z0-9]{16,128}$/.test(apiKey)) throw new InvoicingError('La API key de OpenFactura no tiene el formato esperado.');

    const payload = {
        community_id: communityId,
        environment,
        emitter,
        updated_by: actorId,
        updated_at: new Date().toISOString(),
        ...(apiKey ? { api_key_sealed: sealSecret(apiKey), api_key_hint: apiKey.slice(-4) } : {}),
    };
    const { error } = current
        ? await admin.from('invoicing_settings').update(payload).eq('community_id', communityId)
        : await admin.from('invoicing_settings').insert(payload);
    if (error) throw error;
    return getInvoicingSettings(communityId);
}

export async function listTaxDocuments(communityId: string) {
    const { data, error } = await getSupabaseAdmin()
        .from('tax_documents').select(DOCUMENT_COLUMNS)
        .eq('community_id', communityId).order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    return (data || []).map(toDocument);
}

type ProviderReply = {
    FOLIO?: number;
    TOKEN?: string;
    PDF?: string;
    WARNING?: Array<Record<string, string>>;
    error?: { message?: string; code?: string; details?: Array<{ field?: string; issue?: string }> };
};

function describeProviderError(reply: ProviderReply, status: number) {
    const details = reply.error?.details?.map(item => [item.field, item.issue].filter(Boolean).join(': ')).join('; ');
    return [reply.error?.message || `OpenFactura respondió ${status}`, details].filter(Boolean).join(' — ').slice(0, 500);
}

/**
 * Emite una factura. La fila se reserva antes de llamar al proveedor con la
 * clave de idempotencia del cliente: si la red falla y se reintenta, el
 * proveedor reconoce la misma clave y no consume otro folio.
 */
export async function issueTaxDocument(communityId: string, actorId: string, draft: TaxDocumentDraft, idempotencyKey: string) {
    if (!/^[A-Za-z0-9-]{16,64}$/.test(idempotencyKey)) throw new InvoicingError('Falta la clave de idempotencia de la emisión.');
    const admin = getSupabaseAdmin();
    const { data: settings, error: settingsError } = await admin
        .from('invoicing_settings').select('environment, emitter, api_key_sealed').eq('community_id', communityId).maybeSingle();
    if (settingsError) throw settingsError;
    if (!settings) throw new InvoicingError('Primero configura el emisor y la API key de OpenFactura.', 409);

    let built: ReturnType<typeof buildDte>;
    try {
        built = buildDte(draft, settings.emitter as InvoicingEmitter);
    } catch (error) {
        if (error instanceof TaxDocumentError) throw new InvoicingError(error.message);
        throw error;
    }

    const { data: existing } = await admin.from('tax_documents').select(DOCUMENT_COLUMNS)
        .eq('idempotency_key', idempotencyKey).eq('community_id', communityId).maybeSingle();
    if (existing && existing.status === 'issued') return toDocument(existing);

    const environment = settings.environment as Environment;
    let documentId = existing?.id as string | undefined;
    if (!documentId) {
        const { data: reserved, error: reserveError } = await admin.from('tax_documents').insert({
            community_id: communityId,
            environment,
            dte_type: draft.type,
            idempotency_key: idempotencyKey,
            receiver: draft.receiver,
            items: draft.items,
            net_amount: built.totals.net,
            exempt_amount: built.totals.exempt,
            tax_amount: built.totals.tax,
            total_amount: built.totals.total,
            issue_date: draft.issueDate,
            created_by: actorId,
        }).select('id').single();
        if (reserveError) throw reserveError;
        documentId = String(reserved.id);
    }

    let reply: ProviderReply = {};
    let status = 0;
    try {
        const response = await fetch(`${HOSTS[environment]}/v2/dte/document`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                apikey: openSecret(String(settings.api_key_sealed)),
                'Idempotency-Key': idempotencyKey,
            },
            body: JSON.stringify({ response: ['FOLIO', 'PDF'], dte: built.dte }),
            signal: AbortSignal.timeout(30_000),
        });
        status = response.status;
        reply = await response.json().catch(() => ({})) as ProviderReply;
    } catch (error) {
        // Sin respuesta no sabemos si se emitió: queda pendiente y el reintento con la misma clave lo resuelve.
        await admin.from('tax_documents').update({ error: 'Sin respuesta de OpenFactura; reintenta para confirmar.' }).eq('id', documentId);
        throw new InvoicingError(error instanceof Error && error.name === 'TimeoutError'
            ? 'OpenFactura no respondió a tiempo. Reintenta: no se emitirá dos veces.'
            : 'No se pudo conectar con OpenFactura. Reintenta: no se emitirá dos veces.', 502);
    }

    if (status === 200 && reply.FOLIO && reply.TOKEN) {
        let pdfPath: string | null = null;
        if (reply.PDF) {
            const path = `tax-documents/${communityId}/${documentId}.pdf`;
            const { error: uploadError } = await admin.storage.from(PDF_BUCKET)
                .upload(path, Buffer.from(reply.PDF, 'base64'), { contentType: 'application/pdf', upsert: true });
            if (!uploadError) pdfPath = path;
        }
        const warnings = (reply.WARNING || []).flatMap(item => Object.values(item)).map(String);
        const { data, error } = await admin.from('tax_documents').update({
            status: 'issued', folio: reply.FOLIO, provider_token: reply.TOKEN, pdf_path: pdfPath, warnings, error: null,
        }).eq('id', documentId).select(DOCUMENT_COLUMNS).single();
        if (error) throw error;
        return toDocument(data);
    }

    // OF-06: el proveedor ya emitió con esta clave en un intento anterior.
    const previousToken = reply.error?.code === 'OF-06' ? reply.error.details?.[0]?.issue : undefined;
    if (previousToken) {
        const { data, error } = await admin.from('tax_documents').update({
            status: 'issued', provider_token: previousToken,
            error: 'Emitido en un intento anterior; el folio y el PDF están en OpenFactura.',
        }).eq('id', documentId).select(DOCUMENT_COLUMNS).single();
        if (error) throw error;
        return toDocument(data);
    }

    const message = describeProviderError(reply, status);
    await admin.from('tax_documents').update({ status: 'failed', error: message }).eq('id', documentId);
    throw new InvoicingError(`OpenFactura rechazó el documento: ${message}`, 422);
}

export async function getTaxDocumentPdf(communityId: string, documentId: string) {
    const admin = getSupabaseAdmin();
    const { data: row, error } = await admin.from('tax_documents')
        .select('pdf_path, folio, dte_type').eq('id', documentId).eq('community_id', communityId).maybeSingle();
    if (error) throw error;
    if (!row?.pdf_path) throw new InvoicingError('Ese documento no tiene PDF guardado.', 404);
    const { data: file, error: downloadError } = await admin.storage.from(PDF_BUCKET).download(String(row.pdf_path));
    if (downloadError || !file) throw new InvoicingError('No se pudo leer el PDF.', 502);
    return { bytes: new Uint8Array(await file.arrayBuffer()), fileName: `dte-${row.dte_type}-folio-${row.folio ?? 'pendiente'}.pdf` };
}
