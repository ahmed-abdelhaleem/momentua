
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own subs select" ON public.push_subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own subs insert" ON public.push_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own subs update" ON public.push_subscriptions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own subs delete" ON public.push_subscriptions FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX push_subscriptions_user_idx ON public.push_subscriptions(user_id);

CREATE TABLE public.notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  morning_checkin boolean NOT NULL DEFAULT true,
  evening_log boolean NOT NULL DEFAULT true,
  plan_nudge boolean NOT NULL DEFAULT true,
  surprise_window boolean NOT NULL DEFAULT true,
  morning_hour smallint NOT NULL DEFAULT 8,
  evening_hour smallint NOT NULL DEFAULT 21,
  quiet_start smallint NOT NULL DEFAULT 22,
  quiet_end smallint NOT NULL DEFAULT 7,
  timezone text NOT NULL DEFAULT 'UTC',
  max_per_day smallint NOT NULL DEFAULT 4,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own prefs all" ON public.notification_preferences FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  opened_at timestamptz,
  dismissed_at timestamptz,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own log select" ON public.notification_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own log update" ON public.notification_log FOR UPDATE USING (auth.uid() = user_id);
CREATE INDEX notification_log_user_sent_idx ON public.notification_log(user_id, sent_at DESC);
