-- Lane lookup avoids scanning every cached episode before claiming interactive jobs.
-- Keep the existing fairness ordering and row leases unchanged.
set local lock_timeout='3s';
set local statement_timeout='120s';
create index najd_queue_discovery_order on public.matv_discovery_jobs
 (stage,priority desc,(coalesce(finished_at,'-infinity'::timestamptz)),requested_at)
 where attempts<5 and stage<>'episode';

-- Separate statements let generic prepared plans use the small non-media index.
create or replace function public.najd_claim_jobs_lane(p_worker uuid,p_limit integer,p_lane text)
returns setof public.matv_discovery_jobs language plpgsql security invoker set search_path='' as $$
begin
 if p_worker is null then return; end if;
 if p_lane='search' then
  return query with due as (
   select j.job_key from public.matv_discovery_jobs j
   where j.attempts<5 and j.stage<>'episode' and j.stage='provider' and j.payload->>'phase'='search'
    and ((j.status='queued' and coalesce(j.refresh_after,'-infinity')<=clock_timestamp())
     or (j.status='running' and j.lease_until<clock_timestamp()))
   order by j.priority desc,coalesce(j.finished_at,'-infinity'::timestamptz),j.requested_at
   limit least(greatest(coalesce(p_limit,1),1),20) for update skip locked
  ) update public.matv_discovery_jobs j set status='running',worker_id=p_worker,
   started_at=clock_timestamp(),lease_until=clock_timestamp()+interval '90 seconds',
   attempts=j.attempts+1,updated_at=clock_timestamp()
  from due where j.job_key=due.job_key returning j.*;
  return;
 end if;
 if p_lane='index' then
  return query with due as (
   select j.job_key from public.matv_discovery_jobs j
   where j.attempts<5 and j.stage<>'episode' and (j.stage in ('work','season') or (j.stage='provider' and j.payload->>'phase' is distinct from 'search'))
    and ((j.status='queued' and coalesce(j.refresh_after,'-infinity')<=clock_timestamp())
     or (j.status='running' and j.lease_until<clock_timestamp()))
   order by j.priority desc,coalesce(j.finished_at,'-infinity'::timestamptz),j.requested_at
   limit least(greatest(coalesce(p_limit,1),1),4) for update skip locked
  ) update public.matv_discovery_jobs j set status='running',worker_id=p_worker,
   started_at=clock_timestamp(),lease_until=clock_timestamp()+interval '90 seconds',
   attempts=j.attempts+1,updated_at=clock_timestamp()
  from due where j.job_key=due.job_key returning j.*;
  return;
 end if;
 if p_lane='media' then
  return query with due as (
   select j.job_key from public.matv_discovery_jobs j
   where j.attempts<5 and j.stage='episode'
    and ((j.status='ready' and j.refresh_after<=clock_timestamp() and exists(select 1 from public.najd_work_catalog c where c.ref=j.content_ref and c.expires_at>clock_timestamp())) or (j.status='queued' and coalesce(j.refresh_after,'-infinity')<=clock_timestamp())
     or (j.status='running' and j.lease_until<clock_timestamp()))
   order by j.priority desc,coalesce(j.finished_at,'-infinity'::timestamptz),j.requested_at
   limit least(greatest(coalesce(p_limit,1),1),2) for update skip locked
  ) update public.matv_discovery_jobs j set status='running',worker_id=p_worker,
   started_at=clock_timestamp(),lease_until=clock_timestamp()+interval '90 seconds',
   attempts=j.attempts+1,updated_at=clock_timestamp()
  from due where j.job_key=due.job_key returning j.*;
  return;
 end if;
end;
$$;
revoke all on function public.najd_claim_jobs_lane(uuid,integer,text) from public,anon,authenticated;
grant execute on function public.najd_claim_jobs_lane(uuid,integer,text) to service_role;
