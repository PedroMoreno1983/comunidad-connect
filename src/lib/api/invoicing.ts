import type { InvoicingEmitter, InvoicingSettingsView, TaxDocument, TaxDocumentDraft } from '../types';
import { financeWrite, readApi } from './_shared';

export const InvoicingService = {
    get() {
        return readApi<{ settings: InvoicingSettingsView; documents: TaxDocument[] }>('/api/admin/invoicing', 'No se pudo cargar la facturación.');
    },

    saveSettings(input: { environment: 'test' | 'production'; apiKey?: string; emitter: InvoicingEmitter }) {
        return readApi<{ settings: InvoicingSettingsView }>('/api/admin/invoicing', 'No se pudo guardar el emisor.', financeWrite({ action: 'settings', ...input }));
    },

    issue(draft: TaxDocumentDraft, idempotencyKey: string) {
        return readApi<{ document: TaxDocument }>('/api/admin/invoicing', 'No se pudo emitir el documento.', financeWrite({ action: 'issue', ...draft, idempotencyKey }));
    },
};
