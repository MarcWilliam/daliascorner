-- Infinite availability is a product mode; each order item snapshots whether
-- it reserved finite inventory, so later mode changes cannot corrupt stock.
alter table public.inventory add column unlimited_stock boolean not null default false;
alter table public.order_items add column stock_tracked boolean not null default true;
create or replace function public.store_availability() returns table(product_id text, available integer, price numeric) language sql stable security definer set search_path = '' as $$
 select i.product_id, case when not i.active then 0 when i.unlimited_stock then 2147483647 else i.on_hand-i.reserved end,i.price from public.inventory i;
$$;
create or replace function public.notify_low_stock() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.active and not new.unlimited_stock and new.on_hand-new.reserved <= new.low_stock_threshold and (old.unlimited_stock or not old.active or old.on_hand-old.reserved > new.low_stock_threshold) then
 insert into public.admin_notifications(kind,product_id) values('low_stock',new.product_id);
 end if;
 return new;
end $$;
create or replace function public.create_store_order(p_key uuid, p_hash text, p_customer jsonb, p_lines jsonb, p_locale text)
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
     if not found or not stock.active or (not stock.unlimited_stock and stock.on_hand - stock.reserved < item.qty) then raise exception 'OUT_OF_STOCK'; end if;
     insert into public.order_items(order_id,product_id,name_en,name_ar,quantity,unit_price,stock_tracked) values(o.id,stock.product_id,stock.name_en,stock.name_ar,item.qty,stock.price,not stock.unlimited_stock);
     if not stock.unlimited_stock then
     update public.inventory set reserved = reserved + item.qty where product_id = item.id;
     insert into public.stock_movements(product_id,order_id,reserved_delta,reason) values(item.id,o.id,item.qty,'order_reserved');
     end if;
     total := total + stock.price * item.qty;
   end loop;
   update public.orders set subtotal = total where id = o.id returning * into o;
   insert into public.admin_notifications(kind,order_id) values('order',o.id);
 end if;
 select jsonb_agg(jsonb_build_object('id',product_id,'name_en',name_en,'name_ar',name_ar,'qty',quantity,'price',unit_price) order by product_id) into result_items from public.order_items where order_id = o.id;
 return jsonb_build_object('order_number',o.order_number,'status',o.status,'subtotal',o.subtotal,'expires_at',o.expires_at,'items',result_items);
end $$;
create or replace function public.transition_order(p_id uuid,p_status text) returns void language plpgsql security definer set search_path = '' as $$
declare o public.orders; item record;
begin
 if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
 select * into o from public.orders where id = p_id for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if o.status = p_status then return; end if;
 if not ((o.status = 'pending' and p_status in ('confirmed','cancelled')) or (o.status = 'confirmed' and p_status in ('shipped','cancelled')) or (o.status = 'shipped' and p_status = 'delivered')) then raise exception 'INVALID_TRANSITION'; end if;
 if o.status = 'pending' and o.payment_status <> 'paid' and o.expires_at <= now() and p_status = 'confirmed' then raise exception 'ORDER_EXPIRED'; end if;
 if p_status in ('cancelled','shipped') then
   for item in select * from public.order_items where order_id = o.id and stock_tracked order by product_id loop
     update public.inventory set reserved = reserved - item.quantity, on_hand = on_hand - case when p_status = 'shipped' then item.quantity else 0 end where product_id = item.product_id;
     insert into public.stock_movements(product_id,order_id,on_hand_delta,reserved_delta,reason,actor) values(item.product_id,o.id,case when p_status = 'shipped' then -item.quantity else 0 end,-item.quantity,p_status,auth.uid());
   end loop;
 end if;
 update public.orders set status = p_status, updated_at = now() where id = o.id;
end $$;
create or replace function public.expire_pending_orders() returns integer language plpgsql security definer set search_path = '' as $$
declare o record; item record; expired integer := 0;
begin
 for o in select id from public.orders where status = 'pending' and payment_status <> 'paid' and expires_at <= now() order by id for update skip locked limit 100 loop
   for item in select * from public.order_items where order_id = o.id and stock_tracked order by product_id loop
     update public.inventory set reserved = reserved - item.quantity where product_id = item.product_id;
     insert into public.stock_movements(product_id,order_id,reserved_delta,reason) values(item.product_id,o.id,-item.quantity,'expired');
   end loop;
   update public.orders set status = 'expired',updated_at = now() where id = o.id;
   expired := expired + 1;
 end loop;
 return expired;
end $$;
create or replace function public.adjust_stock(p_product text,p_delta integer,p_reason text default 'stock_adjustment') returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
 if p_delta is null or p_delta=0 or abs(p_delta::bigint)>10000 then raise exception 'INVALID_ADJUSTMENT'; end if;
 update public.inventory set on_hand=(on_hand::bigint+p_delta)::integer where product_id=p_product and on_hand::bigint+p_delta between reserved and 2147483647;
 if not found then raise exception 'STOCK_BELOW_RESERVED'; end if;
 insert into public.stock_movements(product_id,on_hand_delta,reason,actor) values(p_product,p_delta,case when p_delta>0 then 'restocked' else 'stock_removed' end,auth.uid());
end $$;
create function public.restock_inventory(p_product text,p_quantity integer,p_operation text default 'add') returns void language plpgsql security definer set search_path='' as $$
declare stock public.inventory; target bigint; delta integer;
begin
 if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
 if p_quantity is null or p_quantity<0 or p_quantity>10000 or p_operation is null or p_operation not in ('add','remove','set') or (p_quantity=0 and p_operation<>'set') then raise exception 'INVALID_QUANTITY'; end if;
 select * into stock from public.inventory where product_id=p_product for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 target:=case p_operation when 'add' then stock.on_hand::bigint+p_quantity when 'remove' then stock.on_hand::bigint-p_quantity else p_quantity end;
 if target<stock.reserved or target>2147483647 then raise exception 'STOCK_BELOW_RESERVED'; end if;
 delta:=(target-stock.on_hand)::integer;
 if delta=0 then return; end if;
 update public.inventory set on_hand=target::integer where product_id=p_product;
 insert into public.stock_movements(product_id,on_hand_delta,reason,actor) values(p_product,delta,case p_operation when 'add' then 'restocked' when 'remove' then 'stock_removed' else 'stock_count_corrected' end,auth.uid());
end $$;
create function public.set_inventory_mode(p_product text,p_unlimited boolean) returns void language plpgsql security definer set search_path='' as $$
declare old_mode boolean;
begin
 if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
 if p_unlimited is null then raise exception 'INVALID_MODE'; end if;
 select unlimited_stock into old_mode from public.inventory where product_id=p_product for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if old_mode=p_unlimited then return; end if;
 update public.inventory set unlimited_stock=p_unlimited where product_id=p_product;
 insert into public.stock_movements(product_id,reason,actor) values(p_product,case when p_unlimited then 'unlimited_enabled' else 'tracked_enabled' end,auth.uid());
end $$;
create function public.set_inventory_active(p_product text,p_active boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
 if p_active is null then raise exception 'INVALID_AVAILABILITY'; end if;
 update public.inventory set active=p_active where product_id=p_product;
 if not found then raise exception 'NOT_FOUND'; end if;
end $$;
revoke all on function public.restock_inventory(text,integer,text), public.set_inventory_mode(text,boolean), public.set_inventory_active(text,boolean) from public,anon;
grant execute on function public.restock_inventory(text,integer,text), public.set_inventory_mode(text,boolean), public.set_inventory_active(text,boolean) to authenticated;
