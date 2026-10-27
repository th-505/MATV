-- Give never-processed episode tails a turn before already-refreshed media.
create or replace function public.najd_claim_jobs(p_worker uuid,p_limit integer default 2)
returns setof public.matv_discovery_jobs language sql security invoker set search_path='' as $$
 with due as(
  select job_key from public.matv_discovery_jobs
  where p_worker is not null and attempts<5 and ((status='ready' and stage='episode' and refresh_after<=clock_timestamp() and exists(select 1 from public.najd_work_catalog c where c.ref=public.matv_discovery_jobs.content_ref and c.expires_at>clock_timestamp())) or (status='queued' and coalesce(refresh_after,'-infinity')<=clock_timestamp()) or(status='running' and lease_until<clock_timestamp()))
  order by priority desc,coalesce(finished_at,'-infinity'::timestamptz),requested_at limit least(greatest(coalesce(p_limit,2),1),8) for update skip locked
 ) update public.matv_discovery_jobs j set status='running',worker_id=p_worker,started_at=clock_timestamp(),lease_until=clock_timestamp()+interval '90 seconds',attempts=j.attempts+1,updated_at=clock_timestamp()
 from due where j.job_key=due.job_key returning j.*;
$$;
revoke all on function public.najd_claim_jobs(uuid,integer) from public,anon,authenticated;
grant execute on function public.najd_claim_jobs(uuid,integer) to service_role;

