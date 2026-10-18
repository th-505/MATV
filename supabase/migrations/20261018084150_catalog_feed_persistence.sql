-- Private metadata-only browse snapshots; no grants to application clients.
create table public.mitv_catalog_feed_cache (
  provider text not null check(provider ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  category text not null check(category in('browse-movies','browse-series','browse-anime')),
  payload jsonb not null check(jsonb_typeof(payload)='object'
    and octet_length(payload::text)<=131072 and mitv_private.metadata_is_safe(payload)),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key(provider,category)
);
alter table public.mitv_catalog_feed_cache enable row level security;
revoke all on public.mitv_catalog_feed_cache from public,anon,authenticated;
grant select,insert,update,delete on public.mitv_catalog_feed_cache to service_role;
create index mitv_catalog_feed_expiry_idx on public.mitv_catalog_feed_cache(expires_at);
-- This job removes only obsolete browse metadata; favorites/history are untouched.
select cron.schedule('mitv-hourly-feed-purge','37 * * * *',
  'delete from public.mitv_catalog_feed_cache where expires_at < now() - interval ''1 day'';');
