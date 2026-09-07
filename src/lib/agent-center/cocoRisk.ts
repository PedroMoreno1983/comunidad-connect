/**
 * cocoRisk.ts — El peso real de lo que CoCo propone.
 *
 * El Agent Center gradua el riesgo en tres niveles y cruza eso con la politica
 * de autonomia de cada agente. CoCo no: su unica distincion es `MUTATING_TOOLS`,
 * un set plano donde `create_social_post` e `issue_billing` caen en el mismo
 * cajon. Mientras el puente `coco_action` fuera una caja opaca, el Agent Center
 * no tenia mas remedio que tratarla entera como `write_high` y pedir
 * confirmacion siempre — util como default seguro, pero convertia el modelo de
 * autonomia graduada en codigo muerto para todo lo que pasara por CoCo, y
 * dejaba la bitacora sin saber si se emitio un cobro o se publico un post.
 *
 * Este mapa le da a cada herramienta de CoCo el mismo vocabulario de riesgo que
 * ya usan las herramientas propias, con el criterio que declara
 * `TOOL_RISK_LEVELS`: es `write_high` lo que toca dinero, se difunde a terceros
 * o corre en batch.
 *
 * REGLA IMPORTANTE: lo que no este aqui cae a `write_high`. Una herramienta
 * nueva de CoCo pide confirmacion hasta que alguien decida conscientemente que
 * no hace falta. `tests/unit/agent-center-coco-risk.test.ts` falla si aparece
 * una sin clasificar, para que la decision sea explicita y no un olvido.
 */

import { riskRequiresConfirmation, type AgentPolicy, type ToolRiskLevel } from '@/lib/agent-center/domain';

export const COCO_TOOL_RISK: Record<string, ToolRiskLevel> = {
    // ── Lecturas ────────────────────────────────────────────────────────────
    get_resident_info: 'read',
    get_payment_status: 'read',
    get_water_consumption: 'read',
    list_services: 'read',
    search_marketplace: 'read',
    get_claim_status: 'read',
    list_my_claims: 'read',
    check_availability: 'read',
    get_my_parking: 'read',
    search_parking: 'read',
    list_active_polls: 'read',
    get_pending_packages: 'read',
    get_defaulters_list: 'read',
    // preview_billing calcula y muestra; issue_billing es la que emite.
    preview_billing: 'read',
    list_supermarket_group_orders: 'read',
    compare_supermarket_group_order: 'read',

    // ── Escritura acotada: una fila, sin dinero ni difusion ──────────────────
    // Equivalen a las `write_low` propias (create_service_request,
    // create_booking, register_visitor): afectan un registro y su autor puede
    // deshacerlas.
    create_claim: 'write_low',
    create_reservation: 'write_low',
    create_social_post: 'write_low',
    vote_in_poll: 'write_low',
    register_visitor: 'write_low',
    register_package: 'write_low',
    create_supermarket_group_order: 'write_low',
    join_supermarket_group_order: 'write_low',
    // No esta en MUTATING_TOOLS de CoCo, pero escribe memoria del usuario.
    remember_preference: 'write_low',

    // ── Dinero, difusion a terceros o batch ─────────────────────────────────
    book_parking: 'write_high',                 // cobra
    create_circular: 'write_high',              // difusion a toda la comunidad
    create_poll: 'write_high',                  // difusion a toda la comunidad
    send_whatsapp_notification: 'write_high',   // sale del edificio
    request_urgent_access_approval: 'write_high', // interrumpe a terceros
    dispatch_provider: 'write_high',            // compromete a un proveedor
    lock_supermarket_group_order: 'write_high', // cierra la compra de varios vecinos
    create_unit: 'write_high',                  // estructura del condominio
    // Cambia el dato de contacto de OTRA familia, que no se entera y por lo
    // tanto no puede deshacerlo: no cumple la condicion de write_low. Ademas
    // toca la misma tabla que create_unit y set_unit_alicuota, ya write_high.
    update_unit_data: 'write_high',
    set_unit_alicuota: 'write_high',            // define cuanto paga una unidad
    distribute_alicuotas_equally: 'write_high', // batch sobre todas las unidades
    add_community_expense: 'write_high',        // dinero
    issue_billing: 'write_high',                // emite cobros a todo el edificio
};

/** Riesgo de una herramienta de CoCo. Lo desconocido pesa lo maximo. */
export function cocoToolRisk(name: string): ToolRiskLevel {
    return COCO_TOOL_RISK[name] ?? 'write_high';
}

export interface CoCoActionStep {
    name?: string;
    title?: string;
}

/** El riesgo de una `coco_action` es el del paso mas pesado que contiene. */
export function cocoActionRisk(pending: CoCoActionStep[]): ToolRiskLevel {
    let peor: ToolRiskLevel = 'read';
    for (const step of pending) {
        const risk = cocoToolRisk(String(step?.name ?? ''));
        if (risk === 'write_high') return 'write_high';
        if (risk === 'write_low') peor = 'write_low';
    }
    return peor;
}

/**
 * Confirmacion para una accion propuesta por CoCo, mirando lo que realmente va
 * a ejecutar. Mismo patron que `missionRequiresConfirmation`: basta con que un
 * paso la requiera. Sin pasos legibles no hay nada que evaluar, y entonces se
 * confirma.
 */
export function cocoActionRequiresConfirmation(
    pending: CoCoActionStep[],
    policy: Pick<AgentPolicy, 'autonomyLevel'>,
): boolean {
    if (!pending.length) return true;
    return pending.some(step => riskRequiresConfirmation(cocoToolRisk(String(step?.name ?? '')), policy));
}

/**
 * Etiqueta para la bitacora. CoCo ya redacta un titulo legible por paso
 * (`describePendingAction`), asi que se reutiliza en vez de mantener 38
 * traducciones en paralelo. Sin eso, cada accion ejecutada por CoCo quedaba
 * registrada como "Ejecutar accion preparada por CoCo", y un post social era
 * indistinguible de una emision de gastos comunes.
 */
export function cocoActionAuditLabel(pending: CoCoActionStep[]): string | null {
    const titles = pending
        .map(step => String(step?.title ?? '').trim())
        .filter(Boolean);
    if (!titles.length) return null;
    const shown = titles.slice(0, 3).join(' · ');
    return titles.length > 3 ? `CoCo: ${shown} (+${titles.length - 3})` : `CoCo: ${shown}`;
}
