CREATE TABLE public.fcm_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL DEFAULT 'android',
  device_label TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_used_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.fcm_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own fcm select" ON public.fcm_tokens FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own fcm insert" ON public.fcm_tokens FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own fcm update" ON public.fcm_tokens FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own fcm delete" ON public.fcm_tokens FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_fcm_tokens_user_id ON public.fcm_tokens(user_id);