import { CoverPhotoError, setCommunityCoverPhoto } from '@/lib/community/coverPhoto';
import { discardChatImage, releaseChatImage, takeChatImage } from './chatAttachments';

/** CoCo pone la imagen adjunta al chat como portada del condominio. Solo administración (lo valida el ejecutor). */
export async function setCommunityCoverFromChat(communityId: string, userId: string, input: Record<string, unknown>) {
    const attachmentId = typeof input.attachment_id === 'string' ? input.attachment_id.slice(0, 64) : '';
    if (!attachmentId) return { error: 'Falta la imagen. Pide que la adjunte en el chat.' };
    const attachment = await takeChatImage(userId, attachmentId);
    if (!attachment) return { error: 'No encontré la imagen adjunta. Pide que la vuelva a enviar en el chat.' };
    try {
        await setCommunityCoverPhoto(communityId, attachment.file);
    } catch (error) {
        // Falló: la imagen vuelve a estar disponible para reintentar.
        await releaseChatImage(attachment.path, attachment.originalPath).catch(() => undefined);
        return { error: error instanceof CoverPhotoError ? error.message : 'No se pudo guardar la portada. Intenta de nuevo.' };
    }
    // Borrar el adjunto ya usado es limpieza: la portada ya quedó.
    await discardChatImage(attachment.path).catch(() => undefined);
    return { success: true, message: 'Portada del condominio actualizada. La ven la administración y todos los residentes en su inicio (al recargar la página).' };
}
