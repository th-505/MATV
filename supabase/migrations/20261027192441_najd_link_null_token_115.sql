-- Reject SQL NULL explicitly; three-valued comparisons must never skip token validation.
begin;
create or replace function public.najd_link_claim(p_id uuid,p_token text,p_label text default 'جهاز جديد') returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); link mitv_private.najd_links; attempts integer;
begin
 if uid is null then raise exception 'NAJD_AUTH_REQUIRED'; end if;
 insert into mitv_private.najd_link_attempts(user_id,attempts) values(uid,1) on conflict(user_id) do update set attempts=case when najd_link_attempts.window_at<now()-interval '1 minute' then 1 else najd_link_attempts.attempts+1 end,window_at=case when najd_link_attempts.window_at<now()-interval '1 minute' then now() else najd_link_attempts.window_at end returning najd_link_attempts.attempts into attempts;
 if attempts>10 then return jsonb_build_object('claimed',false,'reason','LINK_RATE_LIMITED'); end if;
 select * into link from mitv_private.najd_links where id=p_id for update;
 if link.id is null or link.expires_at<=clock_timestamp() or link.approved_at is not null or p_token is null or length(p_token)<>48 or link.token_hash<>extensions.digest(p_token,'sha256') or link.owner_id=uid or (link.receiver_id is not null and link.receiver_id<>uid) then return jsonb_build_object('claimed',false,'reason','LINK_INVALID_OR_EXPIRED'); end if;
 update mitv_private.najd_links set receiver_id=uid,receiver_label=left(p_label,80) where id=p_id;
 return jsonb_build_object('claimed',true,'awaiting_approval',true);
end $$;
revoke all on function public.najd_link_claim(uuid,text,text) from public,anon;
grant execute on function public.najd_link_claim(uuid,text,text) to authenticated;
commit;
