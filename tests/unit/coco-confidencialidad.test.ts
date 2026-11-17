/**
 * Confidencialidad de CoCo: la administración no sabe qué conversan los
 * residentes con CoCo ni qué hace CoCo por ellos. Nada de sus conversaciones
 * llega a la memoria de la comunidad, y la bitácora que ve la administración
 * no muestra las acciones de CoCo pedidas por un residente.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const db = vi.hoisted(() => ({
    consents: [] as Array<{ action: string; policy_version: string }>,
    inserts: [] as Array<{ table: string; row: unknown }>,
}));

vi.mock('@/lib/supabase/supabaseAdmin', () => ({
    getSupabaseAdmin: () => ({
        from(table: string) {
            const builder = {
                select: () => builder,
                eq: () => builder,
                in: () => builder,
                order: () => builder,
                limit: () => builder,
                maybeSingle: async () => ({ data: table === 'privacy_consent_events' ? db.consents[0] ?? null : null, error: null }),
                insert: async (row: unknown) => { db.inserts.push({ table, row }); return { error: null }; },
                then(resolve: (value: { data: unknown[]; error: null }) => void) { resolve({ data: [], error: null }); },
            };
            return builder;
        },
    }),
}));
vi.mock('@/lib/coco/memory', () => ({ rememberCommunityFact: vi.fn() }));

import { cocoConsentState, recordCocoConsent } from '@/lib/coco/privacyConsent';
import { learnFromClosing, mayLearnFromConversation } from '@/lib/coco/learnFromChat';
import { ADMIN_VISIBLE_EVENTS_FILTER, adminMaySeeEvent } from '@/lib/operations/audit';
import { COCO_PRIVACY_NOTICE, PRIVACY_POLICY_VERSION } from '@/lib/privacy';

const LINES = ['Quedó acordado que el proveedor de ascensores viene los martes.', 'Eso es todo, gracias.'];

beforeEach(() => {
    db.consents = [];
    db.inserts = [];
});

describe('memoria de la comunidad', () => {
    it('de la conversación de un residente no sale ninguna propuesta', async () => {
        for (const role of ['resident', 'owner', 'tenant', 'concierge', undefined]) {
            expect(mayLearnFromConversation(role)).toBe(false);
            const result = await learnFromClosing({ communityId: 'com-1', role, lines: LINES });
            expect(result.proposed).toBe(0);
        }
        expect(db.inserts.filter(item => item.table === 'coco_memory_proposals')).toHaveLength(0);
    });

    it('de la conversación de la propia administración, sí', async () => {
        const result = await learnFromClosing({ communityId: 'com-1', role: 'admin', lines: LINES });
        expect(result.proposed).toBe(1);
    });
});

describe('lo que la administración ve de la bitácora', () => {
    it('no ve lo que CoCo hizo para un residente', () => {
        expect(adminMaySeeEvent({ action: 'coco.tool.save_shopping_list', actor_role: 'resident' })).toBe(false);
        expect(adminMaySeeEvent({ action: 'coco.reminder.delivered', actor_role: 'system' })).toBe(false);
    });

    it('sí ve lo del personal, lo que no es de CoCo y lo del sistema sin actor', () => {
        expect(adminMaySeeEvent({ action: 'coco.tool.schedule_community_notice', actor_role: 'admin' })).toBe(true);
        expect(adminMaySeeEvent({ action: 'finance.expense.created', actor_role: 'resident' })).toBe(true);
        expect(adminMaySeeEvent({ action: 'coco.autonomy.updated', actor_role: null })).toBe(true);
    });

    it('el filtro de la base dice lo mismo', () => {
        expect(ADMIN_VISIBLE_EVENTS_FILTER).toBe('action.not.like.coco.*,actor_role.is.null,actor_role.in.(admin,concierge,superadmin)');
    });
});

describe('aviso de privacidad de CoCo', () => {
    it('dice que la administración no lee las conversaciones', () => {
        expect(COCO_PRIVACY_NOTICE.points[0]).toMatch(/no las lee/);
        expect(COCO_PRIVACY_NOTICE.points.join(' ')).not.toMatch(/proponer|permitir|activa/i);
    });

    it('guarda la evidencia con la versión de la política y el canal', async () => {
        await recordCocoConsent({ userId: 'user-1', communityId: 'com-1', email: 'vecina@example.com', action: 'granted', channel: 'chat' });
        expect(db.inserts[0]).toEqual({
            table: 'privacy_consent_events',
            row: expect.objectContaining({ consent_type: 'ai_processing', action: 'granted', channel: 'chat', policy_version: PRIVACY_POLICY_VERSION }),
        });
    });

    it('sin evidencia, el estado es desconocido y el chat muestra el aviso', async () => {
        expect((await cocoConsentState('user-1')).state).toBe('unknown');
        db.consents = [{ action: 'granted', policy_version: PRIVACY_POLICY_VERSION }];
        expect((await cocoConsentState('user-1')).state).toBe('granted');
    });
});
