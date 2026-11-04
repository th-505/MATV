create or replace function public.najd_work_reference(p_ref text)
returns text language plpgsql stable strict security invoker set search_path='' as $$
declare provider_id text;
begin
 if pg_catalog.octet_length(p_ref)>1536 or p_ref ~ '[[:space:][:cntrl:]]' then return null; end if;
 if p_ref ~ '^tmdb:(movie|tv):[1-9][0-9]{0,9}$' then return p_ref; end if;
 provider_id := pg_catalog.split_part(p_ref, ':', case when p_ref like 'source:%' then 2 else 1 end);
 if not exists(select 1 from public.najd_provider_registry r where r.provider=provider_id) then return null; end if;
 if p_ref like 'source:%' then
  if p_ref ~ '^source:[a-z0-9][a-z0-9_-]{1,29}:[a-f0-9]{24}$' then return p_ref; end if;
  return null;
 end if;
 if pg_catalog.length(p_ref)<=pg_catalog.length(provider_id)+1 then return null; end if;
 return 'source:'||provider_id||':'||pg_catalog.substr(pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_ref,'UTF8')),'hex'),1,24);
end $$;
revoke all on function public.najd_work_reference(text) from public,anon,authenticated;
grant execute on function public.najd_work_reference(text) to authenticated,service_role;
