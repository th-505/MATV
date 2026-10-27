begin;
set local lock_timeout='3s';
create table public.najd_profiles(
 user_id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default 'مشاهد نجد' check(length(display_name) between 1 and 64),
 avatar_data text not null default '' check(length(avatar_data)<=180000 and (avatar_data='' or avatar_data ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$')),
 updated_at timestamptz not null default now()
);
alter table public.najd_profiles enable row level security;
revoke all on public.najd_profiles from public,anon,authenticated;
grant select on public.najd_profiles to authenticated;
grant update(display_name,avatar_data) on public.najd_profiles to authenticated;
grant all on public.najd_profiles to service_role;
create policy najd_profile_read on public.najd_profiles for select to authenticated using((select auth.uid())=user_id);
create policy najd_profile_update on public.najd_profiles for update to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create table mitv_private.najd_account_activity(user_id uuid primary key references auth.users(id) on delete cascade,last_seen timestamptz not null default now());
create table mitv_private.najd_links(
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 token_hash bytea not null, kind text not null check(kind in('browser','device')),
 receiver_id uuid references auth.users(id) on delete cascade,receiver_label text,
 created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '3 minutes',approved_at timestamptz
);
create index najd_link_owner on mitv_private.najd_links(owner_id,created_at);
create table mitv_private.najd_library_grants(
 member_id uuid primary key references auth.users(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 grant_id uuid not null default gen_random_uuid(),created_at timestamptz not null default now(),expires_at timestamptz,
 check(member_id<>owner_id)
);
create index najd_grant_owner on mitv_private.najd_library_grants(owner_id);
create table mitv_private.najd_link_attempts(user_id uuid primary key references auth.users(id) on delete cascade,window_at timestamptz not null default now(),attempts integer not null default 0);
alter table mitv_private.najd_account_activity enable row level security;
alter table mitv_private.najd_links enable row level security;
alter table mitv_private.najd_library_grants enable row level security;
alter table mitv_private.najd_link_attempts enable row level security;
revoke all on mitv_private.najd_account_activity,mitv_private.najd_links,mitv_private.najd_library_grants,mitv_private.najd_link_attempts from public,anon,authenticated;
-- Existing users start with a full grace year; no retroactive account deletion.
insert into mitv_private.najd_account_activity(user_id) select id from auth.users;
create function mitv_private.najd_library_owner() returns uuid language sql stable security definer set search_path='' as $$
 select coalesce((select owner_id from mitv_private.najd_library_grants where member_id=auth.uid() and(expires_at is null or expires_at>now())),auth.uid())
$$;
revoke all on function mitv_private.najd_library_owner() from public,anon,authenticated;
create function public.najd_touch_account() returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); owner uuid;
begin
 if uid is null or not exists(select 1 from auth.users where id=uid) then raise exception 'NAJD_AUTH_REQUIRED'; end if;
 insert into mitv_private.najd_account_activity(user_id) values(uid) on conflict(user_id) do update set last_seen=now();
 insert into public.najd_profiles(user_id) values(uid) on conflict do nothing;
 owner:=mitv_private.najd_library_owner();
 return jsonb_build_object('owner_scope',owner,'grant_id',(select grant_id from mitv_private.najd_library_grants where member_id=uid and(expires_at is null or expires_at>now())),'expires_at',(select expires_at from mitv_private.najd_library_grants where member_id=uid and(expires_at is null or expires_at>now())));
end $$;
create function public.najd_link_create(p_kind text default 'browser') returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); token text:=encode(extensions.gen_random_bytes(24),'hex'); link mitv_private.najd_links;
begin
 if uid is null or mitv_private.najd_library_owner()<>uid then raise exception 'LINK_OWNER_REQUIRED'; end if;
 if p_kind not in('browser','device') then raise exception 'INVALID_LINK_KIND'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,117));
 if exists(select 1 from mitv_private.najd_links where owner_id=uid and created_at>now()-interval '15 seconds') then raise exception 'LINK_RATE_LIMITED'; end if;
 insert into mitv_private.najd_links(owner_id,token_hash,kind) values(uid,extensions.digest(token,'sha256'),p_kind) returning * into link;
 return jsonb_build_object('id',link.id,'token',token,'expires_at',link.expires_at);
end $$;
create function public.najd_link_claim(p_id uuid,p_token text,p_label text default 'جهاز جديد') returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); link mitv_private.najd_links; attempts integer;
begin
 if uid is null then raise exception 'NAJD_AUTH_REQUIRED'; end if;
 insert into mitv_private.najd_link_attempts(user_id,attempts) values(uid,1) on conflict(user_id) do update set attempts=case when najd_link_attempts.window_at<now()-interval '1 minute' then 1 else najd_link_attempts.attempts+1 end,window_at=case when najd_link_attempts.window_at<now()-interval '1 minute' then now() else najd_link_attempts.window_at end returning najd_link_attempts.attempts into attempts;
 if attempts>10 then return jsonb_build_object('claimed',false,'reason','LINK_RATE_LIMITED'); end if;
 select * into link from mitv_private.najd_links where id=p_id for update;
 if link.id is null or link.expires_at<=clock_timestamp() or link.approved_at is not null or length(p_token)<>48 or link.token_hash<>extensions.digest(p_token,'sha256') or link.owner_id=uid or (link.receiver_id is not null and link.receiver_id<>uid) then return jsonb_build_object('claimed',false,'reason','LINK_INVALID_OR_EXPIRED'); end if;
 update mitv_private.najd_links set receiver_id=uid,receiver_label=left(p_label,80) where id=p_id;
 return jsonb_build_object('claimed',true,'awaiting_approval',true);
end $$;
create function public.najd_link_status(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare link mitv_private.najd_links; uid uuid:=auth.uid();
begin
 select * into link from mitv_private.najd_links where id=p_id and (owner_id=uid or receiver_id=uid);
 if uid is null or link.id is null then raise exception 'LINK_NOT_OWNED'; end if;
 return jsonb_build_object('claimed',link.receiver_id is not null,'receiver_label',link.receiver_label,'approved',link.approved_at is not null,'expired',link.expires_at<=clock_timestamp(),'kind',link.kind);
end $$;
create function public.najd_link_approve(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); link mitv_private.najd_links;
begin
 select * into link from mitv_private.najd_links where id=p_id and owner_id=uid for update;
 if uid is null or link.id is null or link.receiver_id is null or link.approved_at is not null or link.expires_at<=clock_timestamp() then raise exception 'LINK_NOT_APPROVABLE'; end if;
 -- No delegation chains: only the current owner can approve a device.
 if mitv_private.najd_library_owner()<>uid or exists(select 1 from mitv_private.najd_library_grants where owner_id=link.receiver_id and(expires_at is null or expires_at>now())) then raise exception 'LINK_OWNER_CONFLICT'; end if;
 insert into mitv_private.najd_library_grants(member_id,owner_id,expires_at) values(link.receiver_id,uid,case when link.kind='device' then now()+interval '7 days' else null end)
 on conflict(member_id) do update set owner_id=excluded.owner_id,expires_at=excluded.expires_at,grant_id=gen_random_uuid(),created_at=now();
 update mitv_private.najd_links set approved_at=clock_timestamp(),token_hash=extensions.digest(encode(extensions.gen_random_bytes(24),'hex'),'sha256') where id=p_id;
 return jsonb_build_object('linked',true,'temporary',link.kind='device');
end $$;
create function public.najd_link_revoke(p_member uuid default null) returns boolean language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
 if uid is null then raise exception 'NAJD_AUTH_REQUIRED'; end if;
 delete from mitv_private.najd_library_grants where (member_id=uid and p_member is null) or(owner_id=uid and member_id=p_member);
 return found;
end $$;
-- Controlled library RPCs share logical data; real Auth sessions remain separate.
create function public.najd_pull_library(p_after bigint default 0,p_limit integer default 250) returns setof jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); owner uuid;
begin
 if uid is null or not exists(select 1 from auth.users where id=uid) then raise exception 'NAJD_AUTH_REQUIRED'; end if;
 owner:=mitv_private.najd_library_owner();
 return query select to_jsonb(l)||jsonb_build_object('user_id',uid) from public.mitv_library l where l.user_id=owner and l.sync_revision>greatest(0,p_after) order by l.sync_revision limit least(greatest(p_limit,1),250);
end $$;
create function public.najd_upsert_library(rows jsonb) returns setof jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); owner uuid; entry jsonb; stamp timestamptz;
begin
 if uid is null or not exists(select 1 from auth.users where id=uid) then raise exception 'NAJD_AUTH_REQUIRED'; end if;
 owner:=mitv_private.najd_library_owner();
 if rows is null or jsonb_typeof(rows)<>'array' or jsonb_array_length(rows)>32 then raise exception 'MITV_LIBRARY_BATCH_LIMIT'; end if;
 for entry in select value from jsonb_array_elements(rows) loop
  if entry ? 'user_id' and (entry->>'user_id')::uuid<>uid then raise exception 'MITV_LIBRARY_OWNER_REQUIRED'; end if;
  stamp:=least(coalesce((entry->>'updated_at')::timestamptz,clock_timestamp()),clock_timestamp()+interval '5 minutes');
  insert into public.mitv_library as l(user_id,kind,item_key,metadata,updated_at,deleted) values(owner,entry->>'kind',entry->>'item_key',coalesce(entry->'metadata','{}'),stamp,coalesce((entry->>'deleted')::boolean,false))
  on conflict(user_id,kind,item_key) do update set metadata=excluded.metadata,updated_at=excluded.updated_at,deleted=excluded.deleted where excluded.updated_at>l.updated_at;
 end loop;
 return query select to_jsonb(l)||jsonb_build_object('user_id',uid) from public.mitv_library l where l.user_id=owner and exists(select 1 from jsonb_array_elements(rows) e where e->>'kind'=l.kind and e->>'item_key'=l.item_key);
end $$;
create function mitv_private.najd_expire_accounts() returns integer language plpgsql security definer set search_path='' as $$
declare removed integer;
begin
 delete from auth.users u using mitv_private.najd_account_activity a where u.id=a.user_id and u.is_anonymous and greatest(a.last_seen,coalesce(u.last_sign_in_at,u.created_at))<now()-interval '1 year';
 get diagnostics removed=row_count;
 delete from mitv_private.najd_links where expires_at<now()-interval '1 day';
 delete from mitv_private.najd_library_grants where expires_at<=now();
 return removed;
end $$;
revoke all on function mitv_private.najd_expire_accounts() from public,anon,authenticated;
grant execute on function mitv_private.najd_expire_accounts() to service_role;
do $$declare f text;begin
 foreach f in array array['najd_touch_account()','najd_link_create(text)','najd_link_claim(uuid,text,text)','najd_link_status(uuid)','najd_link_approve(uuid)','najd_link_revoke(uuid)','najd_pull_library(bigint,integer)','najd_upsert_library(jsonb)'] loop
  execute 'revoke all on function public.'||f||' from public,anon';
  execute 'grant execute on function public.'||f||' to authenticated';
 end loop;
end $$;
select cron.schedule('najd-account-yearly-expiry','20 0 * * *','select mitv_private.najd_expire_accounts()');
commit;
