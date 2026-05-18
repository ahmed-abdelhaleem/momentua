
ALTER TABLE public.custom_deals ADD COLUMN IF NOT EXISTS type_key text;
CREATE INDEX IF NOT EXISTS idx_custom_deals_type_key ON public.custom_deals(user_id, type_key);

CREATE TABLE IF NOT EXISTS public.pantry_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  location text NOT NULL DEFAULT 'fridge',
  quantity text,
  expires_at date,
  barcode text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pantry_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own pantry_items all" ON public.pantry_items FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER pantry_items_updated_at BEFORE UPDATE ON public.pantry_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS idx_pantry_items_user ON public.pantry_items(user_id, location);

CREATE TABLE IF NOT EXISTS public.cook_step_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  cook_session_id uuid NOT NULL,
  step_id text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cook_session_id, step_id)
);
ALTER TABLE public.cook_step_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own cook_step_progress all" ON public.cook_step_progress FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
