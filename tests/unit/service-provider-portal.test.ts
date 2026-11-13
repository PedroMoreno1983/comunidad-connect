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
vi.setConfig({ testTimeout: 60_000 });

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
        `);
        await db.exec(readFileSync(resolve(process.cwd(), 'supabase/migrations/20261113120000_service_provider_portal.sql'), 'utf8'));
        await db.exec(readFileSync(resolve(process.cwd(), 'supabase/migrations/20261113160000_service_provider_network.sql'), 'utf8'));
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
