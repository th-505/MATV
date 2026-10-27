begin;
create function public.najd_apply_provider_config(p_provider text,p_config jsonb,p_expected bigint) returns jsonb language plpgsql security invoker set search_path='' as $$
declare current_revision bigint; next_revision bigint;
begin
 if p_provider !~ '^[a-z0-9][a-z0-9_-]{1,29}$' or p_config is null or jsonb_typeof(p_config)<>'object' or pg_column_size(p_config)>16384 or p_expected<0 then raise exception 'INVALID_PROVIDER_CONFIG'; end if;
 if exists(select 1 from jsonb_each(p_config) entry where entry.key not in('primary_domain','search_path','search_parameter','search_method','card_selector','title_selector','link_selector','poster_selector','year_selector','default_type') or jsonb_typeof(entry.value)<>'string') then raise exception 'INVALID_PROVIDER_CONFIG'; end if;
 perform pg_advisory_xact_lock(hashtextextended('najd-provider-'||p_provider,115));
 select revision into current_revision from public.najd_provider_config where provider=p_provider for update;
 if coalesce(current_revision,0) is distinct from p_expected then raise exception 'PROVIDER_REVISION_CONFLICT'; end if;
 next_revision:=coalesce(current_revision,0)+1;
 insert into public.najd_provider_config(provider,revision,config) values(p_provider,next_revision,p_config)
 on conflict(provider) do update set revision=excluded.revision,config=excluded.config,updated_at=now();
 return jsonb_build_object('provider',p_provider,'revision',next_revision,'applied',true);
end $$;
revoke all on function public.najd_apply_provider_config(text,jsonb,bigint) from public,anon,authenticated;
grant execute on function public.najd_apply_provider_config(text,jsonb,bigint) to service_role;
-- New anonymous registrations that never open the app also age out after a year.
create or replace function mitv_private.najd_expire_accounts() returns integer language plpgsql security definer set search_path='' as $$
declare removed integer;
begin
 delete from auth.users u where u.is_anonymous and greatest(coalesce((select a.last_seen from mitv_private.najd_account_activity a where a.user_id=u.id),u.created_at),coalesce(u.last_sign_in_at,u.created_at))<now()-interval '1 year';
 get diagnostics removed=row_count;
 delete from mitv_private.najd_links where expires_at<now()-interval '1 day';
 delete from mitv_private.najd_library_grants where expires_at<=now();
 return removed;
end $$;
commit;
