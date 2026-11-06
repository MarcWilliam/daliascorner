-- All order/stock writes go through checked functions, never browser table writes.
create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admin_users enable row level security;
create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.admin_users where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create table public.inventory (
  product_id text primary key,
  name_en text not null,
  name_ar text not null,
  price numeric(12,2) not null check (price >= 0),
  on_hand integer not null default 0 check (on_hand >= 0),
  reserved integer not null default 0 check (reserved >= 0 and reserved <= on_hand),
  low_stock_threshold integer not null default 3 check (low_stock_threshold >= 0),
  active boolean not null default true
);
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity unique,
  idempotency_key uuid not null unique,
  request_hash text not null,
  customer_name text not null,
  customer_phone text not null,
  customer_address text not null,
  locale text not null check (locale in ('ar','en')),
  status text not null default 'pending' check (status in ('pending','confirmed','shipped','delivered','cancelled','expired')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','paid','refunded')),
  subtotal numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);
create table public.order_items (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id),
  product_id text not null references public.inventory(product_id),
  name_en text not null,
  name_ar text not null,
  quantity integer not null check (quantity between 1 and 99),
  unit_price numeric(12,2) not null,
  unique(order_id, product_id)
);
create index orders_created_idx on public.orders(created_at desc);
create index orders_pending_idx on public.orders(expires_at) where status = 'pending';
create table public.stock_movements (
  id bigint generated always as identity primary key,
  product_id text not null references public.inventory(product_id),
  order_id uuid references public.orders(id),
  on_hand_delta integer not null default 0,
  reserved_delta integer not null default 0,
  reason text not null,
  actor uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create table public.admin_notifications (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('order','low_stock')),
  order_id uuid references public.orders(id),
  product_id text references public.inventory(product_id),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  sent_at timestamptz,
  attempts integer not null default 0,
  locked_until timestamptz,
  lease_token uuid
);
create table public.push_subscriptions (
  endpoint text primary key check (length(endpoint) < 2048),
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null check (length(p256dh) < 256),
  auth text not null check (length(auth) < 256),
  created_at timestamptz not null default now()
);

alter table public.inventory enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.admin_notifications enable row level security;
alter table public.push_subscriptions enable row level security;
revoke all on public.admin_users, public.inventory, public.orders, public.order_items, public.stock_movements, public.admin_notifications, public.push_subscriptions from anon, authenticated;
grant select on public.inventory, public.orders, public.order_items, public.stock_movements, public.admin_notifications to authenticated;
grant update(read_at) on public.admin_notifications to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
create policy admin_inventory on public.inventory for select to authenticated using ((select public.is_admin()));
create policy admin_orders on public.orders for select to authenticated using ((select public.is_admin()));
create policy admin_items on public.order_items for select to authenticated using ((select public.is_admin()));
create policy admin_movements on public.stock_movements for select to authenticated using ((select public.is_admin()));
create policy admin_notifications_read on public.admin_notifications for select to authenticated using ((select public.is_admin()));
create policy admin_notifications_update on public.admin_notifications for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy own_push on public.push_subscriptions for all to authenticated using ((select public.is_admin()) and user_id = (select auth.uid())) with check ((select public.is_admin()) and user_id = (select auth.uid()));
-- Only expose availability and price; no customer details or stock audit data.
create function public.store_availability() returns table(product_id text, available integer, price numeric) language sql stable security definer set search_path = '' as $$
 select i.product_id, case when i.active then i.on_hand - i.reserved else 0 end, i.price from public.inventory i;
$$;
revoke all on function public.store_availability() from public;
grant execute on function public.store_availability() to anon, authenticated;

create function public.notify_low_stock() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if new.on_hand - new.reserved <= new.low_stock_threshold and old.on_hand - old.reserved > new.low_stock_threshold then
   insert into public.admin_notifications(kind, product_id) values ('low_stock',new.product_id);
 end if;
 return new;
end $$;
create trigger inventory_low_stock after update on public.inventory for each row execute function public.notify_low_stock();
revoke all on function public.notify_low_stock() from public, anon, authenticated;

create function public.create_store_order(p_key uuid, p_hash text, p_customer jsonb, p_lines jsonb, p_locale text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.orders; item record; stock public.inventory; total numeric := 0; result_items jsonb;
begin
 -- Serialize duplicate attempts before touching inventory.
 perform pg_advisory_xact_lock(hashtextextended(p_key::text,0));
 select * into o from public.orders where idempotency_key = p_key;
 if found then
   if o.request_hash <> p_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
 else
   if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 50 then raise exception 'INVALID_ORDER'; end if;
   if length(trim(p_customer->>'name')) not between 2 and 120 or length(trim(p_customer->>'phone')) not between 7 and 30 or length(trim(p_customer->>'address')) not between 5 and 500 or p_locale not in ('ar','en') then raise exception 'INVALID_ORDER'; end if;
   if exists(select 1 from jsonb_to_recordset(p_lines) as x(id text, qty int) where id is null or qty is null or qty not between 1 and 99) then raise exception 'INVALID_ORDER'; end if;
   if (select count(*) <> count(distinct x.id) from jsonb_to_recordset(p_lines) as x(id text,qty int)) then raise exception 'INVALID_ORDER'; end if;
   insert into public.orders(idempotency_key,request_hash,customer_name,customer_phone,customer_address,locale)
    values(p_key,p_hash,trim(p_customer->>'name'),trim(p_customer->>'phone'),trim(p_customer->>'address'),p_locale) returning * into o;
   -- Consistent lock order prevents deadlocks when baskets overlap.
   for item in select * from jsonb_to_recordset(p_lines) as x(id text,qty int) order by id loop
     select * into stock from public.inventory where product_id = item.id for update;
     if not found or not stock.active or stock.on_hand - stock.reserved < item.qty then raise exception 'OUT_OF_STOCK'; end if;
     insert into public.order_items(order_id,product_id,name_en,name_ar,quantity,unit_price) values(o.id,stock.product_id,stock.name_en,stock.name_ar,item.qty,stock.price);
     update public.inventory set reserved = reserved + item.qty where product_id = item.id;
     insert into public.stock_movements(product_id,order_id,reserved_delta,reason) values(item.id,o.id,item.qty,'order_reserved');
     total := total + stock.price * item.qty;
   end loop;
   update public.orders set subtotal = total where id = o.id returning * into o;
   insert into public.admin_notifications(kind,order_id) values('order',o.id);
 end if;
 select jsonb_agg(jsonb_build_object('id',product_id,'name_en',name_en,'name_ar',name_ar,'qty',quantity,'price',unit_price) order by product_id) into result_items from public.order_items where order_id = o.id;
 return jsonb_build_object('order_number',o.order_number,'status',o.status,'subtotal',o.subtotal,'expires_at',o.expires_at,'items',result_items);
end $$;
revoke all on function public.create_store_order(uuid,text,jsonb,jsonb,text) from public, anon, authenticated;
grant execute on function public.create_store_order(uuid,text,jsonb,jsonb,text) to service_role;

create function public.transition_order(p_id uuid,p_status text) returns void language plpgsql security definer set search_path = '' as $$
declare o public.orders; item record;
begin
 if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
 select * into o from public.orders where id = p_id for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if o.status = p_status then return; end if;
 if not ((o.status = 'pending' and p_status in ('confirmed','cancelled')) or (o.status = 'confirmed' and p_status in ('shipped','cancelled')) or (o.status = 'shipped' and p_status = 'delivered')) then raise exception 'INVALID_TRANSITION'; end if;
 if o.status = 'pending' and o.expires_at <= now() and p_status = 'confirmed' then raise exception 'ORDER_EXPIRED'; end if;
 if p_status in ('cancelled','shipped') then
   for item in select * from public.order_items where order_id = o.id order by product_id loop
     update public.inventory set reserved = reserved - item.quantity, on_hand = on_hand - case when p_status = 'shipped' then item.quantity else 0 end where product_id = item.product_id;
     insert into public.stock_movements(product_id,order_id,on_hand_delta,reserved_delta,reason,actor) values(item.product_id,o.id,case when p_status = 'shipped' then -item.quantity else 0 end,-item.quantity,p_status,auth.uid());
   end loop;
 end if;
 update public.orders set status = p_status, updated_at = now() where id = o.id;
end $$;
create function public.set_order_payment(p_id uuid,p_payment text) returns void language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
 if p_payment not in ('unpaid','paid','refunded') then raise exception 'INVALID_PAYMENT'; end if;
 update public.orders set payment_status = p_payment, updated_at = now() where id = p_id;
 if not found then raise exception 'NOT_FOUND'; end if;
end $$;
create function public.adjust_stock(p_product text,p_delta integer,p_reason text) returns void language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
 if p_delta is null or p_delta = 0 or abs(p_delta::bigint) > 10000 or length(trim(p_reason)) not between 3 and 200 then raise exception 'INVALID_ADJUSTMENT'; end if;
 update public.inventory set on_hand = on_hand + p_delta where product_id = p_product and on_hand + p_delta >= reserved;
 if not found then raise exception 'STOCK_BELOW_RESERVED'; end if;
 insert into public.stock_movements(product_id,on_hand_delta,reason,actor) values(p_product,p_delta,trim(p_reason),auth.uid());
end $$;
revoke all on function public.transition_order(uuid,text), public.set_order_payment(uuid,text), public.adjust_stock(text,integer,text) from public, anon;
grant execute on function public.transition_order(uuid,text), public.set_order_payment(uuid,text), public.adjust_stock(text,integer,text) to authenticated;

create function public.expire_pending_orders() returns integer language plpgsql security definer set search_path = '' as $$
declare o record; item record; expired integer := 0;
begin
 for o in select id from public.orders where status = 'pending' and expires_at <= now() order by id for update skip locked limit 100 loop
   for item in select * from public.order_items where order_id = o.id order by product_id loop
     update public.inventory set reserved = reserved - item.quantity where product_id = item.product_id;
     insert into public.stock_movements(product_id,order_id,reserved_delta,reason) values(item.product_id,o.id,-item.quantity,'expired');
   end loop;
   update public.orders set status = 'expired',updated_at = now() where id = o.id;
   expired := expired + 1;
 end loop;
 return expired;
end $$;
revoke all on function public.expire_pending_orders() from public, anon, authenticated;
grant execute on function public.expire_pending_orders() to service_role;

-- Lease batches so overlapping cron invocations do not send concurrently.
create function public.claim_notifications() returns setof public.admin_notifications language sql security definer set search_path = '' as $$
 update public.admin_notifications set locked_until = now() + interval '5 minutes', lease_token = gen_random_uuid(), attempts = attempts + 1
 where id in (select id from public.admin_notifications where sent_at is null and attempts < 8 and (locked_until is null or locked_until < now()) order by id for update skip locked limit 20)
 returning *;
$$;
revoke all on function public.claim_notifications() from public, anon, authenticated;
grant execute on function public.claim_notifications() to service_role;

-- Explicit backend grants also work when automatic Data API exposure is disabled.
grant all on public.admin_users, public.inventory, public.orders, public.order_items, public.stock_movements, public.admin_notifications, public.push_subscriptions to service_role;
grant usage, select on all sequences in schema public to service_role;
create index order_items_product_idx on public.order_items(product_id);
create index stock_movements_product_idx on public.stock_movements(product_id);
create index stock_movements_order_idx on public.stock_movements(order_id);
create index stock_movements_actor_idx on public.stock_movements(actor);
create index notifications_order_idx on public.admin_notifications(order_id);
create index notifications_product_idx on public.admin_notifications(product_id);
create index notifications_pending_idx on public.admin_notifications(id) where sent_at is null and attempts < 8;
create index push_user_idx on public.push_subscriptions(user_id);
create index orders_status_created_idx on public.orders(status,created_at desc);
