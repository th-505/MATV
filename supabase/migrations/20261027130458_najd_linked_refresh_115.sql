begin;
create or replace function public.najd_refresh_favorite(p_ref text) returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=mitv_private.najd_library_owner(); slot mitv_private.najd_refresh_cooldowns; delay_seconds integer;
begin
 if owner_id is null or p_ref !~ '^tmdb:(movie|tv):[0-9]+$' then raise exception 'AUTH_OR_REFERENCE_INVALID'; end if;
 if not exists(select 1 from public.mitv_library where user_id=owner_id and kind='favorite' and not deleted and item_key=p_ref) then raise exception 'FAVORITE_NOT_OWNED'; end if;
 insert into mitv_private.najd_refresh_cooldowns(user_id,work_ref) values(owner_id,p_ref) on conflict do nothing;
 select * into slot from mitv_private.najd_refresh_cooldowns where user_id=owner_id and work_ref=p_ref for update;
 if slot.next_allowed_at>clock_timestamp() then return jsonb_build_object('queued',false,'retry_after',ceil(extract(epoch from(slot.next_allowed_at-clock_timestamp())))::integer); end if;
 delay_seconds:=least(60,(case when slot.requested_at<now()-interval '10 minutes' then 1 else slot.tier+1 end)*10);
 update mitv_private.najd_refresh_cooldowns set tier=delay_seconds/10,requested_at=clock_timestamp(),next_allowed_at=clock_timestamp()+make_interval(secs=>delay_seconds) where user_id=owner_id and work_ref=p_ref;
 insert into public.matv_discovery_jobs(job_key,content_ref,title,stage,priority,status,refresh_after)
 values(p_ref||':work',p_ref,'تحديث المفضلة','work',10,'queued',now())
 on conflict(job_key) do update set status=case when public.matv_discovery_jobs.status='running' then 'running' else 'queued' end,attempts=case when public.matv_discovery_jobs.status='running' then public.matv_discovery_jobs.attempts else 0 end,refresh_after=now(),last_activity_at=now(),updated_at=now();
 perform mitv_private.najd_wake();
 return jsonb_build_object('queued',true,'retry_after',delay_seconds);
end $$;
revoke all on function public.najd_refresh_favorite(text) from public,anon;
grant execute on function public.najd_refresh_favorite(text) to authenticated;

create function public.najd_link_members() returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); result jsonb;
begin
 if uid is null then raise exception 'NAJD_AUTH_REQUIRED'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('member_id',g.member_id,'display_name',coalesce(p.display_name,'جهاز نجد'),'expires_at',g.expires_at)),'[]') into result from mitv_private.najd_library_grants g left join public.najd_profiles p on p.user_id=g.member_id where g.owner_id=uid and(g.expires_at is null or g.expires_at>now());
 return result;
end $$;
revoke all on function public.najd_link_members() from public,anon;
grant execute on function public.najd_link_members() to authenticated;
commit;
