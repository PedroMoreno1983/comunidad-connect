-- Commercial defaults: enough room for multi-round CoCo conversations while
-- retaining a hard monthly cost ceiling per community.

ALTER TABLE public.ai_budgets
  ALTER COLUMN monthly_token_limit SET DEFAULT 10000000,
  ALTER COLUMN monthly_cost_limit_cents SET DEFAULT 10000,
  ALTER COLUMN resident_daily_token_limit SET DEFAULT 100000,
  ALTER COLUMN staff_daily_token_limit SET DEFAULT 300000,
  ALTER COLUMN heavy_action_daily_limit SET DEFAULT 20;

UPDATE public.ai_budgets
SET
  monthly_token_limit = 10000000,
  monthly_cost_limit_cents = 10000,
  resident_daily_token_limit = 100000,
  staff_daily_token_limit = 300000,
  heavy_action_daily_limit = 20,
  updated_at = now()
WHERE monthly_token_limit = 1000000
  AND monthly_cost_limit_cents = 2500
  AND resident_daily_token_limit = 8000
  AND staff_daily_token_limit = 50000
  AND heavy_action_daily_limit = 10;
