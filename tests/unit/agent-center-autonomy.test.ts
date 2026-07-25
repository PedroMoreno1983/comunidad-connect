import { describe, expect, it } from 'vitest';
import {
    DEFAULT_AGENT_POLICIES,
    TOOL_RISK_LEVELS,
    effectiveRequiresConfirmation,
    missionRequiresConfirmation,
    type AgentMissionStep,
    type AgentPolicy,
    type AutonomyLevel,
} from '../../src/lib/agent-center/domain';
import { validateAgentActionArgs } from '../../src/lib/agent-center/actionValidation';
import { detectMultiIntent } from '../../src/lib/agent-center/orchestrator';

const policy = (autonomyLevel: AutonomyLevel): Pick<AgentPolicy, 'autonomyLevel'> => ({ autonomyLevel });

describe('Agent Center effectiveRequiresConfirmation', () => {
    it('never requires confirmation for read-only tools at any autonomy level', () => {
        for (const level of ['manual', 'semi_autonomous', 'autonomous'] as const) {
            for (const tool of ['get_my_expenses', 'get_resident_expenses', 'get_community_snapshot', 'answer_community_question', 'clarify_intent'] as const) {
                expect(effectiveRequiresConfirmation(tool, policy(level))).toBe(false);
            }
        }
    });

    it('manual requires confirmation for every write', () => {
        expect(effectiveRequiresConfirmation('create_booking', policy('manual'))).toBe(true);
        expect(effectiveRequiresConfirmation('register_visitor', policy('manual'))).toBe(true);
        expect(effectiveRequiresConfirmation('create_unit_expense', policy('manual'))).toBe(true);
        expect(effectiveRequiresConfirmation('create_announcement', policy('manual'))).toBe(true);
    });

    it('semi_autonomous runs write_low without confirmation but gates write_high', () => {
        expect(effectiveRequiresConfirmation('create_booking', policy('semi_autonomous'))).toBe(false);
        expect(effectiveRequiresConfirmation('create_service_request', policy('semi_autonomous'))).toBe(false);
        expect(effectiveRequiresConfirmation('register_visitor', policy('semi_autonomous'))).toBe(false);
        expect(effectiveRequiresConfirmation('create_unit_expense', policy('semi_autonomous'))).toBe(true);
        expect(effectiveRequiresConfirmation('send_unit_payment_reminder', policy('semi_autonomous'))).toBe(true);
        expect(effectiveRequiresConfirmation('create_announcement', policy('semi_autonomous'))).toBe(true);
    });

    it('autonomous runs writes without confirmation', () => {
        expect(effectiveRequiresConfirmation('create_booking', policy('autonomous'))).toBe(false);
        expect(effectiveRequiresConfirmation('create_unit_expense', policy('autonomous'))).toBe(false);
        expect(effectiveRequiresConfirmation('create_announcement', policy('autonomous'))).toBe(false);
    });

    it('always requires confirmation for playbooks and missions, even when autonomous', () => {
        for (const level of ['manual', 'semi_autonomous', 'autonomous'] as const) {
            expect(effectiveRequiresConfirmation('run_playbook', policy(level))).toBe(true);
        }
        // run_mission se clasifica write_high; la mision real se evalua por pasos
        // con missionRequiresConfirmation.
        expect(TOOL_RISK_LEVELS.run_mission).toBe('write_high');
        expect(effectiveRequiresConfirmation('run_mission', policy('semi_autonomous'))).toBe(true);
    });
});

describe('Agent Center missionRequiresConfirmation', () => {
    const policies = Object.fromEntries(
        Object.entries(DEFAULT_AGENT_POLICIES).map(([agentKey, entry]) => [agentKey, { autonomyLevel: entry.autonomyLevel }]),
    ) as Record<'finance' | 'maintenance' | 'concierge' | 'community', Pick<AgentPolicy, 'autonomyLevel'>>;

    const readStep: AgentMissionStep = {
        agentKey: 'finance',
        toolName: 'get_resident_expenses',
        args: { unitNumber: '502' },
        title: 'Revisar deuda',
        rationale: 'Verificar saldo antes de cobrar',
    };

    const writeLowStep: AgentMissionStep = {
        agentKey: 'maintenance',
        toolName: 'create_service_request',
        args: { description: 'Falla de luz', preferredDate: '2026-07-25', preferredTime: '10:00' },
        title: 'Crear ticket',
        rationale: 'Derivar la falla al proveedor',
    };

    const writeHighStep: AgentMissionStep = {
        agentKey: 'community',
        toolName: 'create_announcement',
        args: { title: 'Cobro de julio', content: 'Se emitiran cobros', priority: 'info' },
        title: 'Publicar comunicado',
        rationale: 'Avisar a los residentes',
    };

    it('does not require confirmation when all steps are read-only', () => {
        expect(missionRequiresConfirmation([readStep, { ...readStep, agentKey: 'community', toolName: 'answer_community_question', args: { question: 'estado de pagos' } }], policies)).toBe(false);
    });

    it('does not require confirmation when write_low steps belong to semi_autonomous agents', () => {
        const semiPolicies = {
            ...policies,
            maintenance: { autonomyLevel: 'semi_autonomous' as const },
        };
        expect(missionRequiresConfirmation([readStep, writeLowStep], semiPolicies)).toBe(false);
    });

    it('requires confirmation when any step is write_high under a semi_autonomous agent', () => {
        const semiPolicies = {
            ...policies,
            community: { autonomyLevel: 'semi_autonomous' as const },
        };
        expect(missionRequiresConfirmation([readStep, writeHighStep], semiPolicies)).toBe(true);
    });

    it('requires confirmation when a step belongs to a manual agent that writes', () => {
        expect(missionRequiresConfirmation([readStep, writeLowStep], policies)).toBe(true);
    });

    it('falls back to manual when a step agent has no policy', () => {
        expect(missionRequiresConfirmation([writeLowStep, readStep], {} as never)).toBe(true);
    });
});

describe('Agent Center detectMultiIntent', () => {
    it('detects objectives that cross two domains', () => {
        expect(detectMultiIntent('cobra al depto 502 y publica un comunicado avisando del cobro')).toBe(true);
        expect(detectMultiIntent('registra la visita del plomero y crea un ticket de mantenimiento')).toBe(true);
        expect(detectMultiIntent('revisa la deuda y agenda el quincho para el sabado')).toBe(true);
    });

    it('stays single-domain for requests handled by one agent', () => {
        expect(detectMultiIntent('cobra 50.000 al depto 502 y envia un recordatorio de pago')).toBe(false);
        expect(detectMultiIntent('registra la visita de Juan Perez')).toBe(false);
        expect(detectMultiIntent('cuanto debe el departamento 1204')).toBe(false);
    });
});

describe('Agent Center run_mission validation', () => {
    const baseAction = {
        agentKey: 'finance' as const,
        toolName: 'run_mission' as const,
        requiresConfirmation: true,
        title: 'Mision',
        summary: 'Mision',
        targetHref: '/agent-center',
    };

    const validSteps = [
        {
            agentKey: 'finance',
            toolName: 'get_resident_expenses',
            args: { unitNumber: '502' },
            title: 'Revisar deuda del 502',
            rationale: 'Confirmar saldo previo',
        },
        {
            agentKey: 'community',
            toolName: 'create_announcement',
            args: { title: 'Aviso de cobranza', content: 'Se emitiran los cobros del mes', priority: 'info' },
            title: 'Publicar comunicado',
            rationale: 'Avisar a la comunidad',
        },
    ];

    it('accepts a well-formed mission and validates each step args', () => {
        const result = validateAgentActionArgs({ ...baseAction, args: { goal: 'Cobrar y avisar', steps: validSteps } });
        expect(result.goal).toBe('Cobrar y avisar');
        const steps = result.steps as AgentMissionStep[];
        expect(steps).toHaveLength(2);
        expect(steps[0].args).toEqual({ unitNumber: '502' });
        expect(steps[1].args).toMatchObject({ title: 'Aviso de cobranza', priority: 'info' });
    });

    it('rejects missions with fewer than two steps', () => {
        expect(() => validateAgentActionArgs({ ...baseAction, args: { goal: 'Solo un paso', steps: [validSteps[0]] } }))
            .toThrow(/entre 2 y/);
    });

    it('rejects missions with more than the maximum steps', () => {
        const steps = [validSteps[0], validSteps[1], validSteps[0], validSteps[1], validSteps[0]];
        expect(() => validateAgentActionArgs({ ...baseAction, args: { goal: 'Demasiados pasos', steps } }))
            .toThrow(/entre 2 y/);
    });

    it('rejects nested playbooks and missions', () => {
        const nestedPlaybook = [{ ...validSteps[0], toolName: 'run_playbook', args: { playbookKey: 'finance_collection_review' } }, validSteps[1]];
        expect(() => validateAgentActionArgs({ ...baseAction, args: { goal: 'Anidado', steps: nestedPlaybook } }))
            .toThrow(/herramienta no permitida/);

        const nestedMission = [{ ...validSteps[0], toolName: 'run_mission', args: { goal: 'x', steps: validSteps } }, validSteps[1]];
        expect(() => validateAgentActionArgs({ ...baseAction, args: { goal: 'Anidado', steps: nestedMission } }))
            .toThrow(/herramienta no permitida/);
    });

    it('rejects invalid step agents and validates inner step args', () => {
        const badAgent = [{ ...validSteps[0], agentKey: 'superadmin' }, validSteps[1]];
        expect(() => validateAgentActionArgs({ ...baseAction, args: { goal: 'Agente invalido', steps: badAgent } }))
            .toThrow(/agente no soportado/);

        const badArgs = [validSteps[0], { ...validSteps[1], args: { title: 'ok', content: 'c', priority: 'urgent' } }];
        expect(() => validateAgentActionArgs({ ...baseAction, args: { goal: 'Args invalidos', steps: badArgs } }))
            .toThrow();
    });
});
