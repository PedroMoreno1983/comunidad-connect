import { describe, expect, it } from 'vitest';
import { collectionNoticeCopy } from '@/lib/finance/collectionNoticeCopy';

describe('collectionNoticeCopy', () => {
  it('no promete pago en línea cuando la pasarela no está configurada', () => {
    const copy = collectionNoticeCopy('https://conviveconnect.com/', false);
    expect(copy.emailButton).toBe('Revisar el estado de cuenta');
    expect(copy.pdfLine).toContain('https://conviveconnect.com/expenses');
    expect(copy.pdfLine).toContain('no activo');
    expect(copy.emailNote).toContain('no está activo');
    expect(copy.emailNote).not.toContain('pasarela');
  });

  it('ofrece el pago cuando hay pasarela', () => {
    const copy = collectionNoticeCopy('https://conviveconnect.com', true);
    expect(copy.emailButton).toBe('Revisar y pagar');
    expect(copy.pdfLine.startsWith('Paga en línea')).toBe(true);
    expect(copy.emailNote).toContain('pasarela');
  });
});
