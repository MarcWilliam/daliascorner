-- Browser writes use UUID/text keys or checked SECURITY DEFINER RPCs. Clients
-- must not inspect, advance or reset order numbers and internal audit IDs.
revoke all on all sequences in schema public from public,anon,authenticated;

-- Verified migration connection: postgres owns the app sequences and can alter
-- its own defaults. Preserve its owner/service_role privileges and revoke only
-- client/PUBLIC defaults for sequences created by future postgres migrations.
alter default privileges for role postgres in schema public
 revoke all on sequences from public,anon,authenticated;

-- Hosted postgres is not a member of supabase_admin. Its separate platform
-- sequence defaults are intentionally unchanged: future sequences created by
-- that role must receive an explicit client/PUBLIC REVOKE in their migration.
