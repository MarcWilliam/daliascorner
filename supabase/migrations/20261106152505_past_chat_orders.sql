-- Keep original business dates separate from the time a record is entered.
alter table public.orders
 add column ordered_at timestamptz not null default now(),
 add column is_historical boolean not null default false,
 add column stock_handling text check(stock_handling in ('already_accounted','deduct_now'));
update public.orders set ordered_at=created_at;
create index orders_ordered_at_idx on public.orders(ordered_at desc);
create index orders_customer_ordered_idx on public.orders(customer_id,ordered_at desc,created_at desc) where customer_id is not null;

create function public.create_past_chat_order(
 p_key uuid,p_token uuid,p_customer jsonb,p_lines jsonb,p_locale text,
 p_zone uuid,p_payment text,p_ordered_on date,p_paid boolean,p_paid_on date,
 p_stock_handling text,p_expected_total numeric
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor_id uuid := auth.uid();
 today date := (now() at time zone 'Africa/Cairo')::date;
 customer jsonb;
 lines jsonb;
 line jsonb;
 line_qty numeric;
 original_cost numeric;
 payload_hash text;
 token_hash text;
 o public.orders;
 z public.delivery_zones;
 stock public.inventory;
 subtotal numeric := 0;
 new_item_id bigint;
 result_items jsonb;
 ordered_time timestamptz;
 paid_time timestamptz;
begin
 if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
 if p_key is null or p_token is null or p_zone is null or p_paid is null
    or p_locale is null or p_locale not in ('en','ar')
    or jsonb_typeof(p_customer) is distinct from 'object' then raise exception 'INVALID_ORDER'; end if;
 if p_payment is null or p_payment not in ('cash','transfer') then raise exception 'INVALID_PAYMENT'; end if;
 if p_stock_handling is null or p_stock_handling not in ('already_accounted','deduct_now') then raise exception 'INVALID_STOCK_HANDLING'; end if;
 if p_ordered_on is null or not isfinite(p_ordered_on) or p_ordered_on>today
    or (p_paid and (p_paid_on is null or not isfinite(p_paid_on) or p_paid_on<p_ordered_on or p_paid_on>today))
    or (not p_paid and p_paid_on is not null) then raise exception 'INVALID_DATE'; end if;
 if p_expected_total is null or p_expected_total::text in ('NaN','Infinity','-Infinity') or p_expected_total<0 or p_expected_total<>round(p_expected_total,2) then raise exception 'TOTAL_MISMATCH'; end if;
 if jsonb_typeof(p_customer->'name') is distinct from 'string'
    or jsonb_typeof(p_customer->'phone') is distinct from 'string'
    or jsonb_typeof(p_customer->'address') is distinct from 'string' then raise exception 'INVALID_ORDER'; end if;
 customer:=jsonb_build_object('name',trim(p_customer->>'name'),'phone',trim(p_customer->>'phone'),'address',trim(p_customer->>'address'));
 if length(customer->>'name') not between 2 and 120
    or length(customer->>'phone') not between 7 and 30
    or length(customer->>'address') not between 5 and 500
    or (p_customer->>'name') ~ '[[:cntrl:]]' or (p_customer->>'phone') ~ '[[:cntrl:]]' or (p_customer->>'address') ~ '[[:cntrl:]]'
    or (customer->>'phone') !~ '^[+]?[0-9 ()-]+$'
    or length(regexp_replace(customer->>'phone','[^0-9]','','g'))<7 then raise exception 'INVALID_ORDER'; end if;
 if jsonb_typeof(p_lines) is distinct from 'array' then raise exception 'INVALID_ORDER'; end if;
 if jsonb_array_length(p_lines) not between 1 and 50 then raise exception 'INVALID_ORDER'; end if;
 for line in select value from jsonb_array_elements(p_lines) loop
  if jsonb_typeof(line) is distinct from 'object'
     or jsonb_typeof(line->'id') is distinct from 'string'
     or (line->>'id') !~ '^[a-z0-9-]{1,100}$'
     or jsonb_typeof(line->'qty') is distinct from 'number' then raise exception 'INVALID_ORDER'; end if;
  line_qty:=(line->>'qty')::numeric;
  if line_qty<1 or line_qty>99 or line_qty<>trunc(line_qty) then raise exception 'INVALID_ORDER'; end if;
  if line ? 'unit_cost' and jsonb_typeof(line->'unit_cost')<>'null' then
   if jsonb_typeof(line->'unit_cost') is distinct from 'number' then raise exception 'INVALID_COST'; end if;
   original_cost:=(line->>'unit_cost')::numeric;
   if original_cost<0 or original_cost>9999999999.99 or original_cost<>round(original_cost,2) then raise exception 'INVALID_COST'; end if;
  end if;
 end loop;
 if (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(p_lines)) then raise exception 'INVALID_ORDER'; end if;
 select jsonb_agg(jsonb_build_object('id',value->>'id','qty',(value->>'qty')::integer,
  'unit_cost',case when jsonb_typeof(value->'unit_cost')='number' then round((value->>'unit_cost')::numeric,2) else null end)
  order by value->>'id') into lines from jsonb_array_elements(p_lines);
 ordered_time:=(p_ordered_on+time '12:00') at time zone 'Africa/Cairo';
 if p_paid then paid_time:=(p_paid_on+time '12:00') at time zone 'Africa/Cairo'; end if;
 token_hash:=encode(sha256(convert_to(p_token::text,'UTF8')),'hex');
 payload_hash:=encode(sha256(convert_to(jsonb_build_object(
  'kind','past-chat-order-v1','actor',actor_id,'token',p_token,'customer',customer,
  'lines',lines,'locale',p_locale,'zone',p_zone,'payment',p_payment,'paid',p_paid,
  'ordered_on',p_ordered_on,'paid_on',p_paid_on,'stock_handling',p_stock_handling,'expected_total',round(p_expected_total,2)
 )::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('chat-token:'||p_token::text,0));
 perform pg_advisory_xact_lock(hashtextextended(p_key::text,0));
 select * into o from public.orders where idempotency_key=p_key for update;
 if found then
  if o.source<>'chat' or not o.is_historical or o.recorded_by is distinct from actor_id
     or o.request_hash<>payload_hash or o.guest_token_hash is distinct from token_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
 else
  if exists(select 1 from public.orders where guest_token_hash=token_hash) then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  -- Inactive configured areas and catalog items remain valid historical evidence.
  select * into z from public.delivery_zones where id=p_zone for share;
  if not found then raise exception 'INVALID_DELIVERY'; end if;
  -- Lock prices and any current stock deductions in the same deterministic order.
  for line in select value from jsonb_array_elements(lines) order by value->>'id' loop
   select * into stock from public.inventory where product_id=line->>'id' for update;
   if not found then raise exception 'OUT_OF_STOCK'; end if;
   if p_stock_handling='deduct_now' and not stock.unlimited_stock and stock.on_hand-stock.reserved<(line->>'qty')::integer then raise exception 'OUT_OF_STOCK'; end if;
   subtotal:=subtotal+stock.price*(line->>'qty')::integer;
  end loop;
  if p_expected_total<>subtotal+z.fee then raise exception 'TOTAL_MISMATCH'; end if;
  insert into public.orders(idempotency_key,request_hash,customer_name,customer_phone,customer_address,locale,
   status,subtotal,source,recorded_by,customer_id,guest_token_hash,delivery_fee,delivery_zone,payment_method,
   marketing_consent,meta_context,source_url,ordered_at,is_historical,stock_handling)
  values(p_key,payload_hash,customer->>'name',customer->>'phone',customer->>'address',p_locale,
   'delivered',subtotal,'chat',actor_id,null,token_hash,z.fee,
   case when p_locale='ar' then z.name_ar else z.name_en end,p_payment,
   false,'{}'::jsonb,'',ordered_time,true,p_stock_handling) returning * into o;
  for line in select value from jsonb_array_elements(lines) order by value->>'id' loop
   select * into stock from public.inventory where product_id=line->>'id';
   insert into public.order_items(order_id,product_id,name_en,name_ar,quantity,unit_price,stock_tracked)
   values(o.id,stock.product_id,stock.name_en,stock.name_ar,(line->>'qty')::integer,stock.price,false) returning id into new_item_id;
   -- The normal insert trigger captures today's cost. A past sale must explicitly
   -- replace that with its original cost or unknown, never silently retain it.
   update public.order_item_costs set unit_cost=(line->>'unit_cost')::numeric,recorded_by=actor_id,recorded_at=now() where item_id=new_item_id;
   if p_stock_handling='deduct_now' and not stock.unlimited_stock then
    update public.inventory set on_hand=on_hand-(line->>'qty')::integer where product_id=stock.product_id;
    insert into public.stock_movements(product_id,order_id,on_hand_delta,reason,actor)
     values(stock.product_id,o.id,-(line->>'qty')::integer,'past_order_deducted',actor_id);
   end if;
  end loop;
  if p_paid then
   perform public.set_order_payment(o.id,'paid');
   -- This fresh order has exactly one initial receipt; never rewrite later events on retry.
   update public.finance_payment_events set occurred_at=paid_time where order_id=o.id and event_type='payment';
  end if;
  select * into o from public.orders where id=o.id;
 end if;
 select jsonb_agg(jsonb_build_object('id',product_id,'name_en',name_en,'name_ar',name_ar,'qty',quantity,'price',unit_price) order by product_id)
  into result_items from public.order_items where order_id=o.id;
 return jsonb_build_object('id',o.id,'source',o.source,'order_number',o.order_number,'status',o.status,
  'payment_status',o.payment_status,'subtotal',o.subtotal,'delivery_fee',o.delivery_fee,'delivery_zone',o.delivery_zone,
  'total',o.subtotal+o.delivery_fee,'payment_method',o.payment_method,'transfer_instructions',o.transfer_instructions,
  'expires_at',o.expires_at,'items',result_items,'ordered_at',o.ordered_at,'is_historical',o.is_historical,'stock_handling',o.stock_handling);
end $$;
revoke all on function public.create_past_chat_order(uuid,uuid,jsonb,jsonb,text,uuid,text,date,boolean,date,text,numeric) from public,anon,authenticated;
grant execute on function public.create_past_chat_order(uuid,uuid,jsonb,jsonb,text,uuid,text,date,boolean,date,text,numeric) to authenticated;

-- Compatible tracking response, now including the original order date.
create or replace function public.guest_order(p_token uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('order_number',o.order_number,'status',o.status,'payment_status',o.payment_status,
  'subtotal',o.subtotal,'delivery_fee',o.delivery_fee,'delivery_zone',o.delivery_zone,'payment_method',o.payment_method,
  'transfer_instructions',o.transfer_instructions,'created_at',o.created_at,'ordered_at',o.ordered_at,
  'is_historical',o.is_historical,
  'items',(select jsonb_agg(jsonb_build_object('name_en',i.name_en,'name_ar',i.name_ar,'quantity',i.quantity,'unit_price',i.unit_price)) from public.order_items i where i.order_id=o.id))
 from public.orders o where guest_token_hash=encode(sha256(convert_to(p_token::text,'UTF8')),'hex') and customer_id is null;
$$;
