import { describe, expect, it } from 'vitest';
import { coercePlannedAction } from '../../src/lib/agent-center/planner';
import { validateAgentActionArgs } from '../../src/lib/agent-center/actionValidation';

describe('Agent Center planner', () => {
    it('coerces a grounded read-only proposal with decision metadata', () => {
        const action = coercePlannedAction({
            agentKey: 'finance',
            toolName: 'get_resident_expenses',
            args: { unitNumber: '1204' },
            requiresConfirmation: false,
            title: 'Consultar deuda del Depto 1204',
            summary: 'Revisar gastos comunes pendientes del departamento.',
            targetHref: '/admin/finanzas',
            decision: {
                intent: 'Consultar deuda individual',
                confidence: 0.97,
                explanation: 'La solicitud identifica el departamento 1204 y pide solo informacion.',
            },
        });

        expect(action).toMatchObject({
            agentKey: 'finance',
            toolName: 'get_resident_expenses',
            args: { unitNumber: '1204' },
            requiresConfirmation: false,
            decision: { confidence: 0.97 },
        });
    });

    it('rejects malformed planner output', () => {
        expect(coercePlannedAction({ toolName: 'create_booking', args: [] })).toBeNull();
    });

    it('accepts an open-ended operational snapshot as a read action', () => {
        const action = coercePlannedAction({
            agentKey: 'finance',
            toolName: 'get_community_snapshot',
            args: { focus: 'finance' },
            requiresConfirmation: false,
            title: 'Revisar morosidad',
            summary: 'Consultar indicadores financieros reales.',
            targetHref: '/admin',
            decision: { intent: 'Contar morosos', confidence: 0.94, explanation: 'Es una consulta agregada.' },
        });

        expect(action).toMatchObject({ toolName: 'get_community_snapshot', args: { focus: 'finance' }, requiresConfirmation: false });
    });

    it('accepts a traced multi-source research question as a read action', () => {
        const action = coercePlannedAction({
            agentKey: 'community',
            toolName: 'answer_community_question',
            args: { question: 'Que tickets abiertos se relacionan con los ultimos comunicados?' },
            requiresConfirmation: false,
            title: 'Cruzar tickets y comunicados',
            summary: 'Consultar fuentes operacionales autorizadas.',
            targetHref: '/agent-center',
            decision: { intent: 'Investigar fuentes', confidence: 0.91, explanation: 'La pregunta requiere cruzar dos fuentes.' },
        });

        expect(action?.toolName).toBe('answer_community_question');
        expect(validateAgentActionArgs(action!)).toEqual({ question: 'Que tickets abiertos se relacionan con los ultimos comunicados?' });
    });

    it('clamps model confidence to the supported range', () => {
        const action = coercePlannedAction({
            agentKey: 'maintenance',
            toolName: 'clarify_intent',
            args: { requestedText: 'reserva el quincho' },
            requiresConfirmation: false,
            title: 'Falta fecha',
            summary: 'Indica la fecha de la reserva.',
            targetHref: '/agent-center',
            decision: { intent: 'Reservar espacio', confidence: 4, explanation: 'Falta la fecha.' },
        });

        expect(action?.decision?.confidence).toBe(1);
    });
});
