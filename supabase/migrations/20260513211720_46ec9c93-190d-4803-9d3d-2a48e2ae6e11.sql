-- Cook sessions table: one row per cooking event the user commits to
CREATE TABLE public.cook_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  style TEXT NOT NULL CHECK (style IN ('quick','sophisticated')),
  portions SMALLINT NOT NULL CHECK (portions BETWEEN 1 AND 8),
  slots JSONB NOT NULL DEFAULT '[]'::jsonb,
  meal JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_cost_sek NUMERIC(10,2),
  cook_for_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cook_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own cook_sessions all"
  ON public.cook_sessions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_cook_sessions_user_date ON public.cook_sessions(user_id, cook_for_date DESC);

-- Preferred stores list saved on profile
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_stores TEXT[] NOT NULL DEFAULT '{}'::text[];
