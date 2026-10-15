-- Client mutation timestamps resolve conflicts; server revisions enumerate
-- accepted mutations, including old offline inserts arriving after a pull.
create sequence mitv_private.library_sync_revision_seq as bigint;
revoke all on sequence mitv_private.library_sync_revision_seq from public, anon;
grant usage on sequence mitv_private.library_sync_revision_seq to authenticated, service_role;
alter table public.mitv_library add column sync_revision bigint not null default 0;
update public.mitv_library set sync_revision=pg_catalog.nextval('mitv_private.library_sync_revision_seq'::regclass);
create index mitv_library_owner_revision_idx on public.mitv_library(user_id,sync_revision);

create or replace function mitv_private.guard_library_timestamp()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.updated_at > pg_catalog.clock_timestamp()+interval '5 minutes' then
    new.updated_at := pg_catalog.clock_timestamp();
  end if;
  if tg_op='UPDATE' then
    if (new.user_id,new.kind,new.item_key) is distinct from (old.user_id,old.kind,old.item_key) then
      raise exception 'MITV_LIBRARY_IDENTITY_IMMUTABLE' using errcode='22023';
    end if;
    if new.updated_at <= old.updated_at then return null; end if;
  end if;
  -- Serialize writes for this owner until COMMIT. Otherwise sequence allocation
  -- alone could let a lower revision commit after a pull advanced its cursor.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text,0));
  new.sync_revision := pg_catalog.nextval('mitv_private.library_sync_revision_seq'::regclass);
  return new;
end $$;
