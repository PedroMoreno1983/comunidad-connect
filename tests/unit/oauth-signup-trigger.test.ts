/**
 * Entrar con Google sin código: handle_new_user crea el perfil sin edificio
 * (después elige en /bienvenida). El registro con correo sigue exigiendo un
 * código válido. Postgres real (PGlite).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, createParkingDb } from '../fixtures/parkingChargesDb';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

describe('handle_new_user', () => {
    let db: PGlite;
    beforeAll(async () => {
        db = await createParkingDb();
        await db.exec(`
          ALTER TABLE auth.users ADD COLUMN email TEXT, ADD COLUMN raw_user_meta_data JSONB DEFAULT '{}'::jsonb, ADD COLUMN raw_app_meta_data JSONB DEFAULT '{}'::jsonb;
          ALTER TABLE public.communities ADD COLUMN resident_code TEXT, ADD COLUMN concierge_code TEXT, ADD COLUMN admin_code TEXT;
          ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT, ADD COLUMN IF NOT EXISTS email TEXT, ADD COLUMN IF NOT EXISTS department_number TEXT;
          ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
          CREATE POLICY "profiles_select_community_only" ON public.profiles FOR SELECT USING (community_id = public.get_my_community_id());
          GRANT SELECT ON public.profiles TO authenticated;
          ALTER TABLE public.units ADD COLUMN IF NOT EXISTS tower TEXT, ADD COLUMN IF NOT EXISTS floor INTEGER, ADD COLUMN IF NOT EXISTS type TEXT, ADD COLUMN IF NOT EXISTS resident_profile_id UUID;
        `);
        await db.exec(readFileSync(resolve(process.cwd(), 'supabase/migrations/20261114160000_oauth_signup_without_invite.sql'), 'utf8'));
        await db.exec('CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();');
        await db.query("INSERT INTO public.communities (id, name, resident_code, concierge_code, admin_code) VALUES ('11111111-1111-4111-8111-111111111111', 'Los Aromos', 'RES-AROMOS', 'CON-AROMOS', 'ADM-AROMOS')");
    });

    it('con Google y sin código: perfil de residente sin edificio', async () => {
        await db.query(`INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data) VALUES ($1, 'ana@gmail.com', '{"full_name":"Ana Pérez"}', '{"provider":"google"}')`, ['22222222-2222-4222-8222-222222222222']);
        const { rows } = await db.query<{ role: string; community_id: string | null; name: string }>('SELECT role, community_id, name FROM public.profiles WHERE id = $1', ['22222222-2222-4222-8222-222222222222']);
        expect(rows[0]).toEqual({ role: 'resident', community_id: null, name: 'Ana Pérez' });
        // Sin edificio igual se ve a sí misma (si no, el proxy no la manda a /bienvenida).
        const own = await asUser(db, '22222222-2222-4222-8222-222222222222', () => db.query('SELECT id FROM public.profiles WHERE id = $1', ['22222222-2222-4222-8222-222222222222']));
        expect(own.rows).toHaveLength(1);
    });

    it('con correo y sin código: se rechaza, como antes', async () => {
        await expect(db.query(`INSERT INTO auth.users (id, email, raw_app_meta_data) VALUES ($1, 'x@x.cl', '{"provider":"email"}')`, ['33333333-3333-4333-8333-333333333333']))
            .rejects.toThrow(/invitation code/);
    });

    it('con código válido: entra a su edificio y a su unidad, por cualquier vía', async () => {
        await db.query(`INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data) VALUES ($1, 'b@x.cl', '{"name":"Beto","invite_code":"res-aromos","department_number":"504"}', '{"provider":"email"}')`, ['44444444-4444-4444-8444-444444444444']);
        const { rows } = await db.query<{ role: string; community_id: string; unit_id: string | null }>('SELECT role, community_id, unit_id FROM public.profiles WHERE id = $1', ['44444444-4444-4444-8444-444444444444']);
        expect(rows[0]).toMatchObject({ role: 'resident', community_id: '11111111-1111-4111-8111-111111111111' });
        expect(rows[0].unit_id).toBeTruthy();
    });
});
