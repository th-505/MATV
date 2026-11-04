-- Dedicated bounded lanes preserve capacity for interactive discovery and playback.
-- Existing claim API remains compatible with installed/older server workers.
create function public.najd_claim_jobs_lane(p_worker uuid,p_limit integer,p_lane text)
returns setof public.matv_discovery_jobs language sql security invoker set search_path='' as $$
 with due as (
  select j.job_key from public.matv_discovery_jobs j
  where p_worker is not null and j.attempts<5
   and ((p_lane='search' and j.stage='provider' and j.payload->>'phase'='search')
    or (p_lane='index' and (j.stage in ('work','season') or (j.stage='provider' and j.payload->>'phase' is distinct from 'search')))
    or (p_lane='media' and j.stage='episode'))
   and ((j.status='ready' and j.stage='episode' and j.refresh_after<=clock_timestamp()
      and exists(select 1 from public.najd_work_catalog c where c.ref=j.content_ref and c.expires_at>clock_timestamp()))
    or (j.status='queued' and coalesce(j.refresh_after,'-infinity')<=clock_timestamp())
    or (j.status='running' and j.lease_until<clock_timestamp()))
  order by j.priority desc,coalesce(j.finished_at,'-infinity'::timestamptz),j.requested_at
  limit least(greatest(coalesce(p_limit,1),1),case p_lane when 'search' then 20 when 'index' then 4 when 'media' then 2 else 0 end)
  for update skip locked
 ) update public.matv_discovery_jobs j set status='running',worker_id=p_worker,
  started_at=clock_timestamp(),lease_until=clock_timestamp()+interval '90 seconds',
  attempts=j.attempts+1,updated_at=clock_timestamp()
 from due where j.job_key=due.job_key returning j.*;
$$;
revoke all on function public.najd_claim_jobs_lane(uuid,integer,text) from public,anon,authenticated;
grant execute on function public.najd_claim_jobs_lane(uuid,integer,text) to service_role;

-- Legacy indexes are compared only for the works requested by this panel.
-- Return hashes, never media URLs or raw episode references.
create function public.najd_source_index_identities(p_refs text[])
returns table(work_ref text,index_identity text) language sql stable security invoker set search_path='' as $$
 select e.work_ref,
  pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to((c.metadata->>'provider')||'|'||coalesce(c.metadata->>'source_edition','unknown')||'|'||
   string_agg(distinct (e.season::text||':'||e.episode::text||':'||e.source_ref) collate "C", E'\n'
     order by (e.season::text||':'||e.episode::text||':'||e.source_ref) collate "C"),'UTF8')),'hex')
 from public.najd_episode_cache e join public.najd_work_catalog c on c.ref=e.work_ref
 where e.work_ref=any(p_refs[1:1000]) and c.ref like 'source:%' and c.type='series'
  and (c.metadata->>'index_started_at' is null or e.indexed_at >= (c.metadata->>'index_started_at')::timestamptz)
 group by e.work_ref,c.metadata->>'provider',c.metadata->>'source_edition';
$$;
revoke all on function public.najd_source_index_identities(text[]) from public,anon,authenticated;
grant execute on function public.najd_source_index_identities(text[]) to service_role;
