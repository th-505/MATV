-- Aggregate work references only: no account/device/user identifiers.
create table public.mitv_work_activity (
  provider text not null check(provider ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  ref text not null check(octet_length(ref) between 1 and 1536 and ref !~ '[[:cntrl:]]'
    and mitv_private.metadata_is_safe(jsonb_build_object('ref',ref))),
  open_count bigint not null default 1 check(open_count>0),
  last_opened_at timestamptz not null default now(),
  primary key(provider,ref)
);
alter table public.mitv_work_activity enable row level security;
revoke all on public.mitv_work_activity from public,anon,authenticated;
grant select,insert,update,delete on public.mitv_work_activity to service_role;
create index mitv_work_activity_idle_idx on public.mitv_work_activity(last_opened_at);
create function public.mitv_record_work_open(p_provider text,p_ref text)
returns void language sql security invoker set search_path='' as $$
  insert into public.mitv_work_activity as activity(provider,ref)
  values(p_provider,p_ref)
  on conflict(provider,ref) do update set
    open_count=least(activity.open_count,9223372036854775806)+1,
    last_opened_at=pg_catalog.clock_timestamp();
$$;
revoke all on function public.mitv_record_work_open(text,text) from public,anon,authenticated;
grant execute on function public.mitv_record_work_open(text,text) to service_role;
select cron.schedule('mitv-idle-work-activity-purge','23 4 * * *',
  'delete from public.mitv_work_activity where last_opened_at < now() - interval ''90 days'';');
