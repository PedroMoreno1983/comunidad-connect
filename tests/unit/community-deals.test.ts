/**
 * Convenios comunitarios sobre Postgres real (PGlite) con la migración del
 * repo: quién propone, quién ve qué, sumarse, cotizaciones y elegir una.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asServiceRole, asUser, createParkingDb, seedCommunity, type SeededCommunity } from '../fixtures/parkingChargesDb';
import {
    dealMonthlySavings,
    detectDealOpportunities,
} from '@/lib/communityDealsDomain';

let db: PGlite;

async function adminDeal(community: SeededCommunity, status = 'gauging'): Promise<string> {
    return asUser(db, community.adminId, async () => (await db.query<{ id: string }>(
        `INSERT INTO public.community_deals (community_id, created_by, title, kind, status, reference_price, deal_price)
         VALUES ($1, $2, 'Internet para el edificio', 'bulk_service', $3, 25000, 15000) RETURNING id`,
        [community.communityId, community.adminId, status],
    )).rows[0].id);
}

beforeAll(async () => {
    db = await createParkingDb();
    await db.exec('ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT');
    await db.exec(readFileSync(resolve(process.cwd(), 'supabase/migrations/20261111120000_community_deals.sql'), 'utf8'));
}, 60_000);

describe('convenios: proponer y gobernar', () => {
    it('un residente solo propone; lo propuesto lo ven quien propuso y la administración', async () => {
        const community = await seedCommunity(db);
        await asUser(db, community.residentId, async () => {
            await expect(db.query(
                `INSERT INTO public.community_deals (community_id, created_by, title, kind, status)
                 VALUES ($1, $2, 'Feria los martes', 'vendor_visit', 'active')`,
                [community.communityId, community.residentId],
            )).rejects.toThrow(/row-level security/);
            await db.query(
                `INSERT INTO public.community_deals (community_id, created_by, title, kind)
                 VALUES ($1, $2, 'Feria los martes', 'vendor_visit')`,
                [community.communityId, community.residentId],
            );
        });
        const seenByOwner = await asUser(db, community.ownerId, async () => (await db.query('SELECT id FROM public.list_community_deals()')).rows);
        const seenByProposer = await asUser(db, community.residentId, async () => (await db.query('SELECT id FROM public.list_community_deals()')).rows);
        const seenByAdmin = await asUser(db, community.adminId, async () => (await db.query('SELECT id FROM public.list_community_deals()')).rows);
        expect(seenByOwner).toHaveLength(0);
        expect(seenByProposer).toHaveLength(1);
        expect(seenByAdmin).toHaveLength(1);

        // Un residente no avanza el ciclo.
        const dealId = (seenByAdmin[0] as { id: string }).id;
        await asUser(db, community.residentId, async () => {
            await db.query('UPDATE public.community_deals SET status = \'active\' WHERE id = $1', [dealId]);
        });
        const { rows } = await db.query<{ status: string }>('SELECT status FROM public.community_deals WHERE id = $1', [dealId]);
        expect(rows[0].status).toBe('proposed');
    });

    it('nadie ve convenios de otro condominio', async () => {
        const a = await seedCommunity(db);
        const b = await seedCommunity(db);
        await adminDeal(a);
        const seen = await asUser(db, b.adminId, async () => (await db.query('SELECT id FROM public.community_deals WHERE community_id = $1', [a.communityId])).rows);
        expect(seen).toHaveLength(0);
    });
});

describe('convenios: interesados y cotizaciones', () => {
    it('sumarse y salirse ajusta el conteo; solo con el convenio abierto a interesados', async () => {
        const community = await seedCommunity(db);
        const dealId = await adminDeal(community);
        const count1 = await asUser(db, community.residentId, async () =>
            (await db.query<{ n: number }>('SELECT public.set_community_deal_interest($1, true, \'Tengo VTR\') AS n', [dealId])).rows[0].n);
        const count2 = await asUser(db, community.ownerId, async () =>
            (await db.query<{ n: number }>('SELECT public.set_community_deal_interest($1, true, \'\') AS n', [dealId])).rows[0].n);
        expect([count1, count2]).toEqual([1, 2]);

        const listed = await asUser(db, community.residentId, async () =>
            (await db.query<{ interested_count: number; i_am_interested: boolean }>('SELECT interested_count, i_am_interested FROM public.list_community_deals()')).rows[0]);
        expect(listed).toEqual({ interested_count: 2, i_am_interested: true });

        // El residente ve su propio interés, no el de los demás.
        const visible = await asUser(db, community.residentId, async () => (await db.query('SELECT user_id FROM public.community_deal_interests')).rows);
        expect(visible).toHaveLength(1);

        const count3 = await asUser(db, community.residentId, async () =>
            (await db.query<{ n: number }>('SELECT public.set_community_deal_interest($1, false, \'\') AS n', [dealId])).rows[0].n);
        expect(count3).toBe(1);

        const closed = await adminDeal(community, 'closed');
        await asUser(db, community.residentId, async () => {
            await expect(db.query('SELECT public.set_community_deal_interest($1, true, \'\')', [closed])).rejects.toThrow(/no está recibiendo/);
        });
    });

    it('solo la administración cotiza, y la elegida debe ser del mismo convenio', async () => {
        const community = await seedCommunity(db);
        const dealId = await adminDeal(community, 'quoting');
        const otherDeal = await adminDeal(community, 'quoting');
        await asUser(db, community.residentId, async () => {
            await expect(db.query(
                `INSERT INTO public.community_deal_quotes (deal_id, community_id, provider_name, price) VALUES ($1, $2, 'Mundo', 14990)`,
                [dealId, community.communityId],
            )).rejects.toThrow(/row-level security/);
        });
        const [quoteA, quoteOther] = await asUser(db, community.adminId, async () => [
            (await db.query<{ id: string }>(`INSERT INTO public.community_deal_quotes (deal_id, community_id, provider_name, price) VALUES ($1, $2, 'Mundo', 14990) RETURNING id`, [dealId, community.communityId])).rows[0].id,
            (await db.query<{ id: string }>(`INSERT INTO public.community_deal_quotes (deal_id, community_id, provider_name, price) VALUES ($1, $2, 'GTD', 13990) RETURNING id`, [otherDeal, community.communityId])).rows[0].id,
        ]);
        await asUser(db, community.adminId, async () => {
            await expect(db.query('UPDATE public.community_deals SET selected_quote_id = $1 WHERE id = $2', [quoteOther, dealId]))
                .rejects.toThrow(/no es de este convenio/);
            await db.query('UPDATE public.community_deals SET selected_quote_id = $1, status = \'active\' WHERE id = $2', [quoteA, dealId]);
        });
        const quotesSeen = await asUser(db, community.residentId, async () =>
            (await db.query('SELECT provider_name FROM public.community_deal_quotes WHERE deal_id = $1', [dealId])).rows);
        expect(quotesSeen).toEqual([{ provider_name: 'Mundo' }]);
    });

    it('la entrada de CoCo para sumarse está cerrada a usuarios y abierta a la service role', async () => {
        const community = await seedCommunity(db);
        const dealId = await adminDeal(community);
        await asUser(db, community.residentId, async () => {
            await expect(db.query('SELECT public.community_deal_interest_as($1, $2, true, \'\')', [community.ownerId, dealId]))
                .rejects.toThrow(/permission denied/);
        });
        const count = await asServiceRole(db, async () =>
            (await db.query<{ n: number }>('SELECT public.community_deal_interest_as($1, $2, true, \'\') AS n', [community.residentId, dealId])).rows[0].n);
        expect(count).toBe(1);
    });
});

describe('convenios: dominio', () => {
    it('calcula el ahorro mensual de la comunidad según cómo se cobra', () => {
        expect(dealMonthlySavings({ referencePrice: 25000, dealPrice: 15000, priceUnit: 'unit_month', interestedCount: 40 })).toBe(400000);
        expect(dealMonthlySavings({ referencePrice: 1200000, dealPrice: 900000, priceUnit: 'community_month', interestedCount: 40 })).toBe(300000);
        expect(dealMonthlySavings({ referencePrice: null, dealPrice: 15000, priceUnit: 'unit_month', interestedCount: 40 })).toBeNull();
        expect(dealMonthlySavings({ referencePrice: 10000, dealPrice: 12000, priceUnit: 'unit_month', interestedCount: 5 })).toBe(0);
    });

    it('detecta oportunidades con vecinos distintos, no con la misma persona repitiendo', () => {
        const opportunities = detectDealOpportunities({
            cases: [
                { userId: 'a', text: 'El internet está lentísimo en la torre B' },
                { userId: 'b', text: 'Se cae el wifi todas las noches' },
                { userId: 'c', text: 'La fibra no llega al piso 12' },
                { userId: 'a', text: 'Otra vez sin internet' },
                { userId: 'd', text: 'Hay una gotera en el pasillo' },
            ],
            groupItems: [
                { userId: 'a', term: 'agua bidon 20 l' },
                { userId: 'b', term: 'bidon de agua' },
                { userId: 'c', term: 'agua purificada bidon' },
                { userId: 'e', term: 'arroz' },
            ],
            existingTitles: [],
        });
        expect(opportunities.map(item => item.theme)).toEqual(['internet', 'agua']);
        expect(opportunities[0]).toMatchObject({ kind: 'bulk_service', households: 3 });
        expect(detectDealOpportunities({ cases: [], groupItems: [], existingTitles: [] })).toEqual([]);
        // No repite un convenio que ya existe.
        expect(detectDealOpportunities({
            cases: [{ userId: 'a', text: 'internet' }, { userId: 'b', text: 'wifi' }, { userId: 'c', text: 'fibra' }],
            groupItems: [],
            existingTitles: ['Internet para todo el edificio'],
        })).toEqual([]);
    });
});
