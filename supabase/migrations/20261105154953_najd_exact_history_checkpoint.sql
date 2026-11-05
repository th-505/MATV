-- Point lookup keeps a linked TV's resume independent of full-library pagination.
-- The authenticated member's active grant determines the owner; no owner ID is accepted.
create function public.najd_history_checkpoint(p_item_key text)
returns setof jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(l)||jsonb_build_object('user_id',auth.uid())
 from public.mitv_library l
 where auth.uid() is not null
  and exists(select 1 from auth.users u where u.id=auth.uid())
  and octet_length(p_item_key) between 1 and 1536
  and l.user_id=mitv_private.najd_library_owner()
  and l.kind='history' and l.item_key=p_item_key
 limit 1;
$$;
revoke all on function public.najd_history_checkpoint(text) from public,anon;
grant execute on function public.najd_history_checkpoint(text) to authenticated,service_role;
