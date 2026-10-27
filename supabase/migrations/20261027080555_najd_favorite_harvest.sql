-- Najd1.1.5: reactivate the existing private discovery queue, owner-triggered demand,
-- complete resumable catalogs and separately expiring original-media references.
begin;
set local lock_timeout='3s';
create extension if not exists pg_net with schema extensions;
revoke all on schema net from public,anon,authenticated;
revoke all on all functions in schema net from public,anon,authenticated;

alter table public.matv_discovery_jobs
 add column if not exists stage text not null default 'work',
 add column if not exists provider text not null default '',
 add column if not exists payload jsonb not null default '{}'::jsonb,
 add column if not exists progress jsonb not null default '{}'::jsonb,
 add column if not exists worker_id uuid;
alter table public.matv_discovery_jobs add constraint najd_job_stage_check check(stage in('work','provider','episode','season'));
alter table public.matv_discovery_jobs add constraint najd_job_payload_bound check(pg_column_size(payload)<=32768 and pg_column_size(progress)<=16384);
create index if not exists najd_queue_due on public.matv_discovery_jobs(priority desc,requested_at) where status='queued';
create index if not exists najd_queue_leases on public.matv_discovery_jobs(lease_until) where status='running';
create index if not exists najd_favorite_refs on public.mitv_library(item_key) where kind='favorite' and not deleted;

create table public.najd_work_catalog(
 ref text primary key check(ref ~ '^tmdb:(movie|tv):[0-9]+$'),
 tmdb_id bigint not null, type text not null check(type in('movie','series')),
 title text not null, original_title text, aliases jsonb not null default '[]',
 year integer, runtime_minutes integer, genres jsonb not null default '[]', poster text,
 season_count integer, episode_count integer,
 metadata jsonb not null default '{}',
 state text not null default 'pending' check(state in('pending','harvesting','partial','playable','unavailable')),
 last_requested_at timestamptz not null default now(), last_checked_at timestamptz,
 expires_at timestamptz not null default now()+interval '7 days',
 updated_at timestamptz not null default now(),
 check(pg_column_size(metadata)<=131072)
);
create index najd_work_expiry on public.najd_work_catalog(expires_at);
create table public.najd_season_catalog(
 work_ref text not null references public.najd_work_catalog(ref) on delete cascade,
 season integer not null check(season between 0 and 100),metadata jsonb not null,
 expires_at timestamptz not null default now()+interval '7 days',updated_at timestamptz not null default now(),
 primary key(work_ref,season),check(pg_column_size(metadata)<=1048576)
);
alter table public.najd_season_catalog enable row level security;
revoke all on public.najd_season_catalog from public,anon,authenticated;
grant all on public.najd_season_catalog to service_role;

create table public.najd_source_catalog(
 work_ref text not null references public.najd_work_catalog(ref) on delete cascade,
 provider text not null, source_ref text not null,
 identity_score double precision not null, evidence jsonb not null default '{}',
 state text not null default 'partial', progress jsonb not null default '{}',
 updated_at timestamptz not null default now(),
 primary key(work_ref,provider,source_ref),
 check(length(source_ref)<=4096 and pg_column_size(evidence)<=16384 and pg_column_size(progress)<=16384)
);
create table public.najd_episode_cache(
 work_ref text not null references public.najd_work_catalog(ref) on delete cascade,
 provider text not null, source_ref text not null,
 season integer not null check(season between 0 and 100),
 episode integer not null check(episode between 0 and 100000), title text,
 state text not null default 'pending' check(state in('pending','resolving','playable','unavailable')),
 media jsonb not null default '[]', media_expires_at timestamptz,
 updated_at timestamptz not null default now(), last_checked_at timestamptz,
 primary key(work_ref,provider,source_ref),
 check(length(source_ref)<=4096 and pg_column_size(media)<=65536)
);
create index najd_episode_identity on public.najd_episode_cache(work_ref,season,episode,state);
create index najd_episode_expiry on public.najd_episode_cache(media_expires_at) where state='playable';
create table public.najd_provider_config(
 provider text primary key check(provider ~ '^[a-z0-9][a-z0-9_-]{1,29}$'),
 revision bigint not null default 1, enabled boolean not null default true,
 config jsonb not null default '{}', updated_at timestamptz not null default now(),
 check(pg_column_size(config)<=16384)
);
create table public.najd_harvest_events(
 id bigint generated always as identity primary key, created_at timestamptz not null default now(),
 work_ref text,provider text,stage text not null,outcome text not null,reason text,
 details jsonb not null default '{}',check(pg_column_size(details)<=16384)
);
create index najd_events_recent on public.najd_harvest_events(created_at desc);

alter table public.najd_work_catalog enable row level security;
alter table public.najd_source_catalog enable row level security;
alter table public.najd_episode_cache enable row level security;
alter table public.najd_provider_config enable row level security;
alter table public.najd_harvest_events enable row level security;
revoke all on public.najd_work_catalog,public.najd_source_catalog,public.najd_episode_cache,public.najd_provider_config,public.najd_harvest_events from public,anon,authenticated;
grant all on public.najd_work_catalog,public.najd_source_catalog,public.najd_episode_cache,public.najd_provider_config,public.najd_harvest_events to service_role;
grant usage,select on sequence public.najd_harvest_events_id_seq to service_role;
revoke all on public.matv_discovery_jobs,public.matv_content_demand from public,anon,authenticated;
grant select,insert,update,delete on public.matv_discovery_jobs,public.matv_content_demand to service_role;

create table mitv_private.najd_wake_clock(id boolean primary key default true check(id),last_wake timestamptz not null default '-infinity');
insert into mitv_private.najd_wake_clock(id) values(true);
revoke all on mitv_private.najd_wake_clock from public,anon,authenticated;
create function mitv_private.najd_wake() returns void language plpgsql security definer set search_path='' as $$
begin
 update mitv_private.najd_wake_clock set last_wake=clock_timestamp() where id and last_wake<clock_timestamp()-interval '15 seconds';
 if found then
  perform net.http_get(url:='https://matv.onrender.com/api/v1/harvest/wake',timeout_milliseconds:=10000);
 end if;
end $$;
revoke all on function mitv_private.najd_wake() from public,anon,authenticated;
grant execute on function mitv_private.najd_wake() to service_role;

create function mitv_private.najd_favorite_event() returns trigger language plpgsql security definer set search_path='' as $$
declare r text; n integer; label text;
begin
 if new.kind<>'favorite' then return new; end if;
 r:=new.item_key;
 if r !~ '^tmdb:(movie|tv):[0-9]+$' then
  r:=coalesce(new.metadata->>'ref',new.metadata->'catalog_item'->>'ref','');
 end if;
 if r !~ '^tmdb:(movie|tv):[0-9]+$' then return new; end if;
 select count(*) into n from public.mitv_library where kind='favorite' and not deleted and (item_key=r or metadata->>'ref'=r);
 insert into public.matv_content_demand(content_ref,favorite_count,last_favorited_at,refresh_after,updated_at)
 values(r,n,now(),now(),now()) on conflict(content_ref) do update set favorite_count=excluded.favorite_count,last_favorited_at=excluded.last_favorited_at,updated_at=now();
 if new.deleted then return new; end if;
 label:=left(coalesce(nullif(new.metadata->>'title',''),nullif(new.metadata->'catalog_item'->>'title',''),'قيد التعرف على العمل'),250);
 insert into public.matv_discovery_jobs(job_key,content_ref,title,stage,priority,status,last_activity_at,refresh_after)
 values(r||':work',r,label,'work',10,'queued',now(),now())
 on conflict(job_key) do update set last_activity_at=now(),priority=10,
 status=case when public.matv_discovery_jobs.status in('ready','failed') and coalesce(public.matv_discovery_jobs.refresh_after,'-infinity')<=now() then 'queued' else public.matv_discovery_jobs.status end,
 attempts=case when public.matv_discovery_jobs.status in('ready','failed') and coalesce(public.matv_discovery_jobs.refresh_after,'-infinity')<=now() then 0 else public.matv_discovery_jobs.attempts end,updated_at=now();
 perform mitv_private.najd_wake();
 return new;
end $$;
revoke all on function mitv_private.najd_favorite_event() from public,anon,authenticated;
create trigger najd_favorite_harvest after insert or update of metadata,deleted on public.mitv_library for each row execute function mitv_private.najd_favorite_event();

create function public.najd_enqueue_jobs(p_rows jsonb) returns integer language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>100 or pg_column_size(p_rows)>1048576 then raise exception 'INVALID_JOB_BATCH'; end if;
 insert into public.matv_discovery_jobs(job_key,content_ref,title,provider,stage,payload,season_number,episode_number,priority,status,refresh_after,last_activity_at)
 select r.job_key,r.content_ref,left(r.title,250),r.provider,r.stage,coalesce(r.payload,'{}'),coalesce(r.season_number,0),coalesce(r.episode_number,0),coalesce(r.priority,5),'queued',now(),now()
 from jsonb_to_recordset(p_rows) as r(job_key text,content_ref text,title text,provider text,stage text,payload jsonb,season_number integer,episode_number integer,priority smallint)
 on conflict(job_key) do update set payload=excluded.payload,status='queued',attempts=0,refresh_after=now(),last_activity_at=now(),updated_at=now()
 where public.matv_discovery_jobs.status in('ready','failed') and (public.matv_discovery_jobs.payload->>'cycle') is distinct from(excluded.payload->>'cycle');
 get diagnostics n=row_count;return n;
end $$;
revoke all on function public.najd_enqueue_jobs(jsonb) from public,anon,authenticated;
grant execute on function public.najd_enqueue_jobs(jsonb) to service_role;

create function public.najd_upsert_episodes(p_rows jsonb) returns integer language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>200 or pg_column_size(p_rows)>1048576 then raise exception 'INVALID_EPISODE_BATCH'; end if;
 insert into public.najd_episode_cache(work_ref,provider,source_ref,season,episode,title)
 select r.work_ref,r.provider,r.source_ref,r.season,r.episode,left(r.title,500)
 from jsonb_to_recordset(p_rows) as r(work_ref text,provider text,source_ref text,season integer,episode integer,title text)
 on conflict(work_ref,provider,source_ref) do update set season=excluded.season,episode=excluded.episode,title=excluded.title,updated_at=now();
 get diagnostics n=row_count;return n;
end $$;
revoke all on function public.najd_upsert_episodes(jsonb) from public,anon,authenticated;
grant execute on function public.najd_upsert_episodes(jsonb) to service_role;

create function public.najd_claim_jobs(p_worker uuid,p_limit integer default 2)
returns setof public.matv_discovery_jobs language sql security invoker set search_path='' as $$
 with due as(
  select job_key from public.matv_discovery_jobs
  where p_worker is not null and attempts<5 and ((status='ready' and stage='episode' and refresh_after<=clock_timestamp() and exists(select 1 from public.najd_work_catalog c where c.ref=public.matv_discovery_jobs.content_ref and c.expires_at>clock_timestamp())) or (status='queued' and coalesce(refresh_after,'-infinity')<=clock_timestamp()) or(status='running' and lease_until<clock_timestamp()))
  order by priority desc,requested_at limit least(greatest(coalesce(p_limit,2),1),8) for update skip locked
 ) update public.matv_discovery_jobs j set status='running',worker_id=p_worker,started_at=clock_timestamp(),lease_until=clock_timestamp()+interval '90 seconds',attempts=j.attempts+1,updated_at=clock_timestamp()
 from due where j.job_key=due.job_key returning j.*;
$$;
revoke all on function public.najd_claim_jobs(uuid,integer) from public,anon,authenticated;
grant execute on function public.najd_claim_jobs(uuid,integer) to service_role;

create function public.najd_hourly_refresh() returns jsonb language plpgsql security invoker set search_path='' as $$
declare count_due integer;
begin
 insert into public.matv_discovery_jobs(job_key,content_ref,title,stage,priority,status,last_activity_at,refresh_after)
 select item_key||':work',item_key,left(max(coalesce(nullif(metadata->>'title',''),'قيد التعرف على العمل')),250),'work',8,'queued',now(),now()
 from public.mitv_library where kind='favorite' and not deleted and item_key ~ '^tmdb:(movie|tv):[0-9]+$' group by item_key
 on conflict(job_key) do update set last_activity_at=now(),status=case when public.matv_discovery_jobs.status<>'running' then 'queued' else 'running' end,
 attempts=case when public.matv_discovery_jobs.status<>'running' then 0 else public.matv_discovery_jobs.attempts end,refresh_after=now(),updated_at=now();
 get diagnostics count_due=row_count;
 update public.matv_discovery_jobs set status='queued',worker_id=null,lease_until=null,refresh_after=now()
 where status='running' and lease_until<now() and attempts<5;
 update public.matv_discovery_jobs set status='failed',worker_id=null,lease_until=null,error_code='LEASE_EXHAUSTED' where status='running' and lease_until<now() and attempts>=5;
 delete from public.matv_discovery_jobs where last_activity_at<now()-interval '7 days' and status<>'running' and not exists(select 1 from public.najd_work_catalog c where c.ref=public.matv_discovery_jobs.content_ref and c.expires_at>now());
 update public.najd_episode_cache set state='pending',media='[]',media_expires_at=null where media_expires_at<=now();
 delete from public.najd_work_catalog c where c.expires_at<now() and not exists(select 1 from public.mitv_library l where l.item_key=c.ref and l.kind='favorite' and not l.deleted);
 delete from public.najd_harvest_events where created_at<now()-interval '30 days';
 perform mitv_private.najd_wake();
 return jsonb_build_object('due_works',count_due);
end $$;
revoke all on function public.najd_hourly_refresh() from public,anon,authenticated;
grant execute on function public.najd_hourly_refresh() to service_role;

create table mitv_private.najd_refresh_cooldowns(
 user_id uuid not null references auth.users(id) on delete cascade,
 work_ref text not null, tier smallint not null default 0,
 requested_at timestamptz not null default now(), next_allowed_at timestamptz not null default now(),
 primary key(user_id,work_ref)
);
alter table mitv_private.najd_refresh_cooldowns enable row level security;
revoke all on mitv_private.najd_refresh_cooldowns from public,anon,authenticated;
create function public.najd_refresh_favorite(p_ref text) returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); slot mitv_private.najd_refresh_cooldowns; delay_seconds integer;
begin
 if owner_id is null or p_ref !~ '^tmdb:(movie|tv):[0-9]+$' then raise exception 'AUTH_OR_REFERENCE_INVALID'; end if;
 if not exists(select 1 from public.mitv_library where user_id=owner_id and kind='favorite' and not deleted and item_key=p_ref) then raise exception 'FAVORITE_NOT_OWNED'; end if;
 insert into mitv_private.najd_refresh_cooldowns(user_id,work_ref) values(owner_id,p_ref) on conflict do nothing;
 select * into slot from mitv_private.najd_refresh_cooldowns where user_id=owner_id and work_ref=p_ref for update;
 if slot.next_allowed_at>clock_timestamp() then return jsonb_build_object('queued',false,'retry_after',ceil(extract(epoch from(slot.next_allowed_at-clock_timestamp())))::integer); end if;
 delay_seconds:=least(60,(case when slot.requested_at<now()-interval '10 minutes' then 1 else slot.tier+1 end)*10);
 update mitv_private.najd_refresh_cooldowns set tier=delay_seconds/10,requested_at=clock_timestamp(),next_allowed_at=clock_timestamp()+make_interval(secs=>delay_seconds) where user_id=owner_id and work_ref=p_ref;
 insert into public.matv_discovery_jobs(job_key,content_ref,title,stage,priority,status,refresh_after)
 values(p_ref||':work',p_ref,'تحديث المفضلة','work',10,'queued',now())
 on conflict(job_key) do update set status=case when public.matv_discovery_jobs.status='running' then 'running' else 'queued' end,attempts=case when public.matv_discovery_jobs.status='running' then public.matv_discovery_jobs.attempts else 0 end,refresh_after=now(),last_activity_at=now(),updated_at=now();
 perform mitv_private.najd_wake();
 return jsonb_build_object('queued',true,'retry_after',delay_seconds);
end $$;
revoke all on function public.najd_refresh_favorite(text) from public,anon;
grant execute on function public.najd_refresh_favorite(text) to authenticated;

select cron.schedule('najd-favorite-hourly','0 * * * *','select public.najd_hourly_refresh()');
commit;
