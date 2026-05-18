ALTER TABLE public.bank_connections ADD COLUMN IF NOT EXISTS reference text;
ALTER TABLE public.bank_connections ALTER COLUMN provider SET DEFAULT 'gocardless';
CREATE INDEX IF NOT EXISTS idx_bank_connections_reference ON public.bank_connections(reference);