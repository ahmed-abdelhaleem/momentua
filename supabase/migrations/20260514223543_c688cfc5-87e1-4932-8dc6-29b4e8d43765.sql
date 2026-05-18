CREATE TABLE public.favorite_stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  store_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, store_name)
);
ALTER TABLE public.favorite_stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own favorite_stores all" ON public.favorite_stores FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.custom_deals ADD COLUMN IF NOT EXISTS category text;
CREATE INDEX IF NOT EXISTS custom_deals_category_idx ON public.custom_deals(category);