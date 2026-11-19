/**
 * 18-11-2026: la fila de communities que lee cada miembro incluía el código de
 * administración, el de conserjería y los secretos de webhooks. Desde la
 * migración 20261118220000 el navegador no puede leerlos; la administración
 * recibe los códigos por /api/admin/invite-codes.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const HIDDEN = ['admin_code', 'concierge_code', 'resident_code', 'iot_webhook_secret', 'access_webhook_secret', 'stripe_customer_id'];

describe('códigos y secretos de la comunidad', () => {
    it('la migración no los devuelve al navegador', () => {
        const sql = readFileSync('supabase/migrations/20261118220000_hide_community_codes_and_secrets.sql', 'utf8');
        expect(sql).toMatch(/REVOKE SELECT ON public\.communities FROM anon, authenticated/);
        const grant = sql.slice(sql.indexOf('GRANT SELECT ('));
        for (const column of HIDDEN) expect(grant).not.toContain(column);
    });

    it('el código del navegador no los pide a communities', () => {
        for (const file of ['src/lib/api/users.ts', 'src/lib/api/parking.ts', 'src/lib/authContext.tsx']) {
            const source = readFileSync(file, 'utf8');
            const selects = source.match(/communities[^;]*?select\([^)]*\)/g) ?? [];
            for (const select of selects) for (const column of HIDDEN) expect(select).not.toContain(column);
        }
    });

    it('solo la administración recibe los códigos', () => {
        const route = readFileSync('src/app/api/admin/invite-codes/route.ts', 'utf8');
        expect(route).toContain("profile.role !== 'admin'");
        expect(route).toContain('getSupabaseAdmin');
    });
});
