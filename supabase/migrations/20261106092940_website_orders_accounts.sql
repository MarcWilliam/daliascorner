create table public.delivery_zones(id uuid primary key default gen_random_uuid(),name_en text not null,name_ar text not null,fee numeric(12,2) not null check(fee>=0),active boolean not null default true);
create table public.checkout_settings(id boolean primary key default true check(id),cash_enabled boolean not null default true,transfer_enabled boolean not null default false,transfer_instructions text not null default '');
insert into public.checkout_settings(id) values(true);
alter table public.delivery_zones enable row level security;
alter table public.checkout_settings enable row level security;
grant select on public.delivery_zones,public.checkout_settings to anon,authenticated;
grant insert,update,delete on public.delivery_zones to authenticated;
grant update on public.checkout_settings to authenticated;
grant all on public.delivery_zones,public.checkout_settings to service_role;
create policy read_zones on public.delivery_zones for select using(true);
create policy read_settings on public.checkout_settings for select using(true);
create policy admin_zones on public.delivery_zones for all to authenticated using((select public.is_admin())) with check((select public.is_admin()));
create policy admin_settings on public.checkout_settings for update to authenticated using((select public.is_admin())) with check((select public.is_admin()));
alter table public.orders add column customer_id uuid references auth.users(id) on delete set null, add column guest_token_hash text, add column delivery_fee numeric(12,2) not null default 0, add column delivery_zone text, add column payment_method text not null default 'cash' check(payment_method in ('cash','transfer')), add column transfer_instructions text, add column marketing_consent boolean not null default false;
create index orders_customer_idx on public.orders(customer_id,created_at desc);
create unique index orders_guest_token_idx on public.orders(guest_token_hash);
create policy own_orders on public.orders for select to authenticated using(customer_id=(select auth.uid()));
create policy own_items on public.order_items for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id and o.customer_id=(select auth.uid())));
create function public.create_website_order(p_key uuid,p_hash text,p_customer jsonb,p_lines jsonb,p_locale text,p_token uuid,p_zone uuid,p_payment text,p_user uuid,p_consent boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; o public.orders; z public.delivery_zones; settings public.checkout_settings; token_hash text;
begin
 if p_token is null then raise exception 'INVALID_ORDER'; end if;
 token_hash:=encode(sha256(convert_to(p_token::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(p_key::text,0));
 select * into o from public.orders where idempotency_key=p_key;
 if found then
  if o.guest_token_hash is distinct from token_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
 else
  select * into z from public.delivery_zones where id=p_zone and active for share;
  if not found then raise exception 'INVALID_DELIVERY'; end if;
  select * into settings from public.checkout_settings where id=true for share;
  if not found or p_payment is null or p_payment not in ('cash','transfer') or (p_payment='cash' and not settings.cash_enabled) or (p_payment='transfer' and (not settings.transfer_enabled or length(trim(settings.transfer_instructions))=0)) then raise exception 'INVALID_PAYMENT'; end if;
 end if;
 result:=public.create_store_order(p_key,p_hash,p_customer,p_lines,p_locale);
 if o.id is null then
  update public.orders set customer_id=p_user,guest_token_hash=token_hash,delivery_fee=z.fee,delivery_zone=case when p_locale='ar' then z.name_ar else z.name_en end,payment_method=p_payment,transfer_instructions=case when p_payment='transfer' then settings.transfer_instructions end,marketing_consent=coalesce(p_consent,false) where idempotency_key=p_key returning * into o;
 end if;
 return result||jsonb_build_object('delivery_fee',o.delivery_fee,'total',o.subtotal+o.delivery_fee,'payment_method',o.payment_method);
end $$;
revoke all on function public.create_website_order(uuid,text,jsonb,jsonb,text,uuid,uuid,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.create_website_order(uuid,text,jsonb,jsonb,text,uuid,uuid,text,uuid,boolean) to service_role;
create function public.guest_order(p_token uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('order_number',o.order_number,'status',o.status,'payment_status',o.payment_status,'subtotal',o.subtotal,'delivery_fee',o.delivery_fee,'delivery_zone',o.delivery_zone,'payment_method',o.payment_method,'transfer_instructions',o.transfer_instructions,'created_at',o.created_at,'items',(select jsonb_agg(jsonb_build_object('name_en',i.name_en,'name_ar',i.name_ar,'quantity',i.quantity,'unit_price',i.unit_price)) from public.order_items i where i.order_id=o.id)) from public.orders o where guest_token_hash=encode(sha256(convert_to(p_token::text,'UTF8')),'hex') and customer_id is null;
$$;
revoke all on function public.guest_order(uuid) from public;
grant execute on function public.guest_order(uuid) to anon,authenticated;
create function public.claim_order(p_token uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'VERIFY_EMAIL'; end if;
 update public.orders set customer_id=auth.uid() where guest_token_hash=encode(sha256(convert_to(p_token::text,'UTF8')),'hex') and (customer_id is null or customer_id=auth.uid());
 if not found then raise exception 'ORDER_NOT_AVAILABLE'; end if;
end $$;
revoke all on function public.claim_order(uuid) from public,anon;
grant execute on function public.claim_order(uuid) to authenticated;
alter table public.orders add column source_url text not null default 'https://daliascorner.com/', add column meta_context jsonb not null default '{}'::jsonb;
create table public.meta_events(id text primary key,order_id uuid not null references public.orders(id),event_name text not null,event_time timestamptz not null default now(),sent_at timestamptz,attempts integer not null default 0,locked_until timestamptz,lease_token uuid);
alter table public.meta_events enable row level security;
revoke all on public.meta_events from anon,authenticated;
grant all on public.meta_events to service_role;
create index meta_order_idx on public.meta_events(order_id);
create function public.queue_meta_sale() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.marketing_consent and new.guest_token_hash is not null then
  if old.guest_token_hash is null then insert into public.meta_events(id,order_id,event_name) values(new.id||':Lead',new.id,'Lead') on conflict do nothing; end if;
  if new.payment_status='paid' and old.payment_status is distinct from 'paid' and new.status not in ('cancelled','expired') then insert into public.meta_events(id,order_id,event_name) values(new.id||':Purchase',new.id,'Purchase') on conflict do nothing;end if;
 end if;
 return new;
end $$;
revoke all on function public.queue_meta_sale() from public,anon,authenticated;
create trigger order_meta_events after update on public.orders for each row execute function public.queue_meta_sale();
create function public.claim_meta_events() returns setof public.meta_events language sql security definer set search_path='' as $$
 update public.meta_events set attempts=attempts+1,lease_token=gen_random_uuid(),locked_until=now()+interval '5 minutes' where id in(select id from public.meta_events where sent_at is null and attempts<8 and event_time>now()-interval '6 days' and (locked_until is null or locked_until<now()) order by event_time for update skip locked limit 5) returning *;
$$;
revoke all on function public.claim_meta_events() from public,anon,authenticated;
grant execute on function public.claim_meta_events() to service_role;
create function public.revoke_order_marketing(p_token uuid) returns void language sql security definer set search_path='' as $$
 update public.orders set marketing_consent=false where guest_token_hash=encode(sha256(convert_to(p_token::text,'UTF8')),'hex') and (customer_id is null or customer_id=auth.uid());
$$;
revoke all on function public.revoke_order_marketing(uuid) from public;
grant execute on function public.revoke_order_marketing(uuid) to anon,authenticated;
create function public.revoke_customer_marketing(p_number bigint) returns void language sql security definer set search_path='' as $$
 update public.orders set marketing_consent=false where order_number=p_number and customer_id=auth.uid();
$$;
revoke all on function public.revoke_customer_marketing(bigint) from public,anon;
grant execute on function public.revoke_customer_marketing(bigint) to authenticated;
