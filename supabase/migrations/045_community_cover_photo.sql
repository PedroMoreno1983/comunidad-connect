-- Adds an optional real cover-photo URL per community, used to personalize the
-- resident/admin dashboard hero for that specific building. Null by default —
-- this is opt-in per community, not a generic placeholder for every tenant.
ALTER TABLE public.communities ADD COLUMN IF NOT EXISTS cover_photo_url TEXT;

UPDATE public.communities
SET cover_photo_url = '/edificio-malaga-patio.jpg'
WHERE id = 'b392cf17-fd6b-47dd-b0b4-72b0e007824e';
