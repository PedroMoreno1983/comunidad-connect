import { checkDigestPrivacy } from './privacy';
import { dayLabel, periodLabel } from './week';
import type { CommitteeDigestMetrics, CommitteeDigestSource } from './types';

/**
 * Redacción del resumen semanal. La IA redacta a partir de las métricas
 * agregadas; si falla, no responde a tiempo o su texto no cumple las reglas de
 * privacidad, se usa este texto determinista. El comité nunca recibe un
 * resumen sin revisar: ambos caminos terminan en un borrador para el admin.
 */

export const DECISIONS_HEADING = 'Decisiones sugeridas para el comité';
export const MAX_DIGEST_LENGTH = 3000;

const plural = (count: number, singular: string, pluralForm = `${singular}s`) => `${count} ${count === 1 ? singular : pluralForm}`;

function list(items: string[]): string {
    if (items.length <= 1) return items.join('');
    return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

/** Entre 2 y 3 decisiones, ordenadas por lo que más ayuda a la comunidad esta semana. */
export function suggestCommitteeDecisions(metrics: CommitteeDigestMetrics): string[] {
    const { collection, maintenance, requests, community } = metrics;
    const decisions: string[] = [];
    if (maintenance.highRiskAssets.length) {
        decisions.push(`Priorizar la mantención de ${list(maintenance.highRiskAssets.slice(0, 2))}, que hoy muestra${maintenance.highRiskAssets.length > 1 ? 'n' : ''} riesgo alto.`);
    }
    if (maintenance.quotesAwaitingDecision) {
        decisions.push(`Revisar con administración ${plural(maintenance.quotesAwaitingDecision, 'trabajo')} con cotizaciones recibidas que espera${maintenance.quotesAwaitingDecision === 1 ? '' : 'n'} una decisión.`);
    }
    if (collection.agreementsPendingCommittee) {
        decisions.push(`Revisar ${plural(collection.agreementsPendingCommittee, 'convenio')} de pago que espera${collection.agreementsPendingCommittee === 1 ? '' : 'n'} la aprobación del comité.`);
    }
    if (collection.upToDatePercent !== null && collection.upToDatePercent < 85) {
        decisions.push('Acordar con administración una invitación cercana a conversar o a pactar un convenio, para que más vecinos se pongan al día.');
    }
    if (requests.recurringThemes.length) {
        decisions.push(`Definir una medida o un comunicado sobre ${requests.recurringThemes[0].theme}, el tema que más se repite.`);
    }
    if (community.pollsClosingSoon) {
        decisions.push('Invitar a participar en la votación que cierra esta semana.');
    }
    if (maintenance.overdueTasks && decisions.length < 3) {
        decisions.push(`Pedir un plan para ponerse al día con ${plural(maintenance.overdueTasks, 'tarea')} de mantención atrasada${maintenance.overdueTasks === 1 ? '' : 's'}.`);
    }
    const defaults = [
        'Reconocer el trabajo del equipo y de los vecinos que sostienen la vida en comunidad esta semana.',
        'Fijar los temas de la próxima reunión de comité a partir de este resumen.',
    ];
    for (const item of defaults) if (decisions.length < 2) decisions.push(item);
    return decisions.slice(0, 3);
}

/** Texto determinista: mismo formato que pide la IA, breve y escaneable. */
export function composeFallbackDigest(metrics: CommitteeDigestMetrics): string {
    const { window, collection, maintenance, requests, community } = metrics;
    const lines: string[] = [`## Resumen de la semana · ${periodLabel(window.periodStart, window.periodEnd)}`, ''];

    lines.push('**Recaudación**');
    if (collection.upToDatePercent === null) lines.push('- Aún no hay unidades registradas para medir la recaudación.');
    else lines.push(`- ${collection.upToDatePercent}% de las unidades está al día con sus gastos comunes.`);
    lines.push(`- ${plural(collection.activeAgreements, 'convenio')} de pago vigente${collection.activeAgreements === 1 ? '' : 's'}${collection.newAgreements ? ` (${collection.newAgreements} nuevo${collection.newAgreements === 1 ? '' : 's'} esta semana)` : ''}${collection.agreementsPendingCommittee ? ` y ${collection.agreementsPendingCommittee} por revisar en el comité` : ''}.`);
    lines.push('');

    lines.push('**Mantención**');
    lines.push(`- ${plural(maintenance.completedTasks, 'tarea')} cerrada${maintenance.completedTasks === 1 ? '' : 's'} y ${plural(maintenance.openTasks, 'abierta')}${maintenance.overdueTasks ? `, ${maintenance.overdueTasks} con atraso` : ''}.`);
    if (maintenance.highRiskAssets.length) lines.push(`- Riesgo alto: ${list(maintenance.highRiskAssets)}.`);
    if (maintenance.pendingQuotes || maintenance.quotesAwaitingDecision) {
        lines.push(`- Cotizaciones: ${plural(maintenance.pendingQuotes, 'pedida')} sin respuesta${maintenance.quotesAwaitingDecision ? ` y ${plural(maintenance.quotesAwaitingDecision, 'trabajo')} esperando decisión` : ''}.`);
    }
    lines.push('');

    lines.push('**Solicitudes y casos**');
    lines.push(`- Solicitudes: ${plural(requests.newRequests, 'nueva')}, ${plural(requests.resolvedRequests, 'resuelta')} y ${plural(requests.openRequests, 'abierta')}.`);
    lines.push(`- Casos de convivencia: ${plural(requests.resolvedCases, 'resuelto')} y ${plural(requests.openCases, 'abierto')}.`);
    if (requests.recurringThemes.length) lines.push(`- Temas que se repiten: ${list(requests.recurringThemes.map(theme => `${theme.theme} (${theme.count})`))}.`);
    lines.push('');

    lines.push('**Vida en comunidad**');
    lines.push(`- ${plural(community.bookings, 'reserva')} de espacios comunes y ${plural(community.announcements, 'aviso')} publicado${community.announcements === 1 ? '' : 's'}.`);
    if (community.activePolls.length) {
        lines.push(`- Votaciones en curso: ${list(community.activePolls.map(poll => poll.endsOn ? `${poll.title} (cierra el ${dayLabel(poll.endsOn)})` : poll.title))}.`);
    }
    lines.push('');

    lines.push('**La próxima semana**');
    const upcoming: string[] = [];
    if (maintenance.upcomingPreventive) upcoming.push(plural(maintenance.upcomingPreventive, 'mantención preventiva', 'mantenciones preventivas'));
    if (community.upcomingBookings) upcoming.push(plural(community.upcomingBookings, 'reserva'));
    if (community.pollsClosingSoon) upcoming.push(`${plural(community.pollsClosingSoon, 'votación', 'votaciones')} que cierra${community.pollsClosingSoon === 1 ? '' : 'n'}`);
    lines.push(upcoming.length ? `- ${list(upcoming)}.` : '- Sin hitos agendados por ahora.');
    lines.push('');

    lines.push(`**${DECISIONS_HEADING}**`);
    suggestCommitteeDecisions(metrics).forEach((decision, index) => lines.push(`${index + 1}. ${decision}`));
    return lines.join('\n').trim();
}

export const COMMITTEE_DIGEST_SYSTEM_PROMPT = `Redactas el resumen semanal de una comunidad de vecinos en Chile para su comité de administración.
Principio: la convivencia construye comunidad. Tono cercano, sereno y propositivo; reconoce lo que funcionó.
Reglas obligatorias:
- Usa solo las cifras agregadas que recibes. No inventes datos.
- Nunca nombres unidades, departamentos ni personas. Nunca muestres montos de dinero.
- No uses lenguaje de deudor (moroso, deudor, deuda, morosidad) ni amenazas o sanciones. Habla de "unidades al día" y de convenios como una salida.
- Breve y escaneable: máximo 220 palabras, viñetas cortas.
Formato en Markdown, exactamente con estas secciones en negrita y este orden:
## Resumen de la semana · <periodo>
**Recaudación**, **Mantención**, **Solicitudes y casos**, **Vida en comunidad**, **La próxima semana** (cada una con 1 a 3 viñetas)
**${DECISIONS_HEADING}** con 2 o 3 puntos numerados, accionables.
Responde solo con el resumen.`;

export function committeeDigestUserPrompt(metrics: CommitteeDigestMetrics): string {
    return `Periodo revisado: ${periodLabel(metrics.window.periodStart, metrics.window.periodEnd)}.
"La próxima semana" va de ${dayLabel(metrics.window.today)} al ${dayLabel(metrics.window.upcomingEnd)}.
Decisiones que el sistema considera prioritarias (puedes reformularlas): ${suggestCommitteeDecisions(metrics).join(' | ')}
Métricas agregadas (JSON):
${JSON.stringify({ collection: metrics.collection, maintenance: metrics.maintenance, requests: metrics.requests, community: metrics.community })}`;
}

/** Revisa que el texto de la IA tenga forma de resumen y cumpla la privacidad. */
export function acceptAiDigest(text: string, knownNames: string[]): string | null {
    const cleaned = text.replace(/^```(?:markdown)?\s*|\s*```$/g, '').trim();
    if (cleaned.length < 120 || cleaned.length > MAX_DIGEST_LENGTH) return null;
    const decisionsAt = cleaned.toLowerCase().indexOf(DECISIONS_HEADING.toLowerCase());
    if (decisionsAt < 0) return null;
    const decisionCount = cleaned.slice(decisionsAt).split('\n').filter(line => /^\s*(?:\d+[.)]|[-*•])\s+\S/.test(line)).length;
    if (decisionCount < 2 || decisionCount > 3) return null;
    if (!checkDigestPrivacy(cleaned, knownNames).ok) return null;
    return cleaned;
}

export type CommitteeDigestWriter = (input: { system: string; user: string }) => Promise<string>;

export async function draftCommitteeDigest(
    metrics: CommitteeDigestMetrics,
    knownNames: string[],
    writer: CommitteeDigestWriter | null,
): Promise<{ content: string; source: CommitteeDigestSource; fallbackReason?: string }> {
    if (writer) {
        try {
            const text = await writer({ system: COMMITTEE_DIGEST_SYSTEM_PROMPT, user: committeeDigestUserPrompt(metrics) });
            const accepted = acceptAiDigest(text, knownNames);
            if (accepted) return { content: accepted, source: 'ai' };
            return { content: composeFallbackDigest(metrics), source: 'fallback', fallbackReason: 'ai_output_rejected' };
        } catch (error) {
            return { content: composeFallbackDigest(metrics), source: 'fallback', fallbackReason: error instanceof Error ? error.name || 'ai_error' : 'ai_error' };
        }
    }
    return { content: composeFallbackDigest(metrics), source: 'fallback', fallbackReason: 'ai_not_configured' };
}
