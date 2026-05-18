ALTER TABLE public.cook_sessions
  ADD COLUMN IF NOT EXISTS post_cook jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS shop_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS follow_up_at timestamptz NULL;