import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260801213216_harden_public_functions_and_storage_listing.sql'),
  'utf8',
);

const authenticatedFunctions = [
  'current_profile_community_id()',
  'current_profile_role()',
  'get_my_community_id()',
  'get_my_role()',
  'get_my_unit_id()',
  'get_marketplace_inbox()',
  'increment_post_likes(uuid)',
  'mark_marketplace_conversation_read(uuid)',
  'start_marketplace_conversation(uuid)',
];

const serverOnlyFunctions = [
  'enforce_marketplace_message_context()',
  'handle_new_community_solidarity()',
  'handle_new_user()',
  'notify_package_residents()',
  'prevent_profile_privilege_escalation()',
  'purge_expired_supermarket_cart_plans()',
  'set_notification_community()',
  'set_package_community_from_unit()',
  'set_qr_invitation_context()',
  'set_visitor_log_community()',
  'set_water_reading_community()',
  'touch_marketplace_conversation_from_message()',
];

describe('Supabase privileged function hardening', () => {
  it('removes anonymous execution from every privileged application function', () => {
    for (const signature of [...authenticatedFunctions, ...serverOnlyFunctions]) {
      expect(migration).toContain(
        `REVOKE ALL ON FUNCTION public.${signature} FROM PUBLIC, anon, authenticated;`,
      );
    }
  });

  it('only regrants browser RPCs to signed-in users', () => {
    for (const signature of authenticatedFunctions) {
      expect(migration).toContain(
        `GRANT EXECUTE ON FUNCTION public.${signature} TO authenticated, service_role;`,
      );
    }

    for (const signature of serverOnlyFunctions) {
      expect(migration).toContain(
        `GRANT EXECUTE ON FUNCTION public.${signature} TO service_role;`,
      );
      expect(migration).not.toContain(
        `GRANT EXECUTE ON FUNCTION public.${signature} TO authenticated`,
      );
    }
  });

  it('enforces authentication and tenant scope inside the like counter', () => {
    expect(migration).toContain('caller_id uuid := auth.uid()');
    expect(migration).toContain('community_id = caller_community_id');
    expect(migration).toContain("RAISE EXCEPTION 'Authentication required'");
  });

  it('removes broad listing policies from public buckets', () => {
    for (const policy of [
      'avatars_public_read',
      'marketing_reels_public_read',
      'marketing_reels_audio_public_read',
      'marketplace_public_read',
      'social_images_public_read',
    ]) {
      expect(migration).toContain(`DROP POLICY IF EXISTS ${policy} ON storage.objects;`);
    }
  });

  it('makes future public-schema functions private by default', () => {
    expect(migration).toContain(
      'REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;',
    );
  });
});
