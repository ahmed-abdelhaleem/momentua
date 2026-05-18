
CREATE TABLE IF NOT EXISTS public.meal_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plan_date date NOT NULL,
  energy text,
  breakfast jsonb,
  lunch jsonb,
  dinner jsonb,
  shop_status text NOT NULL DEFAULT 'pending',
  shop_destination text,
  ate_as_planned text,
  checked_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, plan_date)
);

ALTER TABLE public.meal_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own meal_plans all" ON public.meal_plans FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER meal_plans_updated_at BEFORE UPDATE ON public.meal_plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.meal_pantry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  item text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, item)
);

ALTER TABLE public.meal_pantry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own meal_pantry all" ON public.meal_pantry FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
