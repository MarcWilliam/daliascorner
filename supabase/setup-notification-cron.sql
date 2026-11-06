-- Run AFTER adding store_function_url and store_notify_secret in Supabase Vault.
-- store_function_url = https://YOUR_PROJECT.supabase.co/functions/v1/notify-admin
-- store_notify_secret = the same random secret set as NOTIFY_SECRET on the function.
create extension if not exists pg_net with schema extensions;
select cron.schedule('notify-store-admin','* * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'store_function_url'),
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'store_notify_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  ) where exists(select 1 from public.admin_notifications where sent_at is null and attempts < 8 and (locked_until is null or locked_until < now()));
$job$);
