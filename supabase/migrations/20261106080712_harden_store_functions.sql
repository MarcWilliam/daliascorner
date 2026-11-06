-- Internal platform event-trigger helper must not be exposed as a public RPC.
do $$ begin
 if to_regprocedure('public.rls_auto_enable()') is not null then
   revoke all on function public.rls_auto_enable() from public, anon, authenticated;
 end if;
end $$;
-- Admin membership is intentionally deny-all to clients; never self-enrollable.
-- Public availability intentionally returns only product ID, count and price.
-- Admin mutation RPCs check is_admin() internally before any privileged write.
