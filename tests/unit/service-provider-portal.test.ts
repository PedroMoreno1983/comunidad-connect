/**
 * Perfil de proveedor y portal del maestro externo: reglas de edición, el
 * trigger que reserva verificación y nota para la administración (Postgres
 * real con PGlite) y el rechazo de enlaces mal formados.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/supabaseAdmin', () => ({
    supabaseAdmin: new Proxy({}, { get: () => { throw new Error('no debería consultar la base'); } }),
}));
vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

import { providerProfileUpdate } from '@/lib/services/providerProfile';
import { asServiceRole, asUser, createParkingDb, seedCommunity } from '../fixtures/parkingChargesDb';

describe('qué se puede editar del perfil de un proveedor', () => {
    it('traduce los campos y valida teléfono, correo, años, tarifa y disponibilidad', () => {
        expect(providerProfileUpdate({
            name: ' Juan Pérez ', contactPhone: '+56 9 1234 5678', email: 'juan@ejemplo.cl',
            specialties: ['Calefont', '', 'Cañerías'], hourlyRate: '15000', yearsExperience: 12, availability: 'busy',
        })).toEqual({ update: {
            name: 'Juan Pérez', contact_phone: '+56 9 1234 5678', email: 'juan@ejemplo.cl',
            specialties: ['Calefont', 'Cañerías'], hourly_rate: 15000, years_experience: 12, availability: 'busy',
        } });
        expect(providerProfileUpdate({ contactPhone: '123' })).toHaveProperty('error');
        expect(providerProfileUpdate({ email: 'no-es-correo' })).toHaveProperty('error');
        expect(providerProfileUpdate({ yearsExperience: 200 })).toHaveProperty('error');
        expect(providerProfileUpdate({ availability: 'siempre' })).toHaveProperty('error');
        expect(providerProfileUpdate({})).toHaveProperty('error');
    });

    it('no deja tocar verificación, nota ni trabajos', () => {
        const result = providerProfileUpdate({ name: 'Ana', verified: true, rating: 5, completed_jobs: 99 });
        expect(result).toEqual({ update: { name: 'Ana' } });
    });

    it('la tarifa vacía se borra en vez de quedar en cero', () => {
        expect(providerProfileUpdate({ hourlyRate: '' })).toEqual({ update: { hourly_rate: null } });
    });
});

describe('portal por enlace', () => {
    it('rechaza un enlace mal formado sin consultar la base', async () => {
        const { getProviderPortal } = await import('@/lib/services/providerPortal');
        await expect(getProviderPortal('../../etc')).rejects.toMatchObject({ status: 404 });
    });
});

describe('service_providers_guard (Postgres real)', () => {
    let db: PGlite;
    beforeAll(async () => {
        db = await createParkingDb();
        await db.exec(`
          CREATE TABLE public.service_providers (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'general', contact_phone TEXT NOT NULL DEFAULT '',
            bio TEXT, rating NUMERIC(2,1) NOT NULL DEFAULT 0, review_count INTEGER DEFAULT 0, completed_jobs INTEGER DEFAULT 0,
            verified BOOLEAN DEFAULT FALSE, user_id UUID, community_id UUID NOT NULL REFERENCES public.communities(id)
          );
          ALTER TABLE public.service_providers ENABLE ROW LEVEL SECURITY;
          -- Como en producción: lectura y escritura de la administración acotadas a su comunidad.
          CREATE POLICY "own_update" ON public.service_providers FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
          CREATE POLICY "community_read" ON public.service_providers FOR SELECT USING (community_id = public.get_my_community_id());
          CREATE POLICY "admin_community_only" ON public.service_providers FOR ALL
            USING (community_id = public.get_my_community_id() AND public.get_my_role() = 'admin');
          GRANT SELECT, UPDATE ON public.service_providers TO authenticated;
          -- Reseñas como en schema.sql: visibles solo dentro del tenant del proveedor.
          CREATE TABLE public.reviews (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            provider_id UUID NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
            user_id UUID NOT NULL, rating INTEGER NOT NULL, comment TEXT
          );
          ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
          CREATE POLICY "reviews_select_same_tenant" ON public.reviews FOR SELECT USING (
            provider_id IN (SELECT id FROM public.service_providers WHERE community_id = public.get_my_community_id())
          );
          GRANT SELECT ON public.reviews TO authenticated;
          CREATE TABLE public.service_requests (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
        `);
        await db.exec(readFileSync(resolve(process.cwd(), 'supabase/migrations/20261113120000_service_provider_portal.sql'), 'utf8'));
        await db.exec(readFileSync(resolve(process.cwd(), 'supabase/migrations/20261113160000_service_provider_network.sql'), 'utf8'));
        await db.exec(readFileSync(resolve(process.cwd(), 'supabase/migrations/20261114120000_service_provider_media_documents.sql'), 'utf8'));
    });

    const networkProvider = async () => {
        const { rows } = await asServiceRole(db, () => db.query<{ id: string }>(
            "INSERT INTO public.service_providers (name, community_id) VALUES ('Red', NULL) RETURNING id",
        ));
        return rows[0].id;
    };

    it('un maestro de la red lo ven todas las comunidades', async () => {
        const [a, b] = [await seedCommunity(db), await seedCommunity(db)];
        const id = await networkProvider();
        for (const community of [a, b]) {
            const { rows } = await asUser(db, community.residentId, () => db.query('SELECT id FROM public.service_providers WHERE id = $1', [id]));
            expect(rows).toHaveLength(1);
        }
    });

    it('las marcas de antecedentes e identidad solo las pone el servidor', async () => {
        const community = await seedCommunity(db);
        const { rows } = await db.query<{ id: string }>(
            'INSERT INTO public.service_providers (name, user_id, community_id) VALUES ($1, $2, $3) RETURNING id',
            ['Rosa', community.ownerId, community.communityId],
        );
        const id = rows[0].id;
        for (const userId of [community.ownerId, community.adminId]) {
            await asUser(db, userId, async () => {
                await expect(db.query('UPDATE public.service_providers SET background_checked_at = now() WHERE id = $1', [id])).rejects.toThrow(/Convive/);
                await expect(db.query('UPDATE public.service_providers SET identity_checked_at = now() WHERE id = $1', [id])).rejects.toThrow(/Convive/);
            });
        }
        await asServiceRole(db, () => db.query('UPDATE public.service_providers SET background_checked_at = now() WHERE id = $1', [id]));
    });

    it('las fotos de trabajos se ven igual que el proveedor; los documentos, nunca', async () => {
        const [a, b] = [await seedCommunity(db), await seedCommunity(db)];
        const { rows } = await db.query<{ id: string }>(
            "INSERT INTO public.service_providers (name, community_id) VALUES ('Local', $1) RETURNING id", [a.communityId],
        );
        const local = rows[0].id;
        const network = await networkProvider();
        await asServiceRole(db, async () => {
            for (const id of [local, network]) {
                await db.query("INSERT INTO public.service_provider_photos (provider_id, storage_path, url) VALUES ($1, 'p', 'https://x/p.jpg')", [id]);
                await db.query("INSERT INTO public.service_provider_documents (provider_id, kind, storage_path, file_name, mime_type, size_bytes) VALUES ($1, 'identity', 'd', 'c.pdf', 'application/pdf', 10)", [id]);
            }
        });
        const seen = async (userId: string) => (await asUser(db, userId, () => db.query<{ provider_id: string }>(
            'SELECT provider_id FROM public.service_provider_photos WHERE provider_id = ANY($1)', [[local, network]],
        ))).rows.map(row => row.provider_id).sort();
        expect(await seen(a.residentId)).toEqual([local, network].sort());
        expect(await seen(b.residentId)).toEqual([network]);
        await asUser(db, a.adminId, async () => {
            await expect(db.query('SELECT * FROM public.service_provider_documents')).rejects.toThrow(/permission denied/);
        });
    });

    it('las reseñas de un maestro de la red las leen todas las comunidades', async () => {
        const [a, b] = [await seedCommunity(db), await seedCommunity(db)];
        const id = await networkProvider();
        await asServiceRole(db, () => db.query('INSERT INTO public.reviews (provider_id, user_id, rating, comment) VALUES ($1, $2, 5, $3)', [id, a.residentId, 'Excelente']));
        for (const community of [a, b]) {
            const { rows } = await asUser(db, community.residentId, () => db.query('SELECT comment FROM public.reviews WHERE provider_id = $1', [id]));
            expect(rows).toEqual([{ comment: 'Excelente' }]);
        }
    });

    it('ninguna administración puede editar ni apropiarse de un maestro de la red', async () => {
        const community = await seedCommunity(db);
        const id = await networkProvider();
        await asUser(db, community.adminId, async () => {
            const result = await db.query('UPDATE public.service_providers SET verified = true, community_id = $1 WHERE id = $2', [community.communityId, id]);
            expect(result.affectedRows).toBe(0);
        });
        const { rows } = await db.query<{ verified: boolean; community_id: string | null }>('SELECT verified, community_id FROM public.service_providers WHERE id = $1', [id]);
        expect(rows[0]).toEqual({ verified: false, community_id: null });
    });

    it('sumar a la red (cambiar la comunidad) es solo del servidor', async () => {
        const community = await seedCommunity(db);
        const { rows } = await db.query<{ id: string }>(
            'INSERT INTO public.service_providers (name, user_id, community_id) VALUES ($1, $2, $3) RETURNING id',
            ['Pedro', community.ownerId, community.communityId],
        );
        const id = rows[0].id;
        await asUser(db, community.adminId, async () => {
            await expect(db.query('UPDATE public.service_providers SET community_id = NULL WHERE id = $1', [id])).rejects.toThrow();
        });
        await asUser(db, community.ownerId, async () => {
            await expect(db.query('UPDATE public.service_providers SET community_id = NULL WHERE id = $1', [id])).rejects.toThrow();
        });
        await asServiceRole(db, () => db.query('UPDATE public.service_providers SET community_id = NULL WHERE id = $1', [id]));
        const { rows: after } = await db.query<{ community_id: string | null }>('SELECT community_id FROM public.service_providers WHERE id = $1', [id]);
        expect(after[0].community_id).toBeNull();
    });

    it('el maestro con cuenta edita su perfil pero no se verifica ni se sube la nota', async () => {
        const community = await seedCommunity(db);
        const { rows } = await db.query<{ id: string }>(
            'INSERT INTO public.service_providers (name, user_id, community_id) VALUES ($1, $2, $3) RETURNING id',
            ['Juan', community.residentId, community.communityId],
        );
        const id = rows[0].id;
        await asUser(db, community.residentId, async () => {
            await db.query('UPDATE public.service_providers SET bio = $1 WHERE id = $2', ['Gasfiter con 10 años', id]);
            await expect(db.query('UPDATE public.service_providers SET verified = true WHERE id = $1', [id])).rejects.toThrow(/administración/);
            await expect(db.query('UPDATE public.service_providers SET rating = 5 WHERE id = $1', [id])).rejects.toThrow(/administración/);
        });
        await asUser(db, community.adminId, () => db.query('UPDATE public.service_providers SET verified = true WHERE id = $1', [id]));
        await asServiceRole(db, () => db.query('UPDATE public.service_providers SET rating = 4.5 WHERE id = $1', [id]));
        const { rows: after } = await db.query<{ bio: string; verified: boolean; rating: string }>('SELECT bio, verified, rating FROM public.service_providers WHERE id = $1', [id]);
        expect(after[0]).toMatchObject({ bio: 'Gasfiter con 10 años', verified: true });
        expect(Number(after[0].rating)).toBe(4.5);
    });

    it('la tabla de enlaces no es visible para usuarios', async () => {
        const community = await seedCommunity(db);
        await asUser(db, community.adminId, async () => {
            await expect(db.query('SELECT * FROM public.service_provider_links')).rejects.toThrow(/permission denied/);
        });
    });
});
