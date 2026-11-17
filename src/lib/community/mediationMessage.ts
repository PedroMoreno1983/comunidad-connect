/**
 * Borrador de mensaje de mediación entre vecinos, en estructura de
 * comunicación no violenta: observación, sentimiento, necesidad y petición.
 * Lo usan la pantalla de Convivencia y CoCo (request_mediation).
 */
export function draftCnvMessage(input: {
    reporterName: string;
    targetUnit: string;
    observation: string;
    feeling: string;
    need: string;
    request: string;
}) {
    return [
        `Hola, soy ${input.reporterName || 'un vecino de la comunidad'}. Te escribo con buena intencion para resolver algo sin escalarlo.`,
        `Observacion: ${input.observation}.`,
        `Me siento ${input.feeling} y necesito ${input.need}.`,
        `¿Podrias ${input.request}?`,
        `Gracias por recibir este mensaje. La idea es cuidarnos entre vecinos antes de llegar a multas o denuncias.`,
    ].join('\n\n');
}
