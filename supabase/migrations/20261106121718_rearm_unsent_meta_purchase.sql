-- A payment corrected/refunded before dispatch must not leave its later genuine
-- re-payment permanently suppressed. Keep the event ID stable for Meta deduplication.
create or replace function public.queue_meta_sale() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.marketing_consent and new.guest_token_hash is not null then
  if old.guest_token_hash is null then
   insert into public.meta_events(id,order_id,event_name)
    values(new.id||':Lead',new.id,'Lead') on conflict do nothing;
  end if;
  if new.payment_status='paid' and old.payment_status is distinct from 'paid'
     and new.status not in ('cancelled','expired') then
   insert into public.meta_events as queued(id,order_id,event_name)
    values(new.id||':Purchase',new.id,'Purchase')
   on conflict(id) do update set attempts=0,locked_until=null,lease_token=null,event_time=now()
    where queued.sent_at is null;
  end if;
 end if;
 return new;
end $$;
revoke all on function public.queue_meta_sale() from public,anon,authenticated;
