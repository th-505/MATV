-- Legacy maintenance must not be an anonymous-user privileged delete RPC.
-- Keep its name for existing administrator schedules without broad data edits.
do $$ begin
  -- This function predates the repository schema on the connected project.
  -- A fresh installation does not need to create a retired cleanup endpoint.
  if pg_catalog.to_regprocedure('public.cleanup_idle_cache_7d()') is not null then
    alter function public.cleanup_idle_cache_7d() security invoker;
    alter function public.cleanup_idle_cache_7d() set search_path='';
    revoke all on function public.cleanup_idle_cache_7d() from public,anon,authenticated;
    grant execute on function public.cleanup_idle_cache_7d() to service_role;
  end if;
end $$;
