
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
  provider text NOT NULL DEFAULT 'tink',
  credentials_id text,
  institution_name text,
  institution_id text,
  status text NOT NULL DEFAULT 'pending',
  last_sync_at timestamptz,
  consent_expires_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bank_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own bank_connections all" ON public.bank_connections FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_bank_connections_updated BEFORE UPDATE ON public.bank_connections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.bank_connections(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  external_id text NOT NULL,
  name text,
  type text,
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
  description text,
  merchant text,
  category text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, external_id)
);
CREATE INDEX idx_bank_tx_user_date ON public.bank_transactions(user_id, booked_date DESC);
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own bank_transactions all" ON public.bank_transactions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
