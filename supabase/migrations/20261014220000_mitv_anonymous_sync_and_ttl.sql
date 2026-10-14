-- ============================================================================
-- MITV Anonymous Silent Auth, User Library & 7-Day TTL Cache Policy
-- ============================================================================

-- 1. User Favorites Table (Isolated per anonymous user via Device UUID & RLS)
create table if not exists public.mitv_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  content_ref text not null check (length(content_ref) between 1 and 2048),
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, content_ref)
);

create index if not exists mitv_favorites_user_idx on public.mitv_favorites(user_id, updated_at desc);

alter table public.mitv_favorites enable row level security;

-- Strict RLS: Users can only access their own favorites
drop policy if exists "Users can select own favorites" on public.mitv_favorites;
create policy "Users can select own favorites"
  on public.mitv_favorites for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own favorites" on public.mitv_favorites;
create policy "Users can insert own favorites"
  on public.mitv_favorites for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own favorites" on public.mitv_favorites;
create policy "Users can update own favorites"
  on public.mitv_favorites for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own favorites" on public.mitv_favorites;
create policy "Users can delete own favorites"
  on public.mitv_favorites for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.mitv_favorites to authenticated, anon;


-- 2. User Watch History Table (Isolated per anonymous user via Device UUID & RLS)
create table if not exists public.mitv_watch_history (
  user_id uuid not null references auth.users(id) on delete cascade,
  content_ref text not null check (length(content_ref) between 1 and 2048),
  episode_id text not null default '',
  position_ms integer not null default 0 check (position_ms >= 0),
  duration_ms integer not null default 0 check (duration_ms >= 0),
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, content_ref, episode_id)
);

create index if not exists mitv_watch_history_user_idx on public.mitv_watch_history(user_id, updated_at desc);

alter table public.mitv_watch_history enable row level security;

-- Strict RLS: Users can only access their own watch history
drop policy if exists "Users can select own history" on public.mitv_watch_history;
create policy "Users can select own history"
  on public.mitv_watch_history for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own history" on public.mitv_watch_history;
create policy "Users can insert own history"
  on public.mitv_watch_history for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own history" on public.mitv_watch_history;
create policy "Users can update own history"
  on public.mitv_watch_history for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own history" on public.mitv_watch_history;
create policy "Users can delete own history"
  on public.mitv_watch_history for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.mitv_watch_history to authenticated, anon;


-- 3. 7-Day TTL Cache Cleanup Policy for Idle Provider Works
-- Cleans idle provider cache entries older than 7 days,
-- while explicitly preserving trending, latest, and actively referenced content.
create or replace function public.cleanup_idle_cache_7d()
returns integer
language plpgsql
security definer
as $$
declare
  deleted_count integer := 0;
begin
  delete from public.matv_provider_cache
  where updated_at < (now() - interval '7 days')
    and cache_key not ilike '%trending%'
    and cache_key not ilike '%latest%'
    and cache_key not in (
      select content_ref from public.mitv_favorites
      union
      select content_ref from public.mitv_watch_history
    );
  
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.cleanup_idle_cache_7d() from public, anon;
grant execute on function public.cleanup_idle_cache_7d() to service_role;
