/**
 * Textos de la citación y del acta. Las partes con cifras, quórums y
 * resultados las arma este módulo de forma determinista desde los datos; la IA
 * solo redacta los párrafos de prosa (introducción de la citación y desarrollo
 * de la sesión), y si falla o no está configurada se usa el texto de respaldo.
 * Sin montos, sin nombres de personas y sin lenguaje de deudor.
 */
import { findMatter, QUORUM_CLASS_LABEL } from './catalog';
import { formatRightsPercent, RIGHTS_TOLERANCE_PERMILLE, RIGHTS_TOTAL_PERMILLE } from './unitRights';
import {
    CITATION_MAX_DAYS,
    CITATION_MIN_DAYS,
    MINUTES_SIGNATURE_DAYS,
    QUORUM_RULES,
    percentOf,
    sessionQuorumClass,
} from './rules';
import type {
    AgendaOutcome,
    AssemblyAgendaItem,
    AssemblyAttendanceRow,
    AssemblyModality,
    AssemblySessionType,
    AttendanceCapacity,
    EligibilityCertificate,
    RightsSnapshot,
} from './types';

export const SESSION_TYPE_LABEL: Record<AssemblySessionType, string> = {
    ordinary: 'ordinaria',
    extraordinary: 'extraordinaria de mayoría absoluta',
    reinforced: 'extraordinaria de mayoría reforzada',
};

export const MODALITY_LABEL: Record<AssemblyModality, string> = {
    in_person: 'Presencial',
    remote: 'Telemática',
    hybrid: 'Mixta (presencial y telemática)',
};

const CAPACITY_LABEL: Record<AttendanceCapacity, string> = {
    owner: 'Titular',
    proxy: 'Con poder',
    occupant: 'Arrendatario u ocupante',
};

const OUTCOME_LABEL: Record<AgendaOutcome, string> = {
    approved: 'Aprobado',
    rejected: 'No aprobado',
    no_quorum: 'Sin quórum para acordar',
};

export function formatChileDateTime(iso: string): string {
    return new Intl.DateTimeFormat('es-CL', {
        timeZone: 'America/Santiago', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso));
}

const fmtNumber = (value: number) => new Intl.NumberFormat('es-CL', { maximumFractionDigits: 4 }).format(value);
const fmtPct = (value: number) => `${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(value)}%`;
/** Derechos de una unidad o un total: con alícuota (guardada en ‰) en %; con 1 unidad = 1 voto, votos. */
const fmtRights = (weight: number, method: RightsSnapshot['method']) => method === 'share' ? formatRightsPercent(weight) || '0 %' : fmtNumber(weight);

export interface CitationInput {
    title: string;
    sessionType: AssemblySessionType;
    modality: AssemblyModality;
    scheduledAt: string;
    location: string;
    videoUrl: string;
    items: Pick<AssemblyAgendaItem, 'position' | 'title' | 'description' | 'matterCode' | 'quorumClass'>[];
    notaryRequired: boolean;
}

export function fallbackCitationIntro(input: CitationInput): string {
    return `La comunidad se reúne para conversar y decidir juntos los temas de la tabla. Tu participación, en persona o en línea, es la que da fuerza a los acuerdos: te esperamos en la asamblea ${SESSION_TYPE_LABEL[input.sessionType]} "${input.title}".`;
}

/** Cuerpo determinista: fecha, modalidad, tabla con quórums, representación y notario. */
export function citationBody(input: CitationInput): string {
    const lines: string[] = [];
    lines.push(`**Fecha y hora:** ${formatChileDateTime(input.scheduledAt)} (hora de Chile).`);
    lines.push(`**Modalidad:** ${MODALITY_LABEL[input.modality]}.`);
    if (input.modality !== 'remote') lines.push(`**Lugar:** ${input.location || 'en el condominio'}.`);
    if (input.modality !== 'in_person') {
        lines.push(`**Enlace de la videollamada:** ${input.videoUrl}`);
        lines.push('Al acreditarte y al votar en línea te identificaremos con imagen y voz, así que ten la cámara y el micrófono a mano. Puedes conectarte desde donde estés: para todos los efectos, la sesión se celebra en el domicilio del condominio (DS 7, art. 16).');
    }
    lines.push('', '### Tabla');
    const sessionClass = sessionQuorumClass(input.sessionType);
    input.items.forEach(item => {
        const matter = findMatter(item.matterCode);
        lines.push(`${item.position}. **${item.title}**${matter ? ` — materia ${matter.reference} del cuadro del art. 15 (${QUORUM_CLASS_LABEL[item.quorumClass].toLowerCase()})` : ''}.`);
        if (item.description) lines.push(`   ${item.description}`);
        lines.push(`   Para acordar: ${QUORUM_RULES[item.quorumClass].agreement}`);
    });
    lines.push('', '### Quórum para sesionar');
    lines.push(QUORUM_RULES[sessionClass].constitution);
    lines.push('Cada unidad vota en proporción a sus derechos en los bienes comunes (Ley 21.442, art. 15).');
    lines.push('', '### Quiénes votan');
    lines.push('Todos los copropietarios pueden asistir y opinar. Votan los copropietarios hábiles: al día con la comunidad o con un convenio vigente (Ley 21.442, arts. 2 N°13 y 15; DS 7, art. 9). Lo acredita el certificado que emite el administrador el día de la sesión. Cada unidad ve en la app, en privado, si está habilitada; si necesitas ponerte al día o conversar un convenio, todavía estás a tiempo.');
    if (input.sessionType !== 'ordinary') lines.push('En esta sesión extraordinaria solo se tratarán las materias de esta tabla (art. 14).');
    lines.push('', '### Si no puedes asistir');
    lines.push('Puedes hacerte representar con un poder, según lo que disponga el reglamento de copropiedad (DS 7, art. 11). Regístralo en la app antes de la sesión para que administración lo revise. El administrador no puede representar a ningún copropietario (art. 15).');
    if (input.notaryRequired) {
        lines.push('', '### Notario');
        lines.push('Por las materias de la tabla asistirá un notario, que certificará el acta (art. 15).');
    }
    lines.push('', `_Esta citación se envía con ${CITATION_MIN_DAYS} a ${CITATION_MAX_DAYS} días de anticipación, como pide la Ley 21.442 (art. 16)._`);
    return lines.join('\n');
}

export function composeCitation(input: CitationInput, intro: string): string {
    return `## Citación a asamblea ${SESSION_TYPE_LABEL[input.sessionType]} de copropietarios\n\n${intro.trim()}\n\n${citationBody(input)}`;
}

export interface MinutesInput {
    title: string;
    sessionType: AssemblySessionType;
    modality: AssemblyModality;
    scheduledAt: string;
    startedAt: string | null;
    closedAt: string | null;
    location: string;
    rights: RightsSnapshot;
    attendance: AssemblyAttendanceRow[];
    items: AssemblyAgendaItem[];
    notaryRequired: boolean;
    notaryName: string;
    dueOn: string;
    /** Totales del certificado de habilidad (nunca qué unidades). */
    eligibility?: EligibilityCertificate | null;
    /** ¿Los derechos hábiles presentes constituyeron la sesión? (sin la cifra, para no exponer a nadie). */
    constitutionMet?: boolean | null;
}

/** Sección del acta con el certificado de habilidad: solo totales, sin unidades. */
export function eligibilityMinutesSection(certificate: EligibilityCertificate | null | undefined, method: RightsSnapshot['method']): string[] {
    if (!certificate) {
        return ['', '### Copropietarios hábiles', 'No se emitió certificado de habilidad para esta sesión.'];
    }
    const rights = method === 'share'
        ? (Math.abs(certificate.totalWeight - RIGHTS_TOTAL_PERMILLE) <= RIGHTS_TOLERANCE_PERMILLE
            ? `el ${fmtRights(certificate.eligibleWeight, method)} de los derechos del condominio`
            : `${fmtRights(certificate.eligibleWeight, method)} de ${fmtRights(certificate.totalWeight, method)} de los derechos del condominio (${fmtPct(certificate.eligibleShare)})`)
        : `${fmtNumber(certificate.eligibleWeight)} de ${fmtNumber(certificate.totalWeight)} votos (1 unidad = 1 voto; ${fmtPct(certificate.eligibleShare)})`;
    return [
        '', '### Copropietarios hábiles',
        `Según el certificado de habilidad emitido por el administrador${certificate.issuedByName ? `, ${certificate.issuedByName},` : ''} el ${formatChileDateTime(certificate.issuedAt)}, con fecha de corte ${certificate.cutoffDate}, estaban habilitadas para votar ${certificate.eligibleUnits} de ${certificate.totalUnits} unidades, con ${rights} (Ley 21.442, arts. 2 N°13 y 15; DS 7, arts. 9 y 14).`,
        'Todas las unidades pudieron asistir con derecho a voz. El quórum para sesionar se verificó con los derechos hábiles presentes, sobre el total de derechos del condominio; los acuerdos, con los votos de las unidades habilitadas y la base que fija el cuadro del art. 15.',
    ];
}

export function fallbackMinutesNarrative(input: MinutesInput): string {
    const approved = input.items.filter(item => item.outcome === 'approved').length;
    return `La sesión se desarrolló conforme a la tabla de la citación. Se trataron ${input.items.length} punto(s) y se aprobaron ${approved}. Los resultados y el quórum de cada acuerdo se detallan a continuación.`;
}

/** Acta determinista con asistencia por unidad, quórums, resultados y acuerdos. */
export function composeMinutes(input: MinutesInput, narrative: string): string {
    const verified = input.attendance.filter(row => row.status === 'present' && row.identityVerifiedAt);
    const presentWeight = verified.reduce((sum, row) => sum + row.weight, 0);
    const lines: string[] = [];
    lines.push(`## Acta de la asamblea ${SESSION_TYPE_LABEL[input.sessionType]} de copropietarios`);
    lines.push(`**${input.title}**`, '');
    lines.push(`**Fecha:** ${formatChileDateTime(input.scheduledAt)}.`);
    lines.push(`**Modalidad:** ${MODALITY_LABEL[input.modality]}.${input.modality === 'in_person' ? ` Lugar: ${input.location || 'el condominio'}.` : ' Lugar de celebración: el domicilio del condominio (DS 7, art. 16).'}`);
    if (input.startedAt) lines.push(`**Inicio:** ${formatChileDateTime(input.startedAt)}.`);
    if (input.closedAt) lines.push(`**Cierre:** ${formatChileDateTime(input.closedAt)}.`);
    lines.push('', '### Asistencia y quórum de constitución');
    lines.push(`Asistieron, acreditadas, ${verified.length} de ${input.rights.units.length} unidades, que representan el ${fmtPct(percentOf(presentWeight, input.rights.total))} de los derechos del condominio.`);
    lines.push(input.rights.method === 'share'
        ? (input.rights.provisional
            ? 'Los derechos se contaron según la alícuota de cada unidad, cargada en forma provisoria: no estaba verificada contra el reglamento de copropiedad.'
            : 'Los derechos se contaron según la alícuota de cada unidad.')
        : 'Los derechos se contaron como 1 unidad = 1 voto porque no todas las unidades tenían alícuota cargada.');
    lines.push(`Quórum exigido para sesionar: ${QUORUM_RULES[sessionQuorumClass(input.sessionType)].constitution}`);
    if (typeof input.constitutionMet === 'boolean') {
        lines.push(input.constitutionMet
            ? 'Con los derechos hábiles presentes, la sesión quedó válidamente constituida.'
            : 'Con los derechos hábiles presentes, la sesión no alcanzó el quórum para sesionar.');
    }
    if (verified.length) {
        lines.push('', '| Unidad | Calidad | Modalidad | Derechos |', '|---|---|---|---|');
        [...verified].sort((a, b) => a.unitLabel.localeCompare(b.unitLabel, 'es')).forEach(row => {
            lines.push(`| ${row.unitLabel} | ${CAPACITY_LABEL[row.capacity]} | ${row.mode === 'remote' ? 'En línea (imagen y voz verificadas)' : 'Presencial'} | ${fmtRights(row.weight, input.rights.method)} |`);
        });
    }
    lines.push(...eligibilityMinutesSection(input.eligibility, input.rights.method));
    lines.push('', '### Desarrollo de la sesión', narrative.trim());
    lines.push('', '### Acuerdos');
    for (const item of input.items) {
        const matter = findMatter(item.matterCode);
        lines.push(`**${item.position}. ${item.title}**${matter ? ` (materia ${matter.reference}, ${QUORUM_CLASS_LABEL[item.quorumClass].toLowerCase()})` : ''}`);
        if (!item.result || !item.outcome) {
            lines.push('- No se sometió a votación.', '');
            continue;
        }
        const { tally, percentages } = item.result;
        lines.push(`- Resultado: **${OUTCOME_LABEL[item.outcome]}**.`);
        const unit = input.rights.method === 'share' ? 'de los derechos' : 'votos';
        lines.push(`- A favor: ${fmtRights(tally.yes, input.rights.method)} · En contra: ${fmtRights(tally.no, input.rights.method)} · Abstenciones: ${fmtRights(tally.abstain, input.rights.method)} (${unit}).`);
        lines.push(`- A favor sobre la base de ${percentages.base === 'present' ? 'los derechos presentes' : 'los derechos del condominio'}: ${fmtPct(percentages.yesOfBase)}. Presentes al votar: ${fmtPct(percentages.presentOfTotal)} de los derechos.`);
        lines.push(`- Regla aplicada: ${item.result.rule}`);
        if (item.notes) lines.push(`- Observaciones: ${item.notes}`);
        lines.push('');
    }
    if (input.notaryRequired) {
        lines.push('### Notario', `Asistió y certifica el acta: ${input.notaryName || '[nombre del notario]'} (Ley 21.442, art. 15). Si la naturaleza del acuerdo lo requiere, el acta se reduce a escritura pública.`, '');
    }
    lines.push('### Firmas');
    lines.push(`Esta acta se firma, presencial o electrónicamente, a más tardar el ${input.dueOn} (dentro de ${MINUTES_SIGNATURE_DAYS} días del acuerdo), por todos los miembros del comité de administración o por los copropietarios que designe la asamblea, y queda en el libro de actas bajo custodia del presidente del comité (art. 15).`);
    return lines.join('\n');
}

/** Valida un párrafo de la IA: corto, sin montos ni datos de contacto. */
export function acceptableAiProse(text: string, maxLength: number): boolean {
    const trimmed = text.trim();
    if (trimmed.length < 20 || trimmed.length > maxLength) return false;
    if (/\$\s?\d|\bCLP\b|\bUF\b/i.test(trimmed)) return false;
    if (/@[a-z0-9-]+\.[a-z]/i.test(trimmed) || /\+?56\s?9\s?\d{4}/.test(trimmed)) return false;
    if (/\b(moros|deudor|deuda|morosidad)/i.test(trimmed)) return false;
    return true;
}
