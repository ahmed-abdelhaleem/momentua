-- Self-savings vault model: app never holds funds, just tracks commitment and user-logged transfers.

-- 1. Extend profiles with currency + a free-text savings destination label.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'SEK',
  ADD COLUMN IF NOT EXISTS vault_destination_label text;

-- 2. New table: user-logged self-transfers (proof they actually moved money).
CREATE TABLE IF NOT EXISTS public.vault_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'SEK',
  destination_label text,
  note text,
  transferred_on date NOT NULL DEFAULT CURRENT_DATE,
  month_start date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vault_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own vault_transfers all"
  ON public.vault_transfers
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_vault_transfers_user_month
  ON public.vault_transfers (user_id, month_start DESC);