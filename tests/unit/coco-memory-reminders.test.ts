import { describe, expect, it } from 'vitest';
import { MUTATING_TOOLS, isToolAllowedForRole } from '@/lib/coco/tools';
import { buildUnifiedMemoryContext, selectRelevantFacts } from '@/lib/coco/memory';
import {
    OVERDUE_REMINDER_NOTICE,
    noticeHasDebtLanguage,
    reminderAudienceAllowed,
    reminderWhatsAppActive,
    resolveReminderSchedule,
    whatsappSubjectForReminder,
} from '@/lib/coco/reminders';

const WEDNESDAY = new Date('2026-11-04T15:00:00.000Z');

function chileClock(instant: Date) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Santiago',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).format(instant);
}

describe('recordatorios en hora de Chile', () => {
    it('el viernes a las 09:00 cae el viernes que viene, a esa hora en Santiago', () => {
        const resolved = resolveReminderSchedule({ when: 'viernes', time: '09:00' }, WEDNESDAY);
        expect(resolved.ok).toBe(true);
        if (!resolved.ok) return;
        expect(resolved.schedule.cadence).toBe('once');
        expect(chileClock(resolved.schedule.runAt)).toContain('2026-11-06');
        expect(chileClock(resolved.schedule.runAt)).toContain('09:00');
    });

    it('el día 5 antes de esa hora queda en este mes y, si ya pasó, en el siguiente', () => {
        const upcoming = resolveReminderSchedule({ when: 'día 5', time: '09:00', repeat: 'monthly' }, WEDNESDAY);
        expect(upcoming.ok).toBe(true);
        if (!upcoming.ok) return;
        expect(upcoming.schedule.cadence).toBe('monthly');
        expect(upcoming.schedule.dayOfMonth).toBe(5);
        expect(chileClock(upcoming.schedule.runAt)).toContain('2026-11-05');

        const after = resolveReminderSchedule(
            { when: '5', time: '09:00', repeat: 'monthly' },
            new Date('2026-11-05T16:00:00.000Z'),
        );
        expect(after.ok).toBe(true);
        if (!after.ok) return;
        expect(chileClock(after.schedule.runAt)).toContain('2026-12-05');
    });

    it('rechaza una fecha que ya pasó y un día que febrero no tiene', () => {
        const past = resolveReminderSchedule({ when: '2026-11-01', time: '09:00' }, WEDNESDAY);
        expect(past.ok).toBe(false);
        const february = resolveReminderSchedule({ when: 'día 31', repeat: 'monthly' }, WEDNESDAY);
        expect(february.ok).toBe(false);
    });
});

describe('a quién se le puede agendar un aviso', () => {
    it('cualquier perfil puede recordarse a sí mismo; el aviso de cobros es solo de administración', () => {
        expect(reminderAudienceAllowed('resident', 'self')).toBe(true);
        expect(reminderAudienceAllowed('concierge', 'self')).toBe(true);
        expect(reminderAudienceAllowed('admin', 'self')).toBe(true);
        expect(reminderAudienceAllowed('resident', 'overdue_residents')).toBe(false);
        expect(reminderAudienceAllowed('concierge', 'overdue_residents')).toBe(false);
        expect(reminderAudienceAllowed('admin', 'overdue_residents')).toBe(true);
        expect(reminderAudienceAllowed('system', 'self')).toBe(false);
    });

    it('crear y cancelar mutan y piden confirmación; listar no', () => {
        expect(MUTATING_TOOLS.has('create_reminder')).toBe(true);
        expect(MUTATING_TOOLS.has('cancel_reminder')).toBe(true);
        expect(MUTATING_TOOLS.has('remember_community_fact')).toBe(true);
        expect(MUTATING_TOOLS.has('list_reminders')).toBe(false);
        expect(isToolAllowedForRole('create_reminder', 'resident')).toBe(true);
        expect(isToolAllowedForRole('remember_community_fact', 'resident')).toBe(false);
        expect(isToolAllowedForRole('remember_community_fact', 'admin')).toBe(true);
        expect(isToolAllowedForRole('create_reminder', 'system')).toBe(false);
    });
});

describe('WhatsApp del recordatorio queda apagado', () => {
    const previous = process.env.COCO_REMINDER_WHATSAPP;

    it('no llama a la plantilla aunque el chat lo pida', () => {
        delete process.env.COCO_REMINDER_WHATSAPP;
        expect(reminderWhatsAppActive(true)).toBe(false);
        expect(reminderWhatsAppActive(false)).toBe(false);
        process.env.COCO_REMINDER_WHATSAPP = 'true';
        expect(reminderWhatsAppActive(true)).toBe(true);
        expect(reminderWhatsAppActive(false)).toBe(false);
        if (previous === undefined) delete process.env.COCO_REMINDER_WHATSAPP;
        else process.env.COCO_REMINDER_WHATSAPP = previous;
    });

    it('el aviso de cobros no lleva montos ni lenguaje de deudor, ni en el asunto de la plantilla', () => {
        expect(noticeHasDebtLanguage(OVERDUE_REMINDER_NOTICE.title)).toBe(false);
        expect(noticeHasDebtLanguage(OVERDUE_REMINDER_NOTICE.body)).toBe(false);
        expect(noticeHasDebtLanguage(OVERDUE_REMINDER_NOTICE.whatsappSubject)).toBe(false);
        expect(whatsappSubjectForReminder('overdue_residents', 'deben $50.000')).toBe(OVERDUE_REMINDER_NOTICE.whatsappSubject);
        expect(noticeHasDebtLanguage(whatsappSubjectForReminder('self', 'cobrar $50.000 a la 302'))).toBe(false);
        expect(whatsappSubjectForReminder('self', 'cobrar a la 302')).toBe('cobrar a la 302');
    });
});

describe('memoria que entra al contexto', () => {
    const community = [
        { fact: 'El quincho cierra a las 22:00.', category: 'reglamento' as const },
        { fact: 'El ascensor lo atiende Andes Lift.', category: 'proveedor' as const },
        { fact: 'El acuerdo de mudanzas es de 9 a 18.', category: 'acuerdo' as const },
    ];

    it('prioriza el hecho que el mensaje toca', () => {
        const picked = selectRelevantFacts(community, '¿a qué hora cierra el quincho?', 2);
        expect(picked.map(item => item.category)).toContain('reglamento');
        expect(picked).toHaveLength(1);
    });

    it('arma el bloque de la persona y el de la comunidad', () => {
        const text = buildUnifiedMemoryContext(['Tiene un perro'], community, 'proveedor del ascensor');
        expect(text).toContain('Tiene un perro');
        expect(text).toContain('Andes Lift');
        expect(text).toContain('Solo la administración puede corregirlo');
    });
});

describe('el chat obliga la herramienta cuando piden un recordatorio', () => {
    it('no confunde un recordatorio con una reserva', async () => {
        const { requiredMutationTool } = await import('@/lib/coco/agent');
        expect(requiredMutationTool('recuérdame el viernes cobrar a la 302', 'admin')).toBe('create_reminder');
        expect(requiredMutationTool('avisa a los morosos el día 5', 'admin')).toBe('create_reminder');
        expect(requiredMutationTool('avisa a los morosos el día 5', 'resident')).toBeUndefined();
        expect(requiredMutationTool('quiero reservar el quincho el sábado', 'resident')).toBe('create_reservation');
        expect(requiredMutationTool('guarda en el reglamento que el quincho cierra a las 22', 'admin')).toBe('remember_community_fact');
    });
});
