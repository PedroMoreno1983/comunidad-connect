import { createHash, randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { BillingError, addCommunityExpense, type CommunityExpenseInput } from '@/lib/finance/billingService';
import { discardChatImage, releaseChatImage, takeChatImage } from '@/lib/coco/chatAttachments';

/**
 * Egreso cargado por CoCo con la foto de la boleta como respaldo: la que la
 * administración adjuntó en el chat web o mandó por WhatsApp. Queda igual que
 * un respaldo subido en la pantalla de Egresos (bucket finance-documents, con
 * su hash para no cargar dos veces la misma imagen).
 */

const BUCKET = 'finance-documents';
const EXTENSION: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export async function addCommunityExpenseWithChatImage(
    communityId: string,
    userId: string,
    attachmentId: string,
    input: CommunityExpenseInput,
) {
    const attachment = await takeChatImage(userId, attachmentId);
    if (!attachment) {
        throw new BillingError('missing_attachment', 'No encontré la foto de la boleta. Pide que la vuelva a enviar, o carga el egreso sin respaldo.', 404);
    }
    const extension = EXTENSION[attachment.file.type];
    if (!extension) {
        await releaseChatImage(attachment.path, attachment.originalPath).catch(() => undefined);
        throw new BillingError('bad_file', 'La foto debe ser JPG, PNG o WebP para guardarla como respaldo.');
    }
    const bytes = Buffer.from(await attachment.file.arrayBuffer());
    const checksum = createHash('sha256').update(bytes).digest('hex');
    const admin = getSupabaseAdmin();

    const { data: duplicate, error: duplicateError } = await admin.from('community_expenses').select('id, month, label')
        .eq('community_id', communityId).eq('document_sha256', checksum).limit(1).maybeSingle();
    if (duplicateError) {
        await releaseChatImage(attachment.path, attachment.originalPath).catch(() => undefined);
        throw duplicateError;
    }
    if (duplicate) {
        await discardChatImage(attachment.path).catch(() => undefined);
        throw new BillingError('duplicate_document', `Esa foto ya es el respaldo del egreso "${duplicate.label}" de ${duplicate.month}. No la cargué de nuevo.`, 409);
    }

    const path = `${communityId}/${randomUUID()}.${extension}`;
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: attachment.file.type, upsert: false });
    if (uploadError) {
        await releaseChatImage(attachment.path, attachment.originalPath).catch(() => undefined);
        throw uploadError;
    }
    try {
        const expense = await addCommunityExpense(communityId, userId, { ...input, documentPath: path, documentSha256: checksum });
        // La foto del chat ya está copiada al respaldo: borrarla es limpieza.
        await discardChatImage(attachment.path).catch(() => undefined);
        return expense;
    } catch (error) {
        await admin.storage.from(BUCKET).remove([path]).catch(() => undefined);
        await releaseChatImage(attachment.path, attachment.originalPath).catch(() => undefined);
        throw error;
    }
}
