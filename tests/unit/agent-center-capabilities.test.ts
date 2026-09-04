import { describe, expect, it } from 'vitest';
import { isCapabilityOrGreeting, buildCapabilitiesAction } from '@/lib/agent-center/capabilities';
import { ACTION_SUMMARY_MAX, AGENT_PLAYBOOKS, summaryLimitFor } from '@/lib/agent-center/domain';

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

describe('limite de resumen segun el tipo de accion', () => {
    // Regresion: normalizeAction recortaba TODO summary a 280 caracteres. La
    // tarjeta de capacidades mide mas de mil, asi que llegaba a pantalla cortada
    // a media palabra ('...prepara notifi') y perdia cuatro de sus cinco flujos.
    it('deja pasar la tarjeta de capacidades completa', () => {
        const summary = buildCapabilitiesAction('hola').summary;
        expect(summary.length).toBeGreaterThan(ACTION_SUMMARY_MAX);
        expect(summary.length).toBeLessThanOrEqual(summaryLimitFor('clarify_intent'));
        // La descripcion completa de cada flujo sobrevive, no solo el nombre.
        for (const playbook of AGENT_PLAYBOOKS) {
            expect(summary).toContain(playbook.description);
        }
        // Y la ultima linea, la que quedaba fuera del corte.
        expect(summary).toContain('prepara la cobranza del mes');
    });

    it('mantiene el limite corto para las tarjetas de accion', () => {
        expect(summaryLimitFor('run_playbook')).toBe(ACTION_SUMMARY_MAX);
        expect(summaryLimitFor('create_announcement')).toBe(ACTION_SUMMARY_MAX);
    });

    it('la tarjeta se emite en markdown para que la vista la pueda pintar', () => {
        const summary = buildCapabilitiesAction('hola').summary;
        for (const playbook of AGENT_PLAYBOOKS) {
            expect(summary).toContain(`- **${playbook.name}**:`);
        }
    });
});
