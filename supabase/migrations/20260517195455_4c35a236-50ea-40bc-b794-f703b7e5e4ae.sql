
CREATE TABLE public.insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  section TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  suggested_action TEXT,
  metric_key TEXT,
  baseline_value NUMERIC,
  status TEXT NOT NULL DEFAULT 'new',
  committed_at TIMESTAMPTZ,
  commit_deadline_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  verification_value NUMERIC,
  delta_pct NUMERIC,
  source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_reminder_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_insights_user_status ON public.insights(user_id, status);
CREATE INDEX idx_insights_user_section ON public.insights(user_id, section);
CREATE INDEX idx_insights_user_created ON public.insights(user_id, created_at DESC);

ALTER TABLE public.insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own insights all" ON public.insights
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER insights_set_updated_at
  BEFORE UPDATE ON public.insights
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.insight_notifications_state (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_digest_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.insight_notifications_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own insight_notifications_state all" ON public.insight_notifications_state
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS insights_new BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS insights_reminder BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS insights_verify BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS insights_digest BOOLEAN NOT NULL DEFAULT true;
