-- Keep the existing postgres-owned auto-RLS event trigger, but remove client RPC grants.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
