import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { BillingError, addCommunityExpense } from '@/lib/finance/billingService';
import { extractExpenseDocument } from '@/lib/finance/expenseDocumentExtractor';
import { enrichUtilityDraft, rememberUtilityAccount } from '@/lib/utilities/communityBills';
import { isUtilityService } from '@/lib/utilities/providers';
import type { FinanceDocumentDraft, InboundBillDocument } from '@/lib/types';

/**
 * Boletas que llegan solas por correo. Cada comunidad tiene una dirección
 * propia; Resend recibe el correo y avisa a /api/inbound/bills; aquí se bajan
 * los adjuntos y la IA los lee.
 *
 * Desde el 19-11-2026 la boleta entra sola como egreso del mes cuando su n° de
 * cliente ya lo registró la administración una vez (así se sabe qué es, cómo se
 * llama y cómo se prorratea) y la lectura salió limpia: monto, vencimiento, sin
 * boleta repetida ni salto de monto. Lo demás queda en la bandeja para un clic.
 */

const BUCKET = 'finance-documents';
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED = new Map([
    ['application/pdf', 'pdf'], ['image/jpeg', 'jpg'], ['image/png', 'png'],
]);

export class InboxError extends Error {
    constructor(message: string, public status = 400) { super(message); }
}

/** Dominio donde Resend recibe (subdominio propio con MX, o el <id>.resend.app de la cuenta). */
export function inboxDomain() {
    return (process.env.BILLS_INBOUND_DOMAIN || '').trim().toLowerCase();
}

export function inboxAddress(token: string | null) {
    const domain = inboxDomain();
    return token && domain ? `${token}@${domain}` : null;
}

// ── Verificación del webhook (Svix, el estándar que usa Resend) ─────────────
/**
 * Firma = HMAC-SHA256 de `${svix-id}.${svix-timestamp}.${cuerpo crudo}` con la
 * clave (lo que sigue a "whsec_", en base64). El encabezado trae una o más
 * firmas "v1,<base64>". Se rechaza lo que tenga más de 5 minutos.
 */
export function verifySvixSignature(input: { secret: string; id: string | null; timestamp: string | null; signature: string | null; body: string; now?: number }) {
    if (!input.secret || !input.id || !input.timestamp || !input.signature) return false;
    const seconds = Number(input.timestamp);
    const now = Math.floor((input.now ?? Date.now()) / 1000);
    if (!Number.isFinite(seconds) || Math.abs(now - seconds) > 300) return false;
    const key = Buffer.from(input.secret.replace(/^whsec_/, ''), 'base64');
    const expected = createHmac('sha256', key).update(`${input.id}.${input.timestamp}.${input.body}`).digest();
    return input.signature.split(' ').some(part => {
        const [version, value] = part.split(',');
        if (version !== 'v1' || !value) return false;
        const given = Buffer.from(value, 'base64');
        return given.length === expected.length && timingSafeEqual(given, expected);
    });
}

// ── Dirección de la comunidad ───────────────────────────────────────────────
export async function ensureInboxToken(communityId: string): Promise<string> {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.from('communities').select('bills_inbox_token').eq('id', communityId).maybeSingle();
    if (error) throw error;
    if (data?.bills_inbox_token) return data.bills_inbox_token;
    // 12 caracteres en minúscula: imposible de adivinar, fácil de copiar.
    const token = randomBytes(9).toString('base64').replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 12).padEnd(12, '7');
    const { error: updateError } = await admin.from('communities').update({ bills_inbox_token: token }).eq('id', communityId).is('bills_inbox_token', null);
    if (updateError) throw updateError;
    const { data: after } = await admin.from('communities').select('bills_inbox_token').eq('id', communityId).maybeSingle();
    return after?.bills_inbox_token || token;
}

/** Token de la dirección a la que llegó el correo (to, cc o received_for), si es de nuestro dominio. */
export function tokensFromRecipients(recipients: unknown[]): string[] {
    const domain = inboxDomain();
    if (!domain) return [];
    return recipients
        .filter((value): value is string => typeof value === 'string')
        .map(value => value.toLowerCase().match(/<?([a-z0-9._%+-]+)@([a-z0-9.-]+)>?/))
        .filter((match): match is RegExpMatchArray => Boolean(match) && match![2] === domain)
        .map(match => match[1].split('+')[0])
        .filter(token => /^[a-z0-9]{8,24}$/.test(token));
}

type ReceivedEvent = {
    type?: string;
    data?: { email_id?: string; from?: string; subject?: string; to?: unknown[]; cc?: unknown[]; received_for?: unknown[] };
};

type ResendAttachment = { id: string; filename?: string; content_type?: string; size?: number; download_url?: string };

async function resendListAttachments(emailId: string): Promise<ResendAttachment[]> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error('RESEND_API_KEY no configurada');
    const response = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}/attachments?limit=20`, {
        headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) throw new Error(`Resend respondió ${response.status} al pedir los adjuntos.`);
    const body = await response.json() as { data?: ResendAttachment[] };
    return body.data ?? [];
}

/**
 * Solo se baja desde el CDN de Resend (hoy cdn.resend.app; se acepta también
 * resend.com): una URL de otro sitio no se sigue.
 */
export function resendDownloadAllowed(url: string) {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' && /(^|\.)resend\.(com|app)$/i.test(parsed.hostname);
    } catch {
        return false;
    }
}

/** La boleta puede registrarse sola: cuenta conocida y lectura sin dudas. */
export function canAutoRegister(draft: FinanceDocumentDraft) {
    return Boolean(draft.knownUtilityAccount && draft.utility?.customerNumber && isUtilityService(draft.category)
        && draft.amount > 0 && draft.label && /^\d{4}-(0[1-9]|1[0-2])$/.test(draft.suggestedMonth || '')
        && draft.warnings.length === 0);
}

const clp = (amount: number) => `${Math.round(amount).toLocaleString('es-CL')}`;

type AutoRegistered = { label: string; amount: number; month: string };

async function notifyAdmins(communityId: string, pending: number, registered: AutoRegistered[]) {
    const admin = getSupabaseAdmin();
    const { data: admins } = await admin.from('profiles').select('id').eq('community_id', communityId).eq('role', 'admin');
    if (!admins?.length) return;
    const rows: Array<Record<string, unknown>> = [];
    for (const profile of admins) {
        for (const bill of registered) {
            rows.push({
                user_id: profile.id, community_id: communityId, type: 'success', category: 'bills_inbox',
                title: `Boleta registrada: ${bill.label}`,
                body: `CoCo la sumó a los egresos de ${bill.month} por ${clp(bill.amount)}, con la boleta como respaldo. Si algo no cuadra, bórrala en Egresos antes de emitir.`,
                link: '/admin/finanzas/egresos',
            });
        }
        if (pending) {
            rows.push({
                user_id: profile.id, community_id: communityId, type: 'info', category: 'bills_inbox',
                title: pending === 1 ? 'Llegó una boleta por revisar' : `Llegaron ${pending} boletas por revisar`,
                body: 'CoCo ya la leyó, pero necesita que confirmes los datos. Regístrala en un clic; las siguientes de esa cuenta entran solas.',
                link: '/admin/finanzas/egresos#bandeja',
            });
        }
    }
    if (rows.length) await admin.from('notifications').insert(rows);
}

/** Registra sola una boleta de cuenta conocida. Si no se puede (mes ya emitido, etc.), queda en la bandeja con la razón. */
async function autoRegister(communityId: string, id: string, draft: FinanceDocumentDraft): Promise<AutoRegistered | null> {
    const admin = getSupabaseAdmin();
    const { data: account } = await admin.from('community_utility_accounts').select('created_by')
        .eq('community_id', communityId).eq('customer_number', draft.utility?.customerNumber || '').maybeSingle();
    const month = String(draft.suggestedMonth);
    try {
        await registerInboundBill(communityId, account?.created_by ? String(account.created_by) : null, id, {
            month, label: draft.label, amount: draft.amount, category: draft.category, provider: draft.provider,
            prorateMethod: draft.suggestedProrateMethod === 'equal' ? 'equal' : 'share',
        });
        return { label: draft.label, amount: draft.amount, month };
    } catch (error) {
        const reason = error instanceof Error ? error.message : 'error al registrar';
        await admin.from('inbound_bill_documents')
            .update({ draft: { ...draft, warnings: [`No entró sola: ${reason}`] } })
            .eq('id', id).eq('status', 'pending');
        return null;
    }
}

/** Procesa un correo recibido. Idempotente por (email_id, adjunto). */
export async function handleInboundEmail(event: ReceivedEvent) {
    if (event.type !== 'email.received' || !event.data?.email_id) return { ignored: 'not_received_event' };
    const data = event.data;
    const emailId = String(data.email_id);
    const tokens = tokensFromRecipients([...(data.to ?? []), ...(data.cc ?? []), ...(data.received_for ?? [])]);
    if (!tokens.length) return { ignored: 'unknown_recipient' };
    const admin = getSupabaseAdmin();
    const { data: community } = await admin.from('communities').select('id').in('bills_inbox_token', tokens).limit(1).maybeSingle();
    if (!community) return { ignored: 'unknown_recipient' };
    const communityId = String(community.id);

    const attachments = (await resendListAttachments(emailId))
        .filter(item => ACCEPTED.has(String(item.content_type || '').toLowerCase()) && (item.size ?? 0) <= MAX_BYTES);
    let pending = 0;
    const registered: AutoRegistered[] = [];
    for (const attachment of attachments) {
        const { data: existing } = await admin.from('inbound_bill_documents').select('id')
            .eq('email_id', emailId).eq('attachment_id', attachment.id).maybeSingle();
        if (existing) continue;
        const base = {
            community_id: communityId, email_id: emailId, attachment_id: attachment.id,
            from_address: String(data.from || '').slice(0, 200), subject: String(data.subject || '').slice(0, 300),
            file_name: String(attachment.filename || 'boleta').slice(0, 200),
        };
        try {
            if (!attachment.download_url || !resendDownloadAllowed(attachment.download_url)) throw new Error('Adjunto sin enlace de descarga válido.');
            const download = await fetch(attachment.download_url, { redirect: 'error' });
            if (!download.ok) throw new Error(`No se pudo bajar el adjunto (${download.status}).`);
            const bytes = Buffer.from(await download.arrayBuffer());
            if (bytes.length === 0 || bytes.length > MAX_BYTES) throw new Error('El adjunto está vacío o pesa más de 10 MB.');
            const contentType = String(attachment.content_type).toLowerCase();
            const checksum = createHash('sha256').update(bytes).digest('hex');
            const path = `${communityId}/bandeja/${randomUUID()}.${ACCEPTED.get(contentType)}`;
            const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: false });
            if (uploadError) throw uploadError;
            const file = new File([bytes], `boleta.${ACCEPTED.get(contentType)}`, { type: contentType });
            let draft: FinanceDocumentDraft;
            try {
                draft = await enrichUtilityDraft(communityId, await extractExpenseDocument(file, { userId: '', communityId }));
            } catch (error) {
                draft = { fileName: base.file_name, label: base.subject || base.file_name, amount: 0, provider: '', category: 'other',
                    documentDate: '', documentNumber: '', warnings: [error instanceof Error ? error.message : 'No se pudo leer: complétala a mano.'] };
            }
            // El mismo PDF ya registrado (llegó por otra vía): se avisa en la bandeja.
            const { data: duplicate } = await admin.from('community_expenses').select('month, label')
                .eq('community_id', communityId).eq('document_sha256', checksum).limit(1).maybeSingle();
            if (duplicate) draft.warnings = [`Este mismo archivo ya es el respaldo de "${duplicate.label}" (${duplicate.month}).`, ...draft.warnings];
            const { data: inserted, error: insertError } = await admin.from('inbound_bill_documents')
                .insert({ ...base, storage_path: path, document_sha256: checksum, draft, status: 'pending' }).select('id').single();
            if (insertError) throw insertError;
            const done = canAutoRegister(draft) ? await autoRegister(communityId, String(inserted.id), draft) : null;
            if (done) registered.push(done); else pending++;
        } catch (error) {
            await admin.from('inbound_bill_documents').insert({ ...base, status: 'failed', error: error instanceof Error ? error.message.slice(0, 300) : 'Error al procesar.' });
        }
    }
    if (pending || registered.length) await notifyAdmins(communityId, pending, registered).catch(() => undefined);
    return { communityId, stored: pending + registered.length, registered: registered.length, attachments: attachments.length };
}

// ── Bandeja de la administración ────────────────────────────────────────────
type Row = {
    id: string; from_address: string; subject: string; file_name: string; status: InboundBillDocument['status'];
    draft: FinanceDocumentDraft | null; error: string | null; received_at: string; expense_id: string | null;
};

export async function listInbox(communityId: string): Promise<{ address: string | null; items: InboundBillDocument[] }> {
    const token = await ensureInboxToken(communityId);
    const { data, error } = await getSupabaseAdmin().from('inbound_bill_documents')
        .select('id, from_address, subject, file_name, status, draft, error, received_at, expense_id')
        .eq('community_id', communityId).in('status', ['pending', 'failed'])
        .order('received_at', { ascending: false }).limit(50);
    if (error) throw error;
    return {
        address: inboxAddress(token),
        items: ((data ?? []) as Row[]).map(row => ({
            id: row.id, from: row.from_address, subject: row.subject, fileName: row.file_name, status: row.status,
            draft: row.draft && Object.keys(row.draft).length ? row.draft : null, error: row.error, receivedAt: row.received_at,
        })),
    };
}

export async function discardInboundBill(communityId: string, userId: string, id: string) {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.from('inbound_bill_documents')
        .update({ status: 'discarded', decided_by: userId, decided_at: new Date().toISOString() })
        .eq('id', id).eq('community_id', communityId).in('status', ['pending', 'failed']).select('storage_path').maybeSingle();
    if (error) throw error;
    if (!data) throw new InboxError('Esa boleta ya no está en la bandeja.', 404);
    if (data.storage_path) await admin.storage.from(BUCKET).remove([data.storage_path]).catch(() => undefined);
}

export async function registerInboundBill(communityId: string, userId: string | null, id: string, input: {
    month: string; label: string; amount: number; category: string; provider: string; prorateMethod: 'share' | 'equal';
}) {
    const admin = getSupabaseAdmin();
    const { data: row, error } = await admin.from('inbound_bill_documents')
        .select('id, storage_path, document_sha256, draft, status').eq('id', id).eq('community_id', communityId).maybeSingle();
    if (error) throw error;
    if (!row || row.status !== 'pending') throw new InboxError('Esa boleta ya no está en la bandeja.', 404);
    const draft = (row.draft || {}) as FinanceDocumentDraft;
    const utility = draft.utility ?? null;
    try {
        const expense = await addCommunityExpense(communityId, userId, {
            month: input.month, label: input.label, amount: input.amount, category: input.category, provider: input.provider,
            prorateMethod: input.prorateMethod, notes: [draft.documentDate, draft.documentNumber].filter(Boolean).join(' · ').slice(0, 500),
            documentPath: row.storage_path, documentSha256: row.document_sha256, utility,
        });
        if (utility && userId) {
            await rememberUtilityAccount(communityId, userId, { utility, category: input.category, provider: input.provider, label: input.label, prorateMethod: input.prorateMethod })
                .catch(() => undefined);
        }
        await admin.from('inbound_bill_documents')
            .update({ status: 'registered', expense_id: expense.id, decided_by: userId, decided_at: new Date().toISOString() })
            .eq('id', id);
        return expense;
    } catch (error) {
        if (error instanceof BillingError) throw new InboxError(error.message, error.status);
        throw error;
    }
}
