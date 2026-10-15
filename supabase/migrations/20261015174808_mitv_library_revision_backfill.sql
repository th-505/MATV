-- Preserve mutation timestamps when upgrading a database with existing rows.
alter table public.mitv_library disable trigger mitv_library_timestamp;
update public.mitv_library set sync_revision=pg_catalog.nextval('mitv_private.library_sync_revision_seq'::regclass) where sync_revision=0;
alter table public.mitv_library enable trigger mitv_library_timestamp;
alter table public.mitv_library add constraint mitv_library_positive_revision check(sync_revision>0);
