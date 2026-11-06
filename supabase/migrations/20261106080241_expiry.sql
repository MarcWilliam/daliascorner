create extension if not exists pg_cron;
select cron.schedule('expire-store-orders','*/5 * * * *','select public.expire_pending_orders()');
