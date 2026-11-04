-- Beta indexes and settings are independent from canonical/TMDB caches and owner libraries.
create table public.najd_beta_catalog(
 ref text primary key check(ref ~ '^source:[a-z0-9][a-z0-9_-]{1,29}:[a-f0-9]{24}$'),
 provider text not null check(provider ~ '^[a-z0-9][a-z0-9_-]{1,29}$'),
 alias_refs text[] not null default '{}',
 document jsonb not null check(jsonb_typeof(document)='object' and pg_column_size(document)<=4194304),
 updated_at timestamptz not null default now(),expires_at timestamptz not null
);
create index najd_beta_catalog_aliases on public.najd_beta_catalog using gin(alias_refs);
create index najd_beta_catalog_expiry on public.najd_beta_catalog(expires_at);
alter table public.najd_beta_catalog enable row level security;
revoke all on public.najd_beta_catalog from public,anon,authenticated;
grant select,insert,update,delete on public.najd_beta_catalog to service_role;
create table public.najd_beta_provider_config(
 provider text primary key check(provider ~ '^[a-z0-9][a-z0-9_-]{1,29}$'),
 revision bigint not null default 1 check(revision>0),enabled boolean not null default true,
 config jsonb not null default '{}' check(jsonb_typeof(config)='object' and pg_column_size(config)<=8192),
 updated_at timestamptz not null default now()
);
alter table public.najd_beta_provider_config enable row level security;
revoke all on public.najd_beta_provider_config from public,anon,authenticated;
grant select,insert,update,delete on public.najd_beta_provider_config to service_role;
create function public.najd_set_beta_provider_config(p_provider text,p_config jsonb,p_revision bigint)
returns setof public.najd_beta_provider_config language plpgsql security invoker set search_path='' as $$
begin
 if p_revision<0 or p_revision is null then raise exception 'INVALID_REVISION'; end if;
 if p_revision=0 then
  return query insert into public.najd_beta_provider_config(provider,config) values(p_provider,p_config) on conflict do nothing returning *;
 else
  return query update public.najd_beta_provider_config set config=p_config,revision=revision+1,updated_at=now() where provider=p_provider and revision=p_revision returning *;
 end if;
 if not found then raise exception 'CONFIG_REVISION_CONFLICT'; end if;
end;
$$;
revoke all on function public.najd_set_beta_provider_config(text,jsonb,bigint) from public,anon,authenticated;
grant execute on function public.najd_set_beta_provider_config(text,jsonb,bigint) to service_role;
