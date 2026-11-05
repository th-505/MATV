create table mitv_private.najd_playback_devices (
 user_id uuid primary key references auth.users(id) on delete cascade,
 target text not null check (target in ('mobile','ios','tv','desktop','web')),
 label text not null check (length(label) between 1 and 80),
 last_seen timestamptz not null default now()
);
create table mitv_private.najd_playback_transfers (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 sender_id uuid not null references auth.users(id) on delete cascade,
 target_id uuid not null references auth.users(id) on delete cascade,
 payload jsonb not null check (jsonb_typeof(payload)='object' and octet_length(payload::text)<=16384 and mitv_private.metadata_is_safe(payload)),
 state text not null default 'pending' check (state in ('pending','accepted','declined')),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '2 minutes'
);
create index najd_playback_inbox_idx on mitv_private.najd_playback_transfers(target_id,created_at desc) where state='pending';
create index najd_playback_sender_time_idx on mitv_private.najd_playback_transfers(sender_id,created_at desc);
create index najd_playback_expiry_idx on mitv_private.najd_playback_transfers(target_id,expires_at);
alter table mitv_private.najd_playback_devices enable row level security;
alter table mitv_private.najd_playback_transfers enable row level security;
revoke all on mitv_private.najd_playback_devices,mitv_private.najd_playback_transfers from public,anon,authenticated;

create function public.najd_playback_register(p_target text,p_label text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid()) then raise exception 'AUTH_REQUIRED'; end if;
 if p_target not in ('mobile','ios','tv','desktop','web') or length(p_label) not between 1 and 80 then raise exception 'INVALID_DEVICE'; end if;
 insert into mitv_private.najd_playback_devices(user_id,target,label) values(auth.uid(),p_target,p_label)
 on conflict(user_id) do update set target=excluded.target,label=excluded.label,last_seen=now();
 delete from mitv_private.najd_playback_transfers where id in (select id from mitv_private.najd_playback_transfers where target_id=auth.uid() and expires_at<now()-interval '1 day' limit 128);
end $$;

create function public.najd_playback_targets() returns setof jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',d.user_id,'label',d.label,'target',d.target,'online',d.last_seen>now()-interval '90 seconds')
 from mitv_private.najd_playback_devices d
 where auth.uid() is not null and d.user_id<>auth.uid() and d.target in ('tv','desktop','web')
 and exists(select 1 from auth.users u where u.id=d.user_id)
 and coalesce((select g.owner_id from mitv_private.najd_library_grants g where g.member_id=d.user_id and(g.expires_at is null or g.expires_at>now())),d.user_id)=mitv_private.najd_library_owner()
 order by d.last_seen desc limit 32;
$$;

create function public.najd_playback_send(p_target uuid,p_payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare current_owner uuid:=mitv_private.najd_library_owner(); transfer_id uuid;
begin
 if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid()) then raise exception 'AUTH_REQUIRED'; end if;
 if not exists(select 1 from mitv_private.najd_playback_devices where user_id=auth.uid() and target<>'tv') then raise exception 'TV_RECEIVER_ONLY'; end if;
 if p_target=auth.uid() or not exists(select 1 from mitv_private.najd_playback_devices d where d.user_id=p_target and d.target in ('tv','desktop','web') and coalesce((select g.owner_id from mitv_private.najd_library_grants g where g.member_id=d.user_id and(g.expires_at is null or g.expires_at>now())),d.user_id)=current_owner) then raise exception 'TARGET_NOT_LINKED'; end if;
 if jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>16384 or not mitv_private.metadata_is_safe(p_payload)
 or coalesce(length(p_payload->>'content_ref'),0) not between 1 and 1536
 or coalesce(p_payload->>'position_ms','') !~ '^[0-9]{1,9}$'
 or (p_payload->>'position_ms')::bigint>604800000 then raise exception 'INVALID_PLAYBACK_REQUEST'; end if;
 if exists(select 1 from mitv_private.najd_playback_transfers where sender_id=auth.uid() and created_at>now()-interval '3 seconds') then raise exception 'PLAYBACK_SEND_COOLDOWN'; end if;
 update mitv_private.najd_playback_transfers set state='declined' where target_id=p_target and state='pending';
 insert into mitv_private.najd_playback_transfers(owner_id,sender_id,target_id,payload) values(current_owner,auth.uid(),p_target,p_payload) returning id into transfer_id;
 return transfer_id;
end $$;

create function public.najd_playback_inbox() returns setof jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then return; end if;
 update mitv_private.najd_playback_devices set last_seen=now() where user_id=auth.uid() and last_seen<now()-interval '45 seconds';
 return query select jsonb_build_object('id',t.id,'payload',t.payload,'expires_at',t.expires_at)
 from mitv_private.najd_playback_transfers t
 where t.target_id=auth.uid() and t.owner_id=mitv_private.najd_library_owner() and t.state='pending' and t.expires_at>now()
 and exists(select 1 from mitv_private.najd_playback_devices d where d.user_id=auth.uid() and d.target in ('tv','desktop','web'))
 and exists(select 1 from auth.users u where u.id=auth.uid())
 order by t.created_at desc limit 1;
end $$;

create function public.najd_playback_ack(p_id uuid,p_accept boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 update mitv_private.najd_playback_transfers set state=case when p_accept then 'accepted' else 'declined' end
 where id=p_id and target_id=auth.uid() and owner_id=mitv_private.najd_library_owner() and state='pending' and expires_at>now();
 if not found then raise exception 'PLAYBACK_REQUEST_EXPIRED'; end if;
end $$;
revoke all on function public.najd_playback_register(text,text),public.najd_playback_targets(),public.najd_playback_send(uuid,jsonb),public.najd_playback_inbox(),public.najd_playback_ack(uuid,boolean) from public,anon;
grant execute on function public.najd_playback_register(text,text),public.najd_playback_targets(),public.najd_playback_send(uuid,jsonb),public.najd_playback_inbox(),public.najd_playback_ack(uuid,boolean) to authenticated,service_role;
