import 'server-only';
import { listRightsUnits, saveUnitRights, UnitRightsError, type UnitRightsActor } from '@/lib/assemblies/unitRightsService';
import { planOnboardingRights, rightsPendingTask, type ProvidedRight } from './unitRightsImport';
import type { OnboardingRightsOutcome } from './types';

/**
 * Derechos de cada unidad al sincronizar el onboarding (llegan en %, se guardan
 * en ‰). Si vienen todos y suman 100 % ± 0,05 (1000‰ ± 0,5) contra las
 * unidades de la comunidad, se guardan con el
 * mismo servicio de Asambleas (`saveUnitRights` → `save_unit_rights`, con la
 * revisión auditable, método 'onboarding'): verificados si hay fuente,
 * provisorios si no. Si no, no se guarda nada y queda la tarea pendiente.
 * Nunca lanza: el resto del onboarding sigue aunque esto falle.
 */
export async function applyOnboardingRights(actor: UnitRightsActor, provided: ProvidedRight[], sourceNote: string): Promise<OnboardingRightsOutcome> {
    try {
        const units = await listRightsUnits(actor.communityId);
        const plan = planOnboardingRights(units, provided, sourceNote);
        if (plan.action === 'skip') return plan.outcome;
        const view = await saveUnitRights(actor, { values: plan.values, method: 'onboarding', sourceNote: plan.sourceNote });
        return { status: 'saved', verified: view.status === 'verified', errors: [], task: null };
    } catch (error) {
        const message = error instanceof UnitRightsError ? error.message : 'No se pudieron guardar los derechos de las unidades.';
        if (!(error instanceof UnitRightsError)) console.error('[onboarding] unit rights failed', error);
        return { status: 'skipped', verified: false, errors: [message], task: rightsPendingTask('partial') };
    }
}
