/**
 * Descarga media de Twilio y transcribe audios con Gemini si hay clave.
 * No registra el contenido ni el secreto.
 */

import { extractPdfText } from '@/lib/coco/pdfText';
import { MAX_INBOUND_BYTES, twilioMediaUrlAllowed, type InboundMediaRef, understandInboundMedia } from '@/lib/coco/inboundMedia';

async function fetchTwilioMedia(url: string, accountSid: string, authToken: string): Promise<{ bytes: Buffer; contentType: string } | null> {
    if (!twilioMediaUrlAllowed(url) || !accountSid || !authToken) return null;
    const response = await fetch(url, {
        redirect: 'manual',
        headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}` },
        signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return null;
    const length = Number(response.headers.get('content-length') || 0);
    if (length > MAX_INBOUND_BYTES) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_INBOUND_BYTES) return null;
    return { bytes, contentType: (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase() };
}

async function transcribeWithGemini(bytes: Buffer, contentType: string, apiKey: string): Promise<string | null> {
    if (!apiKey) return null;
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
            contents: [{
                parts: [
                    { text: 'Transcribe este audio en español. Devuelve solo lo que se dice, sin comentarios ni formato.' },
                    { inline_data: { mime_type: contentType || 'audio/ogg', data: bytes.toString('base64') } },
                ],
            }],
        }),
        signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return null;
    const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = payload.candidates?.[0]?.content?.parts?.map(part => part.text || '').join(' ').trim();
    return text || null;
}

export async function readWhatsAppAttachments(items: InboundMediaRef[]) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim() || '';
    const authToken = process.env.TWILIO_AUTH_TOKEN?.trim() || '';
    const geminiKey = process.env.GEMINI_API_KEY?.trim() || '';
    return understandInboundMedia(items, {
        fetchMedia: url => fetchTwilioMedia(url, accountSid, authToken),
        transcribe: (bytes, contentType) => transcribeWithGemini(bytes, contentType, geminiKey),
        extractPdf: bytes => extractPdfText(bytes),
    });
}
