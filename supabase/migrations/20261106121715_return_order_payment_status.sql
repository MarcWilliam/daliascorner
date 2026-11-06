-- Paid pending orders retain their reservations after the original expiry.
-- Return payment status on retries so checkout can distinguish a live paid hold.
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
 return jsonb_build_object('order_number',o.order_number,'status',o.status,'payment_status',o.payment_status,'subtotal',o.subtotal,'expires_at',o.expires_at,'items',result_items);
end $$;
