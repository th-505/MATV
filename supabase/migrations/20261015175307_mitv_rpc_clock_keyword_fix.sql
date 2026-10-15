-- Avoid the SQL CURRENT_TIME keyword: these values must be timestamptz.
create or replace function public.mitv_upsert_library(rows jsonb)
returns setof public.mitv_library language plpgsql security invoker set search_path = '' as $$
declare uid uuid := auth.uid(); entry jsonb; stamp timestamptz; v_now timestamptz := pg_catalog.clock_timestamp();
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
    stamp := coalesce((entry->>'updated_at')::timestamptz,v_now);
    if stamp>v_now+interval '5 minutes' then stamp:=v_now; end if;
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

create or replace function public.mitv_touch_catalog(p_provider text,p_ref text,p_metadata jsonb default null,
  p_count integer default 1,p_new_until timestamptz default null,p_trending_until timestamptz default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_now timestamptz:=pg_catalog.clock_timestamp();
begin
  if p_count<1 or p_count>1000 then raise exception 'MITV_CATALOG_COUNT_LIMIT' using errcode='22023'; end if;
  if p_metadata is null then
    update public.mitv_catalog_cache set request_count=least(request_count::bigint+p_count,2147483647)::integer,
      last_requested_at=v_now where provider=p_provider and ref=p_ref;
  else
    insert into public.mitv_catalog_cache as cache(provider,ref,metadata,request_count,last_requested_at,
      refreshed_at,refresh_after,new_until,trending_until)
    values(p_provider,p_ref,p_metadata,p_count,v_now,v_now,v_now+interval '10 minutes',
      case when p_new_until is null then null else least(p_new_until,v_now+interval '7 days') end,
      case when p_trending_until is null then null else least(p_trending_until,v_now+interval '7 days') end)
    on conflict(provider,ref) do update set metadata=excluded.metadata,
      request_count=least(cache.request_count::bigint+p_count,2147483647)::integer,
      last_requested_at=v_now,refreshed_at=v_now,refresh_after=excluded.refresh_after,
      new_until=coalesce(excluded.new_until,cache.new_until),trending_until=coalesce(excluded.trending_until,cache.trending_until);
  end if;
end $$;
