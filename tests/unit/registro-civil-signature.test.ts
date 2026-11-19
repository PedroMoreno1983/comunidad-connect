/**
 * 19-11-2026: el certificado de antecedentes se valida por su firma electrónica
 * del Registro Civil. Se arma un PDF firmado con una CA de prueba para recorrer
 * todos los caminos: intacto, modificado, sin firma, firmante ajeno, CA ajena.
 */
import { X509Certificate } from 'node:crypto';
import forge from 'node-forge';
import { describe, expect, it } from 'vitest';
import { verifyRegistroCivilSignature } from '@/lib/services/registroCivilSignature';

const keys = () => forge.pki.rsa.generateKeyPair({ bits: 1024, e: 0x10001 });

function makeCert(subject: Array<{ shortName?: string; name?: string; value: string }>, issuer: forge.pki.Certificate | null, key: forge.pki.rsa.KeyPair, issuerKey: forge.pki.rsa.PrivateKey, ca: boolean) {
    const cert = forge.pki.createCertificate();
    cert.publicKey = key.publicKey;
    cert.serialNumber = String(Math.floor(Math.random() * 1e9));
    cert.validity.notBefore = new Date('2025-01-01');
    cert.validity.notAfter = new Date('2030-01-01');
    cert.setSubject(subject);
    cert.setIssuer(issuer ? issuer.subject.attributes : subject);
    cert.setExtensions([{ name: 'basicConstraints', cA: ca }]);
    cert.sign(issuerKey, forge.md.sha256.create());
    return cert;
}

const rootKey = keys();
const root = makeCert([{ shortName: 'CN', value: 'CA de prueba' }], null, rootKey, rootKey.privateKey, true);
const signerKey = keys();
const signer = makeCert([{ shortName: 'CN', value: 'FUNCIONARIO DE PRUEBA' }, { name: 'emailAddress', value: 'funcionario@registrocivil.gob.cl' }], root, signerKey, rootKey.privateKey, false);
const trusted = new Set([new X509Certificate(forge.pki.certificateToPem(root)).fingerprint256]);

/** PDF mínimo con /ByteRange y /Contents, firmado de verdad sobre los dos tramos. */
function signedPdf(cert = signer, key = signerKey) {
    const placeholder = '0'.repeat(8192);
    const head = '%PDF-1.4\n1 0 obj\n<</Type/Sig/Filter/Adobe.PPKLite/SubFilter/adbe.pkcs7.detached/ByteRange [0 AAAAAAAAAA BBBBBBBBBB CCCCCCCCCC]/Contents <';
    const tail = '>>>\nendobj\n%%EOF\n';
    let text = head + placeholder + tail;
    const start = head.length - 1;
    const end = start + placeholder.length + 2;
    const pad = (n: number) => String(n).padEnd(10, ' ');
    text = text.replace('AAAAAAAAAA', pad(start)).replace('BBBBBBBBBB', pad(end)).replace('CCCCCCCCCC', pad(text.length - end));
    const signedBytes = text.slice(0, start) + text.slice(end);
    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(signedBytes, 'raw');
    p7.addCertificate(cert);
    p7.addCertificate(root);
    p7.addSigner({
        key: key.privateKey, certificate: cert, digestAlgorithm: forge.pki.oids.sha256,
        authenticatedAttributes: [
            { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
            { type: forge.pki.oids.messageDigest },
            { type: forge.pki.oids.signingTime, value: new Date('2026-11-16T13:20:51Z') as unknown as string },
        ],
    });
    p7.sign({ detached: true });
    const hex = forge.util.bytesToHex(forge.asn1.toDer(p7.toAsn1()).getBytes());
    return Buffer.from(text.slice(0, start + 1) + hex.padEnd(placeholder.length, '0') + text.slice(end - 1), 'latin1');
}

describe('firma del Registro Civil en el certificado de antecedentes', () => {
    it('PDF original e intacto: verificado', () => {
        const check = verifyRegistroCivilSignature(signedPdf(), new Date('2026-11-19'), trusted);
        expect(check).toMatchObject({ status: 'verified', signer: 'FUNCIONARIO DE PRUEBA', signedAt: '2026-11-16T13:20:51.000Z' });
    });

    it('un solo carácter cambiado o el archivo vuelto a guardar: modificado', () => {
        const pdf = signedPdf();
        const edited = Buffer.from(pdf);
        edited[3] = 0x45; // '%PDE-1.4'
        expect(verifyRegistroCivilSignature(edited, new Date('2026-11-19'), trusted).status).toBe('modified');
        expect(verifyRegistroCivilSignature(pdf.subarray(0, pdf.length - 4), new Date('2026-11-19'), trusted).status).toBe('modified');
    });

    it('con las anclas reales (Acepta), una CA de prueba no pasa', () => {
        expect(verifyRegistroCivilSignature(signedPdf(), new Date('2026-11-19')).status).toBe('untrusted');
    });

    it('firmado por alguien que no es del Registro Civil: no pasa', () => {
        const otherKey = keys();
        const other = makeCert([{ shortName: 'CN', value: 'Imprenta Falsa' }, { name: 'emailAddress', value: 'x@otra.cl' }], root, otherKey, rootKey.privateKey, false);
        expect(verifyRegistroCivilSignature(signedPdf(other, otherKey), new Date('2026-11-19'), trusted).status).toBe('untrusted');
    });

    it('foto o PDF sin firma: sin firma', () => {
        expect(verifyRegistroCivilSignature(Buffer.from('%PDF-1.4\n%%EOF'), new Date(), trusted).status).toBe('unsigned');
    });
});
