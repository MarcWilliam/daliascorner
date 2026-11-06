-- A refunded flag predating finance tracking is not proof of a zero cash balance.
-- Require explicit reconciliation rather than inventing opening receipts/refunds.
do $$ begin
 if exists(select 1 from public.orders o where o.payment_status='refunded'
   and not exists(select 1 from public.finance_payment_events e where e.order_id=o.id)) then
  raise exception 'RECONCILE_LEGACY_REFUNDS_BEFORE_OPERATIONS';
 end if;
end $$;

-- Admin-managed order adjustments preserve item snapshots and explicit stock movements.
alter table public.orders add column revision bigint not null default 0, add column ops_managed boolean not null default false,
 add column delivery_zone_id uuid references public.delivery_zones(id);
create index orders_delivery_zone_idx on public.orders(delivery_zone_id);
update public.orders o set delivery_zone_id=z.id from public.delivery_zones z where o.delivery_zone in (z.name_en,z.name_ar);
alter table public.order_items drop constraint order_items_order_id_product_id_key;
alter table public.order_items
 add column reserved_quantity integer not null default 0,
 add column shipped_quantity integer not null default 0,
 add column delivered_quantity integer not null default 0,
 add column removed_quantity integer not null default 0,
 add column cancelled_quantity integer not null default 0,
 add column returned_quantity integer not null default 0,
 add column returned_after_delivery_quantity integer not null default 0,
 add column restocked_quantity integer not null default 0,
 add constraint item_progress_valid check(reserved_quantity>=0 and shipped_quantity>=0 and delivered_quantity between 0 and shipped_quantity and cancelled_quantity between 0 and removed_quantity and removed_quantity>=0 and shipped_quantity+removed_quantity<=quantity and reserved_quantity<=quantity-removed_quantity-shipped_quantity and returned_quantity between 0 and shipped_quantity and returned_after_delivery_quantity between 0 and least(returned_quantity,delivered_quantity) and restocked_quantity between 0 and returned_quantity);
create function private.bump_order_revision() returns trigger language plpgsql set search_path='' as $$ begin if new.revision=old.revision+1 then new.updated_at:=clock_timestamp(); return new; end if; if (to_jsonb(new)-array['revision','updated_at','order_total']) is distinct from (to_jsonb(old)-array['revision','updated_at','order_total']) then new.revision:=old.revision+1; new.updated_at:=clock_timestamp(); else new.revision:=old.revision; end if; return new; end $$;
revoke all on function private.bump_order_revision() from public,anon,authenticated;
create trigger bump_order_revision before update on public.orders for each row execute function private.bump_order_revision();
create table private.order_events(id bigint generated always as identity primary key,order_id uuid not null references public.orders(id),actor_id uuid,actor_label text not null default '',kind text not null,reason text not null default '',payload jsonb not null default '{}',created_at timestamptz not null default clock_timestamp());
create index order_events_order_idx on private.order_events(order_id,id);
create table private.order_action_requests(actor_id uuid not null,request_key uuid not null,request_hash text not null,result jsonb not null,primary key(actor_id,request_key));
create table private.order_shipments(id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id),courier text not null default '',tracking_number text not null default '',dispatched_on date,expected_on date,delivered_on date,voided_at timestamptz,lines jsonb not null,legacy_import boolean not null default false,legacy_delivered boolean not null default false,created_at timestamptz not null default now());
create index order_shipments_order_idx on private.order_shipments(order_id);
create table private.order_returns(id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id),returned_on date not null,lines jsonb not null,reason text not null,created_at timestamptz not null default now());
create index order_returns_order_idx on private.order_returns(order_id);
create table private.order_return_allocations(
 id bigint generated always as identity primary key,
 order_id uuid not null references public.orders(id),
 return_id uuid not null references private.order_returns(id),
 shipment_id uuid not null references private.order_shipments(id),
 item_id bigint not null references public.order_items(id),
 quantity integer not null check(quantity between 1 and 99),
 after_delivery boolean not null
);
create index return_allocations_shipment_item_idx on private.order_return_allocations(shipment_id,item_id);
create index return_allocations_return_idx on private.order_return_allocations(return_id);
alter table private.order_return_allocations enable row level security;
revoke all on private.order_return_allocations from public,anon,authenticated;
revoke all on sequence private.order_return_allocations_id_seq from public,anon,authenticated;
alter table private.order_events enable row level security;
alter table private.order_action_requests enable row level security;
alter table private.order_shipments enable row level security;
alter table private.order_returns enable row level security;
revoke all on private.order_events,private.order_action_requests,private.order_shipments,private.order_returns from public,anon,authenticated;
create function private.reject_order_event_change() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'AUDIT_IMMUTABLE'; end $$;
revoke all on function private.reject_order_event_change() from public,anon,authenticated;
create trigger immutable_order_events before update or delete on private.order_events for each row execute function private.reject_order_event_change();
create trigger immutable_return_allocations before update or delete on private.order_return_allocations for each row execute function private.reject_order_event_change();
create trigger immutable_return_allocations_truncate before truncate on private.order_return_allocations for each statement execute function private.reject_order_event_change();
create trigger immutable_order_events_truncate before truncate on private.order_events for each statement execute function private.reject_order_event_change();
create function private.manage_order(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare o public.orders; begin
 select * into o from public.orders where id=p_id for update;
 if o.ops_managed then return; end if;
 update public.order_items set
 reserved_quantity=case when stock_tracked and o.status in ('pending','confirmed') then quantity else 0 end,
 shipped_quantity=case when o.status in ('shipped','delivered') then quantity else 0 end,
 delivered_quantity=case when o.status='delivered' then quantity else 0 end where order_id=p_id;
 if o.status in ('shipped','delivered') then
 insert into private.order_shipments(order_id,lines,legacy_import,legacy_delivered) select p_id,coalesce(jsonb_agg(jsonb_build_object('item_id',id,'quantity',quantity)),'[]'),true,o.status='delivered' from public.order_items where order_id=p_id;
 end if;
 update public.orders set ops_managed=true,delivery_zone_id=coalesce(delivery_zone_id,(select id from public.delivery_zones z where o.delivery_zone in(z.name_en,z.name_ar) order by id limit 1)) where id=p_id;
 if to_regprocedure('private.sync_order_cost(uuid,timestamp with time zone)') is not null then execute 'select private.sync_order_cost($1,$2)' using p_id,now(); end if;
end $$;
revoke all on function private.manage_order(uuid) from public,anon,authenticated;
create function private.recalculate_order(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare outstanding bigint; shipped bigint; delivered bigint; active bigint; total numeric; begin
 select coalesce(sum(quantity-removed_quantity-shipped_quantity),0),coalesce(sum(shipped_quantity),0),coalesce(sum(delivered_quantity+returned_quantity-returned_after_delivery_quantity),0),coalesce(sum(quantity-removed_quantity-returned_quantity),0),coalesce(sum(unit_price*(quantity-removed_quantity-returned_quantity)),0) into outstanding,shipped,delivered,active,total from public.order_items where order_id=p_id;
 update public.orders set subtotal=total,delivery_fee=case when active=0 and shipped=0 then 0 else delivery_fee end,
 status=case when shipped>0 and outstanding=0 then case when delivered>=shipped then 'delivered' else 'shipped' end when shipped>0 then 'confirmed' when active=0 then 'cancelled' else status end where id=p_id;
end $$;
revoke all on function private.recalculate_order(uuid) from public,anon,authenticated;
create function public.admin_order_detail(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; f jsonb:='{}'; begin
 if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
 if not exists(select 1 from public.orders where id=p_id) then raise exception 'NOT_FOUND'; end if;
 if to_regprocedure('private.order_finance_detail(uuid)') is not null then execute 'select private.order_finance_detail($1)' into f using p_id; end if;
 select jsonb_build_object('order',to_jsonb(o)-array['guest_token_hash','request_hash','idempotency_key','meta_context'],'items',(select coalesce(jsonb_agg((to_jsonb(i)||case when not o.ops_managed then jsonb_build_object('reserved_quantity',case when i.stock_tracked and o.status in ('pending','confirmed') then i.quantity else 0 end,'shipped_quantity',case when o.status in ('shipped','delivered') then i.quantity else 0 end,'delivered_quantity',case when o.status='delivered' then i.quantity else 0 end) else '{}'::jsonb end) order by i.id),'[]') from public.order_items i where i.order_id=o.id),'shipments',(select coalesce(jsonb_agg((to_jsonb(s)||jsonb_build_object('lines',(select jsonb_agg(l||jsonb_build_object('returned_quantity',coalesce((select sum(a.quantity) from private.order_return_allocations a where a.shipment_id=s.id and a.item_id=(l->>'item_id')::bigint),0))) from jsonb_array_elements(s.lines) l))) order by s.created_at desc),'[]') from private.order_shipments s where s.order_id=o.id),'returns',(select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc),'[]') from private.order_returns r where r.order_id=o.id),'timeline',(select coalesce(jsonb_agg(to_jsonb(e) order by e.id desc),'[]') from private.order_events e where e.order_id=o.id),'notes',(select coalesce(jsonb_agg(to_jsonb(e) order by e.id desc),'[]') from private.order_events e where e.order_id=o.id and e.kind='note'),'finance',f) into result from public.orders o where o.id=p_id;
 return result;
end $$;
revoke all on function public.admin_order_detail(uuid) from public,anon,authenticated;
grant execute on function public.admin_order_detail(uuid) to authenticated;
create function public.admin_order_action(p_id uuid,p_revision bigint,p_key uuid,p_action text,p_payload jsonb,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.orders; i public.order_items; stock public.inventory; zone public.delivery_zones; shipment private.order_shipments; line jsonb; qty integer; desired integer; delta integer; held integer; req_hash text; previous private.order_action_requests; result jsonb; snapshot jsonb; today date:=(now() at time zone 'Africa/Cairo')::date; event_day date; effective timestamptz:=now(); sid uuid; rid uuid; allocation record; needed integer; allocated integer; returned_delivered integer; any_shipped boolean; total_qty bigint; requested_zone uuid; zone_changed boolean; address_changed boolean;
begin
 if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
 if p_id is null or p_revision is null or p_key is null or p_action is null or jsonb_typeof(p_payload) is distinct from 'object' or p_reason is null or length(trim(p_reason)) not between 1 and 1000 then raise exception 'INVALID_ACTION'; end if;
 req_hash:=encode(sha256(convert_to(jsonb_build_object('order',p_id,'revision',p_revision,'action',p_action,'payload',p_payload,'reason',p_reason)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_key::text,0));
 select * into previous from private.order_action_requests where actor_id=auth.uid() and request_key=p_key;
 if found then if previous.request_hash<>req_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if; return previous.result; end if;
 select * into o from public.orders where id=p_id for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if o.revision<>p_revision then raise exception 'ORDER_CHANGED'; end if;
 snapshot:=(to_jsonb(o)-array['guest_token_hash','request_hash','idempotency_key','meta_context'])||jsonb_build_object('items',(select jsonb_agg(to_jsonb(x)) from public.order_items x where order_id=p_id));
 perform private.manage_order(p_id);
 -- Lock all affected products once, in the same order as website checkout.
 perform 1 from public.inventory where product_id in(select product_id from public.order_items where order_id=p_id union select value->>'product_id' from jsonb_array_elements(coalesce(p_payload->'additions','[]'))) order by product_id for update;
 select exists(select 1 from public.order_items where order_id=p_id and shipped_quantity>0) into any_shipped;
 if p_action='manage' then
  null;
 elsif p_action='details' then
  if jsonb_typeof(p_payload->'name') is distinct from 'string' or jsonb_typeof(p_payload->'phone') is distinct from 'string' or jsonb_typeof(p_payload->'address') is distinct from 'string' or p_payload->>'locale' is null or coalesce(p_payload->>'name','') ~ '[[:cntrl:]]' or coalesce(p_payload->>'phone','') ~ '[[:cntrl:]]' or coalesce(p_payload->>'address','') ~ '[[:cntrl:]]' or length(trim(p_payload->>'name')) not between 2 and 120 or length(trim(p_payload->>'phone')) not between 7 and 30 or length(regexp_replace(p_payload->>'phone','[^0-9]','','g'))<7 or length(trim(p_payload->>'address')) not between 5 and 500 or (p_payload->>'phone') !~ '^[+]?[0-9 ()-]+$' or p_payload->>'locale' not in ('en','ar') then raise exception 'INVALID_CUSTOMER'; end if;
  requested_zone:=nullif(p_payload->>'zone_id','')::uuid;
  -- A blank zone means keep the recorded route, including unknown legacy areas.
  zone_changed:=requested_zone is not null and requested_zone is distinct from o.delivery_zone_id;
  address_changed:=trim(p_payload->>'address') is distinct from trim(o.customer_address);
  if any_shipped and (zone_changed or address_changed) and (p_payload->'delivery_change_confirmed') is distinct from 'true'::jsonb then raise exception 'DELIVERY_CHANGE_CONFIRMATION_REQUIRED'; end if;
  if zone_changed then
   select * into zone from public.delivery_zones where id=requested_zone and active for share;
   if not found then raise exception 'INVALID_DELIVERY'; end if;
  end if;
  update public.orders set customer_name=trim(p_payload->>'name'),customer_phone=trim(p_payload->>'phone'),customer_address=trim(p_payload->>'address'),locale=p_payload->>'locale',
   delivery_zone_id=case when zone_changed then zone.id else o.delivery_zone_id end,
   delivery_zone=case when zone_changed then case when p_payload->>'locale'='ar' then zone.name_ar else zone.name_en end else o.delivery_zone end,
   delivery_fee=case when zone_changed then zone.fee else o.delivery_fee end
   where id=p_id;
 elsif p_action='items' then
  if o.status in ('cancelled','expired') then raise exception 'REOPEN_REQUIRED'; end if;
  if jsonb_typeof(coalesce(p_payload->'lines','[]'))<>'array' or jsonb_typeof(coalesce(p_payload->'additions','[]'))<>'array' or jsonb_array_length(coalesce(p_payload->'lines','[]'))+jsonb_array_length(coalesce(p_payload->'additions','[]'))>100 then raise exception 'INVALID_ITEMS'; end if;
  if exists(select 1 from jsonb_array_elements(coalesce(p_payload->'lines','[]')) group by value->>'item_id' having count(*)>1) then raise exception 'INVALID_ITEMS'; end if;
  for line in select value from jsonb_array_elements(coalesce(p_payload->'lines','[]')) loop
   if jsonb_typeof(line->'quantity')<>'number' or (line->>'quantity')::numeric<>trunc((line->>'quantity')::numeric) then raise exception 'INVALID_QUANTITY'; end if;
   select * into i from public.order_items where order_id=p_id and id=(line->>'item_id')::bigint for update;
   if not found then raise exception 'INVALID_ITEM'; end if;
   desired:=(line->>'quantity')::integer;
   if desired<i.shipped_quantity or desired>i.quantity-i.removed_quantity then raise exception 'INVALID_QUANTITY'; end if;
   delta:=i.quantity-i.removed_quantity-desired; held:=least(delta,i.reserved_quantity);
   if held>0 then update public.inventory set reserved=reserved-held where product_id=i.product_id; insert into public.stock_movements(product_id,order_id,reserved_delta,reason,actor) values(i.product_id,p_id,-held,'admin_items_removed',auth.uid()); end if;
   update public.order_items set removed_quantity=removed_quantity+delta,reserved_quantity=reserved_quantity-held where id=i.id;
  end loop;
  for line in select value from jsonb_array_elements(coalesce(p_payload->'additions','[]')) loop
   if jsonb_typeof(line->'quantity')<>'number' or (line->>'quantity')::numeric<>trunc((line->>'quantity')::numeric) or (line->>'quantity')::numeric not between 1 and 99 then raise exception 'INVALID_QUANTITY'; end if;
   qty:=(line->>'quantity')::integer;
   select * into stock from public.inventory where product_id=line->>'product_id';
   if not found or not stock.active or (not stock.unlimited_stock and stock.on_hand-stock.reserved<qty) then raise exception 'OUT_OF_STOCK'; end if;
   insert into public.order_items(order_id,product_id,name_en,name_ar,quantity,unit_price,stock_tracked,reserved_quantity) values(p_id,stock.product_id,stock.name_en,stock.name_ar,qty,stock.price,not stock.unlimited_stock,case when stock.unlimited_stock then 0 else qty end);
   if not stock.unlimited_stock then update public.inventory set reserved=reserved+qty where product_id=stock.product_id; insert into public.stock_movements(product_id,order_id,reserved_delta,reason,actor) values(stock.product_id,p_id,qty,'admin_items_added',auth.uid()); end if;
  end loop;
 elsif p_action='confirm' then
  if o.status<>'pending' then raise exception 'INVALID_TRANSITION'; end if;
  if o.payment_status<>'paid' and o.expires_at<=now() then raise exception 'ORDER_EXPIRED'; end if;
  update public.orders set status='confirmed' where id=p_id;
 elsif p_action='ship' then
  if o.status not in ('confirmed','shipped') then raise exception 'INVALID_TRANSITION'; end if;
  event_day:=(p_payload->>'dispatched_on')::date;
  if event_day is null or not isfinite(event_day) or event_day>today or event_day<(o.ordered_at at time zone 'Africa/Cairo')::date or length(coalesce(p_payload->>'courier',''))>120 or length(coalesce(p_payload->>'tracking_number',''))>200 or jsonb_typeof(p_payload->'lines')<>'array' or jsonb_array_length(p_payload->'lines') not between 1 and 100 then raise exception 'INVALID_SHIPMENT'; end if;
  if p_payload->>'expected_on' is not null and ((p_payload->>'expected_on')::date<event_day or not isfinite((p_payload->>'expected_on')::date)) then raise exception 'INVALID_DATE'; end if;
  if exists(select 1 from jsonb_array_elements(p_payload->'lines') group by value->>'item_id' having count(*)>1) then raise exception 'INVALID_ITEMS'; end if;
  for line in select value from jsonb_array_elements(p_payload->'lines') loop
   if jsonb_typeof(line->'quantity')<>'number' or (line->>'quantity')::numeric<>trunc((line->>'quantity')::numeric) or (line->>'quantity')::numeric not between 1 and 99 then raise exception 'INVALID_QUANTITY'; end if;
   qty:=(line->>'quantity')::integer;
   select * into i from public.order_items where order_id=p_id and id=(line->>'item_id')::bigint for update;
   if not found or qty>i.quantity-i.removed_quantity-i.shipped_quantity then raise exception 'INVALID_QUANTITY'; end if;
   held:=least(qty,i.reserved_quantity);
   if i.stock_tracked then
    select * into stock from public.inventory where product_id=i.product_id;
    if stock.on_hand-stock.reserved<qty-held then raise exception 'OUT_OF_STOCK'; end if;
    update public.inventory set on_hand=on_hand-qty,reserved=reserved-held where product_id=i.product_id;
    insert into public.stock_movements(product_id,order_id,on_hand_delta,reserved_delta,reason,actor) values(i.product_id,p_id,-qty,-held,'partial_shipment',auth.uid());
   end if;
   update public.order_items set shipped_quantity=shipped_quantity+qty,reserved_quantity=reserved_quantity-held where id=i.id;
  end loop;
  -- Every unshipped remainder becomes an unreserved backorder, never a cancellation.
  for i in select * from public.order_items where order_id=p_id and reserved_quantity>0 loop
   update public.inventory set reserved=reserved-i.reserved_quantity where product_id=i.product_id;
   insert into public.stock_movements(product_id,order_id,reserved_delta,reason,actor) values(i.product_id,p_id,-i.reserved_quantity,'shipment_remainder_released',auth.uid());
   update public.order_items set reserved_quantity=0 where id=i.id;
  end loop;
  insert into private.order_shipments(order_id,courier,tracking_number,dispatched_on,expected_on,lines) values(p_id,coalesce(p_payload->>'courier',''),coalesce(p_payload->>'tracking_number',''),event_day,(p_payload->>'expected_on')::date,p_payload->'lines');
  effective:=(event_day+time '12:00') at time zone 'Africa/Cairo';
 elsif p_action='deliver' then
  select * into shipment from private.order_shipments where order_id=p_id and id=(p_payload->>'shipment_id')::uuid for update;
  event_day:=(p_payload->>'delivered_on')::date;
  if not found or shipment.voided_at is not null or shipment.legacy_delivered or shipment.delivered_on is not null or event_day is null or not isfinite(event_day) or event_day<coalesce(shipment.dispatched_on,(o.ordered_at at time zone 'Africa/Cairo')::date) or event_day>today then raise exception 'INVALID_DELIVERY'; end if;
  if not exists(select 1 from jsonb_array_elements(shipment.lines) l where (l->>'quantity')::integer>coalesce((select sum(a.quantity) from private.order_return_allocations a where a.shipment_id=shipment.id and a.item_id=(l->>'item_id')::bigint),0)) then raise exception 'NO_ITEMS_TO_DELIVER'; end if;
  for line in select value from jsonb_array_elements(shipment.lines) loop
   select coalesce(sum(a.quantity),0)::integer into allocated from private.order_return_allocations a where a.shipment_id=shipment.id and a.item_id=(line->>'item_id')::bigint;
   update public.order_items set delivered_quantity=delivered_quantity+(line->>'quantity')::integer-allocated where id=(line->>'item_id')::bigint;
  end loop;
  update private.order_shipments set delivered_on=event_day where id=shipment.id;
 elsif p_action='shipment_details' then
  select * into shipment from private.order_shipments where order_id=p_id and id=(p_payload->>'shipment_id')::uuid for update;
  event_day:=(p_payload->>'dispatched_on')::date;
  if not found or shipment.voided_at is not null or (event_day is null and not shipment.legacy_import) or (event_day is not null and (not isfinite(event_day) or event_day>today or event_day<(o.ordered_at at time zone 'Africa/Cairo')::date)) or length(coalesce(p_payload->>'courier',''))>120 or length(coalesce(p_payload->>'tracking_number',''))>200 then raise exception 'INVALID_SHIPMENT'; end if;
  if shipment.dispatched_on is not null and shipment.dispatched_on is distinct from event_day then raise exception 'DISPATCH_DATE_IMMUTABLE'; end if;
  if p_payload->>'expected_on' is not null and (not isfinite((p_payload->>'expected_on')::date) or (p_payload->>'expected_on')::date<coalesce(event_day,(o.ordered_at at time zone 'Africa/Cairo')::date)) then raise exception 'INVALID_DATE'; end if;
  if shipment.delivered_on is not null and shipment.delivered_on<event_day then raise exception 'INVALID_DATE'; end if;
  if p_payload->>'delivered_on' is not null and exists(select 1 from private.order_return_allocations a join private.order_returns r on r.id=a.return_id where a.shipment_id=shipment.id and a.after_delivery and r.returned_on<(p_payload->>'delivered_on')::date) then raise exception 'DELIVERY_AFTER_RETURN'; end if;
  if p_payload->>'delivered_on' is not null and (not(shipment.legacy_delivered or shipment.delivered_on is not null) or not isfinite((p_payload->>'delivered_on')::date) or (p_payload->>'delivered_on')::date<coalesce(event_day,(o.ordered_at at time zone 'Africa/Cairo')::date) or (p_payload->>'delivered_on')::date>today) then raise exception 'INVALID_DELIVERY'; end if;
  update private.order_shipments set courier=coalesce(p_payload->>'courier',''),tracking_number=coalesce(p_payload->>'tracking_number',''),dispatched_on=event_day,expected_on=(p_payload->>'expected_on')::date,delivered_on=coalesce((p_payload->>'delivered_on')::date,delivered_on) where id=shipment.id;
 elsif p_action='return' then
  event_day:=(p_payload->>'returned_on')::date;
  if event_day is null or not isfinite(event_day) or event_day>today or event_day<(o.ordered_at at time zone 'Africa/Cairo')::date or jsonb_typeof(p_payload->'lines')<>'array' or jsonb_array_length(p_payload->'lines') not between 1 and 100 then raise exception 'INVALID_RETURN'; end if;
  if exists(select 1 from jsonb_array_elements(p_payload->'lines') group by value->>'item_id' having count(*)>1) then raise exception 'INVALID_ITEMS'; end if;
  rid:=gen_random_uuid();
  insert into private.order_returns(id,order_id,returned_on,lines,reason) values(rid,p_id,event_day,p_payload->'lines',p_reason);
  for line in select value from jsonb_array_elements(p_payload->'lines') loop
   if jsonb_typeof(line->'quantity')<>'number' or (line->>'quantity')::numeric<>trunc((line->>'quantity')::numeric) or (line->>'quantity')::numeric not between 1 and 99 or jsonb_typeof(line->'restock')<>'boolean' then raise exception 'INVALID_RETURN'; end if;
   qty:=(line->>'quantity')::integer;
   select * into i from public.order_items where order_id=p_id and id=(line->>'item_id')::bigint for update;
   if not found or qty>i.shipped_quantity-i.returned_quantity then raise exception 'INVALID_RETURN'; end if;
   needed:=qty;returned_delivered:=0;
   for allocation in
    select sh.id,((l->>'quantity')::integer-coalesce((select sum(a.quantity) from private.order_return_allocations a where a.shipment_id=sh.id and a.item_id=i.id),0))::integer as available,
      (sh.legacy_delivered or sh.delivered_on is not null) as completed
    from private.order_shipments sh cross join lateral jsonb_array_elements(sh.lines) l
    where sh.order_id=p_id and sh.voided_at is null and (l->>'item_id')::bigint=i.id
      and (p_payload->>'shipment_id' is null or sh.id=(p_payload->>'shipment_id')::uuid)
      and coalesce(sh.dispatched_on,(o.ordered_at at time zone 'Africa/Cairo')::date)<=event_day
      and (sh.delivered_on is null or sh.delivered_on<=event_day)
    order by (sh.legacy_delivered or sh.delivered_on is not null) desc,sh.dispatched_on nulls first,sh.created_at,sh.id
   loop
    allocated:=least(needed,allocation.available);
    if allocated>0 then
     insert into private.order_return_allocations(order_id,return_id,shipment_id,item_id,quantity,after_delivery) values(p_id,rid,allocation.id,i.id,allocated,allocation.completed);
     if allocation.completed then returned_delivered:=returned_delivered+allocated;end if;
     needed:=needed-allocated;
    end if;
    exit when needed=0;
   end loop;
   if needed<>0 then raise exception 'RETURN_BEFORE_SHIPMENT';end if;
   update public.order_items set returned_quantity=returned_quantity+qty,returned_after_delivery_quantity=returned_after_delivery_quantity+returned_delivered,restocked_quantity=restocked_quantity+case when (line->>'restock')::boolean then qty else 0 end where id=i.id;
   if (i.stock_tracked or (o.is_historical and not (select unlimited_stock from public.inventory where product_id=i.product_id))) and (line->>'restock')::boolean then update public.inventory set on_hand=on_hand+qty where product_id=i.product_id; insert into public.stock_movements(product_id,order_id,on_hand_delta,reason,actor) values(i.product_id,p_id,qty,'returned_restocked',auth.uid()); end if;
  end loop;
  if p_payload ? 'waive_delivery' and jsonb_typeof(p_payload->'waive_delivery') is distinct from 'boolean' then raise exception 'INVALID_RETURN'; end if;
  if coalesce((p_payload->>'waive_delivery')::boolean,false) then
   if not any_shipped or exists(select 1 from public.order_items where order_id=p_id and quantity-removed_quantity-returned_quantity>0) then raise exception 'DELIVERY_WAIVER_REQUIRES_FULL_RETURN'; end if;
   update public.orders set delivery_fee=0 where id=p_id;
  end if;
  effective:=(event_day+time '12:00') at time zone 'Africa/Cairo';
 elsif p_action='waive_delivery' then
  if not any_shipped or exists(select 1 from public.order_items where order_id=p_id and quantity-removed_quantity-returned_quantity>0) then raise exception 'DELIVERY_WAIVER_REQUIRES_FULL_RETURN'; end if;
  update public.orders set delivery_fee=0 where id=p_id;
 elsif p_action='cancel' then
  if o.status in ('cancelled','expired') then raise exception 'INVALID_TRANSITION'; end if;
  for i in select * from public.order_items where order_id=p_id loop
   if i.reserved_quantity>0 then update public.inventory set reserved=reserved-i.reserved_quantity where product_id=i.product_id; insert into public.stock_movements(product_id,order_id,reserved_delta,reason,actor) values(i.product_id,p_id,-i.reserved_quantity,'admin_cancelled_remainder',auth.uid()); end if;
   update public.order_items set cancelled_quantity=cancelled_quantity+(quantity-removed_quantity-shipped_quantity),removed_quantity=quantity-shipped_quantity,reserved_quantity=0 where id=i.id;
  end loop;
  if not any_shipped then update public.orders set status='cancelled' where id=p_id; end if;
 elsif p_action='reopen' then
  if (o.status not in ('cancelled','expired') and not exists(select 1 from public.order_items where order_id=p_id and cancelled_quantity>0)) or o.is_historical then raise exception 'INVALID_TRANSITION'; end if;
  if not exists(select 1 from public.delivery_zones z where z.id=(select delivery_zone_id from public.orders where id=p_id) and z.active) then raise exception 'INVALID_DELIVERY'; end if;
  -- Reopen restores cancellation-induced removals only and rechecks current stock.
  for i in select * from public.order_items where order_id=p_id order by product_id loop
   qty:=i.quantity-i.removed_quantity+i.cancelled_quantity-i.shipped_quantity;
   held:=greatest(qty-i.reserved_quantity,0);
   if i.stock_tracked and held>0 then select * into stock from public.inventory where product_id=i.product_id; if not stock.active or stock.on_hand-stock.reserved<held then raise exception 'OUT_OF_STOCK'; end if; update public.inventory set reserved=reserved+held where product_id=i.product_id; insert into public.stock_movements(product_id,order_id,reserved_delta,reason,actor) values(i.product_id,p_id,held,'order_reopened',auth.uid()); end if;
   update public.order_items set removed_quantity=removed_quantity-cancelled_quantity,cancelled_quantity=0,reserved_quantity=case when stock_tracked then qty else 0 end where id=i.id;
  end loop;
  update public.orders set status=case when any_shipped then 'confirmed' else 'pending' end,expires_at=now()+interval '24 hours',delivery_fee=case when any_shipped then delivery_fee else coalesce((select fee from public.delivery_zones where id=delivery_zone_id),delivery_fee) end where id=p_id;
 elsif p_action='extend' then
  if o.status<>'pending' or (p_payload->>'expires_at')::timestamptz<=now() or (p_payload->>'expires_at')::timestamptz>now()+interval '30 days' or not isfinite((p_payload->>'expires_at')::timestamptz) then raise exception 'INVALID_EXTENSION'; end if;
  update public.orders set expires_at=(p_payload->>'expires_at')::timestamptz where id=p_id;
 elsif p_action='undo_shipment' then
  select * into shipment from private.order_shipments where order_id=p_id and id=(p_payload->>'shipment_id')::uuid for update;
  if not found or shipment.voided_at is not null or shipment.legacy_delivered or shipment.delivered_on is not null or (p_payload->>'confirmed_not_dispatched')::boolean is distinct from true then raise exception 'INVALID_UNDO'; end if;
  if exists(select 1 from public.order_items where order_id=p_id and returned_quantity>0) then raise exception 'USE_RETURN_FLOW'; end if;
  for line in select value from jsonb_array_elements(shipment.lines) loop
   select * into i from public.order_items where id=(line->>'item_id')::bigint;qty:=(line->>'quantity')::integer;
   update public.order_items set shipped_quantity=shipped_quantity-qty where id=i.id;
   if i.stock_tracked then update public.inventory set on_hand=on_hand+qty where product_id=i.product_id; insert into public.stock_movements(product_id,order_id,on_hand_delta,reason,actor) values(i.product_id,p_id,qty,'shipment_recording_corrected',auth.uid()); end if;
  end loop;
  update private.order_shipments set voided_at=now() where id=shipment.id;
  update public.orders set status='confirmed' where id=p_id;
 elsif p_action='order_date' then
  event_day:=(p_payload->>'ordered_on')::date;
  if event_day is null or not isfinite(event_day) or event_day>today or exists(select 1 from private.order_shipments where order_id=p_id and dispatched_on<event_day and voided_at is null) or exists(select 1 from private.order_returns where order_id=p_id and returned_on<event_day) then raise exception 'INVALID_DATE'; end if;
  if to_regprocedure('private.order_effective_payment_date(bigint)') is not null then execute 'select min(private.order_effective_payment_date(id)) from public.finance_payment_events where order_id=$1' into effective using p_id; if effective is not null and (effective at time zone 'Africa/Cairo')::date<event_day then raise exception 'INVALID_DATE'; end if; end if;
  update public.orders set ordered_at=(event_day+time '12:00') at time zone 'Africa/Cairo' where id=p_id;
 elsif p_action='note' then
  if jsonb_typeof(p_payload->'text') is distinct from 'string' or length(trim(p_payload->>'text')) not between 1 and 2000 then raise exception 'INVALID_NOTE'; end if;
 elsif p_action in ('payment','refund','payment_date') then
  execute 'select private.apply_order_finance_action($1,$2,$3,$4,$5)' using p_id,p_action,p_payload,p_reason,p_key;
 else raise exception 'INVALID_ACTION'; end if;
 perform private.recalculate_order(p_id);
 if to_regprocedure('private.sync_order_cost(uuid,timestamp with time zone)') is not null then execute 'select private.sync_order_cost($1,$2)' using p_id,effective; end if;
 -- Notes and counter-only actions must also invalidate stale editors.
 update public.orders set updated_at=clock_timestamp(),revision=revision+1 where id=p_id;
 select revision into p_revision from public.orders where id=p_id;
 insert into private.order_events(order_id,actor_id,actor_label,kind,reason,payload) values(p_id,auth.uid(),coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'email',''),p_action,trim(p_reason),jsonb_build_object('request',p_payload,'before',snapshot,'after',(select to_jsonb(x)-array['guest_token_hash','request_hash','idempotency_key','meta_context'] from public.orders x where id=p_id)));
 result:=jsonb_build_object('revision',p_revision);
 insert into private.order_action_requests(actor_id,request_key,request_hash,result) values(auth.uid(),p_key,req_hash,result);
 return result;
end $$;
revoke all on function public.admin_order_action(uuid,bigint,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.admin_order_action(uuid,bigint,uuid,text,jsonb,text) to authenticated;
-- Old full-order writes remain available for untouched orders only.
alter function public.transition_order(uuid,text) rename to transition_order_legacy;
revoke all on function public.transition_order_legacy(uuid,text) from public,anon,authenticated,service_role;
create function public.transition_order(p_id uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$ begin
 if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
 perform 1 from public.orders where id=p_id for update;
 if exists(select 1 from public.orders where id=p_id and ops_managed) then raise exception 'USE_ORDER_ACTION'; end if;
 perform public.transition_order_legacy(p_id,p_status);
end $$;
revoke all on function public.transition_order(uuid,text) from public,anon,authenticated;
grant execute on function public.transition_order(uuid,text) to authenticated;
create or replace function public.expire_pending_orders() returns integer language plpgsql security definer set search_path='' as $$
declare o record; i record; n integer:=0; q integer; begin
 for o in select id,ops_managed from public.orders where status='pending' and payment_status<>'paid' and coalesce((to_jsonb(orders)->>'amount_received')::numeric,0)-coalesce((to_jsonb(orders)->>'amount_refunded')::numeric,0)<=0 and expires_at<=now() order by id for update skip locked limit 100 loop
  for i in select * from public.order_items where order_id=o.id and stock_tracked order by product_id loop
   q:=case when o.ops_managed then i.reserved_quantity else i.quantity end;
   if q>0 then update public.inventory set reserved=reserved-q where product_id=i.product_id;insert into public.stock_movements(product_id,order_id,reserved_delta,reason) values(i.product_id,o.id,-q,'expired');end if;
   if o.ops_managed then update public.order_items set reserved_quantity=0 where id=i.id;end if;
  end loop;
  update public.orders set status='expired' where id=o.id;
  if o.ops_managed then insert into private.order_events(order_id,kind,reason) values(o.id,'expired','Unpaid reservation expired');end if;
  n:=n+1;
 end loop;return n;
end $$;
-- Safe projection follows both original and shared capabilities, still unclaimed only.
create or replace function public.guest_order(p_token uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o public.orders; result jsonb; begin
 select * into o from public.orders where id=private.resolve_order_token(p_token) and customer_id is null;
 if not found then return null;end if;
 result:=jsonb_build_object('order_number',o.order_number,'status',o.status,'payment_status',o.payment_status,'subtotal',o.subtotal,'delivery_fee',o.delivery_fee,'delivery_zone',o.delivery_zone,'payment_method',o.payment_method,'transfer_instructions',o.transfer_instructions,'instapay_link',o.instapay_link,'instapay_number',o.instapay_number,'created_at',o.created_at,'ordered_at',o.ordered_at,'is_historical',o.is_historical,'ops_managed',o.ops_managed,
 'items',(select jsonb_agg(jsonb_build_object('product_id',i.product_id,'name_en',i.name_en,'name_ar',i.name_ar,'quantity',i.quantity,'unit_price',i.unit_price,'shipped_quantity',i.shipped_quantity,'delivered_quantity',i.delivered_quantity,'removed_quantity',i.removed_quantity,'returned_quantity',i.returned_quantity,'returned_after_delivery_quantity',i.returned_after_delivery_quantity,'reserved_quantity',i.reserved_quantity)) from public.order_items i where order_id=o.id));
 -- Finance columns are added by the following migration; retain this projection unchanged.
 result:=result||jsonb_build_object('amount_received',to_jsonb(o)->'amount_received','amount_refunded',to_jsonb(o)->'amount_refunded','balance_due',to_jsonb(o)->'balance_due','refund_due',to_jsonb(o)->'refund_due','payment_state',to_jsonb(o)->'payment_state');
 return result;
end $$;
alter function public.create_store_order(uuid,text,jsonb,jsonb,text) rename to create_store_order_legacy;
revoke all on function public.create_store_order_legacy(uuid,text,jsonb,jsonb,text) from public,anon,authenticated,service_role;
create function public.create_store_order(p_key uuid,p_hash text,p_customer jsonb,p_lines jsonb,p_locale text) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; o public.orders; begin
 result:=public.create_store_order_legacy(p_key,p_hash,p_customer,p_lines,p_locale);
 select * into o from public.orders where idempotency_key=p_key;
 if o.ops_managed then
  result:=result||jsonb_build_object('items',(select coalesce(jsonb_agg(jsonb_build_object('id',product_id,'line_id',id,'name_en',name_en,'name_ar',name_ar,'qty',quantity-removed_quantity-returned_quantity,'price',unit_price) order by id),'[]') from public.order_items where order_id=o.id and quantity-removed_quantity-returned_quantity>0));
 end if;return result;
end $$;
revoke all on function public.create_store_order(uuid,text,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.create_store_order(uuid,text,jsonb,jsonb,text) to service_role;
-- Capture the selected zone on new orders; delegate all existing pricing,
-- stock, retry identity and ownership rules unchanged.
alter function public.create_website_order(uuid,text,jsonb,jsonb,text,uuid,uuid,text,uuid,boolean) rename to create_website_order_pre_ops;
revoke all on function public.create_website_order_pre_ops(uuid,text,jsonb,jsonb,text,uuid,uuid,text,uuid,boolean) from public,anon,authenticated,service_role;
create function public.create_website_order(p_key uuid,p_hash text,p_customer jsonb,p_lines jsonb,p_locale text,p_token uuid,p_zone uuid,p_payment text,p_user uuid,p_consent boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; is_new boolean;begin
 perform pg_advisory_xact_lock(hashtextextended(p_key::text,0));
 select not exists(select 1 from public.orders where idempotency_key=p_key) into is_new;
 result:=public.create_website_order_pre_ops(p_key,p_hash,p_customer,p_lines,p_locale,p_token,p_zone,p_payment,p_user,p_consent);
 update public.orders set delivery_zone_id=p_zone where idempotency_key=p_key and delivery_zone_id is null and not ops_managed;
 if is_new then perform private.manage_order((select id from public.orders where idempotency_key=p_key)); end if;
 return result;
end $$;
revoke all on function public.create_website_order(uuid,text,jsonb,jsonb,text,uuid,uuid,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.create_website_order(uuid,text,jsonb,jsonb,text,uuid,uuid,text,uuid,boolean) to service_role;
alter function public.create_chat_order(uuid,uuid,jsonb,jsonb,text,uuid,text,boolean) rename to create_chat_order_pre_ops;
revoke all on function public.create_chat_order_pre_ops(uuid,uuid,jsonb,jsonb,text,uuid,text,boolean) from public,anon,authenticated,service_role;
create function public.create_chat_order(p_key uuid,p_token uuid,p_customer jsonb,p_lines jsonb,p_locale text,p_zone uuid,p_payment text,p_paid boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; is_new boolean;begin
 if not public.is_admin() then raise exception 'FORBIDDEN';end if;
 perform pg_advisory_xact_lock(hashtextextended('chat-token:'||p_token::text,0));
 perform pg_advisory_xact_lock(hashtextextended(p_key::text,0));
 select not exists(select 1 from public.orders where idempotency_key=p_key) into is_new;
 result:=public.create_chat_order_pre_ops(p_key,p_token,p_customer,p_lines,p_locale,p_zone,p_payment,p_paid);
 update public.orders set delivery_zone_id=p_zone where idempotency_key=p_key and delivery_zone_id is null and not ops_managed;
 if is_new then perform private.manage_order((select id from public.orders where idempotency_key=p_key)); end if;
 return result;
end $$;
revoke all on function public.create_chat_order(uuid,uuid,jsonb,jsonb,text,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.create_chat_order(uuid,uuid,jsonb,jsonb,text,uuid,text,boolean) to authenticated;
alter function public.create_past_chat_order(uuid,uuid,jsonb,jsonb,text,uuid,text,date,boolean,date,text,numeric) rename to create_past_chat_order_pre_ops;
revoke all on function public.create_past_chat_order_pre_ops(uuid,uuid,jsonb,jsonb,text,uuid,text,date,boolean,date,text,numeric) from public,anon,authenticated,service_role;
create function public.create_past_chat_order(p_key uuid,p_token uuid,p_customer jsonb,p_lines jsonb,p_locale text,p_zone uuid,p_payment text,p_ordered_on date,p_paid boolean,p_paid_on date,p_stock_handling text,p_expected_total numeric) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 if not public.is_admin() then raise exception 'FORBIDDEN';end if;
 result:=public.create_past_chat_order_pre_ops(p_key,p_token,p_customer,p_lines,p_locale,p_zone,p_payment,p_ordered_on,p_paid,p_paid_on,p_stock_handling,p_expected_total);
 update public.orders set delivery_zone_id=p_zone where idempotency_key=p_key and delivery_zone_id is null and not ops_managed;
 return result;
end $$;
revoke all on function public.create_past_chat_order(uuid,uuid,jsonb,jsonb,text,uuid,text,date,boolean,date,text,numeric) from public,anon,authenticated;
grant execute on function public.create_past_chat_order(uuid,uuid,jsonb,jsonb,text,uuid,text,date,boolean,date,text,numeric) to authenticated;

-- Actual cash movements are append-only. Order edits only change money due.
alter table public.orders add column amount_received numeric(12,2) not null default 0,
 add column amount_refunded numeric(12,2) not null default 0,
 add column balance_due numeric(12,2) not null default 0,
 add column refund_due numeric(12,2) not null default 0,
 add column payment_state text not null default 'unpaid' check(payment_state in ('unpaid','partial','paid','refunded','overpaid'));
alter table public.finance_payment_events add column reference text not null default '';
create table private.order_cost_events (
 id bigint generated always as identity primary key,
 order_id uuid not null references public.orders(id),
 item_id bigint not null references public.order_items(id),
 quantity_delta integer not null check(quantity_delta<>0),
 occurred_at timestamptz,
 finance_event_id bigint references public.finance_payment_events(id),
 reason text not null,
 created_at timestamptz not null default now()
);
create index order_cost_events_order_idx on private.order_cost_events(order_id,item_id);
create index order_cost_events_item_idx on private.order_cost_events(item_id);
create index order_cost_events_payment_idx on private.order_cost_events(finance_event_id);
alter table private.order_cost_events enable row level security;
revoke all on private.order_cost_events from public,anon,authenticated;
revoke all on sequence private.order_cost_events_id_seq from public,anon,authenticated;
create table private.order_payment_dates (
 id bigint generated always as identity primary key,
 event_id bigint not null references public.finance_payment_events(id),
 previous_date timestamptz,
 corrected_date timestamptz not null,
 reason text not null,
 actor_id uuid not null,
 created_at timestamptz not null default now()
);
create index order_payment_dates_event_idx on private.order_payment_dates(event_id,id desc);
alter table private.order_payment_dates enable row level security;
revoke all on private.order_payment_dates from public,anon,authenticated;
revoke all on sequence private.order_payment_dates_id_seq from public,anon,authenticated;
create function private.prevent_order_finance_history_changes() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'FINANCE_HISTORY_IMMUTABLE'; end $$;
revoke all on function private.prevent_order_finance_history_changes() from public,anon,authenticated;
create trigger order_cost_history_immutable before update or delete on private.order_cost_events for each row execute function private.prevent_order_finance_history_changes();
create trigger order_cost_history_truncate before truncate on private.order_cost_events for each statement execute function private.prevent_order_finance_history_changes();
create trigger payment_date_history_immutable before update or delete on private.order_payment_dates for each row execute function private.prevent_order_finance_history_changes();
create trigger payment_date_history_truncate before truncate on private.order_payment_dates for each statement execute function private.prevent_order_finance_history_changes();
-- Preserve historical paid-order costing and original cash dates during migration.
insert into private.order_cost_events(order_id,item_id,quantity_delta,occurred_at,finance_event_id,reason)
 select e.order_id,i.id,e.cost_factor*i.quantity,e.occurred_at,e.id,'legacy_payment_cost'
 from public.finance_payment_events e join public.order_items i on i.order_id=e.order_id where e.cost_factor<>0;
create function private.order_effective_payment_date(p_event bigint) returns timestamptz language sql stable security definer set search_path='' as $$
 select coalesce((select d.corrected_date from private.order_payment_dates d where d.event_id=e.id order by d.id desc limit 1),e.occurred_at) from public.finance_payment_events e where e.id=p_event;
$$;
revoke all on function private.order_effective_payment_date(bigint) from public,anon,authenticated;
create function private.reconcile_order_finance(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare o public.orders; received numeric; refunded numeric; net numeric; target numeric; state text; flag text;
begin
 select * into o from public.orders where id=p_id for update;
 if not found then return; end if;
 select coalesce(sum(amount) filter(where event_type<>'refund'),0),coalesce(-sum(amount) filter(where event_type='refund'),0) into received,refunded from public.finance_payment_events where order_id=p_id;
 net:=received-refunded;target:=case when o.status in ('cancelled','expired') then 0 else o.order_total end;
 state:=case when net>target then 'overpaid' when net=target and target>0 then 'paid' when net>0 then 'partial' when refunded>0 then 'refunded' else 'unpaid' end;
 flag:=case when net>0 and (net>=target or target=0) then 'paid' when net=0 and refunded>0 then 'refunded' else 'unpaid' end;
 if not o.ops_managed then flag:=o.payment_status;end if;
 update public.orders set amount_received=received,amount_refunded=refunded,balance_due=greatest(target-net,0),refund_due=greatest(net-target,0),payment_state=state,payment_status=flag
 where id=p_id and (amount_received,amount_refunded,balance_due,refund_due,payment_state,payment_status) is distinct from (received,refunded,greatest(target-net,0),greatest(net-target,0),state,flag);
end $$;
revoke all on function private.reconcile_order_finance(uuid) from public,anon,authenticated;
create function private.reconcile_order_finance_trigger() returns trigger language plpgsql security definer set search_path='' as $$
begin perform private.reconcile_order_finance(new.id);return new;end $$;
revoke all on function private.reconcile_order_finance_trigger() from public,anon,authenticated;
create trigger reconcile_order_amounts after update of subtotal,delivery_fee,status on public.orders for each row execute function private.reconcile_order_finance_trigger();
create function private.record_cash_cost_effects() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.cost_factor<>0 and not (select ops_managed from public.orders where id=new.order_id) then
  insert into private.order_cost_events(order_id,item_id,quantity_delta,occurred_at,finance_event_id,reason)
   select new.order_id,i.id,new.cost_factor*i.quantity,new.occurred_at,new.id,'legacy_payment_cost' from public.order_items i where i.order_id=new.order_id;
 end if;
 perform private.reconcile_order_finance(new.order_id);return new;
end $$;
revoke all on function private.record_cash_cost_effects() from public,anon,authenticated;
create trigger record_cash_cost_effects after insert on public.finance_payment_events for each row execute function private.record_cash_cost_effects();
-- Legacy full-status workflow remains valid until an order is explicitly managed.
create or replace function private.record_order_payment() returns trigger language plpgsql security definer set search_path='' as $$
declare factor integer:=0;cost_balance integer;
begin
 if new.ops_managed or new.payment_status=old.payment_status then return new;end if;
 if new.payment_status='refunded' and old.payment_status<>'paid' then raise exception 'REFUND_REQUIRES_PAID_ORDER';end if;
 select coalesce(sum(cost_factor),0) into cost_balance from public.finance_payment_events where order_id=new.id;
 if new.payment_status='paid' then
  if cost_balance=0 then factor:=1;end if;
  insert into public.finance_payment_events(order_id,event_type,amount,item_amount,delivery_amount,cost_factor,occurred_at,actor) values(new.id,'payment',new.subtotal+new.delivery_fee,new.subtotal,new.delivery_fee,factor,now(),auth.uid());
 elsif old.payment_status='paid' and new.payment_status in ('unpaid','refunded') then
  if new.payment_status='unpaid' and cost_balance>0 then factor:=-1;end if;
  insert into public.finance_payment_events(order_id,event_type,amount,item_amount,delivery_amount,cost_factor,occurred_at,actor) values(new.id,case when new.payment_status='refunded' then 'refund' else 'correction' end,-(new.subtotal+new.delivery_fee),-new.subtotal,-new.delivery_fee,factor,now(),auth.uid());
 end if;return new;
end $$;
create function private.sync_order_cost(p_id uuid,p_effective_at timestamptz default now()) returns void language plpgsql security definer set search_path='' as $$
declare item record;recognized integer;target integer;
begin
 if not exists(select 1 from public.orders where id=p_id and ops_managed) then return;end if;
 for item in select * from public.order_items where order_id=p_id order by id loop
  select coalesce(sum(quantity_delta),0) into recognized from private.order_cost_events where item_id=item.id;
  target:=item.shipped_quantity-item.restocked_quantity;
  if target<>recognized then insert into private.order_cost_events(order_id,item_id,quantity_delta,occurred_at,reason) values(p_id,item.id,target-recognized,p_effective_at,case when exists(select 1 from private.order_cost_events where item_id=item.id and finance_event_id is not null) and not exists(select 1 from private.order_cost_events where item_id=item.id and finance_event_id is null) then 'managed_policy_transition' else 'managed_fulfilment_cost' end);end if;
 end loop;
 perform private.reconcile_order_finance(p_id);
end $$;
revoke all on function private.sync_order_cost(uuid,timestamptz) from public,anon,authenticated;
create function private.validate_order_cash_dates(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if exists(
  with cash as (select amount,private.order_effective_payment_date(id) as effective from public.finance_payment_events where order_id=p_id),
  opening as (select coalesce(sum(amount),0) as amount from cash where effective is null),
  days as (select (effective at time zone 'Africa/Cairo')::date as day,sum(amount) as amount from cash where effective is not null group by 1)
  select 1 from (select (select amount from opening)+sum(amount) over(order by day) as balance from days) q where balance<0
 ) then raise exception 'INVALID_PAYMENT_SEQUENCE';end if;
end $$;
revoke all on function private.validate_order_cash_dates(uuid) from public,anon,authenticated;

create function private.apply_order_finance_action(p_order uuid,p_action text,p_payload jsonb,p_reason text,p_key uuid) returns void language plpgsql security definer set search_path='' as $$
declare o public.orders;amount_value numeric;day date;event_time timestamptz;event_row public.finance_payment_events;net numeric;item_net numeric;item_part numeric;reference_value text;previous timestamptz;
begin
 -- Only the checked, serialized admin dispatcher can execute this private helper.
 if not public.is_admin() then raise exception 'FORBIDDEN';end if;
 select * into o from public.orders where id=p_order for update;
 if not found or not o.ops_managed then raise exception 'ORDER_NOT_AVAILABLE';end if;
 if p_action not in ('payment','refund','payment_date') or p_reason is null or length(trim(p_reason)) not between 1 and 1000 or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'INVALID_FINANCE_ACTION';end if;
 if coalesce(p_payload->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'INVALID_DATE';end if;
 begin day:=(p_payload->>'date')::date;exception when others then raise exception 'INVALID_DATE';end;
 if day is null or not isfinite(day) or day>(now() at time zone 'Africa/Cairo')::date then raise exception 'INVALID_DATE';end if;
 event_time:=(day::timestamp at time zone 'Africa/Cairo')+interval '12 hours';
 if day<(o.ordered_at at time zone 'Africa/Cairo')::date then raise exception 'INVALID_DATE';end if;
 if p_action='payment_date' then
  begin select * into event_row from public.finance_payment_events where id=(p_payload->>'event_id')::bigint and order_id=p_order;exception when others then raise exception 'INVALID_PAYMENT';end;
  if event_row.id is null then raise exception 'INVALID_PAYMENT';end if;
  previous:=private.order_effective_payment_date(event_row.id);
  if previous is not distinct from event_time then return;end if;
  insert into private.order_payment_dates(event_id,previous_date,corrected_date,reason,actor_id) values(event_row.id,previous,event_time,trim(p_reason),auth.uid());perform private.validate_order_cash_dates(p_order);return;
 end if;
 if jsonb_typeof(p_payload->'amount') is distinct from 'number' then raise exception 'INVALID_AMOUNT';end if;
 begin amount_value:=(p_payload->>'amount')::numeric;exception when others then raise exception 'INVALID_AMOUNT';end;
 if amount_value is null or amount_value<=0 or amount_value>9999999999.99 or amount_value<>round(amount_value,2) then raise exception 'INVALID_AMOUNT';end if;
 reference_value:=coalesce(p_payload->>'reference','');
 if length(reference_value)>300 or reference_value ~ '[[:cntrl:]]' then raise exception 'INVALID_REFERENCE';end if;
 select coalesce(sum(amount),0),coalesce(sum(item_amount),0) into net,item_net from public.finance_payment_events where order_id=p_order;
 if p_action='payment' then
  if o.status in ('cancelled','expired') then raise exception 'REOPEN_BEFORE_PAYMENT';end if;
  if o.order_total<=0 then raise exception 'INVALID_TOTAL';end if;
  item_part:=round(amount_value*o.subtotal/o.order_total,2);
 else
  if amount_value>net then raise exception 'REFUND_EXCEEDS_RECEIPTS';end if;
  item_part:=round(amount_value*item_net/net,2);amount_value:=-amount_value;item_part:=-item_part;
 end if;
 insert into public.finance_payment_events(order_id,event_type,amount,item_amount,delivery_amount,cost_factor,occurred_at,actor,reference)
 values(p_order,p_action,amount_value,item_part,amount_value-item_part,0,event_time,auth.uid(),trim(reference_value));
 perform private.validate_order_cash_dates(p_order);
end $$;
revoke all on function private.apply_order_finance_action(uuid,text,jsonb,text,uuid) from public,anon,authenticated;
create function private.order_finance_detail(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 select jsonb_build_object('amount_received',o.amount_received,'amount_refunded',o.amount_refunded,'net_collected',o.amount_received-o.amount_refunded,'balance_due',o.balance_due,'refund_due',o.refund_due,'payment_state',o.payment_state,'cost_policy',case when o.ops_managed then 'shipped_less_restocked' else 'legacy_paid_order' end,
 'payments',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'event_type',e.event_type,'amount',e.amount,'occurred_at',private.order_effective_payment_date(e.id),'original_occurred_at',e.occurred_at,'recorded_at',e.recorded_at,'reference',e.reference) order by e.id desc),'[]'::jsonb) from public.finance_payment_events e where e.order_id=o.id)) into result from public.orders o where o.id=p_id;
 return result;
end $$;
revoke all on function private.order_finance_detail(uuid) from public,anon,authenticated;
do $$ declare r record;begin for r in select id from public.orders loop perform private.reconcile_order_finance(r.id);end loop;end $$;

create or replace function public.finance_overview(p_from date default null,p_to date default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
 if (p_from is not null and not isfinite(p_from)) or (p_to is not null and not isfinite(p_to)) or (p_from is not null and p_to is not null and p_from>p_to) then raise exception 'INVALID_DATE_RANGE'; end if;
 with payment_rows as (
   select e.* from public.finance_payment_events e where
    ((p_from is null and p_to is null) or private.order_effective_payment_date(e.id) is not null) and
    (p_from is null or private.order_effective_payment_date(e.id) >= (p_from::timestamp at time zone 'Africa/Cairo')) and
    (p_to is null or private.order_effective_payment_date(e.id) < ((p_to+1)::timestamp at time zone 'Africa/Cairo'))
 ), cost_rows as (
 select e.* from private.order_cost_events e
 cross join lateral (select case when e.finance_event_id is not null then private.order_effective_payment_date(e.finance_event_id) else e.occurred_at end as effective_date) d
 where ((p_from is null and p_to is null) or d.effective_date is not null)
 and (p_from is null or d.effective_date >= (p_from::timestamp at time zone 'Africa/Cairo'))
 and (p_to is null or d.effective_date < ((p_to+1)::timestamp at time zone 'Africa/Cairo'))
 ), cost_quantities as (select item_id,sum(quantity_delta) as quantity from cost_rows group by item_id having sum(quantity_delta)<>0),
 cost_totals as (select coalesce(sum(e.quantity*c.unit_cost),0) as known_cost,count(*) filter(where c.unit_cost is null) as missing_costs from cost_quantities e left join public.order_item_costs c on c.item_id=e.item_id),
 payment_totals as (select coalesce(sum(amount) filter(where amount>0),0) as collected,coalesce(-sum(amount) filter(where event_type='refund'),0) as refunded,coalesce(-sum(amount) filter(where event_type='correction'),0) as corrections,coalesce(sum(amount),0) as net_collected,coalesce(sum(item_amount),0) as items_collected,coalesce(sum(delivery_amount),0) as delivery_collected from payment_rows),
 entry_rows as (select * from public.finance_entries where voided_at is null and (p_from is null or entry_date>=p_from) and (p_to is null or entry_date<=p_to)),
 entry_totals as (select coalesce(sum(amount),0) as cash_spent,coalesce(sum(amount) filter(where category='inventory'),0) as inventory_spent,coalesce(sum(amount) filter(where category<>'inventory'),0) as operating_spent from entry_rows)
 select jsonb_build_object('collected',p.collected,'refunded',p.refunded,'corrections',p.corrections,'net_collected',p.net_collected,'items_collected',p.items_collected,'delivery_collected',p.delivery_collected,'cash_spent',x.cash_spent,'inventory_spent',x.inventory_spent,'operating_spent',x.operating_spent,'known_product_cost',c.known_cost,'missing_cost_items',c.missing_costs,'cash_balance',p.net_collected-x.cash_spent,'gross_profit',case when c.missing_costs=0 then p.net_collected-c.known_cost end,'operating_result',case when c.missing_costs=0 then p.net_collected-c.known_cost-x.operating_spent end,'gross_margin',case when c.missing_costs=0 and p.net_collected>0 then round((p.net_collected-c.known_cost)/p.net_collected*100,2) end,'operating_margin',case when c.missing_costs=0 and p.net_collected>0 then round((p.net_collected-c.known_cost-x.operating_spent)/p.net_collected*100,2) end,'opening_paid_orders',(select count(*) from public.finance_payment_events where event_type='opening_paid'),'opening_paid_amount',(select coalesce(sum(amount),0) from public.finance_payment_events where event_type='opening_paid'),'cost_policy','legacy_receipt_costs_then_managed_shipped_costs','tracking_started_at',(select started_at from private.finance_tracking_start),'untracked_refunded_orders',(select untracked_refunded_orders from private.finance_tracking_start),'categories',(select coalesce(jsonb_agg(jsonb_build_object('category',category,'amount',amount)),'[]'::jsonb) from (select category,sum(amount) as amount from entry_rows group by category) q)) into result from payment_totals p cross join cost_totals c cross join entry_totals x;
 return result;
end $$;
create or replace function public.finance_missing_costs() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('item_id',q.id,'order_number',q.order_number,'name_en',q.name_en,'name_ar',q.name_ar,'quantity',q.quantity)),'[]'::jsonb) from (
 select i.id,o.order_number,i.name_en,i.name_ar,abs(q.quantity)::integer as quantity from public.order_items i join public.orders o on o.id=i.order_id join public.order_item_costs c on c.item_id=i.id join (select item_id,sum(quantity_delta) as quantity from private.order_cost_events group by item_id having sum(quantity_delta)<>0) q on q.item_id=i.id where c.unit_cost is null order by o.created_at desc,i.id limit 100) q);
end $$;

create function private.guard_managed_payment_history() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.orders where id=old.order_id and ops_managed) then raise exception 'FINANCE_HISTORY_IMMUTABLE';end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function private.guard_managed_payment_history() from public,anon,authenticated;
create trigger managed_payment_history_immutable before update or delete on public.finance_payment_events for each row execute function private.guard_managed_payment_history();

-- Dates entered by admins are Cairo calendar dates: no day may end with more
-- money refunded/corrected than had been received, including undated openings.

alter function public.set_order_payment(uuid,text) rename to set_order_payment_legacy;
revoke all on function public.set_order_payment_legacy(uuid,text) from public,anon,authenticated;
create function public.set_order_payment(p_id uuid,p_payment text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'FORBIDDEN';end if;
 perform 1 from public.orders where id=p_id for update;
 if exists(select 1 from public.orders where id=p_id and ops_managed) then raise exception 'USE_ORDER_ACTION';end if;
 perform public.set_order_payment_legacy(p_id,p_payment);
end $$;
revoke all on function public.set_order_payment(uuid,text) from public,anon,authenticated;
grant execute on function public.set_order_payment(uuid,text) to authenticated;
-- Effective dates in report history match the immutable correction ledger.
create function public.finance_recent_payments(p_limit integer default 30) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'INVALID_LIMIT'; end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.recorded_at desc,q.id desc),'[]'::jsonb) into result from (
  select e.id,e.event_type,e.amount,private.order_effective_payment_date(e.id) as occurred_at,e.occurred_at as original_occurred_at,e.recorded_at,e.reference,jsonb_build_object('order_number',o.order_number) as orders
  from public.finance_payment_events e join public.orders o on o.id=e.order_id order by e.recorded_at desc,e.id desc limit p_limit
 ) q;
 return result;
end $$;
revoke all on function public.finance_recent_payments(integer) from public,anon,authenticated;
grant execute on function public.finance_recent_payments(integer) to authenticated;
