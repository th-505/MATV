-- Source editions keep their provider's own identity and episode numbering.
-- No owner rows, auth users, media URLs or existing identifiers are rewritten.
begin;
set local lock_timeout = '3s';

create function public.najd_work_reference(p_ref text)
returns text language plpgsql immutable strict security invoker set search_path = '' as $$
declare provider text;
begin
 if pg_catalog.octet_length(p_ref) > 1536 or p_ref ~ '[[:space:][:cntrl:]]' then return null; end if;
 if p_ref ~ '^tmdb:(movie|tv):[1-9][0-9]{0,9}$' then return p_ref; end if;
 if p_ref ~ '^source:(mycima|akwam|cimanow|shahid4u|moviztime|shii4u|egydead|ipauniverse|3cktv|anime4up|qfilm|ristoanime|arabseed|mewsry|anime4up_rest|witanime|egydead_live|yallashoot|3isk|alooy|laroza|legacy|akoam|wecima|moviz|3ck):[a-f0-9]{24}$' then return p_ref; end if;
 provider := pg_catalog.split_part(p_ref, ':', 1);
 if provider not in ('mycima','akwam','cimanow','shahid4u','moviztime','shii4u','egydead','ipauniverse','3cktv','anime4up','qfilm','ristoanime','arabseed','mewsry','anime4up_rest','witanime','egydead_live','yallashoot','3isk','alooy','laroza','legacy','akoam','wecima','moviz','3ck')
 or pg_catalog.length(p_ref) <= pg_catalog.length(provider) + 1 then return null; end if;
 return 'source:' || provider || ':' || pg_catalog.substr(pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_ref, 'UTF8')), 'hex'), 1, 24);
end $$;
revoke all on function public.najd_work_reference(text) from public, anon, authenticated;
grant execute on function public.najd_work_reference(text) to authenticated, service_role;

alter table public.najd_work_catalog drop constraint najd_work_catalog_ref_check;
alter table public.najd_work_catalog add constraint najd_work_catalog_ref_check
 check (ref ~ '^tmdb:(movie|tv):[0-9]+$' or (ref like 'source:%' and coalesce(public.najd_work_reference(ref) = ref,false)));
alter table public.najd_work_catalog alter column tmdb_id drop not null;
alter table public.najd_work_catalog add constraint najd_canonical_tmdb_id_required
 check (ref not like 'tmdb:%' or tmdb_id is not null);
alter table public.matv_discovery_jobs drop constraint matv_discovery_jobs_content_ref_check;
alter table public.matv_discovery_jobs add constraint matv_discovery_jobs_content_ref_check
 check (content_ref ~ '^tmdb:(movie|tv):[0-9]+$' or (content_ref like 'source:%' and coalesce(public.najd_work_reference(content_ref) = content_ref,false)));
alter table public.matv_content_demand drop constraint matv_content_demand_content_ref_check;
alter table public.matv_content_demand add constraint matv_content_demand_content_ref_check
 check (content_ref ~ '^tmdb:(movie|tv):[0-9]+$' or (content_ref like 'source:%' and coalesce(public.najd_work_reference(content_ref) = content_ref,false)));

-- Track observation time separately from media refresh time. An old media job
-- cannot resurrect a link removed from the current source index.
alter table public.najd_episode_cache add column indexed_at timestamptz not null default now();
create or replace function public.najd_upsert_episodes(p_rows jsonb) returns integer language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>200 or pg_column_size(p_rows)>1048576 then raise exception 'INVALID_EPISODE_BATCH'; end if;
 insert into public.najd_episode_cache(work_ref,provider,source_ref,season,episode,title,indexed_at)
 select r.work_ref,r.provider,r.source_ref,r.season,r.episode,left(r.title,500),now()
 from jsonb_to_recordset(p_rows) as r(work_ref text,provider text,source_ref text,season integer,episode integer,title text)
 on conflict(work_ref,provider,source_ref) do update set season=excluded.season,episode=excluded.episode,title=excluded.title,indexed_at=now(),updated_at=now();
 get diagnostics n=row_count;return n;
end $$;
revoke all on function public.najd_upsert_episodes(jsonb) from public,anon,authenticated;
grant execute on function public.najd_upsert_episodes(jsonb) to service_role;

-- This pure helper handles historical metadata envelopes without trusting a
-- client-provided owner, canonical year, season count or playback URL.
create function mitv_private.najd_favorite_work_reference(p_item_key text, p_metadata jsonb)
returns text language sql immutable security invoker set search_path = '' as $$
 select coalesce(public.najd_work_reference(p_item_key),
                 public.najd_work_reference(p_metadata ->> 'ref'),
                 public.najd_work_reference(p_metadata -> 'catalog_item' ->> 'ref'));
$$;
revoke all on function mitv_private.najd_favorite_work_reference(text,jsonb) from public, anon, authenticated;
grant execute on function mitv_private.najd_favorite_work_reference(text,jsonb) to service_role;

-- A hash identifies an edition; it cannot recover an upstream URL. Original
-- source references are accepted only if they hash back to the exact work key.
create function mitv_private.najd_favorite_source_reference(p_work_ref text, p_item_key text, p_metadata jsonb)
returns text language plpgsql stable security invoker set search_path = '' as $$
declare candidate text; saved_reference text;
begin
 if p_work_ref not like 'source:%' then return null; end if;
 select metadata ->> 'source_ref' into saved_reference from public.najd_work_catalog where ref = p_work_ref;
 foreach candidate in array array[p_item_key, p_metadata ->> 'ref', p_metadata -> 'catalog_item' ->> 'ref', p_metadata ->> 'source_ref', saved_reference] loop
  if candidate is not null and candidate not like 'source:%' and public.najd_work_reference(candidate) = p_work_ref then return candidate; end if;
 end loop;
 return null;
end $$;
revoke all on function mitv_private.najd_favorite_source_reference(text,text,jsonb) from public, anon, authenticated;
grant execute on function mitv_private.najd_favorite_source_reference(text,text,jsonb) to service_role;

-- Shared work is queued, never a private viewer ID. A source edition retains its
-- original provider/reference in a bounded server-only job payload.
create function mitv_private.najd_queue_favorite_work(p_ref text, p_source_ref text, p_title text, p_priority integer, p_force boolean default false)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare affected integer; provider_id text; body jsonb;
begin
 if public.najd_work_reference(p_ref) is distinct from p_ref then return false; end if;
 provider_id := case when p_ref like 'source:%' then pg_catalog.split_part(p_ref, ':', 2) else '' end;
 if p_ref like 'source:%' and (p_source_ref is null or p_source_ref like 'source:%' or public.najd_work_reference(p_source_ref) is distinct from p_ref) then
  insert into public.najd_harvest_events(work_ref,provider,stage,outcome,reason,details)
  values(p_ref,provider_id,'work','unavailable','SOURCE_REFERENCE_MISSING','{"source_ref_present":false}');
  return false;
 end if;
 body := case when p_ref like 'source:%' then pg_catalog.jsonb_build_object('source_ref', p_source_ref) else '{}'::jsonb end;
 insert into public.matv_discovery_jobs(job_key,content_ref,title,provider,stage,payload,priority,status,last_activity_at,refresh_after)
 values(p_ref || ':work', p_ref, pg_catalog.left(case when pg_catalog.length(coalesce(p_title,''))<2 then 'عمل '||coalesce(p_title,'') else p_title end,250), provider_id, 'work', body, p_priority, 'queued', now(), now())
 on conflict(job_key) do update set
  last_activity_at = now(), priority = greatest(public.matv_discovery_jobs.priority, excluded.priority),
  payload = case when public.matv_discovery_jobs.status = 'running' then public.matv_discovery_jobs.payload else excluded.payload end,
  status = case when public.matv_discovery_jobs.status <> 'running' and (p_force or coalesce(public.matv_discovery_jobs.refresh_after,'-infinity') <= now()) then 'queued' else public.matv_discovery_jobs.status end,
  attempts = case when public.matv_discovery_jobs.status <> 'running' and (p_force or coalesce(public.matv_discovery_jobs.refresh_after,'-infinity') <= now()) then 0 else public.matv_discovery_jobs.attempts end,
  refresh_after = case when public.matv_discovery_jobs.status <> 'running' and (p_force or coalesce(public.matv_discovery_jobs.refresh_after,'-infinity') <= now()) then now() else public.matv_discovery_jobs.refresh_after end,
  updated_at = now();
 get diagnostics affected = row_count;
 return affected > 0;
end $$;
revoke all on function mitv_private.najd_queue_favorite_work(text,text,text,integer,boolean) from public, anon, authenticated;
grant execute on function mitv_private.najd_queue_favorite_work(text,text,text,integer,boolean) to service_role;

create or replace function mitv_private.najd_favorite_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r text; n integer; label text; source_reference text;
begin
 if new.kind <> 'favorite' then return new; end if;
 r := mitv_private.najd_favorite_work_reference(new.item_key, new.metadata);
 if r is null then return new; end if;
 select count(*) into n from public.mitv_library
 where kind = 'favorite' and not deleted and mitv_private.najd_favorite_work_reference(item_key,metadata) = r;
 insert into public.matv_content_demand(content_ref,favorite_count,last_favorited_at,refresh_after,updated_at)
 values(r,n,now(),now(),now()) on conflict(content_ref) do update set favorite_count = excluded.favorite_count,last_favorited_at = excluded.last_favorited_at,updated_at = now();
 if new.deleted then return new; end if;
 label := pg_catalog.left(coalesce(nullif(new.metadata ->> 'title',''),nullif(new.metadata -> 'catalog_item' ->> 'title',''),'قيد التعرف على العمل'),250);
 source_reference := mitv_private.najd_favorite_source_reference(r,new.item_key,new.metadata);
 perform mitv_private.najd_queue_favorite_work(r,source_reference,label,10,false);
 perform mitv_private.najd_wake();
 return new;
end $$;
revoke all on function mitv_private.najd_favorite_event() from public, anon, authenticated;

-- Used once for real existing favorites and subsequently by the hourly task.
-- No placeholder owners, fabricated titles/episodes, or user identifiers enter jobs.
create function mitv_private.najd_queue_current_favorites(p_force boolean default true)
returns integer language plpgsql security invoker set search_path = '' as $$
declare entry record; queued integer := 0;
begin
 for entry in
  with favorites as (
   select mitv_private.najd_favorite_work_reference(item_key,metadata) as work_ref,item_key,metadata
   from public.mitv_library where kind = 'favorite' and not deleted
  )
  select work_ref,
   max(coalesce(nullif(metadata ->> 'title',''),nullif(metadata -> 'catalog_item' ->> 'title',''),'قيد التعرف على العمل')) as label,
   max(mitv_private.najd_favorite_source_reference(work_ref,item_key,metadata)) as source_ref,
   count(*) as favorite_count
  from favorites where work_ref is not null group by work_ref
 loop
  insert into public.matv_content_demand(content_ref,favorite_count,last_favorited_at,refresh_after,updated_at)
  values(entry.work_ref,entry.favorite_count,now(),now(),now())
  on conflict(content_ref) do update set favorite_count = excluded.favorite_count,updated_at = now();
  if mitv_private.najd_queue_favorite_work(entry.work_ref,entry.source_ref,entry.label,8,p_force) then queued := queued + 1; end if;
 end loop;
 return queued;
end $$;
revoke all on function mitv_private.najd_queue_current_favorites(boolean) from public, anon, authenticated;
grant execute on function mitv_private.najd_queue_current_favorites(boolean) to service_role;

create or replace function public.najd_hourly_refresh()
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare count_due integer;
begin
 count_due := mitv_private.najd_queue_current_favorites(true);
 update public.matv_discovery_jobs set status='queued',worker_id=null,lease_until=null,refresh_after=now()
 where status='running' and lease_until<now() and attempts<5;
 update public.matv_discovery_jobs set status='failed',worker_id=null,lease_until=null,error_code='LEASE_EXHAUSTED'
 where status='running' and lease_until<now() and attempts>=5;
 delete from public.matv_discovery_jobs where last_activity_at<now()-interval '7 days' and status<>'running'
 and not exists(select 1 from public.najd_work_catalog c where c.ref=public.matv_discovery_jobs.content_ref and c.expires_at>now());
 update public.najd_episode_cache set state='pending',media='[]',media_expires_at=null where media_expires_at<=now();
 delete from public.najd_work_catalog c where c.expires_at<now()
 and not exists(select 1 from public.mitv_library l where l.kind='favorite' and not l.deleted and mitv_private.najd_favorite_work_reference(l.item_key,l.metadata)=c.ref);
 delete from public.najd_harvest_events where created_at<now()-interval '30 days';
 perform mitv_private.najd_wake();
 return pg_catalog.jsonb_build_object('due_works',count_due);
end $$;
revoke all on function public.najd_hourly_refresh() from public, anon, authenticated;
grant execute on function public.najd_hourly_refresh() to service_role;

-- Keep linked-library authorization and the existing per-owner cooldown. The
-- caller may refresh only a favorite belonging to the verified linked owner.
create or replace function public.najd_refresh_favorite(p_ref text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := mitv_private.najd_library_owner(); r text; slot mitv_private.najd_refresh_cooldowns; delay_seconds integer; favorite_row public.mitv_library; source_reference text; queued boolean;
begin
 r := public.najd_work_reference(p_ref);
 if owner_id is null or r is null then raise exception 'AUTH_OR_REFERENCE_INVALID'; end if;
 select * into favorite_row from public.mitv_library
 where user_id=owner_id and kind='favorite' and not deleted
 and (item_key=p_ref or mitv_private.najd_favorite_work_reference(item_key,metadata)=r)
 order by case when item_key=p_ref then 0 else 1 end limit 1;
 if not found then raise exception 'FAVORITE_NOT_OWNED'; end if;
 insert into mitv_private.najd_refresh_cooldowns(user_id,work_ref) values(owner_id,r) on conflict do nothing;
 select * into slot from mitv_private.najd_refresh_cooldowns where user_id=owner_id and work_ref=r for update;
 if slot.next_allowed_at>clock_timestamp() then return pg_catalog.jsonb_build_object('queued',false,'retry_after',ceil(extract(epoch from(slot.next_allowed_at-clock_timestamp())))::integer); end if;
 delay_seconds := least(60,(case when slot.requested_at<now()-interval '10 minutes' then 1 else slot.tier+1 end)*10);
 update mitv_private.najd_refresh_cooldowns set tier=delay_seconds/10,requested_at=clock_timestamp(),next_allowed_at=clock_timestamp()+make_interval(secs=>delay_seconds) where user_id=owner_id and work_ref=r;
 source_reference := mitv_private.najd_favorite_source_reference(r,favorite_row.item_key,favorite_row.metadata);
 queued := mitv_private.najd_queue_favorite_work(r,source_reference,coalesce(nullif(favorite_row.metadata ->> 'title',''),'تحديث المفضلة'),10,true);
 perform mitv_private.najd_wake();
 return pg_catalog.jsonb_build_object('queued',queued,'retry_after',delay_seconds,'work_ref',r);
end $$;
revoke all on function public.najd_refresh_favorite(text) from public, anon, authenticated;
grant execute on function public.najd_refresh_favorite(text) to authenticated;

-- Aggregate counters complement the last-100-row dashboard sample. No UUID,
-- authentication material, source reference, title or signed media is returned.
create function public.najd_harvest_counts()
returns jsonb language sql stable security invoker set search_path = '' as $$
 select pg_catalog.jsonb_build_object(
  'job_status',coalesce((select pg_catalog.jsonb_object_agg(status,n) from (select status,count(*) n from public.matv_discovery_jobs group by status) s),'{}'::jsonb),
  'job_stage',coalesce((select pg_catalog.jsonb_agg(s order by stage,status) from (select stage,status,count(*) as count from public.matv_discovery_jobs group by stage,status) s),'[]'::jsonb),
  'work_state',coalesce((select pg_catalog.jsonb_object_agg(state,n) from (select state,count(*) n from public.najd_work_catalog group by state) s),'{}'::jsonb),
  'favorite_types',coalesce((select pg_catalog.jsonb_agg(s order by provider) from (select pg_catalog.split_part(item_key,':',1) provider,count(*) as count from public.mitv_library where kind='favorite' and not deleted group by 1) s),'[]'::jsonb),
  'favorites',(
   with favorites as (select distinct mitv_private.najd_favorite_work_reference(item_key,metadata) as ref from public.mitv_library where kind='favorite' and not deleted),
   supported as(select ref from favorites where ref is not null)
   select pg_catalog.jsonb_build_object(
    'rows',(select count(*) from public.mitv_library where kind='favorite' and not deleted),
    'distinct_works',count(*),
    'with_work_job',count(j.job_key),
    'missing_work_job',count(*) filter(where j.job_key is null))
   from supported f left join public.matv_discovery_jobs j on j.job_key=f.ref||':work'
  ),
  'sources',pg_catalog.jsonb_build_object('total',(select count(*) from public.najd_source_catalog),'partial',(select count(*) from public.najd_source_catalog where state='partial'))
 );
$$;
revoke all on function public.najd_harvest_counts() from public, anon, authenticated;
grant execute on function public.najd_harvest_counts() to service_role;

-- Backfill from real favorites after installing their new reference/payload path.
select mitv_private.najd_queue_current_favorites(false);
select mitv_private.najd_wake();
commit;
