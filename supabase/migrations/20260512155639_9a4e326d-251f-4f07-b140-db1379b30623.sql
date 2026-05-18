
-- 1. Profile prefs
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS dashboard_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. User memory
CREATE TABLE IF NOT EXISTS public.user_memory (
  user_id uuid PRIMARY KEY,
  weight_kg numeric,
  height_cm numeric,
  job text,
  financial_state text,
  photo_url text,
  default_location text,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own memory all" ON public.user_memory FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER user_memory_set_updated_at BEFORE UPDATE ON public.user_memory FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. ACE sessions
CREATE TABLE IF NOT EXISTS public.ace_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text,
  summary text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
ALTER TABLE public.ace_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ace_sessions all" ON public.ace_sessions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS ace_sessions_user_started ON public.ace_sessions(user_id, started_at DESC);

ALTER TABLE public.ace_messages ADD COLUMN IF NOT EXISTS session_id uuid;
CREATE INDEX IF NOT EXISTS ace_messages_session ON public.ace_messages(session_id, created_at);

-- 4. ACE insights
CREATE TABLE IF NOT EXISTS public.ace_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'manual',
  title text,
  content text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ace_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ace_insights all" ON public.ace_insights FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS ace_insights_user_created ON public.ace_insights(user_id, created_at DESC);

-- 5. Avatars storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true) ON CONFLICT (id) DO NOTHING;
CREATE POLICY "avatars public read" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "avatars own write" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "avatars own update" ON storage.objects FOR UPDATE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "avatars own delete" ON storage.objects FOR DELETE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
