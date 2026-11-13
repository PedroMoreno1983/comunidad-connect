/**
 * Chequeo automático de documentos de un maestro: RUT, nombre, fecha y
 * anotaciones; lectura de la respuesta de la IA; tipo real de los archivos.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/supabaseAdmin', () => ({ supabaseAdmin: {}, getSupabaseAdmin: () => ({}) }));
vi.setConfig({ testTimeout: 60_000 });

import { assessProviderDocument, isValidRut, namesMatch } from '@/lib/services/providerDocumentRules';
import type { ProviderDocumentExtraction } from '@/lib/types';

const certificate = (overrides: Partial<ProviderDocumentExtraction> = {}): ProviderDocumentExtraction => ({
    documentType: 'background_certificate', fullName: 'JUAN ANDRÉS PÉREZ SOTO', rut: '12.345.678-5',
    issueDate: '2026-11-01', expiryDate: null, hasRecords: false, verificationCode: 'ABC123', ...overrides,
});

describe('RUT', () => {
    it('valida el dígito verificador', () => {
        expect(isValidRut('12.345.678-5')).toBe(true);
        expect(isValidRut('11111111-1')).toBe(true);
        expect(isValidRut('12.345.678-9')).toBe(false);
        expect(isValidRut('abc')).toBe(false);
        expect(isValidRut(null)).toBe(false);
    });
});

describe('nombre', () => {
    it('calza con dos palabras en común, sin tildes ni mayúsculas', () => {
        expect(namesMatch('JUAN ANDRÉS PÉREZ SOTO', 'Juan Perez')).toBe(true);
        expect(namesMatch('MARÍA LÓPEZ', 'Juan Pérez')).toBe(false);
    });
});

describe('veredicto', () => {
    const today = '2026-11-14';

    it('un certificado reciente, sin anotaciones y con RUT válido se ve bien', () => {
        expect(assessProviderDocument('background_certificate', certificate(), 'Juan Pérez', today).verdict).toBe('looks_ok');
    });

    it('con anotaciones o RUT inválido es un problema', () => {
        expect(assessProviderDocument('background_certificate', certificate({ hasRecords: true }), 'Juan Pérez', today).verdict).toBe('problem');
        expect(assessProviderDocument('background_certificate', certificate({ rut: '12.345.678-9' }), 'Juan Pérez', today).verdict).toBe('problem');
    });

    it('antiguo, con otro nombre o ilegible hay que revisarlo a mano', () => {
        expect(assessProviderDocument('background_certificate', certificate({ issueDate: '2026-06-01' }), 'Juan Pérez', today).verdict).toBe('needs_review');
        expect(assessProviderDocument('background_certificate', certificate(), 'María López', today).verdict).toBe('needs_review');
        expect(assessProviderDocument('background_certificate', null, 'Juan Pérez', today).verdict).toBe('needs_review');
    });

    it('una cédula vencida o un documento equivocado es un problema', () => {
        const identity = certificate({ documentType: 'identity', hasRecords: null, expiryDate: '2026-01-01' });
        expect(assessProviderDocument('identity', identity, 'Juan Pérez', today).verdict).toBe('problem');
        expect(assessProviderDocument('identity', certificate(), 'Juan Pérez', today).verdict).toBe('problem');
    });
});

describe('lectura de la IA', () => {
    it('acepta el JSON aunque venga con texto alrededor y descarta lo que no calza', async () => {
        const { parseDocumentExtraction } = await import('@/lib/services/providerDocumentCheck');
        expect(parseDocumentExtraction('Aquí va: {"documentType":"identity","fullName":"Ana","rut":"11111111-1","issueDate":"10/10/2020","hasRecords":"no"}')).toEqual({
            documentType: 'identity', fullName: 'Ana', rut: '11111111-1', issueDate: null, expiryDate: null, hasRecords: null, verificationCode: null,
        });
        expect(parseDocumentExtraction('no pude leerlo')).toBeNull();
    });
});

describe('tipo real del archivo', () => {
    it('reconoce JPG, PNG, WEBP y PDF por sus bytes, no por el nombre', async () => {
        const { sniffFileType } = await import('@/lib/services/providerMedia');
        expect(sniffFileType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
        expect(sniffFileType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
        expect(sniffFileType(Buffer.from('RIFF0000WEBPVP8 ', 'latin1'))).toBe('image/webp');
        expect(sniffFileType(Buffer.from('%PDF-1.7', 'latin1'))).toBe('application/pdf');
        expect(sniffFileType(Buffer.from('<html><script>', 'latin1'))).toBeNull();
    });
});
