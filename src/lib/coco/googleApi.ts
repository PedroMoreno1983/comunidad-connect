/**
 * Lectura y escritura acotada de Gmail y Calendar del administrador conectado.
 * Enviar y crear eventos solo se llaman después de la confirmación del chat.
 */

import { gmailRawMessage, singleEmail } from './googleOAuth';
import { googleAccessForUser } from './googleConnection';

type FetchLike = typeof fetch;

async function googleGet(accessToken: string, url: string, fetchImpl: FetchLike = fetch) {
    const response = await fetchImpl(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error('Google no respondió.');
    return response.json() as Promise<unknown>;
}

export async function listGmail(accessToken: string, fetchImpl: FetchLike = fetch) {
    const list = await googleGet(accessToken, 'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5&labelIds=INBOX', fetchImpl) as {
        messages?: Array<{ id?: string }>;
    };
    const messages = [];
    for (const item of (list.messages || []).slice(0, 5)) {
        if (!item.id) continue;
        const detail = await googleGet(
            accessToken,
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
            fetchImpl,
        ) as { snippet?: string; payload?: { headers?: Array<{ name?: string; value?: string }> } };
        const headers = detail.payload?.headers || [];
        const header = (name: string) => headers.find(item => item.name?.toLowerCase() === name.toLowerCase())?.value || '';
        messages.push({
            from: header('From').slice(0, 120),
            subject: header('Subject').slice(0, 160) || '(sin asunto)',
            date: header('Date').slice(0, 80),
            snippet: (detail.snippet || '').replace(/\s+/g, ' ').trim().slice(0, 180),
        });
    }
    return { messages };
}

export async function listCalendar(accessToken: string, fetchImpl: FetchLike = fetch) {
    const timeMin = new Date().toISOString();
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=8&singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(timeMin)}&fields=items(id,summary,start,end,status)`;
    const body = await googleGet(accessToken, url, fetchImpl) as {
        items?: Array<{ summary?: string; status?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } }>;
    };
    return {
        events: (body.items || []).map(item => ({
            title: (item.summary || 'Evento').slice(0, 160),
            start: item.start?.dateTime || item.start?.date || '',
            end: item.end?.dateTime || item.end?.date || '',
            status: item.status || 'confirmed',
        })),
    };
}

export async function sendGmail(accessToken: string, input: { to: string; subject: string; body: string }, fetchImpl: FetchLike = fetch) {
    const to = singleEmail(input.to);
    if (!to) return { error: 'El destinatario no es un correo válido.' };
    const subject = input.subject.replace(/\s+/g, ' ').trim();
    const body = input.body.trim();
    if (subject.length < 3 || subject.length > 140) return { error: 'El asunto debe tener entre 3 y 140 caracteres.' };
    if (body.length < 2 || body.length > 4000) return { error: 'El mensaje es demasiado corto o demasiado largo.' };
    const response = await fetchImpl('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: gmailRawMessage({ to, subject, body }) }),
        signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return { error: 'Gmail no envió el correo.' };
    return { sent: true, to, subject };
}

export async function createCalendarEvent(accessToken: string, input: { title: string; start: string; end: string }, fetchImpl: FetchLike = fetch) {
    const title = input.title.replace(/\s+/g, ' ').trim().slice(0, 140);
    const start = new Date(input.start);
    const end = new Date(input.end);
    if (!title || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
        return { error: 'El evento necesita título y un horario de término posterior al inicio.' };
    }
    const response = await fetchImpl('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            summary: title,
            start: { dateTime: start.toISOString() },
            end: { dateTime: end.toISOString() },
        }),
        signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return { error: 'Calendar no creó el evento.' };
    const created = await response.json() as { id?: string; htmlLink?: string };
    return { created: true, id: created.id || null, title };
}

export async function withAdminGoogle<T>(userId: string | undefined, run: (accessToken: string) => Promise<T>) {
    if (!userId) return { error: 'No pude identificar al administrador.' };
    const access = await googleAccessForUser(userId);
    if (!access) return { error: 'Conecta tu Google en Actividad de Google antes de pedirme el correo o el calendario.' };
    return run(access.accessToken);
}
