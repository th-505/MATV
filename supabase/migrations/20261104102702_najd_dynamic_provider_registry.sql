-- Provider identifiers are public metadata; only the server can register them.
-- No user rows, compatibility identifiers or existing provider references are changed.
create table public.najd_provider_registry (
 provider text primary key check (provider ~ '^[a-z0-9][a-z0-9_-]{1,29}$')
);
alter table public.najd_provider_registry enable row level security;
revoke all on public.najd_provider_registry from public, anon, authenticated;
grant select on public.najd_provider_registry to authenticated;
grant all on public.najd_provider_registry to service_role;
create policy najd_provider_ids_read on public.najd_provider_registry
 for select to authenticated using (true);
insert into public.najd_provider_registry(provider) values
('3ck'),
('3cktv'),
('3isk'),
('ahwak'),
('akoam'),
('akwam'),
('alooy'),
('anime4up'),
('anime4up_rest'),
('arabseed'),
('brstej'),
('cimanow'),
('egydead'),
('egydead_live'),
('fosta'),
('ipauniverse'),
('laroza'),
('legacy'),
('mewsry'),
('moviz'),
('moviztime'),
('mycima'),
('qfilm'),
('ristoanime'),
('shahid4u'),
('shii4u'),
('wecima'),
('witanime'),
('yallashoot')
on conflict do nothing;

create or replace function public.najd_work_reference(p_ref text)
returns text language plpgsql stable strict security invoker set search_path='' as $$
declare provider text;
begin
 if pg_catalog.octet_length(p_ref)>1536 or p_ref ~ '[[:space:][:cntrl:]]' then return null; end if;
 if p_ref ~ '^tmdb:(movie|tv):[1-9][0-9]{0,9}$' then return p_ref; end if;
 provider := pg_catalog.split_part(p_ref, ':', case when p_ref like 'source:%' then 2 else 1 end);
 if not exists(select 1 from public.najd_provider_registry r where r.provider=provider) then return null; end if;
 if p_ref like 'source:%' then
  if p_ref ~ '^source:[a-z0-9][a-z0-9_-]{1,29}:[a-f0-9]{24}$' then return p_ref; end if;
  return null;
 end if;
 if pg_catalog.length(p_ref)<=pg_catalog.length(provider)+1 then return null; end if;
 return 'source:'||provider||':'||pg_catalog.substr(pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_ref,'UTF8')),'hex'),1,24);
end $$;
revoke all on function public.najd_work_reference(text) from public,anon,authenticated;
grant execute on function public.najd_work_reference(text) to authenticated,service_role;
