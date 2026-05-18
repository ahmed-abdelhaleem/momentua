
CREATE TABLE public.custom_deal_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  url TEXT NOT NULL,
  label TEXT,
  store TEXT,
  last_scraped_at TIMESTAMPTZ,
  last_status TEXT NOT NULL DEFAULT 'pending',
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, url)
);

ALTER TABLE public.custom_deal_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own custom_deal_sources all" ON public.custom_deal_sources
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER set_custom_deal_sources_updated_at
BEFORE UPDATE ON public.custom_deal_sources
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.custom_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES public.custom_deal_sources(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  item TEXT NOT NULL,
  discount TEXT,
  image_url TEXT,
  raw_text TEXT,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_custom_deals_user ON public.custom_deals(user_id);
CREATE INDEX idx_custom_deals_source ON public.custom_deals(source_id);

ALTER TABLE public.custom_deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own custom_deals all" ON public.custom_deals
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
