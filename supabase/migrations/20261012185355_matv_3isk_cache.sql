-- Backend-only catalog/details/playback cache. Signed links never have client grants.
create table public.matv_provider_cache (
  provider text not null check (length(provider) between 1 and 64),
  cache_key text not null check (length(cache_key) between 1 and 2048),
  payload jsonb not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (provider, cache_key),
  constraint matv_cache_future_expiry check (expires_at > updated_at)
);
create index matv_provider_cache_expiry_idx on public.matv_provider_cache(provider, expires_at);
alter table public.matv_provider_cache enable row level security;
revoke all on public.matv_provider_cache from public, anon, authenticated;
grant select, insert, update, delete on public.matv_provider_cache to service_role;

-- Operational events contain no signed URLs, tokens, headers, user IPs, or secrets.
create table public.matv_provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  cache_key text not null,
  outcome text not null check (outcome in ('resolved', 'failed')),
  duration_ms integer not null check (duration_ms >= 0),
  created_at timestamptz not null default now()
);
create index matv_provider_events_retention_idx on public.matv_provider_events(provider, created_at);
alter table public.matv_provider_events enable row level security;
revoke all on public.matv_provider_events from public, anon, authenticated;
grant select, insert, update, delete on public.matv_provider_events to service_role;
