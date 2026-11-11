/**
 * Bodegas sobre Postgres real (PGlite) con la migración del repo: RLS, el guard
 * de estados, arrendar con cargos mensuales en gastos comunes, la exclusión de
 * arriendos superpuestos y la cancelación de los meses futuros.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asServiceRole, asUser, createParkingDb, seedCommunity, type SeededCommunity } from '../fixtures/parkingChargesDb';
import { storageRangesOverlap, validStoragePeriod } from '@/lib/coco/storageTools';

let db: PGlite;

function firstOfNextMonth(offsetMonths = 1): string {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offsetMonths, 1)).toISOString().slice(0, 10);
}

async function publishStorage(community: SeededCommunity, monthlyRate = 30000, minMonths = 1): Promise<string> {
    const storageId = await asUser(db, community.ownerId, async () => {
        const { rows } = await db.query<{ id: string }>(
            `INSERT INTO public.storage_units (community_id, owner_id, label, monthly_rate, min_months)
             VALUES ($1, $2, 'Bodega 7', $3, $4) RETURNING id`,
            [community.communityId, community.ownerId, monthlyRate, minMonths],
        );
        return rows[0].id;
    });
    await asUser(db, community.adminId, () => db.query('SELECT public.review_storage_unit($1, true, \'\')', [storageId]));
    return storageId;
}

beforeAll(async () => {
    db = await createParkingDb();
    // En producción profiles tiene full_name; la fixture de estacionamientos no lo necesitaba.
    await db.exec('ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT');
    await db.exec(readFileSync(resolve(process.cwd(), 'supabase/migrations/20261110200000_storage_rentals.sql'), 'utf8'));
}, 60_000);

describe('bodegas: publicar y aprobar', () => {
    it('el dueño no puede autopublicarse; la administración aprueba', async () => {
        const community = await seedCommunity(db);
        const storageId = await asUser(db, community.ownerId, async () => {
            const { rows } = await db.query<{ id: string }>(
                `INSERT INTO public.storage_units (community_id, owner_id, label, monthly_rate)
                 VALUES ($1, $2, 'Bodega 1', 25000) RETURNING id`,
                [community.communityId, community.ownerId],
            );
            await expect(db.query('UPDATE public.storage_units SET status = \'published\' WHERE id = $1', [rows[0].id]))
                .rejects.toThrow(/administración/);
            return rows[0].id;
        });
        await asUser(db, community.residentId, async () => {
            await expect(db.query('SELECT public.review_storage_unit($1, true, \'\')', [storageId])).rejects.toThrow(/administración/);
        });
        await asUser(db, community.adminId, () => db.query('SELECT public.review_storage_unit($1, true, \'\')', [storageId]));
        const { rows } = await db.query<{ status: string }>('SELECT status FROM public.storage_units WHERE id = $1', [storageId]);
        expect(rows[0].status).toBe('published');

        // Ya aprobada, el dueño puede pausarla y retomarla.
        await asUser(db, community.ownerId, async () => {
            await db.query('UPDATE public.storage_units SET status = \'paused\' WHERE id = $1', [storageId]);
            await db.query('UPDATE public.storage_units SET status = \'published\' WHERE id = $1', [storageId]);
        });
    });

    it('nadie ve bodegas de otro condominio', async () => {
        const a = await seedCommunity(db);
        const b = await seedCommunity(db);
        await publishStorage(a);
        const visible = await asUser(db, b.adminId, async () => (await db.query('SELECT id FROM public.storage_units WHERE community_id = $1', [a.communityId])).rows);
        expect(visible).toHaveLength(0);
        const found = await asUser(db, b.residentId, async () => (await db.query('SELECT * FROM public.search_storage_units($1, 1)', [firstOfNextMonth()])).rows);
        expect(found).toHaveLength(0);
    });
});

describe('bodegas: arrendar', () => {
    it('genera un cargo por mes en la unidad de quien arrienda y bloquea el período', async () => {
        const community = await seedCommunity(db);
        const storageId = await publishStorage(community, 30000);
        const startsOn = firstOfNextMonth();

        const found = await asUser(db, community.residentId, async () =>
            (await db.query<{ id: string; total_amount: number }>('SELECT id, total_amount FROM public.search_storage_units($1, 3)', [startsOn])).rows);
        expect(found).toEqual([expect.objectContaining({ id: storageId, total_amount: 90000 })]);

        const rentalId = await asUser(db, community.residentId, async () =>
            (await db.query<{ id: string }>('SELECT public.rent_storage_unit($1, $2, 3) AS id', [storageId, startsOn])).rows[0].id);

        const charges = await db.query<{ unit_id: string; amount: string; status: string; kind: string }>(
            `SELECT uc.unit_id, uc.amount, uc.status, uc.kind FROM public.unit_charges uc
             JOIN public.storage_rental_charges src ON src.unit_charge_id = uc.id
             WHERE src.rental_id = $1 ORDER BY src.period`,
            [rentalId],
        );
        expect(charges.rows).toHaveLength(3);
        expect(charges.rows.every(row => row.unit_id === community.residentUnitId && Number(row.amount) === 30000
            && row.status === 'pending' && row.kind === 'service')).toBe(true);

        // Ya no aparece libre en ese período, y un segundo arriendo superpuesto falla.
        const after = await asUser(db, community.residentId, async () =>
            (await db.query('SELECT id FROM public.search_storage_units($1, 1)', [firstOfNextMonth(2)])).rows);
        expect(after).toHaveLength(0);
        await asUser(db, community.residentId, async () => {
            await expect(db.query('SELECT public.rent_storage_unit($1, $2, 1)', [storageId, firstOfNextMonth(2)]))
                .rejects.toThrow(/ya está arrendada/);
        });
        // Libre de nuevo justo cuando termina.
        const later = await asUser(db, community.residentId, async () =>
            (await db.query('SELECT id FROM public.search_storage_units($1, 1)', [firstOfNextMonth(4)])).rows);
        expect(later).toHaveLength(1);
    });

    it('respeta meses mínimos, no deja arrendar la propia ni en el pasado', async () => {
        const community = await seedCommunity(db);
        const storageId = await publishStorage(community, 20000, 3);
        await asUser(db, community.residentId, async () => {
            await expect(db.query('SELECT public.rent_storage_unit($1, $2, 2)', [storageId, firstOfNextMonth()])).rejects.toThrow(/al menos 3/);
            await expect(db.query('SELECT public.rent_storage_unit($1, $2, 3)', [storageId, '2020-01-01'])).rejects.toThrow(/pasado/);
        });
        await asUser(db, community.ownerId, async () => {
            await expect(db.query('SELECT public.rent_storage_unit($1, $2, 3)', [storageId, firstOfNextMonth()])).rejects.toThrow(/propia/);
        });
    });

    it('la entrada de CoCo está cerrada a usuarios normales y abierta a la service role', async () => {
        const community = await seedCommunity(db);
        const storageId = await publishStorage(community);
        await asUser(db, community.residentId, async () => {
            await expect(db.query('SELECT public.coco_rent_storage_unit($1, $2, $3, 1)', [community.residentId, storageId, firstOfNextMonth()]))
                .rejects.toThrow(/permission denied/);
        });
        const rentalId = await asServiceRole(db, async () =>
            (await db.query<{ id: string }>('SELECT public.coco_rent_storage_unit($1, $2, $3, 1) AS id', [community.residentId, storageId, firstOfNextMonth()])).rows[0].id);
        expect(rentalId).toBeTruthy();
    });
});

describe('bodegas: cancelar', () => {
    it('anula los cargos pendientes de meses futuros y libera la bodega', async () => {
        const community = await seedCommunity(db);
        const storageId = await publishStorage(community, 15000);
        const rentalId = await asUser(db, community.residentId, async () =>
            (await db.query<{ id: string }>('SELECT public.rent_storage_unit($1, $2, 2) AS id', [storageId, firstOfNextMonth()])).rows[0].id);

        // Otro residente no puede cancelarlo.
        await asUser(db, community.ownerId, async () => {
            await expect(db.query('SELECT public.cancel_storage_rental($1, \'\')', [rentalId])).rejects.toThrow(/no encontrado/);
        });

        const cancelled = await asUser(db, community.residentId, async () =>
            (await db.query<{ n: number }>('SELECT public.cancel_storage_rental($1, \'Me cambio\') AS n', [rentalId])).rows[0].n);
        expect(cancelled).toBe(2);

        const statuses = await db.query<{ status: string }>(
            `SELECT uc.status FROM public.unit_charges uc JOIN public.storage_rental_charges src ON src.unit_charge_id = uc.id
             WHERE src.rental_id = $1`, [rentalId]);
        expect(statuses.rows.map(row => row.status)).toEqual(['cancelled', 'cancelled']);

        const free = await asUser(db, community.residentId, async () =>
            (await db.query('SELECT id FROM public.search_storage_units($1, 2)', [firstOfNextMonth()])).rows);
        expect(free).toHaveLength(1);
    });
});

describe('bodegas: validaciones de CoCo', () => {
    it('valida período y detecta superposición con rangos semiabiertos', () => {
        expect(validStoragePeriod('2026-12-01', 3)).toEqual({ startsOn: '2026-12-01', months: 3 });
        expect(validStoragePeriod('01-12-2026', 3)).toHaveProperty('error');
        expect(validStoragePeriod('2026-12-01', 30)).toHaveProperty('error');
        expect(storageRangesOverlap('2026-12-01', '2027-03-01', '2027-02-01', '2027-04-01')).toBe(true);
        expect(storageRangesOverlap('2026-12-01', '2027-03-01', '2027-03-01', '2027-04-01')).toBe(false);
    });
});
