-- Keep only the three most recent demand instants: enough to prove three
-- requests within seven days without an unbounded event or analytics table.
alter table public.mitv_catalog_cache add column demand_hits timestamptz[] not null default '{}'
  check(pg_catalog.cardinality(demand_hits)<=3);
create or replace function public.mitv_touch_catalog(p_provider text,p_ref text,p_metadata jsonb default null,
  p_count integer default 1,p_new_until timestamptz default null,p_trending_until timestamptz default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_now timestamptz:=pg_catalog.clock_timestamp(); v_hits timestamptz[]; v_trending timestamptz;
begin
  if p_count<1 or p_count>1000 then raise exception 'MITV_CATALOG_COUNT_LIMIT' using errcode='22023'; end if;
  -- Includes insert races, not just updates to rows that already exist.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_provider||':'||p_ref,2802));
  select demand_hits into v_hits from public.mitv_catalog_cache where provider=p_provider and ref=p_ref;
  if not found and p_metadata is null then return; end if;
  select coalesce(pg_catalog.array_agg(stamp order by stamp desc),'{}'::timestamptz[]) into v_hits from (
    select stamp from (
      select stamp from pg_catalog.unnest(coalesce(v_hits,'{}'::timestamptz[])) as hits(stamp)
        where stamp>=v_now-interval '7 days'
      union all select v_now from pg_catalog.generate_series(1,least(p_count,3))
    ) as all_hits order by stamp desc limit 3
  ) as recent;
  v_trending:=case when pg_catalog.cardinality(v_hits)>=3 then v_now+interval '48 hours'
    when p_trending_until is null then null else least(p_trending_until,v_now+interval '48 hours') end;
  if p_metadata is null then
    update public.mitv_catalog_cache set request_count=least(request_count::bigint+p_count,2147483647)::integer,
      last_requested_at=v_now,demand_hits=v_hits,
      trending_until=case when v_trending is null then trending_until
        else greatest(coalesce(trending_until,'-infinity'::timestamptz),v_trending) end
      where provider=p_provider and ref=p_ref;
  else
    insert into public.mitv_catalog_cache as cache(provider,ref,metadata,request_count,last_requested_at,
      refreshed_at,refresh_after,new_until,trending_until,demand_hits)
    values(p_provider,p_ref,p_metadata,p_count,v_now,v_now,v_now+interval '10 minutes',
      case when p_new_until is null then null else least(p_new_until,v_now+interval '48 hours') end,
      v_trending,v_hits)
    on conflict(provider,ref) do update set metadata=excluded.metadata,
      request_count=least(cache.request_count::bigint+p_count,2147483647)::integer,
      last_requested_at=v_now,refreshed_at=v_now,refresh_after=excluded.refresh_after,
      new_until=coalesce(excluded.new_until,cache.new_until),demand_hits=excluded.demand_hits,
      trending_until=case when v_trending is null then cache.trending_until
        else greatest(coalesce(cache.trending_until,'-infinity'::timestamptz),v_trending) end;
  end if;
end $$;
