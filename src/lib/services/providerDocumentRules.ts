import type { ProviderDocumentAutoCheck, ProviderDocumentExtraction, ProviderDocumentKind } from '@/lib/types';

/**
 * Reglas del chequeo automático de documentos de un maestro. Son puras: la
 * lectura del documento (IA) entrega una extracción y aquí se decide qué se ve
 * bien y qué hay que mirar. No reemplazan la revisión humana: el certificado
 * se puede validar contra el Registro Civil con su folio y código, cosa que el
 * sistema no hace.
 */

/** Días que se acepta un certificado de antecedentes desde su emisión. */
export const BACKGROUND_CERTIFICATE_MAX_AGE_DAYS = 60;

/** RUT chileno con dígito verificador válido (módulo 11). Acepta puntos y guion. */
export function isValidRut(value: string | null | undefined): boolean {
    const clean = String(value || '').replace(/[.\s-]/g, '').toUpperCase();
    if (!/^\d{7,8}[\dK]$/.test(clean)) return false;
    const body = clean.slice(0, -1);
    const dv = clean.slice(-1);
    let sum = 0;
    let factor = 2;
    for (let i = body.length - 1; i >= 0; i -= 1) {
        sum += Number(body[i]) * factor;
        factor = factor === 7 ? 2 : factor + 1;
    }
    const rest = 11 - (sum % 11);
    const expected = rest === 11 ? '0' : rest === 10 ? 'K' : String(rest);
    return dv === expected;
}

function words(value: string) {
    return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
        .split(/[^a-zñ]+/).filter(word => word.length >= 3);
}

/** El nombre del documento calza con el del perfil: al menos dos palabras en común (o todas si tiene una). */
export function namesMatch(documentName: string | null | undefined, profileName: string): boolean {
    const doc = new Set(words(String(documentName || '')));
    const profile = words(profileName);
    if (!doc.size || !profile.length) return false;
    const shared = profile.filter(word => doc.has(word)).length;
    return shared >= Math.min(2, profile.length);
}

function daysBetween(fromIso: string, toIso: string) {
    return Math.floor((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

export function assessProviderDocument(
    kind: ProviderDocumentKind,
    extracted: ProviderDocumentExtraction | null,
    providerName: string,
    todayIso: string,
): ProviderDocumentAutoCheck {
    if (!extracted) {
        return { verdict: 'needs_review', findings: ['No se pudo leer el documento automáticamente: revísalo a mano.'], extracted: null };
    }
    const problems: string[] = [];
    const warnings: string[] = [];
    const okNotes: string[] = [];

    const expectedType = kind === 'background_certificate' ? 'background_certificate' : 'identity';
    if (extracted.documentType !== expectedType) {
        problems.push(kind === 'background_certificate'
            ? 'No parece un certificado de antecedentes.'
            : 'No parece una cédula de identidad.');
    }

    if (!extracted.rut) warnings.push('No se encontró el RUT.');
    else if (!isValidRut(extracted.rut)) problems.push(`El RUT ${extracted.rut} no tiene un dígito verificador válido.`);
    else okNotes.push(`RUT ${extracted.rut} válido.`);

    if (!extracted.fullName) warnings.push('No se encontró el nombre.');
    else if (!namesMatch(extracted.fullName, providerName)) warnings.push(`El nombre del documento (${extracted.fullName}) no calza con el del perfil (${providerName}).`);
    else okNotes.push('El nombre calza con el perfil.');

    if (kind === 'background_certificate') {
        if (!extracted.issueDate) warnings.push('No se encontró la fecha de emisión.');
        else {
            const age = daysBetween(extracted.issueDate, todayIso);
            if (age < 0) problems.push('La fecha de emisión es futura.');
            else if (age > BACKGROUND_CERTIFICATE_MAX_AGE_DAYS) warnings.push(`El certificado tiene ${age} días: pide uno emitido hace menos de ${BACKGROUND_CERTIFICATE_MAX_AGE_DAYS}.`);
            else okNotes.push(`Emitido hace ${age} días.`);
        }
        if (extracted.hasRecords === true) problems.push('El certificado registra anotaciones.');
        else if (extracted.hasRecords === false) okNotes.push('Sin anotaciones.');
        else warnings.push('No se pudo determinar si tiene anotaciones.');
        if (extracted.verificationCode) okNotes.push(`Folio o código de verificación: ${extracted.verificationCode} (se puede validar en el Registro Civil).`);
    } else if (extracted.expiryDate && extracted.expiryDate < todayIso) {
        problems.push('La cédula está vencida.');
    }

    const verdict = problems.length ? 'problem' : warnings.length ? 'needs_review' : 'looks_ok';
    return { verdict, findings: [...problems, ...warnings, ...okNotes], extracted };
}
