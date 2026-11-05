-- Bounded cleanup on existing foreground heartbeats and sends; no global scanner.
create or replace function public.najd_playback_send(p_target uuid,p_payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
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
 delete from mitv_private.najd_playback_transfers where id in (select id from mitv_private.najd_playback_transfers where target_id=p_target and expires_at<now() limit 128);
 update mitv_private.najd_playback_transfers set state='declined' where target_id=p_target and state='pending';
 insert into mitv_private.najd_playback_transfers(owner_id,sender_id,target_id,payload) values(current_owner,auth.uid(),p_target,p_payload) returning id into transfer_id;
 return transfer_id;
end $$;

create or replace function public.najd_playback_inbox() returns setof jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then return; end if;
 update mitv_private.najd_playback_devices set last_seen=now() where user_id=auth.uid() and last_seen<now()-interval '45 seconds';
 if found then
  delete from mitv_private.najd_playback_transfers where id in (select id from mitv_private.najd_playback_transfers where target_id=auth.uid() and expires_at<now() limit 128);
 end if;
 return query select jsonb_build_object('id',t.id,'payload',t.payload,'expires_at',t.expires_at)
 from mitv_private.najd_playback_transfers t
 where t.target_id=auth.uid() and t.owner_id=mitv_private.najd_library_owner() and t.state='pending' and t.expires_at>now()
 and exists(select 1 from mitv_private.najd_playback_devices d where d.user_id=auth.uid() and d.target in ('tv','desktop','web'))
 and exists(select 1 from auth.users u where u.id=auth.uid())
 order by t.created_at desc limit 1;
end $$;
