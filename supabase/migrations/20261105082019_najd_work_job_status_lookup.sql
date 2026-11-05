-- Poll only the requested work without scanning the full accumulated queue.
-- Workers are contained during rollout; bound lock acquisition and build time.
set local lock_timeout='3s';
set local statement_timeout='60s';
create index if not exists najd_jobs_work_updated_idx
 on public.matv_discovery_jobs(content_ref,updated_at desc);
