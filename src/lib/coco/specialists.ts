/**
 * Cocos especializados. El plan es puro: quién toma el pedido y en qué orden.
 * No escribe ni avisa a vecinos.
 */

export const SPECIALISTS = ['cobranza', 'legal', 'mantencion'] as const;
export type SpecialistKey = (typeof SPECIALISTS)[number];

const HINTS: Array<[SpecialistKey, RegExp]> = [
    ['cobranza', /\b(cobranza|gastos comunes|convenio|cartola)\b/],
    ['legal', /\b(ley|reglamento|legal|asamblea|dom|seremi|minvu)\b/],
    ['mantencion', /\b(mantencion|mantenimiento|ascensor|falla|ticket|proveedor)\b/],
];

export const SPECIALIST_BRIEFS: Record<SpecialistKey, string> = {
    cobranza: 'Revisa los totales y deja la propuesta para que el administrador confirme. No avisa a residentes ni registra pagos.',
    legal: 'Prepara la lectura de la norma oficial. No concluye ni reemplaza a un abogado o a la autoridad.',
    mantencion: 'Revisa tickets y activos. No contrata ni despacha un proveedor.',
};

export function planSpecialists(message: string): { specialists: SpecialistKey[]; goal: string } | { error: string } {
    const text = message.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const goal = message.replace(/\s+/g, ' ').trim().slice(0, 280);
    if (goal.length < 8) return { error: 'Dime el pedido que hay que repartir.' };
    const specialists = HINTS.filter(([, pattern]) => pattern.test(text)).map(([key]) => key);
    if (!specialists.length) return { error: 'No vi si es cobranza, legal o mantención. Dilo en el pedido.' };
    return { specialists, goal };
}

export function handoffChain(specialists: SpecialistKey[]) {
    const chain = ['coco', ...specialists];
    return chain.slice(1).map((to, index) => ({ from: chain[index], to }));
}
