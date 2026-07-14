BEGIN;

ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS author_name TEXT DEFAULT 'Administración';

UPDATE public.announcements AS announcement
SET author_name = COALESCE(NULLIF(profile.name, ''), 'Administración')
FROM public.profiles AS profile
WHERE profile.id = announcement.author_id
  AND (announcement.author_name IS NULL OR announcement.author_name = '');

ALTER TABLE public.announcements
  ALTER COLUMN author_name SET DEFAULT 'Administración';

COMMIT;
