import { normalizeRut } from '@/lib/utils/rut';
import type { InvoicingEmitter, TaxDocumentDraft, TaxDocumentTotals } from '@/lib/types';

// Arma el JSON del DTE con los nombres del formato del SII que usa OpenFactura.
// Todo se valida aquí, antes de llamar al proveedor: un documento rechazado
// por datos incompletos no debe consumir un folio.
export const IVA_RATE = 0.19;
const MAX_ITEMS = 60;

export class TaxDocumentError extends Error {
    constructor(public problems: string[]) {
        super(problems.join(' '));
    }
}

const text = (value: string, max: number) => value.normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, max);

export function documentTotals(draft: Pick<TaxDocumentDraft, 'type' | 'items'>): TaxDocumentTotals {
    const subtotal = draft.items.reduce((sum, item) => sum + Math.round(item.quantity * item.unitPrice), 0);
    if (draft.type === 34) return { net: 0, exempt: subtotal, tax: 0, total: subtotal };
    const tax = Math.round(subtotal * IVA_RATE);
    return { net: subtotal, exempt: 0, tax, total: subtotal + tax };
}

export function buildDte(draft: TaxDocumentDraft, emitter: InvoicingEmitter) {
    const problems: string[] = [];
    const emitterRut = normalizeRut(emitter.rut);
    const receiverRut = normalizeRut(draft.receiver.rut);
    if (!emitterRut) problems.push('El RUT del emisor no es válido.');
    if (!receiverRut) problems.push('El RUT del receptor no es válido.');
    if (draft.type !== 33 && draft.type !== 34) problems.push('El tipo de documento debe ser factura afecta (33) o exenta (34).');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.issueDate)) problems.push('La fecha de emisión debe ir en formato AAAA-MM-DD.');
    for (const [label, value] of [
        ['razón social del receptor', draft.receiver.businessName],
        ['giro del receptor', draft.receiver.activity],
        ['dirección del receptor', draft.receiver.address],
        ['comuna del receptor', draft.receiver.commune],
    ] as const) {
        if (text(value || '', 100).length < 2) problems.push(`Falta la ${label}.`);
    }
    if (!draft.items.length) problems.push('Agrega al menos un ítem.');
    if (draft.items.length > MAX_ITEMS) problems.push(`Máximo ${MAX_ITEMS} ítems por documento.`);
    draft.items.forEach((item, index) => {
        if (text(item.name || '', 80).length < 2) problems.push(`El ítem ${index + 1} no tiene descripción.`);
        if (!(item.quantity > 0)) problems.push(`El ítem ${index + 1} necesita una cantidad mayor que cero.`);
        if (!(item.unitPrice > 0) || !Number.isInteger(item.unitPrice)) problems.push(`El ítem ${index + 1} necesita un precio entero en pesos.`);
    });
    if (problems.length) throw new TaxDocumentError(problems);

    const totals = documentTotals(draft);
    const exempt = draft.type === 34;
    return {
        totals,
        dte: {
            Encabezado: {
                IdDoc: { TipoDTE: draft.type, Folio: 0, FchEmis: draft.issueDate, FmaPago: '2' },
                Emisor: {
                    RUTEmisor: emitterRut,
                    RznSoc: text(emitter.businessName, 100),
                    GiroEmis: text(emitter.activity, 80),
                    Acteco: text(emitter.activityCode, 6),
                    DirOrigen: text(emitter.address, 70),
                    CmnaOrigen: text(emitter.commune, 20),
                    ...(emitter.branchCode ? { CdgSIISucur: text(emitter.branchCode, 9) } : {}),
                },
                Receptor: {
                    RUTRecep: receiverRut,
                    RznSocRecep: text(draft.receiver.businessName, 100),
                    GiroRecep: text(draft.receiver.activity, 40),
                    DirRecep: text(draft.receiver.address, 70),
                    CmnaRecep: text(draft.receiver.commune, 20),
                },
                Totales: exempt
                    ? { MntExe: totals.exempt, MntTotal: totals.total }
                    : { MntNeto: totals.net, TasaIVA: '19', IVA: totals.tax, MntTotal: totals.total },
            },
            Detalle: draft.items.map((item, index) => ({
                NroLinDet: index + 1,
                ...(exempt ? { IndExe: 1 } : {}),
                NmbItem: text(item.name, 80),
                QtyItem: item.quantity,
                PrcItem: item.unitPrice,
                MontoItem: Math.round(item.quantity * item.unitPrice),
            })),
        },
    };
}
