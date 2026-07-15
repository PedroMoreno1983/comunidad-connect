-- Internal, auditable destination for Agent Center maintenance tickets.
-- This is not an external provider and must be configured explicitly per community.
INSERT INTO public.service_providers (
  id,
  name,
  category,
  contact_phone,
  bio,
  community_id,
  verified
)
SELECT
  'b392cf17-0006-4000-8000-000000000010'::uuid,
  'Mesa de ayuda interna',
  'general',
  'Administracion',
  'Cola operacional interna para tickets creados desde Agent Center.',
  'b392cf17-fd6b-47dd-b0b4-72b0e007824e'::uuid,
  TRUE
WHERE EXISTS (
  SELECT 1 FROM public.communities
  WHERE id = 'b392cf17-fd6b-47dd-b0b4-72b0e007824e'::uuid
)
AND NOT EXISTS (
  SELECT 1 FROM public.service_providers
  WHERE community_id = 'b392cf17-fd6b-47dd-b0b4-72b0e007824e'::uuid
    AND name = 'Mesa de ayuda interna'
);
