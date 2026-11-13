/**
 * CoCo registra maestros externos y genera el enlace de su portal: solo la
 * administración, con confirmación, sin duplicar por teléfono y sin generar
 * enlaces cuando el nombre es ambiguo o el maestro tiene cuenta.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/operations/audit', () => ({ recordOperationEvent: vi.fn(async () => undefined) }));
const createProviderInvite = vi.fn();
vi.mock('@/lib/services/providerPortal', () => ({
    ProviderPortalError: class extends Error { constructor(message: string, readonly status: number) { super(message); } },
    createProviderInvite: (...args: unknown[]) => createProviderInvite(...args),
}));
vi.setConfig({ testTimeout: 30_000 });

import {
    providerCategory,
    registerExternalProviderForAdmin,
    sendProviderPortalLinkForAdmin,
    whatsappDigits,
} from '@/lib/coco/providerTools';

type Row = Record<string, unknown>;

/** Base mínima en memoria: select con eq/limit/maybeSingle, insert().select().single(). */
function fakeDb(rows: Row[]) {
    const inserted: Row[] = [];
    const db = {
        from: () => {
            const filters: [string, unknown | ((cell: unknown) => boolean)][] = [];
            const run = () => rows.filter(row => filters.every(([key, value]) => (typeof value === 'function' ? value(row[key]) : row[key] === value)));
            const query = {
                select: () => query,
                eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
                ilike: (key: string, pattern: string) => {
                    const digits = pattern.replace(/%/g, '');
                    filters.push([key, (cell: unknown) => String(cell ?? '').replace(/\D/g, '').endsWith(digits)]);
                    return query;
                },
                // Solo el filtro de providerNetwork: "community_id.eq.X,community_id.is.null".
                or: (filter: string) => {
                    const community = /community_id\.eq\.([^,]+)/.exec(filter)?.[1];
                    filters.push(['community_id', (cell: unknown) => cell === community || cell === null]);
                    return query;
                },
                then: (resolve: (value: unknown) => unknown) => resolve({ data: run(), error: null }),
                maybeSingle: () => Promise.resolve({ data: run()[0] ?? null, error: null }),
                insert: (row: Row) => {
                    const saved = { id: 'nuevo-id', ...row };
                    inserted.push(saved);
                    return { select: () => ({ single: () => Promise.resolve({ data: saved, error: null }) }) };
                },
            };
            return query;
        },
    };
    return { db: db as unknown as SupabaseClient, inserted };
}

const COMMUNITY = '11111111-1111-4111-8111-111111111111';

describe('Red Convive', () => {
    it('no duplica a un maestro que ya está en la red', async () => {
        const { db, inserted } = fakeDb([{ id: 'r-1', name: 'Juan Red', contact_phone: '+56 9 1234 5678', user_id: null, community_id: null }]);
        const result = await registerExternalProviderForAdmin(db, COMMUNITY, 'admin-1', { name: 'Juan', category: 'plumbing', contact_phone: '912345678' });
        expect(result).toMatchObject({ status: 'ALREADY_REGISTERED', provider: { id: 'r-1', network: true } });
        expect(inserted).toHaveLength(0);
    });

    it('un maestro de la red lo encuentra, pero su enlace lo da Convive', async () => {
        const { db } = fakeDb([{ id: 'r-1', name: 'Juan Red', contact_phone: '912345678', user_id: null, community_id: null }]);
        createProviderInvite.mockRejectedValueOnce(Object.assign(new Error('Ese maestro es de la Red Convive: su enlace lo envía Convive.'), { status: 409 }));
        const result = await sendProviderPortalLinkForAdmin(db, COMMUNITY, 'admin-1', { provider_name: 'Juan Red' });
        expect(createProviderInvite).toHaveBeenCalledWith(COMMUNITY, 'admin-1', 'r-1');
        expect(result).toHaveProperty('error');
    });
});

describe('registrar maestro externo', () => {
    it('lo crea sin cuenta, sin verificar y en la comunidad del admin', async () => {
        const { db, inserted } = fakeDb([]);
        const result = await registerExternalProviderForAdmin(db, COMMUNITY, 'admin-1', {
            name: 'Juan Pérez', category: 'gasfiter', contact_phone: '+56 9 1234 5678', specialties: 'calefont, cañerías',
        });
        expect(result).toMatchObject({ success: true, status: 'REGISTERED' });
        expect(inserted[0]).toMatchObject({
            name: 'Juan Pérez', category: 'plumbing', user_id: null, verified: false, community_id: COMMUNITY,
            specialties: ['calefont', 'cañerías'],
        });
    });

    it('no duplica a quien ya tiene ese teléfono', async () => {
        const { db, inserted } = fakeDb([{ id: 'p-1', name: 'Juan', contact_phone: '912345678', user_id: null, community_id: COMMUNITY }]);
        const result = await registerExternalProviderForAdmin(db, COMMUNITY, 'admin-1', { name: 'Juan P', category: 'plumbing', contact_phone: '+56 9 1234 5678' });
        expect(result).toMatchObject({ status: 'ALREADY_REGISTERED', provider: { id: 'p-1' } });
        expect(inserted).toHaveLength(0);
    });

    it('pide nombre y teléfono válidos', async () => {
        const { db } = fakeDb([]);
        expect(await registerExternalProviderForAdmin(db, COMMUNITY, 'a', { name: 'J', contact_phone: '912345678' })).toHaveProperty('error');
        expect(await registerExternalProviderForAdmin(db, COMMUNITY, 'a', { name: 'Juan', contact_phone: '123' })).toHaveProperty('error');
        expect(await registerExternalProviderForAdmin(db, COMMUNITY, 'a', { name: 'Juan', contact_phone: '912345678', email: 'malo' })).toHaveProperty('error');
    });

    it('traduce oficios en español y cae a general', () => {
        expect(providerCategory('Electricista')).toBe('electrical');
        expect(providerCategory('cerrajería')).toBe('locksmith');
        expect(providerCategory('jardinero')).toBe('general');
    });
});

describe('enlace del portal', () => {
    beforeEach(() => {
        createProviderInvite.mockReset();
        createProviderInvite.mockResolvedValue({ token: 'tok_abcdefghijklmnopqrstuvwxyz', expiresAt: '2027-02-11T00:00:00.000Z', providerName: 'Juan Pérez' });
    });

    it('genera el enlace y el acceso a WhatsApp con el celular del maestro', async () => {
        const { db } = fakeDb([{ id: 'p-1', name: 'Juan Pérez', contact_phone: '9 1234 5678', user_id: null, community_id: COMMUNITY }]);
        const result = await sendProviderPortalLinkForAdmin(db, COMMUNITY, 'admin-1', { provider_name: 'juan' }) as Row;
        expect(createProviderInvite).toHaveBeenCalledWith(COMMUNITY, 'admin-1', 'p-1');
        expect((result.credential as Row).url).toMatch(/\/proveedor\/tok_abcdefghijklmnopqrstuvwxyz$/);
        expect((result.credential as Row).whatsapp_link).toMatch(/^https:\/\/wa\.me\/56912345678\?text=/);
    });

    it('si el nombre es ambiguo pregunta y no genera nada', async () => {
        const { db } = fakeDb([
            { id: 'p-1', name: 'Juan Pérez', contact_phone: '1', user_id: null, community_id: COMMUNITY },
            { id: 'p-2', name: 'Juan Soto', contact_phone: '2', user_id: null, community_id: COMMUNITY },
        ]);
        const result = await sendProviderPortalLinkForAdmin(db, COMMUNITY, 'admin-1', { provider_name: 'Juan' });
        expect(result).toMatchObject({ status: 'AMBIGUOUS' });
        expect(createProviderInvite).not.toHaveBeenCalled();
    });

    it('no da enlace a quien tiene cuenta ni a un maestro de otra comunidad', async () => {
        const { db } = fakeDb([
            { id: 'p-1', name: 'Ana', contact_phone: '1', user_id: 'u-1', community_id: COMMUNITY },
            { id: 'p-9', name: 'Pedro', contact_phone: '1', user_id: null, community_id: 'otra' },
        ]);
        expect(await sendProviderPortalLinkForAdmin(db, COMMUNITY, 'a', { provider_name: 'Ana' })).toMatchObject({ status: 'HAS_ACCOUNT' });
        expect(await sendProviderPortalLinkForAdmin(db, COMMUNITY, 'a', { provider_id: 'p-9', provider_name: 'Pedro' })).toHaveProperty('error');
        expect(createProviderInvite).not.toHaveBeenCalled();
    });

    it('exige el nombre que se confirmó y que calce con el ID', async () => {
        const { db } = fakeDb([{ id: 'p-1', name: 'Juan Pérez', contact_phone: '912345678', user_id: null, community_id: COMMUNITY }]);
        expect(await sendProviderPortalLinkForAdmin(db, COMMUNITY, 'a', { provider_id: 'p-1' })).toHaveProperty('error');
        expect(await sendProviderPortalLinkForAdmin(db, COMMUNITY, 'a', { provider_id: 'p-1', provider_name: 'Ana' })).toHaveProperty('error');
        expect(createProviderInvite).not.toHaveBeenCalled();
        await sendProviderPortalLinkForAdmin(db, COMMUNITY, 'a', { provider_id: 'p-1', provider_name: 'Juan Perez' });
        expect(createProviderInvite).toHaveBeenCalledWith(COMMUNITY, 'a', 'p-1');
    });

    it('la bitácora no guarda el enlace en claro', async () => {
        const { db } = fakeDb([{ id: 'p-1', name: 'Juan Pérez', contact_phone: '912345678', user_id: null, community_id: COMMUNITY }]);
        const result = await sendProviderPortalLinkForAdmin(db, COMMUNITY, 'a', { provider_name: 'Juan' });
        const { sanitizeMetadata } = await vi.importActual<typeof import('@/lib/operations/audit')>('@/lib/operations/audit');
        const stored = JSON.stringify(sanitizeMetadata({ result, note: 'https://x.cl/proveedor/tok_abcdefghijklmnopqrstuvwxyz' }));
        expect(stored).not.toContain('tok_abcdefghijklmnopqrstuvwxyz');
        expect(stored).toContain('Juan Pérez');
    });

    it('arma el número de WhatsApp chileno', () => {
        expect(whatsappDigits('+56 9 1234 5678')).toBe('56912345678');
        expect(whatsappDigits('912345678')).toBe('56912345678');
        expect(whatsappDigits('12345678')).toBe('56912345678');
        expect(whatsappDigits('123')).toBe('');
    });
});

describe('quién puede usarlas', () => {
    it('solo la administración, y siempre con confirmación', async () => {
        vi.doMock('@/lib/supabase/supabaseAdmin', () => ({ supabaseAdmin: {} }));
        const { isToolAllowedForRole, MUTATING_TOOLS, describePendingAction } = await import('@/lib/coco/tools');
        for (const tool of ['register_external_provider', 'send_provider_portal_link']) {
            expect(isToolAllowedForRole(tool, 'admin')).toBe(true);
            expect(isToolAllowedForRole(tool, 'concierge')).toBe(false);
            expect(isToolAllowedForRole(tool, 'resident')).toBe(false);
            expect(isToolAllowedForRole(tool, 'system')).toBe(false);
            expect(MUTATING_TOOLS.has(tool)).toBe(true);
        }
        expect(describePendingAction('send_provider_portal_link', { provider_name: 'Juan' }).summary).toContain('Juan');
    });
});
