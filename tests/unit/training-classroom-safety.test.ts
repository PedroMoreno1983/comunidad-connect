import { describe, expect, it } from 'vitest';
import { electricWaterSafetyTurn } from '@/lib/training/classroomAgents';
import type { ClassroomTurnInput } from '@/lib/training/classroomAgents';

const baseInput: ClassroomTurnInput = {
    role: 'concierge',
    course: {
        title: 'Operación diaria: conserjería, mantención y emergencias',
        description: null,
        objectives: [],
        slides: [],
    },
    section: null,
    message: '',
    history: [],
};

describe('classroom response to water near electricity', () => {
    it('gives immediate protection and notification steps without waiting for an AI reply', () => {
        const turn = electricWaterSafetyTurn({
            ...baseInput,
            message: 'Veo agua avanzando hacia un tablero eléctrico. ¿Qué hago primero?',
        });

        expect(turn).toHaveLength(1);
        expect(turn?.[0].role).toBe('tutor');
        expect(turn?.[0].text).toContain('Activa de inmediato el protocolo');
        expect(turn?.[0].text).toContain('contacto de emergencia del edificio');
        expect(turn?.[0].text).toContain('sin retrasar el aviso');
    });

    it('leaves unrelated course questions to the regular tutor', () => {
        expect(electricWaterSafetyTurn({ ...baseInput, message: '¿Cómo entrego el turno?' })).toBeNull();
        expect(electricWaterSafetyTurn({ ...baseInput, role: 'admin', message: 'Agua cerca del tablero' })).toBeNull();
    });
});
