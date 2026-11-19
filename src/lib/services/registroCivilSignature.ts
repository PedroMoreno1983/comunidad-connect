import { X509Certificate, createHash, verify as verifySignature } from 'node:crypto';
import forge from 'node-forge';

/**
 * Firma electrónica del Registro Civil en un certificado de antecedentes (19-11-2026).
 *
 * El certificado que se descarga de registrocivil.cl es un PDF firmado con firma
 * electrónica avanzada: un funcionario del Registro Civil (correo
 * @registrocivil.gob.cl) con certificado de Acepta. Verificar esa firma prueba
 * que el PDF lo emitió el Registro Civil y que nadie lo tocó después, sin pasar
 * por su sitio (que tiene captcha). Un PDF reimpreso, "guardado como" desde el
 * celular o editado rompe la firma: no se puede saber si dice lo mismo, así que
 * va a revisión humana.
 *
 * ASN.1 se lee con node-forge; las firmas y la cadena se verifican con node:crypto.
 */

/**
 * Anclas de confianza (SHA-256). La intermedia se comparó con la que publica
 * Acepta en https://acg4.acepta.com/descargas/acepta.com.g4.FirmaElectronicaAvanzada.cer
 * (19-11-2026); la raíz es la que firma esa intermedia.
 */
const TRUSTED_FINGERPRINTS = new Set([
    // Acepta.com Autoridad Certificadora de Firma Electronica Avanzada - G4
    'F5:BA:1E:39:B0:9B:EB:67:3B:0F:B2:86:21:60:30:DB:FE:B6:67:57:B9:61:8D:D2:E6:DE:A8:8A:79:A7:41:3E',
    // Acepta.com Autoridad Certificadora Raiz - G4
    '17:71:2B:CD:B9:1D:85:58:1C:B9:DF:15:BB:B3:3D:D0:8B:41:44:DE:35:DD:C8:B2:4B:B0:FC:19:20:AB:17:20',
]);

const DIGESTS: Record<string, string> = {
    '1.3.14.3.2.26': 'sha1',
    '2.16.840.1.101.3.4.2.1': 'sha256',
    '2.16.840.1.101.3.4.2.2': 'sha384',
    '2.16.840.1.101.3.4.2.3': 'sha512',
};
const OID_MESSAGE_DIGEST = '1.2.840.113549.1.9.4';
const OID_SIGNING_TIME = '1.2.840.113549.1.9.5';

export type RegistroCivilSignatureStatus =
    /** Firmado por el Registro Civil e intacto. */
    | 'verified'
    /** Tuvo la firma del Registro Civil, pero el archivo cambió después de firmarse. */
    | 'modified'
    /** Firmado, pero no por el Registro Civil o con una cadena que no reconocemos. */
    | 'untrusted'
    /** Sin firma electrónica (foto, escaneo, impresión a PDF). */
    | 'unsigned'
    /** La firma está dañada o no se pudo leer. */
    | 'invalid';

export interface RegistroCivilSignatureCheck {
    status: RegistroCivilSignatureStatus;
    detail: string;
    signer?: string;
    signedAt?: string;
}

const result = (status: RegistroCivilSignatureStatus, detail: string, extra: Partial<RegistroCivilSignatureCheck> = {}): RegistroCivilSignatureCheck =>
    ({ status, detail, ...extra });

function toX509(cert: forge.pki.Certificate) {
    return new X509Certificate(forge.pki.certificateToPem(cert));
}

/** El certificado del firmante es del Registro Civil: correo institucional u organización. */
function isRegistroCivil(cert: X509Certificate) {
    const text = `${cert.subject}\n${cert.subjectAltName ?? ''}`.toLowerCase();
    return /@registrocivil\.(gob\.)?cl\b/.test(text) || /o=.*registro civil/.test(text);
}

/** Sube por la cadena hasta un ancla de confianza. */
function chainsToTrustedAnchor(signer: X509Certificate, pool: X509Certificate[], at: Date, trusted: ReadonlySet<string>) {
    let current = signer;
    for (let depth = 0; depth < 6; depth++) {
        if (at < new Date(current.validFrom) || at > new Date(current.validTo)) return false;
        if (trusted.has(current.fingerprint256)) return true;
        const issuer = pool.find(candidate => candidate !== current && candidate.ca
            && current.checkIssued(candidate) && current.verify(candidate.publicKey));
        if (!issuer) return false;
        current = issuer;
    }
    return false;
}

function attribute(attrs: forge.asn1.Asn1[], oid: string) {
    const found = attrs.find(attr => Array.isArray(attr.value)
        && forge.asn1.derToOid((attr.value[0] as forge.asn1.Asn1).value as string) === oid);
    const set = found && Array.isArray(found.value) ? found.value[1] as forge.asn1.Asn1 : null;
    return set && Array.isArray(set.value) ? set.value[0] as forge.asn1.Asn1 : null;
}

/** `trusted` existe para los tests (una CA propia); en producción van las anclas de Acepta. */
export function verifyRegistroCivilSignature(pdf: Buffer, now = new Date(), trusted: ReadonlySet<string> = TRUSTED_FINGERPRINTS): RegistroCivilSignatureCheck {
    const text = pdf.toString('latin1');
    const ranges = [...text.matchAll(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g)];
    if (!ranges.length) return result('unsigned', 'El PDF no tiene firma electrónica: no es el archivo original del Registro Civil.');
    const [a, b, c, d] = ranges[ranges.length - 1].slice(1).map(Number);

    // La firma (hex largo de /Contents). Si el archivo se volvió a guardar, ya no
    // está en el hueco que declara /ByteRange: eso se reporta más abajo como modificado.
    const hex = [...text.matchAll(/\/Contents\s*<([0-9A-Fa-f]{512,})>/g)].pop()?.[1];
    if (!hex) return result('invalid', 'La firma del PDF no tiene el formato esperado.');
    const inPlace = a === 0 && text.slice(a + b, c) === `<${hex}>`;

    let signerInfo: forge.asn1.Asn1[];
    let certificates: forge.pki.Certificate[];
    try {
        const der = forge.util.hexToBytes(hex);
        // Los tipos de @types/node-forge no traen las opciones de fromDer.
        const asn1 = (forge.asn1.fromDer as unknown as (input: string, options: { strict: boolean; parseAllBytes: boolean }) => forge.asn1.Asn1)(der, { strict: false, parseAllBytes: false });
        const message = forge.pkcs7.messageFromAsn1(asn1) as forge.pkcs7.PkcsSignedData & { rawCapture?: { signerInfos?: forge.asn1.Asn1[] } };
        certificates = message.certificates ?? [];
        const info = message.rawCapture?.signerInfos?.[0];
        if (!info || !Array.isArray(info.value)) throw new Error('sin firmante');
        signerInfo = info.value as forge.asn1.Asn1[];
    } catch {
        return result('invalid', 'No se pudo leer la firma electrónica del PDF.');
    }

    const attrsNode = signerInfo.find(node => node.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && node.type === 0);
    const digestAlgorithm = signerInfo[2] && Array.isArray(signerInfo[2].value)
        ? DIGESTS[forge.asn1.derToOid((signerInfo[2].value[0] as forge.asn1.Asn1).value as string)] : undefined;
    const signatureNode = [...signerInfo].reverse().find(node => node.tagClass === forge.asn1.Class.UNIVERSAL && node.type === forge.asn1.Type.OCTETSTRING);
    if (!attrsNode || !Array.isArray(attrsNode.value) || !digestAlgorithm || !signatureNode) {
        return result('invalid', 'La firma del PDF no trae los datos que se necesitan para verificarla.');
    }
    const attrs = attrsNode.value as forge.asn1.Asn1[];

    // 1. Quién firmó: el certificado cuya llave valida la firma de los atributos.
    const signedAttributes = Buffer.from(forge.asn1.toDer(
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, attrs),
    ).getBytes(), 'binary');
    const signature = Buffer.from(signatureNode.value as string, 'binary');
    let pool: X509Certificate[];
    try {
        pool = certificates.map(toX509);
    } catch {
        return result('invalid', 'Los certificados de la firma no se pudieron leer.');
    }
    const signer = pool.find(cert => {
        try {
            return verifySignature(digestAlgorithm, signedAttributes, cert.publicKey, signature);
        } catch {
            return false;
        }
    });
    if (!signer) return result('invalid', 'La firma electrónica del PDF no es válida.');

    const signingTimeNode = attribute(attrs, OID_SIGNING_TIME);
    const signedAt = signingTimeNode ? forge.asn1.utcTimeToDate(signingTimeNode.value as string) : null;
    const signerName = signer.subject.split('\n').find(line => line.startsWith('CN='))?.slice(3) || 'sin nombre';
    const extra = { signer: signerName, signedAt: signedAt?.toISOString() };

    // 2. Que sea del Registro Civil y con una cadena que reconocemos.
    if (!isRegistroCivil(signer)) return result('untrusted', `El PDF está firmado por ${signerName}, que no es del Registro Civil.`, extra);
    if (!chainsToTrustedAnchor(signer, pool, signedAt ?? now, trusted)) {
        return result('untrusted', 'La firma no viene de una autoridad certificadora que reconozcamos para el Registro Civil.', extra);
    }

    // 3. Que el archivo sea exactamente el que se firmó.
    if (!inPlace || c + d !== pdf.length) {
        return result('modified', 'El PDF tiene la firma del Registro Civil, pero fue modificado o vuelto a guardar después de firmarse: pide el PDF original descargado de registrocivil.cl.', extra);
    }
    const messageDigest = attribute(attrs, OID_MESSAGE_DIGEST);
    const actual = createHash(digestAlgorithm).update(pdf.subarray(a, a + b)).update(pdf.subarray(c, c + d)).digest();
    if (!messageDigest || Buffer.from(messageDigest.value as string, 'binary').compare(actual) !== 0) {
        return result('modified', 'El contenido del PDF no coincide con lo que firmó el Registro Civil: fue modificado después de firmarse.', extra);
    }
    return result('verified', `Firma electrónica del Registro Civil verificada (${signerName}).`, extra);
}
