/**
 * Portada del condominio (18-11-2026): la administración la cambia desde el
 * inicio o pidiéndoselo a CoCo con una foto adjunta.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/supabaseAdmin', () => ({ getSupabaseAdmin: () => { throw new Error('sin base en tests'); } }));

import { coverPathFromUrl, sniffImageType } from '@/lib/community/coverPhoto';
import { isToolAllowedForRole, isToolOfferedFor, MUTATING_TOOLS, describePendingAction } from '@/lib/coco/tools';
import { ATTACHMENT_TOOLS } from '@/lib/coco/chatAttachments';
import { neighborModeGateFor } from '@/lib/neighborMode';

const COMMUNITY = '07212377-00de-4153-aa98-ab036661b662';

describe('foto de portada', () => {
    it('reconoce el formato por los bytes, no por la extensión', () => {
        expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
        expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe('image/png');
        expect(sniffImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe('image/webp');
        expect(sniffImageType(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeNull();
    });

    it('solo borra fotos de la propia comunidad, nunca la genérica', () => {
        const ours = `https://auth.conviveconnect.com/storage/v1/object/public/community-covers/${COMMUNITY}/abc.jpg`;
        expect(coverPathFromUrl(ours, COMMUNITY)).toBe(`${COMMUNITY}/abc.jpg`);
        expect(coverPathFromUrl(ours, '11111111-1111-1111-1111-111111111111')).toBeNull();
        expect(coverPathFromUrl('/edificio-malaga-patio.jpg', COMMUNITY)).toBeNull();
        expect(coverPathFromUrl(null, COMMUNITY)).toBeNull();
    });
});

describe('CoCo cambia la portada', () => {
    it('solo la administración, con confirmación, y no por WhatsApp', () => {
        expect(isToolAllowedForRole('set_community_cover_photo', 'admin')).toBe(true);
        expect(isToolAllowedForRole('set_community_cover_photo', 'resident')).toBe(false);
        expect(isToolAllowedForRole('set_community_cover_photo', 'concierge')).toBe(false);
        expect(MUTATING_TOOLS.has('set_community_cover_photo')).toBe(true);
        expect(isToolOfferedFor('set_community_cover_photo', 'admin', 'whatsapp')).toBe(false);
        expect(ATTACHMENT_TOOLS.has('set_community_cover_photo')).toBe(true);
        expect(describePendingAction('set_community_cover_photo', { attachment_id: 'x' }).title).toContain('portada');
    });
});

describe('residentes de comunidades sin administrar', () => {
    it('ven Mis servicios: sus cuentas de luz, agua y gas no dependen de la administración', () => {
        expect(neighborModeGateFor('/resident/servicios')).toBeNull();
    });
});
