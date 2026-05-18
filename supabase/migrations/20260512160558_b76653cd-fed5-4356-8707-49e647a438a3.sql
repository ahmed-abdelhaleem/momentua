create table if not exists public.foundation_sessions (
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
alter table public.foundation_sessions enable row level security;
create policy "own foundation_sessions all" on public.foundation_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists idx_foundation_sessions_user on public.foundation_sessions(user_id, status);

create table if not exists public.foundation_triggers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  session_id uuid,
  created_at timestamptz not null default now(),
  intensity smallint,
  underneath text,
  redirect_chosen text,
  redirect_completed boolean not null default false,
  resolved_at timestamptz,
  resolution text
);
alter table public.foundation_triggers enable row level security;
create policy "own foundation_triggers all" on public.foundation_triggers for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists idx_foundation_triggers_user on public.foundation_triggers(user_id, created_at desc);

create table if not exists public.foundation_readiness (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  session_id uuid,
  week_start date not null,
  physical smallint not null default 0,
  mental smallint not null default 0,
  social smallint not null default 0,
  regulation smallint not null default 0,
  total smallint not null default 0,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(user_id, week_start)
);
alter table public.foundation_readiness enable row level security;
create policy "own foundation_readiness all" on public.foundation_readiness for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.foundation_reflections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  session_id uuid,
  month_start date not null,
  content text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(user_id, month_start)
);
alter table public.foundation_reflections enable row level security;
create policy "own foundation_reflections all" on public.foundation_reflections for all using (auth.uid() = user_id) with check (auth.uid() = user_id);