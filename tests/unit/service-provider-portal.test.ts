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
          CREATE POLICY "own_update" ON public.service_providers FOR UPDATE USING (auth.uid() = user_id);
          CREATE POLICY "read_all" ON public.service_providers FOR SELECT USING (true);
          CREATE POLICY "admin_update" ON public.service_providers FOR UPDATE USING (public.get_my_role() = 'admin');
        `);
        await db.exec(readFileSync(resolve(process.cwd(), 'supabase/migrations/20261113120000_service_provider_portal.sql'), 'utf8'));
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
