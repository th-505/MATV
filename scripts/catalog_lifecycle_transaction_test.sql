-- Run only as the database administrator through the connected Supabase tool.
-- The year-2000 clock isolates fixtures from real data; ROLLBACK removes all
-- fixtures and changes. Inject the UUID of an explicitly created QA owner.
begin;
set local mitv.test_owner='__TEST_OWNER_UUID__';
do $$
declare
  owner_id uuid:=pg_catalog.current_setting('mitv.test_owner')::uuid;
  prefix text:='mitv-ttl-qa-'||pg_catalog.gen_random_uuid()::text||':';
  clock timestamptz:='2000-01-01 00:00:00+00';
  outcome jsonb;
begin
  if not exists(select 1 from auth.users where id=owner_id and is_anonymous) then
    raise exception 'QA_ANONYMOUS_OWNER_REQUIRED';
  end if;
  -- Precondition: the synthetic clock must never touch existing production rows.
  if exists(select 1 from public.matv_provider_cache where expires_at<=clock)
    or exists(select 1 from public.matv_provider_events where created_at<clock-interval '7 days')
    or exists(select 1 from public.mitv_catalog_cache where last_requested_at<clock) then
    raise exception 'QA_SYNTHETIC_CLOCK_NOT_ISOLATED';
  end if;
  insert into public.mitv_catalog_cache(provider,ref,metadata,request_count,last_requested_at,new_until,trending_until)
  values
    ('laroza',prefix||'one-off','{"title":"one-off"}',1,clock-interval '8 days',null,null),
    ('akoam',prefix||'repeat','{"title":"repeat"}',2,clock-interval '8 days',null,null),
    ('alooy',prefix||'thirty-days','{"title":"thirty-days"}',2,clock-interval '31 days',null,null),
    ('3isk',prefix||'new','{"title":"new"}',1,clock-interval '8 days',clock+interval '1 day',null),
    ('laroza',prefix||'trending','{"title":"trending"}',1,clock-interval '8 days',null,clock+interval '1 day'),
    ('akoam',prefix||'favorite','{"title":"favorite"}',1,clock-interval '8 days',null,null),
    ('alooy',prefix||'history','{"title":"history"}',1,clock-interval '8 days',null,null),
    ('3isk',prefix||'idle-history','{"title":"idle-history"}',1,clock-interval '8 days',null,null);
  insert into public.mitv_library(user_id,kind,item_key,metadata,updated_at) values
    (owner_id,'favorite',prefix||'favorite',pg_catalog.jsonb_build_object('ref',prefix||'favorite'),clock-interval '100 days'),
    (owner_id,'history',prefix||'history',pg_catalog.jsonb_build_object('item',pg_catalog.jsonb_build_object('source_refs',pg_catalog.jsonb_build_object('alooy',prefix||'history'))),clock-interval '1 day'),
    (owner_id,'history',prefix||'idle-history',pg_catalog.jsonb_build_object('ref',prefix||'idle-history'),clock-interval '8 days');
  insert into public.matv_provider_cache(provider,cache_key,payload,expires_at,updated_at) values
    ('3isk',prefix||'expired-token','{}',clock-interval '1 second',clock-interval '1 hour'),
    ('3isk',prefix||'live-token','{}',clock+interval '1 hour',clock);
  insert into public.matv_provider_events(provider,cache_key,outcome,duration_ms,created_at) values
    ('3isk',prefix||'old-event','resolved',1,clock-interval '8 days'),
    ('3isk',prefix||'new-event','resolved',1,clock-interval '1 day');
  outcome:=mitv_private.purge_idle_cache(clock);
  if outcome<>jsonb_build_object('expired_playback_rows',1,'old_event_rows',1,'idle_metadata_rows',3) then
    raise exception 'TTL_WRONG_COUNTS: %',outcome;
  end if;
  if exists(select 1 from public.mitv_catalog_cache where ref in(prefix||'one-off',prefix||'thirty-days',prefix||'idle-history')) then
    raise exception 'IDLE_METADATA_NOT_REMOVED';
  end if;
  if (select count(*) from public.mitv_catalog_cache where ref like prefix||'%')<>5 then
    raise exception 'NEW_TRENDING_FAVORITE_ACTIVE_HISTORY_OR_REPEAT_NOT_PROTECTED';
  end if;
  if exists(select 1 from public.matv_provider_cache where cache_key=prefix||'expired-token')
    or not exists(select 1 from public.matv_provider_cache where cache_key=prefix||'live-token') then
    raise exception 'PLAYBACK_EXPIRY_POLICY_BROKEN';
  end if;
  begin
    insert into public.mitv_catalog_cache(provider,ref,metadata) values('laroza',prefix||'unsafe','{"headers":{"Referer":"private"}}');
    raise exception 'PRIVATE_HEADER_ACCEPTED';
  exception when check_violation then null;end;
  begin
    insert into public.mitv_catalog_cache(provider,ref,metadata) values('laroza',prefix||'unsafe-media','{"url":"https://cdn.test/master.m3u8?token=secret"}');
    raise exception 'PLAYBACK_URL_ACCEPTED';
  exception when check_violation then null;end;
  perform public.mitv_touch_catalog('laroza',prefix||'demand','{"title":"demand"}',1);
  perform public.mitv_touch_catalog('laroza',prefix||'demand',null,1);
  if (select request_count from public.mitv_catalog_cache where provider='laroza' and ref=prefix||'demand')<>2 then
    raise exception 'SECOND_DEMAND_NOT_COUNTED';
  end if;
  if (select trending_until from public.mitv_catalog_cache where provider='laroza' and ref=prefix||'demand') is not null then
    raise exception 'TRENDING_BEFORE_THREE_REQUESTS';
  end if;
  perform public.mitv_touch_catalog('laroza',prefix||'demand',null,1);
  if not exists(select 1 from public.mitv_catalog_cache where provider='laroza' and ref=prefix||'demand'
    and cardinality(demand_hits)=3 and trending_until>=now()+interval '47 hours'
    and trending_until<=now()+interval '49 hours') then
    raise exception 'THREE_REQUESTS_DID_NOT_PROTECT_TRENDING';
  end if;
  insert into public.mitv_catalog_cache(provider,ref,metadata,request_count,demand_hits)
    values('laroza',prefix||'old-demand','{"title":"old demand"}',10,
      array[now()-interval '8 days',now()-interval '9 days',now()-interval '10 days']);
  perform public.mitv_touch_catalog('laroza',prefix||'old-demand',null,1);
  if not exists(select 1 from public.mitv_catalog_cache where provider='laroza' and ref=prefix||'old-demand'
    and cardinality(demand_hits)=1 and request_count=11 and trending_until is null) then
    raise exception 'TRENDING_COUNT_DID_NOT_EXCLUDE_OLD_REQUESTS';
  end if;
end $$;
rollback;
select 'PASS: isolated rollback proves idle TTL, new/trending/follow/history exemptions, playback expiry, metadata credential rejection and demand count' as result;
