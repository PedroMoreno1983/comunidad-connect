import { describe, expect, it } from 'vitest';
import { MUTATING_AGENT_TOOLS, READ_ONLY_AGENT_TOOLS } from '../../src/lib/agent-center/domain';
import { dateFromText, moneyFromText, timeFromText } from '../../src/lib/agent-center/textParsing';

describe('Agent Center tool classification', () => {
    it('treats unit charge creation as a mutation requiring confirmation', () => {
        expect(READ_ONLY_AGENT_TOOLS).not.toContain('create_unit_expense');
        expect(MUTATING_AGENT_TOOLS).toContain('create_unit_expense');
    });

    it('treats payment reminders as a mutation requiring confirmation', () => {
        expect(READ_ONLY_AGENT_TOOLS).not.toContain('send_unit_payment_reminder');
        expect(MUTATING_AGENT_TOOLS).toContain('send_unit_payment_reminder');
    });

    it('keeps real read-only tools classified as read-only', () => {
        for (const tool of ['get_my_expenses', 'get_resident_expenses', 'get_community_snapshot', 'answer_community_question', 'clarify_intent'] as const) {
            expect(READ_ONLY_AGENT_TOOLS).toContain(tool);
            expect(MUTATING_AGENT_TOOLS).not.toContain(tool);
        }
    });
});

describe('Agent Center text parsing', () => {
    it('prefers the explicit amount over the unit number', () => {
        expect(moneyFromText('crea un cobro al depto 502 por $150.000')).toBe(150000);
        expect(moneyFromText('crea un cobro al depto 502 por 150.000')).toBe(150000);
        expect(moneyFromText('genera un cargo para la unidad 1204 de 85 mil')).toBe(85000);
    });

    it('does not mistake a unit number for an amount', () => {
        expect(moneyFromText('quiero vender mi bike del depto 502')).toBe(0);
        expect(moneyFromText('publica bicicleta a 120 mil')).toBe(120000);
    });

    it('ignores ISO dates when extracting times', () => {
        expect(timeFromText('reserva el quincho para 2026-07-25 a las 19:30')).toEqual({ start: '19:30', end: '21:30' });
        expect(timeFromText('reserva el quincho para 2026-07-25')).toEqual({ start: '10:00', end: '12:00' });
    });

    it('does not extract times from amounts or unit numbers', () => {
        expect(timeFromText('cobra $150.000 al depto 502')).toEqual({ start: '10:00', end: '12:00' });
    });

    it('parses explicit ISO dates and keeps them untouched', () => {
        expect(dateFromText('reserva para 2026-08-01')).toBe('2026-08-01');
    });

    it('returns a valid ISO date for relative inputs', () => {
        expect(dateFromText('reserva para manana')).toMatch(/^20\d{2}-\d{2}-\d{2}$/);
        expect(dateFromText('reserva para el viernes')).toMatch(/^20\d{2}-\d{2}-\d{2}$/);
    });
});
