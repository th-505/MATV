begin;
do $qa$
declare qa_owner uuid; qa_member uuid; qa_outsider uuid; ticket jsonb; result jsonb; mode text; found integer;
begin
 if has_function_privilege('anon','public.najd_upsert_library(jsonb)','EXECUTE') then raise exception 'QA_ANON_RPC_EXPOSED'; end if;
 foreach mode in array array['browser','device'] loop
  qa_owner:=gen_random_uuid(); qa_member:=gen_random_uuid(); qa_outsider:=gen_random_uuid();
  insert into auth.users(id,is_anonymous) values(qa_owner,true),(qa_member,true),(qa_outsider,true);
  perform set_config('request.jwt.claim.sub',qa_owner::text,true);
  perform public.najd_touch_account();
  perform public.najd_upsert_library(jsonb_build_array(
   jsonb_build_object('kind','favorite','item_key','tmdb:movie:603','metadata',jsonb_build_object('title','Najd rollback QA'),'updated_at',clock_timestamp()),
   jsonb_build_object('kind','history','item_key','qa-history','metadata',jsonb_build_object('position_ms',1200000,'duration_ms',3600000),'updated_at',clock_timestamp())));
  ticket:=public.najd_link_create(mode);
  perform set_config('request.jwt.claim.sub',qa_member::text,true);
  result:=public.najd_link_claim((ticket->>'id')::uuid,ticket->>'token','Najd beta rollback QA');
  if result->>'claimed'<>'true' then raise exception 'QA_CLAIM_FAILED'; end if;
  perform set_config('request.jwt.claim.sub',qa_owner::text,true);
  result:=public.najd_link_approve((ticket->>'id')::uuid);
  if result->>'linked'<>'true' then raise exception 'QA_APPROVAL_FAILED'; end if;
  perform set_config('request.jwt.claim.sub',qa_member::text,true);
  result:=public.najd_touch_account();
  if result->>'owner_scope'<>qa_owner::text then raise exception 'QA_OWNER_SCOPE_FAILED'; end if;
  if mode='browser' and result->>'expires_at' is not null then raise exception 'QA_PERMANENT_EXPIRY_FAILED'; end if;
  if mode='device' and ((result->>'expires_at') is null or (result->>'expires_at')::timestamptz not between now()+interval '6 days 23 hours' and now()+interval '7 days 1 hour') then raise exception 'QA_WEEKLY_EXPIRY_FAILED'; end if;
  select count(*) into found from public.najd_pull_library(0,250) as p(value) where value->>'user_id'=qa_member::text and value->>'kind' in ('favorite','history');
  if found<>2 then raise exception 'QA_SHARED_LIBRARY_PULL_FAILED'; end if;
  perform public.najd_upsert_library(jsonb_build_array(jsonb_build_object('kind','history','item_key','qa-history','metadata',jsonb_build_object('position_ms',1260000),'updated_at',clock_timestamp()+interval '1 second')));
  perform set_config('request.jwt.claim.sub',qa_owner::text,true);
  select count(*) into found from public.najd_pull_library(0,250) as p(value) where value->>'kind'='history' and value->'metadata'->>'position_ms'='1260000';
  if found<>1 then raise exception 'QA_BIDIRECTIONAL_PROGRESS_FAILED'; end if;
  perform set_config('request.jwt.claim.sub',qa_outsider::text,true);
  select count(*) into found from public.najd_pull_library(0,250);
  if found<>0 then raise exception 'QA_LIBRARY_ISOLATION_FAILED'; end if;
  perform set_config('request.jwt.claim.sub',qa_owner::text,true);
  perform public.najd_link_revoke(qa_member);
  perform set_config('request.jwt.claim.sub',qa_member::text,true);
  result:=public.najd_touch_account();
  if result->>'owner_scope'<>qa_member::text then raise exception 'QA_REVOCATION_SCOPE_FAILED'; end if;
  select count(*) into found from public.najd_pull_library(0,250);
  if found<>0 then raise exception 'QA_REVOKED_LIBRARY_VISIBLE'; end if;
 end loop;
end $qa$;
rollback;
