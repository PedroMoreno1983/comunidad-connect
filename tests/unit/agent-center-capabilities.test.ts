import { describe, expect, it } from 'vitest';
import { isCapabilityOrGreeting, buildCapabilitiesAction } from '@/lib/agent-center/capabilities';
import { AGENT_PLAYBOOKS } from '@/lib/agent-center/domain';

describe('isCapabilityOrGreeting', () => {
    it('reconoce saludos cortos (con y sin acentos/variantes)', () => {
        for (const msg of ['hola', 'Hola!', 'holaaa', 'buenas', 'buenos días', 'hey', 'qué tal']) {
            expect(isCapabilityOrGreeting(msg)).toBe(true);
        }
    });

    it('reconoce preguntas por capacidades', () => {
        for (const msg of ['¿qué puedes hacer?', 'en que me ayudas', 'para qué sirves', '¿cómo funciona esto?', 'qué opciones tengo', 'ayuda', 'menu']) {
            expect(isCapabilityOrGreeting(msg)).toBe(true);
        }
    });

    it('NO confunde peticiones operativas con capacidades', () => {
        for (const msg of [
            'prepara la cobranza del mes',
            'ayuda con el cobro del depto 504',
            'publica un comunicado de corte de agua',
            'muéstrame la morosidad de octubre',
            'hola, necesito que emitas el gasto común de marzo para todas las unidades',
        ]) {
            expect(isCapabilityOrGreeting(msg)).toBe(false);
        }
    });
});

describe('buildCapabilitiesAction', () => {
    it('devuelve una tarjeta de solo lectura, marcada como final y con los playbooks reales', () => {
        const action = buildCapabilitiesAction('hola');
        expect(action.toolName).toBe('clarify_intent');
        expect(action.requiresConfirmation).toBe(false);
        expect(action.args.capabilities).toBe(true);
        // El texto se deriva de los playbooks reales del sistema, no inventado.
        for (const playbook of AGENT_PLAYBOOKS) {
            expect(action.summary).toContain(playbook.name);
        }
    });
});
