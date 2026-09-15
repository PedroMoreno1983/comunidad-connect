BEGIN;

ALTER TABLE public.training_modules
  ADD COLUMN IF NOT EXISTS embed_url TEXT,
  ADD COLUMN IF NOT EXISTS learning_objectives JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS estimated_minutes INTEGER NOT NULL DEFAULT 20 CHECK (estimated_minutes BETWEEN 5 AND 480),
  ADD COLUMN IF NOT EXISTS quality_version INTEGER NOT NULL DEFAULT 2 CHECK (quality_version > 0),
  ADD CONSTRAINT training_modules_embed_url_https CHECK (embed_url IS NULL OR embed_url ~ '^https://');

-- Los cursos ya existentes dejan de declararse para residentes: "all" significa
-- exclusivamente ambos roles habilitados (administracion y conserjeria).
UPDATE public.training_modules SET target_audience = 'concierge' WHERE target_audience = 'resident';

COMMIT;
