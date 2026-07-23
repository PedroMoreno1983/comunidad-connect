-- Keep stored invitation codes aligned with handle_new_user(), which
-- normalizes submitted codes to upper case before comparing them.

BEGIN;

UPDATE public.communities
SET
  admin_code = CASE WHEN admin_code IS NULL THEN NULL ELSE UPPER(admin_code) END,
  resident_code = CASE WHEN resident_code IS NULL THEN NULL ELSE UPPER(resident_code) END,
  concierge_code = CASE WHEN concierge_code IS NULL THEN NULL ELSE UPPER(concierge_code) END
WHERE
  admin_code IS DISTINCT FROM UPPER(admin_code)
  OR resident_code IS DISTINCT FROM UPPER(resident_code)
  OR concierge_code IS DISTINCT FROM UPPER(concierge_code);

ALTER TABLE public.communities
  DROP CONSTRAINT IF EXISTS communities_invitation_codes_uppercase;

ALTER TABLE public.communities
  ADD CONSTRAINT communities_invitation_codes_uppercase
  CHECK (
    (admin_code IS NULL OR admin_code = UPPER(admin_code))
    AND (resident_code IS NULL OR resident_code = UPPER(resident_code))
    AND (concierge_code IS NULL OR concierge_code = UPPER(concierge_code))
  );

COMMIT;
