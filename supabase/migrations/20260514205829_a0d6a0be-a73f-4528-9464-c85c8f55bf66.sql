
-- Enums
CREATE TYPE public.behavior_domain AS ENUM ('physical','mental','social','self_regulation','consistency');
CREATE TYPE public.stake_tier AS ENUM ('starter','standard','committed','all_in');
CREATE TYPE public.completion_status AS ENUM ('yes','partly','no');
CREATE TYPE public.dump_category AS ENUM ('action','curiosity','purchase','anxiety','other');
CREATE TYPE public.message_role AS ENUM ('user','assistant');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  charity TEXT,
  onboarding_complete BOOLEAN NOT NULL DEFAULT false,
  onboarding_answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.stakes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier public.stake_tier NOT NULL DEFAULT 'standard',
  monthly_amount_sek INTEGER NOT NULL,
  month_start DATE NOT NULL,
  recovered_amount_sek INTEGER NOT NULL DEFAULT 0,
  charity TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, month_start)
);

CREATE TABLE public.point_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_key TEXT NOT NULL,
  action_label TEXT NOT NULL,
  domain public.behavior_domain NOT NULL,
  points INTEGER NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_point_logs_user_created ON public.point_logs(user_id, created_at DESC);

CREATE TABLE public.daily_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  checkin_date DATE NOT NULL,
  energy SMALLINT,
  morning_commitment TEXT,
  evening_status public.completion_status,
  evening_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, checkin_date)
);

CREATE TABLE public.brain_dumps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  category public.dump_category,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_brain_dumps_user_created ON public.brain_dumps(user_id, created_at DESC);

CREATE TABLE public.ace_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.message_role NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ace_messages_user_created ON public.ace_messages(user_id, created_at ASC);

CREATE TABLE public.streaks (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_days INTEGER NOT NULL DEFAULT 0,
  longest_days INTEGER NOT NULL DEFAULT 0,
  last_active_date DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.point_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brain_dumps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ace_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own profile select" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "own stakes all" ON public.stakes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own point_logs all" ON public.point_logs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own checkins all" ON public.daily_checkins FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own dumps all" ON public.brain_dumps FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own ace_messages all" ON public.ace_messages FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own streaks all" ON public.streaks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_checkins_updated BEFORE UPDATE ON public.daily_checkins FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)));
  INSERT INTO public.streaks (user_id) VALUES (NEW.id);
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.profiles ADD COLUMN dashboard_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE public.user_memory (
  user_id uuid PRIMARY KEY,
  weight_kg numeric, height_cm numeric, job text, financial_state text, photo_url text, default_location text,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own memory all" ON public.user_memory FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER user_memory_set_updated_at BEFORE UPDATE ON public.user_memory FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.ace_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text, summary text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
ALTER TABLE public.ace_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ace_sessions all" ON public.ace_sessions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX ace_sessions_user_started ON public.ace_sessions(user_id, started_at DESC);

ALTER TABLE public.ace_messages ADD COLUMN session_id uuid;
CREATE INDEX ace_messages_session ON public.ace_messages(session_id, created_at);

CREATE TABLE public.ace_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'manual',
  title text, content text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ace_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ace_insights all" ON public.ace_insights FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX ace_insights_user_created ON public.ace_insights(user_id, created_at DESC);

INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true) ON CONFLICT (id) DO NOTHING;
CREATE POLICY "avatars own write" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "avatars own update" ON storage.objects FOR UPDATE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "avatars own delete" ON storage.objects FOR DELETE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "avatars own read list" ON storage.objects FOR SELECT USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE TABLE public.foundation_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  duration_months integer not null default 6,
  commitment_why text not null default '',
  commitment_want text not null default '',
  stake_bump_sek integer not null default 500,
  status text not null default 'active',
  deactivation_requested_at timestamptz,
  deactivation_reason text,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);
ALTER TABLE public.foundation_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own foundation_sessions all" ON public.foundation_sessions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_foundation_sessions_user ON public.foundation_sessions(user_id, status);

CREATE TABLE public.foundation_triggers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null, session_id uuid,
  created_at timestamptz not null default now(),
  intensity smallint, underneath text, redirect_chosen text,
  redirect_completed boolean not null default false,
  resolved_at timestamptz, resolution text
);
ALTER TABLE public.foundation_triggers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own foundation_triggers all" ON public.foundation_triggers FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_foundation_triggers_user ON public.foundation_triggers(user_id, created_at desc);

CREATE TABLE public.foundation_readiness (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null, session_id uuid,
  week_start date not null,
  physical smallint not null default 0, mental smallint not null default 0,
  social smallint not null default 0, regulation smallint not null default 0,
  total smallint not null default 0,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(user_id, week_start)
);
ALTER TABLE public.foundation_readiness ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own foundation_readiness all" ON public.foundation_readiness FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.foundation_reflections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null, session_id uuid,
  month_start date not null,
  content text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(user_id, month_start)
);
ALTER TABLE public.foundation_reflections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own foundation_reflections all" ON public.foundation_reflections FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.memory_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  category text, content text not null,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
ALTER TABLE public.memory_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own memory_notes all" ON public.memory_notes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_memory_notes_user ON public.memory_notes(user_id, pinned desc, created_at desc);
CREATE TRIGGER memory_notes_updated_at BEFORE UPDATE ON public.memory_notes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.meal_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plan_date date NOT NULL,
  energy text,
  breakfast jsonb, lunch jsonb, dinner jsonb,
  shop_status text NOT NULL DEFAULT 'pending',
  shop_destination text, ate_as_planned text,
  checked_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, plan_date)
);
ALTER TABLE public.meal_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own meal_plans all" ON public.meal_plans FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER meal_plans_updated_at BEFORE UPDATE ON public.meal_plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.meal_pantry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  item text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, item)
);
ALTER TABLE public.meal_pantry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own meal_pantry all" ON public.meal_pantry FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL, auth text NOT NULL,
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
  kind text NOT NULL, title text NOT NULL, body text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  opened_at timestamptz, dismissed_at timestamptz,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own log select" ON public.notification_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own log update" ON public.notification_log FOR UPDATE USING (auth.uid() = user_id);
CREATE INDEX notification_log_user_sent_idx ON public.notification_log(user_id, sent_at DESC);

CREATE TABLE public.custom_deal_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  url TEXT NOT NULL, label TEXT, store TEXT,
  last_scraped_at TIMESTAMPTZ,
  last_status TEXT NOT NULL DEFAULT 'pending',
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, url)
);
ALTER TABLE public.custom_deal_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own custom_deal_sources all" ON public.custom_deal_sources FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER set_custom_deal_sources_updated_at BEFORE UPDATE ON public.custom_deal_sources FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.custom_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES public.custom_deal_sources(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  item TEXT NOT NULL, discount TEXT, image_url TEXT, raw_text TEXT,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_custom_deals_user ON public.custom_deals(user_id);
CREATE INDEX idx_custom_deals_source ON public.custom_deals(source_id);
ALTER TABLE public.custom_deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own custom_deals all" ON public.custom_deals FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.cook_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  style TEXT NOT NULL CHECK (style IN ('quick','sophisticated')),
  portions SMALLINT NOT NULL CHECK (portions BETWEEN 1 AND 8),
  slots JSONB NOT NULL DEFAULT '[]'::jsonb,
  meal JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_cost_sek NUMERIC(10,2),
  cook_for_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  post_cook jsonb NOT NULL DEFAULT '{}'::jsonb,
  shop_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  follow_up_at timestamptz NULL
);
ALTER TABLE public.cook_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own cook_sessions all" ON public.cook_sessions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_cook_sessions_user_date ON public.cook_sessions(user_id, cook_for_date DESC);

ALTER TABLE public.profiles ADD COLUMN preferred_stores TEXT[] NOT NULL DEFAULT '{}'::text[];

CREATE TABLE public.health_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  entry_date date NOT NULL,
  steps integer NOT NULL DEFAULT 0,
  sleep_hours numeric(4,2) NOT NULL DEFAULT 0,
  workouts jsonb NOT NULL DEFAULT '[]'::jsonb,
  points_awarded integer NOT NULL DEFAULT 0,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, entry_date)
);
ALTER TABLE public.health_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own health_entries all" ON public.health_entries FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_health_entries_updated BEFORE UPDATE ON public.health_entries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.bank_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'gocardless',
  credentials_id text, institution_name text, institution_id text,
  status text NOT NULL DEFAULT 'pending',
  last_sync_at timestamptz, consent_expires_at timestamptz,
  last_error text, reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bank_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own bank_connections all" ON public.bank_connections FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_bank_connections_updated BEFORE UPDATE ON public.bank_connections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_bank_connections_reference ON public.bank_connections(reference);

CREATE TABLE public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.bank_connections(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  external_id text NOT NULL, name text, type text,
  currency text NOT NULL DEFAULT 'SEK',
  balance numeric(14,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, external_id)
);
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own bank_accounts all" ON public.bank_accounts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_bank_accounts_updated BEFORE UPDATE ON public.bank_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  external_id text NOT NULL,
  booked_date date NOT NULL,
  amount numeric(14,2) NOT NULL,
  currency text NOT NULL DEFAULT 'SEK',
  description text, merchant text, category text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, external_id)
);
CREATE INDEX idx_bank_tx_user_date ON public.bank_transactions(user_id, booked_date DESC);
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own bank_transactions all" ON public.bank_transactions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
