/**
 * CoCo por WhatsApp con quien no es residente verificado: reconoce al maestro
 * por su teléfono y le ayuda con su perfil, y a un número desconocido no le
 * exige el depto de entrada.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const anthropic = vi.hoisted(() => ({ create: vi.fn(), calls: [] as Array<Record<string, unknown>> }));
vi.mock('@anthropic-ai/sdk', () => ({
    default: class {
        messages = {
            create: async (params: Record<string, unknown>) => {
                anthropic.calls.push(JSON.parse(JSON.stringify(params)));
                return anthropic.create(params);
            },
        };
    },
}));
vi.mock('@/lib/ai/budget', () => ({
    enforceAiBudget: vi.fn(async () => undefined),
    recordAiUsage: vi.fn(async () => undefined),
    estimateTokensFromText: (text: string) => Math.ceil(text.length / 4),
}));
const audit = vi.hoisted(() => ({ platform: vi.fn(async () => ({ ok: true })), community: vi.fn(async () => ({ ok: true })) }));
vi.mock('@/lib/operations/audit', () => ({ recordPlatformOperationEvent: audit.platform, recordOperationEvent: audit.community }));
const portal = vi.hoisted(() => ({ invite: vi.fn(async () => ({ token: 'tok_abcdefghijklmnopqrstuvwxyz', expiresAt: '2027-02-15T00:00:00.000Z', providerName: 'Juan' })) }));
vi.mock('@/lib/services/providerPortal', () => ({
    createProviderInvite: portal.invite,
    isInternalProvider: (row: { name?: unknown }) => String(row.name || '').toLowerCase() === 'mesa de ayuda interna',
}));

const db = vi.hoisted(() => ({ updates: [] as Array<{ table: string; values: Record<string, unknown>; filters: string[] }>, rows: {} as Record<string, Array<Record<string, unknown>>> }));
vi.mock('@/lib/supabase/supabaseAdmin', () => ({
    getSupabaseAdmin: () => ({
        from(table: string) {
            const filters: string[] = [];
            let values: Record<string, unknown> | null = null;
            const builder = {
                select: () => builder,
                update: (next: Record<string, unknown>) => { values = next; return builder; },
                eq: (column: string, value: unknown) => { filters.push(`${column}=${value}`); return builder; },
                is: (column: string, value: unknown) => { filters.push(`${column} is ${value}`); return builder; },
                ilike: () => builder,
                limit: () => builder,
                maybeSingle: async () => ({ data: (db.rows[table] || [])[0] ?? null, error: null }),
                then(resolve: (value: { data: unknown; error: null }) => void) {
                    if (values) db.updates.push({ table, values, filters: [...filters] });
                    resolve({ data: db.rows[table] || [], error: null });
                },
            };
            return builder;
        },
    }),
}));

import { askCoCoGuest, canonicalChileanPhone, phoneMatches, profileStatus, type WhatsAppProvider } from '@/lib/coco/whatsappGuest';

const juan: WhatsAppProvider = { id: 'prov-1', name: 'Juan', category: 'plumbing', communityId: null };

function text(value: string) {
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: value }], usage: { input_tokens: 10, output_tokens: 5 } };
}
function tool(name: string, input: Record<string, unknown>) {
    return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `call-${name}`, name, input }], usage: { input_tokens: 10, output_tokens: 5 } };
}

beforeEach(() => {
    anthropic.create.mockReset();
    anthropic.calls.length = 0;
    db.updates.length = 0;
    db.rows = {};
    audit.platform.mockClear();
    portal.invite.mockClear();
});

describe('teléfonos', () => {
    it('reconoce el mismo número escrito de distintas formas', () => {
        expect(canonicalChileanPhone('+56 9 1234 5678')).toBe('56912345678');
        expect(canonicalChileanPhone('912345678')).toBe('56912345678');
        expect(phoneMatches('+56 9 1234 5678', '56912345678')).toBe(true);
        expect(phoneMatches('+56 9 1234 5679', '56912345678')).toBe(false);
    });
});

describe('perfil del maestro', () => {
    it('dice qué le falta', () => {
        const status = profileStatus({ bio: 'Gasfíter con experiencia en edificios', years_experience: 0, specialties: ['calefont'], photo: null });
        expect(status.completos).toEqual(['descripción de tu trabajo', 'especialidades']);
        expect(status.faltan).toContain('foto');
        expect(status.faltan).toContain('años de experiencia');
    });

    it('guarda lo que el maestro dice por chat, solo en su perfil de la red', async () => {
        anthropic.create
            .mockResolvedValueOnce(tool('actualizar_mi_perfil', { yearsExperience: 12, serviceAddress: 'Maipú y Cerrillos' }))
            .mockResolvedValueOnce(text('Listo, Juan: guardé tus 12 años y que trabajas en Maipú y Cerrillos.'));

        const turn = await askCoCoGuest({ message: 'tengo 12 años, trabajo en maipú y cerrillos', session: null, waId: '56912345678', provider: juan, verifyResident: null });

        expect(db.updates).toEqual([{ table: 'service_providers', values: { years_experience: 12, service_address: 'Maipú y Cerrillos' }, filters: ['id=prov-1', 'community_id is null'] }]);
        expect(audit.platform).toHaveBeenCalledOnce();
        expect(turn.reply).toContain('12 años');
        expect(turn.history.map(item => item.role)).toEqual(['user', 'assistant']);
        const tools = (anthropic.calls[0].tools as Array<{ name: string }>).map(item => item.name);
        expect(tools).toEqual(['ver_mi_perfil', 'actualizar_mi_perfil', 'enviar_link_perfil']);
        expect(String(anthropic.calls[0].system)).toContain('Te escribe Juan');
    });

    it('manda su link personal cuando lo pide', async () => {
        anthropic.create
            .mockResolvedValueOnce(tool('enviar_link_perfil', {}))
            .mockResolvedValueOnce(text('Aquí está tu link.'));
        await askCoCoGuest({ message: 'mándame el link', session: null, waId: '56912345678', provider: juan, verifyResident: null });
        expect(portal.invite).toHaveBeenCalledWith(null, null, 'prov-1');
        const toolResult = JSON.stringify(anthropic.calls[1].messages);
        expect(toolResult).toContain('/proveedor/tok_abcdefghijklmnopqrstuvwxyz');
    });
});

describe('número sin registrar', () => {
    it('conversa sin pedir el depto y sin herramientas si el número no tiene perfil', async () => {
        anthropic.create.mockResolvedValueOnce(text('Hola, soy CoCo de Convive Connect. ¿En qué te ayudo?'));
        const turn = await askCoCoGuest({ message: 'hola, qué es esto?', session: null, waId: '56911112222', provider: null, verifyResident: null });
        expect(anthropic.calls[0].tools).toBeUndefined();
        expect(turn.reply).toContain('CoCo');
        expect(turn.verifiedResident).toBe(false);
    });

    it('verifica al residente cuando da su depto', async () => {
        const verify = vi.fn(async () => ({ ok: true as const, name: 'Ana' }));
        anthropic.create.mockResolvedValueOnce(tool('verificar_residente', { depto: '8B' }));
        const turn = await askCoCoGuest({ message: 'soy del 8B', session: null, waId: '56911112222', provider: null, verifyResident: verify });
        expect(verify).toHaveBeenCalledWith('8B');
        expect(turn.verifiedResident).toBe(true);
        expect(anthropic.calls).toHaveLength(1);
    });
});

describe('lo que CoCo dice de Convive', () => {
    it('no promete pago en línea ni habla de expensas', async () => {
        anthropic.create.mockResolvedValueOnce(text('Convive es una plataforma para comunidades.'));
        await askCoCoGuest({ message: '¿qué es Convive?', session: null, waId: '56911112222', provider: null, verifyResident: null });
        const system = String(anthropic.calls[0].system);
        expect(system).toContain('El pago en línea todavía no está disponible');
        expect(system).toContain('nunca "expensas"');
    });
});
