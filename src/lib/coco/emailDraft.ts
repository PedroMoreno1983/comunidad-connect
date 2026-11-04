/**
 * Un correo, a una persona de la misma comunidad, solo después de confirmar.
 * Si el envío no está configurado, el borrador queda guardado y no se finge el envío.
 */

import { FROM_EMAIL, resend } from '@/lib/email';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

export function normalizeSingleEmail(value: string): string | null {
    const email = value.trim().toLowerCase();
    if (email.length < 6 || email.length > 120) return null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
    return email;
}

export function cleanEmailDraft(subject: string, body: string): { subject: string; body: string } | { error: string } {
    const cleanSubject = subject.replace(/\s+/g, ' ').trim();
    const cleanBody = body.replace(/\0/g, '').trim();
    if (cleanSubject.length < 3 || cleanSubject.length > 140) return { error: 'El asunto debe tener entre 3 y 140 caracteres.' };
    if (cleanBody.length < 10 || cleanBody.length > 4000) return { error: 'El mensaje debe tener entre 10 y 4000 caracteres.' };
    if (/bcc|cco:|todos los residentes|lista de correos/i.test(`${cleanSubject}\n${cleanBody}`)) {
        return { error: 'Solo se envía un correo a una persona. No armes un envío masivo.' };
    }
    return { subject: cleanSubject, body: cleanBody };
}

function escapeHtml(value: string) {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function sendConfirmedEmailDraft(input: {
    communityId: string;
    createdBy: string;
    to: string;
    subject: string;
    body: string;
}) {
    const email = normalizeSingleEmail(input.to);
    if (!email) return { error: 'El correo de destino no es válido.' };
    const draft = cleanEmailDraft(input.subject, input.body);
    if ('error' in draft) return draft;

    const admin = getSupabaseAdmin();
    const { data: recipient, error: recipientError } = await admin
        .from('profiles')
        .select('id')
        .eq('community_id', input.communityId)
        .ilike('email', email)
        .limit(1)
        .maybeSingle();
    if (recipientError) return { error: 'No pude comprobar si esa persona es de la comunidad.' };
    if (!recipient) return { error: 'Solo escribo a un correo que ya está en esta comunidad.' };

    const { data: saved, error: saveError } = await admin.from('coco_email_drafts').insert({
        community_id: input.communityId,
        created_by: input.createdBy,
        to_email: email,
        subject: draft.subject,
        body: draft.body,
        status: 'saved',
    }).select('id').single();
    if (saveError || !saved) return { error: 'No pude guardar el borrador.' };

    if (!process.env.RESEND_API_KEY?.trim()) {
        return { saved: true, sent: false, draft_id: saved.id, message: 'El borrador quedó guardado. El envío no está configurado, así que no salió ningún correo.' };
    }

    const result = await resend.emails.send({
        from: FROM_EMAIL,
        to: email,
        subject: draft.subject,
        text: draft.body,
        html: `<p>${escapeHtml(draft.body).replace(/\n/g, '<br>')}</p>`,
    });
    if (result.error) {
        return { saved: true, sent: false, draft_id: saved.id, message: 'El borrador quedó guardado y el correo no se envió.' };
    }

    await admin.from('coco_email_drafts').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', saved.id);
    return { saved: true, sent: true, draft_id: saved.id, message: 'Correo enviado a una persona de la comunidad.' };
}
