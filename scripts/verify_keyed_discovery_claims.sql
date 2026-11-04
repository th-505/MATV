-- Run only after najd_keyed_interactive_claims is applied. All fixture rows roll back.
begin;
set local statement_timeout='8s';
set local lock_timeout='2s';
do $$
declare
 prefix text := 'verify-keyed-202-' || pg_catalog.txid_current()::text || '-';
 keys text[];
 worker uuid := pg_catalog.gen_random_uuid();
 claimed integer;
begin
 if pg_catalog.has_function_privilege('anon','public.najd_claim_known_jobs(uuid,integer,text,text[])','EXECUTE')
  or pg_catalog.has_function_privilege('authenticated','public.najd_claim_known_jobs(uuid,integer,text,text[])','EXECUTE')
  or not pg_catalog.has_function_privilege('service_role','public.najd_claim_known_jobs(uuid,integer,text,text[])','EXECUTE')
 then raise exception 'Keyed claims RPC permissions are incorrect'; end if;
 select array_agg(prefix || n) into keys from generate_series(1,21) n;
 insert into public.matv_discovery_jobs(job_key,content_ref,title,provider,stage,payload,priority,status,refresh_after)
 select key,'tmdb:tv:999999999','Temporary claim verification','fixture','provider','{"phase":"search"}'::jsonb,10,'queued',now()-interval '1 second'
 from unnest(keys) key;
 select count(*) into claimed from public.najd_claim_known_jobs(worker,99,'index',keys);
 if claimed<>0 then raise exception 'Index lane claimed search fixtures'; end if;
 select count(*) into claimed from public.najd_claim_known_jobs(worker,99,'search',keys);
 if claimed<>20 then raise exception 'Expected exactly 20 claims; got %',claimed; end if;
 select count(*) into claimed from public.matv_discovery_jobs where job_key=any(keys) and status='running' and worker_id=worker;
 if claimed<>20 then raise exception 'Expected 20 persisted worker leases; got %',claimed; end if;
 select count(*) into claimed from public.matv_discovery_jobs where job_key=any(keys) and status='queued';
 if claimed<>1 then raise exception 'Lane capacity did not retain the twenty-first job'; end if;
end;
$$;
select '20 durable claims; wrong lane rejected; permissions verified; fixture writes rolled back' as verified;
rollback;
