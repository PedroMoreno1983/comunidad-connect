import { NextRequest, NextResponse } from 'next/server';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { apiErrorResponse } from '@/lib/observability/logger';
import { requireCommunityAdmin } from '@/lib/finance/httpAuth';
import {
    getInvoicingSettings,
    InvoicingError,
    issueTaxDocument,
    listTaxDocuments,
    saveInvoicingSettings,
} from '@/lib/finance/taxDocumentService';
import type { InvoicingEmitter, TaxDocumentItem, TaxDocumentReceiver } from '@/lib/types';

export const runtime = 'nodejs';

const str = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

export async function GET(req: NextRequest) {
    try {
        const auth = await requireCommunityAdmin();
        if (auth.error) return auth.error;
        const [settings, documents] = await Promise.all([
            getInvoicingSettings(auth.communityId),
            listTaxDocuments(auth.communityId),
        ]);
        return NextResponse.json({ settings, documents });
    } catch (error) {
        return apiErrorResponse(req, '/api/admin/invoicing', error, { publicMessage: 'No se pudo cargar la facturación.' });
    }
}

export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'admin.invoicing', { limit: 20, windowMs: 60_000 });
    if (limited) return limited;
    try {
        const auth = await requireCommunityAdmin();
        if (auth.error) return auth.error;
        const body = await req.json().catch(() => ({})) as Record<string, unknown>;

        if (body.action === 'settings') {
            const emitter = (body.emitter || {}) as Record<string, unknown>;
            const settings = await saveInvoicingSettings(auth.communityId, auth.profile.id, {
                environment: str(body.environment, 20),
                apiKey: str(body.apiKey, 128) || undefined,
                emitter: {
                    rut: str(emitter.rut, 14),
                    businessName: str(emitter.businessName, 100),
                    activity: str(emitter.activity, 80),
                    activityCode: str(emitter.activityCode, 6),
                    address: str(emitter.address, 70),
                    commune: str(emitter.commune, 20),
                    branchCode: str(emitter.branchCode, 9) || undefined,
                } satisfies InvoicingEmitter,
            });
            return NextResponse.json({ settings });
        }

        if (body.action === 'issue') {
            const receiver = (body.receiver || {}) as Record<string, unknown>;
            const items = Array.isArray(body.items) ? body.items.slice(0, 60) as Record<string, unknown>[] : [];
            const document = await issueTaxDocument(auth.communityId, auth.profile.id, {
                type: Number(body.type) === 34 ? 34 : 33,
                issueDate: str(body.issueDate, 10),
                receiver: {
                    rut: str(receiver.rut, 14),
                    businessName: str(receiver.businessName, 100),
                    activity: str(receiver.activity, 40),
                    address: str(receiver.address, 70),
                    commune: str(receiver.commune, 20),
                } satisfies TaxDocumentReceiver,
                items: items.map(item => ({
                    name: str(item.name, 80),
                    quantity: Number(item.quantity),
                    unitPrice: Number(item.unitPrice),
                }) satisfies TaxDocumentItem),
            }, str(body.idempotencyKey, 64));
            return NextResponse.json({ document }, { status: 201 });
        }

        return NextResponse.json({ error: 'Acción no reconocida.' }, { status: 400 });
    } catch (error) {
        if (error instanceof InvoicingError) return NextResponse.json({ error: error.message }, { status: error.status });
        return apiErrorResponse(req, '/api/admin/invoicing', error, { publicMessage: 'No se pudo completar la facturación.' });
    }
}
