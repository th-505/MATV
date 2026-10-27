-- Preserve owner RLS and authenticated anonymous installations; remove raw anon
-- and non-CRUD capabilities. Service-role/backend operation is unchanged.
begin;
revoke all on public.mitv_favorites, public.mitv_watch_history from public, anon, authenticated;
grant select, insert, update, delete on public.mitv_favorites, public.mitv_watch_history to authenticated;
alter policy "Users can select own favorites" on public.mitv_favorites to authenticated;
alter policy "Users can insert own favorites" on public.mitv_favorites to authenticated;
alter policy "Users can update own favorites" on public.mitv_favorites to authenticated;
alter policy "Users can delete own favorites" on public.mitv_favorites to authenticated;
alter policy "Users can select own history" on public.mitv_watch_history to authenticated;
alter policy "Users can insert own history" on public.mitv_watch_history to authenticated;
alter policy "Users can update own history" on public.mitv_watch_history to authenticated;
alter policy "Users can delete own history" on public.mitv_watch_history to authenticated;
commit;
