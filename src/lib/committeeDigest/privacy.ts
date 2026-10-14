import type { CommitteeDigestPrivacyIssue, CommitteeDigestPrivacyResult } from './types';

/**
 * Reglas de privacidad del resumen semanal (regla de fondo del agente operador):
 * la cobranza construye comunidad, así que el resumen nunca nombra unidades ni
 * personas, nunca muestra montos y nunca usa lenguaje de deudor ni amenazas.
 *
 * Se aplican tres veces: a los títulos que entran a las métricas, a lo que
 * redacta la IA (si falla, se usa el texto determinista) y a la edición del
 * administrador antes de publicar.
 */

const AMOUNT = /\$\s?\d|\b\d{1,3}(?:\.\d{3})+(?:,\d+)?\b|\bclp\b|\bpesos\b|\buf\s?\d/i;
const UNIT = /\b(?:depto|dpto|departamento|depa|unidad|casa|parcela|oficina|local|bodega|estacionamiento)\.?\s*(?:n[°º.]?\s*)?[a-z]?-?\d+[a-z]?\b|\btorre\s+\w+\s*[-,]?\s*\d{2,}\b/i;
const HONORIFIC = /(?:^|[^\p{L}])(?:[Ss]rta?|[Ss]ra|[Ss]eñor(?:a|ita)?|[Dd]on|[Dd]oña|[Vv]ecin[oa])\.?\s+\p{Lu}\p{Ll}+/u;
const DEBTOR = /\bmoros[oa]s?\b|\bmorosidad(?:es)?\b|\bdeudor(?:a|es|as)?\b|\bdeudas?\b|\bincumplid[oa]s?\b|\bimpag[oa]s?\b|\bque no paga/i;
const THREAT = /\bsanci[oó]n|\bsancion(?:ar|es)\b|\bmultas?\b|\bembarg|\bjudicial|\bdemanda[rs]?\b|\bcobranza externa|\bcorte de suministro|\bcortar (?:el|la) (?:luz|agua|suministro)|\bsuspensi[oó]n de servicios?|\bexpuls|\bpublicar (?:la )?lista|\blista de (?:deudores|morosos)/i;
const CONTACT = /[\w.+-]+@[\w-]+\.[\w.]+|(?:\+?56\s?)?9\s?\d{4}\s?\d{4}\b/;

function fold(text: string): string {
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function escapeRegExp(text: string) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Nombres que el texto no puede contener: los perfiles de la comunidad. Solo
 * se buscan nombres compuestos (nombre y apellido) para no confundir un nombre
 * de pila suelto con una palabra común.
 */
export function normalizeKnownNames(names: Array<string | null | undefined>): string[] {
    const unique = new Set<string>();
    for (const raw of names) {
        const name = fold(String(raw || '').trim()).replace(/\s+/g, ' ');
        if (name.length >= 5 && name.includes(' ')) unique.add(name);
    }
    return [...unique];
}

function containsKnownName(text: string, knownNames: string[]) {
    if (!knownNames.length) return false;
    const folded = fold(text);
    return knownNames.some(name => new RegExp(`(^|[^a-z0-9])${escapeRegExp(name)}([^a-z0-9]|$)`).test(folded));
}

export function checkDigestPrivacy(text: string, knownNames: string[] = []): CommitteeDigestPrivacyResult {
    const issues: CommitteeDigestPrivacyIssue[] = [];
    if (AMOUNT.test(text)) issues.push('amount');
    if (UNIT.test(text)) issues.push('unit');
    if (HONORIFIC.test(text) || containsKnownName(text, knownNames)) issues.push('person');
    if (DEBTOR.test(text)) issues.push('debtor_language');
    if (THREAT.test(text)) issues.push('threat');
    if (CONTACT.test(text)) issues.push('contact');
    return { ok: issues.length === 0, issues };
}

const ISSUE_COPY: Record<CommitteeDigestPrivacyIssue, string> = {
    amount: 'montos',
    unit: 'referencias a unidades',
    person: 'nombres de personas',
    debtor_language: 'lenguaje de deudor',
    threat: 'amenazas o sanciones',
    contact: 'datos de contacto',
};

export function privacyIssueMessage(issues: CommitteeDigestPrivacyIssue[]): string {
    const parts = [...new Set(issues)].map(issue => ISSUE_COPY[issue]);
    return `El resumen no puede incluir ${parts.join(', ')}. Ajusta el texto: el comité ve solo datos agregados.`;
}

/**
 * Limpia un título público (aviso o votación) antes de que entre al resumen.
 * Devuelve null si sigue sin cumplir las reglas después de limpiar.
 */
export function scrubPublicTitle(title: string | null | undefined, knownNames: string[] = []): string | null {
    const cleaned = String(title || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 90);
    if (!cleaned) return null;
    return checkDigestPrivacy(cleaned, knownNames).ok ? cleaned : null;
}
