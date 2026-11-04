/** Texto de un PDF. Lo usan el chat de la app y WhatsApp. */

export async function extractPdfText(bytes: Uint8Array): Promise<{ text: string; pageCount: number }> {
    if (Buffer.from(bytes.subarray(0, 5)).toString() !== '%PDF-') throw new Error('INVALID_PDF');
    await import('pdf-parse/worker');
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: bytes });
    try {
        const extracted = await parser.getText();
        return {
            text: String(extracted.text || '').replace(/\0/g, '').replace(/\s+/g, ' ').trim(),
            pageCount: Number(extracted.total) || 0,
        };
    } finally {
        await parser.destroy();
    }
}
