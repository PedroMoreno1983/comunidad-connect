/**
 * Lo que llega por WhatsApp: fotos, audios y PDF.
 * Esta parte es pura. La descarga y la transcripción viven al lado.
 */

import type { CoCoImageAttachment, CoCoImageMediaType } from '@/lib/coco/agent';

export const MAX_INBOUND_MEDIA = 3;
export const MAX_INBOUND_BYTES = 5 * 1024 * 1024;
export const MAX_INBOUND_TEXT = 12_000;

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;

export type InboundMediaKind = 'image' | 'audio' | 'pdf' | 'other';

export type InboundMediaRef = {
    url: string;
    contentType: string;
};

export function parseTwilioMedia(params: Record<string, string>): InboundMediaRef[] {
    const count = Math.min(Math.max(Number(params.NumMedia || 0) || 0, 0), MAX_INBOUND_MEDIA);
    const items: InboundMediaRef[] = [];
    for (let index = 0; index < count; index += 1) {
        const url = (params[`MediaUrl${index}`] || '').trim();
        const contentType = (params[`MediaContentType${index}`] || '').split(';')[0].trim().toLowerCase();
        if (url && contentType) items.push({ url, contentType });
    }
    return items;
}

export function classifyInboundMedia(contentType: string): InboundMediaKind {
    if (contentType === 'application/pdf') return 'pdf';
    if (contentType.startsWith('audio/')) return 'audio';
    if ((IMAGE_TYPES as readonly string[]).includes(contentType)) return 'image';
    return 'other';
}

/** Solo se descarga media de Twilio por HTTPS, sin seguir redirecciones a otro sitio. */
export function twilioMediaUrlAllowed(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && /(^|\.)twilio\.com$/i.test(url.hostname);
    } catch {
        return false;
    }
}

export type UnderstoodInbound = {
    note: string;
    image?: CoCoImageAttachment;
    document?: { name: string; text: string; truncated: boolean; pageCount: number };
};

type Downloaded = { bytes: Buffer; contentType: string } | null;

export async function understandInboundMedia(
    items: InboundMediaRef[],
    deps: {
        fetchMedia: (url: string, contentType: string) => Promise<Downloaded>;
        transcribe: (bytes: Buffer, contentType: string) => Promise<string | null>;
        extractPdf: (bytes: Buffer) => Promise<{ text: string; pageCount: number }>;
    },
): Promise<UnderstoodInbound> {
    const notes: string[] = [];
    let image: CoCoImageAttachment | undefined;
    let document: UnderstoodInbound['document'];

    for (const item of items.slice(0, MAX_INBOUND_MEDIA)) {
        if (!twilioMediaUrlAllowed(item.url)) {
            notes.push('Ignoré un archivo porque no venía de Twilio.');
            continue;
        }
        const kind = classifyInboundMedia(item.contentType);
        if (kind === 'other') {
            notes.push('Recibí un archivo que todavía no puedo leer. Mándame una foto, un audio o un PDF.');
            continue;
        }
        const downloaded = await deps.fetchMedia(item.url, item.contentType);
        if (!downloaded) {
            notes.push('No pude descargar uno de los archivos.');
            continue;
        }
        if (downloaded.bytes.length > MAX_INBOUND_BYTES) {
            notes.push('Un archivo supera los 5 MB.');
            continue;
        }
        if (kind === 'image' && !image) {
            const mediaType = item.contentType as CoCoImageMediaType;
            image = { mediaType, data: downloaded.bytes.toString('base64') };
            notes.push('Adjunto una imagen para que la mires.');
            continue;
        }
        if (kind === 'audio') {
            const transcript = (await deps.transcribe(downloaded.bytes, item.contentType))?.trim();
            notes.push(transcript
                ? `Transcripción del audio:\n${transcript.slice(0, MAX_INBOUND_TEXT)}`
                : 'Recibí un audio y no pude transcribirlo. Pídele que lo escriba.');
            continue;
        }
        if (kind === 'pdf' && !document) {
            try {
                const extracted = await deps.extractPdf(downloaded.bytes);
                const text = extracted.text.replace(/\s+/g, ' ').trim();
                document = {
                    name: 'adjunto.pdf',
                    text: text.slice(0, MAX_INBOUND_TEXT),
                    truncated: text.length > MAX_INBOUND_TEXT,
                    pageCount: extracted.pageCount,
                };
                if (!text) notes.push('El PDF no tiene texto seleccionable. Pídele una foto de la página.');
            } catch {
                notes.push('No pude leer el PDF.');
            }
        }
    }

    return { note: notes.join('\n\n'), ...(image ? { image } : {}), ...(document ? { document } : {}) };
}
