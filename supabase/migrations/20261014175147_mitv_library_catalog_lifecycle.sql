-- MITV: anonymous-owner library and private, metadata-only demand cache.
-- Video bytes and playback credentials are never stored in these new tables.
create schema if not exists mitv_private;
revoke all on schema mitv_private from public, anon;
grant usage on schema mitv_private to authenticated, service_role;

create function mitv_private.metadata_is_safe(value jsonb, depth integer default 0)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare entry record; child jsonb; text_value text;
begin
  if value is null or depth > 16 then return false; end if;
  if pg_catalog.jsonb_typeof(value) = 'object' then
    for entry in select key, val from pg_catalog.jsonb_each(value) as parts(key,val) loop
      if pg_catalog.regexp_replace(pg_catalog.lower(entry.key),'[^a-z0-9]','','g') = any(array[
        'headers','playbackheaders','resolverheaders','authorization','apikey','secret','token',
        'streamurl','mediaurl','mediapath','mediasrc','iframeurl','resolverurl','wrapperurl',
        'mediasources','streams','streamsources','accesstoken','refreshtoken']) then return false; end if;
      if not mitv_private.metadata_is_safe(entry.val,depth+1) then return false; end if;
    end loop;
  elsif pg_catalog.jsonb_typeof(value) = 'array' then
    for child in select val from pg_catalog.jsonb_array_elements(value) as parts(val) loop
      if not mitv_private.metadata_is_safe(child,depth+1) then return false; end if;
    end loop;
  elsif pg_catalog.jsonb_typeof(value) = 'string' then
    text_value := value #>> '{}';
    if text_value ~* 'https?://[^[:space:]]+[.](m3u8|mp4|mkv|mpd|webm|ts)([?/#]|$)'
       or text_value ~* 'https?://[^[:space:]]+[?&](token|signature|authorization|access_token)=' then return false; end if;
  end if;
  return true;
end $$;
revoke all on function mitv_private.metadata_is_safe(jsonb,integer) from public, anon;
grant execute on function mitv_private.metadata_is_safe(jsonb,integer) to authenticated, service_role;

create table public.mitv_library (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check(kind in ('favorite','history')),
  item_key text not null check(pg_catalog.octet_length(item_key) between 1 and 1536),
  metadata jsonb not null default '{}'::jsonb check(
    pg_catalog.jsonb_typeof(metadata)='object' and pg_catalog.octet_length(metadata::text)<=16384
    and mitv_private.metadata_is_safe(metadata)),
  updated_at timestamptz not null default pg_catalog.now(),
  deleted boolean not null default false,
  primary key(user_id,kind,item_key)
);
create index mitv_library_owner_updated_idx on public.mitv_library(user_id,updated_at desc);
alter table public.mitv_library enable row level security;
revoke all on public.mitv_library from public, anon, authenticated;
grant select, insert, update on public.mitv_library to authenticated;
grant all on public.mitv_library to service_role;
create policy mitv_library_select_owner on public.mitv_library for select to authenticated
  using ((select auth.uid())=user_id);
create policy mitv_library_insert_owner on public.mitv_library for insert to authenticated
  with check ((select auth.uid())=user_id);
create policy mitv_library_update_owner on public.mitv_library for update to authenticated
  using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);

create function mitv_private.guard_library_timestamp()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.updated_at > pg_catalog.clock_timestamp()+interval '5 minutes' then
    new.updated_at := pg_catalog.clock_timestamp();
  end if;
  if tg_op='UPDATE' then
    if (new.user_id,new.kind,new.item_key) is distinct from (old.user_id,old.kind,old.item_key) then
      raise exception 'MITV_LIBRARY_IDENTITY_IMMUTABLE' using errcode='22023';
    end if;
    if new.updated_at <= old.updated_at then return null; end if;
  end if;
  return new;
end $$;
revoke all on function mitv_private.guard_library_timestamp() from public, anon, authenticated;
create trigger mitv_library_timestamp before insert or update on public.mitv_library
  for each row execute function mitv_private.guard_library_timestamp();

create function public.mitv_upsert_library(rows jsonb)
returns setof public.mitv_library language plpgsql security invoker set search_path = '' as $$
declare uid uuid := auth.uid(); entry jsonb; stamp timestamptz; current_time timestamptz := pg_catalog.clock_timestamp();
begin
  if uid is null then raise exception 'MITV_AUTH_REQUIRED' using errcode='42501'; end if;
  if rows is null or pg_catalog.jsonb_typeof(rows)<>'array' or pg_catalog.jsonb_array_length(rows)>32 then
    raise exception 'MITV_LIBRARY_BATCH_LIMIT' using errcode='22023';
  end if;
  for entry in select val from pg_catalog.jsonb_array_elements(rows) as parts(val) loop
    if pg_catalog.jsonb_typeof(entry)<>'object' or
       (entry ? 'user_id' and (entry->>'user_id')::uuid is distinct from uid) then
      raise exception 'MITV_LIBRARY_OWNER_REQUIRED' using errcode='42501';
    end if;
    stamp := coalesce((entry->>'updated_at')::timestamptz,current_time);
    if stamp>current_time+interval '5 minutes' then stamp:=current_time; end if;
    insert into public.mitv_library as lib(user_id,kind,item_key,metadata,updated_at,deleted)
      values(uid,entry->>'kind',entry->>'item_key',coalesce(entry->'metadata','{}'::jsonb),stamp,
        coalesce((entry->>'deleted')::boolean,false))
      on conflict(user_id,kind,item_key) do update
        set metadata=excluded.metadata,updated_at=excluded.updated_at,deleted=excluded.deleted
        where excluded.updated_at>lib.updated_at;
  end loop;
  return query select lib.* from public.mitv_library as lib where lib.user_id=uid and exists (
    select 1 from pg_catalog.jsonb_array_elements(rows) as parts(val)
    where val->>'kind'=lib.kind and val->>'item_key'=lib.item_key);
end $$;
revoke all on function public.mitv_upsert_library(jsonb) from public, anon;
grant execute on function public.mitv_upsert_library(jsonb) to authenticated;

create table public.mitv_devices (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  primary key(user_id,device_id)
);
alter table public.mitv_devices enable row level security;
revoke all on public.mitv_devices from public, anon, authenticated;
grant select,insert,update on public.mitv_devices to authenticated;
grant all on public.mitv_devices to service_role;
create policy mitv_devices_select_owner on public.mitv_devices for select to authenticated using((select auth.uid())=user_id);
create policy mitv_devices_insert_owner on public.mitv_devices for insert to authenticated with check((select auth.uid())=user_id);
create policy mitv_devices_update_owner on public.mitv_devices for update to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);

create table public.mitv_catalog_cache (
  provider text not null check(provider in('3isk','akoam','alooy','laroza')),
  ref text not null check(pg_catalog.octet_length(ref) between 1 and 1536),
  metadata jsonb not null check(pg_catalog.jsonb_typeof(metadata)='object'
    and pg_catalog.octet_length(metadata::text)<=131072 and mitv_private.metadata_is_safe(metadata)),
  request_count integer not null default 1 check(request_count>0),
  last_requested_at timestamptz not null default pg_catalog.now(),
  refreshed_at timestamptz not null default pg_catalog.now(),
  refresh_after timestamptz not null default(pg_catalog.now()+interval '10 minutes'),
  new_until timestamptz,
  trending_until timestamptz,
  primary key(provider,ref)
);
create index mitv_catalog_cache_idle_idx on public.mitv_catalog_cache(last_requested_at);
alter table public.mitv_catalog_cache enable row level security;
revoke all on public.mitv_catalog_cache from public, anon, authenticated;
grant all on public.mitv_catalog_cache to service_role;

create function public.mitv_touch_catalog(p_provider text,p_ref text,p_metadata jsonb default null,
  p_count integer default 1,p_new_until timestamptz default null,p_trending_until timestamptz default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare current_time timestamptz:=pg_catalog.clock_timestamp();
begin
  if p_count<1 or p_count>1000 then raise exception 'MITV_CATALOG_COUNT_LIMIT' using errcode='22023'; end if;
  if p_metadata is null then
    update public.mitv_catalog_cache set request_count=least(request_count::bigint+p_count,2147483647)::integer,
      last_requested_at=current_time where provider=p_provider and ref=p_ref;
  else
    insert into public.mitv_catalog_cache as cache(provider,ref,metadata,request_count,last_requested_at,
      refreshed_at,refresh_after,new_until,trending_until)
    values(p_provider,p_ref,p_metadata,p_count,current_time,current_time,current_time+interval '10 minutes',
      case when p_new_until is null then null else least(p_new_until,current_time+interval '7 days') end,
      case when p_trending_until is null then null else least(p_trending_until,current_time+interval '7 days') end)
    on conflict(provider,ref) do update set metadata=excluded.metadata,
      request_count=least(cache.request_count::bigint+p_count,2147483647)::integer,
      last_requested_at=current_time,refreshed_at=current_time,refresh_after=excluded.refresh_after,
      new_until=coalesce(excluded.new_until,cache.new_until),trending_until=coalesce(excluded.trending_until,cache.trending_until);
  end if;
end $$;
revoke all on function public.mitv_touch_catalog(text,text,jsonb,integer,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.mitv_touch_catalog(text,text,jsonb,integer,timestamptz,timestamptz) to service_role;

create function mitv_private.purge_idle_cache(at_time timestamptz default pg_catalog.now())
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare tokens_deleted integer; events_deleted integer; metadata_deleted integer;
begin
  -- Expired playback tokens are always removed, even if a work is followed/trending.
  delete from public.matv_provider_cache where expires_at<=at_time;
  get diagnostics tokens_deleted=row_count;
  delete from public.matv_provider_events where created_at<at_time-interval '7 days';
  get diagnostics events_deleted=row_count;
  delete from public.mitv_catalog_cache as cache where
    (cache.request_count=1 and cache.last_requested_at<at_time-interval '7 days'
      or cache.last_requested_at<at_time-interval '30 days')
    and coalesce(cache.new_until,'-infinity'::timestamptz)<=at_time
    and coalesce(cache.trending_until,'-infinity'::timestamptz)<=at_time
    and not exists(select 1 from public.mitv_library as lib where not lib.deleted
      and (lib.kind='favorite' or lib.updated_at>=at_time-interval '7 days')
      and (lib.item_key=cache.ref or lib.metadata->>'ref'=cache.ref
        or lib.metadata->'item'->>'ref'=cache.ref
        or lib.metadata->'item'->'source_refs'->>cache.provider=cache.ref
        or lib.metadata->'source_refs'->>cache.provider=cache.ref));
  get diagnostics metadata_deleted=row_count;
  return pg_catalog.jsonb_build_object('expired_playback_rows',tokens_deleted,
    'old_event_rows',events_deleted,'idle_metadata_rows',metadata_deleted);
end $$;
revoke all on function mitv_private.purge_idle_cache(timestamptz) from public, anon, authenticated;
grant execute on function mitv_private.purge_idle_cache(timestamptz) to service_role;

-- Free in-database maintenance, not a paid Render cron or background worker.
create extension if not exists pg_cron;
select cron.schedule('mitv-daily-cache-purge','17 3 * * *',
  'select mitv_private.purge_idle_cache(); delete from cron.job_run_details where end_time < now() - interval ''7 days'';');
