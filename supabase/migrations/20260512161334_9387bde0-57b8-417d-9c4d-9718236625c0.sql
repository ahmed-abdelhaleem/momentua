create table if not exists public.memory_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  category text,
  content text not null,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.memory_notes enable row level security;
create policy "own memory_notes all" on public.memory_notes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists idx_memory_notes_user on public.memory_notes(user_id, pinned desc, created_at desc);

create trigger memory_notes_updated_at
before update on public.memory_notes
for each row execute function public.set_updated_at();