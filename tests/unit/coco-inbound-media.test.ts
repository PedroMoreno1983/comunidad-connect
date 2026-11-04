import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { classifyInboundMedia, parseTwilioMedia, twilioMediaUrlAllowed, understandInboundMedia } from '@/lib/coco/inboundMedia';
import { extractPdfText } from '@/lib/coco/pdfText';

const MEDIA = 'https://api.twilio.com/2010-04-01/Accounts/AC/Messages/MM/Media/ME';

describe('adjuntos de WhatsApp', () => {
    it('clasifica foto, audio y PDF, y solo acepta HTTPS de Twilio', () => {
        expect(classifyInboundMedia('image/jpeg')).toBe('image');
        expect(classifyInboundMedia('audio/ogg')).toBe('audio');
        expect(classifyInboundMedia('application/pdf')).toBe('pdf');
        expect(classifyInboundMedia('video/mp4')).toBe('other');
        expect(twilioMediaUrlAllowed(MEDIA)).toBe(true);
        expect(twilioMediaUrlAllowed('http://api.twilio.com/media')).toBe(false);
        expect(twilioMediaUrlAllowed('https://example.com/media')).toBe(false);
        expect(parseTwilioMedia({
            NumMedia: '2',
            MediaUrl0: MEDIA,
            MediaContentType0: 'audio/ogg; codecs=opus',
            MediaUrl1: `${MEDIA}2`,
            MediaContentType1: 'application/pdf',
        })).toEqual([
            { url: MEDIA, contentType: 'audio/ogg' },
            { url: `${MEDIA}2`, contentType: 'application/pdf' },
        ]);
    });

    it('arma la transcripción y la imagen sin descargar otra cosa', async () => {
        const understood = await understandInboundMedia([
            { url: MEDIA, contentType: 'audio/ogg' },
            { url: 'https://example.com/foto.jpg', contentType: 'image/jpeg' },
            { url: `${MEDIA}3`, contentType: 'image/png' },
        ], {
            fetchMedia: async () => ({ bytes: Buffer.from('foto'), contentType: 'image/png' }),
            transcribe: async () => 'Hay una filtración en el piso 2',
            extractPdf: async () => ({ text: '', pageCount: 0 }),
        });
        expect(understood.note).toContain('Hay una filtración en el piso 2');
        expect(understood.note).toContain('Ignoré un archivo');
        expect(understood.image?.mediaType).toBe('image/png');
        expect(understood.image?.data).toBe(Buffer.from('foto').toString('base64'));
    });

    it('extrae el texto de un PDF', async () => {
        const doc = await PDFDocument.create();
        const page = doc.addPage();
        page.drawText('Reglamento de mascotas', { font: await doc.embedFont(StandardFonts.Helvetica), size: 12, x: 50, y: 700 });
        const bytes = Buffer.from(await doc.save());
        const extracted = await extractPdfText(bytes);
        expect(extracted.pageCount).toBe(1);
        expect(extracted.text).toContain('Reglamento de mascotas');
    });
});
